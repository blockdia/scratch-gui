import SettingsStore from '../../../../src/addons/settings-store';
import {RULES} from '../../../../src/addons/addons/linter/analyzer';

test('linter is opt-in and rule switches survive storage reload', () => {
    const previous = global.localStorage;
    const values = new Map();
    global.localStorage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
    try {
        const store = new SettingsStore();
        expect(store.getAddonEnabled('linter')).toBe(false);
        RULES.forEach(rule => expect(store.getAddonSetting('linter', rule)).toBe(true));
        store.setAddonEnabled('linter', true);
        store.setAddonSetting('linter', 'warp-wait', false);
        const reloaded = new SettingsStore();
        reloaded.readLocalStorage();
        expect(reloaded.getAddonEnabled('linter')).toBe(true);
        expect(reloaded.getAddonSetting('linter', 'warp-wait')).toBe(false);
        expect(reloaded.getAddonSetting('linter', 'missing-target')).toBe(true);
    } finally {
        global.localStorage = previous;
    }
});
