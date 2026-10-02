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
        await page.addInitScript(() => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:addons', JSON.stringify({'layer-manager': {enabled: true}}));
        });
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8618/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.evaluate(async () => {
            const first = vm.editingTarget;
            vm.renameSprite(first.id, 'World//Back');
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'World//Nested//Front');
            await vm.addComponent('slider', 'World//Nested//Slider');
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'World');
            vm.setSpriteFolderContainer('World', true);
            vm.setSpriteFolderContainer('World//Nested', true);
            const create = (target, id, opcode, parent, next, inputs = {}, fields = {}, shadow = false) =>
                target.blocks.createBlock({id,
                    opcode,
                    parent,
                    next,
                    inputs: Object.fromEntries(Object.entries(inputs).map(([name, block]) =>
                        [name, {name, block, shadow: block}])),
                    fields: Object.fromEntries(Object.entries(fields).map(([name, value]) =>
                        [name, {name, value, ...(name === 'VARIABLE' ? {id: value} : {})}])),
                    shadow,
                    topLevel: parent === null,
                    x: 40,
                    y: 40});
            for (const target of vm.runtime.targets) {
                create(target, 'native-clone', 'control_create_clone_of', null, null, {CLONE_OPTION: 'native-menu'});
                create(target, 'native-menu', 'control_create_clone_of_menu', 'native-clone', null, {},
                    {CLONE_OPTION: 'World'}, true);
                create(target, 'group-clone', 'containers_createClone', null, null, {CONTAINER: 'group-menu'});
                create(target, 'group-menu', 'containers_menu_containers', 'group-clone', null, {},
                    {containers: '_mycontainer_'}, true);
                target.blocks.getBlock('group-clone').y = 160;
                create(target, 'named-show', 'containers_show', null, null, {CONTAINER: 'named-menu'});
                create(target, 'named-menu', 'containers_menu_containers', 'named-show', null, {},
                    {containers: 'World'}, true);
                target.blocks.getBlock('named-show').y = 420;
                if (target.isStage) continue;
                target.setXY(-130, 40);
                target.goToFront();
                if (target.getName() === 'World') continue;
                target.createVariable('local', 'local', '');
                target.variables.local.value = 10;
                create(target, 'hat', 'control_start_as_clone', null, 'change');
                create(target, 'change', 'data_changevariableby', 'hat', 'move', {VALUE: 'one'}, {VARIABLE: 'local'});
                create(target, 'one', 'math_number', 'change', null, {}, {NUM: 1}, true);
                create(target, 'move', 'motion_changexby', 'change', null, {DX: 'offset'});
                create(target, 'offset', 'math_number', 'move', null, {}, {NUM: 80}, true);
                target.blocks.getBlock('hat').y = 280;
            }
            vm.setEditingTarget(first.id);
            vm.emitWorkspaceUpdate();
        });
        // Native clone menus contain only sprites and "myself", even with active containers.
        for (const name of ['World//Back', 'World//Nested//Front', 'World', 'Stage']) {
            const menus = await page.evaluate(targetName => {
                const target = targetName === 'Stage' ? vm.runtime.getTargetForStage() :
                    vm.runtime.getSpriteTargetByName(targetName);
                vm.setEditingTarget(target.id);
                const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
                const field = workspace.getBlockById('group-menu').getField('containers');
                const named = workspace.getBlockById('named-menu').getField('containers');
                return {native: workspace.getBlockById('native-menu').getField('CLONE_OPTION')
                    .getOptions(),
                group: field.getOptions(),
                groupLabel: field.getText(),
                groupValue: field.getValue(),
                namedLabel: named.getText(),
                namedValue: named.getValue()};
            }, name);
            const menu = menus.native;
            assert(!menu.some(([, value]) => value === '_mycontainer_' || value.startsWith('_container_:')));
            assert.equal(menu.some(([, value]) => value === '_myself_'), name !== 'Stage');
            assert.equal(menu.some(([, value]) => value === 'World'), name !== 'World');
            assert.equal(menus.groupValue, '_mycontainer_', 'sharing preserves a relative container selection');
            assert.equal(menus.groupLabel, '所在容器', 'a shared relative selection keeps its localized label');
            const current = name === 'World//Back' ? 'World' :
                (name === 'World//Nested//Front' ? 'World//Nested' : null);
            assert.deepEqual(menus.group.map(([, value]) => value), [
                ...(current ? ['_mycontainer_'] : []),
                ...['World', 'World//Nested'].filter(path => path !== current)
            ], 'relative selection replaces only the current container name');
            assert.equal(menus.namedValue, 'World', 'sharing a named selection into itself preserves its value');
            assert.equal(menus.namedLabel, 'World', 'plain path selections retain readable labels');
        }
        console.log('PASS native clone menus contain only sprite selections');
        for (const enabled of [false, true]) {
            const result = await page.evaluate(compilerEnabled => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compilerEnabled});
                const runtime = vm.runtime;
                const containers = runtime.spriteContainers;
                const controller = runtime.getTargetForStage();
                vm.setEditingTarget(controller.id);
                const run = (target, blockId) => {
                    const thread = runtime._pushThread(blockId, target, {stackClick: true});
                    for (let i = 0; i < 8; i++) runtime._step();
                    return Boolean(thread.isCompiled);
                };
                const nativeCompiled = run(controller, 'native-clone');
                const native = runtime.targets.filter(target => !target.isOriginal);
                const nativeNames = native.map(target => target.getName());
                const nativeInstances = containers.cloneDefinitions.size;
                vm.stopAll();
                const obsoleteCounts = [];
                for (const value of ['_mycontainer_', '_container_:World']) {
                    controller.blocks.changeBlock({element: 'field', id: 'native-menu', name: 'CLONE_OPTION', value});
                    run(controller, 'native-clone');
                    obsoleteCounts.push(runtime._cloneCounter);
                }
                controller.blocks.changeBlock({element: 'field',
                    id: 'native-menu',
                    name: 'CLONE_OPTION',
                    value: 'World'});
                controller.blocks.changeBlock({element: 'field',
                    id: 'group-menu',
                    name: 'containers',
                    value: 'World'});
                const groupCompiled = run(controller, 'group-clone');
                run(controller, 'group-clone');
                const clones = runtime.targets.filter(target => !target.isOriginal);
                const groups = [...new Set(clones.map(target => containers.getTargetContainers(target)[0].id))];
                const members = groups.map(id => clones.filter(target =>
                    containers.getTargetContainers(target)[0].id === id));
                const order = [...new Set(vm.renderer._drawList.map(id => runtime.getTargetByDrawableId(id)))]
                    .filter(target => target && !target.isStage);
                const groupOrder = order.map(target => containers.getTargetContainers(target)[0]?.id || 'outside');
                const componentParts = clones.filter(target => target.component)
                    .every(target => target.getDrawableIDs().length === 3 && target.componentController);
                const stateCopied = clones.every(target => target.variables.local.value === 11 && target.x === -50);
                const source = members[0].find(target => target.getName() === 'World//Nested//Front');
                const nestedID = containers.getContainingContainer(source).id;
                const currentMembers = clones.filter(target =>
                    containers.getContainingContainer(target).id === nestedID);
                for (const target of currentMembers) {
                    target.variables.local.value = 30;
                    if (target.componentController) target.componentController.setProperties({value: 68});
                }
                const before = new Set(runtime.targets);
                const relativeCompiled = run(source, 'group-clone');
                const copies = runtime.targets.filter(target => !before.has(target));
                const relativeState = copies.length === 2 && copies.every(target =>
                    target.variables.local.value === 31 && target.x === 30 &&
                    containers.getTargetContainers(target)[0].id === groups[0] &&
                    containers.getContainingContainer(target).id !== nestedID &&
                    (!target.component || target.component.properties.value === 68));
                return {nativeCompiled,
                    groupCompiled,
                    relativeCompiled,
                    nativeNames,
                    nativeInstances,
                    obsoleteCounts,
                    groups,
                    groupOrder,
                    componentParts,
                    stateCopied,
                    relativeState,
                    sizes: members.map(group => group.length)};
            }, enabled);
            for (const key of ['nativeCompiled', 'groupCompiled', 'relativeCompiled']) {
                assert.equal(result[key], enabled);
            }
            assert.deepEqual(result.nativeNames, ['World'], 'same-named sprite never selects its container');
            assert.equal(result.nativeInstances, 0);
            assert.deepEqual(result.obsoleteCounts, [0, 0], 'native clone never interprets obsolete container markers');
            assert.deepEqual(result.sizes, [3, 3]);
            // The later clone is immediately behind its source, after the earlier clone.
            assert.deepEqual(result.groupOrder, [
                ...Array(3).fill(result.groups[0]), ...Array(3).fill(result.groups[1]),
                ...Array(3).fill('World'), 'outside'
            ]);
            assert(result.componentParts && result.stateCopied && result.relativeState);
            console.log('PASS', enabled ? 'compiler' : 'interpreter',
                'sprite/group separation, component copies and layers');
        }
        await page.getByRole('button', {name: '图层管理器', exact: true}).click();
        const panel = page.locator('[data-editor-window="layer-manager/layers"]');
        await panel.waitFor({state: 'visible'});
        await page.waitForFunction(() => document.querySelectorAll(
            '[data-layer-id^="container:_container_clone_:"]').length === 5);
        await page.screenshot({path: '/tmp/blockdia-container-clones.png'});
        await page.evaluate(() => vm.stopAll());
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.cloneDefinitions.size), 0);
        assert.deepEqual(errors, []);
        console.log('PASS layer tree and stop cleanup; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
