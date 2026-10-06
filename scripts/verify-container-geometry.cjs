/* eslint-env browser */
/* global vm */
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const near = (actual, expected, tolerance = 3) => actual.forEach((n, i) =>
    assert(Math.abs(n - expected[i]) <= tolerance, `${actual} != ${expected}`));
(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => {
            if (/GL_INVALID|INVALID_FRAMEBUFFER|GL_OUT_OF_MEMORY|Error compiling/.test(m.text())) errors.push(m.text());
        });
        await page.addInitScript(compact => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:addons', JSON.stringify({'editor-compact': {enabled: compact}}));
        }, process.env.COMPONENTS_COMPACT === '1');
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8614/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.getCostumes().length);
        if (process.env.COMPONENTS_SMALL_STAGE === '1') {
            await page.getByTitle(/Switch to small stage|小舞台/).first()
                .click();
            await page.waitForFunction(() => vm.renderer.canvas.getBoundingClientRect().width <= 241);
        }
        await page.evaluate(async () => {
            await vm.extensionManager.loadExtensionURL('stretch');
            await vm.extensionManager.loadExtensionURL('clipping');
            await vm.extensionManager.loadExtensionURL('pen');
            vm.setRuntimeOptions({fencing: false});
            window.callGeometry = (opcode, args, target = vm.editingTarget) =>
                vm.runtime.getOpcodeFunction(opcode)(args, {target});
            window.waitCostumes = async target => {
                for (let i = 0; i < 300; i++) {
                    if (target.getCostumes().every(c => vm.renderer._allSkins[c.skinId]._svgImageLoaded)) return;
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                throw new Error('Costume load timed out');
            };
            const target = vm.editingTarget;
            vm.renameSprite(target.id, 'Group//Panel');
            vm.setSpriteFolderContainer('Group', true);
            target.setXY(0, 0);
            target.setDirection(90);
            target.setSize(100);
            const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60">${body}</svg>`;
            vm.updateSvg(0, svg('<path fill="#e05040" d="M0 0h100v60H0z"/>' +
                '<path fill="#2050e0" d="M0 0h10v60H0zM80 0h20v60H80z"/>'), 50, 30);
            if (target.getCostumes().length < 2) await vm.duplicateCostume(0);
            vm.updateSvg(1, svg('<path fill="black" d="M0 0h40v60H0z"/>' +
                '<path fill="white" fill-opacity="0.5" d="M40 0h20v60H40z"/>' +
                '<path fill="white" d="M60 0h40v60H60z"/>'), 50, 30);
            target.renameCostume(1, 'Mask');
            target.setCostume(0);
            await window.waitCostumes(target);
            window.pixel = (x, y) => {
                const r = vm.renderer;
                r.dirty = true;
                r.draw();
                const data = new Uint8Array(4);
                r.gl.readPixels(Math.floor((x + 240) * r.canvas.width / 480),
                    Math.floor((y + 180) * r.canvas.height / 360), 1, 1, r.gl.RGBA, r.gl.UNSIGNED_BYTE, data);
                return Array.from(data);
            };
        });
        const red = [224, 80, 64, 255];
        const blue = [32, 80, 224, 255];
        const white = [255, 255, 255, 255];
        const referenceFrames = await page.evaluate(() => {
            const before = vm.renderer.getContainerGeometryFrame('Group');
            vm.setSpriteContainerTransform('Group', {direction: 45});
            window.callGeometry('stretch_fitFrame', {CONTAINER: '@container:Group'});
            const after = vm.runtime.spriteContainers.get('Group').geometry.frame;
            vm.setSpriteContainerTransform('Group', {direction: 90});
            return {before, after};
        });
        near(['x', 'y', 'width', 'height'].map(key => referenceFrames.after[key]),
            ['x', 'y', 'width', 'height'].map(key => referenceFrames.before[key]), 0.0001);
        console.log('PASS reference frame captures local content bounds independently of container rotation');
        const ordinary = await page.evaluate(() => {
            const target = vm.editingTarget;
            window.callGeometry('stretch_set', {TARGET: '_mycontainer_', X: 200, Y: 50});
            const result = {pixels: [[0, 0], [90, 0], [110, 0], [0, 20]].map(p => window.pixel(...p)),
                size: target.getWorldSize(),
                state: target.size,
                surfaces: vm.renderer._containerCompositor.pool.length};
            window.callGeometry('stretch_set', {TARGET: '@container:Group', X: 100, Y: 100});
            return result;
        });
        [red, blue, white, white].forEach((color, i) => near(ordinary.pixels[i], color));
        assert.equal(ordinary.size, 100);
        assert.equal(ordinary.state, 100);
        assert.equal(ordinary.surfaces, 0);
        console.log('PASS ordinary container stretch; size remains independent; no offscreen surface');
        const collapsed = await page.evaluate(() => {
            const target = vm.editingTarget;
            vm.setRuntimeOptions({fencing: true});
            vm.setSpriteContainerStretch('Group', {x: 0, y: 100});
            target.setXY(15, 20);
            target.setWorldPosition(100, 100);
            const position = [target.x, target.y];
            const pixel = window.pixel(0, 20);
            vm.setSpriteContainerStretch('Group', {x: 100, y: 100});
            target.setXY(0, 0);
            vm.setRuntimeOptions({fencing: false});
            return {position, pixel, restored: window.pixel(0, 0)};
        });
        near(collapsed.position, [15, 20]);
        near(collapsed.pixel, white);
        near(collapsed.restored, red);
        console.log('PASS zero-axis fencing, safe world setters and recovery');

        const warp = await page.evaluate(() => {
            window.callGeometry('stretch_setFrame', {CONTAINER: '_mycontainer_', X: 0, Y: 0, WIDTH: 100, HEIGHT: 60});
            window.callGeometry('stretch_setPerspective', {TARGET: '_mycontainer_',
                TLX: 20,
                TLY: 0,
                TRX: -20,
                TRY: 0,
                BRX: 0,
                BRY: 0,
                BLX: 0,
                BLY: 0});
            const d = vm.renderer._allDrawables[vm.editingTarget.drawableID];
            d.updateCPURenderAttributes();
            const points = [[0, 0], [40, 25], [40, -25]];
            return {pixels: points.map(p => window.pixel(...p)), hits: points.map(p => d.isTouching(p))};
        });
        [red, white, blue].forEach((color, i) => near(warp.pixels[i], color));
        assert.deepEqual(warp.hits, [true, false, true]);
        console.log('PASS whole-container perspective GPU pixels and inverse CPU picking');
        const nine = await page.evaluate(() => {
            window.callGeometry('stretch_clearPerspective', {TARGET: '_mycontainer_'});
            window.callGeometry('stretch_setBorders', {TARGET: '_mycontainer_',
                LEFT: 10,
                RIGHT: 20,
                TOP: 8,
                BOTTOM: 12});
            window.callGeometry('stretch_setSize', {TARGET: '_mycontainer_', WIDTH: 200, HEIGHT: 80});
            // Sample region interiors: small-stage linear filtering blends pixels near slice borders.
            return [-95, -80, 0, 65, 90, 110].map(x => window.pixel(x, 0));
        });
        [blue, red, red, red, blue, white].forEach((color, i) => near(nine[i], color));
        console.log('PASS container nine-slice preserves borders across split cells');
        const fixed = await page.evaluate(() => {
            const target = vm.editingTarget;
            window.callGeometry('stretch_setPerspective', {TARGET: '_mycontainer_',
                TLX: 20,
                TLY: 0,
                TRX: -20,
                TRY: 0,
                BRX: 0,
                BRY: 0,
                BLX: 0,
                BLY: 0});
            target.setCostumeMask({costume: 'Mask',
                mode: 'luminance',
                space: 'stage',
                x: 0,
                y: 0,
                width: 100,
                height: 60,
                inverted: false});
            const result = [-25, 25, 60].map(x => window.pixel(x, 0));
            target.setCostumeMask(null);
            window.callGeometry('clipping_circle', {TARGET: '_mycontainer_', SPACE: 'stage', X: 0, Y: 0, RADIUS: 20});
            const clip = [0, 30].map(x => window.pixel(x, 0));
            window.callGeometry('clipping_clear', {TARGET: '_mycontainer_'});
            return {result, clip};
        });
        [white, red, white].forEach((color, i) => near(fixed.result[i], color));
        [red, white].forEach((color, i) => near(fixed.clip[i], color));
        console.log('PASS fixed stage costume mask and container clip through both warps');
        const sensing = await page.evaluate(async () => {
            const original = vm.editingTarget;
            await vm.duplicateSprite(original.id);
            const probe = vm.editingTarget;
            vm.renameSprite(probe.id, 'Probe');
            await window.waitCostumes(probe);
            probe.setSize(2);
            probe.setEffect('ghost', 100);
            const result = [];
            for (const x of [0, 110]) {
                probe.setXY(x, 0);
                result.push(['ForceCPU', 'ForceGPU'].map(mode => {
                    vm.renderer.setUseGpuMode(mode);
                    return [probe.isTouchingColor([224, 80, 64]), probe.isTouchingSprite(original.getName())];
                }));
            }
            vm.renderer.setUseGpuMode('Automatic');
            vm.deleteSprite(probe.id);
            vm.setEditingTarget(original.id);
            window.callGeometry('pen_stamp', {});
            original.setVisible(false);
            const stamp = [0, 110].map(x => window.pixel(x, 0));
            window.callGeometry('pen_clear', {});
            original.setVisible(true);
            return {result, stamp};
        });
        assert.deepEqual(sensing.result, [[[true, true], [true, true]], [[false, false], [false, false]]]);
        near(sensing.stamp[0], red);
        near(sensing.stamp[1], white);
        console.log('PASS CPU/GPU colors, sprite collisions and warped stamp');
        const nested = await page.evaluate(() => {
            const target = vm.editingTarget;
            vm.renameSprite(target.id, 'Group//Inner//Panel');
            vm.setSpriteFolderContainer('Group//Inner', true);
            vm.setSpriteContainerTransform('Group', {x: 30, y: -10, direction: 75, size: 110});
            vm.setSpriteContainerStretch('Group', {x: -100, y: 120});
            vm.setSpriteContainerGeometry('Group//Inner', {frame: {x: 0, y: 0, width: 100, height: 60},
                nineSlice: {width: 120, height: 65},
                borders: {left: 5, right: 5, top: 5, bottom: 5},
                perspective: [[10, 5], [-10, 0], [0, 0], [0, 0]]});
            const points = [[-20, 10], [0, 0], [20, -10]].map(p => {
                const world = target.localToWorld(...p);
                return {local: target.worldToLocal(...world), pixel: window.pixel(...world)};
            });
            const before = JSON.stringify(vm.runtime.spriteContainers.get('Group').geometry);
            const clone = vm.runtime.spriteContainers.createClone('Group')[0];
            window.callGeometry('stretch_setSize', {TARGET: '_mycontainer_', WIDTH: 300, HEIGHT: 100}, clone);
            const independent = JSON.stringify(vm.runtime.spriteContainers.get('Group').geometry) === before;
            vm.runtime.stopAll();
            return {points, independent, frame: vm.runtime.spriteContainers.get('Group').geometry.frame};
        });
        [[-20, 10], [0, 0], [20, -10]].forEach((p, i) => {
            near(nested.points[i].local, p, 0.0001);
            near(nested.points[i].pixel, red);
        });
        assert(nested.independent);
        assert.deepEqual(nested.frame, {x: 0, y: 0, width: 100, height: 60});
        console.log('PASS nested warps, reflection, coordinate round trips and clone independence');
        const saved = await page.evaluate(async () => {
            const before = JSON.stringify(vm.runtime.spriteContainers.serialize());
            const bytes = await (await vm.saveProjectSb3()).arrayBuffer();
            await vm.loadProject(bytes);
            const target = vm.runtime.getSpriteTargetByName('Group//Inner//Panel');
            vm.setEditingTarget(target.id);
            await window.waitCostumes(target);
            return {before, after: JSON.stringify(vm.runtime.spriteContainers.serialize())};
        });
        assert.equal(saved.after, saved.before);
        console.log('PASS SB3 geometry round trip');
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
                        inputs: Object.fromEntries(Object.entries(inputs).map(([name, block]) =>
                            [name, {name, block, shadow: block}]))});
                };
                add('g-flag', 'event_whenflagclicked', null, 'g-stretch');
                const blocks = [['g-stretch', 'stretch_set', {X: 150, Y: 70}],
                    ['g-size', 'stretch_setSize', {WIDTH: 220, HEIGHT: 90}],
                    ['g-corner', 'stretch_setPerspectiveCorner', {X: 15, Y: 0}]];
                blocks.forEach(([id, opcode, values], i) => {
                    add(id, opcode, i ? blocks[i - 1][0] : 'g-flag', i < 2 ? blocks[i + 1][0] : null,
                        {TARGET: `${id}-target`,
                            ...Object.fromEntries(Object.keys(values).map(k => [k, `${id}-${k}`]))},
                        opcode.endsWith('Corner') ? {CORNER: 'tl'} : {});
                    add(`${id}-target`, 'stretch_menu_objects', id, null, {}, {objects: '_mycontainer_'}, true);
                    Object.entries(values).forEach(([k, v]) => add(`${id}-${k}`, 'math_number', id, null,
                        {}, {NUM: v}, true));
                });
                vm.emitWorkspaceUpdate();
            }, enabled);
            const execution = await page.evaluate(() => {
                const target = vm.editingTarget;
                const threads = vm.runtime.startHats('event_whenflagclicked', null, target);
                for (let i = 0; i < 10; i++) vm.runtime._step();
                return {compiled: Boolean(threads[0].isCompiled), c: vm.runtime.spriteContainers.get('Group//Inner')};
            });
            assert.equal(execution.compiled, enabled);
            assert.deepEqual(execution.c.stretch, {x: 150, y: 70});
            assert.equal(execution.c.geometry.nineSlice.width, 220);
            assert.deepEqual(execution.c.geometry.perspective[0], [15, 0]);
            console.log('PASS', enabled ? 'compiled' : 'interpreted', 'container geometry commands');
        }
        await page.evaluate(async () => {
            vm.stopAll();
            vm.runtime.targets.filter(t => !t.isStage).forEach(t => t.setVisible(false));
            await vm.addComponent('slider', 'Controls//Slider');
            const target = vm.editingTarget;
            vm.setSpriteFolderContainer('Controls', true);
            target.setXY(0, 0);
            target.setNineSliceSize({width: 240, height: 30});
            target.setPerspective([[10, 0], [-10, 0], [0, 0], [0, 0]]);
            target.componentController.setProperties({value: 50, clickTrackToJump: true});
            await window.waitCostumes(target);
            vm.setSpriteContainerGeometry('Controls', {frame: {x: 0, y: 0, width: 280, height: 60},
                borders: {left: 25, right: 25, top: 10, bottom: 10},
                nineSlice: {width: 330, height: 80},
                perspective: [[20, 0], [-20, 0], [0, 0], [0, 0]]});
            vm.setSpriteContainerTransform('Controls', {size: 80, direction: 80});
            vm.setSpriteContainerStretch('Controls', {x: 120, y: 100});
            const original = JSON.stringify(vm.runtime.spriteContainers.get('Controls').geometry.frame);
            target.setXY(10, 0);
            target.setVisible(false);
            target.setVisible(true);
            target.setXY(0, 0);
            if (JSON.stringify(vm.runtime.spriteContainers.get('Controls').geometry.frame) !== original) {
                throw new Error('Reference frame changed with member position or visibility');
            }
        });
        await page.locator('img[title="Full Screen Control"], img[title="全屏模式"]').click();
        await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).waitFor({state: 'visible'});
        const drag = await page.evaluate(() => {
            const target = vm.editingTarget;
            const controller = target.componentController;
            const track = controller.getTrack();
            const id = controller.parts.get('track');
            const d = vm.renderer._allDrawables[id];
            d.updateMatrix();
            const [width, height] = d.getGeometrySize();
            const [cx, cy] = d.getGeometryCenter();
            const m = d._uniforms.u_modelMatrix;
            const rect = vm.renderer.canvas.getBoundingClientRect();
            const point = ratio => {
                const x = track.start[0] + ((track.end[0] - track.start[0]) * ratio);
                const y = track.start[1] + ((track.end[1] - track.start[1]) * ratio);
                const u = 0.5 - ((x + cx) / width);
                const v = ((cy - y) / height) - 0.5;
                const w = (m[3] * u) + (m[7] * v) + m[15];
                const p = vm.renderer._containerCompositor.warpPoint(id,
                    [((m[0] * u) + (m[4] * v) + m[12]) / w, ((m[1] * u) + (m[5] * v) + m[13]) / w]);
                return {x: rect.left + ((p[0] + 240) * rect.width / 480),
                    y: rect.top + ((180 - p[1]) * rect.height / 360)};
            };
            return [point(0.5), point(0.85)];
        });
        await page.mouse.move(drag[0].x, drag[0].y);
        await page.mouse.down();
        await page.mouse.move(drag[1].x, drag[1].y, {steps: 10});
        await page.mouse.up();
        const value = await page.evaluate(() => vm.editingTarget.component.properties.value);
        assert(Math.abs(value - 85) <= 2, `container geometry slider drag ${value}`);
        await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).click();
        console.log('PASS real slider drag through member and container warps; stable reference frame');
        await page.locator('.scratchCategoryMenuItem').filter({hasText: '拉伸'})
            .click();
        await page.locator('[data-container-properties="Controls"]').click();
        const panel = page.locator('[data-container-properties-popup="Controls"]');
        assert.equal(await panel.getByRole('spinbutton').count(), 4);
        console.log('PASS inspector exposes position, size and direction');
        await page.waitForTimeout(350);
        await page.screenshot({path: process.env.GEOMETRY_SCREENSHOT || '/tmp/blockdia-container-geometry.png'});
        assert.deepEqual(errors, []);
        console.log('PAGE_ERRORS', errors);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error); process.exitCode = 1;
});
