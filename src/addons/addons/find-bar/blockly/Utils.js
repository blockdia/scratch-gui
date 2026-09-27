// Compatibility adapter: navigation now belongs to the editor, not an enabled addon.
import {navigationFor} from '../../../../lib/block-navigation';
export default class Utils {
    constructor (addon) {
        this.addon = addon;
        this.vm = addon.tab.traps.vm;
        this.navigation = navigationFor(this.vm);
        const activate = () => addon.tab.redux.dispatch({type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 0});
        this.activate = activate;
        this.navigationHistory = {
            goBack: () => this.navigation.travel('back', activate),
            goForward: () => this.navigation.travel('forward', activate)
        };
    }
    getEditingTarget () {
        return this.vm.editingTarget;
    }
    setEditingTarget (id) {
        this.vm.setEditingTarget(id);
    }
    getWorkspace () {
        return this.addon.tab.traps.getWorkspace();
    }
    scrollBlockIntoView (block) {
        if (!block || !this.vm.editingTarget) return Promise.resolve(false);
        return this.navigation.locate({targetId: block.targetId || this.vm.editingTarget.id,
            blockId: typeof block === 'string' ? block : block.id}, {activate: this.activate});
    }
    getTopOfStackFor (block) {
        while (block.getOutputShape() && block.getSurroundParent()) block = block.getSurroundParent();
        return block;
    }
}
