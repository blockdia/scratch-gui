/* eslint-env browser */
/* global vm */
// Build with BLOCKDIA_LOCAL_PACKAGES=1; see docs/16-拉伸与裁剪.md for the local workflow.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const near = (a, b) => a.forEach((n, i) => assert(Math.abs(n - b[i]) <= 3, `${a} != ${b}`));

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => {
            if (/GL_INVALID|INVALID_FRAMEBUFFER|GL_OUT_OF_MEMORY|Error compiling/.test(m.text())) errors.push(m.text());
        });
        // Keep the external gallery deterministic, including an old ID replaced by a native extension.
        await page.route('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json', route =>
            route.fulfill({contentType: 'application/json',
                body: JSON.stringify({extensions: [{id: 'stretch',
                    name: 'Legacy stretch',
                    description: 'Legacy gallery fixture',
                    slug: 'stretch',
                    by: []}]})}));
        await page.addInitScript(compact => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:addons', JSON.stringify({'editor-compact': {enabled: compact}}));
        }, process.env.COMPONENTS_COMPACT === '1');
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8614/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        for (const name of ['拉伸', '裁剪']) {
            await page.locator('button[title="Add Extension"], button[title="添加扩展"]').click();
            await page.getByText(name, {exact: true}).last()
                .waitFor({state: 'visible'});
            assert.equal(await page.getByText('Legacy stretch', {exact: true}).count(), 0);
            page.once('dialog', dialog => dialog.accept()); // Existing Scratch compatibility notice.
            await page.getByText(name, {exact: true}).last()
                .click();
            await page.waitForFunction(id => vm.extensionManager.isExtensionLoaded(id),
                name === '拉伸' ? 'stretch' : 'clipping').catch(async error => {
                console.log('LIBRARY_DIAGNOSTIC', name, await page.locator('body').innerText());
                await page.screenshot({path: '/tmp/blockdia-extension-library-error.png'});
                throw error;
            });
        }
        console.log('PASS native extension library entries');
        await page.evaluate(() => {
            window.callGeometry = (opcode, args, target = vm.editingTarget) =>
                vm.runtime.getOpcodeFunction(opcode)(args, {target});
            vm.setRuntimeOptions({fencing: false});
            const target = vm.editingTarget;
            vm.renameSprite(target.id, 'Panel');
            vm.updateSvg(0, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60">' +
                '<path fill="#e05040" d="M0 0h100v60H0z"/>' +
                '<path fill="#2050e0" d="M0 0h10v60H0zM80 0h20v60H80z"/></svg>', 50, 30);
            target.setXY(0, 0);
            target.setSize(100);
            target.setDirection(90);
            window.geometryPixel = (x, y) => {
                const r = vm.renderer;
                r.dirty = true;
                r.draw();
                const gl = r.gl;
                const data = new Uint8Array(4);
                gl.readPixels(Math.floor((x + 240) * gl.canvas.width / 480),
                    Math.floor((y + 180) * gl.canvas.height / 360), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
                return Array.from(data);
            };
        });
        const slices = await page.evaluate(() => {
            window.callGeometry('stretch_setBorders', {PART: '_backgrounds_', LEFT: 10, RIGHT: 20, TOP: 8, BOTTOM: 12});
            window.callGeometry('stretch_setSize', {WIDTH: 200, HEIGHT: 80});
            const pixels = [-95, -85, 0, 75, 85, 105].map(x => window.geometryPixel(x, 0));
            const target = vm.editingTarget;
            const bounds = target.getBounds();
            return {pixels,
                bounds: [bounds.left, bounds.right, bounds.bottom, bounds.top],
                width: window.callGeometry('stretch_dimension', {DIMENSION: 'width'})};
        });
        const red = [224, 80, 64, 255];
        const blue = [32, 80, 224, 255];
        const white = [255, 255, 255, 255];
        [blue, red, red, red, blue, white].forEach((c, i) => near(slices.pixels[i], c));
        assert.equal(slices.width, 200);
        near(slices.bounds, [-100, 100, -40, 40]);
        console.log('PASS nine-slice GPU borders, geometry bounds and reporter');

        const shapes = await page.evaluate(() => {
            const run = (shape, extras = {}) => {
                window.callGeometry(`clipping_${shape}`, {TARGET: '_myself_',
                    SPACE: 'local',
                    X: 0,
                    Y: 0,
                    WIDTH: 60,
                    HEIGHT: 40,
                    RADIUS: 20,
                    ...extras});
                return [[0, 0], [28, 18], [45, 0]].map(p => window.geometryPixel(...p));
            };
            const circle = run('circle');
            const ellipse = run('ellipse');
            const rounded = run('roundedRectangle', {RADIUS: 10});
            const rectangle = run('rectangle');
            window.callGeometry('clipping_setRegion', {TARGET: '_myself_', REGION: 'outside'});
            const inverse = [[0, 0], [45, 0]].map(p => window.geometryPixel(...p));
            window.callGeometry('clipping_clear', {TARGET: '_myself_'});
            window.callGeometry('clipping_circle', {TARGET: '_myself_', SPACE: 'stage', X: 30, Y: 20, RADIUS: 20});
            vm.editingTarget.setXY(30, 20);
            vm.editingTarget.setDirection(0);
            window.callGeometry('stretch_set', {X: -150, Y: 100});
            const stage = [[30, 20], [48, 38], [0, 0]].map(p => window.geometryPixel(...p));
            return {circle, ellipse, rounded, rectangle, inverse, stage};
        });
        for (const shape of ['circle', 'ellipse', 'rounded']) {
            near(shapes[shape][0], red);
            near(shapes[shape][1], white);
            near(shapes[shape][2], white);
        }
        near(shapes.rectangle[1], red);
        near(shapes.inverse[0], white);
        near(shapes.inverse[1], red);
        near(shapes.stage[0], red);
        near(shapes.stage[1], white);
        near(shapes.stage[2], white);
        console.log('PASS four shapes, inverse region, mirrored/rotated stage-space clipping');

        const sensing = await page.evaluate(async () => {
            const panel = vm.editingTarget;
            await vm.duplicateSprite(panel.id);
            const probe = vm.editingTarget;
            vm.renameSprite(probe.id, 'Probe');
            const skin = vm.renderer._allDrawables[probe.drawableID].skin;
            for (let i = 0; i < 200 && !skin._svgImageLoaded; i++) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            if (!skin._svgImageLoaded) throw new Error('Probe costume did not finish loading');
            probe.setClipShape(null);
            probe.setNineSliceSize(null);
            probe.setStretch({x: 100, y: 100});
            probe.setSize(3);
            probe.setEffect('ghost', 100);
            const result = [];
            for (const point of [[30, 20], [48, 38]]) {
                probe.setXY(...point);
                result.push(['ForceCPU', 'ForceGPU'].map(mode => {
                    vm.renderer.setUseGpuMode(mode);
                    return [probe.isTouchingColor([224, 80, 64]), probe.isTouchingSprite(panel.getName())];
                }));
            }
            vm.renderer.setUseGpuMode('Automatic');
            vm.deleteSprite(probe.id);
            vm.setEditingTarget(panel.id);
            return result;
        });
        assert.deepEqual(sensing, [[[true, true], [true, true]], [[false, false], [false, false]]]);
        console.log('PASS CPU/GPU color sensing and sprite collision');

        const stamped = await page.evaluate(async () => {
            await vm.extensionManager.loadExtensionURL('pen');
            const target = vm.editingTarget;
            window.callGeometry('pen_clear', {});
            window.callGeometry('pen_stamp', {});
            target.setVisible(false);
            const pixels = [[30, 20], [48, 38]].map(p => window.geometryPixel(...p));
            window.callGeometry('pen_clear', {});
            target.setVisible(true);
            return pixels;
        });
        near(stamped[0], red);
        near(stamped[1], white);
        console.log('PASS pen stamp retains target clipping');

        const containers = await page.evaluate(() => {
            const panel = vm.editingTarget;
            panel.setXY(0, 0);
            panel.setDirection(90);
            panel.setStretch({x: 100, y: 100});
            panel.setClipShape(null);
            vm.renameSprite(panel.id, 'Window//Panel');
            vm.setSpriteFolderContainer('Window', true);
            window.callGeometry('clipping_circle', {TARGET: '@container:Window',
                SPACE: 'local',
                X: 0,
                Y: 0,
                RADIUS: 25});
            vm.setSpriteContainerTransform('Window', {x: 30, y: 20, direction: 0});
            const normal = [[30, 20], [52, 42]].map(p => window.geometryPixel(...p));
            window.callGeometry('clipping_setRegion', {TARGET: '@container:Window', REGION: 'outside'});
            const inverse = [[30, 20], [52, 42]].map(p => window.geometryPixel(...p));
            const clone = vm.runtime.spriteContainers.createClone('Window')[0];
            const inherited = vm.runtime.spriteContainers.getContainingContainer(clone).clip;
            window.callGeometry('clipping_clear', {TARGET: '_mycontainer_'}, clone);
            const original = vm.runtime.spriteContainers.get('Window').clip;
            const independent = vm.runtime.spriteContainers.getContainingContainer(clone).clip;
            vm.runtime.spriteContainers.deleteClone(vm.runtime.spriteContainers.getContainingContainer(clone).id);
            return {normal, inverse, inherited, original, independent};
        });
        near(containers.normal[0], red);
        near(containers.normal[1], white);
        near(containers.inverse[0], white);
        near(containers.inverse[1], red);
        assert.deepEqual(containers.inherited, containers.original);
        assert.equal(typeof containers.independent, 'undefined');
        console.log('PASS transformed container clips and independently editable container clones');

        const components = await page.evaluate(async () => {
            vm.editingTarget.setVisible(false);
            await vm.addComponent('slider', 'Slider');
            const target = vm.editingTarget;
            target.setXY(0, 0);
            window.callGeometry('stretch_setBorders', {PART: '_backgrounds_', LEFT: 6, RIGHT: 6, TOP: 6, BOTTOM: 6});
            window.callGeometry('stretch_setSize', {WIDTH: 300, HEIGHT: 20});
            const controller = target.componentController;
            const thumb = vm.renderer._allDrawables[controller.parts.get('thumb')];
            const before = controller.getTrack();
            target.component.properties.clickTrackToJump = true;
            controller.pointer({isDown: true, x: 0, y: 0}, 0, 0);
            controller.pointer({isDown: false, x: 100, y: 0}, 100, 0);
            const value = target.component.properties.value;
            window.callGeometry('clipping_circle', {TARGET: '_myself_', SPACE: 'local', X: 0, Y: 0, RADIUS: 35});
            const drawable = vm.renderer._allDrawables[target.drawableID];
            drawable.updateCPURenderAttributes();
            const clipped = Boolean(drawable.isTouching([100, 0]));
            const fill = vm.renderer._allDrawables[controller.parts.get('fill')];
            return {before,
                value,
                clipped,
                thumbSlice: thumb._nineSlice,
                fillClip: fill._clipPlane,
                shape: fill._clipShape};
        });
        near([components.before.end[0]], [144]);
        assert(components.value > 80 && components.value < 90, `slider value ${components.value}`);
        assert.equal(components.clipped, false);
        assert.equal(components.thumbSlice, null);
        assert(components.fillClip && components.shape, 'progress clipping and shape clipping coexist');
        console.log('PASS nine-slice component layout, slider input and independent internal clipping');

        // In editor mode the stage intentionally drags the entire sprite; test component input in player mode.
        await page.locator('img[title="Full Screen Control"], img[title="全屏模式"]').click();
        await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).waitFor({state: 'visible'});
        const drag = await page.evaluate(() => {
            const target = vm.editingTarget;
            target.setClipShape(null);
            target.componentController.setProperties({value: 50});
            const rect = vm.renderer.canvas.getBoundingClientRect();
            return {x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2), dx: rect.width * 100 / 480};
        });
        await page.mouse.move(drag.x, drag.y);
        await page.mouse.down();
        await page.mouse.move(drag.x + drag.dx, drag.y, {steps: 10});
        await page.mouse.up();
        const draggedValue = await page.evaluate(() => vm.editingTarget.component.properties.value);
        assert(draggedValue > 80 && draggedValue < 90, `real slider drag: ${draggedValue}`);
        await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).click();
        await page.evaluate(() => window.callGeometry('clipping_circle',
            {TARGET: '_myself_', SPACE: 'local', X: 0, Y: 0, RADIUS: 35}));
        console.log('PASS real pointer drag uses resized slider track');

        const roundtrip = await page.evaluate(async () => {
            const slider = vm.editingTarget;
            slider.setStretch({x: -120, y: 80});
            const expected = JSON.stringify({stretch: slider.stretch,
                size: slider.nineSlice,
                clip: slider.clipShape,
                borders: slider.getCostumes().map(c => c.nineSlice),
                containers: vm.runtime.spriteContainers.serialize()});
            const bytes = await (await vm.saveProjectSb3()).arrayBuffer();
            await vm.loadProject(bytes);
            const after = vm.runtime.getSpriteTargetByName('Slider');
            vm.setEditingTarget(after.id);
            return {expected,
                actual: JSON.stringify({stretch: after.stretch,
                    size: after.nineSlice,
                    clip: after.clipShape,
                    borders: after.getCostumes().map(c => c.nineSlice),
                    containers: vm.runtime.spriteContainers.serialize()}),
                available: ['stretch_set', 'clipping_circle']
                    .map(opcode => typeof vm.runtime.getOpcodeFunction(opcode))};
        });
        assert.equal(roundtrip.actual, roundtrip.expected);
        assert.deepEqual(roundtrip.available, ['function', 'function']);
        console.log('PASS SB3 round trip including costume metadata and automatic native-extension loading');

        for (const enabled of [false, true]) {
            await page.evaluate(compiler => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compiler});
                const target = vm.editingTarget;
                const add = (id, opcode, parent, next, inputs = {}, fields = {}, shadow = false) => {
                    target.blocks.createBlock({id,
                        opcode,
                        parent,
                        next,
                        topLevel: !parent,
                        shadow,
                        fields: Object.fromEntries(Object.entries(fields)
                            .map(([name, value]) => [name, {name, value}])),
                        inputs: Object.fromEntries(Object.entries(inputs)
                            .map(([name, block]) => [name, {name, block, shadow: block}]))});
                };
                add('g-flag', 'event_whenflagclicked', null, 'g-stretch');
                add('g-stretch', 'stretch_set', 'g-flag', 'g-clip', {X: 'g-x', Y: 'g-y'});
                add('g-x', 'math_number', 'g-stretch', null, {}, {NUM: 160}, true);
                add('g-y', 'math_number', 'g-stretch', null, {}, {NUM: 70}, true);
                add('g-clip', 'clipping_clear', 'g-stretch', null, {TARGET: 'g-target'});
                add('g-target', 'clipping_menu_objects', 'g-clip', null, {}, {objects: '_myself_'}, true);
                vm.emitWorkspaceUpdate();
            }, enabled);
            const execution = await page.evaluate(() => {
                const target = vm.editingTarget;
                const threads = vm.runtime.startHats('event_whenflagclicked', null, target);
                for (let i = 0; i < 10; i++) vm.runtime._step();
                return {compiled: Boolean(threads[0].isCompiled), stretch: target.stretch, clip: target.clipShape};
            });
            assert.equal(execution.compiled, enabled);
            assert.deepEqual(execution.stretch, {x: 160, y: 70});
            assert.equal(execution.clip, null);
            console.log('PASS', enabled ? 'compiled' : 'interpreted', 'native extension execution');
        }
        await page.evaluate(() => vm.emitWorkspaceUpdate());
        await page.waitForTimeout(200);
        const ui = await page.evaluate(() => {
            const blockly = window.ScratchBlocks || window.Blockly;
            const main = blockly.getMainWorkspace();
            const flyout = main.getFlyout().getWorkspace();
            const blocks = flyout.getTopBlocks(false);
            const examples = ['clipping_roundedRectangle', 'stretch_setBorders'];
            const result = [];
            examples.forEach((opcode, index) => {
                const source = blocks.find(block => block.type === opcode);
                if (!source) throw new Error(`Missing flyout block ${opcode}`);
                const copy = blockly.Xml.domToBlock(blockly.Xml.blockToDom(source), main);
                copy.moveBy(20, 180 + (index * 100));
                const menu = copy.getInputTargetBlock(opcode.startsWith('clipping') ? 'TARGET' : 'PART');
                const field = menu.getField(opcode.startsWith('clipping') ? 'objects' : 'parts');
                result.push({value: field.getValue(), label: field.getText()});
                if (opcode.startsWith('clipping')) {
                    const targets = field.getOptions().map(item => item[0]);
                    if (!targets.some(label => label.includes('Window'))) {
                        throw new Error('Named container menu missing');
                    }
                }
            });
            main.setScale(0.6);
            return result;
        });
        assert.deepEqual(ui.map(item => item.value), ['_myself_', '_backgrounds_']);
        assert(ui.every(item => item.value !== item.label), 'menus show localized labels');
        console.log('PASS extension blocks, localized menus and named container choices');
        const category = page.locator('.scratchCategoryMenuItem').filter({hasText: '裁剪'});
        await category.click();
        await page.waitForTimeout(500);
        await page.screenshot({path: process.env.GEOMETRY_SCREENSHOT || '/tmp/blockdia-graphic-geometry.png'});
        await page.locator('.scratchCategoryMenuItem').filter({hasText: '拉伸'})
            .click();
        await page.waitForTimeout(500);
        await page.screenshot({path: process.env.GEOMETRY_STRETCH_SCREENSHOT || '/tmp/blockdia-stretch.png'});
        assert.deepEqual(errors, []);
        console.log('PAGE_ERRORS', errors);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
