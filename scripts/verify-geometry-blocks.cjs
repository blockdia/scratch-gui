/* eslint-env browser */
/* global vm */
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        for (const locale of ['zh-cn', 'zh-tw', 'en']) {
            const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(language => localStorage.setItem('tw:language', language), locale);
            await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8614/editor.html');
            await page.waitForFunction(() => window.vm && vm.editingTarget && window.ScratchBlocks);
            await page.evaluate(async () => {
                await vm.extensionManager.loadExtensionURL('stretch');
                await vm.extensionManager.loadExtensionURL('clipping');
                vm.renameSprite(vm.editingTarget.id, 'Panel//Sprite');
                vm.setSpriteFolderContainer('Panel', true);
            });
            await page.waitForFunction(() => window.ScratchBlocks.getMainWorkspace().getFlyout()
                .getWorkspace()
                .getTopBlocks(false)
                .some(block => block.type === 'stretch_setFrame'));
            const ordinary = await page.evaluate(() => {
                const main = window.ScratchBlocks.getMainWorkspace();
                const blocks = main.getFlyout().getWorkspace()
                    .getTopBlocks(false);
                const find = type => blocks.find(block => block.type === `stretch_${type}`);
                const frame = find('setFrame');
                const menu = frame.getInputTargetBlock('CONTAINER').getField('containers');
                return {text: find('set').toString(),
                    generalBordersHavePart: Boolean(find('setBorders').getInput('PART')),
                    frameHasTarget: Boolean(frame.getInput('TARGET')),
                    frameChoices: menu.getOptions().map(item => item[1]),
                    partBlocks: blocks.filter(block => ['stretch_setPartBorders', 'stretch_partBorder']
                        .includes(block.type)).length};
            });
            assert(!ordinary.generalBordersHavePart);
            assert(!ordinary.frameHasTarget);
            assert(!ordinary.frameChoices.includes('_myself_'));
            assert(ordinary.frameChoices.includes('@container:Panel'));
            assert.equal(ordinary.partBlocks, 0);
            assert(!ordinary.text.startsWith('自己 :') && !ordinary.text.includes('自己：'));
            console.log('PASS', locale, 'sprite and container block inputs', ordinary);

            await page.evaluate(() => vm.addComponent('slider', 'Slider'));
            await page.waitForFunction(() => window.ScratchBlocks.getMainWorkspace().getFlyout()
                .getWorkspace()
                .getTopBlocks(false)
                .some(block => block.type === 'stretch_setPartBorders'));
            const component = await page.evaluate(() => {
                const blockly = window.ScratchBlocks;
                const main = blockly.getMainWorkspace();
                const blocks = main.getFlyout().getWorkspace()
                    .getTopBlocks(false);
                const find = type => blocks.find(block => block.type === type);
                const part = find('stretch_setPartBorders');
                const field = part.getInputTargetBlock('PART').getField('parts');
                const opcodes = ['stretch_set', 'stretch_setBorders', 'stretch_setPartBorders',
                    'stretch_setPerspective', 'stretch_setFrame', 'clipping_setMaskBounds', 'clipping_setMaskRegion'];
                main.clear();
                main.setScale(0.6);
                let y = 20;
                const copies = opcodes.map(opcode => {
                    const copy = blockly.Xml.domToBlock(blockly.Xml.blockToDom(find(opcode)), main);
                    copy.moveBy(20, y);
                    y += copy.getHeightWidth().height + 25;
                    return {opcode,
                        text: copy.toString(),
                        width: copy.getHeightWidth().width,
                        height: copy.getHeightWidth().height};
                });
                const setter = main.getTopBlocks(false).find(block => block.type === 'stretch_setPartBorders');
                setter.getInputTargetBlock('PART').getField('parts')
                    .setValue('fill');
                const xml = blockly.Xml.blockToDom(setter);
                const restored = blockly.Xml.domToBlock(xml, main);
                const restoredPart = restored.getInputTargetBlock('PART').getField('parts')
                    .getValue();
                restored.dispose();
                return {defaultPart: field.getValue(),
                    options: field.getOptions().map(item => item[1]),
                    hasTarget: Boolean(part.getInput('TARGET')),
                    restoredPart,
                    copies};
            });
            assert.deepEqual(component.options, ['track', 'fill']);
            assert.equal(component.defaultPart, 'track');
            assert.equal(component.restoredPart, 'fill');
            assert(!component.hasTarget);
            const perspective = component.copies.find(block => block.opcode === 'stretch_setPerspective');
            await page.locator('.scratchCategoryMenuItem').filter({hasText: locale === 'en' ? 'Stretch' :
                (locale === 'zh-cn' ? '拉伸' : '伸縮')})
                .click();
            await page.waitForTimeout(300);
            await page.screenshot({path: `/tmp/blockdia-geometry-blocks-${locale}.png`});
            assert(perspective.text.includes('x:') && perspective.text.includes('y:'));
            assert.equal((perspective.text.match(/%/g) || []).length, 8);
            console.log('PASS', locale, 'component menus and XML round trip', component);
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
