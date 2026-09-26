import {englishAddonMessages, loadAddonMessages} from '../../../src/addons/translations';
import {loadAddonSettingsMessages} from '../../../src/addons/settings/addon-translations';
import upstreamEnglish from '../../../src/addons/addons-l10n/en.json';
import upstreamChinese from '../../../src/addons/addons-l10n/zh-cn.json';
import blockdiaEnglish from '../../../src/addons/blockdia-l10n/en.json';
import blockdiaChinese from '../../../src/addons/blockdia-l10n/zh-cn.json';
import blockdiaSettings from '../../../src/addons/blockdia-l10n-settings/zh-cn.json';

test('runtime overlays preserve upstream resources and English fallback in every locale', async () => {
    const english = await loadAddonMessages('en');
    const chinese = await loadAddonMessages('zh-CN');
    const french = await loadAddonMessages('fr-CA');
    expect(english['gamepad/config-header']).toContain('editor.blockdia.com');
    expect(upstreamEnglish['gamepad/config-header']).toContain('turbowarp.org');
    expect(chinese).toEqual({...upstreamEnglish, ...blockdiaEnglish, ...upstreamChinese, ...blockdiaChinese});
    expect(chinese['linter/title']).toBe(blockdiaChinese['linter/title']);
    expect(french['linter/title']).toBe(blockdiaEnglish['linter/title']);
    expect(englishAddonMessages['addons.linter.title']).toBe(blockdiaEnglish['linter/title']);
    expect(await loadAddonMessages('unknown')).toEqual(english);
});

test('settings overlays localize local addons and keep manifest fallback for English', () => {
    const chinese = loadAddonSettingsMessages('zh-CN');
    expect(chinese).toMatchObject(blockdiaSettings);
    expect(chinese['cat-blocks/@name']).toBe('猫积木');
    expect(loadAddonSettingsMessages('en')).toEqual({});
    expect(loadAddonSettingsMessages('unknown')).toEqual({});
});
