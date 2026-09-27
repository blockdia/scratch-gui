import {ActionRegistry} from '../../../src/lib/editor-actions/registry';
import registerFullscreenActions from '../../../src/lib/editor-actions/fullscreen';
import {ShortcutController} from '../../../src/lib/editor-actions/keyboard';

let registry;
let controller;
let state;
const target = selectors => ({closest: query => selectors.some(selector => query.includes(selector)) ? {} : null});
const key = (value, extra = {}) => ({key: value, target: target([]), preventDefault: jest.fn(),
    stopImmediatePropagation: jest.fn(), ...extra});
const add = (id, extra = {}) => {
    const run = jest.fn();
    registry.registerAction({id, run, scopes: ['blocks'], defaultBindings: ['Mod+k'], ...extra});
    return run;
};
beforeEach(() => {
    global.document = {querySelectorAll: () => [], body: {}, documentElement: {}};
    state = {scratchGui: {mode: {}, editorTab: {activeTabIndex: 0}}};
    registry = new ActionRegistry();
    controller = new ShortcutController(registry, () => state);
});
test('one match consumes once, repeat never re-executes, and rebinding releases the old key', () => {
    const run = add('builtin/a');
    const event = key('k', {ctrlKey: true});
    controller.keydown(event);
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    controller.keydown(key('k', {ctrlKey: true, repeat: true}));
    expect(run).toHaveBeenCalledTimes(1);
    registry.setBindings('builtin/a', ['Mod+j']);
    const old = key('k', {ctrlKey: true});
    controller.keydown(old);
    expect(old.preventDefault).not.toHaveBeenCalled();
    controller.keydown(key('j', {ctrlKey: true}));
    expect(run).toHaveBeenCalledTimes(2);
});
test('ordinary inputs, IME, dragging, modal and recording suppress actions', () => {
    const run = add('builtin/a');
    controller.keydown(key('k', {ctrlKey: true, target: target(['input'])}));
    controller.keydown(key('k', {ctrlKey: true, isComposing: true}));
    controller.keydown(key('k', {ctrlKey: true, keyCode: 229}));
    controller.pointerDown = true;
    controller.keydown(key('k', {ctrlKey: true}));
    controller.release();
    registry.recording = true;
    controller.keydown(key('k', {ctrlKey: true}));
    registry.recording = false;
    document.querySelectorAll = () => [{style: {}}];
    controller.keydown(key('k', {ctrlKey: true}));
    expect(run).not.toHaveBeenCalled();
});
test('stage focus and full screen preserve project input, explicit global actions work in inputs', () => {
    const run = add('builtin/a');
    const save = add('builtin/save', {scopes: ['global'], allowInInput: true, defaultBindings: ['Mod+s']});
    controller.track({type: 'focusin', target: target(['data-shortcut-stage'])});
    controller.keydown(key('k', {ctrlKey: true}));
    controller.keydown(key('s', {ctrlKey: true, target: target(['input'])}));
    expect(run).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    controller.track({type: 'focusin', target: target([])});
    controller.keydown(key('k', {ctrlKey: true}));
    expect(run).toHaveBeenCalledTimes(1);
    state.scratchGui.mode.isFullScreen = true;
    controller.keydown(key('k', {ctrlKey: true}));
    expect(run).toHaveBeenCalledTimes(1);
});
test('keyboard proxy selects exactly one block-search action while normal text never opens it', () => {
    const mouse = add('addon/mouse/search', {defaultBindings: ['Mod+Space']});
    const keyboard = add('addon/keyboard/search', {scopes: ['keyboard'], defaultBindings: ['Mod+Space']});
    controller.keydown(key(' ', {ctrlKey: true}));
    controller.keydown(key(' ', {ctrlKey: true, target: target(['data-shortcut-keyboard', 'textarea'])}));
    controller.keydown(key(' ', {ctrlKey: true, target: target(['textarea'])}));
    expect(mouse).toHaveBeenCalledTimes(1);
    expect(keyboard).toHaveBeenCalledTimes(1);
});
test('ambiguous matches and reserved bindings execute nothing and report conflict', () => {
    const a = add('builtin/a');
    const b = add('builtin/b');
    controller.keydown(key('k', {ctrlKey: true}));
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(registry.notice.type).toBe('conflict');
    const undo = add('builtin/undo', {defaultBindings: ['Mod+z']});
    controller.keydown(key('z', {ctrlKey: true}));
    expect(undo).not.toHaveBeenCalled();
});
test('lifecycle removes capture listeners and never intercepts VM key releases', () => {
    const surface = {addEventListener: jest.fn(), removeEventListener: jest.fn()};
    const unmount = controller.mount(surface);
    expect(surface.addEventListener.mock.calls.some(([name]) => name === 'keyup')).toBe(false);
    unmount();
    expect(surface.removeEventListener.mock.calls).toEqual(surface.addEventListener.mock.calls);
});

test('tab changes resolve the current context and inactive scopes never compete', () => {
    const blocks = add('builtin/a');
    const costumes = add('builtin/b', {scopes: ['costumes']});
    controller.keydown(key('k', {ctrlKey: true}));
    state.scratchGui.editorTab.activeTabIndex = 1;
    controller.keydown(key('k', {ctrlKey: true}));
    expect(blocks).toHaveBeenCalledTimes(1);
    expect(costumes).toHaveBeenCalledTimes(1);
    expect(registry.notice).toBeNull();
});

test('Variables addon tab keeps editor and global shortcuts available', () => {
    const editor = add('addon/variable-manager/open', {scopes: ['editor']});
    const variables = add('addon/variable-manager/local', {scopes: ['variables'], defaultBindings: ['Mod+j']});
    const save = add('builtin/save', {scopes: ['global'], defaultBindings: ['Mod+s'], allowInInput: true});
    state.scratchGui.editorTab.activeTabIndex = 3;
    controller.keydown(key('k', {ctrlKey: true}));
    controller.keydown(key('j', {ctrlKey: true}));
    controller.keydown(key('s', {ctrlKey: true, target: target(['input'])}));
    expect(editor).toHaveBeenCalledTimes(1);
    expect(variables).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
});

test('even an input-enabled global action never consumes ordinary unmodified typing', () => {
    const save = add('builtin/save', {scopes: ['global'], allowInInput: true, defaultBindings: ['q']});
    controller.keydown(key('q', {target: target(['input'])}));
    expect(save).not.toHaveBeenCalled();
});

test.each([true, false])('Mod defaults execute only the host modifier (mac=%s)', mac => {
    registry.mac = mac;
    const search = add('addon/search/open', {defaultBindings: ['Mod+Space']});
    controller.keydown(key(' ', mac ? {ctrlKey: true} : {metaKey: true}));
    expect(search).not.toHaveBeenCalled();
    controller.keydown(key(' ', mac ? {metaKey: true} : {ctrlKey: true}));
    expect(search).toHaveBeenCalledTimes(1);
});

test('one public fullscreen binding enters and exits, including stage context', () => {
    const handles = registerFullscreenActions(registry, () => state.scratchGui.mode.isFullScreen,
        value => { state.scratchGui.mode.isFullScreen = value; });
    expect(registry.listActions().map(action => action.id)).toEqual(['builtin/toggle-fullscreen']);
    expect(registry.bindings('builtin/toggle-fullscreen')).toEqual(['Alt+f']);
    controller.keydown(key('f', {altKey: true}));
    expect(state.scratchGui.mode.isFullScreen).toBe(true);
    controller.keydown(key('f', {altKey: true}));
    expect(state.scratchGui.mode.isFullScreen).toBe(false);
    registry.execute('builtin/fullscreen');
    expect(state.scratchGui.mode.isFullScreen).toBe(true);
    registry.execute('builtin/exit-fullscreen');
    expect(state.scratchGui.mode.isFullScreen).toBe(false);
    handles.forEach(handle => handle.unregister());
    expect(registry.listActions()).toEqual([]);
});

test('the keyboard proxy keeps printable input for type-to-search even if an editor action uses that key', () => {
    const run = add('builtin/a', {scopes: ['editor'], defaultBindings: ['q']});
    const event = key('q', {target: target(['data-shortcut-keyboard', 'textarea'])});
    controller.keydown(event);
    expect(run).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
});

test.each(['ArrowUp', 'ArrowDown'])('Alt+%s stays available for keyboard script navigation', arrow => {
    const run = add('builtin/run', {scopes: ['editor'], defaultBindings: ['Mod+Enter']});
    expect(registry.setBindings('builtin/run', [`Alt+${arrow}`], true).reserved.length).toBeGreaterThan(0);
    expect(registry.bindings('builtin/run')).toEqual(['Mod+Enter']);
    const event = key(arrow, {altKey: true, target: target(['data-shortcut-keyboard', 'textarea'])});
    controller.keydown(event);
    expect(run).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
});
