import Utils from '../find-bar/blockly/Utils';
import BlockFlasher from '../find-bar/blockly/BlockFlasher';

export const createNavigator = addon => {
    const vm = addon.tab.traps.vm;
    let generation = 0;
    let timer;
    let finishPending;
    const cancel = () => {
        generation++;
        clearTimeout(timer);
        if (finishPending) finishPending(false);
        finishPending = null;
    };
    const navigate = async location => {
        cancel();
        const current = generation;
        const target = vm.runtime.targets.find(item => item.id === location.targetId &&
            (item.isStage || item.isOriginal));
        const valid = () => vm.runtime.targets.includes(target) && target &&
            (location.kind === 'block' ? target.blocks.getBlock(location.blockId) :
                target.variables[location.variableId]);
        if (!valid()) return false;
        const blockly = await addon.tab.traps.getBlockly();
        if (current !== generation || !valid()) return false;
        addon.tab.redux.dispatch({type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 0});
        vm.setEditingTarget(target.id);
        // React may still be restoring the selected target's workspace/toolbox.
        return new Promise(resolve => {
            finishPending = resolve;
            let attempts = 0;
            const finish = result => {
                finishPending = null;
                resolve(result);
            };
            const locate = () => {
                if (generation !== current || !valid() || vm.editingTarget !== target) return finish(false);
                const workspace = blockly.getMainWorkspace();
                const toolbox = workspace && workspace.getToolbox();
                if (toolbox) {
                    if (location.kind === 'block') {
                        const block = workspace.getBlockById(location.blockId);
                        if (block && !block.workspace.isFlyout) {
                            const utils = new Utils(addon);
                            utils.blockly = blockly;
                            utils.scrollBlockIntoView(block);
                            return finish(true);
                        }
                    } else {
                        toolbox.setSelectedCategoryById('variables');
                        const flyout = workspace.getFlyout();
                        const block = flyout && flyout.getWorkspace().getAllBlocks(false)
                            .find(item => {
                                const field = item.getField(location.variableType === 'list' ? 'LIST' : 'VARIABLE');
                                return field && field.getValue() === location.variableId;
                            });
                        if (block) {
                            flyout.scrollTo(block.getRelativeToSurfaceXY().y);
                            BlockFlasher.flash(block);
                            return finish(true);
                        }
                    }
                }
                if (++attempts >= 50) return finish(false);
                timer = setTimeout(locate, 40);
            };
            timer = setTimeout(locate, 0);
        });
    };
    return {navigate, cancel};
};
