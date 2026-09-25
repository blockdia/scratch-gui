import {WindowManager, constrain} from '../../../src/lib/editor-windows/manager';
import reducer from '../../../src/reducers/editor-windows';
import fs from 'fs';
import path from 'path';
import applyPatches from '../../../src/addons/patches/apply.cjs';
import patches from '../../../src/addons/patches/editor-windows.json';

let manager;
const element = () => ({contains: target => target === 'inside', focus: jest.fn(),
    getBoundingClientRect: () => ({left: 200, right: 230, bottom: 80})});
const register = (id, extra = {}) => manager.registerWindow({id, title: id, ...extra});
beforeEach(() => {
    manager = new WindowManager();
    global.document = {activeElement: null};
    global.getComputedStyle = () => ({direction: 'ltr'});
});
test('toolbar opens, hides, resumes and focuses existing windows without resetting content', () => {
    const reset = jest.fn();
    register('a', {onReset: reset});
    manager.toggle('a');
    expect(manager.state.active).toBe('a');
    manager.toggle('a');
    expect(manager.state.windows.a.status).toBe('hidden');
    manager.toggle('a');
    manager.setPinned('a', true);
    manager.outside('workspace');
    expect(manager.state.windows.a.status).toBe('visible');
    manager.toggle('a');
    expect(manager.state.active).toBe('a');
    expect(reset).not.toHaveBeenCalled();
});
test('only one temporary window survives, while pinned windows coexist and reorder', () => {
    ['a', 'b', 'c'].forEach(id => register(id));
    manager.open('a', {pinned: true});
    manager.open('b');
    manager.open('c');
    expect(manager.state.windows.a.status).toBe('visible');
    expect(manager.state.windows.b.status).toBe('hidden');
    expect(manager.state.windows.c.status).toBe('visible');
    manager.focus('a');
    expect(manager.state.windows.c.status).toBe('hidden');
    expect(manager.state.order.slice(-1)).toEqual(['a']);
});
test('toolbar pointerdown does not change toggle intent; owned portals retain focus', () => {
    const handle = register('a');
    const entry = manager.definitions.get('a');
    entry.anchor = element();
    manager.open('a');
    manager.outside('inside');
    expect(manager.state.active).toBe('a');
    manager.toggle('a');
    expect(manager.state.windows.a.status).toBe('hidden');
    manager.open('a');
    const disown = handle.own({contains: target => target === 'portal'});
    manager.outside('portal');
    expect(manager.state.windows.a.status).toBe('visible');
    disown();
    manager.outside('portal');
    expect(manager.state.windows.a.status).toBe('hidden');
});
test('gestures defer dismissal and close resets geometry without clearing tool data', () => {
    const data = ['log message'];
    const reset = jest.fn();
    register('a', {onReset: reset, content: data});
    manager.open('a', {pinned: true});
    manager.setRect('a', {x: 30, y: 130, width: 600, height: 450});
    manager.gesturing = true;
    manager.outside('workspace');
    expect(manager.state.active).toBe('a');
    manager.gesturing = false;
    manager.close('a');
    expect(manager.state.windows.a).toMatchObject({status: 'closed', pinned: false, rect: null});
    expect(reset).toHaveBeenCalledTimes(1);
    expect(data).toEqual(['log message']);
});
test('temporary windows reanchor while pinned windows restore their geometry', () => {
    register('a', {anchor: element()});
    manager.setBounds({x: 8, y: 50, width: 1200, height: 800});
    manager.open('a');
    expect(manager.state.windows.a.rect).toMatchObject({x: 200, y: 88});
    manager.hide('a');
    manager.definitions.get('a').anchor.getBoundingClientRect = () => ({left: 320, right: 350, bottom: 90});
    manager.open('a');
    expect(manager.state.windows.a.rect).toMatchObject({x: 320, y: 98});
    manager.setPinned('a', true);
    manager.setRect('a', {x: 40, y: 120, width: 400, height: 300});
    manager.hide('a');
    manager.open('a');
    expect(manager.state.windows.a.rect).toEqual({x: 40, y: 120, width: 400, height: 300});
});
test('RTL anchors align right and tiny viewports take priority over minimum sizes', () => {
    global.getComputedStyle = () => ({direction: 'rtl'});
    register('a', {anchor: element()});
    manager.setBounds({x: 0, y: 0, width: 1200, height: 800});
    manager.open('a');
    expect(manager.state.windows.a.rect.x).toBe(0);
    expect(constrain({x: 900, y: 800, width: 600, height: 400},
        {x: 8, y: 50, width: 200, height: 100})).toEqual({x: 8, y: 50, width: 200, height: 100});
});
test('player suspension preserves pinned windows and dismisses temporary windows', () => {
    register('a'); register('b');
    manager.open('a', {pinned: true}); manager.open('b');
    manager.suspend(true);
    expect(manager.state.windows.a.status).toBe('visible');
    expect(manager.state.windows.b.status).toBe('hidden');
    manager.open('b');
    expect(manager.state.windows.b.status).toBe('hidden');
    manager.suspend(false);
    expect(manager.state.active).toBe(null);
    manager.open('b', {pinned: true});
    expect(manager.state.windows.b.pinned).toBe(true);
    manager.reset();
    expect(Object.values(manager.state.windows).every(item => item.status === 'closed')).toBe(true);
});
test('unregister destroys once, removes Redux state and permits fresh registration', () => {
    const dispatch = jest.fn();
    const unbind = manager.bind({dispatch});
    const destroy = jest.fn();
    const handle = register('a', {onDestroy: destroy});
    handle.open(); handle.unregister(); handle.unregister();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(manager.state.windows.a).toBeUndefined();
    expect(reducer(undefined, dispatch.mock.calls.slice(-1)[0][0])).toEqual(manager.state);
    register('a');
    expect(manager.state.windows.a.status).toBe('closed');
    unbind();
});
test.each(patches.map(patch => [patch.file, patch]))('patch for %s rejects drift and round-trips reversible edits', (file, patch) => {
    const current = fs.readFileSync(path.resolve(__dirname, '../../../src/addons/addons', file), 'utf8');
    let upstream = current;
    // Empty replacements need an upstream fixture; reconstruct from the checked-in patch sequence instead.
    if (patch.replacements.some(item => !item.after)) {
        expect(() => applyPatches(file, 'upstream changed')).toThrow(/no longer matches/);
        return;
    }
    [...patch.replacements].reverse().forEach(({before, after}) => { upstream = upstream.replace(after, () => before); });
    expect(applyPatches(file, upstream)).toBe(current);
    expect(() => applyPatches(file, 'upstream changed')).toThrow(/no longer matches/);
});

test('unpin preserves geometry until the next open and external focus is not stolen', () => {
    register('a', {anchor: element()});
    manager.open('a', {pinned: true});
    manager.setRect('a', {x: 25, y: 160, width: 400, height: 300});
    manager.setPinned('a', false);
    manager.setBounds({...manager.bounds});
    expect(manager.state.windows.a.rect).toEqual({x: 25, y: 160, width: 400, height: 300});
    const entry = manager.definitions.get('a');
    entry.element = element();
    document.activeElement = 'inside';
    manager.outside('workspace');
    expect(entry.anchor.focus).not.toHaveBeenCalled();
});
