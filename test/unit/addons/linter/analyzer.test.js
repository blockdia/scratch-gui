import {analyzeProject, WAIT_OPERATIONS} from '../../../../src/addons/addons/linter/analyzer';

const block = (id, opcode, extra = {}) => ({id, opcode, inputs: {}, fields: {}, next: null, ...extra});
const target = (id, blocks = [], variables = [], extra = {}) => ({id, isOriginal: true,
    getName: () => id, blocks: {_blocks: Object.fromEntries(blocks.map(b => [b.id, b]))},
    variables: Object.fromEntries(variables.map(v => [v.id, v])), ...extra});
const variable = (id, name = id, type = '') => ({id, name, type});
const analyze = (targets, monitors = [], rules) => {
    const iterator = analyzeProject(targets, monitors, rules);
    let next;
    do { next = iterator.next(); } while (!next.done);
    return next.value;
};
const reference = (name, opcode = 'motion_goto', input = 'TO') => [
    block('ref', opcode, {inputs: {[input]: {block: 'menu', shadow: 'menu'}}}),
    block('menu', 'text', {fields: {TEXT: {value: name}}})
];
const procedure = (code, warp, start) => [
    block(`def-${code}`, 'procedures_definition', {inputs: {custom_block: {block: `proto-${code}`}}, next: start}),
    block(`proto-${code}`, 'procedures_prototype', {mutation: {proccode: code, warp}})
];
const call = (id, code, next = null) => block(id, 'procedures_call', {mutation: {proccode: code}, next});

test('missing references use the owner location and update after deleting or renaming a sprite', () => {
    const owner = target('owner', reference('other'));
    const other = target('other');
    expect(analyze([owner, other])).toEqual([]);
    const first = analyze([owner])[0];
    expect(first).toMatchObject({severity: 'warning', type: 'reference', values: {name: 'other'},
        location: {targetId: 'owner', blockId: 'ref'}});
    other.getName = () => 'renamed';
    expect(analyze([owner, other])[0].id).toBe(first.id);
});

test.each([
    ['motion_goto', 'TO', '_mouse_'], ['motion_goto', 'TO', '_random_'],
    ['motion_glideto', 'TO', '_random_'], ['motion_pointtowards', 'TOWARDS', '_mouse_'],
    ['sensing_touchingobject', 'TOUCHINGOBJECTMENU', '_edge_'],
    ['sensing_distanceto', 'DISTANCETOMENU', '_mouse_'],
    ['control_create_clone_of', 'CLONE_OPTION', '_myself_'], ['sensing_of', 'OBJECT', '_stage_']
])('accepts only the relevant special target for %s', (opcode, input, special) => {
    expect(analyze([target('a', reference(special, opcode, input))])).toEqual([]);
    expect(analyze([target('a', reference('missing', opcode, input))])).toHaveLength(1);
});

test('skips dynamic references and overridden menu shadows', () => {
    const blocks = reference('deleted');
    blocks[0].inputs.TO.block = 'dynamic';
    blocks.push(block('dynamic', 'operator_join'));
    expect(analyze([target('a', blocks)])).toEqual([]);
    expect(analyze([target('a', reference('_edge_'))])).toHaveLength(1);
});

test('variable IDs respect scope, cross-sprite usage, loose blocks, writes and lists', () => {
    const stage = target('stage', [], [variable('g', 'same'), variable('unused')], {isStage: true});
    const a = target('a', [block('write', 'data_setvariableto', {fields: {VARIABLE: {id: 'g'}}}),
        block('loose', 'data_showlist', {fields: {LIST: {id: 'list'}}})],
    [variable('local', 'same'), variable('list', 'items', 'list')]);
    const result = analyze([stage, a]);
    expect(result.map(row => row.location.variableId).sort()).toEqual(['local', 'unused']);
});

test('visible monitors count, hidden monitors do not, clouds and broadcast variables are excluded', () => {
    const cloud = {...variable('cloud'), isCloud: true};
    const a = target('a', [], [variable('shown'), variable('hidden'), cloud, variable('event', 'event', 'broadcast_msg')]);
    expect(analyze([a], [{id: 'shown', targetId: 'a'}]).map(row => row.values.name)).toEqual(['hidden']);
});

test('static and dynamic property reads retain possible scalar variables only', () => {
    const blocks = reference('b', 'sensing_of', 'OBJECT');
    blocks[0].fields.PROPERTY = {value: 'score'};
    const a = target('a', blocks, [variable('a-score', 'score')]);
    const b = target('b', [], [variable('b-score', 'score'), variable('other'), variable('list', 'score', 'list')]);
    expect(analyze([a, b]).map(row => row.location.variableId)).toEqual(['a-score', 'list', 'other']);
    blocks[1].opcode = 'operator_join';
    expect(analyze([a, b]).map(row => row.location.variableId)).toEqual(['list', 'other']);
});

test.each([...WAIT_OPERATIONS])('reports known waiting operation %s in warp body', opcode => {
    const a = target('a', [...procedure('p', 'true', 'wait'), block('wait', opcode)]);
    expect(analyze([a], [], ['warp-wait'])).toMatchObject([{rule: 'warp-wait', location: {blockId: 'wait'}}]);
});

test('follows non-warp callees and recursive cycles to actual waits', () => {
    const a = target('a', [...procedure('a', true, 'call-b'), call('call-b', 'b'),
        ...procedure('b', false, 'call-c'), call('call-c', 'c'),
        ...procedure('c', 'false', 'call-b-again'), call('call-b-again', 'b', 'wait'), block('wait', 'control_wait')]);
    expect(analyze([a])).toMatchObject([{location: {blockId: 'call-b'}, related: [{blockId: 'wait'}]}]);
});

test('normal loops, recursive calls, unknown extensions and non-warp bodies do not independently warn', () => {
    const a = target('a', [...procedure('a', true, 'loop'), block('loop', 'control_forever', {
        inputs: {SUBSTACK: {block: 'recurse'}}, next: 'extension'}), call('recurse', 'a'),
    block('extension', 'unknown_extension'), ...procedure('b', 'false', 'wait'), block('wait', 'control_wait')]);
    expect(analyze([a])).toEqual([]);
});

test('rules can be disabled independently', () => {
    expect(analyze([target('a', reference('missing'), [variable('x')])], [], [])).toEqual([]);
});

test('checking does not modify blocks, variables or target data', () => {
    const a = target('a', [...reference('missing'), ...procedure('p', true, 'wait'),
        block('wait', 'control_wait')], [variable('spare')]);
    const before = JSON.stringify(a);
    analyze([a]);
    expect(JSON.stringify(a)).toBe(before);
});
