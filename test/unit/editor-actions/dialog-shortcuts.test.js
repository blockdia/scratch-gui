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
