import SettingsStore from '../../../../src/addons/settings-store';
import {loadAddonSettingsMessages} from '../../../../src/addons/settings/addon-translations';

test('debugger defaults to enabled with hidden palette blocks and preserves explicit user choices', () => {
    const previous = global.localStorage;
    const values = new Map();
    global.localStorage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
    try {
        const store = new SettingsStore();
        expect(store.getAddonEnabled('debugger')).toBe(true);
        expect(store.getAddonSetting('debugger', 'show_blocks')).toBe(false);
        expect(store.getAddonSetting('debugger', 'log_failed_clone_creation')).toBe(true);
        const onChange = jest.fn();
        store.addEventListener('setting-changed', onChange);
        store.setAddonSetting('debugger', 'show_blocks', true);
        expect(onChange.mock.calls[0][0].detail.reloadRequired).toBe(true);
        store.setAddonSetting('debugger', 'log_failed_clone_creation', false);
        expect(onChange.mock.calls[1][0].detail.reloadRequired).toBe(false);
        store.setAddonEnabled('debugger', false);
        expect(onChange.mock.calls[2][0].detail.reloadRequired).toBe(true);
        const reloaded = new SettingsStore();
        reloaded.readLocalStorage();
        expect(reloaded.getAddonEnabled('debugger')).toBe(false);
        expect(reloaded.getAddonSetting('debugger', 'show_blocks')).toBe(true);
        expect(reloaded.getAddonSetting('debugger', 'log_failed_clone_creation')).toBe(false);
    } finally {
        global.localStorage = previous;
    }
});

test('the debugger block visibility setting is localized', () => {
    expect(loadAddonSettingsMessages('zh-CN')['debugger/@settings-name-show_blocks']).toBe('显示调试器积木');
    expect(loadAddonSettingsMessages('zh-TW')['debugger/@settings-name-show_blocks']).toBe('顯示偵錯積木');
});
