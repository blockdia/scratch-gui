// Container menu items that mean exactly what a built-in block's menu item means reuse
// scratch-blocks' translations, so every locale matches the built-in blocks.
const NATIVE_MESSAGES = {
    'clones.myself': 'CONTROL_CREATECLONEOF_MYSELF',
    'containers.color': 'LOOKS_EFFECT_COLOR',
    'containers.fisheye': 'LOOKS_EFFECT_FISHEYE',
    'containers.whirl': 'LOOKS_EFFECT_WHIRL',
    'containers.pixelate': 'LOOKS_EFFECT_PIXELATE',
    'containers.mosaic': 'LOOKS_EFFECT_MOSAIC',
    'containers.brightness': 'LOOKS_EFFECT_BRIGHTNESS',
    'containers.ghost': 'LOOKS_EFFECT_GHOST',
    'containers.front': 'LOOKS_GOTOFRONTBACK_FRONT',
    'containers.back': 'LOOKS_GOTOFRONTBACK_BACK',
    'containers.forward': 'LOOKS_GOFORWARDBACKWARDLAYERS_FORWARD',
    'containers.backward': 'LOOKS_GOFORWARDBACKWARDLAYERS_BACKWARD',
    'containers.x': 'MOTION_XPOSITION',
    'containers.y': 'MOTION_YPOSITION',
    'containers.size': 'LOOKS_SIZE',
    'containers.direction': 'MOTION_DIRECTION',
    'containers.all around': 'MOTION_SETROTATIONSTYLE_ALLAROUND',
    'containers.left-right': 'MOTION_SETROTATIONSTYLE_LEFTRIGHT',
    'containers.don\'t rotate': 'MOTION_SETROTATIONSTYLE_DONTROTATE',
    'containers.myself': 'CONTROL_CREATECLONEOF_MYSELF',
    'containers.mouse': 'MOTION_GOTO_POINTER',
    'containers.stage': 'SENSING_OF_STAGE'
};

/**
 * @param {object} ScratchBlocks The loaded scratch-blocks.
 * @param {string} locale Locale whose messages are requested.
 * @param {object} messages The GUI's message table for that locale.
 * @returns {object} A copy of messages extended with the built-in block translations.
 */
const withNativeContainerMessages = (ScratchBlocks, locale, messages) => {
    const result = {...messages};
    for (const [id, key] of Object.entries(NATIVE_MESSAGES)) {
        const value = ScratchBlocks.ScratchMsgs.translate(key, null, locale);
        if (typeof value === 'string') result[id] = value;
    }
    return result;
};

export {NATIVE_MESSAGES, withNativeContainerMessages};
