/* eslint-env browser */
/* global vm */
// Build with BLOCKDIA_LOCAL_PACKAGES=1; uses the same overrides as verify-runtime-logs.cjs.
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
            localStorage.setItem('tw:addons', JSON.stringify({'editor-compact': {enabled: compact}}));
        }, process.env.COMPONENTS_COMPACT === '1');
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8630/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.runtime.logger);
        if (process.env.COMPONENTS_SMALL_STAGE === '1') {
            await page.getByTitle(/Switch to small stage|小舞台/).first()
                .click();
        }
        await page.evaluate(() => vm.extensionManager.loadExtensionIdSync('stretch'));
        const button = page.locator('[data-window-button$="debugger"]');
        await button.waitFor({state: 'visible'});
        for (const enabled of [false, true]) {
            for (const container of [false, true]) {
                const result = await page.evaluate(({compiler, useContainer}) => {
                    vm.stopAll();
                    vm.setCompilerOptions({enabled: compiler});
                    const runtime = vm.runtime;
                    runtime.logger.clear();
                    const source = runtime.targets.find(target => target.isOriginal && !target.isStage);
                    vm.renameSprite(source.id, 'Perspective//Caller');
                    vm.setSpriteFolderContainer('Perspective', true);
                    const reference = useContainer ? '@container:Perspective' : '_myself_';
                    const call = (name, args) => runtime.getOpcodeFunction(`stretch_${name}`)(
                        {TARGET: reference, ...args}, {target: source});
                    call('clearPerspective', {});
                    call('setPerspectiveCorner', {CORNER: 'tl', X: 30, Y: 0});
                    source.blocks.deleteAllBlocks();
                    source.blocks.createBlock({id: 'perspective-warning',
                        opcode: 'stretch_changePerspectiveCorner',
                        inputs: Object.fromEntries(['TARGET', 'X', 'Y']
                            .map(name => [name, {name, block: name, shadow: name}])),
                        fields: {CORNER: {name: 'CORNER', value: 'tr'}},
                        topLevel: true,
                        shadow: false,
                        parent: null,
                        next: 'after-warning',
                        x: 80,
                        y: 80});
                    for (const [id, value] of [['TARGET', reference], ['X', '-80'], ['Y', '0']]) {
                        source.blocks.createBlock({id,
                            opcode: 'text',
                            inputs: {},
                            fields: {TEXT: {name: 'TEXT', value}},
                            topLevel: false,
                            shadow: true,
                            parent: 'perspective-warning',
                            next: null});
                    }
                    source.blocks.createBlock({id: 'after-warning',
                        opcode: 'looks_show',
                        inputs: {},
                        fields: {},
                        topLevel: false,
                        shadow: false,
                        parent: 'perspective-warning',
                        next: null});
                    vm.setEditingTarget(source.id);
                    vm.emitWorkspaceUpdate();
                    source.setVisible(false);
                    let compiled;
                    for (let repeat = 0; repeat < 3; repeat++) {
                        const thread = runtime._pushThread('perspective-warning', source, {stackClick: true});
                        for (let step = 0; step < 5; step++) runtime._step();
                        compiled = Boolean(thread.isCompiled);
                    }
                    vm.setEditingTarget(runtime.getTargetForStage().id);
                    return {compiled,
                        sourceId: source.id,
                        entries: runtime.logger.getEntries(),
                        visible: source.visible,
                        perspective: useContainer ?
                            runtime.spriteContainers.get('Perspective').geometry.perspective : source.perspective};
                }, {compiler: enabled, useContainer: container});
                assert.equal(result.compiled, enabled);
                assert.equal(result.visible, true, 'the next command still runs');
                assert.deepEqual(result.perspective, [[30, 0], [0, 0], [0, 0], [0, 0]]);
                assert.equal(result.entries.length, 1);
                assert.equal(result.entries[0].count, 3);
                assert.equal(result.entries[0].blockId, 'perspective-warning');
                assert.equal(result.entries[0].subjectName, container ? 'Perspective' : 'Perspective//Caller');
                assert.match(result.entries[0].message, /无法设置透视.*一次设置四角/);
                await page.waitForFunction(() =>
                    document.querySelector('[data-window-button$="debugger"]').dataset.unread === 'true');
                assert.equal(await button.getAttribute('data-status'), 'closed');
                await button.click();
                const row = page.locator('.sa-debugger-log[data-code="INVALID_PERSPECTIVE_QUAD"]');
                await row.waitFor({state: 'visible'});
                assert.equal(await row.getAttribute('data-type'), 'warn');
                assert.equal(await row.locator('.sa-debugger-log-repeats').textContent(), '3');
                await row.locator('.sa-debugger-log-link').click();
                await page.waitForFunction(id => vm.editingTarget.id === id, result.sourceId);
                const dialog = page.locator('[data-editor-window$="debugger"]');
                if (enabled && container) {
                    await page.screenshot({
                        path: process.env.GEOMETRY_SCREENSHOT || '/tmp/blockdia-perspective-logs.png'
                    });
                }
                await dialog.getByRole('button', {name: '关闭', exact: true}).click();
                console.log(`PASS compiler=${enabled}, container=${container}: warning/count/unread/navigation/state`);
            }
        }
        const offsets = await page.evaluate(() => {
            vm.runtime.logger.clear();
            vm.runtime.getOpcodeFunction('stretch_setPerspectiveCorner')({TARGET: '_myself_',
                CORNER: 'tl',
                X: 1001,
                Y: 0}, {target: vm.editingTarget});
            return vm.runtime.logger.getEntries();
        });
        assert.equal(offsets.length, 1);
        assert.equal(offsets[0].code, 'INVALID_PERSPECTIVE_OFFSETS');
        assert.match(offsets[0].message, /有限数值/);
        assert.deepEqual(errors, []);
        console.log('PAGE_ERRORS', errors);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
