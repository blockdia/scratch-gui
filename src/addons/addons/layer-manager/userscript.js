import createLayerWindow from './window.jsx';
import {createLayerModel} from './model';

/** Register a React tool using the host window lifecycle. */
export default function ({addon}) {
    const vm = addon.tab.traps.vm;
    const model = createLayerModel(vm);
    addon.tab.createWindow({
        id: 'layers',
        title: {id: 'addons.layer-manager.title'},
        icon: addon.self.getResource('/layers.svg'),
        size: {width: 360, height: 440},
        minimum: {width: 280, height: 240},
        component: createLayerWindow(vm, model)
    });
}
