/* eslint-env browser */
/* global vm */
// Run with BLOCKDIA_LOCAL_PACKAGES=1 and the same browser environment as verify-container-transforms.cjs.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const near = (actual, expected, tolerance = 2) => actual.forEach((n, i) =>
    assert(Math.abs(n - expected[i]) <= tolerance, `${actual} != ${expected}`));

(async () => {
    const browser = await chromium.launch({headless: process.env.COMPONENTS_HEADED !== '1',
        executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (/GL_INVALID|INVALID_FRAMEBUFFER|GL_OUT_OF_MEMORY/.test(message.text())) errors.push(message.text());
        });
        await page.addInitScript(compact => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:addons', JSON.stringify({'editor-compact': {enabled: compact}}));
        }, process.env.COMPONENTS_COMPACT === '1');
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8614/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        await page.evaluate(async () => {
            const first = vm.editingTarget;
            vm.renameSprite(first.id, 'A//Red');
            vm.updateSvg(0, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
                '<path fill="#ff0000" d="M0 0h100v100H0z"/></svg>', 50, 50);
            first.setXY(-20, 0);
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'A//Red2');
            vm.editingTarget.setXY(20, 0);
            await vm.duplicateSprite(first.id);
            vm.renameSprite(vm.editingTarget.id, 'Outside');
            vm.editingTarget.setXY(180, 0);
            vm.setSpriteFolderContainer('A', true);
            vm.setSpriteContainerEffects('A', {ghost: 50});
            window.effectPixel = (x, y) => {
                const renderer = vm.renderer;
                renderer.dirty = true;
                renderer.draw();
                const gl = renderer.gl;
                const data = new Uint8Array(4);
                gl.readPixels(Math.floor((x + 240) * gl.canvas.width / 480),
                    Math.floor((y + 180) * gl.canvas.height / 360), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
                return Array.from(data);
            };
        });
        await page.waitForTimeout(150);
        const pixels = await page.evaluate(() => [-55, 0, 55, 100].map(x => window.effectPixel(x, 0)));
        near(pixels[0], [255, 128, 128, 255]);
        near(pixels[1], pixels[0]);
        near(pixels[2], pixels[0]);
        near(pixels[3], [255, 255, 255, 255]);
        console.log('PASS group opacity is applied once, including overlapping members', pixels);
        const sensing = await page.evaluate(() => {
            const a = vm.runtime.getSpriteTargetByName('A//Red');
            const b = vm.runtime.getSpriteTargetByName('A//Red2');
            const outside = vm.runtime.getSpriteTargetByName('Outside');
            outside.setXY(0, 0);
            outside.setEffect('ghost', 100);
            const run = mode => {
                vm.renderer.setUseGpuMode(mode);
                return [a.isTouchingColor([255, 128, 128]), a.isTouchingColor([255, 0, 0]),
                    outside.isTouchingColor([255, 128, 128]),
                    outside.colorIsTouchingColor([255, 128, 128], [255, 0, 0]),
                    a.isTouchingSprite(b.getName()), outside.isTouchingSprite(a.getName())];
            };
            const cpu = run('ForceCPU');
            const gpu = run('ForceGPU');
            vm.setSpriteContainerEffects('A', {ghost: 100});
            const hidden = run('ForceGPU');
            const rect = vm.renderer.canvas.getBoundingClientRect();
            const mouse = [rect.width / 2, rect.height / 2];
            const fullGhost = {touchingMouse: vm.renderer.drawableTouching(a.drawableID, ...mouse),
                picked: vm.renderer.pick(...mouse)};
            vm.setSpriteContainerEffects('A', {ghost: 50});
            outside.setXY(180, 0);
            outside.setEffect('ghost', 0);
            vm.renderer.setUseGpuMode('Automatic');
            return {cpu, gpu, hidden, fullGhost};
        });
        assert.deepEqual(sensing.cpu, [true, false, true, true, true, true]);
        assert.deepEqual(sensing.gpu, sensing.cpu, 'CPU and GPU agree, including self exclusion within a container');
        assert.deepEqual(sensing.hidden, [false, false, false, false, true, true]);
        assert.equal(sensing.fullGhost.touchingMouse, true);
        assert.equal(sensing.fullGhost.picked, -1);
        console.log('PASS same/cross-container sensing, CPU/GPU color queries and original ghost semantics');

        const clipped = await page.evaluate(() => {
            const a = vm.runtime.getSpriteTargetByName('A//Red');
            const b = vm.runtime.getSpriteTargetByName('A//Red2');
            const outside = vm.runtime.getSpriteTargetByName('Outside');
            vm.setSpriteContainerClip('A', {left: -70, right: -40, bottom: -50, top: 50});
            vm.setSpriteContainerTransform('A', {x: 40, direction: 0});
            const shown = window.effectPixel(20, -55);
            const cut = window.effectPixel(20, 40);
            outside.setSize(10);
            outside.setXY(20, -55);
            const collision = [a.isTouchingSprite(b.getName()), a.isTouchingSprite(outside.getName()),
                b.isTouchingSprite(outside.getName())];
            outside.setXY(20, 40);
            collision.push(a.isTouchingSprite(outside.getName()));
            vm.setSpriteContainerEffects('A', {ghost: 100, whirl: 80, mosaic: 20, fisheye: 80, pixelate: 10});
            outside.setXY(20, -55);
            collision.push(a.isTouchingSprite(outside.getName()));
            vm.setSpriteContainerEffects('A', {ghost: 50});
            const color = ['ForceCPU', 'ForceGPU'].map(mode => {
                vm.renderer.setUseGpuMode(mode);
                return outside.isTouchingColor([255, 128, 128]);
            });
            vm.renderer.setUseGpuMode('Automatic');
            vm.setSpriteContainerEffects('A', null);
            vm.setSpriteContainerClip('A', null);
            vm.setSpriteContainerTransform('A', {x: 0, direction: 90});
            outside.setXY(180, 0);
            outside.setSize(100);
            return {shown, cut, collision, color};
        });
        near(clipped.shown, [255, 128, 128, 255]);
        near(clipped.cut, [255, 255, 255, 255]);
        assert.deepEqual(clipped.collision, [false, true, false, false, true]);
        assert.deepEqual(clipped.color, [true, true], 'color queries ignore warps but retain rotated clipping');
        console.log('PASS rotated container clip, same/cross-container collision and visual-only warps');

        const nested = await page.evaluate(() => {
            const b = vm.runtime.getSpriteTargetByName('A//Red2');
            vm.renameSprite(b.id, 'A//N//Red2');
            vm.setSpriteFolderContainer('A//N', true);
            vm.setSpriteContainerOrder('A//N', Infinity);
            vm.setSpriteContainerEffects('A//N', {brightness: -100, ghost: 50});
            vm.setSpriteContainerEffects('A', {ghost: 50});
            const samples = [window.effectPixel(-55, 0), window.effectPixel(0, 0), window.effectPixel(55, 0)];
            const pool = vm.renderer._containerCompositor.pool;
            return {pixels: samples, surfaces: pool.length, texels: pool.reduce((n, s) => n + (s.width * s.height), 0)};
        });
        near(nested.pixels[0], [255, 128, 128, 255]);
        near(nested.pixels[1], [191, 128, 128, 255]);
        near(nested.pixels[2], [191, 191, 191, 255]);
        assert.equal(nested.surfaces, 2);
        assert(nested.texels <= 4 * 1024 * 1024);
        console.log('PASS nested effects compose in order with bounded temporary textures', nested);

        const effects = await page.evaluate(() => {
            const r = vm.renderer;
            const a = vm.runtime.getSpriteTargetByName('A//Red');
            vm.setSpriteContainerEffects('A//N', null);
            const result = [];
            for (const [name, value] of [['color', 100], ['brightness', -30], ['ghost', 30], ['whirl', 120],
                ['fisheye', 100], ['pixelate', 30], ['mosaic', 30]]) {
                vm.setSpriteContainerEffects('A', null);
                vm.setSpriteContainerEffects('A', {[name]: value});
                result.push({name,
                    pixel: window.effectPixel(0, 0),
                    error: r.gl.getError(),
                    memberEffects: {...a.effects}});
            }
            vm.setSpriteContainerEffects('A', {ghost: 50, color: 40});
            vm.setSpriteContainerClip('A', {left: -80, right: 80, bottom: -60, top: 60});
            const clone = vm.runtime.spriteContainers.createClone('A')[0];
            const clonePath = vm.runtime.spriteContainers.getTargetContainers(clone)[0].id;
            vm.setSpriteContainerEffects(clonePath, {ghost: 80});
            const source = vm.runtime.spriteContainers.get('A');
            const copied = vm.runtime.spriteContainers.get(clonePath);
            vm.runtime.spriteContainers.deleteClone(clonePath);
            window.effectPixel(0, 0);
            return {result,
                source,
                copied,
                instances: vm.runtime.spriteContainers.cloneDefinitions.size,
                rendererInstances: [...r._containerCompositor.states.keys()]
                    .filter(id => id.startsWith('_container_clone_'))};
        });
        assert(effects.result.every(entry => entry.error === 0));
        assert(effects.result.every(entry => Object.values(entry.memberEffects).every(value => value === 0)));
        near(effects.result[0].pixel, [0, 255, 255, 255]);
        assert.equal(effects.source.effects.ghost, 50);
        assert.equal(effects.copied.effects.ghost, 80);
        assert.deepEqual(effects.copied.clip, effects.source.clip);
        assert.equal(effects.instances, 0);
        assert.deepEqual(effects.rendererInstances, []);
        console.log('PASS all seven shaders, independent clone effects and renderer cleanup');

        for (const enabled of [false, true]) {
            const execution = await page.evaluate(compilerEnabled => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compilerEnabled});
                const target = vm.runtime.getSpriteTargetByName('A//Red');
                for (const id of target.blocks.getScripts()) target.blocks.deleteBlock(id);
                target.createVariable('effect-result', 'effect result', '');
                const add = (id, opcode, parent, next, inputs = {}, fields = {}, shadow = false) => {
                    target.blocks.createBlock({id,
                        opcode,
                        parent,
                        next,
                        shadow,
                        topLevel: parent === null,
                        inputs: Object.fromEntries(Object.entries(inputs).map(([name, block]) =>
                            [name, {name, block, shadow: block}])),
                        fields: Object.fromEntries(Object.entries(fields).map(([name, value]) =>
                            [name, {name, value, ...(name === 'VARIABLE' ? {id: value} : {})}]))});
                };
                const command = (id, opcode, parent, next, values, fields = {}) => {
                    const inputs = {};
                    for (const [name, value] of Object.entries(values)) {
                        const inputID = `${id}-${name}`;
                        inputs[name] = inputID;
                        const container = name === 'CONTAINER';
                        add(inputID, container ? 'containers_menu_containers' : 'math_number', id, null, {},
                            {[container ? 'containers' : 'NUM']: value}, true);
                    }
                    add(id, opcode, parent, next, inputs, fields);
                };
                const self = {CONTAINER: '_mycontainer_'};
                add('flag', 'event_whenflagclicked', null, 'reset');
                command('reset', 'containers_clearEffects', 'flag', 'set', self);
                command('set', 'containers_setEffect', 'reset', 'change', {...self, VALUE: 25}, {EFFECT: 'ghost'});
                command('change', 'containers_changeEffect', 'set', 'record', {...self, VALUE: 10}, {EFFECT: 'ghost'});
                add('record', 'data_setvariableto', 'change', null, {VALUE: 'effect'}, {VARIABLE: 'effect-result'});
                command('effect', 'containers_effect', 'record', null, self, {EFFECT: 'ghost'});
                const threads = vm.runtime.startHats('event_whenflagclicked', null, target);
                for (let i = 0; i < 8; i++) vm.runtime._step();
                return {compiled: Boolean(threads[0].isCompiled),
                    value: target.variables['effect-result'].value,
                    state: vm.runtime.spriteContainers.get('A')};
            }, enabled);
            assert.equal(execution.compiled, enabled);
            assert.equal(execution.value, 35);
            assert.deepEqual(execution.state.effects, {ghost: 35});
            assert.deepEqual(execution.state.clip, {left: -80, right: 80, bottom: -60, top: 60});
            console.log('PASS', enabled ? 'compiled' : 'interpreted', 'effect commands and reporter preserve API clip');
        }

        await page.evaluate(() => vm.setEditingTarget(vm.runtime.getSpriteTargetByName('A//Red').id));
        await page.locator('[data-container-properties="A"]').click();
        const popup = page.locator('[data-container-properties-popup="A"]');
        await popup.waitFor({state: 'visible'});
        assert.equal(await popup.getByText('图形特效与裁剪', {exact: true}).count(), 0);
        assert.equal(await popup.getByRole('spinbutton', {name: '特效值', exact: true}).count(), 0);
        assert.equal(await popup.getByRole('checkbox', {name: '矩形裁剪', exact: true}).count(), 0);
        const clipBlocks = await page.evaluate(() => ({
            set: typeof vm.runtime.getOpcodeFunction('containers_setClip'),
            clear: typeof vm.runtime.getOpcodeFunction('containers_clearClip')
        }));
        assert.deepEqual(clipBlocks, {set: 'undefined', clear: 'undefined'});
        console.log('PASS inspector omits appearance controls; clipping remains API-only');
        await page.waitForTimeout(300);
        await page.screenshot({path: `/tmp/blockdia-container-effects${
            process.env.COMPONENTS_COMPACT === '1' ? '-compact' : ''}.png`});
        const saved = await page.evaluate(async () => ({
            state: vm.runtime.spriteContainers.serialize(),
            bytes: Array.from(new Uint8Array(await (await vm.saveProjectSb3()).arrayBuffer()))
        }));
        const loaded = await page.evaluate(async bytes => {
            vm.clear();
            const released = vm.renderer._containerCompositor.pool.length;
            await vm.loadProject(new Uint8Array(bytes));
            vm.renderer.draw();
            return {state: vm.runtime.spriteContainers.serialize(), released};
        }, saved.bytes);
        assert.deepEqual(loaded.state, saved.state);
        assert.equal(loaded.released, 0);
        console.log('PASS SB3 appearance round trip and framebuffer cleanup on clear');
        if (process.env.COMPONENTS_BENCHMARK === '1') {
            const benchmark = await page.evaluate(async () => {
                vm.stopAll();
                const r = vm.renderer;
                const runtime = vm.runtime;
                const source = runtime.getSpriteTargetByName('A//Red');
                const other = runtime.getSpriteTargetByName('A//N//Red2');
                other.setVisible(false);
                runtime.getSpriteTargetByName('Outside').setVisible(false);
                vm.setSpriteContainerEffects('A', null);
                vm.setSpriteContainerClip('A', null);
                source.setSize(35);
                for (let i = 0; i < 99; i++) {
                    const clone = source.makeClone();
                    runtime.addTarget(clone);
                    clone.setXY(-180 + ((i % 10) * 40), -130 + (Math.floor(i / 10) * 28));
                }
                source.setXY(180, 130);
                const gl = r.gl;
                const debug = gl.getExtension('WEBGL_debug_renderer_info');
                const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
                const webgl2 = typeof gl.createQuery === 'function';
                const timer = gl.getExtension(webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query');
                const samples = [];
                for (const width of [480, 960, 1920]) {
                    r.resize(width, width * 0.75);
                    for (const effect of [null, {ghost: 50}, {ghost: 50, whirl: 80, color: 40}]) {
                        vm.setSpriteContainerEffects('A', null);
                        if (effect) vm.setSpriteContainerEffects('A', effect);
                        for (let i = 0; i < 12; i++) {
                            r.dirty = true;
                            r.draw();
                        }
                        gl.finish();
                        let draws = 0;
                        const originalDraw = gl.drawArrays;
                        gl.drawArrays = function (...args) {
                            draws++;
                            return originalDraw.apply(this, args);
                        };
                        r.dirty = true;
                        r.draw();
                        gl.drawArrays = originalDraw;
                        const query = timer ? (webgl2 ? gl.createQuery() : timer.createQueryEXT()) : null;
                        if (query) {
                            if (webgl2) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
                            else timer.beginQueryEXT(timer.TIME_ELAPSED_EXT, query);
                        }
                        const times = [];
                        for (let trial = 0; trial < 5; trial++) {
                            const start = performance.now();
                            for (let i = 0; i < 30; i++) {
                                r.dirty = true;
                                r.draw();
                            }
                            gl.finish();
                            times.push((performance.now() - start) / 30);
                        }
                        let gpuMs = null;
                        if (query) {
                            if (webgl2) gl.endQuery(timer.TIME_ELAPSED_EXT);
                            else timer.endQueryEXT(timer.TIME_ELAPSED_EXT);
                            gl.flush();
                            for (let attempt = 0; attempt < 100; attempt++) {
                                await new Promise(resolve => setTimeout(resolve, 10));
                                const available = webgl2 ? gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) :
                                    timer.getQueryObjectEXT(query, timer.QUERY_RESULT_AVAILABLE_EXT);
                                if (!available) continue;
                                if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
                                    const ns = webgl2 ? gl.getQueryParameter(query, gl.QUERY_RESULT) :
                                        timer.getQueryObjectEXT(query, timer.QUERY_RESULT_EXT);
                                    gpuMs = Number((ns / 150 / 1e6).toFixed(3));
                                }
                                break;
                            }
                            if (webgl2) gl.deleteQuery(query);
                            else timer.deleteQueryEXT(query);
                        }
                        times.sort((a, b) => a - b);
                        samples.push({canvas: [gl.canvas.width, gl.canvas.height],
                            effect,
                            draws,
                            batchMedianMs: Number(times[2].toFixed(3)),
                            gpuMs,
                            surfaceBytes: r._containerCompositor.pool.reduce((n, s) =>
                                n + (s.width * s.height * 4), 0)});
                    }
                }
                return {gpu,
                    sprites: 100,
                    method: '5 batches of 30 forced redraws, gl.finish per batch; GPU timer if available; no VM steps',
                    samples};
            });
            console.log('BENCHMARK', JSON.stringify(benchmark));
        }
        console.log('PAGE_ERRORS', JSON.stringify(errors));
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
