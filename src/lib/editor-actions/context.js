export const areas = ['blocks', 'keyboard', 'costumes', 'sounds', 'variables', 'stage', 'window'];
export const expandScopes = scopes => (scopes || ['editor']).reduce((result, scope) => {
    const expanded = scope === 'global' ? areas : scope === 'editor' ? areas.filter(area => area !== 'stage') : [scope];
    return [...new Set([...result, ...expanded])];
}, []);
export const scopesOverlap = (a, b) => expandScopes(a).some(scope => expandScopes(b).includes(scope));
export const availableIn = (definition, context) => !context ||
    expandScopes(definition.scopes).includes(context.area);
export const editableTarget = target => Boolean(target && target.closest &&
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
export const hasModal = () => Array.from(document.querySelectorAll(
    '.ReactModal__Content, [aria-modal="true"], [data-addon-modal]'
)).some(element => !element.hidden && element.style.display !== 'none');

// Reserved interactions are owned by the existing editors, not customizable actions.
export const reservations = [
    {scopes: ['global'],
        keys: ['Escape', 'Tab', 'Shift+Tab', 'Enter',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown'],
        name: 'navigation'},
    {scopes: ['blocks', 'keyboard', 'costumes', 'sounds', 'variables'],
        keys: ['Mod+c', 'Mod+x', 'Mod+v', 'Mod+z', 'Mod+Shift+z', 'Mod+y',
            'Mod+a', 'Delete', 'Backspace'],
        name: 'editing'},
    {scopes: ['sounds'],
        keys: ['Space', 'Shift+Delete', 'Shift+Backspace'],
        name: 'sound'},
    {scopes: ['costumes'],
        keys: ['Space', 'v', 'a', 'c', 'b', 'e', 'f', 't', 'l', 'r', 'o', 's',
            ...'vacbeftlros'.split('').map(key => `Shift+${key}`),
            'Mod+g', 'Mod+Shift+g', 'Mod+Shift+f', 'Mod+Shift+b', 'Mod+Plus', 'Mod+-', 'Mod+0'],
        name: 'paint'},
    {scopes: ['keyboard'],
        keys: ['Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+ArrowUp', 'Alt+ArrowDown', 'Shift+Enter'],
        name: 'navigation'},
    {scopes: ['customBlockDialog'],
        keys: ['Escape', 'Tab', 'Shift+Tab', 'Enter', 'Mod+Enter'],
        name: 'navigation'},
    {scopes: ['variableDialog'],
        keys: ['Escape', 'Tab', 'Shift+Tab', 'Enter'],
        name: 'navigation'}
];
// Legacy editors accept either Control or Meta, even on the other platform.
reservations.forEach(item => {
    item.keys = [...new Set(item.keys.reduce((keys, key) => [...keys, key,
        key.replace('Mod+', 'Ctrl+'), key.replace('Mod+', 'Meta+')], []))];
});
