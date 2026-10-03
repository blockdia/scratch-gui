/* eslint-env browser */
/* global vm */
// Start the editor with BLOCKDIA_LOCAL_PACKAGES=1, then use the same environment variables as verify-containers.cjs.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const JSZip = require('@turbowarp/jszip');

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('tw:language', 'zh-cn'));
        const url = process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8618/editor.html';
        await page.goto(url);
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        assert.equal(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('containers')), false);
        assert.equal(await page.locator('.scratchCategoryId-containers').count(), 0);
        await page.evaluate(async () => {
            const first = vm.editingTarget;
            vm.renameSprite(first.id, 'World//One');
            first.setXY(0, 0);
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'World//Nested//Two');
            vm.editingTarget.setXY(70, 0);
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'Outside');
            vm.editingTarget.setXY(-100, 0);
            vm.setEditingTarget(first.id);
        });
        assert.equal(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('containers')), false);
        await page.locator('[data-folder-entry="World"]').getByRole('treeitem')
            .first()
            .click({button: 'right'});
        await page.locator('.react-contextmenu--visible').getByText(/Convert to container|转为容器/, {exact: true})
            .click();
        await page.waitForFunction(() => vm.extensionManager.isExtensionLoaded('containers'));
        await page.locator('.scratchCategoryId-containers').waitFor();
        await page.evaluate(() => vm.setSpriteFolderContainer('World//Nested', true));
        const containerOnly = await JSZip.loadAsync(Buffer.from(await page.evaluate(async () =>
            Array.from(new Uint8Array(await (await vm.saveProjectSb3()).arrayBuffer())))));
        const oldProject = JSON.parse(await containerOnly.file('project.json').async('string'));
        oldProject.extensions = [];
        for (const target of oldProject.targets) target.blocks = {};
        containerOnly.file('project.json', JSON.stringify(oldProject));
        const oldBytes = Array.from(await containerOnly.generateAsync({type: 'uint8array'}));
        await page.reload();
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        assert.equal(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('containers')), false);
        await page.evaluate(bytes => vm.loadProject(new Uint8Array(bytes)), oldBytes);
        await page.waitForFunction(() => vm.extensionManager.isExtensionLoaded('containers'));
        await page.locator('.scratchCategoryId-containers').click();
        const menu = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const blocks = workspace.getFlyout().getWorkspace()
                .getAllBlocks();
            const field = blocks.find(block => block.type === 'containers_menu_containers').getField('containers');
            const sprites = blocks.find(block => block.type === 'containers_menu_sprites').getField('sprites');
            const deletion = blocks.find(block => block.type === 'containers_deleteClone');
            const nativeDeletion = workspace.newBlock('control_delete_this_clone');
            const shape = [Boolean(deletion.previousConnection), Boolean(deletion.nextConnection)];
            const nativeShape = [Boolean(nativeDeletion.previousConnection), Boolean(nativeDeletion.nextConnection)];
            nativeDeletion.dispose();
            return {options: field.getOptions(),
                sprites: sprites.getOptions(),
                texts: blocks.map(block => block.toString()).join('\n'),
                shape,
                nativeShape};
        });
        assert(menu.options.some(([label, value]) => label === '所在容器' && value === '_mycontainer_'));
        assert(!menu.options.some(([, value]) => value === 'World'), 'current container is not listed twice');
        assert(menu.options.some(([, value]) => value === 'World//Nested'));
        assert.deepEqual(menu.shape, [true, false]);
        assert.deepEqual(menu.shape, menu.nativeShape, 'container delete has the same connections as native delete');
        assert.match(menu.texts, /将容器.*移到/);
        assert.match(menu.texts, /删除此容器克隆体/);
        assert.match(menu.texts, /角色 自己 在舞台上的 x 坐标/);
        assert.deepEqual(menu.sprites, [['自己', '_myself_'], ['World//Nested//Two', 'World//Nested//Two'],
            ['Outside', 'Outside']]);
        console.log('PASS automatic loading on creation and old-project import, Chinese palette and live menus');

        // Container metadata must update the open inspector without a surrogate target update.
        await page.locator('[data-container-properties="World"]').click();
        const popup = page.locator('[data-container-properties-popup="World"]');
        await popup.getByRole('spinbutton', {name: 'x', exact: true}).press('Tab');
        await page.evaluate(() => {
            window.containerEventCounts = {containers: 0, targets: 0};
            vm.on('containersUpdate', () => window.containerEventCounts.containers++);
            vm.on('targetsUpdate', () => window.containerEventCounts.targets++);
            vm.runtime._refreshTargets = false;
            vm.runtime.getOpcodeFunction('containers_setProperty')({CONTAINER: 'World', PROPERTY: 'x', VALUE: 37},
                {target: vm.editingTarget});
        });
        await page.waitForFunction(() => document.querySelector(
            '[data-container-properties-popup="World"] input[aria-label="x"]').value === '37');
        const counts = await page.evaluate(() => window.containerEventCounts);
        assert(counts.containers > 0);
        assert.equal(counts.targets, 0, 'container inspector does not depend on targetsUpdate');
        await popup.getByRole('spinbutton', {name: '大小', exact: true}).fill('0');
        await popup.getByRole('spinbutton', {name: '大小', exact: true}).press('Tab');
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.get('World').transform.size), 0.01);
        await page.mouse.click(800, 200);
        await popup.waitFor({state: 'hidden'});
        console.log('PASS independent container events, live property panel and size clamping');

        for (const enabled of [false, true]) {
            const result = await page.evaluate(compilerEnabled => {
                vm.stopAll();
                const runtime = vm.runtime;
                const containers = runtime.spriteContainers;
                const first = runtime.getSpriteTargetByName('World//One');
                const second = runtime.getSpriteTargetByName('World//Nested//Two');
                vm.setSpriteContainerTransform('World', {x: 0, y: 0, size: 100, direction: 90});
                vm.setSpriteContainerTransform('World//Nested', {x: 0, y: 0, size: 100, direction: 90});
                for (const id of first.blocks.getScripts()) first.blocks.deleteBlock(id);
                first.createVariable('result', 'result', '');
                first.createVariable('after-delete', 'after-delete', '');
                const add = (id, opcode, parent, next, inputs = {}, fields = {}, shadow = false) => {
                    first.blocks.createBlock({id,
                        opcode,
                        parent,
                        next,
                        inputs: Object.fromEntries(Object.entries(inputs).map(([name, block]) =>
                            [name, {name, block, shadow: block}])),
                        fields: Object.fromEntries(Object.entries(fields).map(([name, value]) =>
                            [name, {name, value, ...(name === 'VARIABLE' ? {id: value} : {})}])),
                        shadow,
                        topLevel: parent === null,
                        x: 50,
                        y: 50});
                };
                const command = (id, opcode, parent, next, values = {}, fields = {}) => {
                    const inputs = {};
                    for (const [name, value] of Object.entries(values)) {
                        const inputID = `${id}-${name}`;
                        inputs[name] = inputID;
                        const isContainer = name === 'CONTAINER';
                        add(inputID, isContainer ? 'containers_menu_containers' : 'math_number', id, null, {},
                            {[isContainer ? 'containers' : 'NUM']: value}, true);
                    }
                    add(id, opcode, parent, next, inputs, fields);
                };
                const self = {CONTAINER: '_mycontainer_'};
                add('flag', 'event_whenflagclicked', null, 'xy');
                command('xy', 'containers_goToXY', 'flag', 'size', {...self, X: 40, Y: 20});
                command('size', 'containers_changeProperty', 'xy', 'direction',
                    {...self, VALUE: 50}, {PROPERTY: 'size'});
                command('direction', 'containers_setProperty', 'size', 'hide',
                    {...self, VALUE: 450}, {PROPERTY: 'direction'});
                command('hide', 'containers_hide', 'direction', 'show', self);
                command('show', 'containers_show', 'hide', 'back', self);
                command('back', 'containers_goToLayer', 'show', 'forward', self, {LAYER: 'back'});
                command('forward', 'containers_moveLayers', 'back', 'record',
                    {...self, LAYERS: 1}, {DIRECTION: 'forward'});
                add('record', 'data_setvariableto', 'forward', 'clone', {VALUE: 'reporter'}, {VARIABLE: 'result'});
                command('reporter', 'containers_property', 'record', null, self, {PROPERTY: 'x'});
                command('clone', 'containers_createClone', 'record', null, self);
                add('clone-hat', 'control_start_as_clone', null, 'offset');
                command('offset', 'containers_changeProperty', 'clone-hat', null,
                    {...self, VALUE: 20}, {PROPERTY: 'x'});
                add('delete-hat', 'event_whenbroadcastreceived', null, 'delete', {}, {BROADCAST_OPTION: 'delete'});
                add('delete', 'containers_deleteClone', 'delete-hat', null);
                command('after', 'data_setvariableto', null, null, {VALUE: 123}, {VARIABLE: 'after-delete'});
                // A named menu shadow must survive SB3 and follow folder moves.
                command('named', 'containers_show', null, null, {CONTAINER: 'World//Nested'});
                command('clamp', 'containers_changeProperty', null, null,
                    {...self, VALUE: -100000}, {PROPERTY: 'size'});
                for (const PROPERTY of ['x', 'y', 'direction', 'size']) {
                    const id = `world-${PROPERTY}`;
                    first.createVariable(id, id, '');
                    add(`read-${id}`, 'data_setvariableto', null, null, {VALUE: id}, {VARIABLE: id});
                    add(`${id}-TARGET`, 'containers_menu_sprites', id, null, {}, {sprites: '_myself_'}, true);
                    add(id, 'containers_worldProperty', `read-${id}`, null, {TARGET: `${id}-TARGET`}, {PROPERTY});
                    Object.assign(first.blocks.getBlock(`read-${id}`), {x: 660,
                        y: 40 +
                        (['x', 'y', 'direction', 'size'].indexOf(PROPERTY) * 80)});
                }
                first.createVariable('world-target', 'world-target', '');
                first.variables['world-target'].value = second.getName();
                for (const selection of ['named', 'dynamic']) {
                    const id = `world-${selection}`;
                    first.createVariable(id, id, '');
                    add(`read-${id}`, 'data_setvariableto', null, null, {VALUE: id}, {VARIABLE: id});
                    add(`${id}-TARGET`, selection === 'named' ? 'containers_menu_sprites' : 'data_variable',
                        id, null, {}, selection === 'named' ? {sprites: second.getName()} : {VARIABLE: 'world-target'},
                        selection === 'named');
                    add(id, 'containers_worldProperty', `read-${id}`, null, {TARGET: `${id}-TARGET`}, {PROPERTY: 'x'});
                    Object.assign(first.blocks.getBlock(`read-${id}`), {x: 660,
                        y: selection === 'named' ? 510 : 600});
                }
                for (const [id, x, y] of [['flag', 40, 40], ['clone-hat', 40, 490],
                    ['delete-hat', 330, 590], ['named', 330, 730], ['after', 330, 830], ['clamp', 660, 420]]) {
                    Object.assign(first.blocks.getBlock(id), {x, y});
                }
                first.variables['after-delete'].value = 0;
                vm.setEditingTarget(runtime.getTargetForStage().id);
                vm.setCompilerOptions({enabled: compilerEnabled});
                const boundarySizes = [];
                for (const value of [-100000, 1, 100000, -1]) {
                    first.blocks.changeBlock({element: 'field', id: 'clamp-VALUE', name: 'NUM', value});
                    runtime._pushThread('clamp', first, {stackClick: true});
                    for (let i = 0; i < 4; i++) runtime._step();
                    boundarySizes.push(containers.get('World').transform.size);
                }
                containers.setTransform('World', {size: 100});
                const threads = runtime.startHats('event_whenflagclicked', null, first);
                for (let i = 0; i < 8; i++) runtime._step();
                const clones = runtime.targets.filter(target => !target.isOriginal);
                const member = clones.find(target => target.getName() === first.getName());
                const instance = containers.getContainingContainer(member).id;
                const worldThreads = ['x', 'y', 'direction', 'size', 'named', 'dynamic'].map(property =>
                    runtime._pushThread(`read-world-${property}`, member, {stackClick: true}));
                for (let i = 0; i < 4; i++) runtime._step();
                const state = {
                    compiled: Boolean(threads[0].isCompiled),
                    worldCompiled: worldThreads.every(thread => Boolean(thread.isCompiled) === compilerEnabled),
                    worldReadings: ['x', 'y', 'direction', 'size'].map(property =>
                        member.variables[`world-${property}`].value),
                    namedWorld: member.variables['world-named'].value,
                    dynamicWorld: member.variables['world-dynamic'].value,
                    boundarySizes,
                    value: first.variables.result.value,
                    source: containers.get('World').transform,
                    clone: containers.get(instance).transform,
                    sourceWorld: first.getWorldPosition(),
                    cloneWorld: member.getWorldPosition(),
                    cloneCount: clones.length,
                    sourceLayer: first.getLayerOrder(),
                    siblingLayer: second.getLayerOrder(),
                    outsideLayer: runtime.getSpriteTargetByName('Outside').getLayerOrder()
                };
                member.variables['world-target'].value = 'Outside';
                runtime._pushThread('read-world-dynamic', member, {stackClick: true});
                for (let i = 0; i < 4; i++) runtime._step();
                state.changedDynamicWorld = member.variables['world-dynamic'].value;
                const deletion = runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'delete'}, member);
                runtime._pushThread('after', member, {stackClick: true});
                for (let i = 0; i < 4; i++) runtime._step();
                state.deleteCompiled = Boolean(deletion[0].isCompiled);
                state.afterDelete = member.variables['after-delete'].value;
                state.remainingClones = runtime._cloneCounter;
                state.remainingInstances = containers.cloneDefinitions.size;
                runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'delete'}, first);
                runtime._pushThread('after', first, {stackClick: true});
                for (let i = 0; i < 4; i++) runtime._step();
                state.originalAfterDelete = first.variables['after-delete'].value;
                state.originalSurvives = runtime.targets.includes(first);
                vm.setEditingTarget(first.id);
                return state;
            }, enabled);
            assert.equal(result.compiled, enabled);
            assert(result.worldCompiled);
            assert.deepEqual(result.boundarySizes, [0.01, 1.01, 10000, 9999]);
            assert.deepEqual(result.worldReadings, [60, 20, 90, 150]);
            assert.equal(result.namedWorld, 145, 'named selection reads the original, not a sibling clone');
            assert.equal(result.dynamicWorld, 145, 'reporter inputs resolve sprite names');
            assert.equal(result.changedDynamicWorld, -100, 'reporter targets are resolved on each execution');
            assert.equal(result.deleteCompiled, enabled);
            assert.equal(result.value, 40);
            assert.equal(result.source.x, 40);
            assert.equal(result.clone.x, 60);
            assert.equal(result.source.size, 150);
            assert.equal(result.source.direction, 90);
            assert.deepEqual(result.sourceWorld, [40, 20]);
            assert.deepEqual(result.cloneWorld, [60, 20]);
            assert.equal(result.cloneCount, 2);
            assert(result.sourceLayer > result.outsideLayer && result.siblingLayer > result.outsideLayer);
            assert.equal(result.afterDelete, 0, 'deletion stops other scripts belonging to the cloned member');
            assert.equal(result.originalAfterDelete, 123,
                'deleting an original is a no-op and preserves other scripts');
            assert(result.originalSurvives);
            assert.equal(result.remainingClones, 0);
            assert.equal(result.remainingInstances, 0);
            console.log('PASS', enabled ? 'compiler' : 'interpreter',
                'transforms, reporters, layers and clone lifecycle');
        }

        await page.evaluate(async () => {
            const first = vm.editingTarget;
            const other = vm.runtime.getSpriteTargetByName('World//Nested//Two');
            const stage = vm.runtime.getTargetForStage();
            const share = (id, target) => vm.shareBlocksToTarget([
                {...first.blocks.getBlock(id), parent: null, topLevel: true, x: 40, y: 40},
                first.blocks.getBlock(`${id}-TARGET`)
            ], target.id, first.id);
            await share('world-named', other);
            await share('world-x', stage);
            vm.setEditingTarget(other.id);
        });
        const sharedMenu = () => page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const field = workspace.getAllBlocks().find(block => block.type === 'containers_menu_sprites')
                .getField('sprites');
            return {value: field.getValue(), label: field.getText()};
        });
        assert.deepEqual(await sharedMenu(), {value: 'World//Nested//Two', label: 'World//Nested//Two'});
        await page.evaluate(() => vm.setEditingTarget(vm.runtime.getTargetForStage().id));
        assert.deepEqual(await sharedMenu(), {value: '_myself_', label: '自己'});
        await page.locator('.scratchCategoryId-containers').click();
        const stageMenu = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace();
            const field = workspace.getAllBlocks().find(block => block.type === 'containers_menu_sprites')
                .getField('sprites');
            return field.getOptions();
        });
        assert.deepEqual(stageMenu.map(([, value]) => value), ['World//One', 'World//Nested//Two', 'Outside']);
        await page.evaluate(() => vm.setEditingTarget(vm.runtime.getSpriteTargetByName('World//One').id));
        console.log('PASS sprite and stage menus, shared explicit targets and localized relative targets');

        const saved = await page.evaluate(async () => {
            const containers = vm.runtime.spriteContainers;
            containers.beginUpdate();
            containers.move('World', 'Scene');
            for (const target of vm.runtime.targets.filter(member => member.isOriginal &&
                member.getName().startsWith('World//'))) {
                vm.renameSprite(target.id, `Scene${target.getName().slice('World'.length)}`);
            }
            containers.endUpdate();
            vm.emitWorkspaceUpdate();
            const first = vm.runtime.getSpriteTargetByName('Scene//One');
            const selection = first.blocks.getBlock('named-CONTAINER').fields.containers.value;
            const spriteSelection = first.blocks.getBlock('world-named-TARGET').fields.sprites.value;
            const blob = await vm.saveProjectSb3();
            return {selection, spriteSelection, bytes: Array.from(new Uint8Array(await blob.arrayBuffer()))};
        });
        assert.equal(saved.selection, 'Scene//Nested');
        assert.equal(saved.spriteSelection, 'Scene//Nested//Two');
        await page.screenshot({path: '/tmp/blockdia-container-extension.png'});
        await page.reload();
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        assert.equal(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('containers')), false);
        const loaded = await page.evaluate(async bytes => {
            await vm.loadProject(new Uint8Array(bytes));
            const first = vm.runtime.getSpriteTargetByName('Scene//One');
            const named = Object.values(first.blocks._blocks).find(block =>
                block.opcode === 'containers_menu_containers' &&
                block.fields.containers.value === 'Scene//Nested');
            const sprite = Object.values(first.blocks._blocks).find(block =>
                block.opcode === 'containers_menu_sprites' &&
                block.fields.sprites.value === 'Scene//Nested//Two');
            return {loaded: vm.extensionManager.isExtensionLoaded('containers'),
                selection: named && named.fields.containers.value,
                spriteSelection: sprite && sprite.fields.sprites.value,
                worldX: vm.runtime.getOpcodeFunction('containers_worldProperty')(
                    {TARGET: sprite.fields.sprites.value, PROPERTY: 'x'}, {target: vm.runtime.getTargetForStage()}),
                transform: vm.runtime.spriteContainers.get('Scene').transform};
        }, saved.bytes);
        assert(loaded.loaded);
        assert.equal(loaded.selection, saved.selection);
        assert.equal(loaded.spriteSelection, saved.spriteSelection);
        assert.equal(loaded.worldX, 145);
        assert.equal(loaded.transform.x, 40);
        const worldFields = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            return workspace.getAllBlocks().filter(block => block.type === 'containers_worldProperty')
                .map(block => block.getFieldValue('PROPERTY'));
        });
        assert.deepEqual(worldFields.sort(), ['direction', 'size', 'x', 'x', 'x', 'y']);
        await page.locator('.scratchCategoryId-containers').click();
        await page.locator('[class*="stage-header_stage-size-toggle-group"]').getByRole('button',
            {name: /Switch to small stage|缩小舞台/})
            .click();
        await page.screenshot({path: '/tmp/blockdia-container-extension-small.png'});
        assert.deepEqual(errors, []);
        console.log('PASS folder rename, fresh-VM SB3 loading, small-stage palette; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
