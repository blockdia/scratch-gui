// Folder membership is part of the Scratch name. Container behavior is VM project metadata.
export const SEPARATOR = '//';
export const splitName = (name, nested = true) => {
    if (!nested) {
        const index = String(name).indexOf(SEPARATOR);
        return index > 0 ? {folder: name.slice(0, index), basename: name.slice(index + SEPARATOR.length)} :
            {folder: '', basename: String(name)};
    }
    const parts = String(name).split(SEPARATOR);
    // Preserve malformed/ordinary Scratch names verbatim instead of losing text.
    if (parts.length < 2 || parts.slice(0, -1).some(part => !part || part.endsWith('/'))) {
        return {folder: '', basename: String(name)};
    }
    return {folder: parts.slice(0, -1).join(SEPARATOR), basename: parts[parts.length - 1]};
};
export const joinName = (folder, name) => (folder ? `${folder}${SEPARATOR}${name}` : name);
export const parentFolder = path => splitName(path).folder;
export const isWithin = (path, folder) => path === folder || path.startsWith(`${folder}${SEPARATOR}`);
export const validFolderName = name => Boolean(name.trim()) && !name.includes(SEPARATOR) &&
    !name.startsWith('/') && !name.endsWith('/');

export const buildFolderTree = (items, nested = true) => {
    const roots = [];
    const folders = new Map();
    items.forEach((item, index) => {
        const {folder, basename} = splitName(item.name, nested);
        let children = roots;
        let path = '';
        if (folder) {
            folder.split(SEPARATOR).forEach(name => {
                path = joinName(path, name);
                if (!folders.has(path)) {
                    const node = {type: 'folder', id: path, name, open: false, children: []};
                    folders.set(path, node);
                    children.push(node);
                }
                children = folders.get(path).children;
            });
        }
        children.push({type: 'sprite',
            sprite: {...item,
                id: typeof item.id === 'undefined' ? index : item.id,
                name: basename,
                fullName: item.name,
                index}});
    });
    return roots;
};

export const folderPaths = (items, nested = true) => {
    const result = [];
    const visit = nodes => nodes.forEach(node => {
        if (node.type === 'folder') {
            result.push(node.id);
            visit(node.children);
        }
    });
    visit(buildFolderTree(items, nested));
    return result;
};

export const getEntries = (vm, kind, targetId = vm.editingTarget && vm.editingTarget.id) => {
    if (kind === 'SPRITE') {
        return vm.runtime.targets.filter(target => target.isOriginal && !target.isStage)
            .map(target => ({id: target.id, name: target.getName(), value: target}));
    }
    const target = vm.runtime.getTargetById(targetId);
    if (!target) return [];
    return (kind === 'COSTUME' ? target.sprite.costumes : target.sprite.sounds)
        .map((value, id) => ({id, name: value.name, value}));
};

const reservedNames = ['_mouse_', '_stage_', '_edge_', '_myself_', '_random_'];
const unusedName = (name, used, sprite = true) => {
    let candidate = name;
    let suffix = 2;
    const base = candidate.replace(/\d+$/, '');
    const unavailable = value => used.has(value) || (sprite && (!value || reservedNames.includes(value)));
    while (unavailable(candidate)) {
        candidate = `${base}${suffix++}`;
    }
    used.add(candidate);
    return candidate;
};

// Allocate all final names before calling VM APIs, then use temporary names to
// avoid reference cascades when an old name equals another member's new name.
export const renameEntries = (vm, kind, changes, targetId = vm.editingTarget && vm.editingTarget.id,
    folderMove = null) => {
    const entries = getEntries(vm, kind, targetId);
    const changed = entries.filter(entry => changes.has(entry.id) && changes.get(entry.id) !== entry.name);
    if (!changed.length) return;
    const used = new Set(entries.filter(entry => !changed.includes(entry)).map(entry => entry.name));
    const names = changed.map(entry => unusedName(changes.get(entry.id), used, kind === 'SPRITE'));
    entries.forEach(entry => used.add(entry.name));
    const target = vm.runtime.getTargetById(targetId);
    const rename = (entry, name) => {
        if (kind === 'SPRITE') vm.renameSprite(entry.id, name);
        else if (kind === 'COSTUME') target.renameCostume(entry.id, name);
        else target.renameSound(entry.id, name);
    };
    const isSprite = kind === 'SPRITE';
    const containers = vm.runtime.spriteContainers;
    if (isSprite) containers.beginUpdate();
    try {
        if (isSprite && folderMove) {
            containers.move(folderMove.source, folderMove.destination, folderMove.dissolve);
        }
        changed.forEach(entry => rename(entry, unusedName('__blockdia_folder_move__', used)));
        changed.forEach((entry, index) => rename(entry, names[index]));
    } finally {
        if (isSprite) containers.endUpdate();
    }
    vm.emitTargetsUpdate();
    vm.emitWorkspaceUpdate();
    vm.runtime.emitProjectChanged();
};

export const splitItemName = (name, kind) => splitName(name, kind === 'SPRITE');

export const moveFolder = (vm, kind, source, destination, targetId) => {
    if (kind !== 'SPRITE' && destination && !validFolderName(destination)) return false;
    if (source === destination || (destination && isWithin(destination, source))) return false;
    const changes = new Map();
    getEntries(vm, kind, targetId).forEach(entry => {
        if (isWithin(splitItemName(entry.name, kind).folder, source)) {
            changes.set(entry.id, joinName(destination, entry.name.slice(source.length + SEPARATOR.length)));
        }
    });
    renameEntries(vm, kind, changes, targetId,
        {source, destination, dissolve: destination === parentFolder(source)});
    return true;
};

export const reorderFolderItems = (vm, kind, order, targetId = vm.editingTarget && vm.editingTarget.id) => {
    const original = getEntries(vm, kind, targetId);
    if (order.length !== original.length || new Set(order).size !== original.length ||
        order.some(index => !original[index])) return;
    order.forEach((oldIndex, newIndex) => {
        const value = original[oldIndex].value;
        if (kind === 'SPRITE') {
            const current = vm.runtime.targets.indexOf(value);
            const anchor = getEntries(vm, kind)[newIndex].value;
            vm.reorderTarget(current, vm.runtime.targets.indexOf(anchor));
        } else {
            const current = getEntries(vm, kind, targetId).findIndex(entry => entry.value === value);
            if (kind === 'COSTUME') vm.reorderCostume(targetId, current, newIndex);
            else vm.reorderSound(targetId, current, newIndex);
        }
    });
    vm.emitTargetsUpdate();
    vm.runtime.emitProjectChanged();
};

export const dropOrder = (length, moving, anchor, after = false) => {
    const order = Array.from({length}, (_, i) => i).filter(i => !moving.includes(i));
    if (moving.includes(anchor)) return null;
    const position = anchor === null ? order.length : order.indexOf(anchor) + (after ? 1 : 0);
    order.splice(position, 0, ...moving);
    return order;
};

// UI-only insertion preference, scoped to the VM and the actual target object.
const activeFolders = new WeakMap();
const scopeFor = (vm, kind, targetId) => (kind === 'SPRITE' ? vm.runtime.getTargetForStage() :
    vm.runtime.getTargetById(targetId || (vm.editingTarget && vm.editingTarget.id)));
export const setActiveFolder = (vm, kind, path, targetId) => {
    const scope = scopeFor(vm, kind, targetId);
    if (!scope) return;
    if (!activeFolders.has(scope)) activeFolders.set(scope, {});
    activeFolders.get(scope)[kind] = path;
};
export const getActiveFolder = (vm, kind, targetId) => {
    const state = activeFolders.get(scopeFor(vm, kind, targetId));
    const path = state && state[kind];
    return path && folderPaths(getEntries(vm, kind, targetId), kind === 'SPRITE').includes(path) ? path : '';
};
export const prepareAsset = (vm, kind, asset, targetId, folder = getActiveFolder(vm, kind, targetId)) =>
    ({...asset, name: splitItemName(asset.name, kind).folder ? asset.name : joinName(folder, asset.name)});

// Serialize GUI imports so each completion can identify its installed targets.
const spriteImports = new WeakMap();
export const addSpriteInFolder = (vm, data, folder = getActiveFolder(vm, 'SPRITE'), replaceFolder = false) => {
    const stage = vm.runtime.getTargetForStage();
    const pending = spriteImports.get(vm) || Promise.resolve();
    const operation = pending.catch(() => {}).then(() => {
        const before = new Set(getEntries(vm, 'SPRITE').map(entry => entry.value));
        return vm.addSprite(data).then(result => {
            if ((folder || replaceFolder) && vm.runtime.getTargetForStage() === stage) {
                const added = getEntries(vm, 'SPRITE').filter(entry => !before.has(entry.value));
                renameEntries(vm, 'SPRITE', new Map(added.map(entry =>
                    [entry.id, joinName(folder, splitName(entry.name).basename)])));
            }
            return result;
        });
    });
    spriteImports.set(vm, operation);
    return operation;
};

// Match the original addon's stable folder colors, using the full nested path.
export const folderColor = path => {
    if (!path) return null;
    let seed = 0;
    for (let i = 0; i < path.length; i++) seed = ((31 * seed) + path.charCodeAt(i)) | 0;
    let random;
    for (let i = 0; i < 5; i++) {
        seed += 0x6D2B79F5;
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        random = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
    return `hsla(${random * 360}, 100%, 85%, 0.5)`;
};
