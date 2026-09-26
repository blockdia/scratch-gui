import Cast from 'scratch-vm/src/util/cast';
import MathUtil from 'scratch-vm/src/util/math-util';

export const UNKNOWN = Symbol('unknown');
export const own = (object, key) => (object && Object.prototype.hasOwnProperty.call(object, key) ? object[key] : null);
export const fieldValue = (block, name) => block && block.fields && block.fields[name] && block.fields[name].value;
const literals = new Set(['text', 'math_number', 'math_integer', 'math_whole_number', 'math_positive_number',
    'math_angle', 'colour_picker', 'motion_goto_menu', 'motion_glideto_menu', 'motion_pointtowards_menu',
    'sensing_touchingobjectmenu', 'sensing_distancetomenu', 'control_create_clone_of_menu', 'sensing_of_object_menu',
    'looks_costume', 'looks_backdrops', 'sound_sounds_menu', 'event_broadcast_menu',
    'components_menu_numericTargets', 'components_menu_toggleTargets', 'components_menu_numericProperties']);
const math = {
    'abs': Math.abs,
    'floor': Math.floor,
    'ceiling': Math.ceil,
    'sqrt': Math.sqrt,
    'sin': n => Math.round(Math.sin((Math.PI * n) / 180) * 1e10) / 1e10,
    'cos': n => Math.round(Math.cos((Math.PI * n) / 180) * 1e10) / 1e10,
    'tan': MathUtil.tan,
    'asin': n => (Math.asin(n) * 180) / Math.PI,
    'acos': n => (Math.acos(n) * 180) / Math.PI,
    'atan': n => (Math.atan(n) * 180) / Math.PI,
    'ln': Math.log,
    'log': n => Math.log(n) / Math.LN10,
    'e ^': Math.exp,
    '10 ^': n => Math.pow(10, n)
};
const pure = {
    operator_add: ['NUM1', 'NUM2', (a, b) => Cast.toNumber(a) + Cast.toNumber(b)],
    operator_subtract: ['NUM1', 'NUM2', (a, b) => Cast.toNumber(a) - Cast.toNumber(b)],
    operator_multiply: ['NUM1', 'NUM2', (a, b) => Cast.toNumber(a) * Cast.toNumber(b)],
    operator_divide: ['NUM1', 'NUM2', (a, b) => Cast.toNumber(a) / Cast.toNumber(b)],
    operator_mod: ['NUM1', 'NUM2', (a, b) => {
        const modulus = Cast.toNumber(b);
        const result = Cast.toNumber(a) % modulus;
        return result / modulus < 0 ? result + modulus : result;
    }],
    operator_equals: ['OPERAND1', 'OPERAND2', (a, b) => Cast.compare(a, b) === 0],
    operator_lt: ['OPERAND1', 'OPERAND2', (a, b) => Cast.compare(a, b) < 0],
    operator_gt: ['OPERAND1', 'OPERAND2', (a, b) => Cast.compare(a, b) > 0],
    operator_and: ['OPERAND1', 'OPERAND2', (a, b) => Cast.toBoolean(a) && Cast.toBoolean(b)],
    operator_or: ['OPERAND1', 'OPERAND2', (a, b) => Cast.toBoolean(a) || Cast.toBoolean(b)],
    operator_not: ['OPERAND', a => !Cast.toBoolean(a)],
    operator_join: ['STRING1', 'STRING2', (a, b) => String(a) + String(b)],
    operator_length: ['STRING', a => String(a).length],
    operator_contains: ['STRING1', 'STRING2', (a, b) => String(a).toLowerCase()
        .includes(String(b).toLowerCase())],
    operator_letter_of: ['LETTER', 'STRING', (a, b) => {
        const index = Cast.toNumber(a) - 1;
        return index < 0 || index >= String(b).length ? '' : String(b).charAt(index);
    }],
    operator_round: ['NUM', a => Math.round(Cast.toNumber(a))]
};
export const PURE_OPCODES = Object.keys(pure).concat('operator_mathop', 'operator_boolean');
// Bounded, side-effect-free evaluator. Never invokes a VM primitive or extension.
export const createEvaluator = (blocks, limit = () => {}) => {
    const cache = new Map();
    const evaluate = (id, depth = 0, path = new Set(), budget = {remaining: 512}) => {
        if (!id || !blocks[id]) return UNKNOWN;
        if (cache.has(id)) return cache.get(id);
        if (depth > 64 || path.has(id) || --budget.remaining < 0) {
            limit(); return UNKNOWN;
        }
        const block = blocks[id];
        let result = UNKNOWN;
        if (literals.has(block.opcode)) {
            const field = Object.values(block.fields || {})[0];
            if (field) result = field.value;
        } else if (block.opcode === 'operator_boolean') {
            const value = fieldValue(block, 'VALUE');
            if (typeof value !== 'undefined') result = value === true || String(value).toUpperCase() === 'TRUE';
        } else {
            const operation = own(pure, block.opcode);
            if (operation || block.opcode === 'operator_mathop') {
                path.add(id);
                const names = operation ? operation.slice(0, -1) : ['NUM'];
                const values = names.map(name => evaluate(block.inputs && block.inputs[name] &&
                    block.inputs[name].block, depth + 1, path, budget));
                path.delete(id);
                if (!values.includes(UNKNOWN)) {
                    if (operation) result = operation[operation.length - 1](...values);
                    else {
                        const fn = own(math, String(fieldValue(block, 'OPERATOR')).toLowerCase());
                        if (fn) result = fn(Cast.toNumber(values[0]));
                    }
                }
            }
        }
        if (typeof result === 'string' && result.length > 16384) {
            limit(); result = UNKNOWN;
        }
        cache.set(id, result);
        return result;
    };
    return {evaluate,
        input: (block, name) => {
            const connection = own(block.inputs, name);
            if (connection) return evaluate(connection.block);
            // Non-reporter extension menus (e.g. component PROPERTY) are fields,
            // whereas reporter-accepting menus are connected shadow blocks.
            const field = own(block.fields, name);
            return field ? field.value : UNKNOWN;
        }};
};
