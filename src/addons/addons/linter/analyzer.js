// Static checks only. No primitive execution, compilation or project mutation.
export const RULES = ['missing-target', 'warp-wait', 'unused-data'];
const TARGET_INPUTS = {
    motion_goto: ['TO', ['_mouse_', '_random_']],
    motion_glideto: ['TO', ['_mouse_', '_random_']],
    motion_pointtowards: ['TOWARDS', ['_mouse_']],
    sensing_touchingobject: ['TOUCHINGOBJECTMENU', ['_mouse_', '_edge_']],
    sensing_distanceto: ['DISTANCETOMENU', ['_mouse_']],
    control_create_clone_of: ['CLONE_OPTION', ['_myself_']],
    sensing_of: ['OBJECT', ['_stage_']]
};
// These operations can wait in both interpreter and compiler execution. In the
// interpreter STATUS_YIELD can spin until the warp timer expires; promises and
// STATUS_YIELD_TICK suspend immediately. None implies a guaranteed screen refresh.
export const WAIT_OPERATIONS = new Set([
    'control_wait', 'control_wait_until', 'motion_glidesecstoxy', 'motion_glideto',
    'looks_sayforsecs', 'looks_thinkforsecs', 'sound_playuntildone',
    'sensing_askandwait', 'event_broadcastandwait', 'looks_switchbackdroptoandwait'
]);
const LITERAL_OPCODES = new Set(['text', 'math_number', 'math_integer', 'math_whole_number',
    'math_positive_number', 'math_angle', 'motion_goto_menu', 'motion_glideto_menu',
    'motion_pointtowards_menu', 'sensing_touchingobjectmenu', 'sensing_distancetomenu',
    'control_create_clone_of_menu', 'sensing_of_object_menu']);
const fieldValue = (block, name) => block.fields && block.fields[name] && block.fields[name].value;
const staticInput = (blocks, block, name) => {
    const input = block.inputs && block.inputs[name];
    const value = input && blocks[input.block];
    if (!value || !LITERAL_OPCODES.has(value.opcode)) return null;
    const field = Object.values(value.fields || {})[0];
    return field ? String(field.value) : null;
};
const blockLocation = (target, block) => ({kind: 'block',
    targetId: target.id,
    blockId: block.id});
export const originalTargets = runtime => runtime.targets.filter(target => target.isStage || target.isOriginal);
export const visibleMonitors = runtime => {
    const state = runtime.getMonitorState ? runtime.getMonitorState() : [];
    const monitors = [];
    const values = state.valueSeq ? state.valueSeq() : state;
    values.forEach(item => {
        const value = item.toJS ? item.toJS() : item;
        if (value.visible && ['data_variable', 'data_listcontents'].includes(value.opcode)) {
            monitors.push({id: value.id, targetId: value.targetId});
        }
    });
    return monitors;
};

// Yield between small units so the host can cancel or time-slice large projects.
export const analyzeProject = function* (targets, monitors = [], enabled = RULES) {
    const rules = new Set(enabled);
    const stage = targets.find(target => target.isStage);
    const names = new Set(targets.filter(target => !target.isStage).map(target => target.getName()));
    const used = new Set();
    const results = [];
    const variableKey = (target, id) => JSON.stringify([target.id, id]);
    const useId = (target, id) => {
        if (target.variables && target.variables[id]) used.add(variableKey(target, id));
        else if (stage && stage.variables[id]) used.add(variableKey(stage, id));
    };
    const add = (rule, target, location, values, related = []) => results.push({
        id: JSON.stringify([rule, target.id, location.blockId || location.variableId]),
        rule,
        severity: rule === 'unused-data' ? 'info' : 'warning',
        type: {'missing-target': 'reference', 'warp-wait': 'execution', 'unused-data': 'cleanup'}[rule],
        message: rule,
        values,
        targetName: target.getName(),
        isStage: target.isStage,
        location,
        related
    });
    for (const monitor of monitors) {
        for (const target of targets) {
            if (!monitor.targetId || monitor.targetId === target.id || target.isStage) useId(target, monitor.id);
            yield;
        }
    }
    for (const target of targets) {
        const blocks = target.blocks._blocks;
        const procedures = new Map();
        for (const block of Object.values(blocks)) {
            yield;
            if (block.opcode === 'procedures_definition') {
                const input = block.inputs && block.inputs.custom_block;
                const proto = input && blocks[input.block];
                if (proto && proto.mutation) {
                    procedures.set(proto.mutation.proccode, {block,
                        warp: proto.mutation.warp === true || proto.mutation.warp === 'true'});
                }
            }
            if (rules.has('missing-target') && TARGET_INPUTS[block.opcode]) {
                const [input, special] = TARGET_INPUTS[block.opcode];
                const value = staticInput(blocks, block, input);
                if (value !== null && !special.includes(value) && !names.has(value)) {
                    add('missing-target', target, blockLocation(target, block), {name: value});
                }
            }
            if (!rules.has('unused-data')) continue;
            for (const field of Object.values(block.fields || {})) {
                if (field.id) useId(target, field.id);
            }
            if (block.opcode === 'sensing_of') {
                const object = staticInput(blocks, block, 'OBJECT');
                const property = fieldValue(block, 'PROPERTY');
                for (const candidate of targets) {
                    if (object !== null && (object === '_stage_' ? !candidate.isStage :
                        candidate.isStage || candidate.getName() !== object)) continue;
                    // sensing_of uses target-local scalar lookup (not stage fallback).
                    for (const variable of Object.values(candidate.variables || {})) {
                        if (variable.type === '' && (typeof property === 'undefined' || variable.name === property)) {
                            used.add(variableKey(candidate, variable.id));
                        }
                    }
                    yield;
                }
            }
        }
        if (!rules.has('warp-wait')) continue;
        // Enumerate a procedure body, including nested substacks and reporter inputs,
        // but without descending into other procedure definitions or inactive shadows.
        const body = function* (start) {
            const todo = [start];
            const seen = new Set();
            while (todo.length) {
                const id = todo.pop();
                if (!id || seen.has(id)) continue;
                seen.add(id);
                const block = blocks[id];
                if (!block || block.opcode === 'procedures_definition') continue;
                yield block;
                todo.push(block.next);
                for (const input of Object.values(block.inputs || {})) todo.push(input.block);
            }
        };
        // Cache each body once; transitive traversal below tracks visited procedures
        // so recursive cycles terminate without losing waits in a later branch.
        const bodies = new Map();
        for (const [code, procedure] of procedures) {
            const waits = [];
            const calls = [];
            for (const block of body(procedure.block.next)) {
                if (WAIT_OPERATIONS.has(block.opcode)) waits.push(block);
                if (block.opcode === 'procedures_call' && block.mutation) calls.push(block);
                yield;
            }
            bodies.set(code, {waits, calls});
        }
        for (const [code, procedure] of procedures) {
            if (!procedure.warp) continue;
            const local = bodies.get(code);
            for (const block of local.waits) {
                add('warp-wait', target, blockLocation(target, block), {procedure: code});
                yield;
            }
            for (const call of local.calls) {
                const todo = [call.mutation.proccode];
                const seen = new Set();
                const waits = new Map();
                while (todo.length) {
                    const callee = todo.pop();
                    if (seen.has(callee)) continue;
                    seen.add(callee);
                    const bodyInfo = bodies.get(callee);
                    if (!bodyInfo) continue;
                    for (const block of bodyInfo.waits) {
                        waits.set(block.id, blockLocation(target, block));
                        yield;
                    }
                    for (const nested of bodyInfo.calls) todo.push(nested.mutation.proccode);
                    yield;
                }
                if (waits.size) {
                    add('warp-wait', target, {...blockLocation(target, call),
                        label: call.mutation.proccode}, {procedure: code}, Array.from(waits.values()));
                }
            }
        }
    }
    if (rules.has('unused-data')) {
        for (const target of targets) {
            for (const variable of Object.values(target.variables || {})) {
                yield;
                if (!['', 'list'].includes(variable.type) || variable.isCloud ||
                    used.has(variableKey(target, variable.id))) continue;
                add('unused-data', target, {kind: 'variable',
                    targetId: target.id,
                    variableId: variable.id,
                    variableType: variable.type,
                    label: variable.name}, {name: variable.name, type: variable.type});
            }
        }
    }
    const order = new Map(targets.map((target, index) => [target.id, index]));
    return results.sort((a, b) => Number(a.severity === 'info') - Number(b.severity === 'info') ||
        order.get(a.location.targetId) - order.get(b.location.targetId) ||
        RULES.indexOf(a.rule) - RULES.indexOf(b.rule) || a.id.localeCompare(b.id));
};
