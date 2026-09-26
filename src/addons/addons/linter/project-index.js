import {createEvaluator, fieldValue, UNKNOWN} from './constants';
import {arrayMutation, edges, mayWait, stops} from './semantics';

// All walks are iterative and yield per edge/block, including malformed cycles.
export const walk = function* (blocks, start, liveOnly = false) {
    const pending = [start];
    const seen = new Set();
    while (pending.length) {
        const id = pending.pop();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const block = blocks[id];
        if (!block || block.opcode === 'procedures_definition') continue;
        yield block;
        for (const input of Object.values(block.inputs || {})) if (input) pending.push(input.block);
        if (!liveOnly || !stops(block)) pending.push(block.next);
    }
};
export const indexTarget = function* (target, context, limit) {
    const blocks = (target.blocks && target.blocks._blocks) || {};
    const list = [];
    const inactive = new Set();
    const procedures = new Map();
    const definitions = [];
    const owners = new Map();
    const malformed = new Map();
    const evaluator = createEvaluator(blocks, limit);
    for (const block of Object.values(blocks)) {
        yield;
        if (!block) continue;
        for (const input of Object.values(block.inputs || {})) {
            if (input && input.shadow && input.block !== input.shadow) inactive.add(input.shadow);
        }
    }
    const hidden = [...inactive];
    while (hidden.length) {
        const block = blocks[hidden.pop()];
        if (!block) continue;
        for (const id of edges(block)) {
            if (!inactive.has(id)) {
                inactive.add(id); hidden.push(id);
            }
            yield;
        }
    }
    for (const block of Object.values(blocks)) {
        yield;
        if (!block || inactive.has(block.id)) continue;
        list.push(block);
        if (block.opcode !== 'procedures_definition') continue;
        const input = block.inputs && block.inputs.custom_block;
        const proto = input && blocks[input.block];
        const mutation = proto && proto.mutation;
        if (!proto || proto.opcode !== 'procedures_prototype' || !mutation || typeof mutation.proccode !== 'string') {
            malformed.set(block.id, 'definition');
            continue;
        }
        const ids = arrayMutation(mutation, 'argumentids');
        const names = arrayMutation(mutation, 'argumentnames');
        const defaults = arrayMutation(mutation, 'argumentdefaults');
        const procedure = {block,
            proto,
            code: mutation.proccode,
            ids,
            names,
            defaults,
            returns: Boolean(mutation.return),
            warp: mutation.warp === true || mutation.warp === 'true',
            calls: [],
            waits: [],
            body: []};
        definitions.push(procedure);
        const same = procedures.get(procedure.code) || [];
        same.push(procedure);
        procedures.set(procedure.code, same);
        if (['argumentids', 'argumentnames', 'argumentdefaults'].some(name =>
            typeof mutation[name] !== 'string') || !ids || !names || !defaults ||
                ids.length !== names.length || ids.length !== defaults.length ||
            new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string') ||
            names.some(name => typeof name !== 'string')) malformed.set(block.id, 'signature');
    }
    for (const procedure of definitions) {
        for (const block of walk(blocks, procedure.block.next)) {
            yield;
            const set = owners.get(block.id) || new Set();
            set.add(procedure);
            owners.set(block.id, set);
            procedure.body.push(block);
        }
        for (const block of walk(blocks, procedure.block.next, true)) {
            yield;
            if (mayWait(block, context)) procedure.waits.push(block);
            if (block.opcode === 'procedures_call') procedure.calls.push(block);
        }
    }
    // A tri-colour traversal finds actual connection cycles; procedure recursion is not a graph cycle.
    const colors = new Map();
    const broken = new Map();
    for (const root of list) {
        if (root.parent && (!blocks[root.parent] || !edges(blocks[root.parent]).includes(root.id))) {
            broken.set(root.id, 'connection');
        }
        if (colors.has(root.id)) continue;
        const pending = [{block: root, links: null, index: 0}];
        while (pending.length) {
            yield;
            const frame = pending[pending.length - 1];
            if (!frame.links) {
                colors.set(frame.block.id, 1);
                frame.links = edges(frame.block);
            }
            if (frame.index >= frame.links.length) {
                colors.set(frame.block.id, 2);
                pending.pop();
                continue;
            }
            const child = frame.links[frame.index++];
            if (!blocks[child]) broken.set(frame.block.id, 'connection');
            else if (colors.get(child) === 1) broken.set(frame.block.id, 'cycle');
            else if (!colors.has(child)) pending.push({block: blocks[child], links: null, index: 0});
        }
    }
    return {target, blocks, list, procedures, definitions, owners, malformed, broken, ...evaluator};
};
export const procedureCode = block => block.mutation && block.mutation.proccode;
export const broadcastName = (index, block) => {
    if (block.opcode === 'event_whenbroadcastreceived') return fieldValue(block, 'BROADCAST_OPTION');
    return index.input(block, 'BROADCAST_INPUT');
};
export const normalizedBroadcast = value => (value === UNKNOWN || typeof value === 'undefined' ? UNKNOWN :
    String(value).toLowerCase());
