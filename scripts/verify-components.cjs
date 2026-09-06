// Run against a local editor using BLOCKDIA_LOCAL_COMPONENTS=1.
// Requires Playwright; optional runtime and Chrome paths are configured via environment variables.
const {
  chromium
} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.COMPONENTS_CHROME_PATH,
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1000
      }
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8603/editor.html', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length, {
      timeout: 90000
    });
    const add = type => page.locator('select').filter({
      has: page.locator('option[value=slider]')
    }).selectOption(type);
    await add('slider');
    await page.waitForFunction(() => vm.editingTarget.componentController);
    await page.evaluate(() => {
      window.sliderTarget = vm.editingTarget;
      sliderTarget.setXY(-80, 70);
    });
    const stage = await page.evaluate(() => {
      const r = vm.renderer.canvas.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height
      };
    });
    const point = (x, y) => ({
      x: stage.x + (x / 480 + 0.5) * stage.w,
      y: stage.y + (0.5 - y / 360) * stage.h
    });
    let a = point(-80, 70),
      b = point(4, 70);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, {
      steps: 8
    });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => sliderTarget.component.properties.value), 100);
    assert.deepEqual(await page.evaluate(() => [sliderTarget.x, sliderTarget.y]), [-80, 70]);
    console.log('PASS slider pointer drag without target drag');
    await page.evaluate(() => {
      sliderTarget.setXY(-80, 0);
      sliderTarget.setDirection(0);
      sliderTarget.setSize(150);
    });
    a = point(-80, 126);
    b = point(-80, -126);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, {
      steps: 10
    });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => sliderTarget.component.properties.value), 0);
    await page.evaluate(() => {
      sliderTarget.setDirection(90);
      sliderTarget.setSize(100);
      sliderTarget.setXY(-80, 70);
    });
    console.log('PASS rotated and scaled slider drag');
    await page.getByRole('tab', {
      name: /造型|Costumes/
    }).click();
    await page.screenshot({
      path: '/tmp/components-costume-before.png'
    });
    await page.locator('summary').filter({
      hasText: /轨道导轨|Track guides/
    }).click();
    const handle = page.locator('circle[data-endpoint=end]');
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => sliderTarget.component.metadata.sliderTrack.end[0]), 85);
    await page.getByRole('button', {
      name: /撤销导轨修改|Undo guide change/
    }).click();
    assert.equal(await page.evaluate(() => sliderTarget.component.metadata.sliderTrack.end[0]), 84);
    await page.getByRole('button', {
      name: /重做导轨修改|Redo guide change/
    }).click();
    assert.equal(await page.evaluate(() => sliderTarget.component.metadata.sliderTrack.end[0]), 85);
    const endpointBox = await handle.boundingBox();
    await page.mouse.move(endpointBox.x + endpointBox.width / 2, endpointBox.y + endpointBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(endpointBox.x + endpointBox.width / 2 + 20, endpointBox.y + endpointBox.height / 2);
    await page.mouse.up();
    assert.ok(await page.evaluate(() => sliderTarget.component.metadata.sliderTrack.end[0] > 85));
    await page.getByRole('button', {
      name: /撤销导轨修改|Undo guide change/
    }).click();
    assert.equal(await page.evaluate(() => sliderTarget.component.metadata.sliderTrack.end[0]), 85);
    await page.screenshot({
      path: '/tmp/components-geometry.png'
    });
    console.log('PASS geometry keyboard edit undo redo');
    await page.getByRole('tab', {
      name: /代码|Code/
    }).click();
    for (const [type, x, y] of [['button', 100, 70], ['toggle', 100, -40], ['progress', -80, -80]]) {
      await add(type);
      await page.waitForFunction(t => vm.editingTarget.component && vm.editingTarget.component.type === t, type);
      await page.evaluate(({
        type,
        x,
        y
      }) => {
        window[type + 'Target'] = vm.editingTarget;
        vm.editingTarget.setXY(x, y);
      }, {
        type,
        x,
        y
      });
    }
    a = point(100, -40);
    await page.mouse.click(a.x, a.y);
    assert.equal(await page.evaluate(() => toggleTarget.component.properties.checked), true);
    console.log('PASS toggle click');
    const results = await page.evaluate(async () => {
      vm.runtime.setCompilerOptions({
        enabled: true
      });
      const target = buttonTarget;
      target.blocks.createBlock({
        id: 'component-hat',
        opcode: 'components_whenClicked',
        next: 'component-command',
        parent: null,
        inputs: {},
        fields: {},
        topLevel: true,
        shadow: false
      });
      target.blocks.createBlock({
        id: 'component-command',
        opcode: 'motion_changexby',
        next: null,
        parent: 'component-hat',
        inputs: {
          DX: {
            name: 'DX',
            block: 'component-number',
            shadow: 'component-number'
          }
        },
        fields: {},
        topLevel: false,
        shadow: false
      });
      target.blocks.createBlock({
        id: 'component-number',
        opcode: 'math_number',
        next: null,
        parent: 'component-command',
        inputs: {},
        fields: {
          NUM: {
            name: 'NUM',
            value: 7
          }
        },
        topLevel: false,
        shadow: true
      });
      const threads = vm.runtime.startHats('components_whenClicked', null, target);
      vm.runtime._step();
      return {
        x: target.x,
        compiled: threads.map(t => t.isCompiled)
      };
    });
    assert.equal(results.x, 107);
    console.log('PASS component event execution', results);
    await page.evaluate(() => {
      buttonTarget.blocks.deleteBlock('component-hat');
    });
    const cloneResult = await page.evaluate(() => {
      const clone = sliderTarget.makeClone();
      vm.runtime.addTarget(clone);
      clone.setXY(-80, -20);
      clone.componentController.setProperties({
        value: 80
      });
      const result = {
        original: sliderTarget.component.properties.value,
        clone: clone.component.properties.value,
        parts: clone.getDrawableIDs().length
      };
      vm.runtime.disposeTarget(clone);
      return result;
    });
    assert.deepEqual(cloneResult, {
      original: 0,
      clone: 80,
      parts: 3
    });
    console.log('PASS clone independent state and lifecycle');
    const sensing = await page.evaluate(() => {
      const ordinary = vm.runtime.targets.find(t => !t.isStage && !t.component);
      const saved = [ordinary.x, ordinary.y];
      ordinary.setXY(-164, 70);
      buttonTarget.setXY(-164, 70);
      const result = {
        ordinaryToComponent: ordinary.isTouchingSprite(sliderTarget.getName()),
        componentToOrdinary: sliderTarget.isTouchingSprite(ordinary.getName()),
        componentToComponent: sliderTarget.isTouchingSprite(buttonTarget.getName())
      };
      ordinary.setXY(...saved);
      buttonTarget.setXY(100, 70);
      const vis = vm.runtime.targets.filter(t => !t.isStage && t !== sliderTarget).map(t => [t, t.visible]);
      vis.forEach(([t]) => t.setVisible(false));
      sliderTarget.componentController.setProperties({
        value: 100
      });
      result.selfColor = sliderTarget.isTouchingColor([76, 151, 255]);
      vis.forEach(([t, v]) => t.setVisible(v));
      sliderTarget.componentController.setProperties({
        value: 0
      });
      return result;
    });
    assert.deepEqual(sensing, {
      ordinaryToComponent: true,
      componentToOrdinary: true,
      componentToComponent: true,
      selfColor: false
    });
    console.log('PASS ordinary/component sensing and own-color exclusion');
    for (const enabled of [false, true]) {
      const execution = await page.evaluate(enabled => {
        const t = sliderTarget;
        vm.runtime.stopAll();
        vm.runtime.setCompilerOptions({
          enabled
        });
        const prefix = 'compat-' + enabled;
        const id = name => prefix + '-' + name;
        t.createVariable(id('var'), 'component test', '', false);
        const block = (name, opcode, parent, next, inputs = {}, fields = {}, shadow = false) => t.blocks.createBlock({
          id: id(name),
          opcode,
          parent: parent && id(parent),
          next: next && id(next),
          inputs,
          fields,
          shadow,
          topLevel: !parent
        });
        block('hat', 'event_whenflagclicked', null, 'set');
        block('set', 'components_setValue', 'hat', 'record', {
          VALUE: {
            name: 'VALUE',
            block: id('number'),
            shadow: id('number')
          }
        });
        block('number', 'math_number', 'set', null, {}, {
          NUM: {
            name: 'NUM',
            value: enabled ? 73 : 62
          }
        }, true);
        block('record', 'data_setvariableto', 'set', null, {
          VALUE: {
            name: 'VALUE',
            block: id('report')
          }
        }, {
          VARIABLE: {
            name: 'VARIABLE',
            id: id('var'),
            value: 'component test'
          }
        });
        block('report', 'components_value', 'record', null);
        const threads = vm.runtime.startHats('event_whenflagclicked', null, t);
        for (let i = 0; i < 4; i++) vm.runtime._step();
        return {
          value: t.variables[id('var')].value,
          compiled: threads[0].isCompiled
        };
      }, enabled);
      assert.equal(Number(execution.value), enabled ? 73 : 62);
      assert.equal(Boolean(execution.compiled), enabled);
      console.log('PASS component setter and reporter', enabled ? 'compiled' : 'interpreted');
    }
    await page.evaluate(() => {
      sliderTarget.componentController.setProperties({
        value: 0
      });
      sliderTarget.setDraggable(true);
    });
    a = point(-164, 70);
    b = point(-134, 40);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, {
      steps: 8
    });
    await page.mouse.up();
    const moved = await page.evaluate(() => ({
      x: sliderTarget.x,
      y: sliderTarget.y,
      value: sliderTarget.component.properties.value
    }));
    assert.equal(moved.value, 0);
    assert.ok(moved.x !== -80 || moved.y !== 70);
    await page.evaluate(() => {
      sliderTarget.setDraggable(false);
      sliderTarget.setXY(-80, 70);
    });
    console.log('PASS whole-component drag');
    await page.screenshot({
      path: '/tmp/components-all.png'
    });
    assert.ok(await page.evaluate(() => vm.runtime.targets.filter(t => t.component).every(t => t.getCostumes().every(c => !c.broken))));
    const before = await page.evaluate(() => vm.runtime.targets.filter(t => t.component).map(t => ({
      type: t.component.type,
      assets: t.getCostumes().map(c => c.assetId)
    })));
    await page.evaluate(async () => {
      const saved = await vm.saveProjectSb3();
      await vm.loadProject(await saved.arrayBuffer());
    });
    const after = await page.evaluate(() => vm.runtime.targets.filter(t => t.component).map(t => ({
      type: t.component.type,
      assets: t.getCostumes().map(c => c.assetId)
    })));
    assert.deepEqual(after, before);
    console.log('PASS four-component SB3 asset roundtrip');
    await page.setViewportSize({
      width: 1100,
      height: 850
    });
    await page.screenshot({
      path: '/tmp/components-compact.png'
    });
    console.log('PAGE_ERRORS', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
