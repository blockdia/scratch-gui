import createWindow from './window.jsx';
import {createLinterModel} from './model';
import {createNavigator} from './navigation';
import {RULES} from './analyzer';
import settingsStore from '../../settings-store-singleton';
import channels from '../../channels';
import upstreamMeta from '../../generated/upstream-meta.json';

/** Register the code-check window using the host lifecycle. */
export default function ({addon}) {
    const getRules = () => RULES.filter(rule => addon.settings.get(rule));
    const model = createLinterModel(addon.tab.traps.vm, getRules);
    const navigator = createNavigator(addon);
    addon.tab.createWindow({
        id: 'checks',
        title: {id: 'addons.linter.title'},
        icon: addon.self.getResource('/icons/warning.svg'),
        size: {width: 620, height: 400},
        minimum: {width: 300, height: 280},
        component: createWindow({addon,
            model,
            navigator,
            getRules,
            setRule: (rule, value) => {
                settingsStore.setAddonSetting('linter', rule, value);
                if (!settingsStore.remote && channels.changeChannel) {
                    channels.changeChannel.postMessage({version: upstreamMeta.commit, store: settingsStore.store});
                }
            }})
    });
}
