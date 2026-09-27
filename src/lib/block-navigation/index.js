// Navigation extracted from Scratch Addons find-bar (griffpatch, TheColaber).
// One history per VM, shared by the palette and addon compatibility adapter.
import AddonHooks from '../../addons/hooks';
import {scrollIntoVisibleArea} from './visible-area';
import BlockFlasher from './BlockFlasher';

const services = new WeakMap();
export class Navigation {
    constructor (vm, getWorkspace = () => AddonHooks.blocklyWorkspace) {
        this.vm = vm;
        this.getWorkspace = getWorkspace;
        this.back = [];
        this.forward = [];
        this.generation = 0;
    }
    cancel () {
        this.generation++;
        clearTimeout(this.timer);
        if (this.pending) this.pending(false);
        this.pending = null;
    }
    reset () {
        this.cancel();
        BlockFlasher.clear();
        this.back = [];
        this.forward = [];
    }
    snapshot () {
        const workspace = this.getWorkspace();
        const target = this.vm.editingTarget;
        if (!workspace || !target || !workspace.getMetrics()) return null;
        const {viewLeft, viewTop} = workspace.getMetrics();
        return {targetId: target.id, left: viewLeft, top: viewTop, scale: workspace.scale};
    }
    locate (location, {record = true, activate = () => {}, getOcclusion = null} = {}) {
        this.cancel();
        const generation = this.generation;
        const target = this.vm.runtime.targets.find(item => item.id === location.targetId &&
            (item.isOriginal || item.isStage));
        if (!target) return Promise.resolve(false);
        const previous = this.snapshot();
        activate();
        this.vm.setEditingTarget(target.id);
        return new Promise(resolve => {
            this.pending = resolve;
            let attempts = 0;
            const finish = result => {
                this.pending = null;
                const current = result && this.snapshot();
                if (result && record && previous && current &&
                    (previous.targetId !== current.targetId || previous.scale !== current.scale ||
                        Math.abs(previous.left - current.left) > 1 || Math.abs(previous.top - current.top) > 1)) {
                    this.back.push(previous);
                    this.forward = [];
                }
                resolve(result);
            };
            const tryLocate = () => {
                if (generation !== this.generation || !this.vm.runtime.targets.includes(target) ||
                    this.vm.editingTarget !== target) return finish(false);
                try {
                    const workspace = this.getWorkspace();
                    if (location.resourceKind) {
                        const request = {...location, selected: false};
                        this.vm.emit('EDITOR_SELECT_RESOURCE', request);
                        if (request.selected) return finish(true);
                    } else if (workspace && workspace.getToolbox() && !workspace.isDragging()) {
                        if (location.blockId) {
                            if (!target.blocks.getBlock(location.blockId)) return finish(false);
                            const block = workspace.getBlockById(location.blockId);
                            if (block && !block.workspace.isFlyout &&
                                (!getOcclusion || (block.width > 0 && block.height > 0))) {
                                scrollIntoVisibleArea(workspace, block, getOcclusion ? getOcclusion() : null);
                                BlockFlasher.flash(block);
                                return finish(true);
                            }
                        } else {
                            if (typeof location.scale === 'number') workspace.setScale(location.scale);
                            const metrics = workspace.getMetrics();
                            workspace.scrollbar.set(location.left - metrics.contentLeft,
                                location.top - metrics.contentTop);
                            return finish(true);
                        }
                    }
                    if (++attempts >= 50) return finish(false);
                    this.timer = setTimeout(tryLocate, 40);
                } catch (_) {
                    finish(false);
                }
            };
            // Target and tab updates must finish before reading Blockly or selecting assets.
            this.timer = setTimeout(tryLocate, 0);
        });
    }
    async travel (direction, activate) {
        const from = direction === 'back' ? this.back : this.forward;
        const to = direction === 'back' ? this.forward : this.back;
        const current = this.snapshot();
        let next;
        while (from.length && !next) {
            const candidate = from.pop();
            if (this.vm.runtime.targets.some(target => target.id === candidate.targetId)) next = candidate;
        }
        if (!next) return false;
        const result = await this.locate(next, {record: false, activate});
        if (result && current) to.push(current);
        return result;
    }
}
export const navigationFor = vm => {
    if (!services.has(vm)) services.set(vm, new Navigation(vm));
    return services.get(vm);
};
