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
            vm.renameSprite(target.id, 'Perspective');
            target.setXY(0, 0);
            target.setDirection(90);
            target.setSize(100);
            const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60">${body}</svg>`;
            vm.updateSvg(0, svg('<path fill="#e05040" d="M0 0h100v60H0z"/>'), 50, 30);
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
        const white = [255, 255, 255, 255];
        const half = [239, 167, 159, 255];
        const warp = await page.evaluate(() => {
            window.callGeometry('stretch_setPerspective',
                {TLX: 20, TLY: 0, TRX: -20, TRY: 0, BRX: 0, BRY: 0, BLX: 0, BLY: 0});
            const target = vm.editingTarget;
            const result = [[0, 0], [40, 25], [40, -25]].map(p => window.pixel(...p));
            const before = JSON.stringify(target.perspective);
            window.callGeometry('stretch_setPerspectiveCorner', {CORNER: 'tr', X: -200, Y: 0});
            return {result, valid: JSON.stringify(target.perspective) === before};
        });
        near(warp.result[0], red);
        near(warp.result[1], white);
        near(warp.result[2], red);
        assert(warp.valid);
        console.log('PASS four-corner GPU perspective and invalid-quad rejection');

        const masks = await page.evaluate(() => {
            window.callGeometry('stretch_clearPerspective', {});
            window.callGeometry('clipping_setMask', {COSTUME: 'Mask', MODE: 'alpha'});
            const alpha = [-30, 0, 30].map(x => window.pixel(x, 0));
            window.callGeometry('clipping_setMask', {COSTUME: 'Mask', MODE: 'luminance'});
            const luminance = [-30, 0, 30].map(x => window.pixel(x, 0));
            window.callGeometry('clipping_setMaskRegion', {REGION: 'inverse'});
            const inverse = [-30, 0, 30].map(x => window.pixel(x, 0));
            window.callGeometry('clipping_circle', {TARGET: '_myself_', SPACE: 'local', X: 0, Y: 0, RADIUS: 15});
            const intersection = window.pixel(-30, 0);
            window.callGeometry('clipping_clear', {TARGET: '_myself_'});
            return {alpha, luminance, inverse, intersection};
        });
        [red, half, red].forEach((c, i) => near(masks.alpha[i], c));
        [white, half, red].forEach((c, i) => near(masks.luminance[i], c));
        [red, half, white].forEach((c, i) => near(masks.inverse[i], c));
        near(masks.intersection, white);
        console.log('PASS alpha, premultiplied luminance, partial transparency, inversion and shape intersection');

        const sensing = await page.evaluate(async () => {
            const original = vm.editingTarget;
            await vm.duplicateSprite(original.id);
            const probe = vm.editingTarget;
            await window.waitCostumes(probe);
            probe.setCostumeMask(null);
            probe.setPerspective(null);
            probe.setSize(2);
            probe.setEffect('ghost', 100);
            const result = [];
            for (const x of [-30, 30]) {
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
            const stamp = [-30, 30].map(x => window.pixel(x, 0));
            window.callGeometry('pen_clear', {});
            original.setVisible(true);
            return {result, stamp};
        });
        assert.deepEqual(sensing.result, [[[true, true], [true, true]], [[false, false], [false, false]]]);
        near(sensing.stamp[0], red);
        near(sensing.stamp[1], white);
        console.log('PASS CPU/GPU sensing, collision and pen stamp');

        const space = await page.evaluate(() => {
            const target = vm.editingTarget;
            window.callGeometry('clipping_setMaskRegion', {REGION: 'normal'});
            window.callGeometry('clipping_setMaskBounds', {SPACE: 'stage', X: 0, Y: 0, WIDTH: 100, HEIGHT: 60});
            target.setStretch({x: -200, y: 200});
            target.setDirection(0);
            target.setPerspective([[20, 0], [-20, 0], [0, 0], [0, 0]]);
            const pixels = [-20, 20].map(x => window.pixel(x, 0));
            const before = JSON.stringify({p: target.perspective, m: target.costumeMask});
            const clone = target.makeClone();
            vm.runtime.addTarget(clone);
            clone.setCostumeMask(null);
            clone.setPerspective(null);
            const independent = JSON.stringify({p: target.perspective, m: target.costumeMask}) === before;
            vm.runtime.disposeTarget(clone);
            return {pixels, independent};
        });
        near(space.pixels[0], white);
        near(space.pixels[1], red);
        assert(space.independent);
        console.log('PASS fixed stage mask through perspective, rotation and reflection; clone independence');

        const saved = await page.evaluate(async () => {
            const before = JSON.stringify({p: vm.editingTarget.perspective, m: vm.editingTarget.costumeMask});
            const bytes = await (await vm.saveProjectSb3()).arrayBuffer();
            await vm.loadProject(bytes);
            const target = vm.runtime.getSpriteTargetByName('Perspective');
            vm.setEditingTarget(target.id);
            await window.waitCostumes(target);
            return {before, after: JSON.stringify({p: target.perspective, m: target.costumeMask})};
        });
        assert.equal(saved.after, saved.before);
        console.log('PASS SB3 round trip');

        const edited = await page.evaluate(async () => {
            const target = vm.editingTarget;
            const original = new TextDecoder().decode(target.getCostumes()[1].asset.data);
            target.renameCostume(1, 'Renamed mask');
            const name = target.costumeMask.costume;
            vm.updateSvg(1, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60">' +
                '<path fill="black" d="M0 0h100v60H0z"/></svg>', 50, 30);
            await window.waitCostumes(target);
            const pixels = window.pixel(20, 0);
            vm.updateSvg(1, original, 50, 30);
            target.renameCostume(1, 'Mask');
            await window.waitCostumes(target);
            return {name, pixels};
        });
        assert.equal(edited.name, 'Renamed mask');
        near(edited.pixels, white);
        console.log('PASS costume rename and live mask-source edits');

        for (const enabled of [false, true]) {
            await page.evaluate(compiler => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compiler});
                const target = vm.editingTarget;
                target.setPerspective(null);
                target.setCostumeMask(null);
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
                add('p-flag', 'event_whenflagclicked', null, 'p-corner');
                add('p-corner', 'stretch_setPerspectiveCorner', 'p-flag', 'p-mask',
                    {X: 'p-x', Y: 'p-y'}, {CORNER: 'tl'});
                add('p-x', 'math_number', 'p-corner', null, {}, {NUM: 20}, true);
                add('p-y', 'math_number', 'p-corner', null, {}, {NUM: 0}, true);
                add('p-mask', 'clipping_setMask', 'p-corner', null, {COSTUME: 'p-source'}, {MODE: 'alpha'});
                add('p-source', 'clipping_menu_costumes', 'p-mask', null, {}, {costumes: 'Mask'}, true);
                vm.emitWorkspaceUpdate();
            }, enabled);
            const execution = await page.evaluate(() => {
                const target = vm.editingTarget;
                const threads = vm.runtime.startHats('event_whenflagclicked', null, target);
                for (let i = 0; i < 10; i++) vm.runtime._step();
                return {compiled: Boolean(threads[0].isCompiled),
                    corner: target.perspective[0],
                    mask: target.costumeMask.costume};
            });
            assert.equal(execution.compiled, enabled);
            assert.deepEqual(execution.corner, [20, 0]);
            assert.equal(execution.mask, 'Mask');
            console.log('PASS', enabled ? 'compiled' : 'interpreted', 'perspective and mask blocks');
        }

        await page.evaluate(async () => {
            vm.editingTarget.setVisible(false);
            await vm.addComponent('slider', 'Perspective slider');
            const target = vm.editingTarget;
            target.setXY(0, 0);
            target.setNineSliceSize({width: 300, height: 40});
            target.setPerspective([[20, 0], [-20, 0], [0, 0], [0, 0]]);
            target.componentController.setProperties({value: 50, clickTrackToJump: true});
            await window.waitCostumes(target);
            window.callGeometry('clipping_setMask', {COSTUME: '_current_', MODE: 'alpha'});
            if (!target.getDrawableIDs().every(id => vm.renderer._allDrawables[id]._costumeMask)) {
                throw new Error('Mask must cover every component part');
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
                const wx = ((m[0] * u) + (m[4] * v) + m[12]) / w;
                const wy = ((m[1] * u) + (m[5] * v) + m[13]) / w;
                return {x: rect.left + ((wx + 240) * rect.width / 480),
                    y: rect.top + ((180 - wy) * rect.height / 360)};
            };
            return [point(0.5), point(0.85)];
        });
        await page.mouse.move(drag[0].x, drag[0].y);
        await page.mouse.down();
        await page.mouse.move(drag[1].x, drag[1].y, {steps: 10});
        await page.mouse.up();
        const value = await page.evaluate(() => vm.editingTarget.component.properties.value);
        assert(Math.abs(value - 85) <= 2, `projective slider drag ${value}`);
        await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).click();
        console.log('PASS real component pointer drag through nine-slice and perspective');
        await page.locator('.scratchCategoryMenuItem').filter({hasText: '裁剪'})
            .click();
        await page.waitForTimeout(400);
        const label = await page.evaluate(() => {
            const blockly = window.ScratchBlocks;
            const main = blockly.getMainWorkspace();
            const flyout = main.getFlyout();
            const blocks = flyout.getWorkspace().getTopBlocks(false);
            const mask = blocks.find(block => block.type === 'clipping_setMask');
            const field = mask.getInputTargetBlock('COSTUME').getField('costumes');
            ['stretch_setPerspectiveCorner', 'clipping_setMask', 'clipping_setMaskBounds'].forEach((opcode, i) => {
                const source = blocks.find(block => block.type === opcode);
                const copy = blockly.Xml.domToBlock(blockly.Xml.blockToDom(source), main);
                copy.moveBy(20, 100 + (i * 80));
            });
            main.setScale(0.7);
            flyout.scrollTo(Math.max(0, mask.getRelativeToSurfaceXY().y - 40));
            return field.getText();
        });
        assert.equal(label, '当前造型');
        await page.waitForTimeout(200);
        await page.screenshot({path: process.env.GEOMETRY_SCREENSHOT || '/tmp/blockdia-perspective-masks.png'});
        assert.deepEqual(errors, []);
        console.log('PAGE_ERRORS', errors);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
