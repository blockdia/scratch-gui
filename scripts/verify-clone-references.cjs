/* eslint-env browser */
/* global vm */
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
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8628/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.getByRole('button', {name: '图层管理器', exact: true}).waitFor({state: 'visible'});
        await page.evaluate(() => vm.extensionManager.loadExtensionIdSync('clones'));
        await page.locator('.scratchCategoryId-clones').click();
        const palette = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace();
            return workspace.getAllBlocks().map(block => block.toString())
                .join('\n');
        });
        assert.match(palette, /我的 ID/);
        assert.match(palette, /刚创建的克隆 ID/);
        assert.doesNotMatch(palette, /并返回 ID/);
        assert.match(palette, /以 ID @clone: boss 克隆 自己/);
        assert.match(palette, /本体的 ID/);
        assert.match(palette, /@clone: boss/);
        assert.match(palette, /我是克隆体/);
        assert.match(palette, /ID @clone:boss 存在/);
        const readMenus = () => page.evaluate(() => {
            const blocks = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace()
                .getAllBlocks();
            const native = blocks.find(block => block.type === 'control_create_clone_of_menu').getField('CLONE_OPTION');
            const creation = blocks.find(block => block.type === 'clones_createWithId')
                .getInputTargetBlock('TARGET')
                .getField('targets');
            const originals = blocks.find(block => block.type === 'clones_targetId')
                .getInputTargetBlock('TARGET')
                .getField('originalTargets');
            return {native: native.getOptions(), creation: creation.getOptions(), originals: originals.getOptions()};
        });
        let menus = await readMenus();
        assert.deepEqual(menus.creation, menus.native);
        assert.deepEqual(menus.creation.map(item => item[1]), ['_myself_']);
        assert(!menus.originals.some(item => item[1] === '_myself_'));
        const originalMenuName = await page.evaluate(() => vm.editingTarget.getName());
        const expectedOriginalId = `@sprite:${originalMenuName}`;
        assert.deepEqual(menus.originals.map(item => item[1]), [originalMenuName]);
        const menuFixture = await page.evaluate(async () => {
            const original = vm.editingTarget.id;
            await vm.duplicateSprite(original);
            return {original, duplicate: vm.editingTarget.id, duplicateName: vm.editingTarget.getName()};
        });
        menus = await readMenus();
        assert.deepEqual(menus.creation, menus.native);
        assert.deepEqual(menus.creation.map(item => item[1]), ['_myself_', originalMenuName]);
        assert.deepEqual(menus.originals.map(item => item[1]), [originalMenuName, menuFixture.duplicateName]);
        await page.evaluate(() => vm.setEditingTarget(vm.runtime.getTargetForStage().id));
        menus = await readMenus();
        assert.deepEqual(menus.creation, menus.native);
        assert.deepEqual(menus.creation.map(item => item[1]), [originalMenuName, menuFixture.duplicateName]);
        await page.waitForFunction(() => {
            const blocks = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace()
                .getAllBlocks();
            const create = blocks.find(block => block.type === 'clones_createWithId');
            return create && create.getInputTargetBlock('TARGET').getField('targets')
                .getValue() !== '_myself_';
        });
        await page.evaluate(({original, duplicate}) => {
            vm.deleteSprite(duplicate);
            vm.setEditingTarget(original);
        }, menuFixture);
        await page.waitForFunction(() => {
            const blocks = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace()
                .getAllBlocks();
            const create = blocks.find(block => block.type === 'clones_createWithId');
            return create && create.getInputTargetBlock('TARGET').getField('targets')
                .getValue() === '_myself_';
        });
        await page.locator('.scratchCategoryId-clones').click();
        console.log('PASS native clone menu parity, explicit original menu and stage default');
        for (const enabled of [false, true]) {
            const result = await page.evaluate(compiler => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compiler});
                const runtime = vm.runtime;
                const source = vm.editingTarget;
                vm.setEditingTarget(runtime.getTargetForStage().id);
                source.setXY(0, 0);
                source.blocks.deleteAllBlocks();
                for (const name of ['ref', 'result', 'seen', 'health', 'kind']) source.createVariable(name, name, '');
                source.variables.health.value = 73;
                const blocks = source.blocks;
                const add = (id, opcode, inputs = {}, fields = {}, parent = null, next = null, mutation = null) => {
                    blocks.createBlock({id,
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
                const text = (id, value, parent) => add(id, 'text', {}, {TEXT: value}, parent);
                const set = (id, value, name = 'result') =>
                    add(id, 'data_setvariableto', {VALUE: value}, {VARIABLE: name});
                const run = (id, target = source) => {
                    const thread = runtime._pushThread(id, target, {stackClick: true});
                    for (let i = 0; i < 8; i++) runtime._step();
                    return Boolean(thread.isCompiled);
                };
                add('hat', 'control_start_as_clone', {}, {}, null, 'save-seen');
                add('save-seen', 'data_setvariableto', {VALUE: 'read-id'}, {VARIABLE: 'seen'}, 'hat', 'save-kind');
                add('save-kind', 'data_setvariableto', {VALUE: 'read-clone-kind'}, {VARIABLE: 'kind'}, 'save-seen');
                add('read-clone-kind', 'clones_isClone', {}, {}, 'save-kind');
                add('read-id', 'clones_id', {}, {}, 'save-seen');
                add('create', 'clones_createWithId', {TARGET: 'self', ID: 'custom'}, {}, null, 'save-created');
                add('save-created', 'data_setvariableto', {VALUE: 'read-created'}, {VARIABLE: 'ref'}, 'create');
                add('read-created', 'clones_lastId', {}, {}, 'save-created');
                text('self', '_myself_', 'create');
                text('custom', 'boss', 'create');
                const compiled = run('create');
                const reference = source.variables.ref.value;
                const clone = runtime.resolveTargetReference(reference);
                if (!clone) {
                    throw new Error(JSON.stringify({reference,
                        compiled,
                        source: source.getName(),
                        targets: runtime.targets.map(target => [target.getName(), target.publicId]),
                        primitive: Boolean(runtime.getOpcodeFunction('clones_createWithId')),
                        threads: runtime.threads.map(thread => ({status: thread.status, stack: thread.stack}))}));
                }
                const createdCount = runtime._cloneCounter;
                const originalId = source.publicId;
                set('original-id', 'my-id');
                add('my-id', 'clones_id', {}, {}, 'original-id');
                run('original-id');
                const selfId = source.variables.result.value;
                set('original-kind', 'read-original-kind', 'kind');
                add('read-original-kind', 'clones_isClone', {}, {}, 'original-kind');
                run('original-kind');
                const originalIsClone = source.variables.kind.value;
                const cloneIsClone = clone.variables.kind.value;
                set('named-id', 'target-id');
                add('target-id', 'clones_targetId', {TARGET: 'named-target'}, {}, 'named-id');
                text('named-target', source.getName(), 'target-id');
                run('named-id', clone);
                const namedId = clone.variables.result.value;
                set('parent-id', 'parent-query');
                add('parent-query', 'clones_targetId', {TARGET: 'parent-ref'}, {}, 'parent-id');
                text('parent-ref', reference, 'parent-query');
                run('parent-id');
                const originalFromCloneId = source.variables.result.value;
                set('exists-original', 'exists-value');
                add('exists-value', 'clones_exists', {ID: 'exists-ref'}, {}, 'exists-original');
                text('exists-ref', originalId, 'exists-value');
                run('exists-original');
                const originalExists = source.variables.result.value;
                add('delete-original', 'clones_delete', {ID: 'delete-original-ref'});
                text('delete-original-ref', originalId, 'delete-original');
                run('delete-original');
                const originalProtected = runtime.resolveTargetReference(originalId) === source;

                // Exercise actual drawable collision in both interpreters, using separated original/clone positions.
                const probe = runtime.ext_scratch3_control._createClone('_myself_', source, {startHats: false});
                source.setXY(-150, 0);
                clone.setXY(150, 0);
                const collisionAt = x => {
                    probe.setXY(x, 0);
                    return [source.getName(), originalId, reference].map((targetRef, index) => {
                        const assignment = `collision-${index}`;
                        if (!blocks.getBlock(assignment)) {
                            set(assignment, `touch-${index}`);
                            add(`touch-${index}`, 'sensing_touchingobject',
                                {TOUCHINGOBJECTMENU: `touch-ref-${index}`}, {}, assignment);
                            text(`touch-ref-${index}`, targetRef, `touch-${index}`);
                        }
                        run(assignment, probe);
                        return probe.variables.result.value;
                    });
                };
                const collisionAtClone = collisionAt(150);
                const collisionAtOriginal = collisionAt(-150);
                runtime.disposeTarget(probe);
                set('original-property', 'original-x');
                add('original-x', 'sensing_of', {OBJECT: 'original-ref'},
                    {PROPERTY: 'x position'}, 'original-property');
                text('original-ref', originalId, 'original-x');
                run('original-property');
                const originalX = source.variables.result.value;
                source.setXY(0, 0);
                clone.setXY(30, 40);
                const hatId = clone.variables.seen.value;
                set('dynamic', 'property');
                add('property', 'sensing_of', {OBJECT: 'ref-value'}, {PROPERTY: 'health'}, 'dynamic');
                add('ref-value', 'data_variable', {}, {VARIABLE: 'ref'}, 'property');
                run('dynamic');
                const dynamic = source.variables.result.value;
                set('constant', 'constant-property');
                add('constant-property', 'sensing_of', {OBJECT: 'constant-ref'}, {PROPERTY: 'x position'}, 'constant');
                text('constant-ref', reference, 'constant-property');
                run('constant');
                const constant = source.variables.result.value;
                set('constructed', 'constructed-property');
                add('constructed-property', 'sensing_of', {OBJECT: 'constructed-ref'},
                    {PROPERTY: 'x position'}, 'constructed');
                add('constructed-ref', 'clones_cloneId', {ID: 'constructed-suffix'}, {}, 'constructed-property');
                text('constructed-suffix', 'boss', 'constructed-ref');
                const lastIdBeforeConstruction = runtime.lastCloneId;
                const cloneCountBeforeConstruction = runtime._cloneCounter;
                run('constructed');
                const constructed = source.variables.result.value;
                const constructionIsPure = runtime.lastCloneId === lastIdBeforeConstruction &&
                    runtime._cloneCounter === cloneCountBeforeConstruction;
                set('distance', 'distance-value');
                add('distance-value', 'sensing_distanceto', {DISTANCETOMENU: 'distance-ref'}, {}, 'distance');
                text('distance-ref', reference, 'distance-value');
                run('distance');
                const distance = source.variables.result.value;
                add('go', 'motion_goto', {TO: 'go-ref'});
                text('go-ref', reference, 'go');
                run('go');
                const position = [source.x, source.y];
                run('create');
                const duplicateResult = source.variables.ref.value;
                runtime.disposeTarget(clone);
                run('constant');
                const deletedResult = source.variables.result.value;
                run('create');
                const replacement = runtime.resolveTargetReference(reference);
                replacement.setXY(70, 80);
                run('constant');
                const reboundResult = source.variables.result.value;

                const mutation = {tagName: 'mutation',
                    children: [],
                    proccode: 'spawn enemy',
                    argumentids: '[]',
                    argumentnames: '[]',
                    argumentdefaults: '[]',
                    warp: 'false'};
                add('definition', 'procedures_definition', {custom_block: 'prototype'}, {}, null, 'procedure-create');
                add('prototype', 'procedures_prototype', {}, {}, 'definition', null, mutation);
                add('procedure-create', 'clones_createWithId', {TARGET: 'procedure-self', ID: 'procedure-id'},
                    {}, 'definition');
                text('procedure-self', '_myself_', 'procedure-create');
                text('procedure-id', 'procedure-boss', 'procedure-create');
                add('call-procedure', 'procedures_call', {}, {}, null, 'save-procedure', mutation);
                add('save-procedure', 'data_setvariableto', {VALUE: 'procedure-last'},
                    {VARIABLE: 'result'}, 'call-procedure');
                add('procedure-last', 'clones_lastId', {}, {}, 'save-procedure');
                run('call-procedure');
                const procedureResult = source.variables.result.value;
                set('global-read', 'global-value');
                add('global-value', 'clones_lastId', {}, {}, 'global-read');
                run('global-read', replacement);
                const crossTargetResult = replacement.variables.result.value;

                add('native-create', 'control_create_clone_of', {CLONE_OPTION: 'native-self'}, {}, null, 'save-native');
                text('native-self', '_myself_', 'native-create');
                add('save-native', 'data_setvariableto', {VALUE: 'native-last'}, {VARIABLE: 'result'}, 'native-create');
                add('native-last', 'clones_lastId', {}, {}, 'save-native');
                run('native-create');
                const nativeResult = source.variables.result.value;
                const nativeRegistered = runtime.resolveTargetReference(nativeResult) !== null;
                add('invalid-create', 'clones_createWithId', {TARGET: 'invalid-self', ID: 'invalid-id'},
                    {}, null, 'save-invalid');
                text('invalid-self', '_myself_', 'invalid-create');
                text('invalid-id', '@clone:invalid', 'invalid-create');
                add('save-invalid', 'data_setvariableto', {VALUE: 'invalid-last'},
                    {VARIABLE: 'result'}, 'invalid-create');
                add('invalid-last', 'clones_lastId', {}, {}, 'save-invalid');
                run('invalid-create');
                const invalidResult = source.variables.result.value;
                const invalidRegistered = runtime.resolveTargetReference(invalidResult) !== null;
                // Restore one clone for the UI example without losing the runtime assertions above.
                for (const target of runtime.targets.slice()) if (!target.isOriginal) runtime.disposeTarget(target);
                run('create');
                vm.setEditingTarget(source.id);
                vm.emitWorkspaceUpdate();
                return {compiled,
                    reference,
                    originalId,
                    selfId,
                    namedId,
                    originalFromCloneId,
                    originalIsClone,
                    cloneIsClone,
                    originalExists,
                    originalProtected,
                    originalX,
                    collisionAtClone,
                    collisionAtOriginal,
                    createdCount,
                    hatId,
                    dynamic,
                    constant,
                    constructed,
                    constructionIsPure,
                    distance,
                    position,
                    duplicateResult,
                    deletedResult,
                    reboundResult,
                    procedureResult,
                    crossTargetResult,
                    nativeAutomatic: /^@clone:\d+$/.test(nativeResult) && nativeRegistered,
                    invalidAutomatic: /^@clone:\d+$/.test(invalidResult) && invalidRegistered};
            }, enabled);
            assert.deepEqual(result, {compiled: enabled,
                reference: '@clone:boss',
                originalId: expectedOriginalId,
                selfId: expectedOriginalId,
                namedId: expectedOriginalId,
                originalFromCloneId: expectedOriginalId,
                originalIsClone: false,
                cloneIsClone: true,
                originalExists: true,
                originalProtected: true,
                originalX: -150,
                collisionAtClone: [true, false, true],
                collisionAtOriginal: [true, true, false],
                createdCount: 1,
                hatId: '@clone:boss',
                dynamic: 73,
                constant: 30,
                constructed: 30,
                constructionIsPure: true,
                distance: 50,
                position: [30, 40],
                duplicateResult: '',
                deletedResult: 0,
                reboundResult: 70,
                procedureResult: '@clone:procedure-boss',
                crossTargetResult: '@clone:procedure-boss',
                nativeAutomatic: true,
                invalidAutomatic: true});
            console.log('PASS', enabled ? 'compiler' : 'interpreter',
                'global ID, stack creation, custom procedures, native clones, invalid IDs and exact target slots');
        }
        await page.waitForFunction(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            return Boolean(workspace.getBlockById('property'));
        });
        const options = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            return workspace.getBlockById('property').getField('PROPERTY')
                .getOptions()
                .map(item => item[1]);
        });
        for (const property of ['x position', 'y position', 'size', 'costume #', 'backdrop #', 'health']) {
            assert(options.includes(property), `dynamic target property ${property} is available`);
        }
        await page.evaluate(() => {
            const Blockly = window.Blockly || window.ScratchBlocks;
            const workspace = Blockly.getMainWorkspace();
            workspace.clear();
            const xml = `<xml>
                <block type="clones_createWithId" id="clone-demo-create" x="35" y="40">
                    <value name="TARGET"><shadow type="clones_menu_targets">
                        <field name="targets">_myself_</field></shadow></value>
                    <value name="ID"><shadow type="text"><field name="TEXT">boss</field></shadow></value>
                    <next><block type="data_setvariableto">
                        <field name="VARIABLE" id="ref">ref</field>
                        <value name="VALUE"><block type="clones_lastId"/></value>
                    </block></next>
                </block>
                <block type="clones_lastId" id="clone-demo-last" x="330" y="210"/>
                <block type="sensing_of" id="clone-demo-property" x="35" y="130">
                    <field name="PROPERTY">x position</field>
                    <value name="OBJECT"><shadow type="sensing_of_object_menu">
                        <field name="OBJECT">_stage_</field></shadow>
                        <block type="data_variable"><field name="VARIABLE" id="ref">ref</field></block></value>
                </block>
                <block type="sensing_touchingobject" x="35" y="210">
                    <value name="TOUCHINGOBJECTMENU"><block type="clones_targetId" id="clone-demo-original">
                        <value name="TARGET"><shadow type="clones_menu_originalTargets">
                            <field name="originalTargets">${vm.editingTarget.getName()}</field></shadow></value>
                    </block></value>
                </block>
                <block type="clones_isClone" id="clone-demo-is-clone" x="330" y="280"/>
                <block type="clones_cloneId" id="clone-demo-id-string" x="330" y="340">
                    <value name="ID"><shadow type="text"><field name="TEXT">boss</field></shadow></value>
                </block>
                <block type="control_start_as_clone" x="35" y="290"><next>
                    <block type="looks_say"><value name="MESSAGE"><block type="clones_id"/></value></block>
                </next></block>
            </xml>`;
            Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(xml), workspace);
        });
        await page.waitForFunction(() => Boolean(vm.editingTarget.blocks.getBlock('clone-demo-property')));
        const propertyLabel = await page.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
            const field = workspace.getBlockById('clone-demo-property').getField('PROPERTY');
            field.setValue('y position');
            field.setValue('x position');
            return field.getText();
        });
        assert.equal(propertyLabel, 'x 坐标');
        for (const [blockId, menu, suffix] of [
            ['clone-demo-create', 'targets', 'creation-menu'],
            ['clone-demo-original', 'originalTargets', 'original-menu']
        ]) {
            const point = await page.evaluate(({id, fieldName}) => {
                const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
                const bounds = workspace.getBlockById(id).getInputTargetBlock('TARGET')
                    .getField(fieldName)
                    .getSvgRoot()
                    .getBoundingClientRect();
                return {x: bounds.x + (bounds.width / 2), y: bounds.y + (bounds.height / 2)};
            }, {id: blockId, fieldName: menu});
            await page.mouse.click(point.x, point.y);
            await page.waitForFunction(() => {
                const dropdown = document.querySelector('.blocklyDropDownDiv');
                return dropdown && getComputedStyle(dropdown).display !== 'none' &&
                    getComputedStyle(dropdown).opacity === '1';
            });
            await page.screenshot({path: `/tmp/blockdia-clone-${suffix}${
                process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => {
                const dropdown = document.querySelector('.blocklyDropDownDiv');
                return !dropdown || getComputedStyle(dropdown).display === 'none';
            });
        }
        const readManually = async (blockId = 'clone-demo-last') => {
            const point = await page.evaluate(id => {
                const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace();
                const block = workspace.getBlockById(id);
                const bounds = block.getSvgRoot().getBoundingClientRect();
                window.cloneIdReport = null;
                window.cloneIdReportBlock = id;
                if (!window.cloneIdReportListener) {
                    window.cloneIdReportListener = report => {
                        if (report.id === window.cloneIdReportBlock) window.cloneIdReport = report.value;
                    };
                    vm.runtime.on('VISUAL_REPORT', window.cloneIdReportListener);
                }
                return {x: bounds.x + 20, y: bounds.y + (bounds.height / 2)};
            }, blockId);
            await page.mouse.click(point.x, point.y);
            await page.waitForFunction(() => window.cloneIdReport === '@clone:boss');
        };
        await readManually();
        await readManually('clone-demo-id-string');
        const monitorPoint = await page.evaluate(() => {
            const flyout = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout();
            const block = flyout.getWorkspace().getAllBlocks()
                .find(item => item.type === 'clones_lastId');
            const bounds = flyout.checkboxes_[block.id].svgRoot.getBoundingClientRect();
            return {x: bounds.x + (bounds.width / 2), y: bounds.y + (bounds.height / 2)};
        });
        await page.mouse.click(monitorPoint.x, monitorPoint.y);
        await page.waitForFunction(() => {
            const monitor = vm.runtime.getMonitorState().valueSeq()
                .find(item => item.opcode === 'clones_lastId');
            return monitor && monitor.value === '@clone:boss' && monitor.targetId === null;
        });
        await page.getByRole('button', {name: '图层管理器', exact: true}).click();
        const panel = page.locator('[data-editor-window="layer-manager/layers"]');
        await panel.waitFor({state: 'visible'});
        await panel.locator('small[title="@clone:boss"]').click();
        await page.evaluate(() => {
            navigator.clipboard.writeText = value => {
                window.copiedCloneId = value;
                return Promise.resolve();
            };
        });
        await panel.getByRole('button', {name: '复制 ID', exact: true}).click();
        assert.equal(await page.evaluate(() => window.copiedCloneId), '@clone:boss');
        await panel.locator(`small[title="${expectedOriginalId}"]`).click();
        await panel.getByRole('button', {name: '复制 ID', exact: true}).click();
        assert.equal(await page.evaluate(() => window.copiedCloneId), expectedOriginalId);
        await page.screenshot({path: `/tmp/blockdia-clone-references${
            process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
        await page.evaluate(() => vm.stopAll());
        await readManually();
        console.log('PASS standalone reporter click, including after stopping all scripts');
        const renamed = await page.evaluate(() => {
            const source = vm.editingTarget;
            const oldId = source.publicId;
            const internalId = source.id;
            source.createVariable('saved-original', 'saved original ID', '');
            source.variables['saved-original'].value = oldId;
            vm.renameSprite(source.id, '关卡//敌人');
            const storedOldId = source.variables['saved-original'].value;
            source.variables['saved-original'].value = source.publicId;
            vm.emitWorkspaceUpdate();
            return {id: source.publicId,
                oldGone: vm.runtime.resolveTargetReference(oldId) === null,
                found: vm.runtime.resolveTargetReference(source.publicId) === source,
                sameInternalId: source.id === internalId,
                storedOldId};
        });
        assert.deepEqual(renamed, {id: '@sprite:关卡//敌人',
            oldGone: true,
            found: true,
            sameInternalId: true,
            storedOldId: expectedOriginalId});
        if (!await panel.isVisible()) {
            await page.getByRole('button', {name: '图层管理器', exact: true}).click();
        }
        await panel.locator('small[title="@sprite:关卡//敌人"]').waitFor({state: 'visible'});
        await panel.getByRole('button', {name: '复制 ID', exact: true}).click();
        assert.equal(await page.evaluate(() => window.copiedCloneId), '@sprite:关卡//敌人');
        await page.evaluate(async () => {
            const saved = await vm.saveProjectSb3();
            await vm.loadProject(await saved.arrayBuffer());
        });
        assert.deepEqual(await page.evaluate(() => ({
            clones: vm.runtime._cloneCounter,
            found: Boolean(vm.runtime.resolveTargetReference('@clone:boss')),
            loaded: vm.extensionManager.isExtensionLoaded('clones'),
            lastId: vm.runtime.lastCloneId,
            original: vm.editingTarget.publicId,
            foundOriginal: vm.runtime.resolveTargetReference(vm.editingTarget.publicId) === vm.editingTarget,
            savedOriginal: vm.editingTarget.variables['saved-original'].value,
            savedOriginalFound: vm.runtime.resolveTargetReference(
                vm.editingTarget.variables['saved-original'].value) === vm.editingTarget
        })), {clones: 0,
            found: false,
            loaded: true,
            lastId: '',
            original: '@sprite:关卡//敌人',
            foundOriginal: true,
            savedOriginal: '@sprite:关卡//敌人',
            savedOriginalFound: true});
        assert.deepEqual(errors, []);
        console.log('PASS dynamic property menu, layer ID/copy, SB3 cleanup; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
