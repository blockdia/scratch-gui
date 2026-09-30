/* global Blockly, Hydrate, w, events: true */
// WebDriver serializes callbacks into the browser; they do not capture loop state.
/* eslint-disable no-loop-func */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import webpack from 'webpack';
import webdriver from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import chromedriver from 'chromedriver';
import {parseDOM, DomUtils} from 'htmlparser2';
import VM from 'scratch-vm';
import Blocks from 'scratch-vm/src/engine/blocks';
import adapter from 'scratch-vm/src/engine/adapter';
import {serializeBlocks, deserializeBlocks} from 'scratch-vm/src/serialization/sb3';

let driver;
let server;
let directory;
jest.setTimeout(60000);

beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-sync-'));
    await new Promise((resolve, reject) => webpack({
        mode: 'development',
        entry: path.resolve(__dirname, '../../src/lib/hydrate-workspace-shadows.js'),
        output: {path: directory, filename: 'hydrate.js', library: 'Hydrate', libraryTarget: 'var'},
        resolve: {mainFields: ['browser', 'main']},
        node: {fs: 'empty'},
        devtool: false
    }, (error, stats) => {
        if (error || stats.hasErrors()) reject(error || new Error(stats.toString()));
        else resolve();
    }));
    const html = '<div id="workspace" style="width:900px;height:700px"></div>' +
        '<script>var module={exports:{}};</script><script src="/blocks.js"></script>' +
        '<script src="/hydrate.js"></script><script>' +
        'var Blockly=module.exports;var w=Blockly.inject("workspace",{sounds:false});' +
        'var events=[];w.addChangeListener(e=>events.push({...e.toJson(),' +
        'oldParentId:e.oldParentId,oldInputName:e.oldInputName,newCoordinate:e.newCoordinate}));</script>';
    server = http.createServer((request, response) => {
        if (request.url === '/') return response.end(html);
        const file = request.url === '/blocks.js' ? require.resolve('scratch-blocks') :
            request.url === '/hydrate.js' ? path.join(directory, 'hydrate.js') : null;
        if (!file) return response.writeHead(404).end();
        response.setHeader('Content-Type', 'application/javascript');
        return fs.createReadStream(file).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    chrome.setDefaultService(new chrome.ServiceBuilder(process.env.CHROMEDRIVER_PATH || chromedriver.path).build());
    driver = await new webdriver.Builder().forBrowser('chrome')
        .setChromeOptions(new chrome.Options().addArguments('--headless=new', '--window-size=1000,800'))
        .build();
    await driver.get(`http://127.0.0.1:${server.address().port}`);
});

afterAll(async () => {
    if (driver) await driver.quit();
    if (server) await new Promise(resolve => server.close(resolve));
    if (directory) fs.rmSync(directory, {recursive: true, force: true});
});

const load = async container => {
    const blocks = await driver.executeAsyncScript((xml, model, done) => {
        Blockly.Events.disable();
        try {
            Blockly.Xml.clearWorkspaceAndLoadFromXml(Blockly.Xml.textToDom(`<xml>${xml}</xml>`), w);
            Hydrate.default(Blockly, w, {blocks: {_blocks: model, resetCache () {}}});
        } finally {
            Blockly.Events.enable();
        }
        w.clearUndo();
        events = [];
        setTimeout(() => done({model, events}), 30);
    }, container.toXML({}), container._blocks);
    expect(blocks.events).toEqual([]);
    Object.assign(container._blocks, blocks.model);
};

const assertGraph = container => {
    const blocks = container._blocks;
    const incoming = new Set();
    for (const block of Object.values(blocks)) {
        for (const input of Object.values(block.inputs)) {
            for (const id of new Set([input.block, input.shadow].filter(Boolean))) {
                expect(blocks[id]).toMatchObject({parent: block.id, topLevel: false});
                incoming.add(id);
            }
        }
        if (block.opcode === 'procedures_call' || block.opcode === 'procedures_prototype') {
            const ids = JSON.parse(block.mutation.argumentids);
            expect(Object.keys(block.inputs).every(id => ids.includes(id))).toBe(true);
        }
    }
    for (const block of Object.values(blocks).filter(b => b.shadow)) {
        expect(incoming.has(block.id)).toBe(true);
        expect(container.getScripts()).not.toContain(block.id);
    }
};

// Blockly definitions are intentionally real: this exercises generated parameter
// reporters, hidden shadow DOM, asynchronous events, and undo ordering together.
test.each([false, true])('custom procedures preserve covered=%s shadows through edits and SB3 round trips',
    async covered => {
        const signature = '<mutation proccode="test %b %n %s" ' +
        'argumentids="[&quot;b&quot;,&quot;n&quot;,&quot;s&quot;]" ' +
        'argumentnames="[&quot;flag&quot;,&quot;count&quot;,&quot;text&quot;]" ' +
        'argumentdefaults="[false,1,&quot;&quot;]" warp="false"></mutation>';
        const xml = '<block type="procedures_definition" id="d"><statement name="custom_block">' +
        `<shadow type="procedures_prototype" id="p">${signature}</shadow></statement></block>` +
        `<block type="procedures_call" id="c">${signature}<value name="b">` +
        '<block type="operator_not" id="r"></block></value></block>';
        const vm = new VM();
        try {
            const container = new Blocks(vm.runtime);
            for (const block of adapter({xml: {outerHTML: DomUtils.getOuterHTML(parseDOM(xml, {xmlMode: true}))}})) {
                container.createBlock(block);
            }
            const target = {blocks: container, variables: {}, isStage: true};
            vm.runtime.getTargetForStage = () => target;
            vm.runtime.getEditingTarget = () => target;
            await load(container);
            assertGraph(container);
            for (const step of ['out', 'toggle', ...(covered ? ['in', 'undo', 'redo'] : []), 'add', 'rename',
                'reorder', 'remove', 'restore', 'redo', 'delete', 'undo']) {
                const result = await driver.executeAsyncScript((action, done) => {
                    events = [];
                    const caller = w.getBlockById('c');
                    Blockly.Events.setGroup(true);
                    if (action === 'out') w.getBlockById('r').outputConnection.disconnect();
                    if (action === 'in') caller.getInput('b').connection.connect(w.getBlockById('r').outputConnection);
                    if (action === 'toggle') caller.getInputTargetBlock('b').setFieldValue('TRUE', 'VALUE');
                    if (['add', 'rename', 'reorder', 'remove'].includes(action)) {
                        const prototype = w.getBlockById('p');
                        const mutation = prototype.mutationToDom(true);
                        const ids = JSON.parse(mutation.getAttribute('argumentids'));
                        const names = JSON.parse(mutation.getAttribute('argumentnames'));
                        const defaults = JSON.parse(mutation.getAttribute('argumentdefaults'));
                        let code = prototype.getProcCode();
                        if (action === 'add') {
                            ids.push('new'); names.push('new flag'); defaults.push(false); code += ' %b';
                        }
                        if (action === 'rename') names[0] = 'renamed';
                        if (action === 'reorder') {
                            ids.reverse(); names.reverse(); defaults.reverse();
                            code = `test ${code.match(/%[bns]/g).reverse()
                                .join(' ')}`;
                        }
                        if (action === 'remove') {
                            const index = ids.indexOf('b');
                            const types = code.match(/%[bns]/g);
                            ids.splice(index, 1); names.splice(index, 1); defaults.splice(index, 1);
                            types.splice(index, 1);
                            code = `test ${types.join(' ')}`;
                        }
                        mutation.setAttribute('proccode', code);
                        mutation.setAttribute('argumentids', JSON.stringify(ids));
                        mutation.setAttribute('argumentnames', JSON.stringify(names));
                        mutation.setAttribute('argumentdefaults', JSON.stringify(defaults));
                        Blockly.Procedures.mutateCallersAndPrototype(prototype.getProcCode(), w, mutation);
                    }
                    if (action === 'delete') caller.dispose();
                    if (action === 'undo' || action === 'restore') w.undo(false);
                    if (action === 'redo') w.undo(true);
                    Blockly.Events.setGroup(false);
                    setTimeout(() => done(events), 30);
                }, step);
                for (const event of result) {
                    for (const key of ['oldParentId', 'oldInputName', 'newCoordinate']) {
                        if (event[key] === null) delete event[key];
                    }
                    if (event.xml) event.xml = {outerHTML: event.xml};
                    container.blocklyListen(event);
                }
                assertGraph(container);
                if (['in', 'rename', 'restore'].includes(step)) {
                    const input = container.getBlock('c').inputs.b;
                    expect(container.getBlock(input.shadow).fields.VALUE.value).toBe('TRUE');
                }
            }
            for (let i = 0; i < 3; i++) {
                const exported = serializeBlocks(container._blocks)[0];
                expect(Object.values(exported).filter(b => b.opcode === 'operator_boolean')).toEqual([]);
                container._blocks = deserializeBlocks(JSON.parse(JSON.stringify(exported)));
                await load(container);
                assertGraph(container);
            }
        } finally {
            vm.quit();
        }
    });

test.each([
    ['number', 'motion_movesteps', 'STEPS', 'math_number', 'NUM', '7', 'operator_round'],
    ['text', 'looks_say', 'MESSAGE', 'text', 'TEXT', 'hello', 'operator_join'],
    ['true', 'control_if', 'CONDITION', 'operator_boolean', 'VALUE', 'TRUE', 'operator_not'],
    ['false', 'control_if', 'CONDITION', 'operator_boolean', 'VALUE', 'FALSE', 'operator_not'],
    ['menu', 'sensing_touchingobject', 'TOUCHINGOBJECTMENU', 'sensing_touchingobjectmenu',
        'TOUCHINGOBJECTMENU', '_mouse_', 'operator_join']
])('%s defaults survive covering, deletion undo, and export', async (label, opcode, input, shadowType, field,
    value, reporterType) => {
    const vm = new VM();
    try {
        const container = new Blocks(vm.runtime);
        const xml = `<block type="${opcode}" id="p"><value name="${input}">` +
            `<shadow type="${shadowType}" id="s"><field name="${field}">${value}</field></shadow>` +
            `</value></block><block type="${reporterType}" id="r"></block>`;
        for (const block of adapter({xml: {outerHTML: xml}})) container.createBlock(block);
        vm.runtime.getTargetForStage = () => ({blocks: container, variables: {}, isStage: true});
        vm.runtime.getEditingTarget = vm.runtime.getTargetForStage;
        await load(container);
        for (const step of ['cover', 'out', 'cover', 'undo', 'redo', 'delete', 'undo']) {
            const result = await driver.executeAsyncScript((action, inputName, done) => {
                events = [];
                Blockly.Events.setGroup(true);
                if (action === 'cover') {
                    w.getBlockById('p').getInput(inputName).connection.connect(w.getBlockById('r').outputConnection);
                }
                if (action === 'out') w.getBlockById('r').outputConnection.disconnect();
                if (action === 'delete') w.getBlockById('p').dispose();
                if (action === 'undo') w.undo(false);
                if (action === 'redo') w.undo(true);
                Blockly.Events.setGroup(false);
                setTimeout(() => done(events), 30);
            }, step, input);
            for (const event of result) {
                for (const key of ['oldParentId', 'oldInputName', 'newCoordinate']) {
                    if (event[key] === null) delete event[key];
                }
                if (event.xml) event.xml = {outerHTML: event.xml};
                container.blocklyListen(event);
            }
            assertGraph(container);
            if (step !== 'delete') {
                const selected = container.getBlock('p').inputs[input];
                expect(container.getBlock(selected.shadow).fields[field].value).toBe(value);
            }
        }
        const exported = serializeBlocks(container._blocks)[0];
        if (value === 'FALSE') expect(exported.s).toBeUndefined();
        container._blocks = deserializeBlocks(JSON.parse(JSON.stringify(exported)));
        await load(container);
        assertGraph(container);
        const selected = container.getBlock('p').inputs[input];
        expect(container.getBlock(selected.shadow).fields[field].value).toBe(value);
    } finally {
        vm.quit();
    }
});
