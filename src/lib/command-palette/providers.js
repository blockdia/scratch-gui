const thumbnailCache = new WeakMap();
const originals = vm => vm.runtime.targets.filter(target => target.isOriginal || target.isStage);
const blocksOf = target => {
    const blocks = target && target.blocks;
    if (!blocks) return [];
    const map = blocks._blocks || {};
    // Match the workspace tree: orphaned VM records and obscured shadows are
    // not navigable references. Start where the VM's workspace XML starts.
    if (!blocks.getScripts) return Object.values(map);
    const visible = new Set();
    const pending = [...blocks.getScripts()];
    while (pending.length) {
        const id = pending.pop();
        const block = map[id];
        if (!block || visible.has(id)) continue;
        visible.add(id);
        if (block.next) pending.push(block.next);
        for (const input of Object.values(block.inputs || {})) {
            if (input.block) pending.push(input.block);
        }
    }
    return Object.values(map).filter(block => visible.has(block.id));
};
const blockMap = target => (target && target.blocks && target.blocks._blocks) || {};
const field = (block, name) => block.fields && block.fields[name];
const procedureCode = (block, map) => {
    const input = block.inputs && block.inputs.custom_block;
    const prototype = input && map[input.block];
    return (prototype && prototype.mutation && prototype.mutation.proccode) ||
        (block.mutation && block.mutation.proccode);
};
const broadcastName = (block, map) => {
    if (block.opcode === 'event_whenbroadcastreceived') return (field(block, 'BROADCAST_OPTION') || {}).value;
    if (block.opcode !== 'event_broadcast' && block.opcode !== 'event_broadcastandwait') return;
    const input = block.inputs && block.inputs.BROADCAST_INPUT;
    const menu = input && map[input.block];
    return menu && menu.opcode === 'event_broadcast_menu' ? (field(menu, 'BROADCAST_OPTION') || {}).value : null;
};
const location = (target, block) => ({targetId: target.id, blockId: block.id});
const visibleFieldText = (item, t) => {
    // FieldImage.getText() is its English alt text, even in a localized workspace.
    const value = item.getValue && item.getValue();
    if (typeof value === 'string' && value.endsWith('/green-flag.svg')) return t('greenFlag');
    return item.getText && item.getText();
};
const eventLabel = (visual, t) => visual.inputList.map(input => input.fieldRow.map(item =>
    visibleFieldText(item, t)).filter(Boolean)
    .join(' ')).filter(Boolean)
    .join(' ');

export const refreshEventLabels = (items, workspace, t) => {
    if (!workspace) return;
    for (const item of items) {
        if (item.kind !== 'event') continue;
        const visual = workspace.getBlockById(item.blockIds[0]);
        if (visual) item.label = eventLabel(visual, t);
    }
};

export const targetResults = (vm, t) => originals(vm).map(target => {
    const kind = target.isStage ? 'stage' : target.component ? 'component' : 'sprite';
    const costume = target.getCostumes && target.getCostumes()[target.currentCostume];
    let image;
    if (costume && costume.asset) {
        if (!thumbnailCache.has(costume.asset)) thumbnailCache.set(costume.asset, costume.asset.encodeDataURI());
        image = thumbnailCache.get(costume.asset);
    }
    return {id: target.id,
        label: target.isStage ? t('stage') : target.getName(),
        kind,
        targetId: target.id,
        detail: t(kind),
        image};
});

export const commandResults = (registry, context, intl, sourceName) => {
    const label = value => (typeof value === 'string' ? value : intl.formatMessage(value));
    return registry.listActions(context).map(action => ({
        id: action.id,
        kind: 'command',
        available: action.available,
        label: action.titleValues ? intl.formatMessage(action.title,
            Object.keys(action.titleValues).reduce((values, key) => ({...values,
                [key]: label(action.titleValues[key])}), {})) : label(action.title),
        detail: sourceName(action.source),
        bindings: action.bindings
    }));
};

export const symbolResults = (vm, targetId, tab, workspace, t) => {
    const target = originals(vm).find(item => item.id === targetId);
    if (!target) return [];
    if (tab === 1 || tab === 2) {
        const kind = tab === 1 ? 'costume' : 'sound';
        return (target.sprite[tab === 1 ? 'costumes' : 'sounds'] || []).map((asset, index) => ({
            id: `${kind}:${asset.assetId}:${index}`,
            label: asset.name,
            detail: t(kind),
            kind,
            targetId,
            name: asset.name,
            assetId: asset.assetId
        }));
    }
    const rows = [];
    const map = blockMap(target);
    const grouped = new Map();
    for (const block of blocksOf(target)) {
        const eventName = broadcastName(block, map);
        if (typeof eventName !== 'undefined') {
            const id = `broadcast:${JSON.stringify(eventName)}`;
            if (!grouped.has(id)) {
                const row = {id,
                    kind: 'broadcast',
                    targetId,
                    eventName,
                    label: eventName === null ? t('expression') : eventName,
                    detail: t('broadcast')};
                grouped.set(id, row);
                rows.push(row);
            }
        } else if (block.opcode === 'procedures_definition') {
            const code = procedureCode(block, map);
            if (code) {
                rows.push({id: block.id,
                    kind: 'procedure',
                    targetId,
                    code,
                    label: code,
                    detail: t('procedure')});
            }
        } else if (block.topLevel && (block.opcode.startsWith('event_when') ||
            block.opcode === 'control_start_as_clone')) {
            const visual = workspace && vm.editingTarget === target && workspace.getBlockById(block.id);
            // A header's own fields omit the connected script body.
            const label = visual ? eventLabel(visual, t) :
                [block.opcode, ...Object.values(block.fields || {}).map(item => item.value)].join(' ');
            // Labels depend on the active Blockly workspace and locale. Keep
            // group identity in VM data so cached labels survive target switches.
            const id = `event:${JSON.stringify([block.opcode, Object.keys(block.fields || {}).sort()
                .map(name => [name, block.fields[name].value])])}`;
            const existing = grouped.get(id);
            if (existing) existing.blockIds.push(block.id);
            else {
                const row = {id, kind: 'event', targetId, label, detail: t('event'), blockIds: [block.id]};
                grouped.set(id, row);
                rows.push(row);
            }
        }
    }
    const stage = originals(vm).find(item => item.isStage);
    for (const owner of target === stage ? [target] : [target, stage].filter(Boolean)) {
        for (const variable of Object.values(owner.variables || {})) {
            if (variable.type !== '' && variable.type !== 'list') continue;
            const kind = variable.type === 'list' ? 'list' : 'variable';
            rows.push({id: `${kind}:${variable.id}`,
                kind,
                variableId: variable.id,
                targetId,
                label: variable.name,
                detail: `${t(kind)} · ${t(owner.isStage ? 'global' : 'local')}`});
        }
    }
    return rows;
};

// One snapshot per palette session/project edit. Each target is scanned at most
// once, even when ranking hundreds of symbols or cycling through references.
// Other targets are indexed lazily, only for a selected broadcast.
export const createReferenceIndex = vm => {
    const targets = originals(vm);
    const indexes = new Map();
    const cached = new WeakMap();
    const add = (map, key, ref) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(ref);
    };
    const indexTarget = target => {
        if (indexes.has(target.id)) return indexes.get(target.id);
        const index = {broadcast: new Map(), procedure: new Map(), variable: new Map(), blocks: new Map()};
        const map = blockMap(target);
        for (const block of blocksOf(target)) {
            const ref = {...location(target, block), definition: block.opcode === 'procedures_definition'};
            index.blocks.set(block.id, ref);
            const eventName = broadcastName(block, map);
            if (typeof eventName !== 'undefined') add(index.broadcast, eventName, ref);
            if (['procedures_definition', 'procedures_call', 'procedures_call_return'].includes(block.opcode)) {
                add(index.procedure, procedureCode(block, map), ref);
            }
            // A block mentioning the same variable twice is still one reference.
            const ids = new Set(Object.values(block.fields || {}).map(value => value.id));
            for (const id of ids) {
                if (typeof id !== 'undefined') add(index.variable, id, ref);
            }
        }
        indexes.set(target.id, index);
        return index;
    };
    return symbol => {
        if (cached.has(symbol)) return cached.get(symbol);
        const results = [];
        for (const target of targets) {
            if (symbol.kind !== 'broadcast' && target.id !== symbol.targetId) continue;
            const index = indexTarget(target);
            let refs;
            if (symbol.kind === 'broadcast') refs = index.broadcast.get(symbol.eventName);
            else if (symbol.kind === 'procedure') refs = index.procedure.get(symbol.code);
            else if (symbol.kind === 'variable' || symbol.kind === 'list') {
                refs = index.variable.get(symbol.variableId);
            } else if (symbol.kind === 'event') refs = symbol.blockIds.map(id => index.blocks.get(id)).filter(Boolean);
            if (refs) results.push(...refs);
        }
        results.sort((a, b) => Number(b.definition) - Number(a.definition) ||
            Number(b.targetId === symbol.targetId) - Number(a.targetId === symbol.targetId));
        cached.set(symbol, results);
        return results;
    };
};

export const referencesFor = (vm, symbol) => createReferenceIndex(vm)(symbol);
