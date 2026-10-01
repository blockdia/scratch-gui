import messages from './messages';

export const CUSTOM_BLOCK_DIALOG = 'customBlockDialog';
export const VARIABLE_DIALOG = 'variableDialog';

export const customBlockShortcuts = {
    addTextNumber: 'builtin/dialog-add-text-number',
    addBoolean: 'builtin/dialog-add-boolean',
    addLabel: 'builtin/dialog-add-label',
    toggleWarp: 'builtin/dialog-toggle-warp'
};
export const variableShortcuts = {
    toggleScope: 'builtin/dialog-toggle-variable-scope'
};

// Option+digit types symbols on macOS, so Mac defaults add Control.
const dialog = (id, title, scope, digit) => ({
    id,
    title,
    scopes: [scope],
    defaultBindings: [`Alt+${digit}`],
    macBindings: [`Ctrl+Alt+${digit}`]
});

// Configurable in settings, but handled by each dialog rather than registered as actions.
export default [
    dialog(customBlockShortcuts.addTextNumber, messages.dialogAddTextNumber, CUSTOM_BLOCK_DIALOG, 1),
    dialog(customBlockShortcuts.addBoolean, messages.dialogAddBoolean, CUSTOM_BLOCK_DIALOG, 2),
    dialog(customBlockShortcuts.addLabel, messages.dialogAddLabel, CUSTOM_BLOCK_DIALOG, 3),
    dialog(customBlockShortcuts.toggleWarp, messages.dialogToggleWarp, CUSTOM_BLOCK_DIALOG, 0),
    dialog(variableShortcuts.toggleScope, messages.dialogToggleScope, VARIABLE_DIALOG, 0)
];
