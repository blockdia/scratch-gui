import VM from 'scratch-vm';
import Cast from 'scratch-vm/src/util/cast';
import Operators from 'scratch-vm/src/blocks/scratch3_operators';
import Sound from 'scratch-vm/src/blocks/scratch3_sound';
import {analyzeProject} from '../../../../src/addons/addons/linter/analyzer';
import {createEvaluator} from '../../../../src/addons/addons/linter/constants';
import {resolveResource} from '../../../../src/addons/addons/linter/semantics';

const analyze = targets => {
    const iterator = analyzeProject(targets);
    let next;
    do {
        next = iterator.next();
    } while (!next.done);
    return next.value;
};
test('real VM SB3 loading, names and variable ownership agree with the analyzer without project mutations', async () => {
    const vm = new VM();
    try {
        await vm.loadProject({targets: [{isStage: true,
            name: 'Stage',
            variables: {global: ['score', 0]},
            lists: {},
            broadcasts: {},
            comments: {},
            costumes: [],
            sounds: [],
            volume: 100,
            blocks: {
                move: {opcode: 'motion_goto',
                    next: null,
                    parent: null,
                    inputs: {TO: [1, 'menu']},
                    fields: {},
                    shadow: false,
                    topLevel: true,
                    x: 0,
                    y: 0},
                menu: {opcode: 'motion_goto_menu',
                    next: null,
                    parent: 'move',
                    inputs: {},
                    fields: {TO: ['Ghost', null]},
                    shadow: true,
                    topLevel: false},
                read: {opcode: 'data_variable',
                    next: null,
                    parent: null,
                    inputs: {},
                    fields: {VARIABLE: ['score', 'global']},
                    shadow: false,
                    topLevel: true,
                    x: 10,
                    y: 10}
            }}],
        monitors: [],
        extensions: [],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: 'test'}});
        const before = vm.toJSON();
        const rows = analyze(vm.runtime.targets);
        expect(rows.map(row => row.rule)).toEqual(['missing-target']);
        expect(rows[0].location.blockId).toBe('move');
        expect(vm.toJSON()).toBe(before);
        const stage = vm.runtime.getTargetForStage();
        stage.blocks._blocks.menu.fields.TO.value = '_mouse_';
        expect(analyze(vm.runtime.targets)).toEqual([]);
    } finally {
        vm.quit();
    }
});
test.each(['2tail', '0', '-3', 'beep', 'missing', ' ', 'Infinity'])(
    'sound reference %s agrees with the VM lookup, including parseInt fallback', value => {
        const target = {sprite: {sounds: [{name: 'beep'}, {name: '2tail'}]}};
        const vmResult = Sound.prototype._getSoundIndex.call({getSoundIndexByName: Sound.prototype.getSoundIndexByName},
            value, {target});
        expect(resolveResource({owner: target, kind: 'sound', value}) === -1).toBe(vmResult === -1);
    }
);
test.each([
    ['operator_add', 'add', 'NUM1', 'NUM2', 'not a number', 3],
    ['operator_mod', 'mod', 'NUM1', 'NUM2', -5, 3],
    ['operator_equals', 'equals', 'OPERAND1', 'OPERAND2', ' ', 0],
    ['operator_equals', 'equals', 'OPERAND1', 'OPERAND2', '\t', 0],
    ['operator_equals', 'equals', 'OPERAND1', 'OPERAND2', 'A', 'a'],
    ['operator_divide', 'divide', 'NUM1', 'NUM2', 0, 0]
])('constant %s follows VM semantics', (opcode, method, first, second, a, b) => {
    const blocks = {op: {id: 'op', opcode, inputs: {[first]: {block: 'a'}, [second]: {block: 'b'}}},
        a: {opcode: 'text', fields: {TEXT: {value: a}}},
        b: {opcode: 'text', fields: {TEXT: {value: b}}}};
    expect(createEvaluator(blocks).evaluate('op')).toBe(Operators.prototype[method]({[first]: a, [second]: b}));
    expect(Cast.toBoolean('false')).toBe(false);
});

test.each(['abs', 'floor', 'ceiling', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'e ^', '10 ^'])(
    'pure math %s agrees with VM, including domain and non-finite results', operator => {
        for (const value of [-1, 0, 0.5, 90, Infinity]) {
            const blocks = {op: {id: 'op', opcode: 'operator_mathop', fields: {OPERATOR: {value: operator}},
                inputs: {NUM: {block: 'n'}}}, n: {opcode: 'math_number', fields: {NUM: {value}}}};
            expect(createEvaluator(blocks).evaluate('op')).toBe(Operators.prototype.mathop({OPERATOR: operator, NUM: value}));
        }
    }
);
test.each([
    ['operator_subtract', 'subtract', {NUM1: 3, NUM2: 2}],
    ['operator_multiply', 'multiply', {NUM1: 'foo', NUM2: 3}],
    ['operator_lt', 'lt', {OPERAND1: 'a', OPERAND2: 'B'}],
    ['operator_gt', 'gt', {OPERAND1: Infinity, OPERAND2: Infinity}],
    ['operator_and', 'and', {OPERAND1: 'false', OPERAND2: 'true'}],
    ['operator_or', 'or', {OPERAND1: 'false', OPERAND2: 'true'}],
    ['operator_not', 'not', {OPERAND: 'false'}],
    ['operator_length', 'length', {STRING: 'abc'}],
    ['operator_contains', 'contains', {STRING1: 'ABC', STRING2: 'b'}],
    ['operator_letter_of', 'letterOf', {LETTER: -1, STRING: 'abc'}],
    ['operator_letter_of', 'letterOf', {LETTER: 2.5, STRING: 'abc'}],
    ['operator_round', 'round', {NUM: -0.5}]
])('%s uses the same pure semantics as VM', (opcode, method, args) => {
    const blocks = {op: {id: 'op', opcode, inputs: {}}};
    for (const [key, value] of Object.entries(args)) {
        blocks[key] = {opcode: 'text', fields: {TEXT: {value}}};
        blocks.op.inputs[key] = {block: key};
    }
    expect(createEvaluator(blocks).evaluate('op')).toBe(Operators.prototype[method](args));
});
