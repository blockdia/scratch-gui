import {dropOrder, folderPaths, isWithin, joinName, splitItemName, splitName} from './index';

export const dragSourceKey = (entries, kind, drag) => {
    if (drag.dragType === 'FOLDER') return drag.payload.path;
    const index = kind === 'SPRITE' ? entries.findIndex(entry => entry.id === drag.payload) : drag.index;
    return `item:${index}`;
};

// One plan drives both the insertion shadow and the eventual VM operation.
// The entries and hit geometry are snapshots; previewing never changes the VM.
export const planFolderDrop = (entries, kind, scope, drag, hit) => {
    if (!hit || (drag.dragType !== kind && drag.dragType !== 'FOLDER')) return null;
    const sourceKey = dragSourceKey(entries, kind, drag);
    if (sourceKey === hit.key) return null;
    const changes = new Map();
    let moving;
    let folder = hit.folder;
    let anchor = hit.index;
    let after = hit.after;
    let placement = {key: hit.key, position: after ? 'after' : 'before'};
    const members = path => entries.map((entry, index) =>
        (isWithin(splitItemName(entry.name, kind).folder, path) ? index : -1)).filter(index => index !== -1);

    if (drag.dragType === 'FOLDER') {
        if (drag.payload.kind !== kind || drag.payload.scope !== scope) return null;
        const source = drag.payload.path;
        if (isWithin(folder, source)) return null;
        moving = members(source);
        if (kind === 'SPRITE') {
            const destination = joinName(folder, splitName(source).basename);
            if (destination !== source && folderPaths(entries).includes(destination)) return null;
            moving.forEach(index => changes.set(entries[index].id,
                joinName(destination, entries[index].name.slice(source.length + 2))));
        } else if (anchor !== null && folder) {
            // Original asset folders cannot be inserted among another folder's members.
            return null;
        }
    } else {
        const index = kind === 'SPRITE' ? entries.findIndex(entry => entry.id === drag.payload) : drag.index;
        if (!entries[index]) return null;
        moving = [index];
    }

    if (anchor === null && folder) {
        const indices = members(folder).filter(index => !moving.includes(index));
        if (kind === 'SPRITE') {
            placement.position = 'inside-end';
            anchor = indices.length ? indices[indices.length - 1] : null;
            after = true;
        } else {
            // Match the addon: upward drops go before a folder. Downward drops
            // enter an open folder, or pass a closed folder as one unit.
            const enter = drag.dragType !== 'FOLDER' && after && hit.open;
            placement.position = enter ? 'inside-start' : (after ? 'after' : 'before');
            anchor = indices.length ? indices[enter || !after ? 0 : indices.length - 1] : null;
            after = enter ? false : after;
            if (!enter) folder = '';
            if (!indices.length) {
                // Moving the only member above its own header dissolves that
                // folder in place rather than sending the resource to the end.
                const next = entries.findIndex((entry, index) => index > moving[0] && !moving.includes(index));
                anchor = next === -1 ? null : next;
                after = false;
            }
        }
    } else if (hit.key === 'root') {
        placement = {key: 'root', position: 'inside-end'};
    }
    if (drag.dragType !== 'FOLDER') {
        const entry = entries[moving[0]];
        changes.set(entry.id, joinName(folder, splitItemName(entry.name, kind).basename));
    }
    if (!moving.length) return null;
    const order = dropOrder(entries.length, moving, anchor, after);
    return order ? {changes, order, sourceKey, placement} : null;
};
