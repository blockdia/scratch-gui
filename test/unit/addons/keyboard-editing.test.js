import {positionsForBlock, navigate, resolvePosition, firstPosition, editableField, insertionPlan}
    from '../../../src/addons/addons/keyboard-editing/keyboard-navigation';
import SettingsStore from '../../../src/addons/settings-store';

const Blockly = {NEXT_STATEMENT: 3, Connection: {CAN_CONNECT: 0}};
const connection = (target = null, compatible = true) => ({
    targetBlock: () => target,
    canConnectWithReason_: () => compatible ? 0 : 4,
    targetConnection: null
});
const field = name => ({name, isCurrentlyEditable: () => true});
const block = (id, inputs = []) => ({
    id, inputList: inputs, previousConnection: connection(), nextConnection: connection(),
    getInput: name => inputs.find(i => i.name === name),
    getField: name => inputs.flatMap(i => i.fieldRow).find(f => f.name === name),
    getPreviousBlock: () => null, getNextBlock: () => null, getSurroundParent: () => null,
    isCollapsed: () => false, isShadow: () => false, isInsertionMarker: () => false,
    getRelativeToSurfaceXY: () => ({x: 0, y: 0})
});
const workspace = (...blocks) => ({
    getBlockById: id => blocks.find(b => b.id === id), getTopBlocks: () => blocks
});
const input = (name, target = null, type = 1, fields = []) => ({
    name, type, fieldRow: fields, connection: connection(target)
});
const pos = (blockId, kind, extra = {}) => ({blockId, kind, ...extra});

test('ordered slots include dropdowns, inputs and substacks without shadow duplicates', () => {
    const b = block('a', [input('x', null, 1, [field('DIRECTION')]), input('SUBSTACK', null, 3)]);
    expect(positionsForBlock(b, Blockly)).toEqual([
        pos('a', 'body'), pos('a', 'before'), pos('a', 'field', {inputName: 'x', fieldName: 'DIRECTION'}),
        pos('a', 'input', {inputName: 'x'}), pos('a', 'statement', {inputName: 'SUBSTACK'}), pos('a', 'after')
    ]);
    expect(firstPosition(b, Blockly).kind).toBe('field');
});
test('horizontal navigation stays inside the inline inputs; vertical navigation crosses stack joins', () => {
    const a = block('a', [input('X'), input('Y')]);
    const b = block('b', [input('X')]);
    a.getNextBlock = () => b;
    b.getPreviousBlock = () => a;
    const w = workspace(a);
    const x = pos('a', 'input', {inputName: 'X'});
    const y = pos('a', 'input', {inputName: 'Y'});
    expect(navigate(w, x, 'ArrowRight', {}, Blockly)).toEqual(y);
    expect(navigate(w, x, 'ArrowLeft', {}, Blockly)).toEqual(x);
    expect(navigate(w, y, 'ArrowRight', {}, Blockly)).toEqual(y);
    expect(navigate(w, x, 'ArrowDown', {}, Blockly)).toEqual(pos('a', 'after'));
    expect(navigate(w, pos('a', 'after'), 'ArrowDown', {}, Blockly)).toEqual(pos('b', 'input', {inputName: 'X'}));
    expect(navigate(w, x, 'ArrowUp', {}, Blockly)).toEqual(pos('a', 'before'));
    expect(navigate(w, pos('a', 'after'), 'ArrowRight', {}, Blockly)).toEqual(pos('a', 'after'));
});
test('Alt+Right/Left enters and exits reporters without changing horizontal navigation level', () => {
    const child = {...block('child'), previousConnection: null, nextConnection: null};
    const parent = block('parent', [input('X', child)]);
    child.getSurroundParent = () => parent;
    const w = workspace(parent, child);
    const slot = pos('parent', 'input', {inputName: 'X'});
    expect(navigate(w, slot, 'ArrowRight', {}, Blockly)).toEqual(slot);
    expect(navigate(w, slot, 'ArrowRight', {altKey: true}, Blockly)).toEqual(pos('child', 'body'));
    expect(navigate(w, pos('child', 'body'), 'ArrowLeft', {altKey: true}, Blockly)).toEqual(slot);
    expect(navigate(w, slot, 'Tab', {}, Blockly)).toEqual(slot);
});
test('Tab crosses reporter nesting without entering substacks and stops at row boundaries', () => {
    const child = {...block('child', [input('A'), input('B')]), outputConnection: connection()};
    const parent = block('parent', [input('X', child), input('Y'), input('SUBSTACK', null, 3)]);
    child.getSurroundParent = () => parent;
    const w = workspace(parent, child);
    const sequence = [pos('parent', 'input', {inputName: 'X'}), pos('child', 'input', {inputName: 'A'}),
        pos('child', 'input', {inputName: 'B'}), pos('parent', 'input', {inputName: 'Y'})];
    sequence.forEach((p, i) => {
        expect(navigate(w, p, 'Tab', {}, Blockly)).toEqual(sequence[Math.min(i + 1, 3)]);
        expect(navigate(w, p, 'Tab', {shiftKey: true}, Blockly)).toEqual(sequence[Math.max(i - 1, 0)]);
    });
});
test('Shift vertical navigation stays within the current substack including cap and empty ends', () => {
    const cap = {...block('cap'), nextConnection: null};
    const first = block('first');
    first.getNextBlock = () => cap;
    cap.getPreviousBlock = () => first;
    const parent = block('parent', [input('SUBSTACK', first, 3), input('EMPTY', null, 3)]);
    first.getPreviousBlock = () => parent;
    first.getSurroundParent = cap.getSurroundParent = () => parent;
    const w = workspace(parent, first, cap);
    const entry = pos('parent', 'statement', {inputName: 'SUBSTACK'});
    expect(navigate(w, pos('cap', 'body'), 'ArrowUp', {shiftKey: true}, Blockly)).toEqual(entry);
    expect(navigate(w, entry, 'ArrowDown', {shiftKey: true}, Blockly)).toEqual(pos('cap', 'body'));
    const empty = pos('parent', 'statement', {inputName: 'EMPTY'});
    expect(navigate(w, empty, 'ArrowDown', {shiftKey: true}, Blockly)).toEqual(empty);
});
test('deletion and mutation invalidate stale positions without retaining connections', () => {
    const b = block('a');
    expect(resolvePosition(workspace(), pos('a', 'after'), Blockly)).toBeNull();
    expect(resolvePosition(workspace(b), pos('a', 'input', {inputName: 'REMOVED'}), Blockly).position)
        .toEqual(pos('a', 'body'));
});
test('only shadow inputs expose their literal editor', () => {
    const literal = field('NUM');
    const shadow = block('shadow', [{fieldRow: [literal]}]);
    shadow.isShadow = () => true;
    expect(editableField({input: input('X', shadow)})).toBe(literal);
    shadow.isShadow = () => false;
    expect(editableField({input: input('X', shadow)})).toBeNull();
});
test('uses a compatible occupied input but never a standalone dropdown for a reporter', () => {
    const owner = block('owner', [input('X', block('old')), {name: 'D', fieldRow: [field('D')]}]);
    const reporter = {...block('r'), outputConnection: connection()};
    const w = workspace(owner);
    expect(insertionPlan(w, pos('owner', 'input', {inputName: 'X'}), reporter, Blockly).kind).toBe('connect');
    expect(insertionPlan(w, pos('owner', 'field', {inputName: 'D', fieldName: 'D'}), reporter, Blockly).kind).toBe('drag');
    owner.inputList[0].connection = connection(null, false);
    expect(insertionPlan(w, pos('owner', 'input', {inputName: 'X'}), reporter, Blockly).kind).toBe('drag');
});
test('stack insertion preserves successors and refuses to displace them with a terminal block', () => {
    const owner = block('owner', [input('X')]);
    owner.nextConnection = connection(block('successor'));
    const terminal = {...block('stop'), nextConnection: null};
    const w = workspace(owner);
    const p = pos('owner', 'input', {inputName: 'X'});
    expect(insertionPlan(w, p, block('move'), Blockly).parent).toBe(owner.nextConnection);
    expect(insertionPlan(w, p, terminal, Blockly).kind).toBe('drag');
    owner.nextConnection = connection();
    expect(insertionPlan(w, p, terminal, Blockly).kind).toBe('connect');
});
test('hat placement and incompatible or deleted cursor fallbacks', () => {
    expect(insertionPlan(workspace(), null, {...block('hat'), previousConnection: null}, Blockly).kind).toBe('hat');
    expect(insertionPlan(workspace(), pos('gone', 'after'), block('move'), Blockly).kind).toBe('drag');
});
test('keyboard mode is off by default, persistent, dynamic, and shared with addon settings', () => {
    const storage = new Map();
    global.localStorage = {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)};
    const store = new SettingsStore();
    expect(store.getAddonEnabled('keyboard-editing')).toBe(false);
    const listener = jest.fn();
    store.addEventListener('setting-changed', listener);
    store.setAddonEnabled('keyboard-editing', true);
    expect(listener.mock.calls[0][0].detail.reloadRequired).toBe(false);
    const reloaded = new SettingsStore();
    reloaded.readLocalStorage();
    expect(reloaded.getAddonEnabled('keyboard-editing')).toBe(true);
    store.setAddonEnabled('middle-click-popup', false);
    expect(store.getAddonEnabled('keyboard-editing')).toBe(true);
    store.setAddonEnabled('keyboard-editing', false);
    expect(store.getAddonEnabled('middle-click-popup')).toBe(false);
});

test('RTL reverses physical horizontal keys but keeps Tab in structural order', () => {
    const b = block('b', [input('X'), input('Y')]);
    const w = {...workspace(b), RTL: true};
    const p = pos('b', 'input', {inputName: 'X'});
    expect(navigate(w, p, 'ArrowLeft', {}, Blockly)).toEqual(pos('b', 'input', {inputName: 'Y'}));
    expect(navigate(w, p, 'ArrowRight', {}, Blockly)).toEqual(p);
    expect(navigate(w, p, 'Tab', {}, Blockly)).toEqual(pos('b', 'input', {inputName: 'Y'}));
});

test('top-level script navigation sorts spatially and stops at boundaries', () => {
    const a = block('a');
    const b = block('b');
    a.getRelativeToSurfaceXY = () => ({x: 20, y: 10});
    b.getRelativeToSurfaceXY = () => ({x: 10, y: 10});
    a.getRootBlock = () => a;
    b.getRootBlock = () => b;
    const w = workspace(a, b);
    expect(navigate(w, {kind: 'workspace'}, 'ArrowDown', {altKey: true}, Blockly)).toEqual(pos('b', 'body'));
    expect(navigate(w, pos('b', 'body'), 'ArrowDown', {altKey: true}, Blockly)).toEqual(pos('a', 'body'));
    expect(navigate(w, pos('a', 'body'), 'ArrowDown', {altKey: true}, Blockly)).toEqual(pos('a', 'body'));
});

test('settings-window disable handles an addon enabled only by its manifest default', () => {
    const store = new SettingsStore();
    const listener = jest.fn();
    store.addEventListener('addon-changed', listener);
    store.setStore({'middle-click-popup': {enabled: false}});
    expect(listener.mock.calls[0][0].detail).toEqual({
        addonId: 'middle-click-popup', dynamicEnable: false, dynamicDisable: true
    });
    store.setStore({'middle-click-popup': {}});
    expect(listener.mock.calls[1][0].detail.dynamicEnable).toBe(true);
});

test('implicit stack placement enters the first substack; explicit connections always win', () => {
    const owner = block('if', [input('CONDITION'), input('SUBSTACK', null, 3), input('SUBSTACK2', null, 3)]);
    const w = workspace(owner);
    const inserted = block('move');
    expect(insertionPlan(w, pos('if', 'input', {inputName: 'CONDITION'}), inserted, Blockly).parent)
        .toBe(owner.inputList[1].connection);
    expect(insertionPlan(w, pos('if', 'after'), inserted, Blockly).parent).toBe(owner.nextConnection);
    expect(insertionPlan(w, pos('if', 'statement', {inputName: 'SUBSTACK2'}), inserted, Blockly).parent)
        .toBe(owner.inputList[2].connection);
});

test('standalone cap has a head but no tail; both vertical ends stop without looping', () => {
    const cap = {...block('cap'), nextConnection: null};
    const w = workspace(cap);
    expect(navigate(w, pos('cap', 'before'), 'ArrowUp', {}, Blockly)).toEqual(pos('cap', 'before'));
    expect(navigate(w, pos('cap', 'before'), 'ArrowDown', {}, Blockly)).toEqual(pos('cap', 'body'));
    expect(navigate(w, pos('cap', 'body'), 'ArrowDown', {}, Blockly)).toEqual(pos('cap', 'body'));
});

test('clicking either side of a shared join navigates from the same single connection', () => {
    const first = block('first', [input('X')]);
    const last = block('last', [input('Y')]);
    first.getNextBlock = () => last;
    last.previousConnection.targetConnection = first.nextConnection;
    first.nextConnection.getSourceBlock = () => first;
    const w = workspace(first, last);
    w.getTopBlocks = () => [first];
    for (const kind of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        expect(navigate(w, pos('last', 'before'), kind, {}, Blockly))
            .toEqual(navigate(w, pos('first', 'after'), kind, {}, Blockly));
    }
    expect(navigate(w, pos('last', 'after'), 'ArrowDown', {}, Blockly)).toEqual(pos('last', 'after'));
});
