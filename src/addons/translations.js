import upstreamEnglish from './addons-l10n/en.json';
import blockdiaEnglish from './blockdia-l10n/en.json';
import blockdiaEntries from './blockdia-l10n';
import entries from './generated/l10n-entries';

const english = {...upstreamEnglish, ...blockdiaEnglish};
const hasLocale = locale => Object.prototype.hasOwnProperty.call(entries, locale) ||
    Object.prototype.hasOwnProperty.call(blockdiaEntries, locale);

export const resolveAddonLocale = locale => {
    const normalized = locale.toLowerCase();
    if (hasLocale(normalized)) return normalized;
    const base = normalized.split('-')[0];
    return hasLocale(base) ? base : 'en';
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
        const promise = Promise.all([
            entries[resolved] ? entries[resolved]() : {},
            blockdiaEntries[resolved] ? blockdiaEntries[resolved]() : {}
        ]).then(([upstream, blockdia]) => ({
            ...english,
            ...(upstream.default || upstream),
            ...(blockdia.default || blockdia)
        }));
        pending.set(resolved, promise);
        promise.catch(() => pending.delete(resolved));
    }
    return pending.get(resolved);
};
