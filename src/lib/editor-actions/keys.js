// Bindings are portable, single strokes. Mod follows the host platform.
const modifiers = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'];
const aliases = {' ': 'Space', 'Escape': 'Escape', 'Esc': 'Escape', '+': 'Plus'};
export const normalizeBinding = binding => {
    if (typeof binding !== 'string') throw new Error('Invalid shortcut');
    const parts = binding.split('+');
    const key = parts.pop();
    if (!key || modifiers.includes(key) || parts.some(part => !modifiers.includes(part))) {
        throw new Error('Invalid shortcut');
    }
    const normalizedKey = aliases[key] || (key.length === 1 ? key.toLowerCase() : key);
    const namedKey = /^(Space|Plus|Escape|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown)$/;
    const navigationKey = /^(Arrow(Left|Right|Up|Down)|F([1-9]|1[0-2]))$/;
    const codepoint = normalizedKey.codePointAt(0);
    const printable = Array.from(normalizedKey).length === 1 &&
        !/\s/.test(normalizedKey) && codepoint >= 32 && codepoint !== 127;
    if (!printable && !namedKey.test(normalizedKey) && !navigationKey.test(normalizedKey)) {
        throw new Error('Invalid shortcut');
    }
    return [...modifiers.filter(part => parts.includes(part)), normalizedKey].join('+');
};
export const resolveBinding = (binding, mac) => normalizeBinding(
    normalizeBinding(binding).replace(/\bMod\b/g, mac ? 'Meta' : 'Ctrl')
);
export const eventBinding = (event, mac) => {
    if (!event.key || event.isComposing || event.keyCode === 229 ||
        ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Unidentified'].includes(event.key)) return null;
    let key = event.key;
    // Option-letter produces a different character on macOS. Keep the letter chord usable.
    if (event.altKey && /^Key[A-Z]$/.test(event.code || '')) key = event.code.slice(3).toLowerCase();
    if (event.altKey && /^Digit[0-9]$/.test(event.code || '')) key = event.code.slice(5);
    const parts = [];
    if (mac ? event.metaKey : event.ctrlKey) parts.push('Mod');
    if (mac ? event.ctrlKey : event.metaKey) parts.push(mac ? 'Ctrl' : 'Meta');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    parts.push(aliases[key] || key);
    try {
        return normalizeBinding(parts.join('+'));
    } catch (_) {
        return null;
    }
};
export const displayBinding = (binding, mac) => binding.split('+').map(part => ({
    Mod: mac ? '⌘' : 'Ctrl',
    Meta: mac ? '⌘' : 'Win',
    Ctrl: 'Ctrl',
    Alt: mac ? '⌥' : 'Alt',
    Shift: mac ? '⇧' : 'Shift',
    Space: 'Space',
    Plus: '+',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓'
}[part] || (part.length === 1 ? part.toUpperCase() : part)))
    .join(mac ? ' ' : '+');
