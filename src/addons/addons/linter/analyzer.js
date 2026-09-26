import Cast from 'scratch-vm/src/util/cast';
import {DEFAULT_RULES, RULES, RULE_BY_ID} from './rules';
import {fieldValue, UNKNOWN, own} from './constants';
import {indexTarget, walk, procedureCode, broadcastName, normalizedBroadcast} from './project-index';
import {TARGET_INPUTS, blockLocation, arrayMutation, resourceReference, resolveResource, resources,
    propertyExists, componentProblem, stops, KNOWN_ADDON_BLOCKS} from './semantics';
import opcodeCoverage from './opcode-coverage.json';

export {RULES, DEFAULT_RULES} from './rules';
export {WAIT_OPERATIONS} from './semantics';
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


const dataWrites = new Set(['data_setvariableto', 'data_changevariableby', 'control_for_each',
    'data_addtolist', 'data_deleteoflist', 'data_deletealloflist', 'data_insertatlist', 'data_replaceitemoflist']);
const dataReads = new Set(['data_variable', 'data_listcontents', 'data_itemoflist', 'data_itemnumoflist',
    'data_lengthoflist', 'data_listcontainsitem', 'data_showvariable', 'data_showlist', 'data_changevariableby']);
const dataKey = (target, id) => JSON.stringify([target.id, id]);
const variableLocation = (target, variable) => ({kind: 'variable',
    targetId: target.id,
    variableId: variable.id,
    variableType: variable.type,
    label: variable.name});

// The fourth argument is optional; old callers still receive a diagnostics array.
// onCoverage receives limitations separately, so an unknown is never a successful check.
export const analyzeProject = function* (targets, monitors = [], enabled = DEFAULT_RULES, context = {}) {
    const rules = new Set(enabled);
    const results = new Map();
    const limitations = new Set();
    const unknownOpcodes = new Set();
    const stage = targets.find(target => target.isStage);
    const names = new Set(targets.filter(target => !target.isStage).map(target => target.getName()));
    const used = new Set();
    const read = new Set();
    const written = new Set();
    const resourceUses = new Map();
    const indexes = [];
    const broadcasts = [];
    let dynamicBroadcast = Boolean(context.externalBroadcasts);
    let partialReferences = false;
    const specificMessages = new Set([
        'invalid-procedure-missing', 'invalid-procedure-definition', 'invalid-procedure-signature',
        'invalid-procedure-parameters', 'invalid-argument-outside', 'invalid-argument-parameter',
        'invalid-argument-return-type', 'broadcast-flow-sender', 'broadcast-flow-receiver',
        'constant-control-condition', 'constant-control-repeat', 'constant-control-empty'
    ]);
    const add = (rule, target, location, values = {}, detail = '', related = []) => {
        if (!rules.has(rule)) return;
        const definition = RULE_BY_ID.get(rule);
        const id = JSON.stringify([rule, target.id, location.blockId || location.variableId ||
            location.resourceId, detail]);
        const partial = partialReferences &&
            ['unused-data', 'write-only-data', 'unused-procedure', 'unused-resource'].includes(rule);
        results.set(id, {id,
            rule,
            severity: definition.severity,
            type: definition.type,
            message: partial ? `${rule}-partial` :
                rule === 'invalid-procedure' && detail === 'duplicate' ? 'duplicate-procedure' :
                    specificMessages.has(`${rule}-${detail}`) ? `${rule}-${detail}` : rule,
            values,
            reason: partial ? 'reason-partial-reference' : detail ? `reason-${rule}-${detail}` : `reason-${rule}`,
            targetName: target.getName(),
            isStage: target.isStage,
            location,
            related});
    };
    const useResource = (target, kind, resolved) => {
        if (!target) return;
        const key = dataKey(target, kind);
        const set = resourceUses.get(key) || new Set();
        if (resolved === null) set.add('*');
        else if (resolved >= 0) set.add(resolved);
        resourceUses.set(key, set);
    };
    const resolveData = (target, id) => {
        if (own(target.variables, id)) return [target, target.variables[id]];
        if (stage && own(stage.variables, id)) return [stage, stage.variables[id]];
        return null;
    };
    const markData = (target, id, reading = false, writing = false) => {
        const resolved = resolveData(target, id);
        if (!resolved) return;
        const key = dataKey(resolved[0], id);
        used.add(key);
        if (reading) read.add(key);
        if (writing) written.add(key);
    };
    for (const monitor of monitors) {
        for (const target of targets) {
            if (!monitor.targetId || monitor.targetId === target.id || target.isStage) {
                markData(target,
                    monitor.id, true);
            }
            yield;
        }
    }
    for (const target of targets) {
        const index = yield* indexTarget(target, context, () => limitations.add('expression-limit'));
        indexes.push(index);
        useResource(target, 'costume', target.currentCostume || 0);
        for (const part of (target.component && target.component.parts) || []) {
            useResource(target, 'costume', resources(target, 'costume').findIndex(item => item.name === part.costume));
        }
        for (const block of index.list) {
            yield;
            const location = blockLocation(target, block);
            const op = block.opcode;
            if (typeof op !== 'string') {
                add('invalid-graph', target, location, {}, 'structure');
                continue;
            }
            const extension = own(context.extensions, op);
            if (!Object.prototype.hasOwnProperty.call(opcodeCoverage, op) && !extension) unknownOpcodes.add(op);
            if (index.broken.has(block.id)) {
                add('invalid-graph', target, location, {}, index.broken.get(block.id));
                continue;
            }
            const reference = own(TARGET_INPUTS, op) || (extension && extension.targetInput);
            if (reference) {
                const value = index.input(block, reference[0]);
                if (value === UNKNOWN) limitations.add('dynamic-reference');
                else if (!reference[1].includes(String(value)) && !names.has(String(value))) {
                    add('missing-target', target, location, {name: String(value)});
                }
            }
            const resource = resourceReference(block, target, stage, index.input);
            if (resource && resource.owner) {
                const resolved = resolveResource(resource);
                useResource(resource.owner, resource.kind, resolved);
                if (resource.value === UNKNOWN) limitations.add('dynamic-reference');
                if (resolved === -1) {
                    add(resource.kind === 'sound' ? 'missing-sound' : 'missing-costume', target,
                        location, {name: String(resource.value)});
                }
            }
            if (op === 'looks_nextcostume') useResource(target, 'costume', null);
            if (op === 'looks_nextbackdrop') useResource(stage, 'costume', null);
            for (const [name, field] of Object.entries(block.fields || {})) {
                if (!field) continue;
                const expected = name === 'LIST' ? 'list' : name === 'VARIABLE' ? '' : null;
                const resolved = resolveData(target, field.id);
                if (expected !== null && (!resolved || resolved[1].type !== expected)) {
                    add('invalid-data', target, location, {name: String(field.value || field.id)});
                }
                if (!field.id) continue;
                // Unknown extension fields count conservatively as both uses and reads.
                markData(target, field.id, dataReads.has(op) || (!dataWrites.has(op) && !op.startsWith('data_hide')),
                    dataWrites.has(op));
            }
            if (extension && extension.dataAccess === 'dynamic') {
                limitations.add('dynamic-data');
                for (const owner of targets) {
                    for (const variable of Object.values(owner.variables || {})) {
                        markData(owner, variable.id, true);
                        yield;
                    }
                }
            }
            if (op === 'sensing_of') {
                const object = index.input(block, 'OBJECT');
                const property = fieldValue(block, 'PROPERTY');
                const candidates = targets.filter(candidate => object === UNKNOWN ||
                    (String(object) === '_stage_' ? candidate.isStage :
                        !candidate.isStage && candidate.getName() === String(object)));
                for (const candidate of candidates) {
                    for (const variable of Object.values(candidate.variables || {})) {
                        if (variable.type === '' && (typeof property === 'undefined' || variable.name === property)) {
                            markData(candidate, variable.id, true);
                        }
                        yield;
                    }
                }
                if (typeof property !== 'undefined' && candidates.length &&
                    candidates.every(candidate => !propertyExists(candidate, property))) {
                    add('invalid-property', target, location, {name: String(property)});
                }
            }
            if (componentProblem(block, target, targets, index.input)) add('invalid-component', target, location);
            if (['event_broadcast', 'event_broadcastandwait', 'event_whenbroadcastreceived'].includes(op)) {
                const name = normalizedBroadcast(broadcastName(index, block));
                if (name === UNKNOWN) {
                    dynamicBroadcast = true; limitations.add('dynamic-broadcast');
                } else broadcasts.push({name, target, block, receiver: op === 'event_whenbroadcastreceived'});
            }
            if (index.malformed.has(block.id)) {
                add('invalid-procedure', target, location, {}, index.malformed.get(block.id));
            }
            if (op === 'procedures_call') {
                const code = procedureCode(block);
                const definitions = index.procedures.get(code) || [];
                const addon = own(context.addonBlocks, code);
                if (addon && !KNOWN_ADDON_BLOCKS.has(code)) limitations.add('addon-block');
                if (!definitions.length && !addon) {
                    add('invalid-procedure', target, location,
                        {name: String(code || '')}, 'missing');
                }
                if (definitions.length === 1 && !index.malformed.has(definitions[0].block.id) && !addon) {
                    const definition = definitions[0];
                    const ids = arrayMutation(block.mutation, 'argumentids');
                    // Omitted inputs have legal VM defaults. Unknown IDs do not.
                    if (!ids || ids.some(id => !definition.ids.includes(id)) ||
                        new Set(ids).size !== ids.length ||
                        Object.keys(block.inputs || {}).some(id => !definition.ids.includes(id))) {
                        add('invalid-procedure', target, location, {}, 'parameters',
                            [blockLocation(target, definition.block)]);
                    }
                    if (Boolean(block.mutation && block.mutation.return) !== definition.returns) {
                        add('invalid-argument', target, location, {}, 'return-type',
                            [blockLocation(target, definition.block)]);
                    }
                }
            }
            if (['argument_reporter_string_number', 'argument_reporter_boolean'].includes(op)) {
                const value = String(fieldValue(block, 'VALUE') || '');
                const special = op === 'argument_reporter_boolean' ? ['is compiled?',
                    'is turbowarp?'] : ['last key pressed'];
                const owners = index.owners.get(block.id);
                if (owners && !special.includes(value.toLowerCase()) &&
                    [...owners].every(owner => owner.names && !owner.names.includes(value))) {
                    add('invalid-argument', target, location, {name: value}, 'parameter');
                }
            }
            if (op === 'procedures_return' && !index.owners.has(block.id)) {
                add('invalid-argument', target, location, {}, 'outside');
            }
            if (rules.has('numeric-result')) {
                const value = index.evaluate(block.id);
                if (op.startsWith('operator_') && typeof value === 'number' && !Number.isFinite(value)) {
                    add('numeric-result', target, location, {value: String(value)});
                }
            }
            const conditional = ['control_if', 'control_if_else', 'control_repeat_until',
                'control_while', 'control_wait_until'].includes(op);
            if (conditional && (rules.has('constant-control') || rules.has('nonterminating-control'))) {
                const condition = index.input(block, 'CONDITION');
                if (condition === UNKNOWN) limitations.add('dynamic-expression');
                if (condition !== UNKNOWN) {
                    const truth = Cast.toBoolean(condition);
                    let endless = (!truth && ['control_wait_until', 'control_repeat_until'].includes(op)) ||
                        (truth && op === 'control_while');
                    if (endless && op !== 'control_wait_until') {
                        const start = block.inputs && block.inputs.SUBSTACK && block.inputs.SUBSTACK.block;
                        for (const nested of walk(index.blocks, start)) {
                            yield;
                            if (['procedures_return', 'procedures_call', 'control_stop',
                                'control_delete_this_clone'].includes(nested.opcode) ||
                                !Object.prototype.hasOwnProperty.call(opcodeCoverage, nested.opcode) ||
                                (own(context.extensions, nested.opcode))) endless = false;
                        }
                    }
                    add(endless ? 'nonterminating-control' : 'constant-control', target, location,
                        {value: String(truth)}, 'condition');
                }
            }
            if (op === 'control_repeat' && rules.has('constant-control')) {
                const times = index.input(block, 'TIMES');
                if (times !== UNKNOWN && Math.round(Cast.toNumber(times)) <= 0) {
                    add('constant-control', target, location, {}, 'repeat');
                }
            }
            if (['control_if', 'control_if_else', 'control_repeat', 'control_all_at_once'].includes(op) &&
                !['SUBSTACK', 'SUBSTACK2'].some(name => block.inputs && block.inputs[name] &&
                    block.inputs[name].block) &&
                Object.keys(block.inputs || {}).filter(name => !name.startsWith('SUBSTACK'))
                    .every(name => index.input(block, name) !== UNKNOWN)) {
                add('constant-control', target, location, {}, 'empty');
            }
            if (stops(block) && block.next && index.blocks[block.next]) {
                add('unreachable-code', target, blockLocation(target, index.blocks[block.next]), {}, '', [location]);
            }
        }
    }
    // Unknown implementations limit certainty, not whether known references are checked.
    partialReferences = unknownOpcodes.size > 0 || limitations.has('addon-block');
    for (const index of indexes) {
        const {target, procedures, definitions} = index;
        for (const same of procedures.values()) {
            if (same.length > 1) {
                add('invalid-procedure', target, blockLocation(target, same[0].block), {name: same[0].code},
                    'duplicate',
                    same.slice(1).map(item => blockLocation(target, item.block)));
            }
            yield;
        }
        // Cache transitive waiting locations per callee, reused by every call site.
        const transitive = new Map();
        const collectWaits = function* (code) {
            if (transitive.has(code)) return transitive.get(code);
            const pending = [code];
            const seen = new Set();
            const waits = new Map();
            while (pending.length) {
                const next = pending.pop();
                if (seen.has(next)) continue;
                seen.add(next);
                for (const procedure of procedures.get(next) || []) {
                    for (const block of procedure.waits) {
                        waits.set(block.id, blockLocation(target, block)); yield;
                    }
                    for (const call of procedure.calls) {
                        pending.push(procedureCode(call)); yield;
                    }
                }
                yield;
            }
            const locations = [...waits.values()];
            transitive.set(code, locations);
            return locations;
        };
        if (rules.has('warp-wait')) {
            for (const procedure of definitions) {
                if (!procedure.warp) continue;
                for (const block of procedure.waits) {
                    add('warp-wait', target, blockLocation(target, block), {procedure: procedure.code});
                    yield;
                }
                for (const call of procedure.calls) {
                    const waits = yield* collectWaits(procedureCode(call));
                    if (waits.length) {
                        add('warp-wait', target,
                            {...blockLocation(target, call), label: procedureCode(call)},
                            {procedure: procedure.code}, '', waits);
                    }
                }
            }
        }
        if (rules.has('unused-procedure')) {
            const reachable = new Set();
            const pending = index.list.filter(block => block.opcode === 'procedures_call' &&
                !index.owners.has(block.id)).map(procedureCode);
            while (pending.length) {
                const code = pending.pop();
                if (reachable.has(code)) continue;
                reachable.add(code);
                for (const procedure of procedures.get(code) || []) {
                    for (const call of procedure.calls) {
                        pending.push(procedureCode(call)); yield;
                    }
                }
                yield;
            }
            for (const procedure of definitions) {
                if (!reachable.has(procedure.code) && !(own(context.addonBlocks, procedure.code))) {
                    add('unused-procedure', target, {...blockLocation(target, procedure.block), label: procedure.code},
                        {name: procedure.code});
                }
                yield;
            }
        }
        for (const variable of Object.values(target.variables || {})) {
            yield;
            if (!['', 'list'].includes(variable.type) || variable.isCloud) continue;
            const key = dataKey(target, variable.id);
            const values = {name: variable.name, type: variable.type};
            if (!used.has(key)) add('unused-data', target, variableLocation(target, variable), values);
            else if (written.has(key) && !read.has(key)) {
                add('write-only-data', target,
                    variableLocation(target, variable), values);
            }
        }
        if (rules.has('unused-resource')) {
            for (const kind of ['costume', 'sound']) {
                const uses = resourceUses.get(dataKey(target, kind)) || new Set();
                if (uses.has('*')) continue;
                const items = resources(target, kind);
                for (let i = 0; i < items.length; i++) {
                    yield;
                    if (uses.has(i)) continue;
                    // Asset IDs can be shared by distinct named costumes. Include name for stable identity.
                    const item = items[i];
                    add('unused-resource', target, {kind: 'resource',
                        targetId: target.id,
                        resourceKind: kind,
                        resourceId: JSON.stringify([kind, item.assetId || item.md5 || '', item.name]),
                        name: item.name,
                        assetId: item.assetId,
                        label: item.name}, {name: item.name});
                }
            }
        }
    }
    if (rules.has('broadcast-flow')) {
        const sends = new Set(broadcasts.filter(item => !item.receiver).map(item => item.name));
        const receives = new Set(broadcasts.filter(item => item.receiver).map(item => item.name));
        for (const item of broadcasts) {
            yield;
            if (item.receiver ? !dynamicBroadcast && !sends.has(item.name) : !receives.has(item.name)) {
                add('broadcast-flow', item.target, blockLocation(item.target, item.block), {name: item.name},
                    item.receiver ? 'sender' : 'receiver');
            }
        }
    }
    if (unknownOpcodes.size) limitations.add('unknown-opcode');
    if (context.onCoverage) context.onCoverage({limitations: [...limitations], unknownOpcodes: [...unknownOpcodes]});
    const order = new Map(targets.map((target, i) => [target.id, i]));
    return [...results.values()].sort((a, b) => Number(a.severity === 'info') - Number(b.severity === 'info') ||
        order.get(a.location.targetId) - order.get(b.location.targetId) ||
        RULES.indexOf(a.rule) - RULES.indexOf(b.rule) || a.id.localeCompare(b.id));
};
