/* eslint-env browser */
/* global vm */
// Start the editor with BLOCKDIA_LOCAL_PACKAGES=1; reuse the container harness environment variables.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const messages = require('../src/addons/blockdia-l10n/zh-cn.json');

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
        const ids = await page.evaluate(async () => {
            if (!vm.runtime.spriteContainers || !vm.renderer.setDrawableContainerPaths) {
                throw new Error('Start the editor with BLOCKDIA_LOCAL_PACKAGES=1');
            }
            const first = vm.editingTarget;
            vm.renameSprite(first.id, 'Back');
            for (const name of ['A//Ordinary//Back', 'A//N//First', 'A//Front', 'Front']) {
                await vm.duplicateSprite(first.id);
                vm.renameSprite(vm.editingTarget.id, name);
            }
            await vm.addComponent('slider', 'A//N//Slider');
            const sprites = vm.runtime.targets.filter(target => !target.isStage && target.isOriginal);
            sprites.forEach(target => target.goToFront());
            vm.setSpriteFolderContainer('A', true);
            vm.setSpriteFolderContainer('A//N', true);
            const nested = vm.runtime.getSpriteTargetByName('A//N//First');
            const clone = nested.makeClone();
            vm.runtime.addTarget(clone);
            clone.goToFront();
            return {...Object.fromEntries(sprites.map(target => [target.getName(), target.id])), clone: clone.id};
        });
        await page.getByRole('button', {name: '图层管理器', exact: true}).click();
        const panel = page.locator('[data-editor-window="layer-manager/layers"]');
        await panel.waitFor({state: 'visible'});
        const bounds = await panel.boundingBox();
        await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height - 2);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + 780, {steps: 8});
        await page.mouse.up();
        const row = id => panel.locator(`[data-layer-id="${id}"]`);
        const select = id => row(id).locator('.sa-layer-select')
            .click();
        const toggle = id => row(id).locator('.sa-layer-toggle')
            .click();
        const roots = () => panel.locator('[aria-level="1"] .sa-layer-name').allTextContents();
        const order = () => page.evaluate(() => vm.runtime.targets.filter(target => !target.isStage)
            .sort((a, b) => a.getLayerOrder() - b.getLayerOrder())
            .map(target => target.id));
        const initialOrder = await order();
        assert.equal(await panel.getByRole('treeitem').count(), 10);
        assert.equal(await row(ids.clone).getAttribute('aria-level'), '3');
        assert.equal(await row(ids['A//Ordinary//Back']).locator('.sa-layer-name')
            .innerText(), 'Ordinary//Back');
        assert.deepEqual(await roots(), ['Front', 'A', 'Back', '舞台']);
        const editing = await page.evaluate(() => vm.editingTarget.id);
        await select('container:A');
        assert.equal(await page.evaluate(() => vm.editingTarget.id), editing);
        await panel.getByRole('button', {name: '↑ 上移一层', exact: true}).click();
        assert.deepEqual(await roots(), ['A', 'Front', 'Back', '舞台']);
        await panel.getByRole('button', {name: '↓ 下移一层', exact: true}).click();
        assert.deepEqual(await order(), initialOrder);
        await select('container:A//N');
        await panel.getByRole('button', {name: '↑ 上移一层', exact: true}).click();
        assert.equal(await panel.getByRole('button', {name: '↑ 上移一层', exact: true}).isDisabled(), true);
        await panel.getByRole('button', {name: '↓ 下移一层', exact: true}).click();
        assert.deepEqual(await order(), initialOrder);
        await select(ids.clone);
        assert.equal(await page.evaluate(() => vm.editingTarget.id), editing);
        await toggle('container:A//N');
        assert.equal(await row(ids.clone).count(), 0);
        assert.equal(await row('container:A//N').getAttribute('aria-selected'), 'true');
        await toggle('container:A');
        assert.equal(await panel.getByRole('treeitem').count(), 4);
        await row('container:A').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await row('container:A').getAttribute('aria-expanded'), 'true');
        assert.equal(await row('container:A//N').getAttribute('aria-expanded'), 'false');
        await toggle('container:A//N');
        console.log('PASS tree hierarchy, whole-container steps, collapse selection and keyboard expansion');

        const dragTo = async (id, destination, cancel = false) => {
            const handle = await row(id).locator('.sa-layer-handle')
                .boundingBox();
            await page.mouse.move(handle.x + (handle.width / 2), handle.y + (handle.height / 2));
            await page.mouse.down();
            await page.mouse.move(destination.x, destination.y, {steps: 10});
            if (cancel) await page.keyboard.press('Escape');
            await page.mouse.up();
        };
        await toggle('container:A');
        const front = await row(ids.Front).boundingBox();
        await dragTo('container:A', {x: front.x + 30, y: front.y + 2});
        assert.deepEqual(await roots(), ['A', 'Front', 'Back', '舞台']);
        await panel.getByRole('button', {name: '↓ 下移一层', exact: true}).click();
        await toggle('container:A');
        const childFront = await row(ids['A//Front']).boundingBox();
        await dragTo('container:A//N', {x: childFront.x + 30, y: childFront.y + 2});
        assert.equal(await panel.getByRole('button', {name: '↑ 上移一层', exact: true}).isDisabled(), true);
        await panel.getByRole('button', {name: '↓ 下移一层', exact: true}).click();
        assert.deepEqual(await order(), initialOrder);
        const outside = await row(ids.Front).boundingBox();
        await dragTo(ids['A//N//First'], {x: outside.x + 30, y: outside.y + 2});
        assert.deepEqual(await order(), initialOrder, 'cross-parent drop is rejected');
        const nestedFront = await row(ids.clone).boundingBox();
        await dragTo(ids['A//N//First'], {x: nestedFront.x + 30, y: nestedFront.y + 2}, true);
        assert.deepEqual(await order(), initialOrder, 'Escape cancels without hiding the tool');
        assert.equal(await panel.isVisible(), true);
        await dragTo(ids['A//N//First'], {x: nestedFront.x + 30, y: nestedFront.y + 2});
        const changed = await order();
        assert.equal(changed.indexOf(ids['A//N//First']), changed.indexOf(ids.clone) + 1);
        assert.equal(await page.evaluate(() => {
            const target = vm.runtime.getSpriteTargetByName('A//N//Slider');
            const positions = target.getDrawableIDs().map(id => vm.renderer._drawList.indexOf(id));
            return positions.every((position, i) => !i || position === positions[i - 1] + 1);
        }), true);
        console.log('PASS container/subtree dragging, parent boundaries, Escape and component integrity');

        await page.evaluate(() => vm.setSpriteContainerVisible('A', false));
        await page.waitForFunction(() => document.querySelectorAll('.sa-layer-badge').length === 7);
        assert.equal(await row(ids.clone).locator('.sa-layer-badge')
            .innerText(), messages['layer-manager/hiddenByContainer']);
        const screenshot = `/tmp/blockdia-layer-tree${process.env.COMPONENTS_COMPACT ? '-compact' : ''}.png`;
        await panel.screenshot({path: screenshot});
        await toggle('container:A');
        await page.evaluate(id => vm.setEditingTarget(id), ids['A//N//First']);
        await row(ids['A//N//First']).waitFor({state: 'visible'});
        assert.equal(await row(ids['A//N//First']).getAttribute('aria-selected'), 'true');
        await page.evaluate(() => vm.setSpriteFolderContainer('A//N', false));
        await row('container:A//N').waitFor({state: 'detached'});
        assert.equal(await row(ids['A//N//First']).getAttribute('aria-level'), '2');
        assert.equal(await row(ids['A//N//First']).locator('.sa-layer-name')
            .innerText(), 'N//First');
        console.log('PASS inherited visibility, external selection and live container removal');
        const savedOrder = () => page.evaluate(() => vm.runtime.targets
            .filter(target => !target.isStage && target.isOriginal)
            .sort((a, b) => a.getLayerOrder() - b.getLayerOrder())
            .map(target => target.getName()));
        const beforeSave = await savedOrder();
        await page.evaluate(async () => {
            const data = await vm.saveProjectSb3();
            await vm.loadProject(await data.arrayBuffer());
        });
        assert.deepEqual(await savedOrder(), beforeSave);
        await page.waitForFunction(() => !document.querySelector('.sa-layer-label small') ||
            !Array.from(document.querySelectorAll('.sa-layer-label small'))
                .some(element => /克隆体/.test(element.innerText)));
        assert.deepEqual(errors, []);
        console.log('PASS SB3 round trip; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
