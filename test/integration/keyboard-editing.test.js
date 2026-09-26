import webdriver from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import chromedriver from 'chromedriver';
import fs from 'fs';
import path from 'path';
import http from 'http';
import upstreamMeta from '../../src/addons/generated/upstream-meta.json';

const {By, Key} = webdriver;
let url = process.env.KEYBOARD_TEST_URL;
let server;
let driver;
let delayedKeyboardResponse;
const proxy = () => driver.findElement(By.css('.sa-mcp-keyboard-focus'));
const search = () => driver.findElement(By.css('.sa-mcp-input'));
const state = () => driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    requestAnimationFrame(() => {
    const B = window.ScratchBlocks;
    const w = B.getMainWorkspace();
    done({blocks: w.getAllBlocks(false).filter(b => !b.isShadow()).map(b => ({
        id: b.id, type: b.type, parent: b.getParent()?.id, next: b.getNextBlock()?.id,
        inputs: Object.fromEntries(b.inputList.map(i => [i.name, i.connection?.targetBlock()?.type])),
        fields: Object.fromEntries(b.inputList.flatMap(i => i.fieldRow.filter(f => f.name).map(f => [f.name, f.getValue()])))
    })), selected: B.selected?.id, dragging: !!w.isDragging(), focus: document.activeElement.className,
    cursor: document.querySelector('.sa-mcp-keyboard-cursor').dataset.kind});
    });
`);
const waitFocus = () => driver.wait(async () => (await state()).focus === 'sa-mcp-keyboard-focus', 5000);
const insert = async text => {
    await (await proxy()).sendKeys(text);
    await driver.wait(async () => (await search()).isDisplayed(), 5000);
    await (await search()).sendKeys(Key.ENTER);
    await waitFocus();
};

jest.setTimeout(90000);

beforeAll(async () => {
    if (!url) {
        const build = path.resolve(__dirname, '../../build');
        const types = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
            '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm'};
        server = http.createServer((request, response) => {
            const name = path.resolve(build, `.${new URL(request.url, 'http://localhost').pathname}`);
            if (!name.startsWith(`${build}${path.sep}`)) {
                response.writeHead(403).end();
                return;
            }
            response.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
            response.setHeader('Cache-Control', 'no-store');
            const stream = fs.createReadStream(name);
            stream.on('error', () => response.writeHead(404).end());
            const send = () => stream.pipe(response);
            if (delayedKeyboardResponse && name.includes('addon-entry-keyboard-editing') && name.endsWith('.js')) {
                delayedKeyboardResponse.send = send;
            } else send();
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        url = `http://127.0.0.1:${server.address().port}/editor.html`;
    }
    const service = new chrome.ServiceBuilder(process.env.CHROMEDRIVER_PATH || chromedriver.path).build();
    chrome.setDefaultService(service);
    const options = new chrome.Options().addArguments('--headless=new', '--window-size=1440,1000',
        '--autoplay-policy=no-user-gesture-required');
    driver = new webdriver.Builder().forBrowser('chrome').setChromeOptions(options).build();
    const navigateTo = driver.get.bind(driver);
    driver.get = async target => {
        await navigateTo(target);
        await driver.executeScript(`
            window.keyboardPageErrors = [];
            window.addEventListener('error', event => window.keyboardPageErrors.push(event.message));
            window.addEventListener('unhandledrejection', event => window.keyboardPageErrors.push(String(event.reason)));
        `);
    };
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.ScratchBlocks?.getMainWorkspace()'), 30000);
    // Fresh isolated browser profile. Only set the existing language preference.
    await driver.executeScript("localStorage.setItem('tw:language', 'en');");
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.ScratchBlocks?.getMainWorkspace()'), 30000);
});
afterAll(async () => {
    if (delayedKeyboardResponse?.send) delayedKeyboardResponse.send();
    try {
        if (driver) await driver.quit();
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
    }
});

afterEach(async () => {
    if (driver) expect(await driver.executeScript('return window.keyboardPageErrors || []')).toEqual([]);
});

beforeEach(async () => {
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.ScratchBlocks?.getMainWorkspace()'), 30000);
    await driver.findElement(By.xpath("//*[text()='Edit']")).click();
    const enable = await driver.findElements(By.xpath("//*[text()='Turn on Keyboard Editing Mode']"));
    if (enable.length) await enable[0].click();
    else await driver.findElement(By.xpath("//*[text()='Edit']")).click();
    await driver.wait(() => driver.executeScript(`const e = document.querySelector('.sa-mcp-keyboard-focus'); return e && !e.hidden;`), 10000);
    const bg = await driver.findElement(By.css('.blocklyMainBackground'));
    await driver.actions().mouseMove(bg, {x: 480, y: 220}).click().perform();
    await waitFocus();
});

test('Edit menu enables typing, hat placement, connected insertion, literals, navigation and undo', async () => {
    await insert('when this sprite clicked');
    expect((await state()).blocks.map(b => b.type)).toEqual(['event_whenthisspriteclicked']);
    expect((await state()).dragging).toBe(false);
    await insert('move 10 steps');
    let snapshot = await state();
    expect(snapshot.blocks.find(b => b.type === 'motion_movesteps').parent).toBeTruthy();
    expect(snapshot.cursor).toBe('input');
    await (await proxy()).sendKeys(Key.ENTER);
    await driver.wait(() => driver.findElement(By.css('.blocklyHtmlInput')).isDisplayed(), 5000);
    await driver.findElement(By.css('.blocklyHtmlInput')).clear();
    await driver.findElement(By.css('.blocklyHtmlInput')).sendKeys('23', Key.ENTER);
    await waitFocus();
    expect(await driver.executeScript(`return window.ScratchBlocks.getMainWorkspace().getAllBlocks(false)
        .find(b => b.type === 'motion_movesteps').getInputTargetBlock('STEPS').getFieldValue('NUM')`)).toBe('23');
    await insert('say "hello"');
    snapshot = await state();
    expect(snapshot.blocks.find(b => b.type === 'looks_say').parent)
        .toBe(snapshot.blocks.find(b => b.type === 'motion_movesteps').id);
    await driver.sleep(400); // Blockly batches undo events on a timer.
    await (await proxy()).sendKeys(Key.chord(Key.CONTROL, 'z'));
    await driver.wait(async () => !(await state()).blocks.some(b => b.type === 'looks_say'), 5000);
    expect((await state()).blocks).toHaveLength(2);
});

test('replaces a reporter without deleting it and restores the whole replacement with one undo', async () => {
    await insert('when this sprite clicked');
    await insert('move 10 steps');
    await insert('1 + 2');
    let snapshot = await state();
    expect(snapshot.blocks.find(b => b.type === 'motion_movesteps').inputs.STEPS).toBe('operator_add');
    await (await proxy()).sendKeys(Key.chord(Key.ALT, Key.ARROW_LEFT));
    await insert('x position');
    snapshot = await state();
    expect(snapshot.blocks.find(b => b.type === 'motion_movesteps').inputs.STEPS).toBe('motion_xposition');
    expect(snapshot.blocks.find(b => b.type === 'operator_add').parent).toBeNull();
    await driver.sleep(400);
    await (await proxy()).sendKeys(Key.chord(Key.CONTROL, 'z'));
    await driver.wait(async () => !(await state()).blocks.some(b => b.type === 'motion_xposition'), 5000);
    expect((await state()).blocks.find(b => b.type === 'motion_movesteps').inputs.STEPS).toBe('operator_add');
});

test('toggles boolean shadows, enters a C-block substack, and edits dropdowns with native keys', async () => {
    await insert('when this sprite clicked');
    await insert('move 10 steps');
    await insert('if');
    let snapshot = await state();
    expect(snapshot.cursor).toBe('input');
    const readBoolean = () => driver.executeScript(`
        const b = window.ScratchBlocks.getMainWorkspace().getAllBlocks(false).find(b => b.type === 'control_if');
        const shadow = b.getInputTargetBlock('CONDITION');
        return shadow.inputList.flatMap(i => i.fieldRow).find(f => f instanceof window.ScratchBlocks.FieldBooleanToggle).getValue();
    `);
    const before = await readBoolean();
    await (await proxy()).sendKeys(' ');
    expect(await readBoolean()).toBe(before);
    await driver.wait(async () => (await search()).isDisplayed(), 5000);
    await (await search()).sendKeys(Key.ESCAPE, Key.ESCAPE);
    await waitFocus();
    await (await proxy()).sendKeys(Key.ENTER);
    expect(await readBoolean()).not.toBe(before);
    await waitFocus();
    await (await proxy()).sendKeys(Key.ARROW_DOWN);
    expect((await state()).cursor).toBe('statement');
    await insert('set rotation style');
    snapshot = await state();
    expect(snapshot.blocks.find(b => b.type === 'motion_setrotationstyle').parent)
        .toBe(snapshot.blocks.find(b => b.type === 'control_if').id);
    expect(snapshot.cursor).toBe('field');
    await (await proxy()).sendKeys(Key.ENTER);
    await driver.wait(() => driver.executeScript('return window.ScratchBlocks.DropDownDiv.isVisible() || window.ScratchBlocks.WidgetDiv.isVisible()'), 5000);
    await driver.switchTo().activeElement().sendKeys(Key.ARROW_DOWN, Key.ENTER);
    await waitFocus();
    await (await proxy()).sendKeys(Key.chord(Key.SHIFT, Key.ARROW_UP));
    expect((await state()).cursor).toBe('statement');
    await (await proxy()).sendKeys(Key.ARROW_DOWN);
    expect((await state()).cursor).toBe('field');
});

test('IME composition is retained; Escape restores focus; Cmd+Enter forces a drag', async () => {
    await driver.executeScript(`
        const e = document.querySelector('.sa-mcp-keyboard-focus');
        e.focus();
        e.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
        e.value = '中文';
        e.dispatchEvent(new InputEvent('input', {bubbles: true, isComposing: true}));
    `);
    expect(await (await search()).isDisplayed()).toBe(false);
    await driver.executeScript(`document.querySelector('.sa-mcp-keyboard-focus')
        .dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '中文'}));`);
    expect(await (await search()).getAttribute('value')).toBe('中文');
    await (await search()).sendKeys(Key.ESCAPE, Key.ESCAPE);
    await waitFocus();
    await (await proxy()).sendKeys('when this sprite clicked');
    await (await search()).sendKeys(Key.chord(Key.META, Key.ENTER));
    expect((await state()).dragging).toBe(true);
    // Complete the real drag with a mouse release before testing a different focus owner.
    await driver.actions().mouseMove(await driver.findElement(By.css('.blocklyMainBackground')), {x: 550, y: 400})
        .click().perform();
    await waitFocus();
    await driver.sleep(400);
    await (await proxy()).sendKeys(Key.chord(Key.CONTROL, 'z'));
    await driver.wait(async () => (await state()).blocks.length === 0, 5000);
    const title = await driver.findElement(By.css('input[class*="project-title"]'));
    await title.click();
    await title.sendKeys('example');
    expect(await (await search()).isDisplayed()).toBe(false);
});

test('a terminal block in an occupied stack falls back to dragging and leaves the successor attached', async () => {
    await insert('when this sprite clicked');
    await insert('move 10 steps');
    await insert('say "hello"');
    await (await proxy()).sendKeys(Key.ARROW_UP);
    expect((await state()).cursor).toBe('after');
    await (await proxy()).sendKeys('stop all');
    await (await search()).sendKeys(Key.ENTER);
    const snapshot = await state();
    expect(snapshot.dragging).toBe(true);
    expect(snapshot.blocks.find(b => b.type === 'motion_movesteps').next)
        .toBe(snapshot.blocks.find(b => b.type === 'looks_say').id);
});

test('editor typing does not press VM keys; disabling restores legacy Shift-click search', async () => {
    await (await proxy()).sendKeys('move');
    expect(await driver.executeScript('return window.vm.runtime.ioDevices.keyboard.getKeyIsDown("any")')).toBe(false);
    await (await search()).sendKeys(Key.ESCAPE, Key.ESCAPE);
    await waitFocus();
    await driver.findElement(By.xpath("//*[text()='Edit']")).click();
    await driver.findElement(By.xpath("//*[text()='Turn off Keyboard Editing Mode']")).click();
    await driver.wait(async () => Boolean(await (await proxy()).getAttribute('hidden')), 5000);
    const bg = await driver.findElement(By.css('.blocklyMainBackground'));
    await driver.actions().mouseMove(bg, {x: 480, y: 220}).click().perform();
    await driver.switchTo().activeElement().sendKeys('a');
    expect(await (await search()).isDisplayed()).toBe(false);
    await driver.actions().keyDown(Key.SHIFT).mouseMove(bg, {x: 480, y: 220}).click().keyUp(Key.SHIFT).perform();
    expect(await (await search()).isDisplayed()).toBe(true);
});

test.each([
    ['light', false, false], ['dark', false, false], ['light', true, true], ['dark', true, true]
])('%s theme, compact=%s, small stage=%s keeps cursor aligned through zoom and scroll', async (theme, compact, small) => {
    await driver.executeScript(`
        localStorage.setItem('tw:theme', arguments[0]);
        const settings = JSON.parse(localStorage.getItem('tw:addons'));
        settings['editor-compact'] = {enabled: arguments[1]};
        localStorage.setItem('tw:addons', JSON.stringify(settings));
    `, theme, compact);
    await driver.get(url);
    await driver.wait(() => driver.executeScript(`return !!window.vm?.editingTarget &&
        !!document.querySelector('.sa-mcp-keyboard-focus') && !document.querySelector('.sa-mcp-keyboard-focus').hidden`), 30000);
    if (small) await driver.findElement(By.css('[title="Switch to small stage"]')).click();
    const bg = await driver.findElement(By.css('.blocklyMainBackground'));
    await driver.actions().mouseMove(bg, {x: 480, y: 220}).click().perform();
    await waitFocus();
    await insert('when this sprite clicked');
    await insert('move 10 steps');
    const alignment = () => driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        requestAnimationFrame(() => {
            const w = window.ScratchBlocks.getMainWorkspace();
            const field = w.getAllBlocks(false).find(b => b.type === 'motion_movesteps')
                .getInputTargetBlock('STEPS').svgPath_.getBoundingClientRect();
            const cursor = document.querySelector('.sa-mcp-keyboard-cursor').getBoundingClientRect();
            done([Math.abs(cursor.left - field.left + 2), Math.abs(cursor.top - field.top + 2)]);
        });
    `);
    expect((await alignment()).every(value => value < 1)).toBe(true);
    await driver.executeScript(`
        const w = window.ScratchBlocks.getMainWorkspace();
        w.zoomCenter(1);
        const m = w.getMetrics();
        w.scrollbar.set(m.viewLeft - m.contentLeft + 50, m.viewTop - m.contentTop + 40);
    `);
    expect((await alignment()).every(value => value < 1)).toBe(true);
    await (await proxy()).sendKeys(Key.ARROW_RIGHT, Key.ARROW_LEFT);
    expect((await alignment()).every(value => value < 1)).toBe(true);
    if (process.env.KEYBOARD_SCREENSHOTS) {
        fs.mkdirSync(process.env.KEYBOARD_SCREENSHOTS, {recursive: true});
        fs.writeFileSync(path.join(process.env.KEYBOARD_SCREENSHOTS, `${theme}-${compact ? 'compact' : 'normal'}.png`),
            await driver.takeScreenshot(), 'base64');
    }
});

test('switching sprites clears the old cursor and prevents cross-target connections', async () => {
    await insert('when this sprite clicked');
    await insert('move 10 steps');
    const original = await driver.executeScript('return window.vm.editingTarget.id');
    await driver.executeScript(`window.vm.setEditingTarget(window.vm.runtime.getTargetForStage().id)`);
    await driver.wait(() => driver.executeScript(`return window.vm.editingTarget.isStage &&
        !window.ScratchBlocks.getMainWorkspace().getAllBlocks(false).length`), 5000);
    const bg = await driver.findElement(By.css('.blocklyMainBackground'));
    await driver.actions().mouseMove(bg, {x: 480, y: 220}).click().perform();
    await waitFocus();
    expect((await state()).cursor).toBe('workspace');
    await (await proxy()).sendKeys('wait');
    await (await search()).sendKeys(Key.ENTER);
    expect((await state()).dragging).toBe(true);
    expect((await state()).blocks.every(b => !b.parent)).toBe(true);
    await driver.executeScript('window.vm.setEditingTarget(arguments[0])', original);
});

test('failed creation cleans partial blocks and restores event and resize state', async () => {
    await insert('when this sprite clicked');
    await (await proxy()).sendKeys('move');
    await driver.executeScript(`
        const B = window.ScratchBlocks;
        B.getMainWorkspace().setResizesEnabled(false);
        const original = B.Xml.domToBlock;
        B.Xml.domToBlock = function (...args) {
            B.Xml.domToBlock = original;
            original.apply(this, args);
            throw new Error('injected keyboard insertion failure');
        };
    `);
    await (await search()).sendKeys(Key.ENTER);
    expect((await state()).blocks.map(b => b.type)).toEqual(['event_whenthisspriteclicked']);
    expect(await (await search()).isDisplayed()).toBe(true);
    expect(await driver.executeScript('return window.ScratchBlocks.Events.isEnabled()')).toBe(true);
    expect(await driver.executeScript('return window.ScratchBlocks.getMainWorkspace().resizesEnabled_')).toBe(false);
    await driver.executeScript('window.ScratchBlocks.getMainWorkspace().setResizesEnabled(true);');
    await (await search()).sendKeys(Key.ENTER);
    await waitFocus();
    expect((await state()).blocks.some(b => b.type === 'motion_movesteps')).toBe(true);
});

test('settings-window disable closes search and menu changes broadcast back to settings', async () => {
    await (await proxy()).sendKeys('move');
    await driver.executeScript(`
        window.keyboardTestChannel = new BroadcastChannel('addons-change');
        window.keyboardTestMessages = [];
        window.keyboardTestChannel.onmessage = event => window.keyboardTestMessages.push(event.data);
        window.keyboardTestChannel.postMessage({version: arguments[0], store: {
            'keyboard-editing': {enabled: false}
        }});
    `, upstreamMeta.commit);
    await driver.wait(async () => Boolean(await (await proxy()).getAttribute('hidden')), 5000);
    expect(await (await search()).isDisplayed()).toBe(false);
    await driver.findElement(By.xpath("//*[text()='Edit']")).click();
    await driver.findElement(By.xpath("//*[text()='Turn on Keyboard Editing Mode']")).click();
    await driver.wait(() => driver.executeScript('return window.keyboardTestMessages.length > 0'), 5000);
    const change = await driver.executeScript('return window.keyboardTestMessages[0].store["keyboard-editing"]');
    expect(change.enabled).toBe(true);
    await driver.executeScript('window.keyboardTestChannel.close();');
});

test('insertion at a top stack connection keeps the original stack in place', async () => {
    await (await proxy()).sendKeys('move');
    await (await search()).sendKeys(Key.ENTER);
    expect((await state()).dragging).toBe(true);
    await driver.actions().mouseMove(await driver.findElement(By.css('.blocklyMainBackground')), {x: 520, y: 320})
        .click().perform();
    await waitFocus();
    const coordinates = () => driver.executeScript(`const b = window.ScratchBlocks.getMainWorkspace()
        .getAllBlocks(false).find(b => b.type === 'motion_movesteps');
        const p = b.getRelativeToSurfaceXY(); return [p.x, p.y];`);
    const before = await coordinates();
    await (await proxy()).sendKeys(Key.ARROW_UP);
    expect((await state()).cursor).toBe('before');
    await insert('say "before"');
    const snapshot = await state();
    expect(snapshot.blocks.find(b => b.type === 'looks_say').next)
        .toBe(snapshot.blocks.find(b => b.type === 'motion_movesteps').id);
    expect(await coordinates()).toEqual(before);
});

const keys = async (...value) => {
    await (await proxy()).sendKeys(...value);
    return state();
};
const undoInsertion = async () => {
    await driver.sleep(400);
    await keys(Key.chord(Key.CONTROL, 'z'));
};

test('head, shared joins and tail have stable vertical boundaries and one-step insertion undo', async () => {
    await insert('when this sprite clicked');
    const hat = (await state()).blocks[0];
    expect((await keys(Key.ARROW_UP)).cursor).toBe('body');
    expect((await keys(Key.ARROW_UP)).selected).toBe(hat.id);
    await keys(Key.ARROW_DOWN);
    await insert('move');
    const move = (await state()).blocks.find(b => b.type === 'motion_movesteps');
    expect((await keys(Key.ARROW_LEFT, Key.ARROW_RIGHT)).cursor).toBe('input');
    let snapshot = await keys(Key.ARROW_DOWN);
    expect(snapshot.cursor).toBe('after');
    expect((await keys(Key.ARROW_DOWN)).selected).toBe(move.id);
    expect((await state()).cursor).toBe('after');
    await insert('say "tail"');
    const say = (await state()).blocks.find(b => b.type === 'looks_say');
    snapshot = await keys(Key.ARROW_UP);
    expect(snapshot.cursor).toBe('after');
    expect(snapshot.selected).toBe(move.id);
    snapshot = await keys(Key.ARROW_DOWN);
    expect(snapshot.selected).toBe(say.id);
    expect(snapshot.cursor).toBe('input');
    await keys(Key.ARROW_UP);
    await insert('wait 1 seconds');
    snapshot = await state();
    const wait = snapshot.blocks.find(b => b.type === 'control_wait');
    expect(snapshot.blocks.find(b => b.id === move.id).next).toBe(wait.id);
    expect(wait.next).toBe(say.id);
    await undoInsertion();
    snapshot = await state();
    expect(snapshot.blocks.find(b => b.id === move.id).next).toBe(say.id);
    expect(snapshot.blocks.some(b => b.id === wait.id)).toBe(false);
});

test('empty and single-block substacks support entry, head insertion, tail and outer continuation', async () => {
    await insert('when this sprite clicked');
    await insert('if');
    const owner = (await state()).blocks.find(b => b.type === 'control_if');
    expect((await keys(Key.ARROW_RIGHT)).cursor).toBe('input');
    expect((await keys(Key.ARROW_DOWN)).cursor).toBe('statement');
    expect((await keys(Key.ARROW_UP)).cursor).toBe('input');
    // Inserting from the condition now defaults to the substack.
    await insert('move');
    const move = (await state()).blocks.find(b => b.type === 'motion_movesteps');
    expect(move.parent).toBe(owner.id);
    expect((await keys(Key.chord(Key.SHIFT, Key.ARROW_UP))).cursor).toBe('statement');
    expect((await keys(Key.ARROW_DOWN)).selected).toBe(move.id);
    expect((await keys(Key.ARROW_UP)).cursor).toBe('statement');
    await insert('say "first"');
    let snapshot = await state();
    expect(snapshot.blocks.find(b => b.type === 'looks_say').next).toBe(move.id);
    expect(snapshot.blocks.find(b => b.id === owner.id).inputs.SUBSTACK).toBe('looks_say');
    await undoInsertion();
    // The removed cursor resets safely. Recover the containing C block by visual navigation.
    await keys(Key.chord(Key.ALT, Key.ARROW_DOWN), Key.ARROW_DOWN, Key.ARROW_DOWN);
    expect((await state()).selected).toBe(owner.id);
    await keys(Key.ARROW_DOWN, Key.ARROW_DOWN);
    expect((await state()).selected).toBe(move.id);
    expect((await keys(Key.ARROW_DOWN)).cursor).toBe('after');
    snapshot = await keys(Key.ARROW_DOWN);
    expect(snapshot.cursor).toBe('after');
    expect(snapshot.selected).toBe(owner.id);
    await insert('wait 1 seconds');
    snapshot = await state();
    expect(snapshot.blocks.find(b => b.id === owner.id).next)
        .toBe(snapshot.blocks.find(b => b.type === 'control_wait').id);
    expect(snapshot.blocks.find(b => b.id === move.id).next).toBeNull();
});

test('if/else entries remain distinct and cap-block tails do not invent a connection', async () => {
    await insert('when this sprite clicked');
    await insert('if else');
    const owner = (await state()).blocks.find(b => b.type === 'control_if_else');
    expect(owner).toBeTruthy();
    await keys(Key.ARROW_DOWN, Key.ARROW_DOWN); // first empty entry -> second empty entry
    expect((await state()).cursor).toBe('statement');
    await insert('stop all');
    let snapshot = await state();
    const stop = snapshot.blocks.find(b => b.type === 'control_stop');
    expect(snapshot.blocks.find(b => b.id === owner.id).inputs.SUBSTACK2).toBe('control_stop');
    expect(snapshot.blocks.find(b => b.id === owner.id).inputs.SUBSTACK).toBeNull();
    expect(stop.next).toBeNull();
    snapshot = await keys(Key.ARROW_DOWN);
    expect(snapshot.selected).toBe(owner.id);
    expect(snapshot.cursor).toBe('after');
    expect((await keys(Key.ARROW_DOWN)).selected).toBe(owner.id);
    snapshot = await keys(Key.ARROW_UP);
    expect(snapshot.selected).toBe(stop.id);
    expect(snapshot.cursor).toBe('field');
    await keys(Key.chord(Key.SHIFT, Key.ARROW_UP));
    expect((await state()).cursor).toBe('statement');
    await undoInsertion();
    expect((await state()).blocks.some(b => b.id === stop.id)).toBe(false);
});

test('position cursor is centered and round/boolean outlines use the actual SVG shape', async () => {
    const bg = await driver.findElement(By.css('.blocklyMainBackground'));
    await driver.executeScript(`document.addEventListener('pointerdown',
        e => { window.keyboardTestPointer = [e.clientX, e.clientY]; }, {once:true});`);
    await driver.actions().mouseMove(bg, {x: 420, y: 200}).click().perform();
    await waitFocus();
    const delta = await driver.executeScript(`
        const r = document.querySelector('.sa-mcp-keyboard-cursor').getBoundingClientRect();
        return [r.left + r.width / 2 - window.keyboardTestPointer[0],
            r.top + r.height / 2 - window.keyboardTestPointer[1]];
    `);
    expect(delta.every(value => Math.abs(value) < 1)).toBe(true);
    await insert('when this sprite clicked');
    for (const [query, type, input] of [['move', 'motion_movesteps', 'STEPS'], ['if', 'control_if', 'CONDITION']]) {
        await insert(query);
        const shape = await driver.executeScript(`
            const b = window.ScratchBlocks.getMainWorkspace().getAllBlocks(false).find(b => b.type === arguments[0]);
            const i = b.getInput(arguments[1]);
            const source = i.connection.targetBlock()?.svgPath_ || i.outlinePath;
            const cursor = document.querySelector('.sa-mcp-keyboard-cursor');
            const drawn = cursor.querySelector('path');
            const a = source.getBoundingClientRect(), r = drawn.getBoundingClientRect();
            return {outline: cursor.dataset.outline, same: drawn.getAttribute('d') === source.getAttribute('d'),
                delta: [a.left - r.left, a.top - r.top, a.width - r.width, a.height - r.height]};
        `, type, input);
        expect(shape.outline).toBe('true');
        expect(shape.same).toBe(true);
        expect(shape.delta.every(value => Math.abs(value) < 1)).toBe(true);
        if (process.env.KEYBOARD_SCREENSHOTS) {
            fs.writeFileSync(path.join(process.env.KEYBOARD_SCREENSHOTS, `${input}-outline.png`),
                await driver.takeScreenshot(), 'base64');
        }
        await keys(Key.ARROW_DOWN);
    }
});

test('Tab crosses nested reporter slots and native text editors keep the structural outline synchronized', async () => {
    await insert('when this sprite clicked');
    await insert('go to x: 10 y: 20');
    await insert('1 + 2');
    const snapshot = await state();
    const add = snapshot.blocks.find(b => b.type === 'operator_add');
    const go = snapshot.blocks.find(b => b.type === 'motion_gotoxy');
    expect(add).toBeTruthy();
    const selectedInput = () => driver.executeScript(`
        const w = window.ScratchBlocks.getMainWorkspace();
        const cursor = document.querySelector('.sa-mcp-keyboard-cursor path');
        const r = cursor.getBoundingClientRect();
        return w.getAllBlocks(false).filter(b => !b.isShadow()).flatMap(b => b.inputList.map(i => {
            const path = i.connection?.targetBlock()?.svgPath_ || i.outlinePath;
            if (!path) return null;
            const p = path.getBoundingClientRect();
            return Math.abs(p.left-r.left)<1 && Math.abs(p.top-r.top)<1 && Math.abs(p.width-r.width)<1 ? [b.id, i.name] : null;
        })).find(Boolean);
    `);
    expect(await selectedInput()).toEqual([add.id, 'NUM1']);
    await keys(Key.TAB);
    expect(await selectedInput()).toEqual([add.id, 'NUM2']);
    await keys(Key.TAB);
    expect(await selectedInput()).toEqual([go.id, 'Y']);
    await keys(Key.TAB); // Last inline input stays put, never enters another block.
    expect(await selectedInput()).toEqual([go.id, 'Y']);
    await keys(Key.chord(Key.SHIFT, Key.TAB), Key.ENTER);
    const active = () => driver.switchTo().activeElement();
    await (await active()).sendKeys('37', Key.TAB);
    await state();
    expect(await selectedInput()).toEqual([go.id, 'Y']);
    expect(await (await active()).getAttribute('class')).toContain('blocklyHtmlInput');
    await (await active()).sendKeys(Key.chord(Key.SHIFT, Key.TAB));
    await state();
    expect(await selectedInput()).toEqual([add.id, 'NUM2']);
    expect(await (await active()).getAttribute('value')).toBe('37');
    await (await active()).sendKeys(Key.ENTER);
    await waitFocus();
    await keys(Key.chord(Key.SHIFT, Key.ARROW_DOWN));
    expect((await state()).selected).toBe(go.id);
    expect((await state()).cursor).toBe('after');
    await keys(Key.chord(Key.SHIFT, Key.ARROW_UP));
    expect((await state()).cursor).toBe('body');
    const help = await driver.findElement(By.css('.sa-mcp-keyboard-hint')).getText();
    const mac = await driver.executeScript('return /Mac|iPhone|iPad/.test(navigator.platform)');
    expect(help).toContain(mac ? 'Option+' : 'Alt+');
    expect(help).not.toContain(mac ? 'Alt+' : 'Cmd+');
});

test('keyboard and mouse search addons start independently and share one popup across dynamic toggles', async () => {
    // Start with only keyboard editing: middle-click-popup has never run in this page.
    await driver.executeScript(`
        const settings = JSON.parse(localStorage.getItem('tw:addons'));
        settings['middle-click-popup'] = {enabled: false};
        settings['keyboard-editing'] = {enabled: true};
        localStorage.setItem('tw:addons', JSON.stringify(settings));
    `);
    await driver.get(url);
    await driver.wait(() => driver.executeScript(`return !!window.vm?.editingTarget &&
        !!document.querySelector('.sa-mcp-keyboard-focus')`), 30000);
    const clickWorkspace = async () => {
        await driver.actions().mouseMove(await driver.findElement(By.css('.blocklyMainBackground')),
            {x: 500, y: 220}).click().perform();
    };
    await clickWorkspace();
    await waitFocus();
    await insert('when this sprite clicked');
    await insert('move 10 steps');
    expect((await state()).blocks.find(b => b.type === 'motion_movesteps').parent).toBeTruthy();
    await driver.executeScript(`window.addonToggleChannel = new BroadcastChannel('addons-change');`);
    const toggle = (mouse, keyboard) => driver.executeScript(`
        const store = JSON.parse(localStorage.getItem('tw:addons'));
        store['middle-click-popup'] = {enabled: arguments[0]};
        store['keyboard-editing'] = {enabled: arguments[1]};
        localStorage.setItem('tw:addons', JSON.stringify(store));
        window.addonToggleChannel.postMessage({version: arguments[2], store});
    `, mouse, keyboard, upstreamMeta.commit);
    await toggle(true, true);
    await driver.wait(() => driver.executeScript(`return JSON.parse(localStorage.getItem('tw:addons'))['middle-click-popup'].enabled`), 5000);
    await keys('say');
    await toggle(false, true); // Disabling mouse search must leave keyboard-owned search open.
    await driver.wait(() => driver.executeScript(`return !JSON.parse(localStorage.getItem('tw:addons'))['middle-click-popup'].enabled`), 5000);
    expect(await (await search()).isDisplayed()).toBe(true);
    await (await search()).sendKeys(Key.ESCAPE, Key.ESCAPE);
    await waitFocus();
    await toggle(true, false);
    await driver.wait(async () => Boolean(await (await proxy()).getAttribute('hidden')), 5000);
    await driver.actions().keyDown(Key.SHIFT)
        .mouseMove(await driver.findElement(By.css('.blocklyMainBackground')), {x: 700, y: 450})
        .click().keyUp(Key.SHIFT).perform();
    await driver.wait(async () => (await search()).isDisplayed(), 5000);
    expect(await driver.executeScript('return document.querySelectorAll(".sa-mcp-root").length')).toBe(1);
    await (await search()).sendKeys('say', Key.ENTER);
    expect((await state()).dragging).toBe(true);
    await clickWorkspace();
    await toggle(false, false);
    await driver.wait(() => driver.executeScript(`return !JSON.parse(localStorage.getItem('tw:addons'))['middle-click-popup'].enabled`), 5000);
    await driver.actions().keyDown(Key.SHIFT)
        .mouseMove(await driver.findElement(By.css('.blocklyMainBackground')), {x: 700, y: 450})
        .click().keyUp(Key.SHIFT).perform();
    expect(await (await search()).isDisplayed()).toBe(false);
    // Menu enable changes only the keyboard addon, even when mouse search is disabled.
    await driver.findElement(By.xpath("//*[text()='Edit']")).click();
    await driver.findElement(By.xpath("//*[text()='Turn on Keyboard Editing Mode']")).click();
    await driver.wait(async () => !(await (await proxy()).getAttribute('hidden')), 5000);
    expect(await driver.executeScript(`return JSON.parse(localStorage.getItem('tw:addons'))['middle-click-popup'].enabled`)).toBe(false);
    await toggle(true, true);
    await driver.executeScript(`
        window.addonToggleChannel.close();
        const settings = JSON.parse(localStorage.getItem('tw:addons'));
        settings['middle-click-popup'] = {enabled: true};
        settings['keyboard-editing'] = {enabled: false};
        localStorage.setItem('tw:addons', JSON.stringify(settings));
    `);
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.vm?.editingTarget && !!document.querySelector(".sa-mcp-root")'), 30000);
    expect(await driver.executeScript('return document.querySelectorAll(".sa-mcp-keyboard-focus").length')).toBe(0);
    await driver.findElement(By.css('body')).sendKeys(Key.chord(Key.CONTROL, Key.SPACE));
    await driver.wait(async () => (await search()).isDisplayed(), 5000);
    await (await search()).sendKeys('move', Key.ENTER);
    expect((await driver.executeScript('return window.ScratchBlocks.getMainWorkspace().isDragging()'))).toBe(true);
});

(process.env.KEYBOARD_TEST_URL ? test.skip : test)('disabling during first addon load wins when the runtime arrives', async () => {
    await driver.executeScript(`
        const settings = JSON.parse(localStorage.getItem('tw:addons'));
        settings['keyboard-editing'] = {enabled: false};
        localStorage.setItem('tw:addons', JSON.stringify(settings));
    `);
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.vm?.editingTarget && !!window.ScratchBlocks?.getMainWorkspace()'), 30000);
    delayedKeyboardResponse = {};
    try {
        await driver.findElement(By.xpath("//*[text()='Edit']")).click();
        await driver.findElement(By.xpath("//*[text()='Turn on Keyboard Editing Mode']")).click();
        await driver.wait(() => Boolean(delayedKeyboardResponse.send), 5000);
        await driver.findElement(By.xpath("//*[text()='Edit']")).click();
        await driver.findElement(By.xpath("//*[text()='Turn off Keyboard Editing Mode']")).click();
    } finally {
        if (delayedKeyboardResponse.send) delayedKeyboardResponse.send();
        delayedKeyboardResponse = null;
    }
    await driver.wait(() => driver.executeScript('return !!document.querySelector(".sa-mcp-keyboard-focus")'), 5000);
    expect(await (await proxy()).getAttribute('hidden')).toBeTruthy();
    expect(await driver.executeScript('return document.querySelector(".sa-mcp-keyboard-cursor").hidden')).toBe(true);
    await driver.findElement(By.xpath("//*[text()='Edit']")).click();
    await driver.findElement(By.xpath("//*[text()='Turn on Keyboard Editing Mode']")).click();
    await driver.wait(async () => !(await (await proxy()).getAttribute('hidden')), 5000);
    expect(await driver.executeScript('return document.querySelectorAll(".sa-mcp-keyboard-focus").length')).toBe(1);
});
