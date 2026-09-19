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
    const paintToolbar = page.locator('[data-control-point-editor]');
    const paintToolbarBefore = await paintToolbar.boundingBox();
    const editControlPoints = await paintToolbar.getByRole('button', {
      name: /编辑控制点|Edit control points/
    }).boundingBox();
    const strokeWidth = await paintToolbar.locator('input[type="number"]').boundingBox();
    const paintCanvas = page.locator('canvas[id^="paper-view"]');
    const paintCanvasBefore = await paintCanvas.boundingBox();
    await page.getByRole('button', {
      name: /编辑控制点|Edit control points/
    }).click();
    assert.equal(await paintToolbar.getAttribute('data-control-point-editor'), 'active');
    const hiddenNativeRows = await paintToolbar.locator('[inert]').evaluateAll(rows =>
      rows.map(row => ({opacity: getComputedStyle(row).opacity, hidden: row.getAttribute('aria-hidden')})));
    assert.equal(hiddenNativeRows.length, 2);
    assert.ok(hiddenNativeRows.every(row => row.opacity === '0' && row.hidden === 'true'),
      'native toolbar rows cannot paint over or receive focus in control point mode');
    const paintToolbarActive = await paintToolbar.boundingBox();
    assert.ok(Math.abs(paintToolbarActive.height - paintToolbarBefore.height) < 2,
      'control point tools keep the original paint toolbar height');
    assert.ok(Math.abs(paintToolbarActive.width - paintToolbarBefore.width) < 2,
      'control point tools keep the original paint toolbar width');
    const exitControlPoints = await paintToolbar.getByRole('button', {
      name: /退出控制点|Exit control points/
    }).boundingBox();
    for (const dimension of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(exitControlPoints[dimension] - editControlPoints[dimension]) < 0.5,
        `edit and exit control point buttons keep the same absolute ${dimension}`);
    }
    for (const coordinate of await paintToolbar.locator('input[data-axis]').all()) {
      const box = await coordinate.boundingBox();
      assert.ok(Math.abs(box.y - strokeWidth.y) < 0.5,
        'coordinate inputs keep the original stroke width input absolute y');
    }
    const paintCanvasActive = await paintCanvas.boundingBox();
    for (const dimension of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(paintCanvasActive[dimension] - paintCanvasBefore[dimension]) < 2,
        `control point mode keeps the paint canvas ${dimension}`);
    }
    const endPointButton = page.getByRole('button', {name: /^(End|终点)$/});
    await endPointButton.focus();
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
    const guideState = async () => page.evaluate(() => {
      const layer = paper.project.layers.find(candidate => candidate.data.isControlPointGuideLayer);
      const endpoints = Object.fromEntries(layer.children
        .filter(item => item.data.controlPointGuideEndpoint)
        .map(item => {
          const viewPoint = paper.view.projectToView(item.position);
          const bounds = paper.view.element.getBoundingClientRect();
          return [item.data.controlPointGuideEndpoint, {
            project: [item.position.x, item.position.y],
            screen: [bounds.x + viewPoint.x, bounds.y + viewPoint.y]
          }];
        }));
      return {endpoints, zoom: paper.view.zoom};
    });
    const beforeZoom = await guideState();
    assert.deepEqual(beforeZoom.endpoints.end.project, [650, 360]);
    assert.equal(await page.locator('circle[data-endpoint]').count(), 0,
      'control points are not a DOM overlay');
    assert.equal(await page.locator('[data-control-point-editor="active"]').count(), 1,
      'control point tools occupy the native paint toolbar');
    assert.ok(await page.locator('fieldset[class*="mode-selector"]').evaluate(element => element.disabled),
      'paint tools are disabled in control-point mode');
    await page.getByRole('img', {name: 'Zoom In'}).click();
    const afterZoom = await guideState();
    assert.ok(afterZoom.zoom > beforeZoom.zoom, 'paint canvas zoom changes');
    assert.deepEqual(afterZoom.endpoints.end.project, beforeZoom.endpoints.end.project,
      'guide remains at the same Paper project coordinate after zoom');
    assert.notDeepEqual(afterZoom.endpoints.end.screen, beforeZoom.endpoints.end.screen,
      'guide follows the Paper view transform after zoom');
    await page.screenshot({path: '/tmp/components-geometry-zoomed.png'});
    await page.getByRole('img', {name: 'Zoom Reset'}).click();
    const endpoint = (await guideState()).endpoints.end.screen;
    await page.mouse.move(endpoint[0], endpoint[1]);
    await page.mouse.down();
    await page.mouse.move(endpoint[0] + 20, endpoint[1]);
    await page.mouse.up();
    assert.ok(await page.evaluate(() => sliderTarget.component.metadata.sliderTrack.end[0] > 85));
    await page.getByRole('button', {
      name: /撤销导轨修改|Undo guide change/
    }).click();
    assert.equal(await page.evaluate(() => sliderTarget.component.metadata.sliderTrack.end[0]), 85);
    await page.getByRole('button', {
      name: /退出控制点|Exit control points/
    }).click();
    assert.equal(await paintToolbar.getAttribute('data-control-point-editor'), 'inactive');
    assert.ok(await page.getByRole('button', {
      name: /编辑控制点|Edit control points/
    }).isVisible(), 'exit restores the original paint toolbar');
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
    const paletteResults = await page.evaluate(() => {
      const expected = {slider: [], progress: [], toggle: ['whenStateChanged'], button: ['whenClicked']};
      return vm.runtime.targets.map(target => {
        const xml = vm.runtime.getBlocksXML(target).find(category => category.id === 'components').xml;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const types = Array.from(doc.documentElement.children).filter(node => node.tagName === 'block')
          .map(node => node.getAttribute('type'));
        const self = types.filter(type => !type.includes('Target') && !type.includes('target'));
        return {self, expected: (target.component ? expected[target.component.type] : []).map(x => 'components_' + x),
          cross: types.includes('components_targetProperty'),
          shadows: doc.querySelectorAll('shadow[type="components_menu_numericTargets"]').length,
          separators: doc.querySelectorAll('sep').length};
      });
    });
    for (const result of paletteResults) {
      assert.deepEqual(result.self, result.expected);
      assert.ok(result.cross && result.shadows === 3 && result.separators >= 1);
    }
    const declaredMenus = await page.evaluate(() => {
      const category = vm.runtime._blockInfo.find(info => info.id === 'components');
      const block = category.blocks.find(item => item.info && item.info.opcode === 'targetProperty');
      const args = Object.keys(block.json).filter(key => key.startsWith('args')).flatMap(key => block.json[key]);
      const property = args.find(arg => arg.name === 'PROPERTY');
      const optionsFor = target => property.options.call({sourceBlock_: {
        getInputTargetBlock: () => ({getFieldValue: () => target.getName()})
      }}).map(option => option[1]);
      const targetMenu = category.menus.find(menu => menu.json.type === 'components_menu_numericTargets');
      return {
        slider: optionsFor(sliderTarget),
        progress: optionsFor(progressTarget),
        editingName: progressTarget.getName(),
        numericTargets: targetMenu.json.args0[0].options().map(option => option[1])
      };
    });
    assert.deepEqual(declaredMenus.slider, ['value', 'min', 'max', 'step']);
    assert.deepEqual(declaredMenus.progress, ['value', 'min', 'max']);
    assert.ok(declaredMenus.numericTargets.includes('_myself_'));
    assert.ok(!declaredMenus.numericTargets.includes(declaredMenus.editingName));
    await page.evaluate(() => {
      window.ordinaryTarget = vm.runtime.targets.find(target => !target.isStage && !target.component);
      const create = (id, opcode, parent, inputs, fields, shadow = false) => sliderTarget.blocks.createBlock({
        id, opcode, parent, next: null, inputs, fields, shadow, topLevel: !parent, x: 40, y: 40
      });
      create('component-menu-regression', 'components_targetProperty', null, {
        TARGET: {name: 'TARGET', block: 'component-menu-regression-target', shadow: 'component-menu-regression-target'}
      }, {PROPERTY: {name: 'PROPERTY', value: 'step'}});
      create('component-menu-regression-target', 'components_menu_numericTargets',
        'component-menu-regression', {}, {numericTargets: {name: 'numericTargets', value: '_myself_'}}, true);
      vm.setEditingTarget(ordinaryTarget.id);
      vm.setEditingTarget(sliderTarget.id);
    });
    await page.waitForFunction(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const block = blockly && blockly.getMainWorkspace().getBlockById('component-menu-regression');
      return block && block.getInputTargetBlock('TARGET');
    });
    const restoredSelf = await page.evaluate(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const block = blockly.getMainWorkspace().getBlockById('component-menu-regression');
      const targetField = block.getInputTargetBlock('TARGET').getField('numericTargets');
      const propertyField = block.getField('PROPERTY');
      return {
        targetValue: targetField.getValue(),
        targetText: targetField.getText(),
        propertyValue: propertyField.getValue(),
        propertyText: propertyField.getText()
      };
    });
    assert.equal(restoredSelf.targetValue, '_myself_');
    assert.notEqual(restoredSelf.targetText, '_myself_');
    assert.equal(restoredSelf.propertyValue, 'step');
    assert.notEqual(restoredSelf.propertyText, 'step');
    await page.locator('.scratchCategoryId-components').click();
    const flyoutBlockTypes = () => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const main = blockly && blockly.getMainWorkspace();
      const workspace = main && main.getFlyout().getWorkspace();
      return workspace ? workspace.getTopBlocks(false).map(block => block.type) : [];
    };
    await page.waitForFunction(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const main = blockly && blockly.getMainWorkspace();
      const workspace = main && main.getFlyout().getWorkspace();
      return workspace && workspace.getTopBlocks(false).some(block => block.type === 'components_targetProperty');
    });
    const sliderFlyout = await page.evaluate(flyoutBlockTypes);
    assert.ok(sliderFlyout.includes('components_targetProperty'));
    assert.ok(sliderFlyout.includes('components_changeTargetProperty'));
    assert.ok(sliderFlyout.includes('components_setTargetProperty'));
    assert.ok(!sliderFlyout.some(type => ['components_value', 'components_changeValue',
      'components_setValue', 'components_whenValueChanged'].includes(type)));
    await page.evaluate(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const flyout = blockly.getMainWorkspace().getFlyout();
      const block = flyout.getWorkspace().getTopBlocks(false)
        .find(item => item.type === 'components_targetProperty');
      flyout.scrollTo(Math.max(0, block.getRelativeToSurfaceXY().y - 40));
    });
    await page.waitForTimeout(300);
    await page.screenshot({path: '/tmp/components-toolbox-slider.png'});
    await page.evaluate(() => vm.setEditingTarget(progressTarget.id));
    await page.waitForFunction(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const main = blockly && blockly.getMainWorkspace();
      const workspace = main && main.getFlyout().getWorkspace();
      const block = workspace && workspace.getTopBlocks(false)
        .find(item => item.type === 'components_targetProperty');
      return block && block.getField('PROPERTY').getOptions().every(option => option[1] !== 'step');
    });
    await page.evaluate(() => vm.setEditingTarget(sliderTarget.id));
    await page.waitForFunction(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const block = blockly && blockly.getMainWorkspace().getBlockById('component-menu-regression');
      return block && block.getFieldValue('PROPERTY') === 'step' && block.getField('PROPERTY').getText() !== 'step';
    });
    await page.evaluate(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const block = blockly.getMainWorkspace().getBlockById('component-menu-regression');
      block.getInputTargetBlock('TARGET').getField('numericTargets').setValue(progressTarget.getName());
    });
    await page.waitForFunction(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const block = blockly && blockly.getMainWorkspace().getBlockById('component-menu-regression');
      return sliderTarget.blocks.getBlock('component-menu-regression').fields.PROPERTY.value === 'value' &&
        block && block.getFieldValue('PROPERTY') === 'value';
    });
    await page.evaluate(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const block = blockly.getMainWorkspace().getBlockById('component-menu-regression');
      block.getField('PROPERTY').setValue('min');
      block.getInputTargetBlock('TARGET').getField('numericTargets').setValue('_myself_');
    });
    await page.waitForFunction(() => {
      const stored = sliderTarget.blocks.getBlock('component-menu-regression');
      return stored.fields.PROPERTY.value === 'min' &&
        sliderTarget.blocks.getBlock('component-menu-regression-target').fields.numericTargets.value === '_myself_';
    });
    console.log('PASS component target/property menu restoration and dependent selection');
    await page.evaluate(() => vm.setEditingTarget(toggleTarget.id));
    await page.waitForFunction(() => {
      const blockly = window.Blockly || window.ScratchBlocks;
      const main = blockly && blockly.getMainWorkspace();
      const workspace = main && main.getFlyout().getWorkspace();
      return workspace && workspace.getTopBlocks(false).some(block => block.type === 'components_whenStateChanged');
    });
    const toggleFlyout = await page.evaluate(flyoutBlockTypes);
    assert.ok(toggleFlyout.includes('components_whenStateChanged'));
    assert.ok(toggleFlyout.includes('components_targetIsChecked'));
    assert.ok(!toggleFlyout.some(type => ['components_isChecked', 'components_setChecked'].includes(type)));
    await page.screenshot({path: '/tmp/components-toolbox-toggle.png'});
    console.log('PASS type-filtered toolbox, dropdown shadows, separators and checked event label');
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
        const input = name => ({name, block: id(name), shadow: id(name)});
        block('hat', 'event_whenflagclicked', null, 'set');
        block('set', 'components_setTargetProperty', 'hat', 'record',
          {TARGET: input('setTarget'), VALUE: input('number')},
          {PROPERTY: {name: 'PROPERTY', value: 'value'}});
        block('setTarget', 'components_menu_numericTargets', 'set', null, {},
          {numericTargets: {name: 'numericTargets', value: '_myself_'}}, true);
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
        block('report', 'components_targetProperty', 'record', null, {TARGET: input('reportTarget')},
          {PROPERTY: {name: 'PROPERTY', value: 'value'}});
        block('reportTarget', 'components_menu_numericTargets', 'report', null, {},
          {numericTargets: {name: 'numericTargets', value: '_myself_'}}, true);
        const threads = vm.runtime.startHats('event_whenflagclicked', null, t);
        for (let i = 0; i < 4; i++) vm.runtime._step();
        return {
          value: t.variables[id('var')].value,
          compiled: threads[0].isCompiled
        };
      }, enabled);
      assert.equal(Number(execution.value), enabled ? 73 : 62);
      assert.equal(Boolean(execution.compiled), enabled);
      console.log('PASS unified component setter and reporter', enabled ? 'compiled' : 'interpreted');
    }
    for (const enabled of [false, true]) {
      const execution = await page.evaluate(enabled => {
        vm.stopAll();
        vm.runtime.setCompilerOptions({enabled});
        const owner = vm.runtime.targets.find(t => !t.isStage && !t.component);
        const prefix = 'cross-' + enabled;
        const id = name => prefix + name;
        const variable = id('result');
        owner.createVariable(variable, prefix, '', false);
        const block = (name, opcode, parent, next, inputs = {}, fields = {}, shadow = false) =>
          owner.blocks.createBlock({id: id(name), opcode, parent: parent && id(parent), next: next && id(next),
            inputs, fields, shadow, topLevel: !parent});
        const input = name => ({name, block: id(name), shadow: id(name)});
        block('hat', 'event_whenflagclicked', null, 'change');
        block('change', 'components_changeTargetProperty', 'hat', 'record',
          {TARGET: input('TARGET'), VALUE: input('VALUE')}, {PROPERTY: {name: 'PROPERTY', value: 'value'}});
        block('TARGET', 'components_menu_numericTargets', 'change', null, {},
          {numericTargets: {name: 'numericTargets', value: sliderTarget.getName()}}, true);
        block('VALUE', 'math_number', 'change', null, {}, {NUM: {name: 'NUM', value: 7}}, true);
        block('record', 'data_setvariableto', 'change', null, {VALUE: {name: 'VALUE', block: id('report')}},
          {VARIABLE: {name: 'VARIABLE', id: variable, value: prefix}});
        block('report', 'components_targetProperty', 'record', null, {TARGET: input('name')},
          {PROPERTY: {name: 'PROPERTY', value: 'value'}});
        // A text reporter replaces the dropdown shadow, just as a user can drag one into its input.
        block('name', 'text', 'report', null, {}, {TEXT: {name: 'TEXT', value: sliderTarget.getName()}}, true);
        vm.setComponentProperties(sliderTarget.id, {value: 20});
        const threads = vm.runtime.startHats('event_whenflagclicked', null, owner);
        for (let i = 0; i < 4; i++) vm.runtime._step();
        const result = {value: owner.variables[variable].value, compiled: threads[0].isCompiled};
        owner.blocks.deleteBlock(id('hat'));
        return result;
      }, enabled);
      assert.equal(Number(execution.value), 27);
      assert.equal(Boolean(execution.compiled), enabled);
      console.log('PASS cross-component dropdown and reporter input', enabled ? 'compiled' : 'interpreted');
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
