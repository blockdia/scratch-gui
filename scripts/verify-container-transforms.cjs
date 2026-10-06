/* eslint-env browser */
/* global vm */
// Run against BLOCKDIA_LOCAL_PACKAGES=1, using the same environment as verify-containers.cjs.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const near = (actual, expected, tolerance = 0.01) => actual.forEach((n, i) =>
    assert.ok(Math.abs(n - expected[i]) < tolerance, `${actual} should equal ${expected}`));
(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const screenshotSuffix = `${process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}${
            process.env.COMPONENTS_DARK === '1' ? '-dark' : ''}`;
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(({compact, dark}) => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:theme', dark ? 'dark' : 'light');
            localStorage.setItem('tw:addons', JSON.stringify({'layer-manager': {enabled: false},
                'editor-compact': {enabled: compact}}));
        }, {compact: process.env.COMPONENTS_COMPACT === '1', dark: process.env.COMPONENTS_DARK === '1'});
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8614/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.evaluate(async () => {
            if (!vm.setSpriteContainerTransform || !vm.renderer.updateDrawableParentTransform) {
                throw new Error('Start with BLOCKDIA_LOCAL_PACKAGES=1');
            }
            const target = vm.editingTarget;
            vm.renameSprite(target.id, 'A//N//Box');
            vm.updateSvg(target.currentCostume,
                '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">' +
                '<path fill="#ff0000" d="M0 0h40v20H0z"/></svg>', 20, 10);
            await vm.duplicateSprite(target.id);
            vm.renameSprite(vm.editingTarget.id, 'Outside');
            vm.editingTarget.setXY(-160, 120);
            target.setXY(20, 10);
            await vm.addComponent('slider', 'A//Slider');
            vm.editingTarget.setXY(0, -55);
            vm.setSpriteFolderContainer('A', true);
            vm.setSpriteFolderContainer('A//N', true);
            vm.setSpriteContainerTransform('A//N', {x: 10, y: 20});
            vm.setSpriteContainerTransform('A', {x: 50, y: 40, direction: 180, size: 150});
        });
        const state = await page.evaluate(() => {
            const target = vm.runtime.getSpriteTargetByName('A//N//Box');
            const outside = vm.runtime.getSpriteTargetByName('Outside');
            const world = target.getWorldPosition();
            vm.renderer.draw();
            const rect = vm.renderer.canvas.getBoundingClientRect();
            const picked = vm.renderer.pick((world[0] + 240) * rect.width / 480,
                (180 - world[1]) * rect.height / 360);
            const bounds = target.getBounds();
            outside.setXY(world[0], world[1]);
            const touching = target.isTouchingSprite('Outside');
            const color = target.isTouchingColor([255, 0, 0]);
            outside.setXY(-160, 120);
            vm.runtime.emit('SAY', target, 'say', 'Hello');
            const bubble = target.getCustomState('Scratch.looks');
            const before = vm.renderer._allDrawables[bubble.drawableId]._position.slice(0, 2);
            vm.setSpriteContainerTransform('A', {x: 70});
            const after = vm.renderer._allDrawables[bubble.drawableId]._position.slice(0, 2);
            const bubbleTransform = vm.renderer._allDrawables[bubble.drawableId]._parentTransform;
            vm.setSpriteContainerTransform('A', {x: 50});
            vm.runtime.emit('SAY', target, 'say', '');
            return {world,
                local: [target.x, target.y],
                picked: vm.getTargetIdForDrawableId(picked) === target.id,
                bounds: [bounds.left, bounds.right, bounds.bottom, bounds.top],
                touching,
                color,
                bubbleMoved: after[0] - before[0],
                bubbleTransform};
        });
        near(state.world, [95, -5]);
        near(state.local, [20, 10]);
        near(state.bounds, [80, 110, -35, 25], 1);
        assert.ok(state.picked && state.touching && state.color);
        near([state.bubbleMoved], [20], 1);
        assert.deepEqual(state.bubbleTransform, [1, 0, 0, 1, 0, 0]);
        console.log('PASS world rendering, picking, collision/color sensing and upright following bubbles');

        const row = page.locator('[data-folder-entry="A"] > div > [role="treeitem"]').first();
        const button = page.locator('[data-container-properties="A"]');
        const expanded = await row.getAttribute('aria-expanded');
        assert.equal(await page.getByRole('button', {name: '图层管理器', exact: true}).count(), 0);
        const panel = page.locator('[data-container-properties-popup="A"]');
        const field = name => panel.getByRole('spinbutton', {name, exact: true});
        await button.click();
        assert.equal(await row.getAttribute('aria-expanded'), expanded);
        assert.equal(await panel.getByRole('spinbutton').count(), 6);
        assert.equal(await field('x 拉伸 %').inputValue(), '100');
        assert.equal(await field('y 拉伸 %').inputValue(), '100');
        const eye = row.getByRole('button', {name: /隐藏容器|显示容器/});
        const eyeBounds = await eye.boundingBox();
        const propertyBounds = await button.boundingBox();
        near([eyeBounds.y, eyeBounds.height], [propertyBounds.y, propertyBounds.height]);
        assert.ok(propertyBounds.x >= eyeBounds.x + eyeBounds.width);
        assert.equal(await button.locator('img').evaluate(element => getComputedStyle(element).filter),
            process.env.COMPONENTS_DARK === '1' ? 'invert(1)' : 'none');

        // Compare the container with the native sprite controls, including fractional runtime precision.
        await page.evaluate(() => {
            vm.setEditingTarget(vm.runtime.getSpriteTargetByName('Outside').id);
            const values = {x: 12.5, y: -12.5, size: 123.456, direction: 111.54889466};
            vm.postSpriteInfo(values);
            vm.setSpriteContainerTransform('A', values);
        });
        const native = page.locator('[class*="sprite-info_sprite-info_"]');
        for (const [name, expected] of [['x', '13'], ['y', '-12'], ['大小', '123'], ['方向', '112']]) {
            const spriteField = native.getByRole('spinbutton', {name, exact: true});
            // Native sprite changes publish on the next VM frame, independently of container edits.
            await page.waitForFunction(([input, value]) => input.value === value,
                [await spriteField.elementHandle(), expected]);
            assert.equal(await spriteField.inputValue(), expected);
            assert.equal(await field(name).inputValue(), await spriteField.inputValue());
            assert.equal(await field(name).getAttribute('step'), await spriteField.getAttribute('step'));
        }
        await field('x').press('ArrowUp');
        await field('x').press('Enter');
        assert.equal(await field('x').inputValue(), '14');
        await field('大小').fill('142.625');
        await field('大小').press('Tab');
        assert.equal(await field('大小').inputValue(), '143');
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.size), 142.625);
        await field('方向').fill('471.54889466');
        await field('方向').press('Enter');
        assert.equal(await field('方向').inputValue(), '112');
        near([await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.direction)], [111.54889466]);
        const dial = panel.locator('[class*="dial_dial-container_"]');
        const handle = panel.locator('[class*="dial_dial-handle_"]');
        const dialBounds = await dial.boundingBox();
        const handleBounds = await handle.boundingBox();
        await page.mouse.move(handleBounds.x + (handleBounds.width / 2), handleBounds.y + (handleBounds.height / 2));
        await page.mouse.down();
        await page.mouse.move(dialBounds.x + dialBounds.width - 5, dialBounds.y + (dialBounds.height / 2) + 17,
            {steps: 5});
        await page.mouse.up();
        const direction = await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.direction);
        assert.ok(!Number.isInteger(direction), 'dial preserves fractional runtime direction');
        assert.equal(await field('方向').inputValue(), String(Math.round(direction)));
        await page.screenshot({path: `/tmp/blockdia-container-numeric-parity${screenshotSuffix}.png`});
        await page.evaluate(() => {
            vm.postSpriteInfo({x: -160, y: 120, size: 100, direction: 90});
            vm.setSpriteContainerTransform('A', {x: 50, y: 40, size: 150, direction: 180});
            vm.setEditingTarget(vm.runtime.getSpriteTargetByName('A//Slider').id);
        });
        console.log('PASS themed property icon and native numeric display, stepping, blur, Enter and dial precision');
        await field('x').fill('75');
        await field('x').press('Enter');
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.x), 75);
        await field('方向').fill('20');
        await field('方向').press('Escape');
        await panel.waitFor({state: 'hidden'});
        assert.equal(await button.evaluate(element => element === document.activeElement), true);
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.direction), 180);
        await button.press('Space');
        await panel.waitFor({state: 'visible'});
        assert.equal(await field('方向').inputValue(), '180');
        await field('大小').fill('0');
        await field('大小').press('Enter');
        assert.equal(await field('大小').inputValue(), '0');
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.size), 0.01);
        await field('大小').fill('10001');
        await field('大小').press('Enter');
        assert.equal(await field('大小').inputValue(), '10000');
        await field('大小').fill('150');
        await field('大小').press('Enter');
        await field('方向').fill('270');
        await field('方向').press('Enter');
        assert.equal(await field('方向').inputValue(), '-90');
        await panel.getByRole('button', {name: /左右翻转|左右翻轉|Left\/Right/}).click();
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.rotationStyle),
            'left-right');
        await panel.getByRole('button', {name: /任意旋转|任意旋轉|All Around/}).click();
        await field('方向').fill('180');
        await field('方向').press('Enter');
        await field('x').fill('50');
        await field('x').press('Enter');
        assert.equal(await row.getAttribute('aria-expanded'), expanded, 'editing never toggles the folder');
        await page.screenshot({path: `/tmp/blockdia-container-properties${screenshotSuffix}.png`});
        await field('x').fill('76');
        await page.mouse.click(800, 200); // Blockly stops bubbling pointer events.
        await panel.waitFor({state: 'hidden'});
        assert.equal(await page.evaluate(() => vm.runtime.spriteContainers.get('A').transform.x), 76);
        await page.evaluate(() => vm.setSpriteContainerTransform('A', {x: 50}));
        const screenPoint = point => page.evaluate(([x, y]) => {
            const rect = vm.renderer.canvas.getBoundingClientRect();
            return {x: rect.left + ((x + 240) * rect.width / 480),
                y: rect.top + ((180 - y) * rect.height / 360)};
        }, point);
        const from = await screenPoint([95, -5]);
        const to = await screenPoint([125, 15]);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.waitForTimeout(550);
        await page.mouse.move(to.x, to.y, {steps: 10});
        await page.mouse.up();
        const dragged = await page.evaluate(() => {
            const t = vm.runtime.getSpriteTargetByName('A//N//Box');
            return {world: t.getWorldPosition(), local: [t.x, t.y]};
        });
        near(dragged.world, [125, 15], 2);
        near(dragged.local, [20 - (20 / 1.5), 30], 2);
        console.log('PASS transform editor, input cancel/validation and real stage drag');

        await page.locator('img[title="Full Screen Control"], img[title="全屏模式"]').click();
        await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).waitFor({state: 'visible'});
        const track = await page.evaluate(() => {
            const target = vm.runtime.getSpriteTargetByName('A//Slider');
            const points = target.component.metadata.sliderTrack;
            return [points.start, points.end].map(([x, y]) => target.localToWorld(target.x + x, target.y + y));
        });
        const start = await screenPoint(track[0]);
        const end = await screenPoint(track[1]);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, {steps: 12});
        await page.mouse.up();
        const sliderValue = await page.evaluate(() =>
            vm.runtime.getSpriteTargetByName('A//Slider').component.properties.value);
        assert.equal(sliderValue, 100);
        await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).click();
        console.log('PASS transformed component slider pointer interaction');

        // Keep injected regression stacks outside the visible Blockly workspace.
        await page.evaluate(() => vm.setEditingTarget(vm.runtime.getSpriteTargetByName('A//Slider').id));
        // Exercise the optimized distance reporter as well as shared motion primitives.
        for (const enabled of [false, true]) {
            const execution = await page.evaluate(compilerEnabled => {
                const t = vm.runtime.getSpriteTargetByName('A//N//Box');
                const other = vm.runtime.getSpriteTargetByName('Outside');
                t.setXY(20, 10);
                other.setXY(95, 35);
                t.createVariable('distance-result', 'distance-result', '');
                const add = (id, opcode, parent, next, inputs = {}, fields = {}) => t.blocks.createBlock({
                    id, opcode, parent, next, inputs, fields, topLevel: !parent, shadow: false, x: 0, y: 0});
                add('transform-flag', 'event_whenflagclicked', null, 'transform-set');
                add('transform-set', 'data_setvariableto', 'transform-flag', null,
                    {VALUE: {name: 'VALUE', block: 'transform-distance'}},
                    {VARIABLE: {name: 'VARIABLE', id: 'distance-result', value: 'distance-result'}});
                add('transform-distance', 'sensing_distanceto', 'transform-set', null,
                    {DISTANCETOMENU: {name: 'DISTANCETOMENU', block: 'transform-menu'}});
                add('transform-menu', 'sensing_distancetomenu', 'transform-distance', null, {},
                    {DISTANCETOMENU: {name: 'DISTANCETOMENU', value: 'Outside'}});
                vm.setCompilerOptions({enabled: compilerEnabled});
                const threads = vm.runtime.startHats('event_whenflagclicked', null, t);
                for (let i = 0; i < 4; i++) vm.runtime._step();
                const value = t.variables['distance-result'].value;
                const compiled = threads[0].isCompiled;
                vm.stopAll();
                t.blocks.deleteBlock('transform-flag');
                return {value, compiled};
            }, enabled);
            near([execution.value], [40]);
            assert.equal(Boolean(execution.compiled), enabled);
        }
        console.log('PASS interpreter and compiler world distance reporter');
        const persisted = await page.evaluate(async () => {
            const target = vm.runtime.getSpriteTargetByName('A//N//Box');
            const before = target.getWorldPosition();
            const [clone] = vm.runtime.spriteContainers.createClone('A//N');
            const instance = vm.runtime.spriteContainers.getContainingContainer(clone).id;
            const cloneBefore = clone.getWorldPosition();
            vm.setSpriteContainerTransform(instance, {x: -20});
            const cloneAfter = clone.getWorldPosition();
            const originalAfter = target.getWorldPosition();
            const saved = vm.runtime.spriteContainers.serialize();
            const file = await vm.saveProjectSb3();
            await vm.loadProject(await file.arrayBuffer());
            return {before,
                cloneBefore,
                cloneAfter,
                originalAfter,
                saved,
                loaded: vm.runtime.spriteContainers.serialize(),
                world: vm.runtime.getSpriteTargetByName('A//N//Box').getWorldPosition(),
                instances: vm.runtime.spriteContainers.cloneDefinitions.size};
        });
        near(persisted.before, persisted.cloneBefore);
        near(persisted.before, persisted.originalAfter);
        assert.notDeepEqual(persisted.cloneAfter, persisted.before);
        assert.deepEqual(persisted.saved, persisted.loaded);
        near(persisted.world, persisted.before);
        assert.equal(persisted.instances, 0);
        assert.deepEqual(errors, []);
        console.log('PASS independent container clone transforms and SB3 round trip; PAGE_ERRORS []');
        const affine = await page.evaluate(() => {
            const t = vm.runtime.getSpriteTargetByName('A//N//Box');
            vm.setSpriteContainerTransform('A', {x: 0, y: 0, direction: -90, size: 150, rotationStyle: 'left-right'});
            vm.setSpriteContainerTransform('A//N', {x: 10, y: 20, direction: 40, size: 70});
            t.goToFront();
            const world = t.getWorldPosition();
            const local = t.worldToLocal(...world);
            vm.renderer.draw();
            const rect = vm.renderer.canvas.getBoundingClientRect();
            const picked = vm.renderer.pick((world[0] + 240) * rect.width / 480,
                (180 - world[1]) * rect.height / 360);
            const matrix = t._containerTransform;
            return {picked: vm.getTargetIdForDrawableId(picked) === t.id,
                local,
                expected: [t.x, t.y],
                determinant: (matrix[0] * matrix[3]) - (matrix[1] * matrix[2])};
        });
        assert.ok(affine.picked && affine.determinant < 0);
        near(affine.local, affine.expected);
        // The same editor remains usable with the small stage.
        await page.locator('[class*="stage-header_stage-size-toggle-group"]').getByRole('button',
            {name: /Switch to small stage|缩小舞台/})
            .click();
        await button.click();
        assert.equal(await field('大小').inputValue(), '150');
        assert.equal(await field('方向').inputValue(), '-90');
        const overflow = await panel.evaluate(element => element.scrollWidth > element.clientWidth);
        assert.equal(overflow, false);
        await panel.waitFor({state: 'visible'});
        await page.waitForTimeout(250);
        const popupBounds = await panel.boundingBox();
        assert.ok(popupBounds.x >= 0 && popupBounds.y >= 0);
        assert.ok(popupBounds.x + popupBounds.width <= 1440 && popupBounds.y + popupBounds.height <= 1000);
        await page.screenshot({path: `/tmp/blockdia-container-properties-small${screenshotSuffix}.png`});
        await field('x').press('Escape');
        await page.evaluate(() => vm.setSpriteFolderContainer('A', false));
        assert.equal(await button.count(), 0, 'ordinary folders have no container property button');
        assert.deepEqual(errors, []);
        console.log('PASS native rotation styles, mirrored picking and small-stage property popup');

        await page.evaluate(() => vm.extensionManager.loadExtensionURL('pen'));
        for (const enabled of [false, true]) {
            const trails = await page.evaluate(compilerEnabled => {
                vm.stopAll();
                const runtime = vm.runtime;
                const target = runtime.getSpriteTargetByName('A//N//Box');
                vm.setEditingTarget(runtime.getSpriteTargetByName('Outside').id);
                const run = (opcode, args = {}) => runtime.getOpcodeFunction(opcode)(args, {target});
                run('pen_penUp');
                run('pen_clear');
                for (const member of runtime.targets) if (!member.isStage) member.setVisible(false);
                vm.setSpriteFolderContainer('A', true);
                vm.setSpriteContainerTransform('A',
                    {x: 0, y: 0, size: 100, direction: 90, rotationStyle: 'all around'});
                vm.setSpriteContainerTransform('A//N',
                    {x: 10, y: 20, size: 100, direction: 90, rotationStyle: 'all around'});
                target.setXY(20, 10);
                run('pen_setPenColorToColor', {COLOR: '#0044ff'});
                run('pen_setPenSizeTo', {SIZE: 6});
                const renderer = vm.renderer;
                const originalLine = renderer.penLine;
                const lines = [];
                renderer.penLine = function (id, attributes, ...coordinates) {
                    lines.push(coordinates);
                    return originalLine.call(this, id, attributes, ...coordinates);
                };
                try {
                    for (const id of target.blocks.getScripts()) target.blocks.deleteBlock(id);
                    const add = (id, opcode, parent, next, inputs = {}, fields = {}, shadow = false) =>
                        target.blocks.createBlock({id,
                            opcode,
                            parent,
                            next,
                            inputs,
                            fields,
                            topLevel: !parent,
                            shadow,
                            x: 0,
                            y: 0});
                    add('pen-flag', 'event_whenflagclicked', null, 'pen-down');
                    add('pen-down', 'pen_penDown', 'pen-flag', 'pen-transform-0');
                    const changes = [['A', 'x', 80], ['A', 'direction', 180], ['A', 'size', 150],
                        ['A//N', 'x', 20]];
                    changes.forEach(([container, property, value], index) => {
                        const id = `pen-transform-${index}`;
                        add(id, 'containers_setProperty', index ? `pen-transform-${index - 1}` : 'pen-down',
                            index === changes.length - 1 ? 'pen-up' : `pen-transform-${index + 1}`,
                            {CONTAINER: {name: 'CONTAINER', block: `${id}-container`, shadow: `${id}-container`},
                                VALUE: {name: 'VALUE', block: `${id}-value`, shadow: `${id}-value`}},
                            {PROPERTY: {name: 'PROPERTY', value: property}});
                        add(`${id}-container`, 'containers_menu_containers', id, null, {},
                            {containers: {name: 'containers', value: container}}, true);
                        add(`${id}-value`, 'math_number', id, null, {},
                            {NUM: {name: 'NUM', value: String(value)}}, true);
                    });
                    add('pen-up', 'pen_penUp', 'pen-transform-3', null);
                    vm.setCompilerOptions({enabled: compilerEnabled});
                    const threads = runtime.startHats('event_whenflagclicked', null, target);
                    for (let i = 0; i < 5; i++) runtime._step();
                    const scriptLines = lines.slice();
                    const sample = (x, y) => renderer.extractColor((0.5 + (x / 480)) * renderer.canvas.clientWidth,
                        (0.5 - (y / 360)) * renderer.canvas.clientHeight, 1).color;
                    vm.setSpriteContainerTransform('A', {x: 90});
                    const afterPenUp = lines.length;
                    run('pen_penDown');
                    vm.setSpriteContainerTransform('A', {x: 90});
                    runtime.spriteContainers.sync();
                    const [clone] = runtime.spriteContainers.createClone('A//N');
                    const afterClone = lines.length;
                    const instance = runtime.spriteContainers.getContainingContainer(clone).id;
                    vm.setSpriteContainerTransform(instance, {x: 40});
                    const afterCloneMove = lines.slice();
                    vm.setSpriteContainerTransform('A', {x: 110});
                    const colors = [sample(70, 30), sample(110, 0)];
                    run('pen_penUp');
                    renderer.draw();
                    return {scriptLines,
                        afterPenUp,
                        afterClone,
                        afterCloneMove,
                        lines,
                        colors,
                        compiled: Boolean(threads[0].isCompiled),
                        local: [target.x, target.y]};
                } finally {
                    renderer.penLine = originalLine;
                    vm.stopAll();
                    target.blocks.deleteBlock('pen-flag');
                }
            }, enabled);
            assert.equal(trails.compiled, enabled);
            near(trails.local, [20, 10]);
            const expected = [[30, 30, 110, 30], [110, 30, 110, -30],
                [110, -30, 125, -45], [125, -45, 125, -60]];
            assert.equal(trails.scriptLines.length, expected.length);
            trails.scriptLines.forEach((line, index) => near(line, expected[index]));
            assert.equal(trails.afterPenUp, 4);
            assert.equal(trails.afterClone, 4, 'unchanged matrices and clone initialization leave no trails');
            assert.equal(trails.afterCloneMove.length, 5);
            near(trails.afterCloneMove[4], [135, -60, 135, -90]);
            assert.equal(trails.lines.length, 7);
            near(trails.lines[5], [135, -60, 155, -60]);
            near(trails.lines[6], [135, -90, 155, -90]);
            for (const color of trails.colors) {
                assert.ok(color.b > 240 && color.r < 10 && color.g < 80,
                    `existing blue pen pixels remain on the stage: ${JSON.stringify(color)}`);
            }
        }
        await page.screenshot({path: `/tmp/blockdia-container-pen${screenshotSuffix}.png`});
        assert.deepEqual(errors, []);
        console.log('PASS container pen trails, nested/cloned members, interpreter/compiler, pixels; PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
