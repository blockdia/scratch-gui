/* eslint-env browser */
// Cross-browser release checks using the GUI's installed scratch-blocks package.
const {firefox, chromium, webkit} = require(process.env.KEYBOARD_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

(async () => {
    const browserType = process.env.KEYBOARD_BROWSER || 'firefox';
    const engine = {firefox, chromium, webkit}[browserType];
    assert(engine, `Unknown browser: ${browserType}`);
    let server;
    let browser;
    let page;
    try {
        let url = process.env.KEYBOARD_TEST_URL;
        if (!url) {
            const root = path.resolve(__dirname, '../build');
            const types = {'.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.svg': 'image/svg+xml',
                '.json': 'application/json',
                '.wasm': 'application/wasm'};
            server = http.createServer((request, response) => {
                const file = path.resolve(root, `.${new URL(request.url, 'http://localhost').pathname}`);
                if (!file.startsWith(`${root}${path.sep}`)) {
                    response.writeHead(403).end();
                    return;
                }
                response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
                const stream = fs.createReadStream(file);
                stream.on('error', () => response.writeHead(404).end());
                stream.pipe(response);
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            url = `http://127.0.0.1:${server.address().port}/editor.html`;
        }
        browser = await engine.launch({headless: true});
        page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.evaluate(() => {
            localStorage.setItem('tw:language', 'en');
            localStorage.setItem('tw:addons', JSON.stringify({
                'keyboard-editing': {enabled: true}, 'middle-click-popup': {enabled: false}
            }));
        });
        await page.reload();
        await page.waitForFunction(() => window.vm?.editingTarget &&
            document.querySelector('.sa-mcp-keyboard-focus')?.hidden === false);
        const focus = page.locator('.sa-mcp-keyboard-focus');
        const search = page.locator('.sa-mcp-input');
        const waitFocus = () => page.waitForFunction(() =>
            document.activeElement.className === 'sa-mcp-keyboard-focus');
        const key = value => focus.press(value);
        const insert = async query => {
            await focus.pressSequentially(query);
            await search.waitFor({state: 'visible'});
            await search.press('Enter');
            await waitFocus();
        };
        const snapshot = () => page.evaluate(() => {
            const B = window.ScratchBlocks;
            return {kind: document.querySelector('.sa-mcp-keyboard-cursor').dataset.kind,
                selected: B.selected?.id,
                dragging: B.getMainWorkspace().isDragging(),
                blocks: B.getMainWorkspace().getAllBlocks(false)
                    .filter(b => !b.isShadow())
                    .map(b => ({
                        id: b.id,
                        type: b.type,
                        parent: b.getParent()?.id,
                        next: b.getNextBlock()?.id,
                        inputs: Object.fromEntries(b.inputList.map(i => [i.name, i.connection?.targetBlock()?.type]))
                    }))};
        });
        await page.locator('.blocklyMainBackground').click({position: {x: 650, y: 240}});
        await waitFocus();
        await insert('when this sprite clicked');
        await insert('go to x: 10 y: 20');
        await insert('1 + 2');
        let state = await snapshot();
        const go = state.blocks.find(b => b.type === 'motion_gotoxy');
        const add = state.blocks.find(b => b.type === 'operator_add');
        assert.equal(go.inputs.X, 'operator_add');
        await key('Tab');
        await key('Tab');
        assert.equal((await snapshot()).selected, go.id);
        await key('Shift+Tab');
        assert.equal((await snapshot()).selected, add.id);
        await key('Enter');
        await page.locator('.blocklyHtmlInput').fill('37');
        await page.locator('.blocklyHtmlInput').press('Tab');
        assert.equal((await snapshot()).selected, go.id);
        await page.locator('.blocklyHtmlInput').press('Shift+Tab');
        assert.equal((await snapshot()).selected, add.id);
        assert.equal(await page.locator('.blocklyHtmlInput').inputValue(), '37');
        await page.locator('.blocklyHtmlInput').press('Enter');
        await waitFocus();
        await key('Shift+ArrowDown');
        await insert('if');
        const owner = (await snapshot()).blocks.find(b => b.type === 'control_if');
        const booleanValue = () => page.evaluate(() => window.ScratchBlocks.getMainWorkspace()
            .getAllBlocks(false)
            .find(b => b.type === 'control_if')
            .getInputTargetBlock('CONDITION')
            .inputList.flatMap(i => i.fieldRow).find(f => f instanceof window.ScratchBlocks.FieldBooleanToggle)
            .getValue());
        const before = await booleanValue();
        await key('Enter');
        assert.notEqual(await booleanValue(), before);
        await insert('move 10 steps');
        const move = (await snapshot()).blocks.find(b => b.type === 'motion_movesteps');
        assert.equal(move.parent, owner.id);
        await key('Shift+ArrowUp');
        await insert('say "first"');
        assert.equal((await snapshot()).blocks.find(b => b.type === 'looks_say').next, move.id);
        // Blockly batches its native undo queue asynchronously.
        await page.waitForTimeout(400);
        await key('Control+z');
        state = await snapshot();
        assert(!state.blocks.some(b => b.type === 'looks_say'));
        assert.equal(state.blocks.find(b => b.id === owner.id).inputs.SUBSTACK, 'motion_movesteps');
        await key('Alt+ArrowDown');
        await key('Shift+ArrowDown');
        await focus.pressSequentially('stop all');
        await search.press('Control+Enter');
        assert.equal((await snapshot()).dragging, true);
        await page.mouse.click(850, 500);
        await waitFocus();
        await key('ArrowUp');
        await focus.evaluate(element => {
            element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
            element.value = '中文';
            element.dispatchEvent(new InputEvent('input', {bubbles: true, isComposing: true}));
            element.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '中文'}));
        });
        assert.equal(await search.inputValue(), '中文');
        await search.press('Escape');
        await search.press('Escape');
        await waitFocus();
        await page.getByText('Edit', {exact: true}).click();
        await page.getByText('Turn off Keyboard Editing Mode', {exact: true}).click();
        await page.waitForFunction(() => document.querySelector('.sa-mcp-keyboard-focus').hidden);
        assert.equal(await page.locator('.sa-mcp-root').count(), 1);
        assert.deepEqual(errors, []);
        if (process.env.KEYBOARD_SCREENSHOTS) {
            fs.mkdirSync(process.env.KEYBOARD_SCREENSHOTS, {recursive: true});
            const screenshot = path.join(process.env.KEYBOARD_SCREENSHOTS, `${browserType}-complete.png`);
            await page.screenshot({path: screenshot});
        }
        console.log(JSON.stringify({browser: browserType,
            version: browser.version(),
            checks: 'passed',
            pageErrors: errors}));
    } catch (error) {
        if (page && process.env.KEYBOARD_SCREENSHOTS) {
            fs.mkdirSync(process.env.KEYBOARD_SCREENSHOTS, {recursive: true});
            await page.screenshot({path: path.join(process.env.KEYBOARD_SCREENSHOTS, `${browserType}-failure.png`)});
        }
        throw error;
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
