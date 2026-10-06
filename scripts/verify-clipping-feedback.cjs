/* eslint-env browser */
/* global vm */
// Build with BLOCKDIA_LOCAL_PACKAGES=1; uses the overrides from verify-runtime-logs.cjs.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const fs = require('fs');

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
            await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8630/editor.html');
            await page.waitForFunction(() => window.vm && vm.editingTarget && window.ScratchBlocks);
            if (process.env.COMPONENTS_SMALL_STAGE === '1') {
                await page.getByTitle(/Switch to small stage|小舞台/).first()
                    .click();
            }
            await page.evaluate(() => {
                vm.extensionManager.loadExtensionIdSync('stretch');
                vm.extensionManager.loadExtensionIdSync('clipping');
                vm.renameSprite(vm.editingTarget.id, 'Panel//Sprite');
                vm.setSpriteFolderContainer('Panel', true);
            });
            await page.waitForFunction(() => window.ScratchBlocks.getMainWorkspace().getFlyout()
                .getWorkspace()
                .getTopBlocks(false)
                .some(block => block.type === 'clipping_setMask'));
            const setup = await page.evaluate(() => {
                const blockly = window.ScratchBlocks;
                const main = blockly.getMainWorkspace();
                const palette = main.getFlyout().getWorkspace()
                    .getTopBlocks(false);
                main.clear();
                main.setScale(0.65);
                const copy = (opcode, y) => {
                    const original = palette.find(block => block.type === opcode);
                    const block = blockly.Xml.domToBlock(blockly.Xml.blockToDom(original), main);
                    block.moveBy(20, y);
                    return block;
                };
                const builtin = opcode => {
                    const block = main.newBlock(opcode);
                    block.initSvg();
                    block.render();
                    return block;
                };
                const hat = builtin('event_whenflagclicked');
                hat.moveBy(20, 20);
                const clear = copy('clipping_clearMask', 80);
                const warning = copy('clipping_setMaskBounds', 120);
                const after = builtin('looks_show');
                hat.nextConnection.connect(clear.previousConnection);
                clear.nextConnection.connect(warning.previousConnection);
                warning.nextConnection.connect(after.previousConnection);
                const blocks = [copy('clipping_setMask', 230), copy('stretch_setBorders', 320),
                    copy('stretch_setSize', 410), copy('stretch_fitFrame', 500), copy('clipping_circle', 590)];
                const source = vm.editingTarget;
                window.geometryFeedback = {sourceId: source.id,
                    warningId: warning.id,
                    tooltipId: blocks[1].id,
                    frameId: blocks[3].id};
                return {sourceId: source.id,
                    warningId: warning.id,
                    blocks: blocks.map(block => ({type: block.type, text: block.toString(), tooltip: block.tooltip})),
                    tooltipId: blocks[1].id};
            });
            await page.waitForFunction(id => vm.editingTarget.blocks.getBlock(id), setup.warningId);
            const borders = setup.blocks.find(block => block.type === 'stretch_setBorders');
            const frame = setup.blocks.find(block => block.type === 'stretch_fitFrame');
            const mask = setup.blocks.find(block => block.type === 'clipping_setMask');
            const circle = setup.blocks.find(block => block.type === 'clipping_circle');
            assert.match(borders.tooltip, /克隆|分身|clones/);
            assert.match(frame.tooltip, /隐藏|隱藏|hidden/);
            assert.match(mask.text, /执行时的当前造型|執行時的目前造型|current costume when run/);
            assert.match(circle.text, /中心 x:|center x:/);
            assert.match(circle.tooltip, /20.*40/);
            const button = page.locator('[data-window-button$="debugger"]');
            for (const compiler of [false, true]) {
                const result = await page.evaluate(({enabled, id}) => {
                    vm.stopAll();
                    vm.setCompilerOptions({enabled});
                    const source = vm.runtime.getTargetById(window.geometryFeedback.sourceId);
                    source.setCostumeMask(null);
                    source.setVisible(false);
                    vm.runtime.logger.clear();
                    let compiled;
                    for (let i = 0; i < 3; i++) {
                        const thread = vm.runtime._pushThread(id, source, {stackClick: true});
                        for (let j = 0; j < 5; j++) vm.runtime._step();
                        compiled = Boolean(thread.isCompiled);
                    }
                    vm.setEditingTarget(vm.runtime.getTargetForStage().id);
                    return {entries: vm.runtime.logger.getEntries(),
                        visible: source.visible,
                        mask: source.costumeMask,
                        compiled};
                }, {enabled: compiler, id: setup.warningId});
                assert.equal(result.compiled, compiler);
                assert.equal(result.visible, true);
                assert.equal(result.mask, null);
                assert.equal(result.entries.length, 1);
                assert.equal(result.entries[0].count, 3);
                assert.equal(result.entries[0].blockId, setup.warningId);
                assert.match(result.entries[0].message, /尚未|no mask is set/);
                await page.waitForFunction(() =>
                    document.querySelector('[data-window-button$="debugger"]').dataset.unread === 'true');
                await button.click();
                const row = page.locator('.sa-debugger-log[data-code="MASK_NOT_SET"]');
                await row.waitFor({state: 'visible'});
                assert.equal(await row.getAttribute('data-type'), 'warn');
                assert.equal(await row.locator('.sa-debugger-log-repeats').textContent(), '3');
                await row.locator('.sa-debugger-log-link').click();
                await page.waitForFunction(id => vm.editingTarget.id === id, setup.sourceId);
                if (compiler) {
                    await page.screenshot({path: `/tmp/blockdia-clipping-feedback-${locale}${
                        process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
                }
                const dialog = page.locator('[data-editor-window$="debugger"]');
                await dialog.getByRole('button', {name: /^(关闭|關閉|Close)$/}).click();
                console.log(`PASS ${locale} compiler=${compiler}: warning/count/unread/navigation/continuation`);
            }
            // Exercise a real pointer hover, not just the metadata, to verify discoverable help.
            const point = await page.evaluate(id => {
                const block = window.ScratchBlocks.getMainWorkspace().getBlockById(id);
                const bounds = block.getSvgRoot().getBoundingClientRect();
                return {x: bounds.x + 14, y: bounds.y + 15};
            }, setup.tooltipId);
            await page.mouse.move(point.x, point.y);
            await page.locator('.blocklyTooltipDiv').waitFor({state: 'visible'});
            assert.match(await page.locator('.blocklyTooltipDiv').textContent(), /克隆|分身|clones/);
            const tooltipBounds = await page.locator('.blocklyTooltipDiv').boundingBox();
            assert(tooltipBounds.width <= 460, 'long help wraps, including Chinese without spaces');
            assert(tooltipBounds.x >= 0 && tooltipBounds.x + tooltipBounds.width <= page.viewportSize().width);
            await page.screenshot({path: `/tmp/blockdia-geometry-help-${locale}${
                process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
            if (locale === 'zh-cn' && process.env.GEOMETRY_DEMO_PROJECT) {
                const bytes = await page.evaluate(async () => {
                    const blob = await vm.saveProjectSb3();
                    return Array.from(new Uint8Array(await blob.arrayBuffer()));
                });
                fs.writeFileSync(process.env.GEOMETRY_DEMO_PROJECT, Buffer.from(bytes));
            }
            assert.deepEqual(errors, []);
            console.log(`PASS ${locale}: translated blocks and visible hover help; PAGE_ERRORS []`);
            await page.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
