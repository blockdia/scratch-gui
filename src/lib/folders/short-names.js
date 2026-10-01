import {useEffect, useState} from 'react';
import settings from '../../addons/settings-store-singleton';
import {splitName, joinName, SEPARATOR} from './index';

export const SHORT_NAMES_ADDON = 'short-names';
const nameScope = kind => ({SPRITE: 'sprite', COSTUME: 'costume', SOUND: 'sound'}[kind]);

export const displayResourceName = (name, kind, short) =>
    (short && typeof name === 'string' ? splitName(name, kind === 'SPRITE').basename : name);

export const resolveEditedName = (input, original, kind, short) => {
    if (!short) return input;
    const {folder, basename} = splitName(original, kind === 'SPRITE');
    if (input === basename) return original;
    return input.includes(SEPARATOR) ? input : joinName(folder, input);
};

export const useShortNames = scope => {
    const read = () => settings.getAddonEnabled(SHORT_NAMES_ADDON) &&
        settings.getAddonSetting(SHORT_NAMES_ADDON, scope);
    const [enabled, setEnabled] = useState(read);
    useEffect(() => {
        const update = event => {
            if (!event || event.detail.addonId === SHORT_NAMES_ADDON) setEnabled(read());
        };
        settings.addEventListener('setting-changed', update);
        settings.addEventListener('addon-changed', update);
        update();
        return () => {
            settings.removeEventListener('setting-changed', update);
            settings.removeEventListener('addon-changed', update);
        };
    }, [scope]);
    return enabled;
};

export const useNameField = (name, kind) => {
    const short = useShortNames(`${nameScope(kind)}Name`);
    const editShortNames = useShortNames('editShortNames');
    const [session, setSession] = useState(null);
    // Keep the edit's interpretation fixed if addon settings change mid-edit.
    const editingShort = session ? session.short : short && editShortNames;
    return {
        name: displayResourceName(name, kind, session ? session.short : short),
        handleFocus: () => setSession({name, short: short && editShortNames}),
        handleBlur: () => setSession(null),
        resolveName: input => resolveEditedName(input, session ? session.name : name, kind, editingShort)
    };
};
