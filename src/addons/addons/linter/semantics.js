import Cast from 'scratch-vm/src/util/cast';
import ComponentModel from 'scratch-vm/src/components/model';
import opcodeCoverage from './opcode-coverage.json';
import {fieldValue, UNKNOWN, own} from './constants';

export const TARGET_INPUTS = {
    motion_goto: ['TO', ['_mouse_', '_random_']],
    motion_glideto: ['TO', ['_mouse_', '_random_']],
    motion_pointtowards: ['TOWARDS', ['_mouse_']],
    sensing_touchingobject: ['TOUCHINGOBJECTMENU', ['_mouse_', '_edge_']],
    sensing_distanceto: ['DISTANCETOMENU', ['_mouse_']],
    control_create_clone_of: ['CLONE_OPTION', ['_myself_']],
    clones_createWithId: ['TARGET', ['_myself_']],
    clones_targetId: ['TARGET', ['_myself_', '_stage_']],
    sensing_of: ['OBJECT', ['_stage_']],
    containers_targetProperty: ['TARGET', ['_myself_', '_mouse_']]
};
const reservedReference = value => /^@(sprite|clone|container|container-clone):/.test(value);
// Clone instances are deliberately not read from the live VM: they can appear or
// disappear after a scan, and all instances share their original's scripts.
export const cloneReference = (value, prefix) => value.startsWith(prefix) &&
    value.length > prefix.length && value.trim() === value &&
    !reservedReference(value.slice(prefix.length)) && value.slice(prefix.length).trim() === value.slice(prefix.length);
export const staticTarget = (value, targets) => {
    if (value === UNKNOWN) return UNKNOWN;
    const name = Cast.toString(value);
    if (cloneReference(name, '@clone:')) return UNKNOWN;
    if (name.startsWith('@sprite:')) {
        return targets.find(target => !target.isStage && target.getName() === name.slice('@sprite:'.length)) || null;
    }
    if (reservedReference(name)) return null;
    return targets.find(target => !target.isStage && target.getName() === name) || null;
};
export const cloneIdProblem = (block, input, limit) => {
    const create = ['clones_createWithId', 'containers_createWithId'].includes(block.opcode);
    const remove = ['clones_delete', 'containers_deleteById'].includes(block.opcode);
    if (!create && !remove) return null;
    const value = input(block, 'ID');
    if (value === UNKNOWN) {
        limit('dynamic-reference');
        return null;
    }
    const name = Cast.toString(value);
    if (create) {
        if (name.trim() !== name || /^\d+$/.test(name) || reservedReference(name)) return {name, detail: 'suffix'};
    } else {
        const prefix = block.opcode === 'clones_delete' ? '@clone:' : '@container-clone:';
        if (!cloneReference(name, prefix)) return {name, detail: 'reference', prefix};
    }
    limit('runtime-clone');
    return null;
};
// Execution restrictions, not palette visibility: click hats and backdrop
// operations intentionally work in both target types in the VM.
export const scopeProblem = (block, target, input, extension) => {
    const descriptor = own(opcodeCoverage, block.opcode) || extension || {};
    const allowed = descriptor.targetTypes || descriptor.filter;
    if (allowed && !allowed.includes(target.isStage ? 'stage' : 'sprite')) {
        return allowed.includes('sprite') ? 'sprite' : 'stage';
    }
    if (target.isStage && ((block.opcode === 'clones_createWithId' && input(block, 'TARGET') === '_myself_') ||
        (block.opcode === 'control_create_clone_of' &&
        input(block, 'CLONE_OPTION') === '_myself_') ||
        (block.opcode === 'containers_targetProperty' && input(block, 'TARGET') === '_myself_'))) return 'self';
    return null;
};
export const CONTAINER_OPERATIONS = new Set([
    'containers_property', 'containers_setProperty', 'containers_changeProperty', 'containers_goToXY',
    'containers_setRotationStyle', 'containers_effect', 'containers_setEffect', 'containers_changeEffect',
    'containers_clearEffects', 'containers_show', 'containers_hide', 'containers_isVisible',
    'containers_goToLayer', 'containers_moveLayers', 'containers_createClone', 'containers_deleteClone',
    'containers_createWithId', 'containers_id', 'containers_originalId', 'containers_parentId'
]);
// Match SpriteContainers.getTargetContainers for original targets. Clone instances
// reuse these scripts and may have cloned ancestors; never reject an original
// simply because it is not currently a clone.
export const containingPaths = (target, paths) => {
    if (target.isStage) return [];
    const parts = target.getName().split('//');
    if (parts.slice(0, -1).some(part => !part || part.endsWith('/'))) return [];
    return parts.slice(0, -1).map((part, index) => parts.slice(0, index + 1).join('//'))
        .filter(path => paths.has(path));
};
export const containerProblem = (block, target, paths, input, limit) => {
    if (!CONTAINER_OPERATIONS.has(block.opcode)) return null;
    const value = input(block, 'CONTAINER');
    if (value === UNKNOWN) {
        limit('dynamic-reference');
        return null;
    }
    let name = Cast.toString(value);
    const self = name === '_mycontainer_';
    // The legacy ancestry-only deletion block accepts paths, not public IDs.
    if (block.opcode === 'containers_deleteClone' && reservedReference(name)) return {detail: 'ancestry', name};
    if (cloneReference(name, '@container-clone:')) {
        limit('runtime-clone');
        return null;
    }
    if (name.startsWith('@container:')) name = name.slice('@container:'.length);
    else if (reservedReference(name)) return {detail: 'missing', name};
    if (self && target.isStage) return {detail: 'self', name};
    if (!paths) {
        limit('container-metadata');
        return null;
    }
    const membership = containingPaths(target, paths);
    if (self) return membership.length ? null : {detail: 'self', name};
    if (!paths.has(name)) return {detail: 'missing', name};
    if (block.opcode === 'containers_deleteClone' && !membership.includes(name)) {
        return {detail: 'ancestry', name};
    }
    return null;
};
export const WAIT_OPERATIONS = new Set([
    'control_wait', 'control_wait_until', 'motion_glidesecstoxy', 'motion_glideto',
    'looks_sayforsecs', 'looks_thinkforsecs', 'sound_playuntildone', 'sensing_askandwait',
    'event_broadcastandwait', 'looks_switchbackdroptoandwait',
    'music_playDrumForBeats', 'music_midiPlayDrumForBeats', 'music_restForBeats', 'music_playNoteForBeats',
    'text2speech_speakAndWait', 'translate_getTranslate', 'speech2text_listenAndWait',
    'microbit_displaySymbol', 'microbit_displayText', 'microbit_displayClear',
    'wedo2_motorOnFor', 'wedo2_motorOn', 'wedo2_motorOff', 'wedo2_startMotorPower',
    'wedo2_setMotorDirection', 'wedo2_setLightHue', 'wedo2_playNoteFor',
    'ev3_motorTurnClockwise', 'ev3_motorTurnCounterClockwise', 'ev3_beep',
    'boost_motorOnFor', 'boost_motorOnForRotation', 'boost_motorOn', 'boost_motorOff',
    'boost_setMotorPower', 'boost_setMotorDirection', 'boost_setLightHue'
]);
const conditionalSoundWaits = new Set(['sound_seteffectto', 'sound_changeeffectby',
    'sound_setvolumeto', 'sound_changevolumeby']);
export const mayWait = (block, context) => WAIT_OPERATIONS.has(block.opcode) ||
    (conditionalSoundWaits.has(block.opcode) && (!context.runtimeOptions ||
        context.runtimeOptions.miscLimits !== false)) ||
    Boolean(own(context.extensions, block.opcode) && context.extensions[block.opcode].mayWait);
export const resources = (target, kind) => {
    if (!target) return [];
    if (kind === 'sound') return (target.sprite && target.sprite.sounds) || [];
    return target.getCostumes ? target.getCostumes() : (target.sprite && target.sprite.costumes) || [];
};
export const resourceReference = (block, target, stage, input) => {
    const op = block.opcode;
    if (['sound_play', 'sound_playuntildone'].includes(op)) {
        return {owner: target, kind: 'sound', value: input(block, 'SOUND_MENU')};
    }
    if (op === 'looks_switchcostumeto') return {owner: target, kind: 'costume', value: input(block, 'COSTUME')};
    if (['looks_switchbackdropto', 'looks_switchbackdroptoandwait'].includes(op)) {
        return {owner: stage, kind: 'costume', value: input(block, 'BACKDROP'), backdrop: true};
    }
    if (op === 'event_whenbackdropswitchesto') {
        return {owner: stage, kind: 'costume', value: fieldValue(block, 'BACKDROP'), exact: true};
    }
    return null;
};
// null = potentially selects any resource; -1 = invalid; otherwise a specific index.
export const resolveResource = ref => {
    if (ref.value === UNKNOWN || typeof ref.value === 'undefined') return null;
    const items = resources(ref.owner, ref.kind);
    const value = ref.value;
    const named = items.findIndex(item => item.name === (ref.kind === 'sound' ? value : String(value)));
    if (ref.exact) return named;
    if ((ref.kind === 'sound' || typeof value !== 'number') && named !== -1) return named;
    if (ref.kind === 'sound') {
        const number = parseInt(value, 10);
        return items.length && !Number.isNaN(number) ? null : -1;
    }
    const special = ref.backdrop ? ['next backdrop', 'previous backdrop', 'random backdrop'] :
        ['next costume', 'previous costume'];
    if (special.includes(value)) return items.length ? null : -1;
    // VM wraps indices, including out-of-range values. Never diagnose ordinary wraparound.
    if (!Cast.isWhiteSpace(value) && !Number.isNaN(Number(value))) return items.length ? null : -1;
    return -1;
};
export const propertyExists = (target, property) => {
    const builtins = target.isStage ? ['background #', 'backdrop #', 'backdrop name', 'volume'] :
        ['x position', 'y position', 'direction', 'costume #', 'costume name', 'size', 'volume'];
    return builtins.includes(property) || Object.values(target.variables || {})
        .some(variable => variable.type === '' && variable.name === property);
};
export const componentProblem = (block, target, targets, input, limit = () => {}) => {
    const descriptor = own(opcodeCoverage, block.opcode);
    if (descriptor && descriptor.componentTypes) {
        return target.isStage || !target.component || Boolean(target.componentError) ||
            !descriptor.componentTypes.includes(target.component.type);
    }
    const numeric = ['components_targetProperty', 'components_changeTargetProperty', 'components_setTargetProperty'];
    const boolean = ['components_targetIsChecked', 'components_setTargetChecked'];
    if (!numeric.includes(block.opcode) && !boolean.includes(block.opcode)) return false;
    const name = input(block, 'TARGET');
    const owner = name === '_myself_' ? target : staticTarget(name, targets);
    if (owner === UNKNOWN) {
        limit(name === UNKNOWN ? 'dynamic-reference' : 'runtime-clone');
        return false;
    }
    if (!owner || !owner.component || owner.componentError) return true;
    const property = boolean.includes(block.opcode) ? 'checked' : input(block, 'PROPERTY');
    if (property === UNKNOWN) return false;
    return !ComponentModel.hasScriptableProperty(owner.component.type, String(property),
        boolean.includes(block.opcode) ? 'boolean' : 'number');
};
export const arrayMutation = (mutation, name) => {
    if (!mutation || typeof mutation[name] === 'undefined') return [];
    try {
        const value = JSON.parse(mutation[name]);
        return Array.isArray(value) ? value : null;
    } catch (e) {
        return null;
    }
};
export const edges = block => [block.next, ...Object.values(block.inputs || {}).map(input => input && input.block)]
    .filter(Boolean);
export const blockLocation = (target, block) => ({kind: 'block', targetId: target.id, blockId: block.id});
export const stops = block => block.opcode === 'procedures_return' || block.opcode === 'control_forever' ||
    (block.opcode === 'control_stop' && ['all', 'this script'].includes(fieldValue(block, 'STOP_OPTION')));

// Audited bundled debugger callbacks: breakpoint pauses the debugger; log/warn/error
// emit console entries. None indirectly reference project data, resources or procedures.
// Match exact registered signatures, never infer third-party behavior from a name.
export const KNOWN_ADDON_BLOCKS = new Set([
    '\u200B\u200Bbreakpoint\u200B\u200B',
    '\u200B\u200Blog\u200B\u200B %s',
    '\u200B\u200Bwarn\u200B\u200B %s',
    '\u200B\u200Berror\u200B\u200B %s'
]);
