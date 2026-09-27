import {ActionRegistry, STORAGE_KEY} from '../../../src/lib/editor-actions/registry';
import {normalizeBinding, eventBinding, resolveBinding} from '../../../src/lib/editor-actions/keys';
import AddonActions from '../../../src/addons/action-registry';
import {WindowManager} from '../../../src/lib/editor-windows/manager';

const storage = () => {
    const values = {};
    return {getItem: key => values[key], setItem: (key, value) => { values[key] = value; }};
};
const register = (registry, id, extra = {}) => registry.registerAction({id, title: id, run: jest.fn(), ...extra});

test('stable registrations execute latest callback and reject duplicates, then release subscriptions', () => {
    const registry = new ActionRegistry();
    const listener = jest.fn();
    const stop = registry.subscribe(listener);
    const first = jest.fn();
    const next = jest.fn();
    const handle = register(registry, 'builtin/a', {run: first});
    expect(() => register(registry, 'builtin/a')).toThrow();
    handle.execute();
    handle.update({id: 'changed', run: next});
    handle.execute();
    expect(first).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    handle.unregister();
    handle.execute();
    expect(next).toHaveBeenCalledTimes(1);
    stop();
    listener.mockClear();
    registry.emit();
    expect(listener).not.toHaveBeenCalled();
});

test('disabled and wrong-context actions are not executed; async and synchronous errors are reported', async () => {
    const registry = new ActionRegistry();
    const run = jest.fn();
    const handle = register(registry, 'builtin/a', {run, scopes: ['blocks'], enabled: () => false});
    handle.execute();
    handle.update({enabled: () => true});
    registry.execute('builtin/a', {area: 'stage'});
    expect(run).not.toHaveBeenCalled();
    handle.update({run: () => Promise.reject(new Error('async'))});
    await handle.execute();
    expect(registry.notice.type).toBe('execution');
    handle.update({run: () => { throw new Error('sync'); }});
    expect(handle.execute()).toBe(false);
    expect(registry.notice.detail.error.message).toBe('sync');
});

test('bindings are portable, modifier order is canonical, Option-X works on macOS, and IME is ignored', () => {
    expect(normalizeBinding('Shift+Mod+S')).toBe('Mod+Shift+s');
    expect(resolveBinding('Mod+Ctrl+s', true)).toBe(resolveBinding('Ctrl+Meta+s', true));
    expect(eventBinding({key: '≈', code: 'KeyX', altKey: true}, true)).toBe('Alt+x');
    expect(eventBinding({key: 's', metaKey: true}, true)).toBe('Mod+s');
    expect(eventBinding({key: 's', ctrlKey: true}, false)).toBe('Mod+s');
    expect(eventBinding({key: 'a', isComposing: true}, false)).toBeNull();
    expect(eventBinding({key: 'Dead'}, false)).toBeNull();
    expect(() => normalizeBinding('Ctrl+k Ctrl+c')).toThrow();
});

test('disjoint scopes may share shortcuts; overlapping scopes require explicit replacement', () => {
    const registry = new ActionRegistry({storage: storage()});
    register(registry, 'builtin/a', {scopes: ['blocks'], defaultBindings: ['Mod+k', 'Mod+j']});
    register(registry, 'builtin/b', {scopes: ['costumes']});
    register(registry, 'builtin/c', {scopes: ['editor']});
    expect(registry.setBindings('builtin/b', ['Mod+k'])).toBeNull();
    expect(registry.setBindings('builtin/c', ['Mod+k']).actions).toHaveLength(2);
    expect(registry.bindings('builtin/a')).toContain('Mod+k');
    expect(registry.setBindings('builtin/c', ['Mod+k'], true)).toBeNull();
    expect(registry.bindings('builtin/a')).toEqual(['Mod+j']);
    expect(registry.bindings('builtin/b')).toEqual([]);
    expect(registry.setBindings('builtin/c', ['Mod+z'], true).reserved.length).toBeGreaterThan(0);
});

test('unbound, default and dormant addon overrides remain distinct across reloads', () => {
    const store = storage();
    const registry = new ActionRegistry({storage: store});
    register(registry, 'builtin/a', {defaultBindings: ['Mod+k']});
    registry.setBindings('builtin/a', []);
    registry.setBindings('addon/disabled/a', ['Alt+j']);
    const restored = new ActionRegistry({storage: store});
    register(restored, 'builtin/a', {defaultBindings: ['Mod+k']});
    expect(restored.bindings('builtin/a')).toEqual([]);
    expect(restored.bindings('addon/disabled/a')).toEqual(['Alt+j']);
    restored.reset('builtin/a');
    expect(restored.bindings('builtin/a')).toEqual(['Mod+k']);
});

test('corrupt config falls back; storage failures retain in-memory edits', () => {
    const store = storage();
    store.setItem(STORAGE_KEY, '{bad');
    const registry = new ActionRegistry({storage: store});
    expect(registry.notice.type).toBe('invalidStorage');
    store.setItem = () => { throw new Error('quota'); };
    register(registry, 'builtin/a');
    registry.setBindings('builtin/a', ['Alt+j']);
    expect(registry.notice.type).toBe('storage');
    expect(registry.bindings('builtin/a')).toEqual(['Alt+j']);
});

test('addon handle survives disable/re-enable without execution or duplicate registration while disabled', () => {
    const registry = new ActionRegistry({storage: storage()});
    let enabled = true;
    const addon = new AddonActions('test', () => enabled, registry);
    const run = jest.fn();
    const handle = addon.register({id: 'toggle', run});
    registry.setBindings('addon/test/toggle', ['Mod+k']);
    enabled = false;
    addon.setEnabled(false);
    handle.execute();
    expect(run).not.toHaveBeenCalled();
    expect(registry.listActions()).toHaveLength(0);
    enabled = true;
    addon.setEnabled(true);
    addon.setEnabled(true);
    handle.execute();
    expect(run).toHaveBeenCalledTimes(1);
    expect(registry.bindings('addon/test/toggle')).toEqual(['Mod+k']);
    handle.unregister();
    addon.setEnabled(true);
    expect(registry.listActions()).toHaveLength(0);
});

test('window action and toolbar handle share toggle state and unregister together', () => {
    const registry = new ActionRegistry();
    const manager = new WindowManager(registry);
    const handle = manager.registerWindow({id: 'test/inspector', title: 'Inspector'});
    const action = manager.definitions.get('test/inspector').action;
    action.execute();
    expect(manager.state.windows['test/inspector'].status).toBe('visible');
    action.execute();
    expect(manager.state.windows['test/inspector'].status).toBe('hidden');
    handle.unregister();
    expect(registry.listActions()).toHaveLength(0);
});

test('disposed handles cannot execute a replacement registration or mutate its bindings', () => {
    const registry = new ActionRegistry();
    const old = register(registry, 'builtin/a');
    old.unregister();
    const run = jest.fn();
    register(registry, 'builtin/a', {run, defaultBindings: ['Mod+k']});
    old.execute();
    old.update({run: jest.fn()});
    expect(run).not.toHaveBeenCalled();
    registry.bindings('builtin/a').push('Mod+j');
    expect(registry.bindings('builtin/a')).toEqual(['Mod+k']);
    registry.execute('builtin/a');
    expect(run).toHaveBeenCalledTimes(1);
});

test('Unicode character bindings and Option-number recording use stable single strokes', () => {
    expect(normalizeBinding('Mod+é')).toBe('Mod+é');
    expect(eventBinding({key: '™', code: 'Digit2', altKey: true}, true)).toBe('Alt+2');
    expect(eventBinding({key: '?', code: 'Slash', shiftKey: true}, false)).toBe('Shift+?');
});

test('restoring defaults keeps explicit overrides on other actions and surfaces resulting conflicts', () => {
    const registry = new ActionRegistry({storage: storage()});
    register(registry, 'builtin/a', {defaultBindings: ['Mod+k']});
    register(registry, 'builtin/b');
    registry.setBindings('builtin/b', ['Mod+k'], true);
    registry.reset('builtin/a');
    expect(registry.conflicts('builtin/a', registry.bindings('builtin/a')).actions.map(a => a.id)).toEqual(['builtin/b']);
    expect(registry.bindings('builtin/b')).toEqual(['Mod+k']);
});

test('individual removal works even when other bindings still conflict', () => {
    const registry = new ActionRegistry({storage: storage()});
    register(registry, 'builtin/a', {defaultBindings: ['Mod+k', 'Mod+j']});
    register(registry, 'builtin/b', {defaultBindings: ['Mod+k', 'Mod+j']});
    expect(registry.setBindings('builtin/a', ['Mod+j'])).toBeNull();
    expect(registry.bindings('builtin/a')).toEqual(['Mod+j']);
    expect(registry.bindings('builtin/b')).toEqual(['Mod+k', 'Mod+j']);
});


test('legacy fullscreen overrides merge into the public toggle and preserve explicit unbinding', () => {
    const saved = storage();
    saved.setItem(STORAGE_KEY, JSON.stringify({version: 1, overrides: {
        'builtin/fullscreen': ['Alt+f'], 'builtin/exit-fullscreen': ['Alt+f', 'Mod+Enter']
    }}));
    const registry = new ActionRegistry({storage: saved});
    expect(registry.overrides).toEqual({'builtin/toggle-fullscreen': ['Alt+f', 'Mod+Enter']});
    saved.setItem(STORAGE_KEY, JSON.stringify({version: 1, overrides: {'builtin/fullscreen': []}}));
    expect(new ActionRegistry({storage: saved}).overrides).toEqual({'builtin/toggle-fullscreen': []});
    saved.setItem(STORAGE_KEY, JSON.stringify({version: 1, overrides: {
        'builtin/fullscreen': ['Alt+f'], 'builtin/toggle-fullscreen': []
    }}));
    expect(new ActionRegistry({storage: saved}).overrides).toEqual({'builtin/toggle-fullscreen': []});
});
