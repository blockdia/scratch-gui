/* eslint-env browser */
/* global vm */
// Build with BLOCKDIA_LOCAL_PACKAGES=1; exercises real WebGL pixels, not mocked filtering.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8636/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget);
        if (process.env.COMPONENTS_SMALL_STAGE === '1') {
            await page.getByTitle(/Switch to small stage|小舞台/).first()
                .click();
        }
        const results = await page.evaluate(() => {
            vm.stopAll();
            vm.runtime.targets.forEach(target => {
                if (!target.isStage) target.setVisible(false);
            });
            const r = vm.renderer;
            const gl = r.gl;
            const maskId = r.createBitmapSkin(new ImageData(new Uint8ClampedArray([
                0, 0, 0, 255, 255, 255, 255, 128, 255, 0, 0, 255, 0, 0, 0, 0
            ]), 2, 2), 1, [1, 1]);
            const baseId = r.createBitmapSkin(new ImageData(new Uint8ClampedArray([
                255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255
            ]), 2, 2), 1, [1, 1]);
            const id = r.createDrawable('sprite');
            const d = r._allDrawables[id];
            r.updateDrawablePosition(id, [0, 0]);
            r.updateDrawableDirectionScale(id, 90, [10000, 10000]);
            const result = [];
            const draw = gl.drawArrays;
            let sharedFilter = null;
            gl.drawArrays = function (...args) {
                const program = gl.getParameter(gl.CURRENT_PROGRAM);
                const active = gl.getParameter(gl.ACTIVE_TEXTURE);
                const location = gl.getUniformLocation(program, 'u_mask');
                if (location !== null && d.skin === d.maskSkin) {
                    gl.activeTexture(gl.TEXTURE0 + gl.getUniform(program, location));
                    if (gl.getParameter(gl.TEXTURE_BINDING_2D) === d.maskSkin.getTexture(d.scale)) {
                        sharedFilter = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER);
                    }
                }
                gl.activeTexture(active);
                return draw.apply(this, args);
            };
            try {
                for (const shared of [false, true]) {
                    r.updateDrawableSkinId(id, shared ? maskId : baseId);
                    for (const mode of ['alpha', 'luminance']) {
                        for (const inverted of [false, true]) {
                            d.updateCostumeMask({skinId: maskId,
                                mode,
                                space: 'local',
                                inverted,
                                x: 0,
                                y: 0,
                                width: 2,
                                height: 2});
                            r.dirty = true;
                            r.draw();
                            d.updateCPURenderAttributes();
                            const samples = [];
                            // Include both sides of the central texel boundary, corners, and partial alpha.
                            for (const [x, y] of [[-50, 50], [50, 50], [-50, -50], [50, -50], [-2, 50], [2, 50]]) {
                                const px = Math.floor((x + 240) * r.canvas.width / 480);
                                const py = Math.floor((y + 180) * r.canvas.height / 360);
                                const world = [((px + 0.5) * 480 / r.canvas.width) - 240,
                                    ((py + 0.5) * 360 / r.canvas.height) - 180];
                                const gpu = new Uint8Array(4);
                                gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, gpu);
                                const cpu = Array.from(d.constructor.sampleColor4b(world, d, new Uint8ClampedArray(4)));
                                samples.push({gpu: Array.from(gpu), cpu, hit: d.isTouching(world)});
                            }
                            result.push({shared, mode, inverted, samples});
                        }
                    }
                }
                result.push({sharedFilter, nearest: gl.NEAREST});
            } finally {
                gl.drawArrays = draw;
                r.destroyDrawable(id, 'sprite');
                r.destroySkin(maskId);
                r.destroySkin(baseId);
            }
            return result;
        });
        const filtering = results.pop();
        assert.equal(filtering.sharedFilter, filtering.nearest, 'shared mask still uses NEAREST at draw time');
        for (const result of results) {
            for (const sample of result.samples) {
                const expected = sample.cpu.slice(0, 3).map(value => value + 255 - sample.cpu[3]);
                sample.gpu.slice(0, 3).forEach((value, i) => assert(Math.abs(value - expected[i]) <= 2,
                    `shared=${result.shared} mode=${result.mode}: GPU ${sample.gpu} != CPU ${expected}`));
                assert.equal(sample.hit, sample.cpu[3] > 0);
            }
            console.log(`PASS shared=${result.shared} mode=${result.mode} inverted=${result.inverted}: ` +
                'GPU/CPU/hit texels');
        }
        assert.deepEqual(errors, []);
        console.log('PAGE_ERRORS []');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
