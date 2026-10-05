/* eslint-env browser */
/* global vm */
// Run with BLOCKDIA_LOCAL_PACKAGES=1 and the verify-container-extension.cjs environment variables.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(compact => {
            localStorage.setItem('tw:language', 'zh-cn');
            if (compact) localStorage.setItem('tw:addons', JSON.stringify({'editor-compact': {enabled: true}}));
        }, process.env.COMPONENTS_COMPACT === '1');
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8618/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.evaluate(async () => {
            const first = vm.editingTarget;
            vm.renameSprite(first.id, 'A//N//One');
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'Other');
            vm.setEditingTarget(first.id);
            vm.setSpriteFolderContainer('A', true);
            vm.setSpriteFolderContainer('A//N', true);
            vm.setRuntimeOptions({fencing: false});
        });
        await page.locator('.scratchCategoryId-containers').click();
        const palette = await page.evaluate(() => {
            const blocks = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace()
                .getAllBlocks();
            const get = type => blocks.find(block => block.type === `containers_${type}`);
            return {
                text: blocks.map(block => block.toString()).join('\n'),
                targets: get('menu_positionTargets').getField('positionTargets')
                    .getOptions(),
                containers: get('menu_coordinateSpaces').getField('coordinateSpaces')
                    .getOptions(),
                coordinates: get('targetProperty').getField('PROPERTY')
                    .getOptions(),
                pointInputs: ['X', 'Y', 'FROM', 'TO'].map(name => Boolean(get('convertPoint').getInput(name))),
                legacyRegistered: ['worldProperty', 'positionInContainer', 'pointToStage', 'pointToContainer']
                    .some(type => vm.runtime.getBlocksJSON()
                        .some(block => block && block.type === `containers_${type}`) ||
                        Boolean(vm.runtime.getOpcodeFunction(`containers_${type}`)))
            };
        });
        assert.match(palette.text, /鼠标指针 在 所在容器 中的 x 坐标/);
        assert.match(palette.text, /移到舞台上的 x: 0 y: 0/);
        assert.deepEqual(palette.targets.map(item => item[1]), ['_mouse_', '_myself_', 'Other']);
        assert.deepEqual(palette.containers.map(item => item[1]), ['//', '_mycontainer_', 'A']);
        assert.deepEqual(palette.containers[0], ['舞台', '//']);
        assert.deepEqual(palette.coordinates.map(item => item[1]), ['x', 'y']);
        assert(palette.pointInputs.every(Boolean));
        assert.equal(palette.legacyRegistered, false);
        await page.evaluate(() => {
            const Blockly = window.Blockly || window.ScratchBlocks;
            const workspace = Blockly.getMainWorkspace();
            const paletteXML = Blockly.Xml.workspaceToDom(workspace.getFlyout().getWorkspace(), true);
            const xml = Blockly.Xml.textToDom('<xml/>');
            ['goToWorldXY', 'targetProperty', 'convertPoint'].forEach((opcode, index) => {
                const dom = Array.from(paletteXML.children)
                    .find(block => block.getAttribute('type') === `containers_${opcode}`)
                    .cloneNode(true);
                dom.setAttribute('x', '35');
                dom.setAttribute('y', String(35 + (index * 80)));
                xml.appendChild(dom);
            });
            Blockly.Xml.domToWorkspace(xml, workspace);
        });
        assert.deepEqual(await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const conversion = workspace.getAllBlocks().find(block => block.type === 'containers_convertPoint');
            const field = conversion.getInputTargetBlock('TO').getField('coordinateSpaces');
            return [field.getValue(), field.getText()];
        }), ['//', '舞台']);
        await page.screenshot({path: `/tmp/blockdia-coordinate-blocks${
            process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
        console.log('PASS Chinese palette, native mouse label and complete coordinate inputs');

        await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            block.getInputTargetBlock('TARGET').getField('positionTargets')
                .setValue('_myself_');
        });
        await page.waitForFunction(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            return block.getField('PROPERTY').getOptions().length === 4;
        });
        await page.evaluate(() => {
            const Blockly = window.Blockly || window.ScratchBlocks;
            const workspace = Blockly.getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            block.getField('PROPERTY').setValue('direction');
            const reporter = workspace.newBlock('text', 'coordinate-dynamic-target');
            reporter.initSvg();
            reporter.setFieldValue('_mouse_', 'TEXT');
            reporter.render();
            block.getInput('TARGET').connection.connect(reporter.outputConnection);
        });
        await page.waitForFunction(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            const stored = vm.editingTarget.blocks.getBlock(block.id);
            return block.getField('PROPERTY').getOptions().length === 4 &&
                block.getFieldValue('PROPERTY') === 'direction' && stored.fields.PROPERTY.value === 'direction' &&
                stored.inputs.TARGET.block === 'coordinate-dynamic-target' &&
                vm.editingTarget.blocks.getBlock('coordinate-dynamic-target').fields.TEXT.value === '_mouse_';
        });
        await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            block.getField('PROPERTY').showEditor_();
        });
        await page.screenshot({path: `/tmp/blockdia-coordinate-dynamic-menu${
            process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
        await page.mouse.click(850, 500);
        await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            workspace.getBlockById('coordinate-dynamic-target').dispose();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            block.getInputTargetBlock('TARGET').getField('positionTargets')
                .setValue('_mouse_');
        });
        await page.waitForFunction(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            return block.getField('PROPERTY').getOptions().length === 2 && block.getFieldValue('PROPERTY') === 'x' &&
                vm.editingTarget.blocks.getBlock(block.id).fields.PROPERTY.value === 'x';
        });
        console.log('PASS fixed mouse filtering, connected reporter preserving direction, and shadow restoration');

        await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            block.getInputTargetBlock('SPACE').getField('coordinateSpaces')
                .setValue('A//N');
        });
        await page.waitForFunction(() => Object.values(vm.editingTarget.blocks._blocks).some(block =>
            block.opcode === 'containers_menu_coordinateSpaces' && block.fields.coordinateSpaces.value === 'A//N'));
        await page.evaluate(async () => {
            await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        });
        const restored = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            const field = block.getInputTargetBlock('SPACE').getField('coordinateSpaces');
            const conversion = workspace.getAllBlocks().find(item => item.type === 'containers_convertPoint');
            return {value: field.getValue(),
                label: field.getText(),
                options: field.getOptions().map(([, value]) => value),
                conversion: ['FROM', 'TO'].map(name => conversion.getInputTargetBlock(name)
                    .getField('coordinateSpaces')
                    .getOptions()
                    .map(([, value]) => value))};
        });
        assert.deepEqual(restored, {value: 'A//N',
            label: 'A//N',
            options: ['//', '_mycontainer_', 'A'],
            conversion: [['//', '_mycontainer_', 'A'], ['//', '_mycontainer_', 'A']]});
        const suffix = process.env.COMPONENTS_COMPACT === '1' ? '-compact' : '';
        await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const block = workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty');
            const field = block.getInputTargetBlock('SPACE').getField('coordinateSpaces');
            field.setValue('_mycontainer_');
            field.showEditor_();
        });
        await page.screenshot({path: `/tmp/blockdia-coordinate-space-menu${suffix}.png`});
        await page.mouse.click(850, 500);
        await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            workspace.getAllBlocks().find(item => item.type === 'containers_targetProperty')
                .getInputTargetBlock('TARGET')
                .getField('positionTargets')
                .showEditor_();
        });
        await page.screenshot({path: `/tmp/blockdia-coordinate-target-menu${suffix}.png`});
        await page.mouse.click(850, 500);
        console.log('PASS both point menus exclude the nearest container; saved named frame and label survive reload');


        for (const enabled of [false, true]) {
            const result = await page.evaluate(compilerEnabled => {
                vm.stopAll();
                const runtime = vm.runtime;
                const first = runtime.getSpriteTargetByName('A//N//One');
                const other = runtime.getSpriteTargetByName('Other');
                const containers = runtime.spriteContainers;
                vm.setSpriteContainerTransform('A',
                    {x: 100, y: 50, size: 200, direction: 180, rotationStyle: 'all around'});
                vm.setSpriteContainerTransform('A//N', {x: 5, y: 10, size: 50});
                first.setXY(10, 20);
                other.setXY(140, 30);
                runtime.ioDevices.mouse.postData({x: 380, y: 150, canvasWidth: 480, canvasHeight: 360});
                for (const id of first.blocks.getScripts()) first.blocks.deleteBlock(id);
                const add = (id, opcode, parent, inputs = {}, fields = {}, next = null, shadow = false) => {
                    first.blocks.createBlock({id,
                        opcode,
                        parent,
                        next,
                        shadow,
                        topLevel: parent === null,
                        x: 40,
                        y: 40,
                        inputs: Object.fromEntries(Object.entries(inputs).map(([name, block]) =>
                            [name, {name, block, shadow: block}])),
                        fields: Object.fromEntries(Object.entries(fields).map(([name, value]) =>
                            [name, {name, value, ...(name === 'VARIABLE' ? {id: value} : {})}]))});
                };
                first.createVariable('frame', 'frame', '');
                const report = (id, opcode, values, coordinate) => {
                    first.createVariable(id, id, '');
                    const inputs = {};
                    for (const [name, value] of Object.entries(values)) {
                        inputs[name] = `${id}-${name}`;
                        if (name === 'SPACE' || (['FROM', 'TO'].includes(name) && value === 0)) {
                            add(inputs[name], 'data_variable', id, {}, {VARIABLE: 'frame'});
                        } else add(inputs[name], 'text', id, {}, {TEXT: String(value)}, null, true);
                    }
                    add(`${id}-set`, 'data_setvariableto', null, {VALUE: id}, {VARIABLE: id});
                    add(id, `containers_${opcode}`, `${id}-set`, inputs,
                        {[opcode === 'targetProperty' ? 'PROPERTY' : 'COORDINATE']: coordinate});
                };
                for (const axis of ['x', 'y']) {
                    report(`mouse-${axis}`, 'targetProperty', {TARGET: '_mouse_', SPACE: 0}, axis);
                    report(`self-${axis}`, 'targetProperty', {TARGET: '_myself_', SPACE: 0}, axis);
                    report(`named-${axis}`, 'targetProperty', {TARGET: first.getName(), SPACE: 0}, axis);
                    report(`other-${axis}`, 'targetProperty', {TARGET: other.getName(), SPACE: 0}, axis);
                    report(`world-${axis}`, 'convertPoint', {X: 10, Y: 20, FROM: 0, TO: '//'}, axis);
                    report(`local-${axis}`, 'convertPoint', {X: 140, Y: 30, FROM: '//', TO: 0}, axis);
                }
                report('direction', 'targetProperty', {TARGET: '_myself_', SPACE: 0}, 'direction');
                report('size', 'targetProperty', {TARGET: '_myself_', SPACE: 0}, 'size');
                report('mouse-direction', 'targetProperty', {TARGET: '_mouse_', SPACE: 0}, 'direction');
                report('mouse-size', 'targetProperty', {TARGET: '_mouse_', SPACE: 0}, 'size');
                add('move-X', 'math_number', 'move', {}, {NUM: 150}, null, true);
                add('move-Y', 'math_number', 'move', {}, {NUM: 40}, null, true);
                add('move', 'containers_goToWorldXY', null, {X: 'move-X', Y: 'move-Y'});
                vm.setEditingTarget(runtime.getTargetForStage().id);
                vm.setCompilerOptions({enabled: compilerEnabled});
                const ids = ['mouse', 'self', 'named', 'other', 'world', 'local'];
                const read = (target, frame) => {
                    target.variables.frame.value = frame;
                    const threads = ids.flatMap(id => ['x', 'y'].map(axis =>
                        runtime._pushThread(`${id}-${axis}-set`, target, {stackClick: true})));
                    for (const id of ['direction', 'size', 'mouse-direction', 'mouse-size']) {
                        threads.push(runtime._pushThread(`${id}-set`, target, {stackClick: true}));
                    }
                    for (let i = 0; i < 4; i++) runtime._step();
                    return {compiled: threads.every(thread => Boolean(thread.isCompiled) === compilerEnabled),
                        properties: ['direction', 'size', 'mouse-direction', 'mouse-size']
                            .map(id => target.variables[id].value),
                        values: Object.fromEntries(ids.map(id =>
                            [id, ['x', 'y'].map(axis => target.variables[`${id}-${axis}`].value)]))};
                };
                const original = read(first, '_mycontainer_');
                const clone = containers.createClone('A')[0];
                const chain = containers.getTargetContainers(clone);
                containers.setTransform(chain[0].id, {x: -100});
                const relative = read(clone, '_mycontainer_');
                const namedFrame = read(clone, 'A//N');
                const move = runtime._pushThread('move', clone, {stackClick: true});
                for (let i = 0; i < 4; i++) runtime._step();
                const moved = {world: clone.getWorldPosition(),
                    original: first.getWorldPosition(),
                    compiled: Boolean(move.isCompiled) === compilerEnabled};
                vm.stopAll();
                vm.setSpriteContainerTransform('A', {direction: -90, rotationStyle: 'left-right'});
                const mirrored = read(first, '_mycontainer_');
                vm.setEditingTarget(first.id);
                return {original, relative, namedFrame, moved, mirrored};
            }, enabled);
            const near = (actual, expected) => actual.forEach((value, i) =>
                assert(Math.abs(value - expected[i]) < 1e-7, `${value} should equal ${expected[i]}`));
            for (const state of [result.original, result.relative, result.namedFrame, result.mirrored]) {
                assert(state.compiled);
                near(state.properties, [90, 100, 0, 0]);
            }
            for (const key of ['mouse', 'self', 'named', 'other', 'local']) near(result.original.values[key], [10, 20]);
            near(result.original.values.world, [140, 30]);
            near(result.relative.values.self, [10, 20]);
            near(result.relative.values.named, [10, 220]);
            near(result.relative.values.world, [-60, 30]);
            near(result.namedFrame.values.self, [10, -180]);
            near(result.namedFrame.values.world, [140, 30]);
            near(result.moved.world, [150, 40]);
            near(result.moved.original, [140, 30]);
            assert(result.moved.compiled);
            near(result.mirrored.values.world, [80, 90]);
            near(result.mirrored.values.self, [10, 20]);
            console.log(`PASS ${enabled ? 'compiler' : 'interpreter'}: nested conversion, ` +
                'dynamic frames, clones, mirror, xy');
        }
        const saved = await page.evaluate(async () => {
            const bytes = await (await vm.saveProjectSb3()).arrayBuffer();
            await vm.loadProject(bytes);
            const target = vm.runtime.getSpriteTargetByName('A//N//One');
            return {opcodes: Object.values(target.blocks._blocks).map(block => block.opcode),
                instances: vm.runtime.spriteContainers.cloneDefinitions.size};
        });
        for (const opcode of ['targetProperty', 'convertPoint', 'goToWorldXY']) {
            assert(saved.opcodes.includes(`containers_${opcode}`));
        }
        assert.equal(saved.instances, 0);
        assert.deepEqual(errors, []);
        console.log('PASS SB3 round trip; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
