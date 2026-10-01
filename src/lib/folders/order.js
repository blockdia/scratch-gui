import {buildFolderTree} from './index';

export const FOLDER_ORDER_CHANGED = 'FOLDER_ORDER_CHANGED';

// Flatten exactly the same grouping the editor displays, retaining first
// occurrence order for folders and for the members inside each folder.
export const groupedFolderOrder = (items, nested = false) => {
    const flatten = nodes => nodes.reduce((indices, node) => indices.concat(node.type === 'folder' ?
        flatten(node.children) : node.sprite.index), []);
    return flatten(buildFolderTree(items, nested));
};

export const remapAssetSelection = (before, after, index) => {
    const moved = after.indexOf(before[index]);
    return moved < 0 ? Math.max(0, Math.min(index, after.length - 1)) : moved;
};

export const normalizeFolderOrder = vm => {
    let changed = false;
    const targets = vm.runtime.targets.slice();
    targets.filter(target => target.isOriginal && target.sprite).forEach(target => {
        const beforeCostumes = target.sprite.costumes.slice();
        const beforeSounds = target.sprite.sounds.slice();
        const costumeOrder = groupedFolderOrder(beforeCostumes);
        const soundOrder = groupedFolderOrder(beforeSounds);
        const costumeChanged = costumeOrder.some((index, position) => index !== position);
        const soundChanged = soundOrder.some((index, position) => index !== position);
        if (!costumeChanged && !soundChanged) return;

        // Costumes are shared by the original and its clones, but every target
        // has its own currentCostume index. Preserve each running appearance.
        const appearances = targets.filter(item => item.sprite === target.sprite)
            .map(item => [item, beforeCostumes[item.currentCostume]]);
        costumeOrder.forEach((oldIndex, position) => {
            const index = target.sprite.costumes.indexOf(beforeCostumes[oldIndex]);
            if (index !== position) vm.reorderCostume(target.id, index, position);
        });
        soundOrder.forEach((oldIndex, position) => {
            const index = target.sprite.sounds.indexOf(beforeSounds[oldIndex]);
            if (index !== position) vm.reorderSound(target.id, index, position);
        });
        appearances.forEach(([item, costume]) => {
            if (costume) item.currentCostume = target.sprite.costumes.indexOf(costume);
        });
        vm.emit(FOLDER_ORDER_CHANGED, {targetId: target.id, beforeCostumes, beforeSounds});
        changed = true;
    });

    // Preserve the exact slots occupied by the stage and clones. Only original
    // sprites participate in the editor's nested folder order.
    const sprites = targets.filter(target => target.isOriginal && !target.isStage);
    const spriteOrder = groupedFolderOrder(sprites.map(target => ({name: target.getName()})), true);
    if (spriteOrder.some((index, position) => index !== position)) {
        let position = 0;
        const desired = targets.map(target => (target.isOriginal && !target.isStage ?
            sprites[spriteOrder[position++]] : target));
        desired.forEach((target, index) => {
            const current = vm.runtime.targets.indexOf(target);
            if (current !== index) vm.reorderTarget(current, index);
        });
        changed = true;
    }
    if (changed) vm.emitTargetsUpdate(false);
    return changed;
};

// Wait for both synchronous rename/reorder transactions and promise callbacks
// selecting newly added sounds to finish before changing any resource indices.
export const createFolderOrderScheduler = (vm, isEnabled) => {
    let timer = null;
    let normalizing = false;
    let disposed = false;
    const schedule = () => {
        if (disposed || normalizing || timer !== null || !isEnabled()) return;
        timer = setTimeout(() => {
            timer = null;
            if (disposed || !isEnabled()) return;
            normalizing = true;
            try {
                normalizeFolderOrder(vm);
            } finally {
                normalizing = false;
            }
        }, 0);
    };
    vm.on('targetsUpdate', schedule);
    vm.on('PROJECT_CHANGED', schedule);
    schedule();
    return {
        dispose: () => {
            disposed = true;
            clearTimeout(timer);
            vm.removeListener('targetsUpdate', schedule);
            vm.removeListener('PROJECT_CHANGED', schedule);
        }
    };
};
