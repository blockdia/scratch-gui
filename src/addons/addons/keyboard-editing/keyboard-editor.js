import {bodyPosition, positionsForBlock, resolvePosition, navigate, firstPosition, editableField, horizontalPositions, samePosition, insertionPlan} from './keyboard-navigation.js';

/** Owns keyboard focus, not Blockly's block selection or project state. */
export default class KeyboardEditor {
  constructor({Blockly, addon, msg, openPopup, closePopup, popupOpen}) {
    Object.assign(this, {Blockly, addon, openPopup, closePopup, popupOpen});
    this.position = {kind: 'workspace'};
    this.workspace = null;
    this.mouse = null;
    this.enabled = false;
    this.composing = false;
    this.editingField = false;
    this.targetId = null;
    this.focusInput = document.createElement('textarea');
    this.focusInput.className = 'sa-mcp-keyboard-focus';
    this.focusInput.setAttribute('aria-label', msg('keyboard-label'));
    this.focusInput.setAttribute('autocomplete', 'off');
    this.focusInput.setAttribute('autocapitalize', 'off');
    this.focusInput.setAttribute('spellcheck', 'false');
    this.focusInput.tabIndex = -1;
    this.focusInput.hidden = true;
    document.body.appendChild(this.focusInput);
    this.cursor = document.createElement('div');
    this.cursor.className = 'sa-mcp-keyboard-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
    this.cursor.hidden = true;
    this.outlineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.outlineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.outlineSvg.appendChild(this.outlineGroup);
    this.cursor.appendChild(this.outlineSvg);
    document.body.appendChild(this.cursor);
    this.hint = document.createElement('div');
    this.hint.className = 'sa-mcp-keyboard-hint';
    this.hint.id = 'sa-mcp-keyboard-help';
    this.hint.textContent = msg('keyboard-help')
      .replaceAll('Alt', /Mac|iPhone|iPad/.test(navigator.platform) ? 'Option' : 'Alt')
      .replaceAll('Ctrl/Cmd', /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl');
    this.hint.hidden = true;
    this.focusInput.setAttribute('aria-describedby', this.hint.id);
    document.body.appendChild(this.hint);
    this.onProjectLoaded = () => {
      this.closePopup();
      this.releaseTabStop();
      this.workspace = null;
      this.clearOutline();
      this.position = {kind: 'workspace'};
      this.mouse = null;
      this.draggingBlock = null;
      this.composing = false;
      this.pendingPointerFocus = false;
      this.editingField = false;
    };
    this.onPointer = this.onPointer.bind(this);
    this.onMove = event => {
      if (!this.available() || !this.workspace?.getParentSvg()?.contains(event.target)) return;
      const bounds = this.getBounds();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right &&
          event.clientY >= bounds.top && event.clientY <= bounds.bottom &&
          !event.target.closest('.blocklyFlyout')) this.mouse = {x: event.clientX, y: event.clientY};
    };
    this.onRelease = () => {
      if (!this.pendingPointerFocus) return;
      this.pendingPointerFocus = false;
      setTimeout(() => {
        if (!this.available() || this.workspace.isDragging()) return;
        if (this.draggingBlock) {
          const block = this.workspace.getBlockById(this.draggingBlock);
          this.draggingBlock = null;
          if (block) this.inserted(block);
        }
        if (this.widgetOpen()) this.editingField = true;
        else this.focus();
      }, 0);
    };
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onFocus = this.onFocus.bind(this);
    this.onInput = () => {
      if (!this.composing && this.focusInput.value && this.available()) {
        const value = this.focusInput.value;
        this.focusInput.value = '';
        this.openPopup({initialValue: value, keyboard: true});
      }
    };
    this.focusInput.addEventListener('input', this.onInput);
    this.focusInput.addEventListener('compositionstart', () => { this.composing = true; });
    this.focusInput.addEventListener('compositionend', () => {
      this.composing = false;
      // Browsers differ in whether the final input precedes or follows compositionend.
      this.onInput();
    });
    this.updateEnabled = () => {
      const enabled = !addon.self.disabled;
      if (this.enabled === enabled) return;
      this.enabled = enabled;
      for (const [type, listener] of [['pointerdown', this.onPointer], ['pointermove', this.onMove], ['pointerup', this.onRelease], ['keydown', this.onKeyDown], ['focusin', this.onFocus]]) {
        document[enabled ? 'addEventListener' : 'removeEventListener'](type, listener, true);
      }
      addon.tab.traps.vm[enabled ? 'on' : 'removeListener']('PROJECT_LOADED', this.onProjectLoaded);
      this.focusInput.hidden = !enabled;
      if (enabled) {
        this.tick();
      } else {
        cancelAnimationFrame(this.frame);
        this.closePopup();
        this.cursor.hidden = this.hint.hidden = true;
        this.focusInput.blur();
        this.releaseTabStop();
        this.clearOutline();
        this.position = {kind: 'workspace'};
        this.composing = false;
        this.pendingPointerFocus = false;
        this.draggingBlock = null;
        this.editingField = false;
      }
    };
    addon.self.addEventListener('disabled', this.updateEnabled);
    addon.self.addEventListener('reenabled', this.updateEnabled);
    this.updateEnabled();
  }

  available() {
    const state = this.addon.tab.redux.state.scratchGui;
    const workspace = this.Blockly.getMainWorkspace();
    return this.enabled && this.addon.tab.editorMode === 'editor' && state.editorTab.activeTabIndex === 0 &&
      workspace && !workspace.options.readOnly && workspace.isVisible() &&
      !Object.values(state.modals || {}).some(Boolean) && !Object.values(state.menus || {}).some(Boolean);
  }

  syncWorkspace() {
    const workspace = this.Blockly.getMainWorkspace();
    const targetId = this.addon.tab.traps.vm.editingTarget?.id;
    if (workspace !== this.workspace || targetId !== this.targetId) {
      this.closePopup();
      this.releaseTabStop();
      this.clearOutline();
      this.workspace = workspace;
      this.targetId = targetId;
      this.position = {kind: 'workspace'};
      this.mouse = null;
      this.draggingBlock = null;
      this.pendingPointerFocus = false;
      this.editingField = false;
    }
    const svg = workspace.getParentSvg();
    if (!this.tabStop && svg) {
      this.tabStop = {svg, tabIndex: svg.getAttribute('tabindex'), label: svg.getAttribute('aria-label')};
      svg.setAttribute('tabindex', '0');
      svg.setAttribute('aria-label', this.focusInput.getAttribute('aria-label'));
    }
    const resolved = resolvePosition(workspace, this.position, this.Blockly);
    if (this.position.blockId) this.position = resolved?.position || {kind: 'workspace'};
    return resolved;
  }

  releaseTabStop() {
    if (!this.tabStop) return;
    const {svg, tabIndex, label} = this.tabStop;
    for (const [name, value] of [['tabindex', tabIndex], ['aria-label', label]]) {
      if (value === null) svg.removeAttribute(name);
      else svg.setAttribute(name, value);
    }
    this.tabStop = null;
  }

  getBounds() {
    const svg = this.workspace.getParentSvg();
    const rect = svg.getBoundingClientRect();
    const metrics = this.workspace.getMetrics();
    return {left: rect.left + metrics.absoluteLeft, top: rect.top + metrics.absoluteTop,
      right: rect.left + metrics.absoluteLeft + metrics.viewWidth,
      bottom: rect.top + metrics.absoluteTop + metrics.viewHeight};
  }

  placementPoint() {
    const bounds = this.getBounds();
    const mouse = this.mouse;
    return mouse && mouse.x >= bounds.left && mouse.x <= bounds.right && mouse.y >= bounds.top && mouse.y <= bounds.bottom ?
      mouse : {x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2};
  }

  connectionPoint(connection) {
    const point = this.workspace.getParentSvg().createSVGPoint();
    point.x = connection.x_;
    point.y = connection.y_;
    return point.matrixTransform(this.workspace.getCanvas().getScreenCTM());
  }

  outlineSource(position) {
    const resolved = resolvePosition(this.workspace, position, this.Blockly);
    if (resolved?.position.kind !== 'input') return null;
    return resolved.input.connection.targetBlock()?.svgPath_ || resolved.input.outlinePath || null;
  }

  clearOutline() {
    this.outlineSourceElement = null;
    this.outlineGroup.replaceChildren();
  }

  drawOutline(position, rect) {
    const source = this.outlineSource(position);
    this.cursor.dataset.outline = String(Boolean(source));
    this.outlineSvg.style.display = source ? '' : 'none';
    if (!source) {
      if (this.outlineSourceElement) this.clearOutline();
      return;
    }
    if (source !== this.outlineSourceElement) {
      this.outlineSourceElement = source;
      this.outlineGroup.replaceChildren();
      for (const [stroke, width] of [['#242424', 4], ['#ffbf00', 2]]) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', width);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.setAttribute('stroke-linejoin', 'round');
        this.outlineGroup.appendChild(path);
      }
    }
    for (const path of this.outlineGroup.children) path.setAttribute('d', source.getAttribute('d'));
    const m = source.getScreenCTM();
    this.outlineGroup.setAttribute('transform',
      `matrix(${m.a},${m.b},${m.c},${m.d},${m.e - rect.left + 2},${m.f - rect.top + 2})`);
  }

  rectFor(position) {
    const resolved = resolvePosition(this.workspace, position, this.Blockly);
    if (!resolved) {
      let point = this.placementPoint();
      if (position?.x !== undefined) {
        const svgPoint = this.workspace.getParentSvg().createSVGPoint();
        svgPoint.x = position.x;
        svgPoint.y = position.y;
        point = svgPoint.matrixTransform(this.workspace.getCanvas().getScreenCTM());
      }
      return {left: point.x - 8, top: point.y - 8, width: 16, height: 16};
    }
    if (['before', 'after', 'statement'].includes(position.kind)) {
      const point = this.connectionPoint(resolved.connection);
      return {left: point.x - 14, top: point.y - 3, width: 28, height: 6};
    }
    const field = editableField(resolved);
    const element = this.outlineSource(position) || field?.getSvgRoot() || resolved.input?.outlinePath ||
      resolved.input?.connection?.targetBlock()?.svgPath_ || resolved.block.svgPath_;
    return element.getBoundingClientRect();
  }

  anchorPoint() {
    const rect = this.rectFor(this.position);
    return {x: rect.left + rect.width, y: rect.top + rect.height};
  }

  focus() {
    if (!this.available() || this.workspace.isDragging()) return;
    this.editingField = false;
    this.focusInput.value = '';
    this.focusInput.focus({preventScroll: true});
  }

  onFocus(event) {
    if (this.available() && event.target === this.Blockly.FieldTextInput.htmlInput_) {
      const field = this.Blockly.WidgetDiv.owner_;
      const source = field?.sourceBlock_;
      const block = source?.isShadow() ? source.getParent() : source;
      if (block?.workspace === this.workspace) {
        const position = positionsForBlock(block, this.Blockly).find(p =>
          editableField(resolvePosition(this.workspace, p, this.Blockly)) === field);
        if (position) this.setPosition(position, true);
        this.editingField = true;
      }
    }
    if (event.target === this.workspace?.getParentSvg() && this.available()) {
      this.focus();
      return;
    }
    if (!this.editingField) return;
    if (event.target === document.body || event.target === this.workspace?.getParentSvg()) this.focus();
    else if (event.target !== this.focusInput && !event.target.closest('.blocklyWidgetDiv, .blocklyDropDownDiv')) {
      this.editingField = false;
    }
  }

  onPointer(event) {
    if (this.workspace && !this.workspace.getParentSvg()?.contains(event.target) &&
        !event.target.closest('.blocklyWidgetDiv, .blocklyDropDownDiv, .sa-mcp-root')) {
      this.editingField = false;
      this.pendingPointerFocus = false;
    }
    if (!this.available() || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
    this.syncWorkspace();
    const svg = this.workspace.getParentSvg();
    if (!svg.contains(event.target) || event.target.closest('.blocklyFlyout, .blocklyToolboxDiv, .blocklyScrollbarHandle, .blocklyZoom')) return;
    this.pendingPointerFocus = true;
    this.mouse = {x: event.clientX, y: event.clientY};
    let block = null;
    for (const candidate of this.workspace.getAllBlocks(false)) {
      const root = candidate.getSvgRoot();
      if (!candidate.isInsertionMarker() && root?.contains(event.target) &&
          (!block || block.getSvgRoot().contains(root))) block = candidate;
    }
    if (block?.isShadow()) block = block.getParent();
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(this.workspace.getCanvas().getScreenCTM().inverse());
    this.position = block ? bodyPosition(block) : {kind: 'workspace', x: local.x, y: local.y};
    if (block) {
      const positions = positionsForBlock(block, this.Blockly).filter(p => p.kind !== 'body');
      // Fields and inputs precede connection hit zones; do not select a containing block's body.
      const hit = positions.find(p => {
        const rect = this.rectFor(p);
        const margin = ['before', 'after', 'statement'].includes(p.kind) ? 7 : 0;
        return event.clientX >= rect.left - margin && event.clientX <= rect.left + rect.width + margin &&
          event.clientY >= rect.top - margin && event.clientY <= rect.top + rect.height + margin;
      });
      if (hit) this.position = hit;
    }

  }

  widgetOpen() {
    return this.Blockly.WidgetDiv.isVisible() || this.Blockly.DropDownDiv.isVisible();
  }

  planInsertion(workspace, block) {
    return insertionPlan(workspace, this.position, block, this.Blockly);
  }

  editField(field) {
    this.editingField = true;
    field.showEditor_();
    // Boolean fields do not open a widget.
    if (!this.widgetOpen()) this.focus();
  }

  onKeyDown(event) {
    if (!this.available()) return;
    if (this.editingField) {
      if (event.key === 'Tab' && event.target === this.Blockly.FieldTextInput.htmlInput_) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const resolved = resolvePosition(this.workspace, this.position, this.Blockly);
        if (!resolved) return;
        const inputs = horizontalPositions(resolved.block, this.Blockly)
          .filter(p => editableField(resolvePosition(this.workspace, p, this.Blockly)) instanceof this.Blockly.FieldTextInput);
        const index = inputs.findIndex(p => samePosition(p, this.position));
        const next = inputs[index + (event.shiftKey ? -1 : 1)];
        if (next) {
          this.Blockly.WidgetDiv.hide();
          this.Blockly.DropDownDiv.hideWithoutAnimation();
          this.setPosition(next, true);
          this.editField(editableField(resolvePosition(this.workspace, next, this.Blockly)));
        }
        return;
      }
      if (event.key === 'Enter' || event.key === 'Escape') {
        setTimeout(() => { if (!this.widgetOpen() && this.editingField) this.focus(); }, 0);
      }
      return;
    }
    if (event.target !== this.focusInput || this.composing || event.isComposing || event.keyCode === 229) return;
    this.syncWorkspace();
    if (this.workspace.isDragging()) return;
    const consume = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
      consume();
      this.openPopup({keyboard: true});
      return;
    }
    if (event.ctrlKey || event.metaKey || event.key === 'Backspace' || event.key === 'Delete') {
      // The focus proxy is a text input for IME support. Explicitly delegate block
      // shortcuts so Blockly does not mistake it for an open literal editor.
      if (/^[cxvzy]$/i.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
        consume();
        this.Blockly.onKeyDown_({keyCode: event.keyCode, target: document.body,
          ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey,
          preventDefault() {}});
      }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
      const next = navigate(this.workspace, this.position, event.key, event, this.Blockly);
      if (!next) {
        consume();
        const svg = this.workspace.getParentSvg();
        const controls = [...document.querySelectorAll('button, input, [tabindex="0"], a[href]')]
          .filter(element => !element.disabled && element.getClientRects().length &&
            (element.compareDocumentPosition(svg) & (event.shiftKey ?
              Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING)) &&
            !svg.contains(element) && element !== this.focusInput);
        const target = event.shiftKey ? controls[controls.length - 1] : controls[0];
        this.focusInput.blur();
        if (target) target.focus();
        return;
      }
      consume();
      this.setPosition(next, true);
    } else if (event.key === 'Enter') {
      consume();
      const field = editableField(resolvePosition(this.workspace, this.position, this.Blockly));
      if (field) this.editField(field);
      else this.openPopup({keyboard: true});
    } else if (event.key === 'Escape') {
      consume();
      this.focusInput.blur();
    }
  }

  setPosition(position, scroll = false) {
    this.position = position;
    const resolved = resolvePosition(this.workspace, position, this.Blockly);
    if (resolved) {
      resolved.block.select();
      if (scroll) {
        const rect = this.rectFor(position);
        const bounds = this.getBounds();
        const dx = rect.left < bounds.left + 20 ? rect.left - bounds.left - 20 :
          Math.max(0, rect.left + rect.width - bounds.right + 20);
        const dy = rect.top < bounds.top + 20 ? rect.top - bounds.top - 20 :
          Math.max(0, rect.top + rect.height - bounds.bottom + 20);
        if (dx || dy) {
          const metrics = this.workspace.getMetrics();
          this.workspace.scrollbar.set(metrics.viewLeft - metrics.contentLeft + dx,
            metrics.viewTop - metrics.contentTop + dy);
        }
      }
    }
  }

  inserted(block) {
    this.setPosition(firstPosition(block, this.Blockly), true);
  }

  tick() {
    if (!this.enabled) return;
    const available = this.available();
    if (available) this.syncWorkspace();
    const focused = available && (document.activeElement === this.focusInput || this.popupOpen() || this.editingField);
    this.cursor.hidden = this.hint.hidden = !focused;
    if (focused) {
      const rect = this.rectFor(this.position);
      const bounds = this.getBounds();
      this.cursor.dataset.kind = this.position.kind;
      this.drawOutline(this.position, rect);
      Object.assign(this.cursor.style, {left: `${rect.left - 2}px`, top: `${rect.top - 2}px`,
        width: `${rect.width + 4}px`, height: `${rect.height + 4}px`,
        clipPath: `inset(${Math.max(0, bounds.top - rect.top + 2)}px ${Math.max(0, rect.left + rect.width + 2 - bounds.right)}px ${Math.max(0, rect.top + rect.height + 2 - bounds.bottom)}px ${Math.max(0, bounds.left - rect.left + 2)}px)`});
      this.cursor.hidden = rect.left + rect.width < bounds.left || rect.left > bounds.right ||
        rect.top + rect.height < bounds.top || rect.top > bounds.bottom;
      Object.assign(this.focusInput.style, {left: `${Math.max(bounds.left, Math.min(rect.left, bounds.right - 4))}px`,
        top: `${Math.max(bounds.top, Math.min(rect.top, bounds.bottom - 4))}px`});
      Object.assign(this.hint.style, {left: `${bounds.left + 8}px`, bottom: `${window.innerHeight - bounds.bottom + 8}px`,
        maxWidth: `${Math.max(0, bounds.right - bounds.left - 16)}px`});
      if (this.editingField && !this.widgetOpen() && document.activeElement === document.body) this.focus();
    } else if (!available && this.popupOpen()) this.closePopup();
    this.frame = requestAnimationFrame(() => this.tick());
  }
}
