import getCostumeUrl from '../../../lib/get-costume-url';

export const containerLayerId = path => `container:${path}`;

// Only containers affect render order. Ordinary folders stay in the displayed name.
const readLayerRows = vm => {
    const manager = vm.runtime.spriteContainers;
    const containers = new Map();
    const roots = [];
    const targets = vm.runtime.targets.filter(target => target.isStage ||
        (target.getLayerOrder() !== null && target.getLayerOrder() >= 0))
        .sort((a, b) => Number(a.isStage) - Number(b.isStage) || b.getLayerOrder() - a.getLayerOrder());
    for (const target of targets) {
        let parent = null;
        const fullName = target.getName();
        const membership = manager.getTargetContainers(target);
        for (const entry of membership) {
            const {id, path} = entry;
            if (!containers.has(id)) {
                const ownVisible = entry.visible;
                const node = {id: containerLayerId(id),
                    container: id,
                    fullName: path,
                    name: parent && path.startsWith(`${parent.fullName}//`) ?
                        path.slice(parent.fullName.length + 2) : path,
                    isContainerClone: Boolean(entry.isClone),
                    parent: parent ? parent.id : null,
                    stage: false,
                    visible: ownVisible && (!parent || parent.visible),
                    hiddenByContainer: ownVisible && Boolean(parent && !parent.visible),
                    children: [],
                    count: 0,
                    order: target.getLayerOrder(),
                    backId: target.id};
                containers.set(id, node);
                (parent ? parent.children : roots).push(node);
            }
            parent = containers.get(id);
            parent.count++;
            parent.backId = target.id;
        }
        const visible = target.isEffectivelyVisible();
        (parent ? parent.children : roots).push({id: target.id,
            container: null,
            name: parent && fullName.startsWith(`${parent.fullName}//`) ?
                fullName.slice(parent.fullName.length + 2) : fullName,
            fullName,
            parent: parent ? parent.id : null,
            stage: target.isStage,
            visible,
            hiddenByContainer: target.visible && !visible,
            count: 0,
            order: target.getLayerOrder(),
            backId: target.id});
    }
    const rows = [];
    const visit = (nodes, depth) => nodes.forEach((node, index) => {
        const {children, ...row} = node;
        rows.push({...row, depth, position: index + 1, siblings: nodes.length});
        if (children) visit(children, depth + 1);
    });
    visit(roots, 0);
    return rows;
};

export const visibleLayerRows = (rows, collapsed) => {
    const hidden = new Set();
    return rows.filter(row => {
        if (hidden.has(row.parent)) {
            hidden.add(row.id);
            return false;
        }
        if (collapsed.has(row.id)) hidden.add(row.id);
        return true;
    });
};

// Keep clone identities and thumbnail caching outside the window's mount lifetime.
export const createLayerModel = vm => {
    let stage;
    let previous;
    let generation = 0;
    let nextClone = 1;
    let clones = new WeakMap();
    let containerClones = new Map();
    const thumbnails = new WeakMap();
    const snapshot = () => {
        const currentStage = vm.runtime.targets.find(target => target.isStage);
        if (stage !== currentStage) {
            stage = currentStage;
            generation++;
            nextClone = 1;
            clones = new WeakMap();
            containerClones = new Map();
        }
        const targets = new Map(vm.runtime.targets.map(target => [target.id, target]));
        // Allocate labels in creation order, independently of tree/render ordering.
        for (const target of targets.values()) {
            if (!target.isOriginal && !clones.has(target) && target.getLayerOrder() !== null &&
                target.getLayerOrder() >= 0) clones.set(target, nextClone++);
        }
        const rows = readLayerRows(vm).map(row => {
            if (row.container) {
                if (row.isContainerClone && !containerClones.has(row.id)) containerClones.set(row.id, nextClone++);
                return {...row, clone: containerClones.get(row.id) || null, thumbnail: null};
            }
            const target = targets.get(row.id);
            const costume = target.getCostumes()[target.currentCostume];
            const asset = costume && costume.asset;
            if (asset && !thumbnails.has(asset)) thumbnails.set(asset, getCostumeUrl(asset));
            return {...row,
                clone: target.isOriginal ? null : clones.get(target),
                thumbnail: asset ? thumbnails.get(asset) : null};
        });
        const liveContainers = new Set(rows.filter(row => row.isContainerClone).map(row => row.id));
        for (const id of containerClones.keys()) {
            if (!liveContainers.has(id)) containerClones.delete(id);
        }
        const editing = vm.editingTarget && vm.editingTarget.id;
        if (previous && previous.generation === generation && previous.editing === editing &&
            previous.rows.length === rows.length && rows.every((row, index) =>
            Object.keys(row).every(key => row[key] === previous.rows[index][key]))) return previous;
        previous = {generation, editing, rows};
        return previous;
    };
    return {snapshot};
};

// afterId is the sibling immediately in front of the slot; null means first in this parent.
// expectedParent lets a pending drag reject membership changes made by the editor.
export const moveLayer = (vm, id, afterId, expectedParent) => {
    const targets = vm.runtime.targets;
    const rows = readLayerRows(vm);
    const row = rows.find(item => item.id === id && !item.stage);
    const anchor = afterId === null ? null : rows.find(item => item.id === afterId && !item.stage);
    if (!row || (typeof expectedParent !== 'undefined' && row.parent !== expectedParent) ||
        (afterId !== null && (!anchor || anchor.parent !== row.parent)) || row === anchor) return false;
    const ordered = rows.filter(item => !item.stage && item.parent === row.parent);
    const index = ordered.indexOf(row);
    if ((index === 0 && anchor === null) || ordered[index - 1] === anchor) return false;
    const backTarget = anchor && targets.find(item => item.id === anchor.backId);
    if (row.container) {
        vm.setSpriteContainerOrder(row.container, Infinity);
        if (backTarget) vm.setSpriteContainerOrder(row.container, backTarget.getLayerOrder());
        return true;
    }
    const target = targets.find(item => item.id === id);
    target.goToFront();
    if (backTarget) target.goBehindOther(backTarget);
    vm.runtime.requestRedraw();
    if (target.isOriginal) vm.runtime.emitProjectChanged();
    return true;
};
