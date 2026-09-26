import {resources} from './semantics';
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
    // Timer exceptions do not reject the surrounding Promise automatically.
    const schedule = (callback, delay, finish) => {
        timer = setTimeout(() => {
            try {
                callback();
            } catch (error) {
                finish(false);
            }
        }, delay);
    };
    const navigate = async location => {
        cancel();
        const current = generation;
        const target = vm.runtime.targets.find(item => item.id === location.targetId &&
            (item.isStage || item.isOriginal));
        const valid = () => vm.runtime.targets.includes(target) && target &&
            (location.kind === 'block' ? target.blocks.getBlock(location.blockId) :
                location.kind === 'resource' ? resources(target, location.resourceKind).some(item =>
                    item.name === location.name &&
                        item.assetId === location.assetId) : target.variables[location.variableId]);
        if (!valid()) return false;
        if (location.kind === 'resource') {
            vm.setEditingTarget(target.id);
            addon.tab.redux.dispatch({type: 'scratch-gui/navigation/ACTIVATE_TAB',
                activeTabIndex: location.resourceKind === 'sound' ? 2 : 1});
            return new Promise(resolve => {
                finishPending = resolve;
                let attempts = 0;
                const finish = result => {
                    finishPending = null;
                    resolve(result);
                };
                const locate = () => {
                    if (current !== generation || !valid() || vm.editingTarget !== target) {
                        finishPending = null;
                        resolve(false);
                        return;
                    }
                    const request = {...location, selected: false};
                    vm.emit('EDITOR_SELECT_RESOURCE', request);
                    if (request.selected || ++attempts >= 50) {
                        finishPending = null;
                        resolve(request.selected);
                    } else schedule(locate, 40, finish);
                };
                schedule(locate, 0, finish);
            });
        }
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
                // getMainWorkspace follows focus, including the custom-block preview.
                // Always resolve the editor workspace again after tab/target changes.
                const workspace = addon.tab.traps.getWorkspace();
                const toolbox = workspace && workspace.getToolbox();
                if (toolbox) {
                    if (location.kind === 'block') {
                        const block = workspace.getBlockById(location.blockId);
                        if (block && !block.workspace.isFlyout) {
                            workspace.centerOnBlock(location.blockId);
                            blockly.hideChaff();
                            BlockFlasher.flash(block);
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
                schedule(locate, 40, finish);
            };
            schedule(locate, 0, finish);
        });
    };
    return {navigate, cancel};
};
