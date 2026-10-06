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
        await page.addInitScript(() => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:addons', '{}');
        });
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8630/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.runtime.logger);
        const button = page.locator('[data-window-button$="debugger"]');
        await button.waitFor({state: 'visible'});
        assert.equal(await button.getAttribute('data-status'), 'closed', 'default enable does not open the window');
        const hidden = await page.evaluate(() => ['breakpoint', 'log', 'warn', 'error'].map(name => {
            const code = `\u200B\u200B${name}\u200B\u200B${name === 'breakpoint' ? '' : ' %s'}`;
            return vm.runtime.getAddonBlock(code)?.hidden;
        }));
        assert.deepEqual(hidden, [true, true, true, true]);
        assert.equal(await page.locator('.scratchCategoryId-a-b').count(), 0, 'no empty addon category');
        await page.evaluate(() => vm.extensionManager.loadExtensionIdSync('clones'));

        for (const enabled of [false, true]) {
            const result = await page.evaluate(compiler => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compiler});
                const runtime = vm.runtime;
                runtime.logger.clear();
                const source = runtime.targets.find(target => target.isOriginal && !target.isStage);
                source.blocks.deleteAllBlocks();
                source.blocks.createBlock({id: 'warning-block',
                    opcode: 'clones_createWithId',
                    inputs: {TARGET: {name: 'TARGET', block: 'self', shadow: 'self'},
                        ID: {name: 'ID', block: 'invalid', shadow: 'invalid'}},
                    fields: {},
                    topLevel: true,
                    shadow: false,
                    parent: null,
                    next: null,
                    x: 80,
                    y: 80});
                for (const [id, value] of [['self', '_myself_'], ['invalid', '123']]) {
                    source.blocks.createBlock({id,
                        opcode: 'text',
                        inputs: {},
                        fields: {TEXT: {name: 'TEXT', value}},
                        topLevel: false,
                        shadow: true,
                        parent: 'warning-block',
                        next: null});
                }
                vm.setEditingTarget(source.id);
                vm.emitWorkspaceUpdate();
                const clone = runtime.ext_scratch3_control._createClone('_myself_', source, {cloneId: 'caller'});
                let compiled;
                for (let i = 0; i < 3; i++) {
                    const thread = runtime._pushThread('warning-block', clone, {stackClick: true});
                    for (let step = 0; step < 8; step++) runtime._step();
                    compiled = Boolean(thread.isCompiled);
                }
                runtime.disposeTarget(clone);
                vm.setEditingTarget(runtime.getTargetForStage().id);
                return {compiled, sourceId: source.id, entries: runtime.logger.getEntries()};
            }, enabled);
            assert.equal(result.compiled, enabled);
            assert.equal(result.entries.length, 1, JSON.stringify(result));
            assert.equal(result.entries[0].count, 3);
            assert.equal(result.entries[0].blockId, 'warning-block');
            assert.equal(result.entries[0].publicId, '@clone:caller');
            assert.match(result.entries[0].message, /无法创建克隆体/);
            await page.waitForFunction(() =>
                document.querySelector('[data-window-button$="debugger"]').dataset.unread === 'true');
            assert.equal(await button.getAttribute('data-status'), 'closed', 'warnings do not open the window');
            await button.click();
            const row = page.locator('.sa-debugger-log[data-code="INVALID_CLONE_ID"]');
            await row.waitFor({state: 'visible'});
            assert.equal(await row.getAttribute('data-type'), 'warn');
            assert.equal(await row.locator('.sa-debugger-log-repeats').textContent(), '3');
            assert.match(await row.locator('.sa-debugger-log-link').textContent(), /@clone:caller/);
            const linkBounds = await row.locator('.sa-debugger-log-link').boundingBox();
            const rowBounds = await row.boundingBox();
            assert.ok(linkBounds.height <= rowBounds.height, 'clone label stays inside the fixed-height log row');
            await row.locator('.sa-debugger-log-link').click();
            await page.waitForFunction(id => vm.editingTarget.id === id, result.sourceId);
            const dialog = page.locator('[data-editor-window$="debugger"]');
            // Clicking the block link keeps the source available even after its clone was deleted.
            await dialog.getByRole('button', {name: '关闭', exact: true}).click();
            assert.equal(await page.evaluate(() => vm.runtime.logger.getEntries()[0].count), 3);
            await button.click();
            await row.waitFor({state: 'visible'});
            if (enabled) await page.screenshot({path: '/tmp/blockdia-runtime-logs.png'});
            const downloadPromise = page.waitForEvent('download');
            await dialog.getByRole('button', {name: '导出', exact: true}).click();
            const download = await downloadPromise;
            const chunks = [];
            for await (const chunk of await download.createReadStream()) chunks.push(chunk);
            const exported = Buffer.concat(chunks).toString('utf8');
            assert.match(exported, /无法创建克隆体/);
            assert.match(exported, /×3/);
            assert.equal(exported.trim().split('\n').length, 1, 'exports keep repeat counts compact');
            await dialog.getByRole('button', {name: '清除', exact: true}).click();
            assert.equal(await page.evaluate(() => vm.runtime.logger.getEntries().length), 0);
            await row.waitFor({state: 'detached'});
            await dialog.getByRole('button', {name: '关闭', exact: true}).click();
            console.log(`PASS compiler=${enabled}: warning/count/unread, deleted-clone navigation, window lifecycle`);
        }

        await page.evaluate(() => {
            const logger = vm.runtime.logger;
            const target = vm.runtime.targets.find(member => member.isOriginal && !member.isStage);
            vm.setEditingTarget(vm.runtime.getTargetForStage().id);
            const oldLimit = vm.runtime.runtimeOptions.maxClones;
            vm.runtime.runtimeOptions.maxClones = 0;
            vm.runtime.getOpcodeFunction('clones_createWithId')({TARGET: '_myself_', ID: 'boss'}, {target});
            vm.runtime.runtimeOptions.maxClones = oldLimit;
            const failure = logger.getEntries();
            if (failure.length !== 1 || failure[0].code !== 'CLONE_LIMIT' || failure[0].count !== 1) {
                throw new Error('clone limit must produce one diagnostic, including with debugger enabled');
            }
            logger.clear();
            for (const enabled of [false, true]) {
                vm.setCompilerOptions({enabled});
                for (const level of ['log', 'warn', 'error']) {
                    const id = `legacy-${enabled}-${level}`;
                    const inputId = `${id}-text`;
                    target.blocks.createBlock({id,
                        opcode: 'procedures_call',
                        inputs: {arg0: {name: 'arg0', block: inputId, shadow: inputId}},
                        fields: {},
                        mutation: {tagName: 'mutation',
                            children: [],
                            proccode: `\u200B\u200B${level}\u200B\u200B %s`,
                            argumentids: '["arg0"]',
                            warp: 'false'},
                        parent: null,
                        next: null,
                        topLevel: true,
                        shadow: false});
                    target.blocks.createBlock({id: inputId,
                        opcode: 'text',
                        inputs: {},
                        fields: {TEXT: {name: 'TEXT', value: id}},
                        parent: id,
                        next: null,
                        topLevel: false,
                        shadow: true});
                    const thread = vm.runtime._pushThread(id, target, {stackClick: true});
                    for (let step = 0; step < 8; step++) vm.runtime._step();
                    if (Boolean(thread.isCompiled) !== enabled) throw new Error('unexpected legacy execution mode');
                }
            }
            const entries = logger.getEntries();
            if (entries.length !== 6 || entries.some(entry => entry.source !== 'script' ||
                entry.blockId !== entry.message)) {
                throw new Error('hidden debugger blocks lost their execution context');
            }
            logger.clear();
            logger.log('plain');
            logger.info('info');
            logger.warn('warning');
            logger.error('error');
            for (let i = 0; i < 5000; i++) logger.warn('loop', {source: 'clones', code: 'LOOP'});
        });
        await button.click();
        await page.locator('.sa-debugger-log[data-code="LOOP"]').waitFor({state: 'visible'});
        assert.equal(await page.locator('.sa-debugger-log[data-code="LOOP"] .sa-debugger-log-repeats')
            .textContent(), '5000');
        assert.deepEqual(await page.locator('.sa-debugger-log[data-source]').evaluateAll(rows =>
            rows.map(row => row.dataset.type)), ['log', 'info', 'warn', 'error', 'warn']);
        await page.evaluate(() => vm.greenFlag());
        assert.equal(await page.evaluate(() => vm.runtime.logger.getEntries().length), 5,
            'green flag keeps logs with the default setting');
        await page.evaluate(() => vm.clear());
        await page.waitForFunction(() => document.querySelectorAll('.sa-debugger-log[data-source]').length === 0);
        assert.deepEqual(errors, []);
        console.log('PASS legacy blocks, all levels, 5000-repeat stress, green flag retention and project clear');

        for (const debuggerEnabled of [false, true]) {
            const other = await browser.newPage();
            other.on('pageerror', error => errors.push(error.message));
            await other.addInitScript(enabled => {
                localStorage.setItem('tw:addons', JSON.stringify({debugger: {
                    enabled, log_clear_greenflag: true, log_greenflag: false
                }}));
            }, debuggerEnabled);
            await other.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8630/editor.html');
            await other.waitForFunction(() => window.vm && vm.editingTarget && vm.runtime.logger);
            if (debuggerEnabled) await other.locator('[data-window-button$="debugger"]').waitFor();
            const count = await other.evaluate(() => {
                vm.runtime.logger.warn('before flag');
                vm.greenFlag();
                return vm.runtime.logger.getEntries().length;
            });
            assert.equal(count, debuggerEnabled ? 0 : 1);
            await other.close();
        }
        const palettePage = await browser.newPage();
        palettePage.on('pageerror', error => errors.push(error.message));
        await palettePage.addInitScript(() => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:addons', JSON.stringify({debugger: {show_blocks: true}}));
        });
        await palettePage.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8630/editor.html');
        await palettePage.locator('.scratchCategoryId-a-b').waitFor();
        await palettePage.locator('.scratchCategoryId-a-b').click();
        const visibleProcedures = await palettePage.evaluate(() => {
            const workspace = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace();
            return workspace.getAllBlocks().filter(block => block.type === 'procedures_call')
                .map(block => block.getProcCode());
        });
        for (const name of ['breakpoint', 'log', 'warn', 'error']) {
            const code = `\u200B\u200B${name}\u200B\u200B${name === 'breakpoint' ? '' : ' %s'}`;
            assert.ok(visibleProcedures.includes(code));
        }
        await palettePage.waitForFunction(() => {
            const blocks = (window.Blockly || window.ScratchBlocks).getMainWorkspace().getFlyout()
                .getWorkspace()
                .getAllBlocks()
                .filter(block => block.type === 'procedures_call');
            return blocks.length === 4 && blocks.every(block => {
                const bounds = block.getSvgRoot().getBoundingClientRect();
                return bounds.top >= 100 && bounds.bottom < window.innerHeight - 60;
            });
        });
        await palettePage.screenshot({path: '/tmp/blockdia-debugger-blocks-visible.png'});
        await palettePage.close();
        assert.deepEqual(errors, []);
        console.log('PASS default enable/hidden blocks, opt-in palette, clear-on-flag, no-debugger; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
