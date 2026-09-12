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
    if (process.env.COMPONENTS_COMPACT === '1') {
      await page.addInitScript(() => localStorage.setItem('tw:addons',
        JSON.stringify({'editor-compact': {enabled: true}})));
    }
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://localhost:8603/editor.html', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length, {
      timeout: 90000
    });
    const add = async type => {
      await page.mouse.move(10, 10);
      await page.getByRole('button', {name: /Choose a Sprite|选择一个角色/, exact: true}).first().hover();
      const entry = page.getByRole('button', {name: /Choose a Component|选择一个组件/, exact: true});
      await entry.click().catch(async error => {
        await page.screenshot({path: '/tmp/components-menu-error.png'});
        throw error;
      });
      await page.waitForFunction(() => {
        const icons = Array.from(document.querySelectorAll('img[class*="library-item_library-item-image"]'));
        return icons.length === 4 && icons.every(icon => icon.complete && icon.naturalWidth > 0);
      });
      if (type === 'slider') await page.screenshot({path: '/tmp/components-library.png'});
      const names = {slider: /^(Slider|滑块)$/, button: /^(Button|按钮)$/,
        toggle: /^(Toggle|开关)$/, progress: /^(Progress Bar|进度条)$/};
      await page.getByRole('button', {name: names[type]}).click();
    };
    await add('slider');
    await page.waitForFunction(() => vm.editingTarget.componentController);
    await page.evaluate(() => {
      window.sliderTarget = vm.editingTarget;
      sliderTarget.setXY(-80, 70);
    });
    const panel = page.getByRole('region', {name: /^(Slider|滑块)$/});
    const settings = panel.getByRole('button', {name: /^(Settings|设置)$/});
    assert.equal(await panel.getByRole('spinbutton').count(), 1, 'only value is inline');
    assert.equal(await settings.innerText(), '', 'settings is icon-only');
    const inputHeight = await panel.getByRole('spinbutton').evaluate(el => el.getBoundingClientRect().height);
    const buttonSize = await settings.boundingBox();
    assert.equal(inputHeight, process.env.COMPONENTS_COMPACT === '1' ? 24 : 32);
    assert.equal(buttonSize.width, inputHeight);
    assert.equal(buttonSize.height, inputHeight);
    const infoBounds = await page.locator('[class*="sprite-info_sprite-info"]').boundingBox();
    const panelBounds = await panel.boundingBox();
    assert.ok(panelBounds.y >= infoBounds.y + infoBounds.height - 1, 'component properties follow sprite info');
    await settings.focus();
    await page.keyboard.press('Enter');
    const popup = page.getByRole('dialog', {name: /^(Settings|设置)$/});
    await popup.waitFor();
    assert.equal(await popup.getByRole('spinbutton').count(), 3);
    assert.ok((await popup.boundingBox()).width < 250, 'popup sizes to its content');
    assert.equal(await popup.getByRole('spinbutton').first().evaluate(el => el.getBoundingClientRect().height),
      inputHeight, 'popup inputs also follow compact mode');
    const step = popup.getByRole('spinbutton', {name: /^(Step|步长)$/});
    await step.fill('2');
    await step.press('Enter');
    assert.equal(await page.evaluate(() => sliderTarget.component.properties.step), 2);
    const min = popup.getByRole('spinbutton', {name: /^(Minimum|最小值)$/});
    await min.fill('100');
    await min.press('Enter');
    await popup.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => sliderTarget.component.properties.min), 0);
    await step.fill('1');
    await step.press('Enter');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.Popover')).some(el =>
      getComputedStyle(el).opacity === '1'));
    await page.screenshot({path: '/tmp/components-properties.png'});
    await page.keyboard.press('Escape');
    await popup.waitFor({state: 'hidden'});
    await settings.click();
    await panel.getByRole('spinbutton').click();
    await popup.waitFor({state: 'hidden'});
    const previousStageSize = await page.locator('[class*="stage-header_stage-size-toggle-group"] button[aria-pressed="true"]').getAttribute('aria-label');
    await page.getByRole('button', {name: /Switch to small stage|缩小舞台/, exact: true}).click();
    await page.waitForFunction(() => !document.querySelector('section [class*="component-panel_type_"]'));
    await settings.waitFor({state: 'visible'});
    assert.equal(await panel.getByRole('spinbutton').count(), 1, 'small stage keeps the common property');
    await settings.click();
    await popup.waitFor();
    await page.screenshot({path: '/tmp/components-small-stage.png'});
    await page.keyboard.press('Escape');
    await page.locator('[class*="stage-header_stage-size-toggle-group"]').getByRole('button',
      {name: previousStageSize, exact: true}).click();
    await page.waitForFunction(() => document.querySelector('section [class*="component-panel_type_"]'));
    console.log('PASS Scratch property layout, compact addon, small stage and settings popup');
    const clipping = await page.evaluate(async () => {
      const target = sliderTarget;
      const renderer = vm.renderer;
      const fill = target.getCostumes()[1];
      const original = new TextDecoder().decode(fill.asset.data);
      // A fixed red stripe proves progress reveals artwork instead of stretching it.
      vm.updateSvg(1, '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="12">' +
        '<rect width="180" height="12" fill="#4c97ff"/>' +
        '<rect x="25" width="12" height="12" fill="#ff0000"/></svg>', 90, 6);
      await new Promise(resolve => renderer._allSkins[fill.skinId]._svgImage.addEventListener('load', resolve,
        {once: true}));
      const sample = (x, y) => {
        const canvas = renderer.canvas;
        return renderer.extractColor((x / 480 + 0.5) * canvas.clientWidth,
          (0.5 - y / 360) * canvas.clientHeight, 1).color;
      };
      const rows = [];
      for (const direction of [90, 0]) {
        for (const mirror of [false, true]) {
          target.setRotationStyle(mirror ? 'left-right' : 'all around');
          target.setDirection(mirror ? -90 : direction);
          target.setSize(150);
          const actual = mirror ? 90 : direction;
          const angle = (90 - actual) * Math.PI / 180;
          const point = x => [target.x + (x * (mirror ? -1 : 1) * 1.5 * Math.cos(angle)),
            target.y + (x * (mirror ? -1 : 1) * 1.5 * Math.sin(angle))];
          const row = [];
          for (const value of [25, 75]) {
            vm.setComponentProperties(target.id, {value});
            renderer.draw();
            const left = point(-59);
            const right = point(65);
            const id = target.componentController.parts.get('fill');
            const hit = p => renderer.drawableTouching(id, (p[0] / 480 + 0.5) * renderer.canvas.clientWidth,
              (0.5 - p[1] / 360) * renderer.canvas.clientHeight);
            row.push({stripe: sample(...left), clipped: sample(...right),
              leftHit: hit(left), rightHit: hit(right)});
          }
          rows.push(row);
        }
      }
      target.setRotationStyle('all around');
      target.setDirection(90);
      target.setSize(100);
      vm.updateSvg(1, original, 90, 6);
      await new Promise(resolve => renderer._allSkins[fill.skinId]._svgImage.addEventListener('load', resolve,
        {once: true}));
      vm.setComponentProperties(target.id, {value: 50});
      return rows;
    });
    for (const row of clipping) {
      for (const result of row) {
        assert.deepEqual(result.stripe, {r: 255, g: 0, b: 0, a: 255}, 'stripe stays at its costume position');
        assert.deepEqual(result.clipped, {r: 214, g: 222, b: 234, a: 255}, 'clipped fill exposes track');
        assert.equal(result.leftHit, true);
        assert.equal(result.rightHit, false);
      }
    }
    console.log('PASS WebGL clip, fixed artwork, rotated/mirrored picking and SVG updates');
    const readStage = () => page.evaluate(() => {
      const r = vm.renderer.canvas.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height
      };
    });
    let stage = await readStage();
    const point = (x, y) => ({
      x: stage.x + (x / 480 + 0.5) * stage.w,
      y: stage.y + (0.5 - y / 360) * stage.h
    });
    // Editor dragging remains available even when the component is not draggable.
    const editorStart = point(-80, 70);
    await page.mouse.move(editorStart.x, editorStart.y);
    await page.mouse.down();
    await page.mouse.move(editorStart.x + 30, editorStart.y + 30, {steps: 8});
    assert.ok(await page.evaluate(() => sliderTarget.dragging));
    assert.equal(await page.evaluate(() => sliderTarget.x), -80, 'editor preview does not move target yet');
    assert.equal(await page.evaluate(() => vm.runtime.ioDevices.mouse.componentCapture), null);
    assert.ok(await page.evaluate(() => Array.from(document.querySelectorAll('canvas')).some(canvas =>
      canvas.style.display === 'block' && canvas.style.width && parseFloat(canvas.style.width) > 150)),
      'standard editor preview contains the whole component');
    await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => [sliderTarget.x, sliderTarget.y]), [-50, 40]);
    assert.equal(await page.evaluate(() => sliderTarget.component.properties.value), 50);
    await page.evaluate(() => sliderTarget.setXY(-80, 70));
    console.log('PASS standard editor drag for non-draggable component');
    await page.locator('img[title="Full Screen Control"], img[title="全屏模式"]').click();
    await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).waitFor({state: 'visible'});
    stage = await readStage();
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
    await page.getByRole('img', {name: /Exit full screen mode|退出全屏/}).click();
    await page.getByRole('button', {name: /Choose a Sprite|选择一个角色/, exact: true}).first().waitFor({state: 'visible'});
    stage = await readStage();
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
    stage = await readStage();
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
    await page.evaluate(() => vm.setEditingTarget(vm.runtime.targets.find(t =>
      t.component && t.component.type === 'slider').id));
    const compactPanel = page.getByRole('region', {name: /^(Slider|滑块)$/});
    await compactPanel.getByRole('button', {name: /^(Settings|设置)$/}).click();
    const compactPopup = page.getByRole('dialog', {name: /^(Settings|设置)$/});
    await compactPopup.waitFor();
    const bounds = await compactPopup.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1100 && bounds.y >= 0 &&
      bounds.y + bounds.height <= 850, 'settings fit in the compact viewport');
    await page.evaluate(() => vm.setEditingTarget(vm.runtime.targets.find(t =>
      !t.isStage && !t.component).id));
    await compactPopup.waitFor({state: 'hidden'});
    assert.equal(await page.locator('section[class*="component-panel_panel"]').count(), 0,
      'ordinary sprite has no component properties');
    console.log('PASS compact popup and target-switch dismissal');
    console.log('PAGE_ERRORS', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
