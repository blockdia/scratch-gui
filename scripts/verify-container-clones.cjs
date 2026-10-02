/* eslint-env browser */
/* global vm */
// Run against an editor started with BLOCKDIA_LOCAL_PACKAGES=1.
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
            localStorage.setItem('tw:addons', JSON.stringify({'layer-manager': {enabled: true},
                'editor-compact': {enabled: compact}}));
        }, process.env.COMPONENTS_COMPACT === '1');
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8614/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.evaluate(async () => {
            if (!vm.runtime.spriteContainers.getCloneMenu) throw new Error('Use BLOCKDIA_LOCAL_PACKAGES=1');
            const first = vm.editingTarget;
            vm.renameSprite(first.id, 'World//Back');
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'World//Nested//Front');
            await vm.addComponent('slider', 'World//Nested//Slider');
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'World'); // Sprite and container may have the same label.
            const sprites = vm.runtime.targets.filter(target => !target.isStage);
            const create = (target, id, opcode, parent, next, inputs = {}, fields = {}, shadow = false) =>
                target.blocks.createBlock({id,
                    opcode,
                    parent,
                    next,
                    inputs: Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, {...value, name}])),
                    fields,
                    shadow,
                    topLevel: parent === null,
                    x: 40,
                    y: 40});
            const input = id => ({block: id, shadow: id});
            for (const target of vm.runtime.targets) {
                create(target, 'container-self-command', 'control_create_clone_of', null, null,
                    {CLONE_OPTION: input('container-self-menu')});
                target.blocks.getBlock('container-self-command').x = 320;
                create(target, 'container-self-menu', 'control_create_clone_of_menu',
                    'container-self-command', null, {},
                    {CLONE_OPTION: {name: 'CLONE_OPTION',
                        value: target.getName().startsWith('World//') ?
                            '_mycontainer_' : 'World//Back'}}, true);
            }
            sprites.forEach((target, index) => {
                target.setXY(-130, 100 - (index * 70));
                target.goToFront();
                if (target.getName() === 'World') return;
                target.createVariable('local', 'local', '');
                target.variables.local.value = 10;
                create(target, 'clone-hat', 'control_start_as_clone', null, 'clone-value');
                create(target, 'clone-value', 'data_changevariableby', 'clone-hat', 'clone-move',
                    {VALUE: input('one')}, {VARIABLE: {name: 'VARIABLE', value: 'local', id: 'local'}});
                create(target, 'one', 'math_number', 'clone-value', null, {}, {NUM: {name: 'NUM', value: 1}}, true);
                create(target, 'clone-move', 'motion_changexby', 'clone-value', null, {DX: input('offset')});
                create(target, 'offset', 'math_number', 'clone-move', null, {}, {NUM: {name: 'NUM', value: 80}}, true);
            });
            const controller = vm.runtime.getSpriteTargetByName('World');
            create(controller, 'flag', 'event_whenflagclicked', null, 'clone-first');
            create(controller, 'clone-first', 'control_create_clone_of', 'flag', 'clone-second',
                {CLONE_OPTION: input('menu-first')});
            create(controller, 'menu-first', 'control_create_clone_of_menu', 'clone-first', null, {},
                {CLONE_OPTION: {name: 'CLONE_OPTION', value: '_container_:World'}}, true);
            create(controller, 'clone-second', 'control_create_clone_of', 'clone-first', null,
                {CLONE_OPTION: input('menu-second')});
            create(controller, 'menu-second', 'control_create_clone_of_menu', 'clone-second', null, {},
                {CLONE_OPTION: {name: 'CLONE_OPTION', value: '_container_:World'}}, true);
            vm.setSpriteFolderContainer('World', true);
            vm.setSpriteFolderContainer('World//Nested', true);
            vm.setEditingTarget(first.id);
            vm.setEditingTarget(controller.id);
            vm.emitWorkspaceUpdate();
        });
        await page.waitForFunction(() => (window.Blockly || window.ScratchBlocks).getMainWorkspace()
            .getBlockById('menu-first'));
        const options = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const field = workspace.getBlockById('menu-first').getField('CLONE_OPTION');
            field.showEditor_();
            return field.getOptions();
        });
        assert(options.some(([label, value]) => label === '容器: World' && value === '_container_:World'));
        assert(options.some(([, value]) => value === '_container_:World//Nested'));
        assert(!options.some(([, value]) => value === '_mycontainer_'));
        await page.getByText('容器: World', {exact: true}).last()
            .click();
        console.log('PASS real localized clone dropdown with nested containers');

        const contexts = [['World//Back', 'World'], ['World//Nested//Front', 'World//Nested'], [null, null]];
        for (const [name, current] of contexts) {
            const menu = await page.evaluate(targetName => {
                vm.setEditingTarget(targetName ? vm.runtime.getSpriteTargetByName(targetName).id :
                    vm.runtime.getTargetForStage().id);
                const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
                return workspace.getBlockById('container-self-menu').getField('CLONE_OPTION')
                    .getOptions();
            }, name);
            if (current) {
                assert.deepEqual(menu.slice(0, 2).map(([, value]) => value), ['_myself_', '_mycontainer_']);
                assert.equal(menu[1][0], '所在容器');
                assert(!menu.some(([, value]) => value === `_container_:${current}`));
                const other = current === 'World' ? 'World//Nested' : 'World';
                assert(menu.some(([, value]) => value === `_container_:${other}`));
                await page.evaluate(() => (window.Blockly || window.ScratchBlocks).getMainWorkspace()
                    .getBlockById('container-self-menu')
                    .getField('CLONE_OPTION')
                    .showEditor_());
                await page.getByText('所在容器', {exact: true}).last()
                    .click();
                await page.screenshot({path: '/tmp/blockdia-containing-container.png'});
            } else {
                assert(!menu.some(([, value]) => ['_myself_', '_mycontainer_'].includes(value)));
                assert(menu.some(([, value]) => value === '_container_:World'));
            }
        }
        await page.evaluate(() => vm.setEditingTarget(vm.runtime.getSpriteTargetByName('World').id));
        console.log('PASS native-style relative selection, own-name filtering, nested containers and stage menu');

        for (const enabled of [false, true]) {
            const compiled = await page.evaluate(compilerEnabled => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compilerEnabled});
                vm.greenFlag();
                return vm.runtime.threads.some(thread => thread.isCompiled);
            }, enabled);
            assert.equal(compiled, enabled, 'requested execution mode is actually active');
            await page.waitForFunction(() => {
                const clones = vm.runtime.targets.filter(target => !target.isOriginal);
                return clones.length === 6 && clones.every(target =>
                    target.variables.local.value === 11 && target.x === -50);
            });
            const result = await page.evaluate(() => {
                const manager = vm.runtime.spriteContainers;
                const originals = vm.runtime.targets.filter(target => target.isOriginal && !target.isStage &&
                    target.getName().startsWith('World//')).sort((a, b) => a.getLayerOrder() - b.getLayerOrder());
                const clones = vm.runtime.targets.filter(target => !target.isOriginal);
                const groups = [...new Set(clones.map(target => manager.getTargetContainers(target)[0].id))];
                const ordered = vm.runtime.targets.filter(target => !target.isStage)
                    .sort((a, b) => a.getLayerOrder() - b.getLayerOrder());
                const groupOrder = ordered.map(target => manager.getTargetContainers(target)[0]?.id || 'outside');
                const members = groups.map(id => ordered.filter(target =>
                    manager.getTargetContainers(target)[0]?.id === id).map(target => target.getName()));
                const components = clones.filter(target => target.componentController);
                const componentParts = components.every(target => {
                    const orders = target.getDrawableIDs().map(id => vm.renderer.getDrawableOrder(id));
                    return orders.every((order, i) => order === orders[0] + i);
                });
                const instance = groups[0];
                const member = clones.find(target => manager.getTargetContainers(target)[0].id === instance);
                member.goToFront();
                const outside = vm.runtime.getSpriteTargetByName('World');
                const contained = member.getLayerOrder() < originals[0].getLayerOrder() &&
                    member.getLayerOrder() < outside.getLayerOrder();
                vm.setSpriteContainerVisible(instance, false);
                const independentVisibility = clones.filter(target =>
                    manager.getTargetContainers(target)[0].id === instance)
                    .every(target => !target.isEffectivelyVisible()) &&
                    originals.every(target => target.isEffectivelyVisible());
                vm.setSpriteContainerVisible(instance, true);
                const originalUnchanged = originals.every(target =>
                    target.variables.local.value === 10 && target.x === -130);
                return {groups,
                    groupOrder,
                    members,
                    expected: originals.map(target => target.getName()),
                    componentParts,
                    contained,
                    independentVisibility,
                    originalUnchanged};
            });
            assert.equal(result.groups.length, 2);
            assert.deepEqual(result.groupOrder, [...Array(3).fill(result.groups[0]), ...Array(3).fill(result.groups[1]),
                ...Array(3).fill('World'), 'outside']);
            result.members.forEach(members => assert.deepEqual(members, result.expected));
            for (const key of ['componentParts', 'contained', 'independentVisibility', 'originalUnchanged']) {
                assert.equal(result[key], true, key);
            }
            console.log('PASS container clone scripts, independent state and atomic renderer order;',
                `compiler=${enabled}`);
            const relativeCompiled = await page.evaluate(() => {
                const manager = vm.runtime.spriteContainers;
                const source = vm.runtime.targets.find(target => !target.isOriginal &&
                    target.getName() === 'World//Nested//Front');
                window.relativeSource = source;
                window.relativeBefore = vm.runtime.targets.map(target => target.id);
                const container = manager.getContainingContainer(source).id;
                for (const target of vm.runtime.targets.filter(item =>
                    manager.getContainingContainer(item)?.id === container)) {
                    target.variables.local.value = 30;
                    target.setXY(-90, target.y);
                    if (target.componentController) target.componentController.setProperties({value: 68});
                }
                return vm.runtime._pushThread('container-self-command', source, {stackClick: true}).isCompiled;
            });
            assert.equal(Boolean(relativeCompiled), enabled);
            await page.waitForFunction(() => {
                const created = vm.runtime.targets.filter(target => !window.relativeBefore.includes(target.id));
                return created.length === 2 && created.every(target =>
                    target.variables.local.value === 31 && target.x === -10);
            });
            assert.equal(await page.evaluate(() => {
                const manager = vm.runtime.spriteContainers;
                const source = manager.getTargetContainers(window.relativeSource);
                const created = vm.runtime.targets.filter(target => !window.relativeBefore.includes(target.id));
                const copiedInstance = created.every(target => {
                    const membership = manager.getTargetContainers(target);
                    return membership[0].id === source[0].id && membership[1].id !== source[1].id &&
                        (!target.component || target.component.properties.value === 68);
                });
                created.forEach(target => vm.runtime.disposeTarget(target));
                return copiedInstance;
            }), true);
            console.log(`PASS my container clones the current nested instance and its live state; compiler=${enabled}`);
        }

        await page.getByRole('button', {name: '图层管理器', exact: true}).click();
        const panel = page.locator('[data-editor-window="layer-manager/layers"]');
        await panel.waitFor({state: 'visible'});
        await page.waitForFunction(() => document.querySelectorAll(
            '[data-layer-id^="container:_container_clone_:"]').length === 4);
        await panel.locator('[data-layer-id="container:World"] .sa-layer-toggle').click();
        const bounds = await panel.boundingBox();
        await page.mouse.move(bounds.x + 100, bounds.y + 20);
        await page.mouse.down();
        await page.mouse.move(bounds.x - 170, bounds.y + 20, {steps: 8});
        await page.mouse.up();
        const firstInstance = panel.locator('[data-layer-id^="container:_container_clone_:"]').first();
        await firstInstance.locator('.sa-layer-select').click();
        assert.match(await firstInstance.innerText(), /克隆体/);
        await firstInstance.scrollIntoViewIfNeeded();
        await page.screenshot({path: '/tmp/blockdia-container-clones.png'});
        console.log('PASS layer tree distinguishes both container instances and their nested containers');

        const saved = await page.evaluate(async () => {
            const data = await vm.saveProjectSb3();
            await vm.loadProject(await data.arrayBuffer());
            const controller = vm.runtime.getSpriteTargetByName('World');
            return {clones: vm.runtime._cloneCounter,
                instances: vm.runtime.spriteContainers.cloneDefinitions.size,
                containers: vm.runtime.spriteContainers.serialize(),
                relative: Object.values(vm.runtime.getSpriteTargetByName('World//Back').blocks._blocks)
                    .some(block => block.fields.CLONE_OPTION?.value === '_mycontainer_'),
                menu: Object.values(controller.blocks._blocks).find(block =>
                    block.fields.CLONE_OPTION?.value.startsWith('_container_:')).fields.CLONE_OPTION.value};
        });
        assert.equal(saved.clones, 0);
        assert.equal(saved.instances, 0);
        assert.equal(saved.menu, '_container_:World');
        assert.equal(saved.relative, true);
        assert.deepEqual(saved.containers, [{path: 'World', visible: true}, {path: 'World//Nested', visible: true}]);
        await panel.getByRole('button', {name: '关闭', exact: true}).click();
        await page.locator('[data-folder-entry="World"]').getByRole('treeitem')
            .first()
            .click({button: 'right'});
        await page.locator('.react-contextmenu--visible').getByText('重命名文件夹', {exact: true})
            .click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('textbox').fill('Scene');
        await dialog.getByRole('button', {name: '确定', exact: true}).click();
        assert.equal(await page.evaluate(() => Object.values(vm.runtime.getSpriteTargetByName('World').blocks._blocks)
            .filter(block => block.fields.CLONE_OPTION?.value.startsWith('_container_:'))
            .every(block => block.fields.CLONE_OPTION.value === '_container_:Scene')), true);
        await page.evaluate(() => vm.greenFlag());
        await page.waitForFunction(() => vm.runtime._cloneCounter === 6);
        await page.evaluate(() => vm.stopAll());
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.cloneDefinitions.size), 0);
        // Regression: cloning myself first adds a live member which must be included in the container snapshot.
        await page.evaluate(() => {
            const target = vm.runtime.getSpriteTargetByName('Scene//Back');
            vm.renameSprite(target.id, 'Repro//Role');
            vm.setSpriteFolderContainer('Repro', true);
            target.blocks.deleteAllBlocks();
            const create = (id, opcode, parent, next, inputs, fields, shadow = false) =>
                target.blocks.createBlock({id,
                    opcode,
                    parent,
                    next,
                    inputs,
                    fields,
                    shadow,
                    topLevel: parent === null,
                    x: 40,
                    y: 40});
            create('clone-self-first', 'control_create_clone_of', null, 'clone-container-next',
                {CLONE_OPTION: {name: 'CLONE_OPTION', block: 'self-choice', shadow: 'self-choice'}}, {});
            create('self-choice', 'control_create_clone_of_menu', 'clone-self-first', null, {},
                {CLONE_OPTION: {name: 'CLONE_OPTION', value: '_myself_'}}, true);
            create('clone-container-next', 'control_create_clone_of', 'clone-self-first', null,
                {CLONE_OPTION: {name: 'CLONE_OPTION', block: 'container-choice', shadow: 'container-choice'}}, {});
            create('container-choice', 'control_create_clone_of_menu', 'clone-container-next', null, {},
                {CLONE_OPTION: {name: 'CLONE_OPTION', value: '_mycontainer_'}}, true);
            vm.setEditingTarget(vm.runtime.getTargetForStage().id);
            vm.setEditingTarget(target.id);
        });
        await page.waitForFunction(() => (window.Blockly || window.ScratchBlocks).getMainWorkspace()
            .getBlockById('clone-self-first'));
        for (const enabled of [false, true]) {
            const compiled = await page.evaluate(compilerEnabled => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compilerEnabled});
                const target = vm.runtime.getSpriteTargetByName('Repro//Role');
                return Boolean(vm.runtime._pushThread('clone-self-first', target, {stackClick: true}).isCompiled);
            }, enabled);
            assert.equal(compiled, enabled);
            await page.waitForFunction(() => vm.runtime._cloneCounter === 3);
            const sizes = await page.evaluate(() => {
                const manager = vm.runtime.spriteContainers;
                const groups = new Map();
                for (const target of vm.runtime.targets.filter(item => item.getName() === 'Repro//Role')) {
                    const container = manager.getContainingContainer(target);
                    groups.set(container.id, (groups.get(container.id) || 0) + 1);
                }
                return {source: groups.get('Repro'),
                    copies: [...groups].filter(([id]) => id !== 'Repro')
                        .map(([, count]) => count)};
            });
            assert.deepEqual(sizes, {source: 2, copies: [2]});
            console.log(`PASS clone myself then my container preserves both live members; compiler=${enabled}`);
        }
        await page.getByRole('button', {name: '图层管理器', exact: true}).click();
        await panel.locator('[data-layer-id="container:Repro"]').waitFor({state: 'visible'});
        assert.match(await panel.locator('[data-layer-id="container:Repro"]').innerText(), /2 个图层/);
        assert.match(await panel.locator('[data-layer-id^="container:_container_clone_:"]').innerText(), /2 个图层/);
        await page.screenshot({path: '/tmp/blockdia-container-live-members.png'});
        await page.evaluate(() => vm.stopAll());
        assert.deepEqual(errors, []);
        console.log('PASS SB3 reload, folder rename, re-execution and stop cleanup; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
