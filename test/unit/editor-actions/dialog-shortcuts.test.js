import {ActionRegistry, STORAGE_KEY} from '../../../src/lib/editor-actions/registry';
import dialogShortcuts, {
    CUSTOM_BLOCK_DIALOG, VARIABLE_DIALOG, customBlockShortcuts, variableShortcuts
} from '../../../src/lib/editor-actions/dialogs';
import {ariaBinding} from '../../../src/lib/editor-actions/keys';

const storage = () => {
    const values = {};
    return {getItem: key => values[key], setItem: (key, value) => { values[key] = value; }};
};
const setup = (options = {}) => {
    const registry = new ActionRegistry(options);
    registry.defineDialogShortcuts(dialogShortcuts);
    return registry;
};
const alt = code => ({key: 'º', code, altKey: true});

test('dialog shortcuts are listed for settings but never become executable actions', () => {
    const registry = setup();
    expect(registry.listActions()).toHaveLength(0);
    expect(registry.listShortcuts().map(item => item.id).sort()).toEqual(dialogShortcuts.map(item => item.id).sort());
    expect(registry.execute(customBlockShortcuts.addLabel)).toBe(false);
    expect(() => registry.defineDialogShortcuts([dialogShortcuts[0]])).toThrow();
});

test('dialogs match their own scope by event code, so Alt+0 is independent per dialog', () => {
    const registry = setup();
    expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, alt('Digit0'))).toBe(customBlockShortcuts.toggleWarp);
    expect(registry.matchDialogShortcut(VARIABLE_DIALOG, alt('Digit0'))).toBe(variableShortcuts.toggleScope);
    expect(registry.matchDialogShortcut(VARIABLE_DIALOG, alt('Digit1'))).toBeNull();
    expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, {...alt('Digit1'), isComposing: true})).toBeNull();
});

test('macOS defaults add Control so Option-digit symbols stay typeable', () => {
    const registry = setup({mac: true});
    expect(registry.bindings(customBlockShortcuts.addLabel)).toEqual(['Ctrl+Alt+3']);
    expect(registry.ariaShortcuts(customBlockShortcuts.addLabel)).toBe('Control+Alt+3');
    expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, alt('Digit3'))).toBeNull();
    expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, {...alt('Digit3'), ctrlKey: true}))
        .toBe(customBlockShortcuts.addLabel);
    expect(registry.matchDialogShortcut(VARIABLE_DIALOG, {...alt('Digit0'), ctrlKey: true}))
        .toBe(variableShortcuts.toggleScope);
});

test('Safari Chinese input method processed digits match only explicit macOS dialog chords', () => {
    const registry = setup({mac: true});
    const event = {key: '1', code: 'Digit1', keyCode: 229, ctrlKey: true, altKey: true};
    for (const key of ['1', 'Process', 'Unidentified']) {
        expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, {...event, key}))
            .toBe(customBlockShortcuts.addTextNumber);
    }
    expect(registry.matchDialogShortcut(VARIABLE_DIALOG, {...event, key: '0', code: 'Digit0'}))
        .toBe(variableShortcuts.toggleScope);
    for (const extra of [{isComposing: true}, {ctrlKey: false}, {altKey: false},
        {metaKey: true}, {shiftKey: true}, {code: ''}, {key: 'Enter', code: 'Enter'}]) {
        expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, {...event, ...extra})).toBeNull();
    }
    expect(setup().matchDialogShortcut(CUSTOM_BLOCK_DIALOG, event)).toBeNull();
    registry.setBindings(customBlockShortcuts.addTextNumber, []);
    expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, event)).toBeNull();
});

test('rebinding persists, applies immediately and reflects in aria-keyshortcuts', () => {
    const store = storage();
    const registry = setup({storage: store});
    expect(registry.ariaShortcuts(customBlockShortcuts.addLabel)).toBe('Alt+3');
    expect(registry.setBindings(customBlockShortcuts.addLabel, ['Mod+Alt+l'])).toBeNull();
    expect(JSON.parse(store.getItem(STORAGE_KEY)).overrides[customBlockShortcuts.addLabel]).toEqual(['Mod+Alt+l']);
    expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, alt('Digit3'))).toBeNull();
    expect(registry.matchDialogShortcut(CUSTOM_BLOCK_DIALOG,
        {key: 'l', code: 'KeyL', altKey: true, ctrlKey: true})).toBe(customBlockShortcuts.addLabel);
    expect(registry.ariaShortcuts(customBlockShortcuts.addLabel)).toBe('Control+Alt+L');
    registry.setBindings(customBlockShortcuts.addLabel, []);
    expect(registry.ariaShortcuts(customBlockShortcuts.addLabel)).toBeNull();
    const reloaded = setup({storage: store});
    expect(reloaded.bindings(customBlockShortcuts.addLabel)).toEqual([]);
});

test('conflicts are limited to a dialog, and navigation or unmodified keys are reserved', () => {
    const registry = setup();
    expect(registry.conflicts(variableShortcuts.toggleScope, ['Alt+0']).actions).toHaveLength(0);
    expect(registry.conflicts(customBlockShortcuts.addLabel, ['Alt+1']).actions.map(item => item.id))
        .toEqual([customBlockShortcuts.addTextNumber]);
    for (const key of ['Escape', 'Tab', 'Mod+Enter', 'a', 'Shift+b', 'F5']) {
        expect(registry.conflicts(customBlockShortcuts.addLabel, [key]).reserved.length).toBeGreaterThan(0);
    }
    expect(registry.conflicts(variableShortcuts.toggleScope, ['Mod+Enter']).reserved).toHaveLength(0);
    expect(registry.setBindings(customBlockShortcuts.addLabel, ['Escape'])).not.toBeNull();
});

test('aria shortcuts use ARIA key names', () => {
    expect(ariaBinding('Mod+Alt+k', false)).toBe('Control+Alt+K');
    expect(ariaBinding('Mod+Enter', true)).toBe('Meta+Enter');
});

test.each([false, true])('reset conflicts do not execute or fall through, including after reload (mac: %s)', mac => {
    const store = storage();
    const registry = setup({mac, storage: store});
    const binding = mac ? 'Ctrl+Alt+1' : 'Alt+1';
    expect(registry.setBindings(customBlockShortcuts.addLabel, [binding], true)).toBeNull();
    registry.reset(customBlockShortcuts.addTextNumber);

    for (const current of [registry, setup({mac, storage: store})]) {
        const event = {...alt('Digit1'), ctrlKey: mac,
            preventDefault: jest.fn(), stopImmediatePropagation: jest.fn()};
        const listener = jest.fn();
        current.subscribe(listener);
        expect(current.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, event)).toBeNull();
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
        expect(current.notice).toEqual({type: 'conflict', detail: [
            customBlockShortcuts.addTextNumber, customBlockShortcuts.addLabel
        ]});
        expect(listener).toHaveBeenCalledTimes(1);

        expect(current.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, {...event, repeat: true})).toBeNull();
        expect(event.preventDefault).toHaveBeenCalledTimes(2);
        expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenCalledTimes(1);

        expect(current.setBindings(customBlockShortcuts.addLabel, [binding], true)).toBeNull();
        expect(current.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, event)).toBe(customBlockShortcuts.addLabel);
    }
});
