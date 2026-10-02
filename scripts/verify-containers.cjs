/* eslint-env browser */
/* global vm */
// Run with BLOCKDIA_LOCAL_PACKAGES=1. The URL and browser are configurable like verify-components.cjs.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');

(async () => {
    const browser = await chromium.launch({headless: true,
        executablePath: process.env.COMPONENTS_CHROME_PATH,
        args: ['--no-sandbox']});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (process.env.COMPONENTS_COMPACT === '1') {
            await page.addInitScript(() => localStorage.setItem('tw:addons',
                JSON.stringify({'editor-compact': {enabled: true}})));
        }
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8614/editor.html',
            {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.evaluate(async () => {
            if (!vm.runtime.spriteContainers || !vm.renderer.setDrawableContainerPaths) {
                throw new Error('Start the editor with BLOCKDIA_LOCAL_PACKAGES=1');
            }
            const first = vm.editingTarget;
            vm.renameSprite(first.id, 'World//Back');
            for (const name of ['Outside', 'World//Nested//First', 'World//Nested//Second']) {
                await vm.duplicateSprite(first.id);
                vm.renameSprite(vm.editingTarget.id, name);
            }
            await vm.addComponent('slider', 'World//Controls//Slider');
            const sprites = vm.runtime.targets.filter(target => !target.isStage && target.isOriginal);
            sprites.forEach((target, index) => {
                target.setXY(-130 + (index * 60), index === 4 ? -100 : 40);
                target.goToFront();
            });
        });
        const row = path => page.locator(`[data-folder-entry="${path}"]`).getByRole('treeitem')
            .first();
        const menu = async (path, text) => {
            await row(path).click({button: 'right'});
            await page.locator('.react-contextmenu--visible').getByText(text, {exact: true})
                .click();
        };
        const visibility = async path => {
            const expanded = await row(path).getAttribute('aria-expanded');
            const button = row(path).getByRole('button');
            const pressed = await button.getAttribute('aria-pressed');
            await button.click();
            assert.equal(await button.getAttribute('aria-pressed'), pressed === 'true' ? 'false' : 'true');
            assert.equal(await row(path).getAttribute('aria-expanded'), expanded,
                'eye does not expand/collapse folder');
        };
        const expand = async path => {
            if (await row(path).getAttribute('aria-expanded') !== 'true') await row(path).click();
        };
        await menu('World', /Set as container|设为容器/);
        await expand('World');
        await menu('World//Nested', /Set as container|设为容器/);
        await expand('World//Nested');
        await expand('World//Controls');
        assert.equal(await page.locator('[data-container="true"]').count(), 2);
        await row('World').click({button: 'right'});
        const context = page.locator('.react-contextmenu--visible');
        assert.equal(await context.getByText(/container.*(front|back|layer)|容器.*(最前|最后|前移|后移)/i).count(), 0);
        assert.equal(await context.getByText(/Hide container|Show container|隐藏容器|显示容器/).count(), 0);
        await page.mouse.click(900, 30);
        const layout = await page.evaluate(() => {
            const measure = path => {
                const entry = document.querySelector(`[data-folder-entry="${path}"] [role="treeitem"]`);
                const icon = entry.querySelector('[class*="folder-icon"]');
                const name = entry.querySelector('[class*="sprite-tree_name"]');
                const eye = entry.querySelector('button');
                const count = entry.querySelector('[class*="sprite-tree_count"]');
                const rect = icon.getBoundingClientRect();
                return {width: rect.width,
                    height: rect.height,
                    iconX: rect.x,
                    nameX: name.getBoundingClientRect().x,
                    text: entry.innerText,
                    eyeBeforeCount: !eye || eye.getBoundingClientRect().right <= count.getBoundingClientRect().left};
            };
            return [measure('World//Nested'), measure('World//Controls')];
        });
        assert.equal(layout[0].width, layout[1].width);
        assert.equal(layout[0].height, layout[1].height);
        assert.equal(layout[0].iconX, layout[1].iconX);
        assert.equal(layout[0].nameX, layout[1].nameX);
        assert.equal(layout[0].eyeBeforeCount, true);
        assert.doesNotMatch(layout[0].text, /Container|容器/);
        const eye = row('World').getByRole('button');
        const expanded = await row('World').getAttribute('aria-expanded');
        const eyeRect = await eye.boundingBox();
        await page.mouse.move(eyeRect.x + 12, eyeRect.y + 12);
        await page.mouse.down();
        await page.mouse.move(eyeRect.x - 20, eyeRect.y + 40, {steps: 5});
        assert.equal(await page.locator('[class*="drag-layer_drag-layer"]').count(), 0,
            'pressing the eye must not start folder dragging');
        await page.mouse.up();
        await eye.focus();
        await page.keyboard.press('Enter');
        assert.equal(await eye.getAttribute('aria-pressed'), 'false');
        await page.keyboard.press('Space');
        assert.equal(await eye.getAttribute('aria-pressed'), 'true');
        assert.equal(await row('World').getAttribute('aria-expanded'), expanded);
        console.log('PASS icon alignment, eye keyboard actions and simplified context menu');
        await page.mouse.click(900, 30);
        await page.waitForTimeout(250);
        await page.screenshot({path: '/tmp/blockdia-containers.png'});
        const order = () => page.evaluate(() => vm.renderer._drawList.map(id =>
            vm.runtime.getTargetByDrawableId(id)).filter(Boolean)
            .map(target => target.getName())
            .filter((name, i, all) => !i || name !== all[i - 1]));
        await page.evaluate(() => vm.setSpriteContainerOrder('World', -Infinity));
        assert.deepEqual(await order(), ['Stage', 'World//Back', 'World//Nested//First',
            'World//Nested//Second', 'World//Controls//Slider', 'Outside']);
        await page.evaluate(() => {
            vm.runtime.getSpriteTargetByName('World//Nested//First').goToFront();
            vm.runtime.getSpriteTargetByName('World//Back').goToFront();
        });
        assert.deepEqual(await order(), ['Stage', 'World//Nested//Second', 'World//Nested//First',
            'World//Controls//Slider', 'World//Back', 'Outside']);
        await page.evaluate(() => vm.setSpriteContainerOrder('World//Nested', Infinity));
        assert.deepEqual(await order(), ['Stage', 'World//Controls//Slider', 'World//Back',
            'World//Nested//Second', 'World//Nested//First', 'Outside']);
        await page.evaluate(() => vm.setSpriteContainerOrder('World', 1, true));
        assert.equal((await order())[1], 'Outside');
        console.log('PASS real renderer ordering and nested container API');

        await page.evaluate(() => {
            const target = vm.runtime.getSpriteTargetByName('World//Back');
            vm.runtime.emit('SAY', target, 'say', 'Container bubble');
        });
        await visibility('World');
        assert.equal(await page.evaluate(() => vm.runtime.targets.filter(target =>
            target.getName().startsWith('World//')).every(target => target.visible &&
            !target.isEffectivelyVisible() && target.getDrawableIDs().every(id =>
            !vm.renderer._allDrawables[id]._visible))), true);
        assert.equal(await page.evaluate(() => {
            const bubble = vm.runtime.getSpriteTargetByName('World//Back').getCustomState('Scratch.looks');
            return vm.renderer._allDrawables[bubble.drawableId]._visible;
        }), false);
        await visibility('World//Nested');
        await page.evaluate(() => vm.runtime.getSpriteTargetByName('World//Back').setVisible(false));
        await visibility('World');
        assert.equal(await page.evaluate(() => {
            const target = vm.runtime.getSpriteTargetByName('World//Back');
            const nested = vm.runtime.getSpriteTargetByName('World//Nested//First');
            const slider = vm.runtime.getSpriteTargetByName('World//Controls//Slider');
            const clone = nested.makeClone();
            vm.runtime.addTarget(clone);
            clone.goBehindOther(nested);
            clone.goToFront();
            const result = !target.isEffectivelyVisible() && !nested.isEffectivelyVisible() &&
                slider.isEffectivelyVisible() && !clone.isEffectivelyVisible() &&
                vm.renderer.getDrawableOrder(clone.drawableID) > vm.renderer.getDrawableOrder(nested.drawableID);
            vm.runtime.disposeTarget(clone);
            return result;
        }), true);
        console.log('PASS inherited visibility, independent show/hide, components, bubbles and sprite clones');

        // Use actual blocks in both execution modes. Layer requests must remain inside the nested container.
        for (const enabled of [false, true]) {
            const result = await page.evaluate(async compilerEnabled => {
                const target = vm.runtime.getSpriteTargetByName('World//Nested//First');
                vm.runtime.getSpriteTargetByName('Outside').goToFront();
                vm.setCompilerOptions({enabled: compilerEnabled});
                target.blocks.createBlock({id: 'container-flag',
                    opcode: 'event_whenflagclicked',
                    next: 'container-front',
                    parent: null,
                    inputs: {},
                    fields: {},
                    shadow: false,
                    topLevel: true,
                    x: 0,
                    y: 0});
                target.blocks.createBlock({id: 'container-front',
                    opcode: 'looks_gotofrontback',
                    next: null,
                    parent: 'container-flag',
                    inputs: {},
                    fields: {FRONT_BACK: {name: 'FRONT_BACK', value: 'front'}},
                    shadow: false,
                    topLevel: false});
                vm.greenFlag();
                await new Promise(resolve => setTimeout(resolve, 100));
                vm.stopAll();
                target.blocks.deleteBlock('container-flag');
                target.blocks.deleteBlock('container-front');
                const ids = vm.renderer._drawList.map(id => vm.runtime.getTargetByDrawableId(id)).filter(Boolean);
                return ids[ids.length - 1].getName() === 'Outside' &&
                    ids[ids.length - 2] === target;
            }, enabled);
            assert.equal(result, true, `layer block execution, compiler=${enabled}`);
        }
        const savedOrder = await order();
        assert.deepEqual(await page.evaluate(async () => {
            const data = await vm.saveProjectSb3();
            await vm.loadProject(await data.arrayBuffer());
            return vm.runtime.spriteContainers.serialize();
        }), [{path: 'World', visible: true}, {path: 'World//Nested', visible: false}]);
        assert.deepEqual(await order(), savedOrder, 'SB3 restores whole-container and child order');
        assert.equal(await page.evaluate(() =>
            vm.runtime.getSpriteTargetByName('World//Nested//First').isEffectivelyVisible()), false);
        console.log('PASS interpreter/compiler layer blocks and SB3 save/reload');

        await expand('World');
        await menu('World//Nested', /Move to Top level|移到 最外层/);
        assert.deepEqual(await page.evaluate(() => vm.runtime.spriteContainers.serialize()),
            [{path: 'World', visible: true}, {path: 'Nested', visible: false}]);
        await menu('Nested', /^(Move to World|移到 World)$/);
        assert.equal(await page.evaluate(() =>
            vm.runtime.getSpriteTargetByName('World//Nested//First').isEffectivelyVisible()), false);
        console.log('PASS moving containers between parents preserves nested membership and visibility');

        await expand('World');
        await menu('World', /Rename folder|重命名文件夹/);
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('textbox').fill('Scene');
        await dialog.getByRole('button', {name: /^(OK|确定)$/}).click();
        await page.waitForFunction(() => vm.runtime.spriteContainers.get('Scene'));
        assert.deepEqual(await page.evaluate(() => vm.runtime.spriteContainers.serialize()),
            [{path: 'Scene', visible: true}, {path: 'Scene//Nested', visible: false}]);
        await menu('Scene', /Convert to folder|转为普通文件夹/);
        assert.deepEqual(await page.evaluate(() => vm.runtime.spriteContainers.serialize()),
            [{path: 'Scene//Nested', visible: false}]);
        await expand('Scene');
        await menu('Scene//Nested', /Convert to folder|转为普通文件夹/);
        assert.equal(await page.locator('[data-container="true"]').count(), 0);
        assert.equal(await page.evaluate(() =>
            vm.runtime.getSpriteTargetByName('Scene//Nested//First').isEffectivelyVisible()), true);
        await page.getByRole('button', {name: /Switch to small stage|缩小舞台/, exact: true}).click();
        await menu('Scene', /Set as container|设为容器/);
        await visibility('Scene');
        await visibility('Scene');
        await page.mouse.click(900, 30);
        await page.waitForTimeout(250);
        await page.screenshot({path: '/tmp/blockdia-containers-small.png'});
        assert.equal(await page.locator('[data-container="true"]').count(), 1);
        assert.deepEqual(errors, []);
        console.log('PASS rename, reverse conversion, small-stage menu; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
