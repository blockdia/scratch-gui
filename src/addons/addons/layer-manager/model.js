import getCostumeUrl from '../../../lib/get-costume-url';
import {splitName} from '../../../lib/folders';

export const containerLayerId = path => `container:${path}`;

// Only containers affect render order. Ordinary folders stay in the displayed name.
const readLayerRows = vm => {
    const definitions = new Map(vm.runtime.spriteContainers ?
        vm.runtime.spriteContainers.serialize().map(container => [container.path, container]) : []);
    const containers = new Map();
    const roots = [];
    const targets = vm.runtime.targets.filter(target => target.isStage ||
        (target.getLayerOrder() !== null && target.getLayerOrder() >= 0))
        .sort((a, b) => Number(a.isStage) - Number(b.isStage) || b.getLayerOrder() - a.getLayerOrder());
    for (const target of targets) {
        let parent = null;
        const fullName = target.getName();
        const folder = target.isStage ? '' : splitName(fullName).folder;
        const parts = folder ? folder.split('//') : [];
        for (let i = 0; i < parts.length; i++) {
            const path = parts.slice(0, i + 1).join('//');
            if (!definitions.has(path)) continue;
            if (!containers.has(path)) {
                const ownVisible = definitions.get(path).visible;
                const node = {id: containerLayerId(path),
                    container: path,
                    fullName: path,
                    name: parent ? path.slice(parent.container.length + 2) : path,
                    parent: parent ? parent.id : null,
                    stage: false,
                    visible: ownVisible && (!parent || parent.visible),
                    hiddenByContainer: ownVisible && Boolean(parent && !parent.visible),
                    children: [],
                    count: 0,
                    order: target.getLayerOrder(),
                    backId: target.id};
                containers.set(path, node);
                (parent ? parent.children : roots).push(node);
            }
            parent = containers.get(path);
            parent.count++;
            parent.backId = target.id;
        }
        const visible = typeof target.isEffectivelyVisible === 'function' ?
            target.isEffectivelyVisible() : target.visible;
        (parent ? parent.children : roots).push({id: target.id,
            container: null,
            name: parent ? fullName.slice(parent.container.length + 2) : fullName,
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
    const thumbnails = new WeakMap();
    const snapshot = () => {
        const currentStage = vm.runtime.targets.find(target => target.isStage);
        if (stage !== currentStage) {
            stage = currentStage;
            generation++;
            nextClone = 1;
            clones = new WeakMap();
        }
        const targets = new Map(vm.runtime.targets.map(target => [target.id, target]));
        // Allocate labels in creation order, independently of tree/render ordering.
        for (const target of targets.values()) {
            if (!target.isOriginal && !clones.has(target) && target.getLayerOrder() !== null &&
                target.getLayerOrder() >= 0) clones.set(target, nextClone++);
        }
        const rows = readLayerRows(vm).map(row => {
            if (row.container) return {...row, clone: null, thumbnail: null};
            const target = targets.get(row.id);
            const costume = target.getCostumes()[target.currentCostume];
            const asset = costume && costume.asset;
            if (asset && !thumbnails.has(asset)) thumbnails.set(asset, getCostumeUrl(asset));
            return {...row,
                clone: target.isOriginal ? null : clones.get(target),
                thumbnail: asset ? thumbnails.get(asset) : null};
        });
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
