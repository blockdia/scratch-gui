/* eslint-env browser */
/* global vm */
// Run against BLOCKDIA_LOCAL_PACKAGES=1; checks both VM execution modes and the actual editor UI.
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
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8629/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.evaluate(async () => {
            const body = vm.editingTarget;
            vm.renameSprite(body.id, 'Boss//Body');
            await vm.duplicateSprite(body.id);
            vm.renameSprite(vm.editingTarget.id, 'Boss//Weapon//Barrel');
            vm.setSpriteFolderContainer('Boss', true);
            vm.setSpriteFolderContainer('Boss//Weapon', true);
            vm.setEditingTarget(body.id);
        });
        await page.locator('.scratchCategoryId-containers').click();
        const palette = await page.evaluate(() => (window.Blockly || window.ScratchBlocks).getMainWorkspace()
            .getFlyout()
            .getWorkspace()
            .getAllBlocks()
            .map(block => block.toString())
            .join('\n'));
        for (const label of ['刚创建的容器克隆 ID', '父容器 ID', '本体 ID', '容器 ID @container-clone:boss 存在',
            '以 ID @container-clone: boss 克隆', '删除容器克隆 @container-clone:boss']) {
            assert(palette.includes(label), label);
        }
        for (const enabled of [false, true]) {
            const result = await page.evaluate(compiler => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compiler});
                const runtime = vm.runtime;
                const containers = runtime.spriteContainers;
                const body = runtime.getSpriteTargetByName('Boss//Body');
                const barrel = runtime.getSpriteTargetByName('Boss//Weapon//Barrel');
                const stage = runtime.getTargetForStage();
                vm.setEditingTarget(stage.id);
                for (const target of [body, barrel, stage]) {
                    target.blocks.deleteAllBlocks();
                    for (const name of ['ref', 'result', 'seen', 'parent', 'latest']) {
                        target.createVariable(name, name, '');
                    }
                }
                const add = (target, id, opcode, inputs = {}, fields = {}, parent = null, next = null, mutation) => {
                    target.blocks.createBlock({id,
                        opcode,
                        ...(mutation ? {mutation} : {}),
                        inputs: Object.fromEntries(Object.entries(inputs)
                            .map(([name, block]) => [name, {name, block, shadow: null}])),
                        fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name,
                            {name, value, ...(name === 'VARIABLE' ? {id: value, variableType: ''} : {})}])),
                        parent,
                        next,
                        topLevel: !parent,
                        shadow: false});
                };
                const text = (target, id, value, parent) => add(target, id, 'text', {}, {TEXT: value}, parent);
                const run = (id, target = stage) => {
                    // These graphs are built directly in the VM; do not glow unsynchronized Blockly blocks.
                    runtime.setEditingTarget(null);
                    const thread = runtime._pushThread(id, target, {stackClick: true});
                    for (let step = 0; step < 8; step++) runtime._step();
                    return Boolean(thread.isCompiled);
                };
                const query = (opcode, values, target = stage) => {
                    const id = `query-${opcode}-${Object.keys(target.blocks._blocks).length}`;
                    add(target, id, 'data_setvariableto', {VALUE: `${id}-report`}, {VARIABLE: 'result'});
                    add(target, `${id}-report`, opcode,
                        Object.fromEntries(Object.keys(values).map(key => [key, `${id}-${key}`])), {}, id);
                    for (const [key, value] of Object.entries(values)) {
                        text(target, `${id}-${key}`, value, `${id}-report`);
                    }
                    run(id, target);
                    return target.variables.result.value;
                };
                for (const target of [body, barrel]) {
                    add(target, 'hat', 'control_start_as_clone', {}, {}, null, 'save-self');
                    add(target, 'save-self', 'data_setvariableto', {VALUE: 'self-id'}, {VARIABLE: 'seen'},
                        'hat', 'save-parent');
                    add(target, 'self-id', 'containers_id', {CONTAINER: 'self'}, {}, 'save-self');
                    text(target, 'self', '_mycontainer_', 'self-id');
                    add(target, 'save-parent', 'data_setvariableto', {VALUE: 'parent-id'}, {VARIABLE: 'parent'},
                        'save-self', 'save-latest');
                    add(target, 'parent-id', 'containers_parentId', {CONTAINER: 'parent-self'}, {}, 'save-parent');
                    text(target, 'parent-self', '_mycontainer_', 'parent-id');
                    add(target, 'save-latest', 'data_setvariableto', {VALUE: 'last-id'},
                        {VARIABLE: 'latest'}, 'save-parent');
                    add(target, 'last-id', 'containers_lastId', {}, {}, 'save-latest');
                }
                const mutation = {tagName: 'mutation',
                    children: [],
                    proccode: 'spawn boss',
                    argumentids: '[]',
                    argumentnames: '[]',
                    argumentdefaults: '[]',
                    warp: 'false'};
                add(stage, 'definition', 'procedures_definition', {custom_block: 'prototype'}, {}, null, 'create');
                add(stage, 'prototype', 'procedures_prototype', {}, {}, 'definition', null, mutation);
                add(stage, 'create', 'containers_createWithId', {CONTAINER: 'original', ID: 'suffix'},
                    {}, 'definition');
                text(stage, 'original', '@container:Boss', 'create');
                text(stage, 'suffix', 'boss', 'create');
                add(stage, 'call', 'procedures_call', {}, {}, null, 'save-created', mutation);
                add(stage, 'save-created', 'data_setvariableto', {VALUE: 'created-id'}, {VARIABLE: 'ref'}, 'call');
                add(stage, 'created-id', 'containers_lastId', {}, {}, 'save-created');
                const compiled = run('call');
                const ref = stage.variables.ref.value;
                const clones = runtime.targets.filter(target => !target.isOriginal);
                const bodyClone = clones.find(target => target.sprite === body.sprite);
                const barrelClone = clones.find(target => target.sprite === barrel.sprite);
                if (!bodyClone || !barrelClone) throw new Error(`missing clones: ${ref}`);
                const childId = barrelClone.variables.seen.value;
                const hats = {body: bodyClone.variables.seen.value,
                    parent: barrelClone.variables.parent.value,
                    latest: barrelClone.variables.latest.value,
                    childRegistered: containers.resolveReference(childId) !== null};
                const original = query('containers_originalId', {CONTAINER: childId});
                add(stage, 'move', 'containers_goToXY', {CONTAINER: 'dynamic-ref', X: 'x', Y: 'y'});
                add(stage, 'dynamic-ref', 'data_variable', {}, {VARIABLE: 'ref'}, 'move');
                text(stage, 'x', '100', 'move');
                text(stage, 'y', '0', 'move');
                run('move');
                const x = query('containers_property', {CONTAINER: ref, PROPERTY: 'x'});
                const world = query('containers_convertPoint',
                    {FROM: childId, TO: '//', X: '5', Y: '0', COORDINATE: 'x'});
                const bodyWorld = bodyClone.getWorldPosition()[0] - bodyClone.x;
                const crossTarget = query('containers_lastId', {}, body);
                const exists = query('containers_exists', {ID: ref});
                const unknown = query('containers_property', {CONTAINER: '@container-clone:missing', PROPERTY: 'x'});
                const constructed = query('containers_cloneId', {ID: 'boss'});
                run('call');
                const duplicateResult = stage.variables.ref.value;
                const duplicateCount = runtime._cloneCounter;
                add(stage, 'delete', 'containers_deleteById', {ID: 'delete-ref'}, {}, null, 'after-delete');
                text(stage, 'delete-ref', ref, 'delete');
                add(stage, 'after-delete', 'data_setvariableto', {VALUE: 'continued'}, {VARIABLE: 'result'}, 'delete');
                text(stage, 'continued', 'continued', 'after-delete');
                run('delete');
                const continued = stage.variables.result.value;
                const deleted = !containers.resolveReference(ref) && !containers.resolveReference(childId) &&
                    runtime._cloneCounter === 0;
                run('call');
                vm.setEditingTarget(body.id);
                vm.emitWorkspaceUpdate();
                return {compiled,
                    ref,
                    hats,
                    original,
                    x,
                    world,
                    bodyWorld,
                    crossTarget,
                    exists,
                    unknown,
                    constructed,
                    duplicateResult,
                    duplicateCount,
                    continued,
                    deleted};
            }, enabled);
            assert.deepEqual(result, {compiled: enabled,
                ref: '@container-clone:boss',
                hats: {body: '@container-clone:boss',
                    parent: '@container-clone:boss',
                    latest: '@container-clone:boss',
                    childRegistered: true},
                original: '@container:Boss//Weapon',
                x: 100,
                world: 105,
                bodyWorld: 100,
                crossTarget: '@container-clone:boss',
                exists: true,
                unknown: 0,
                constructed: '@container-clone:boss',
                duplicateResult: '',
                duplicateCount: 2,
                continued: 'continued',
                deleted: true});
            console.log('PASS', enabled ? 'compiler' : 'interpreter',
                'custom procedure, clone hats, nested identity, frames, duplicate rollback and external deletion');
        }
        await page.evaluate(() => {
            const Blockly = window.Blockly || window.ScratchBlocks;
            const workspace = Blockly.getMainWorkspace();
            workspace.clear();
            Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(`<xml>
                <block type="containers_createWithId" x="30" y="35">
                    <value name="CONTAINER"><shadow type="containers_menu_containers">
                        <field name="containers">_mycontainer_</field></shadow></value>
                    <value name="ID"><shadow type="text"><field name="TEXT">boss</field></shadow></value>
                </block>
                <block type="containers_lastId" id="container-last" x="30" y="105"/>
                <block type="containers_id" x="30" y="175">
                    <value name="CONTAINER"><shadow type="containers_menu_containers">
                        <field name="containers">_mycontainer_</field></shadow></value>
                </block>
                <block type="containers_deleteById" x="30" y="245">
                    <value name="ID"><shadow type="text"><field name="TEXT">@container-clone:boss</field>
                    </shadow></value>
                </block>
            </xml>`), workspace);
        });
        await page.waitForFunction(() => Boolean(vm.editingTarget.blocks.getBlock('container-last')));
        const point = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const bounds = workspace.getBlockById('container-last').getSvgRoot()
                .getBoundingClientRect();
            window.containerReport = null;
            vm.runtime.on('VISUAL_REPORT', report => {
                if (report.id === 'container-last') window.containerReport = report.value;
            });
            return {x: bounds.x + 20, y: bounds.y + (bounds.height / 2)};
        });
        await page.mouse.click(point.x, point.y);
        await page.waitForFunction(() => window.containerReport === '@container-clone:boss');
        const monitorPoint = await page.evaluate(() => {
            const flyout = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout();
            const block = flyout.getWorkspace().getAllBlocks()
                .find(item => item.type === 'containers_lastId');
            flyout.scrollbar_.set((block.getRelativeToSurfaceXY().y * flyout.getWorkspace().scale) - 100);
            const bounds = flyout.checkboxes_[block.id].svgRoot.getBoundingClientRect();
            return {x: bounds.x + (bounds.width / 2), y: bounds.y + (bounds.height / 2)};
        });
        await page.mouse.click(monitorPoint.x, monitorPoint.y);
        await page.waitForFunction(() => {
            const monitor = vm.runtime.getMonitorState().valueSeq()
                .find(item => item.opcode === 'containers_lastId');
            return monitor && monitor.value === '@container-clone:boss' && monitor.targetId === null;
        });
        await page.getByRole('button', {name: '图层管理器', exact: true}).click();
        const panel = page.locator('[data-editor-window="layer-manager/layers"]');
        await panel.waitFor({state: 'visible'});
        await panel.locator('small[title="@container-clone:boss"]').click();
        await page.evaluate(() => {
            navigator.clipboard.writeText = value => {
                window.copiedContainerId = value;
                return Promise.resolve();
            };
        });
        await panel.getByRole('button', {name: '复制 ID', exact: true}).click();
        assert.equal(await page.evaluate(() => window.copiedContainerId), '@container-clone:boss');
        await panel.locator('small[title="@container:Boss"]').click();
        await panel.getByRole('button', {name: '复制 ID', exact: true}).click();
        assert.equal(await page.evaluate(() => window.copiedContainerId), '@container:Boss');
        await page.screenshot({path: `/tmp/blockdia-container-references${
            process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
        console.log('PASS Chinese palette, standalone reporter, global monitor, VM IDs in layer panel and copy ID');
        const roundtrip = await page.evaluate(async () => {
            const source = vm.runtime.getSpriteTargetByName('Boss//Body');
            source.createVariable('saved', 'saved container ID', '');
            source.variables.saved.value = '@container-clone:boss';
            const before = vm.runtime.spriteContainers.serialize();
            const blob = await vm.saveProjectSb3();
            await vm.loadProject(await blob.arrayBuffer());
            const containers = vm.runtime.spriteContainers;
            return {before,
                after: containers.serialize(),
                cloneCount: vm.runtime._cloneCounter,
                references: containers.cloneReferences.size,
                counter: containers.nextCloneId,
                last: vm.runtime.lastContainerCloneId,
                original: containers.resolveReference('@container:Boss'),
                saved: vm.runtime.getSpriteTargetByName('Boss//Body').variables.saved.value};
        });
        assert.deepEqual(roundtrip.after, roundtrip.before);
        assert.equal(roundtrip.cloneCount, 0);
        assert.equal(roundtrip.references, 0);
        assert.equal(roundtrip.counter, 1);
        assert.equal(roundtrip.last, '');
        assert.equal(roundtrip.original, 'Boss');
        assert.equal(roundtrip.saved, '@container-clone:boss');
        assert(!JSON.stringify(roundtrip.after).includes('@container'), 'public identities are not serialized');
        console.log('PASS SB3 round trip, original reconstruction and runtime-only IDs');
        console.log('PAGE_ERRORS', errors);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
