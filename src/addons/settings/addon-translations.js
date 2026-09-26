import upstreamEntries from '../generated/l10n-settings-entries';
import blockdiaEntries from '../blockdia-l10n-settings';

// English settings defaults remain in each addon's manifest.
export const addonSettingsLocales = ['en', ...new Set([
    ...Object.keys(upstreamEntries), ...Object.keys(blockdiaEntries)
])];

export const loadAddonSettingsMessages = locale => {
    const normalized = locale.toLowerCase();
    const resolved = addonSettingsLocales.includes(normalized) ? normalized : normalized.split('-')[0];
    return {
        ...(upstreamEntries[resolved] ? upstreamEntries[resolved]() : {}),
        ...(blockdiaEntries[resolved] ? blockdiaEntries[resolved]() : {})
    };
};
