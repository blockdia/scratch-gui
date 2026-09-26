import {analyzeProject} from '../../../../src/addons/addons/linter/analyzer';
import {RULE_DEFINITIONS} from '../../../../src/addons/addons/linter/rules';
import {createEvaluator, UNKNOWN} from '../../../../src/addons/addons/linter/constants';
import coverage from '../../../../src/addons/addons/linter/opcode-coverage.json';
import inventory from '../../../../scripts/linter-opcode-inventory.cjs';
import path from 'path';

const block = (id, opcode, extra = {}) => ({id, opcode, fields: {}, inputs: {}, next: null, ...extra});
const literal = (id, value) => block(id, 'text', {fields: {TEXT: {value}}});
const input = id => ({block: id, shadow: id});
const target = (blocks = [], extra = {}) => ({id: 'a',
    isOriginal: true,
    getName: () => 'a',
    variables: {},
    sprite: {costumes: [{name: 'one'}, {name: 'two'}], sounds: [{name: 'beep'}]},
    blocks: {_blocks: Object.fromEntries(blocks.map(item => [item.id, item]))},
    ...extra});
const procedure = (code, next, mutation = {}) => [
    block(`def-${code}`, 'procedures_definition', {inputs: {custom_block: input(`proto-${code}`)}, next}),
    block(`proto-${code}`, 'procedures_prototype', {mutation: {proccode: code,
        warp: 'false',
        argumentids: '[]',
        argumentnames: '[]',
        argumentdefaults: '[]',
        ...mutation}})
];
const call = (id, code, extra = {}) => block(id, 'procedures_call', {mutation: {proccode: code}, ...extra});
const analyze = (targets, rules, context = {}) => {
    const iterator = analyzeProject(targets, [], rules, context);
    let next;
    do {
        next = iterator.next();
    } while (!next.done);
    return next.value;
};
const reference = (opcode, name, value) => [block('ref', opcode, {inputs: {[name]: input('value')}}), literal('value', value)];

// Independent expected cases: do not enumerate the implementation's opcode sets for semantic coverage.
const cases = [
    ['missing-target', target(reference('motion_goto', 'TO', 'absent')), target(reference('motion_goto', 'TO', '_mouse_'))],
    ['warp-wait', target([...procedure('p', 'wait', {warp: 'true'}), block('wait', 'translate_getTranslate')]),
        target([...procedure('p', 'move', {warp: 'true'}), block('move', 'motion_movesteps')])],
    ['unused-data', target([], {variables: {v: {id: 'v', name: 'v', type: ''}}}),
        target([block('read', 'data_variable', {fields: {VARIABLE: {id: 'v', value: 'v'}}})],
            {variables: {v: {id: 'v', name: 'v', type: ''}}})],
    ['missing-costume', target(reference('looks_switchcostumeto', 'COSTUME', 'absent')),
        target(reference('looks_switchcostumeto', 'COSTUME', '100'))],
    ['missing-sound', target(reference('sound_play', 'SOUND_MENU', 'absent')),
        target(reference('sound_play', 'SOUND_MENU', '2tail'))],
    ['invalid-data', target([block('b', 'data_variable', {fields: {VARIABLE: {id: 'v'}}})]),
        target([block('b', 'data_variable', {fields: {VARIABLE: {id: 'v'}}})],
            {variables: {v: {id: 'v', name: 'v', type: ''}}})],
    ['invalid-property', target([block('b', 'sensing_of', {fields: {PROPERTY: {value: 'absent'}},
        inputs: {OBJECT: input('v')}}), literal('v', 'a')]),
    target([block('b', 'sensing_of', {fields: {PROPERTY: {value: 'x position'}},
        inputs: {OBJECT: input('v')}}), literal('v', 'a')])],
    ['invalid-procedure', target([call('c', 'absent')]), target([...procedure('p', null), call('c', 'p')])],
    ['invalid-argument', target([block('r', 'procedures_return')]),
        target([...procedure('p', 'r', {return: '1'}), block('r', 'procedures_return')])],
    ['invalid-component', target([block('b', 'components_whenClicked')]),
        target([block('b', 'components_whenClicked')], {component: {type: 'button'}})],
    ['invalid-graph', target([block('b', 'motion_movesteps', {next: 'missing'})]), target([block('b', 'motion_movesteps')])],
    ['broadcast-flow', target(reference('event_broadcast', 'BROADCAST_INPUT', 'hello')),
        target([...reference('event_broadcast', 'BROADCAST_INPUT', 'hello'),
            block('hat', 'event_whenbroadcastreceived', {fields: {BROADCAST_OPTION: {value: 'HELLO'}}})])],
    ['unused-procedure', target([...procedure('p', 'self'), call('self', 'p')]),
        target([...procedure('p', null), call('external', 'p')])],
    ['write-only-data', target([block('b', 'data_setvariableto', {fields: {VARIABLE: {id: 'v'}}})],
        {variables: {v: {id: 'v', name: 'v', type: ''}}}),
    target([block('b', 'data_changevariableby', {fields: {VARIABLE: {id: 'v'}}})],
        {variables: {v: {id: 'v', name: 'v', type: ''}}})],
    ['constant-control', target(reference('control_repeat', 'TIMES', '0.4')),
        target([block('b', 'control_if', {inputs: {CONDITION: input('sensor'), SUBSTACK: input('move')}}),
            block('sensor', 'sensing_mousedown'), block('move', 'motion_movesteps')])],
    ['unreachable-code', target([block('end', 'control_stop', {fields: {STOP_OPTION: {value: 'this script'}}, next: 'move'}),
        block('move', 'motion_movesteps')]),
    target([block('end', 'control_stop', {fields: {STOP_OPTION: {value: 'other scripts in sprite'}}, next: 'move'}),
        block('move', 'motion_movesteps')])],
    ['nonterminating-control', target(reference('control_wait_until', 'CONDITION', 'false')),
        target(reference('control_wait_until', 'CONDITION', 'true'))],
    ['numeric-result', target([block('op', 'operator_divide', {inputs: {NUM1: input('a'), NUM2: input('b')}}),
        literal('a', 1), literal('b', 0)]),
    target([block('op', 'operator_divide', {inputs: {NUM1: input('a'), NUM2: input('b')}}), literal('a', 1), literal('b', 2)])],
    ['unused-resource', target(), target([block('next', 'looks_nextcostume'), ...reference('sound_play', 'SOUND_MENU', 'beep')])]
];
test.each(cases)('%s has a positive case, legal counterexample, stable location and independent switch', (rule, bad, good) => {
    const before = JSON.stringify(bad);
    const rows = analyze([bad], [rule]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.rule === rule && row.location.targetId === 'a')).toBe(true);
    expect(rows.map(row => row.id)).toEqual(analyze([bad], [rule]).map(row => row.id));
    expect(analyze([good], [rule])).toEqual([]);
    expect(analyze([bad], [])).toEqual([]);
    expect(JSON.stringify(bad)).toBe(before);
});
test('every registered rule has independent positive and negative fixtures', () => {
    expect(cases.map(row => row[0]).sort()).toEqual(RULE_DEFINITIONS.map(row => row.id).sort());
});
test('inventory detects new or removed opcodes against the actual installed VM and blocks packages', () => {
    const actual = inventory(path.dirname(require.resolve('scratch-vm/package.json')),
        path.dirname(require.resolve('scratch-blocks/package.json')));
    expect(Object.keys(actual).sort()).toEqual(Object.keys(coverage).sort());
    expect(Object.values(coverage).every(entry => entry.category && entry.source)).toBe(true);
});
test('constants use Scratch casts, case-insensitive comparison, modulo and bounded expression expansion', () => {
    const blocks = target([literal('a', 'HELLO'), literal('b', 'hello'),
        block('eq', 'operator_equals', {inputs: {OPERAND1: input('a'), OPERAND2: input('b')}}),
        block('random', 'operator_random'), block('cycle', 'operator_not', {inputs: {OPERAND: input('cycle')}})]).blocks._blocks;
    const limit = jest.fn();
    const evaluator = createEvaluator(blocks, limit);
    expect(evaluator.evaluate('eq')).toBe(true);
    expect(evaluator.evaluate('random')).toBe(UNKNOWN);
    expect(evaluator.evaluate('cycle')).toBe(UNKNOWN);
    expect(limit).toHaveBeenCalled();
});
test('conditional sound waiting respects runtime options and includes reporter custom block bodies', () => {
    const a = target([...procedure('p', 'volume', {warp: 'true'}), block('volume', 'sound_setvolumeto')]);
    expect(analyze([a], ['warp-wait'], {runtimeOptions: {miscLimits: true}})).toHaveLength(1);
    expect(analyze([a], ['warp-wait'], {runtimeOptions: {miscLimits: false}})).toEqual([]);
});
test('dynamic references stay conservative while unknown extensions do not suppress known-reference checks', () => {
    const a = target([block('ref', 'looks_switchcostumeto', {inputs: {COSTUME: {block: 'dynamic', shadow: 'old'}}}),
        block('dynamic', 'operator_random'), literal('old', 'missing'), block('ext', 'thirdparty_run')],
    {variables: {v: {id: 'v', type: '', name: 'v'}}});
    const onCoverage = jest.fn();
    const rows = analyze([a], ['missing-costume', 'unused-resource', 'unused-data'], {onCoverage});
    expect(rows.map(row => row.message)).toEqual(['unused-data-partial', 'unused-resource-partial']);
    expect(onCoverage.mock.calls[0][0].limitations).toEqual(expect.arrayContaining(['dynamic-reference', 'unknown-opcode']));
});
test('duplicate procedures, malformed mutations and graph cycles terminate with localized diagnostics', () => {
    const a = target([...procedure('p', 'loop'), block('loop', 'control_if', {next: 'loop'}),
        block('other', 'procedures_definition', {inputs: {custom_block: input('proto-p')}}),
        ...procedure('bad', null, {argumentids: 'broken'})]);
    const rows = analyze([a], ['invalid-graph', 'invalid-procedure']);
    expect(rows.map(row => row.reason)).toEqual(expect.arrayContaining([
        'reason-invalid-graph-cycle', 'reason-invalid-procedure-duplicate', 'reason-invalid-procedure-signature'
    ]));
});
test('duplicate definitions retain both locations without calls and are scoped to their target', () => {
    const first = procedure('p', null);
    const second = [block('second-definition', 'procedures_definition', {
        inputs: {custom_block: input('second-prototype')}
    }), {...first[1], id: 'second-prototype'}];
    const rows = analyze([target([...first, ...second])], ['invalid-procedure']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({message: 'duplicate-procedure', values: {name: 'p'},
        location: {kind: 'block', targetId: 'a', blockId: 'def-p'},
        related: [{kind: 'block', targetId: 'a', blockId: 'second-definition'}]});
    expect(analyze([target(first), target(second, {id: 'b'})], ['invalid-procedure'])).toEqual([]);
});
test('defaults are legal, unknown IDs and mismatched reporter returns are diagnosed', () => {
    const def = procedure('p %s', null, {argumentids: '["arg"]', argumentnames: '["value"]', argumentdefaults: '[""]'});
    expect(analyze([target([...def, call('c', 'p %s')])], ['invalid-procedure'])).toEqual([]);
    const rows = analyze([target([...def, call('c', 'p %s', {mutation: {proccode: 'p %s', argumentids: '["other"]', return: '1'}})])],
        ['invalid-procedure', 'invalid-argument']);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.related[0].blockId === 'def-p %s')).toBe(true);
});
test('dynamic property target is diagnosed only if all possible targets lack the property', () => {
    const blocks = [block('of', 'sensing_of', {inputs: {OBJECT: input('random')}, fields: {PROPERTY: {value: 'score'}}}),
        block('random', 'operator_random')];
    const a = target(blocks);
    const b = target([], {id: 'b', getName: () => 'b', variables: {score: {id: 'score', name: 'score', type: ''}}});
    expect(analyze([a, b], ['invalid-property', 'unused-data'])).toEqual([]);
    expect(analyze([a], ['invalid-property'])).toHaveLength(1);
});
test('constant loops with possible exits are not described as nonterminating', () => {
    const a = target([block('loop', 'control_repeat_until', {inputs: {CONDITION: input('false'), SUBSTACK: input('exit')}}),
        literal('false', false), block('exit', 'control_stop', {fields: {STOP_OPTION: {value: 'this script'}}})]);
    expect(analyze([a], ['nonterminating-control'])).toEqual([]);
});
test('unknown addon callbacks do not block known-reference data checks', () => {
    const a = target([call('c', 'native')], {variables: {v: {id: 'v', name: 'v', type: ''}}});
    const rows = analyze([a], ['invalid-procedure', 'unused-data'], {addonBlocks: {native: {}}});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({rule: 'unused-data', message: 'unused-data-partial',
        reason: 'reason-partial-reference', location: {targetId: 'a', variableId: 'v'}});
});

test('component target, property capabilities and myself are checked without inferring dynamic values', () => {
    const blocks = [block('set', 'components_setTargetProperty', {inputs: {TARGET: input('target'), PROPERTY: input('prop')}}),
        literal('target', '_myself_'), literal('prop', 'value')];
    const a = target(blocks, {component: {type: 'slider'}});
    expect(analyze([a], ['invalid-component'])).toEqual([]);
    a.component.type = 'toggle';
    expect(analyze([a], ['invalid-component'])).toHaveLength(1);
    a.blocks._blocks.target = block('target', 'data_variable');
    expect(analyze([a], ['invalid-component'])).toEqual([]);
    a.blocks._blocks.target = literal('target', 'absent');
    expect(analyze([a], ['invalid-component'])).toHaveLength(1);
});
test('stage backdrops and numeric-looking names use different selector and event semantics', () => {
    const a = target([block('hat', 'event_whenbackdropswitchesto', {fields: {BACKDROP: {value: '1'}}}),
        ...reference('looks_switchbackdropto', 'BACKDROP', '1')], {isStage: true});
    const rows = analyze([a], ['missing-costume']);
    expect(rows.map(row => row.location.blockId)).toEqual(['hat']);
    a.sprite.costumes.push({name: '1'});
    expect(analyze([a], ['missing-costume'])).toEqual([]);
    a.blocks._blocks.value.fields.TEXT.value = 'next backdrop';
    expect(analyze([a], ['missing-costume'])).toEqual([]);
});
test('dynamic broadcasts and extension data access suppress unsupported absence claims', () => {
    const a = target([block('send', 'event_broadcast', {inputs: {BROADCAST_INPUT: input('dynamic')}}),
        block('dynamic', 'operator_random'), block('hat', 'event_whenbroadcastreceived',
            {fields: {BROADCAST_OPTION: {value: 'message'}}}), block('ext', 'custom_access')],
    {variables: {v: {id: 'v', name: 'v', type: ''}}});
    expect(analyze([a], ['broadcast-flow', 'unused-data', 'write-only-data'],
        {extensions: {custom_access: {dataAccess: 'dynamic'}}})).toEqual([]);
});
test('parameter names, legacy special reporters and missing signature metadata are distinct', () => {
    const a = target([...procedure('p', 'arg'), block('arg', 'argument_reporter_boolean', {fields: {VALUE: {value: 'oops'}}})]);
    expect(analyze([a], ['invalid-argument'])).toHaveLength(1);
    a.blocks._blocks.arg.fields.VALUE.value = 'is compiled?';
    expect(analyze([a], ['invalid-argument'])).toEqual([]);
    delete a.blocks._blocks['proto-p'].mutation.argumentnames;
    expect(analyze([a], ['invalid-procedure'])).toHaveLength(1);
    delete a.blocks._blocks['def-p'].inputs.custom_block;
    expect(analyze([a], ['invalid-procedure'])[0].reason).toBe('reason-invalid-procedure-definition');
});
test('inactive shadow subtrees are not inspected and broken parent references are isolated', () => {
    const a = target([block('move', 'motion_goto', {inputs: {TO: {block: 'valid', shadow: 'shadow'}}}),
        literal('valid', '_mouse_'), block('shadow', 'operator_join', {inputs: {STRING1: input('hidden')}}),
        call('hidden', 'missing'), block('orphan', 'motion_movesteps', {parent: 'absent'})]);
    const rows = analyze([a], ['invalid-procedure', 'invalid-graph']);
    expect(rows.map(row => row.location.blockId)).toEqual(['orphan']);
});
test('large expression budgets are explicit and cannot create a misleading missing-reference warning', () => {
    const blocks = [literal('last', '_mouse_')];
    let last = 'last';
    for (let i = 0; i < 80; i++) {
        blocks.push(block(`join${i}`, 'operator_join', {inputs: {STRING1: input(last), STRING2: input('empty')}}));
        last = `join${i}`;
    }
    blocks.push(literal('empty', ''), block('ref', 'motion_goto', {inputs: {TO: input(last)}}));
    const onCoverage = jest.fn();
    expect(analyze([target(blocks)], ['missing-target'], {onCoverage})).toEqual([]);
    expect(onCoverage.mock.calls[0][0].limitations).toContain('expression-limit');
});

test('object prototype names in unknown opcodes and math menus cannot invoke inherited functions', () => {
    const a = target([block('ref', 'motion_goto', {inputs: {TO: input('unknown')}}),
        block('unknown', 'constructor'), block('math', 'operator_mathop', {fields: {OPERATOR: {value: '__proto__'}},
            inputs: {NUM: input('n')}}), literal('n', 1)]);
    const onCoverage = jest.fn();
    expect(analyze([a], ['missing-target', 'numeric-result'], {onCoverage})).toEqual([]);
    expect(onCoverage.mock.calls[0][0].unknownOpcodes).toEqual(['constructor']);
});

test('a malformed operation cannot prevent other scripts from being checked', () => {
    const a = target([block('broken', null), ...reference('motion_goto', 'TO', 'Ghost')]);
    expect(analyze([a], ['invalid-graph', 'missing-target']).map(row => row.rule).sort())
        .toEqual(['invalid-graph', 'missing-target']);
});

test('component non-reporter PROPERTY menus are read from VM fields', () => {
    const a = target([block('set', 'components_setTargetProperty', {inputs: {TARGET: input('target')},
        fields: {PROPERTY: {value: 'step'}}}), literal('target', '_myself_')], {component: {type: 'progress'}});
    expect(analyze([a], ['invalid-component'])).toHaveLength(1);
    a.blocks._blocks.set.fields.PROPERTY.value = 'value';
    expect(analyze([a], ['invalid-component'])).toEqual([]);
});

test.each(['unknown', 'addon'])('%s blocks do not block other rules or cleanup suggestions', kind => {
    const opaque = kind === 'unknown' ? block('opaque', 'thirdparty_run') : call('opaque', 'native');
    const a = target([opaque, ...procedure('p', null),
        block('write', 'data_setvariableto', {fields: {VARIABLE: {id: 'w', value: 'written'}}}),
        block('goto', 'motion_goto', {inputs: {TO: input('missing')}}), literal('missing', 'absent')],
    {variables: {v: {id: 'v', name: 'unused', type: ''}, w: {id: 'w', name: 'written', type: ''}}});
    const rules = ['unused-data', 'write-only-data', 'unused-procedure', 'unused-resource', 'missing-target'];
    const onCoverage = jest.fn();
    const context = {addonBlocks: {native: {}}, onCoverage};
    const rows = analyze([a], rules, context);
    expect(new Set(rows.map(row => row.rule))).toEqual(new Set(rules));
    for (const row of rows.filter(item => item.severity === 'info')) {
        expect(row.message).toBe(`${row.rule}-partial`);
        expect(row.reason).toBe('reason-partial-reference');
        expect(row.location.targetId).toBe('a');
    }
    expect(rows.find(row => row.rule === 'missing-target').message).toBe('missing-target');
    expect(onCoverage.mock.calls[0][0].limitations).toContain(kind === 'unknown' ? 'unknown-opcode' : 'addon-block');
    expect(analyze([a], [], context)).toEqual([]);
});

test.each(['\u200B\u200Bbreakpoint\u200B\u200B', '\u200B\u200Blog\u200B\u200B %s',
    '\u200B\u200Bwarn\u200B\u200B %s', '\u200B\u200Berror\u200B\u200B %s'])(
    'registered bundled addon %s is known without obscuring unused data', code => {
        const a = target([call('debug', code)], {variables: {v: {id: 'v', name: 'spare', type: ''}}});
        const onCoverage = jest.fn();
        const callback = jest.fn();
        const rows = analyze([a], ['unused-data', 'invalid-procedure'], {
            addonBlocks: {[code]: {callback}}, onCoverage
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].message).toBe('unused-data');
        expect(onCoverage.mock.calls[0][0].limitations).toEqual([]);
        expect(callback).not.toHaveBeenCalled();
        expect(analyze([a], ['invalid-procedure'])).toHaveLength(1);
    }
);


test('specific causes have distinct titles without requiring the details panel', () => {
    const a = target([call('missing', 'absent'), block('return', 'procedures_return'),
        block('loop', 'control_repeat', {inputs: {TIMES: input('zero')}}), literal('zero', 0),
        block('receive', 'event_whenbroadcastreceived', {fields: {BROADCAST_OPTION: {value: 'hello'}}})]);
    const rows = analyze([a], ['invalid-procedure', 'invalid-argument', 'constant-control', 'broadcast-flow']);
    expect(rows.map(row => row.message)).toEqual(expect.arrayContaining([
        'invalid-procedure-missing', 'invalid-argument-outside', 'constant-control-repeat', 'broadcast-flow-sender'
    ]));
});
