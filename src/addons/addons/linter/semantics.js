import Cast from 'scratch-vm/src/util/cast';
import ComponentModel from 'scratch-vm/src/components/model';
import {fieldValue, UNKNOWN, own} from './constants';

export const TARGET_INPUTS = {
    motion_goto: ['TO', ['_mouse_', '_random_']],
    motion_glideto: ['TO', ['_mouse_', '_random_']],
    motion_pointtowards: ['TOWARDS', ['_mouse_']],
    sensing_touchingobject: ['TOUCHINGOBJECTMENU', ['_mouse_', '_edge_']],
    sensing_distanceto: ['DISTANCETOMENU', ['_mouse_']],
    control_create_clone_of: ['CLONE_OPTION', ['_myself_']],
    sensing_of: ['OBJECT', ['_stage_']]
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
export const componentProblem = (block, target, targets, input) => {
    if (block.opcode === 'components_whenClicked') return !target.component || target.component.type !== 'button';
    if (block.opcode === 'components_whenStateChanged') return !target.component || target.component.type !== 'toggle';
    const numeric = ['components_targetProperty', 'components_changeTargetProperty', 'components_setTargetProperty'];
    const boolean = ['components_targetIsChecked', 'components_setTargetChecked'];
    if (!numeric.includes(block.opcode) && !boolean.includes(block.opcode)) return false;
    const name = input(block, 'TARGET');
    if (name === UNKNOWN) return false;
    const owner = name === '_myself_' ? target : targets.find(item => !item.isStage && item.getName() === String(name));
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
