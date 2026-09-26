import english from './addons-l10n/en.json';
import entries from './generated/l10n-entries';

export const resolveAddonLocale = locale => {
    const normalized = locale.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(entries, normalized)) return normalized;
    const base = normalized.split('-')[0];
    return Object.prototype.hasOwnProperty.call(entries, base) ? base : 'en';
};

// A separate namespace avoids collisions with GUI message IDs. Only strings are messages.
export const namespaceAddonMessages = messages => {
    const result = {};
    for (const [id, value] of Object.entries(messages)) {
        if (typeof value === 'string') result[`addons.${id.replace(/\//g, '.')}`] = value;
    }
    return result;
};
export const englishAddonMessages = namespaceAddonMessages(english);
const pending = new Map();

export const loadAddonMessages = locale => {
    const resolved = resolveAddonLocale(locale);
    if (resolved === 'en') return Promise.resolve(english);
    if (!pending.has(resolved)) {
        const promise = entries[resolved]().then(module => ({...english, ...(module.default || module)}));
        pending.set(resolved, promise);
        promise.catch(() => pending.delete(resolved));
    }
    return pending.get(resolved);
};
