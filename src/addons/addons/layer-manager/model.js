import getCostumeUrl from '../../../lib/get-costume-url';

// Keep clone identities and thumbnail caching outside the window's mount lifetime.
export const createLayerModel = vm => {
    let stage;
    let previous;
    let generation = 0;
    let nextClone = 1;
    let clones = new WeakMap();
    const thumbnails = new WeakMap();
    const snapshot = () => {
        const currentStage = vm.runtime.targets.find(target => target.isStage);
        if (stage !== currentStage) {
            stage = currentStage;
            generation++;
            nextClone = 1;
            clones = new WeakMap();
        }
        const rows = vm.runtime.targets.map(target => {
            const order = target.getLayerOrder();
            if (!target.isStage && (order === null || order < 0)) return null;
            if (!target.isOriginal && !clones.has(target)) clones.set(target, nextClone++);
            const costume = target.getCostumes()[target.currentCostume];
            const asset = costume && costume.asset;
            if (asset && !thumbnails.has(asset)) thumbnails.set(asset, getCostumeUrl(asset));
            return {id: target.id,
                name: target.getName(),
                stage: target.isStage,
                clone: target.isOriginal ? null : clones.get(target),
                visible: target.visible,
                thumbnail: asset ? thumbnails.get(asset) : null,
                order};
        }).filter(Boolean)
            .sort((a, b) => Number(a.stage) - Number(b.stage) || b.order - a.order);
        const editing = vm.editingTarget && vm.editingTarget.id;
        if (previous && previous.generation === generation && previous.editing === editing &&
            previous.rows.length === rows.length && rows.every((row, index) =>
            Object.keys(row).every(key => row[key] === previous.rows[index][key]))) return previous;
        previous = {generation, editing, rows};
        return previous;
    };
    return {snapshot};
};

// afterId is the neighbour immediately in front of the drop slot; null means frontmost.
export const moveLayer = (vm, id, afterId) => {
    const targets = vm.runtime.targets;
    const target = targets.find(item => item.id === id);
    const anchor = afterId === null ? null : targets.find(item => item.id === afterId);
    const valid = item => item && !item.isStage && item.getLayerOrder() !== null && item.getLayerOrder() >= 0;
    if (!valid(target) || (afterId !== null && !valid(anchor)) || target === anchor) return false;
    const ordered = targets.filter(valid).sort((a, b) => b.getLayerOrder() - a.getLayerOrder());
    const index = ordered.indexOf(target);
    if ((index === 0 && anchor === null) || ordered[index - 1] === anchor) return false;
    target.goToFront();
    if (anchor) target.goBehindOther(anchor);
    vm.runtime.requestRedraw();
    if (target.isOriginal) vm.runtime.emitProjectChanged();
    return true;
};
