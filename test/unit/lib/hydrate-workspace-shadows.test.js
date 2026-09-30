import {parseDOM, DomUtils} from 'htmlparser2';
import hydrate from '../../../src/lib/hydrate-workspace-shadows';
import adapter from 'scratch-vm/src/engine/adapter';
import {serializeBlocks, deserializeBlocks} from 'scratch-vm/src/serialization/sb3';

// Minimal DOM facade for the XML snapshot; the browser harness uses native DOM.
const element = node => ({
    tagName: node.name,
    get outerHTML () {
        return DomUtils.getOuterHTML(node);
    },
    get children () {
        return (node.children || []).filter(child => child.type === 'tag').map(element);
    },
    getAttribute: name => node.attribs[name] || null,
    setAttribute: (name, value) => {
        node.attribs[name] = value;
    },
    getElementsByTagName: name => DomUtils.getElementsByTagName(name, node.children || [], true).map(element)
});
const dom = xml => element(parseDOM(xml, {xmlMode: true})[0]);
const fixture = (before, after) => {
    const blocks = Object.fromEntries(adapter({xml: dom(before)}).map(block => [block.id, block]));
    const target = {blocks: {_blocks: blocks, resetCache: jest.fn()}};
    const Blockly = {Xml: {workspaceToDom: () => dom(`<xml>${after}</xml>`)},
        utils: {genUid: jest.fn(() => 'hidden')}};
    const workspace = {getAllBlocks: () => []};
    return {blocks, target, Blockly, workspace};
};
const shadow = (type, value = 'FALSE') =>
    `<shadow type="${type}" id="s"><field name="VALUE">${value}</field></shadow>`;

test.each(['operator_boolean', 'addon_boolean_default'])(
    'hydrates a covered %s shadow and preserves the executable input', type => {
        const before = '<block type="control_if" id="p"><value name="CONDITION">' +
            '<block type="sensing_mousedown" id="r"/></value></block>';
        const after = before.replace('<value name="CONDITION">', `<value name="CONDITION">${shadow(type)}`);
        const f = fixture(before, after);
        hydrate(f.Blockly, f.workspace, f.target);
        expect(f.blocks.p.inputs.CONDITION).toEqual({name: 'CONDITION', block: 'r', shadow: 's'});
        expect(f.blocks.s).toMatchObject({parent: 'p', shadow: true, topLevel: false, opcode: type});
        hydrate(f.Blockly, f.workspace, f.target);
        expect(Object.keys(f.blocks)).toHaveLength(3);
        expect(f.target.blocks.resetCache).toHaveBeenCalledTimes(1);
        const output = serializeBlocks(f.blocks)[0];
        if (type === 'operator_boolean') {
            expect(output.p.inputs.CONDITION).toEqual([2, 'r']);
            expect(output.s).toBeUndefined();
            expect(deserializeBlocks(output).s).toBeUndefined();
        } else {
            expect(output.p.inputs.CONDITION).toEqual([3, 'r', 's']);
        }
    }
);

test('hydrates generated procedure argument shadows', () => {
    const before = '<block type="procedures_definition" id="d"><statement name="custom_block">' +
        '<shadow type="procedures_prototype" id="p"/></statement></block>';
    const after = before.replace('<shadow type="procedures_prototype" id="p"/>',
        '<shadow type="procedures_prototype" id="p"><value name="arg">' +
        `${shadow('argument_reporter_string_number', 'x')}</value></shadow>`);
    const f = fixture(before, after);
    hydrate(f.Blockly, f.workspace, f.target);
    expect(f.blocks.p.inputs.arg).toEqual({name: 'arg', block: 's', shadow: 's'});
    expect(f.blocks.s.parent).toBe('p');
});

test('assigns a stable ID to shadow DOM hidden beneath an expression', () => {
    const f = fixture('<block type="control_if" id="p"/>', '<block type="control_if" id="p"/>');
    const hidden = dom('<shadow type="operator_boolean"/>');
    const connection = {targetBlock: () => ({isShadow: () => false}),
        getShadowDom: () => hidden,
        setShadowDom: jest.fn()};
    f.workspace.getAllBlocks = () => [{inputList: [{connection}]}];
    hydrate(f.Blockly, f.workspace, f.target);
    hydrate(f.Blockly, f.workspace, f.target);
    expect(hidden.getAttribute('id')).toBe('hidden');
    expect(f.Blockly.utils.genUid).toHaveBeenCalledTimes(1);
});

test('does not replace a conflicting VM connection or synthesize executable blocks', () => {
    const before = '<block type="control_if" id="p"><value name="CONDITION">' +
        '<block type="sensing_mousedown" id="r"/></value></block>';
    const after = `<block type="control_if" id="p"><value name="CONDITION">${shadow('operator_boolean')}` +
        '</value><next><block type="motion_movesteps" id="new"/></next></block>';
    const f = fixture(before, after);
    const saved = JSON.stringify(f.blocks);
    hydrate(f.Blockly, f.workspace, f.target);
    expect(JSON.stringify(f.blocks)).toBe(saved);
    expect(f.target.blocks.resetCache).not.toHaveBeenCalled();
});

test('hydrates a complete nested shadow tree with numeric IDs regardless of adapter order', () => {
    const f = fixture('<block type="addon_parent" id="p"/>',
        '<block type="addon_parent" id="p"><value name="VALUE">' +
        '<shadow type="addon_default" id="2"><value name="INNER">' +
        '<shadow type="text" id="1"><field name="TEXT">kept</field></shadow>' +
        '</value></shadow></value></block>');
    hydrate(f.Blockly, f.workspace, f.target);
    expect(f.blocks['2'].inputs.INNER).toEqual({name: 'INNER', block: '1', shadow: '1'});
    expect(f.blocks['1'].parent).toBe('2');
    expect(f.blocks['1'].fields.TEXT.value).toBe('kept');
    hydrate(f.Blockly, f.workspace, f.target);
    expect(f.target.blocks.resetCache).toHaveBeenCalledTimes(1);
});

test('does not partially import a default containing executable children', () => {
    const f = fixture('<block type="addon_parent" id="p"/>',
        '<block type="addon_parent" id="p"><value name="VALUE">' +
        '<shadow type="addon_default" id="s"><value name="INNER">' +
        '<block type="sensing_mousedown" id="new"/></value></shadow></value></block>');
    hydrate(f.Blockly, f.workspace, f.target);
    expect(Object.keys(f.blocks)).toEqual(['p']);
    expect(f.blocks.p.inputs).toEqual({});
});
