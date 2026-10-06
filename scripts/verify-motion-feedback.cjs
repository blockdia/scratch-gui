/* eslint-env browser */
/* global vm */
// Build with BLOCKDIA_LOCAL_PACKAGES=1; same browser overrides as verify-clipping-feedback.cjs.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        for (const locale of (process.env.COMPONENTS_COMPACT === '1' ? ['zh-cn'] : ['zh-cn', 'zh-tw', 'en'])) {
            const page = await browser.newPage({viewport: process.env.COMPONENTS_COMPACT === '1' ?
                {width: 1024, height: 768} : {width: 1600, height: 1100}});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(({language, compact}) => {
                localStorage.setItem('tw:language', language);
                localStorage.setItem('tw:addons', JSON.stringify({'editor-compact': {enabled: compact}}));
            }, {language: locale, compact: process.env.COMPONENTS_COMPACT === '1'});
            await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8636/editor.html');
            await page.waitForFunction(() => window.vm && vm.editingTarget && window.ScratchBlocks);
            if (process.env.COMPONENTS_SMALL_STAGE === '1') {
                await page.getByTitle(/Switch to small stage|小舞台/).first()
                    .click();
            }
            await page.evaluate(() => {
                vm.extensionManager.loadExtensionIdSync('containers');
                vm.renameSprite(vm.editingTarget.id, 'Panel//Sprite');
                vm.setSpriteFolderContainer('Panel', true);
                vm.setSpriteContainerGeometry('Panel', {frame: {x: 0, y: 0, width: 100, height: 60},
                    perspective: [[20, 0], [-20, 0], [0, 0], [0, 0]]});
                vm.setRuntimeOptions({fencing: false});
                vm.editingTarget.setXY(0, 0);
            });
            await page.waitForFunction(() => window.ScratchBlocks.Blocks.containers_goToWorldXY);
            const sourceId = await page.evaluate(() => {
                const b = window.ScratchBlocks;
                const workspace = b.getMainWorkspace();
                workspace.clear();
                b.Xml.domToWorkspace(b.Xml.textToDom('<xml><block type="event_whenflagclicked" id="motion-hat" ' +
                    'x="30" y="30"><next><block type="looks_hide"><next>' +
                    '<block type="containers_goToWorldXY" id="motion-warning">' +
                    '<value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value>' +
                    '<value name="Y"><shadow type="math_number"><field name="NUM">150</field></shadow></value>' +
                    '<next><block type="looks_show"/></next></block></next></block></next></block></xml>'), workspace);
                return vm.editingTarget.id;
            });
            await page.waitForFunction(() => vm.editingTarget.blocks.getBlock('motion-warning'));
            for (const enabled of [false, true]) {
                const result = await page.evaluate(({compile, id}) => {
                    vm.stopAll();
                    vm.setCompilerOptions({enabled: compile});
                    vm.runtime.logger.clear();
                    const target = vm.runtime.getTargetById(id);
                    let compiled;
                    for (let i = 0; i < 3; i++) {
                        const thread = vm.runtime._pushThread('motion-hat', target, {stackClick: true});
                        for (let j = 0; j < 5; j++) vm.runtime._step();
                        compiled = Boolean(thread.isCompiled);
                    }
                    vm.setEditingTarget(vm.runtime.getTargetForStage().id);
                    return {compiled,
                        position: [target.x, target.y],
                        visible: target.visible,
                        entries: vm.runtime.logger.getEntries()};
                }, {compile: enabled, id: sourceId});
                assert.equal(result.compiled, enabled);
                assert.deepEqual(result.position, [0, 0]);
                assert.equal(result.visible, true);
                assert.equal(result.entries.length, 1);
                assert.equal(result.entries[0].count, 3);
                assert.equal(result.entries[0].blockId, 'motion-warning');
                assert.match(result.entries[0].message, /无法移动或转向|無法移動或轉向|Cannot move or turn/);
                await page.waitForFunction(() =>
                    document.querySelector('[data-window-button$="debugger"]').dataset.unread === 'true');
                await page.locator('[data-window-button$="debugger"]').click();
                const row = page.locator('.sa-debugger-log[data-code="COORDINATE_TRANSFORM_FAILED"]');
                await row.waitFor({state: 'visible'});
                assert.equal(await row.getAttribute('data-type'), 'warn');
                assert.equal(await row.locator('.sa-debugger-log-repeats').textContent(), '3');
                await row.locator('.sa-debugger-log-link').click();
                await page.waitForFunction(id => vm.editingTarget.id === id, sourceId);
                if (enabled) {
                    await page.screenshot({path: `/tmp/blockdia-motion-feedback-${locale}${
                        process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
                }
                await page.locator('[data-editor-window$="debugger"]')
                    .getByRole('button', {name: /^(关闭|關閉|Close)$/})
                    .click();
                console.log(`PASS ${locale} compiler=${enabled}: motion warning/count/navigation/continuation`);
            }
            assert.deepEqual(errors, []);
            console.log(`PASS ${locale}: PAGE_ERRORS []`);
            await page.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
