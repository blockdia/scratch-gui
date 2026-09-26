import SettingsStore from '../../../../src/addons/settings-store';
import {RULE_DEFINITIONS} from '../../../../src/addons/addons/linter/rules';

test('linter is opt-in and rule switches survive storage reload', () => {
    const previous = global.localStorage;
    const values = new Map();
    global.localStorage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
    try {
        const store = new SettingsStore();
        expect(store.getAddonEnabled('linter')).toBe(false);
        RULE_DEFINITIONS.forEach(rule => expect(store.getAddonSetting('linter', rule.id)).toBe(rule.enabled));
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
