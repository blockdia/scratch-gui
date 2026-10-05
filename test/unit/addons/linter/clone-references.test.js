import {analyzeProject} from '../../../../src/addons/addons/linter/analyzer';
import {createEvaluator, UNKNOWN} from '../../../../src/addons/addons/linter/constants';
import TargetReferences from 'scratch-vm/src/engine/target-references';
import SpriteContainers from 'scratch-vm/src/engine/sprite-containers';
import Clones from 'scratch-vm/src/extensions/scratch3_clones';
import Containers from 'scratch-vm/src/extensions/scratch3_containers';
import VM from 'scratch-vm';
import en from '../../../../src/addons/blockdia-l10n/en.json';
import zh from '../../../../src/addons/blockdia-l10n/zh-cn.json';

const block = (id, opcode, extra = {}) => ({id, opcode, inputs: {}, fields: {}, next: null, ...extra});
const operation = (opcode, values, menu = 'text') => [
    block('op', opcode, {inputs: Object.fromEntries(Object.keys(values).map(key =>
        [key, {block: key, shadow: key}]))}),
    ...Object.entries(values).map(([key, value]) => block(key, menu,
        {parent: 'op', shadow: true, fields: {[menu === 'text' ? 'TEXT' : 'VALUE']: {value}}}))
];
const target = (name, blocks = [], extra = {}) => ({id: name,
    getName: () => name,
    isOriginal: true,
    isStage: name === 'Stage',
    variables: {},
    blocks: {_blocks: Object.fromEntries(blocks.map(item => [item.id, item]))},
    ...extra});
const run = (targets, rules = ['missing-target', 'invalid-scope', 'invalid-container', 'invalid-clone-id'],
    context = {}) => {
    let coverage;
    const iterator = analyzeProject(targets, [], rules, {...context,
        onCoverage: value => {
            coverage = value;
        }});
    let next;
    do {
        next = iterator.next();
    } while (!next.done);
    for (const row of next.value) {
        for (const messages of [en, zh]) {
            expect(messages[`linter/${row.message}`]).toBeTruthy();
            expect(messages[`linter/${row.reason}`]).toBeTruthy();
        }
    }
    return {rows: next.value, coverage};
};

test.each(['clones_createWithId', 'containers_createWithId'])(
    '%s validates custom suffixes against VM allocation semantics and supports disabling the rule', opcode => {
        for (const id of ['123', '001', 2, ' boss', 'boss ', '  ', '\t\n', '@clone:boss', '@sprite:Cat',
            '@container:Group', '@container-clone:boss', '', 'boss', 'boss 2', '0boss', '-1', '中文']) {
            const registry = new TargetReferences();
            const accepted = opcode === 'clones_createWithId' ? registry.register({isOriginal: false}, id) :
                Boolean(SpriteContainers.prototype._reserveCloneReference.call(
                    {cloneReferences: new Map(), nextCloneId: 1}, id));
            const blocks = operation(opcode, {ID: id});
            const owner = target('Cat', blocks);
            const before = JSON.stringify(owner);
            const {rows} = run([owner], ['invalid-clone-id']);
            expect(rows.length === 0).toBe(accepted);
            if (!accepted) {
                expect(rows).toMatchObject([{reason: 'reason-invalid-clone-id-suffix',
                    location: {targetId: 'Cat', blockId: 'op'}}]);
                expect(run([owner], ['invalid-clone-id']).rows[0].id).toBe(rows[0].id);
            }
            expect(run([owner], []).rows).toEqual([]);
            expect(JSON.stringify(owner)).toBe(before);
        }
    }
);

test.each([
    ['clones_delete', '@clone:', '@container-clone:boss'],
    ['containers_deleteById', '@container-clone:', '@clone:boss']
])('%s requires the matching full ID but never assumes a clone is absent', (opcode, prefix, wrong) => {
    for (const value of ['', 'boss', '@sprite:Cat', '@container:Group', prefix, `${prefix} boss`, wrong]) {
        expect(run([target('Stage', operation(opcode, {ID: value}))]).rows)
            .toMatchObject([{rule: 'invalid-clone-id', reason: 'reason-invalid-clone-id-reference'}]);
    }
    for (const value of [`${prefix}boss`, `${prefix}1`]) {
        const result = run([target('Stage', operation(opcode, {ID: value}))]);
        expect(result.rows).toEqual([]);
        expect(result.coverage.limitations).toContain('runtime-clone');
    }
});

test.each(['clones_menu_targets', 'clones_menu_originalTargets'])(
    '%s participates in target checks and respects the stage myself distinction', menu => {
        const opcode = menu === 'clones_menu_targets' ? 'clones_createWithId' : 'clones_targetId';
        const make = value => operation(opcode, {TARGET: value}, menu);
        const rules = ['missing-target', 'invalid-scope'];
        expect(run([target('Stage', make('Missing'))], rules).rows).toMatchObject([{rule: 'missing-target'}]);
        expect(run([target('Stage', make('@sprite:Cat')), target('Cat')], rules).rows).toEqual([]);
        expect(run([target('Cat', make('_myself_'))], rules).rows).toEqual([]);
        expect(run([target('Stage', make('_myself_'))], rules).rows.map(row => row.rule))
            .toEqual(opcode === 'clones_createWithId' ? ['invalid-scope'] : []);
    }
);

test.each([
    ['motion_goto', 'TO'], ['motion_glideto', 'TO'], ['motion_pointtowards', 'TOWARDS'],
    ['sensing_touchingobject', 'TOUCHINGOBJECTMENU'], ['sensing_distanceto', 'DISTANCETOMENU'],
    ['control_create_clone_of', 'CLONE_OPTION'], ['sensing_of', 'OBJECT'],
    ['containers_targetProperty', 'TARGET'], ['clones_createWithId', 'TARGET'], ['clones_targetId', 'TARGET']
])('%s resolves public originals and treats clones as runtime selections', (opcode, key) => {
    const scan = value => run([target('Cat', operation(opcode, {[key]: value}))], ['missing-target']);
    expect(scan('@sprite:Cat').rows).toEqual([]);
    for (const value of ['@sprite:Absent', '@container:Cat', '@container-clone:boss', '@clone:']) {
        expect(scan(value).rows).toMatchObject([{rule: 'missing-target'}]);
    }
    expect(scan('@clone:boss').rows).toEqual([]);
    expect(scan('@clone:boss').coverage.limitations).toContain('runtime-clone');
});

test.each(['containers_id', 'containers_originalId', 'containers_parentId', 'containers_createWithId',
    'containers_hide', 'containers_createClone'])(
    '%s checks original container IDs, relative membership and wrong namespaces', opcode => {
        const scan = (value, name = 'Group//Cat', context = {containers: [{path: 'Group'}]}) =>
            run([target(name, operation(opcode, {CONTAINER: value}))], ['invalid-container'], context);
        for (const value of ['Group', '@container:Group', '_mycontainer_']) expect(scan(value).rows).toEqual([]);
        for (const value of ['@container:Missing', '@clone:boss', '@sprite:Cat', '@container-clone:']) {
            expect(scan(value).rows).toMatchObject([{rule: 'invalid-container'}]);
        }
        expect(scan('_mycontainer_', 'Stage').rows).toMatchObject([{reason: 'reason-invalid-container-self'}]);
        expect(scan('@container-clone:boss').rows).toEqual([]);
        expect(scan('@container-clone:boss').coverage.limitations).toContain('runtime-clone');
        expect(scan('@container:Group', 'Stage', {}).coverage.limitations).toContain('container-metadata');
    }
);

test('public container IDs never become the relative self sentinel or an ancestry-only delete path', () => {
    const context = {containers: [{path: 'Group'}, {path: '_mycontainer_'}]};
    expect(run([target('Stage', operation('containers_id', {CONTAINER: '@container:_mycontainer_'}))],
        ['invalid-container'], context).rows).toEqual([]);
    expect(run([target('Group//Cat', operation('containers_deleteClone', {CONTAINER: '@container:Group'}))],
        ['invalid-container'], context).rows).toMatchObject([{reason: 'reason-invalid-container-ancestry'}]);
});

test.each([['clones_cloneId', Clones, '@clone:'], ['containers_cloneId', Containers, '@container-clone:']])(
    '%s folds strings like the VM without allocating instances or validating the constructor input',
    (opcode, Extension, prefix) => {
        for (const value of ['', 1, 'boss', ' boss ', '@clone:boss']) {
            const blocks = operation(opcode, {ID: value});
            const evaluator = createEvaluator(Object.fromEntries(blocks.map(item => [item.id, item])));
            expect(evaluator.evaluate('op')).toBe(Extension.prototype.cloneId({ID: value}));
            expect(evaluator.evaluate('op')).toBe(`${prefix}${value}`);
        }
        const dynamic = operation(opcode, {ID: 'boss'});
        dynamic[1] = block('ID', 'sensing_answer');
        expect(createEvaluator(Object.fromEntries(dynamic.map(item => [item.id, item]))).evaluate('op')).toBe(UNKNOWN);
    }
);

test('folded constructors are checked by their consumer; runtime predicates never report missing clones', () => {
    const blocks = [block('delete', 'containers_deleteById', {inputs: {ID: {block: 'op'}}}),
        ...operation('clones_cloneId', {ID: 'boss'})];
    expect(run([target('Cat', blocks)]).rows).toMatchObject([{rule: 'invalid-clone-id'}]);
    for (const opcode of ['clones_exists', 'containers_exists', 'clones_id', 'clones_isClone',
        'clones_lastId', 'containers_lastId']) {
        const result = run([target('Stage', operation(opcode, {ID: '@clone:absent'}))]);
        expect(result.rows).toEqual([]);
        expect(result.coverage.limitations).toContain('runtime-clone');
    }
});

test('public property reads retain variable uses and validate originals without guessing clone ownership', () => {
    const scan = (reference, property) => {
        const blocks = operation('sensing_of', {OBJECT: reference});
        blocks[0].fields.PROPERTY = {value: property};
        return run([target('Reader', blocks), target('Cat', [], {
            variables: {health: {id: 'health', name: 'health', type: ''}}})], ['invalid-property', 'unused-data']);
    };
    expect(scan('@sprite:Cat', 'health').rows).toEqual([]);
    expect(scan('@clone:boss', 'health').rows).toEqual([]);
    expect(scan('@sprite:Cat', 'absent').rows).toEqual(expect.arrayContaining([
        expect.objectContaining({rule: 'invalid-property'})]));
    expect(scan('@clone:boss', 'absent').rows.filter(row => row.rule === 'invalid-property')).toEqual([]);
});

test('component operations resolve public originals and leave clone component types unknown', () => {
    const scan = (value, property = 'value') => run([
        target('Reader', operation('components_targetProperty', {TARGET: value, PROPERTY: property})),
        target('Slider', [], {component: {type: 'slider'}})
    ], ['invalid-component']);
    expect(scan('@sprite:Slider').rows).toEqual([]);
    expect(scan('@sprite:Missing').rows).toMatchObject([{rule: 'invalid-component'}]);
    expect(scan('@sprite:Slider', 'absent').rows).toMatchObject([{rule: 'invalid-component'}]);
    expect(scan('@clone:boss').rows).toEqual([]);
    expect(scan('@clone:boss').coverage.limitations).toContain('runtime-clone');
});

test.each(['clones_createWithId', 'containers_createWithId', 'clones_delete', 'containers_deleteById'])(
    '%s leaves computed IDs unknown and reports the limit', opcode => {
        const blocks = operation(opcode, {ID: 'boss'});
        blocks[1] = block('ID', 'sensing_answer');
        const result = run([target('Cat', blocks)], ['invalid-clone-id']);
        expect(result.rows).toEqual([]);
        expect(result.coverage.limitations).toContain('dynamic-reference');
    }
);

test('real VM project scans report invalid IDs without executing clone creation or changing saved state', async () => {
    const vm = new VM();
    try {
        await vm.loadProject({targets: ['Stage', 'Cat'].map(name => ({isStage: name === 'Stage',
            name,
            variables: {},
            lists: {},
            broadcasts: {},
            comments: {},
            costumes: [],
            sounds: [],
            blocks: {}})),
        monitors: [],
        extensions: [],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: 'test'}});
        const cat = vm.runtime.targets.find(item => !item.isStage);
        for (const item of operation('clones_createWithId', {TARGET: '@sprite:Cat', ID: '123'})) {
            cat.blocks.createBlock({...item, topLevel: item.id === 'op'});
        }
        const before = vm.toJSON();
        const nextId = vm.runtime.targetReferences.nextCloneId;
        const result = run(vm.runtime.targets);
        expect(result.rows).toMatchObject([{rule: 'invalid-clone-id', location: {blockId: 'op'}}]);
        expect(vm.toJSON()).toBe(before);
        expect(vm.runtime.targets).toHaveLength(2);
        expect(vm.runtime.targetReferences.nextCloneId).toBe(nextId);
        cat.blocks._blocks.ID.fields.TEXT.value = 'boss';
        expect(run(vm.runtime.targets).rows).toEqual([]);
    } finally {
        vm.quit();
    }
});

test.each(['clones_delete', 'containers_deleteById'])(
    '%s may delete the executing clone and must not create a false infinite-loop diagnostic', opcode => {
        const blocks = [block('loop', 'control_repeat_until', {inputs: {CONDITION: {block: 'condition'},
            SUBSTACK: {block: 'op'}}}),
        block('condition', 'operator_boolean', {fields: {VALUE: {value: false}}}),
        ...operation(opcode, {ID: opcode === 'clones_delete' ? '@clone:boss' : '@container-clone:boss'})];
        expect(run([target('Cat', blocks)], ['nonterminating-control']).rows).toEqual([]);
        blocks[2].opcode = 'looks_show';
        expect(run([target('Cat', blocks)], ['nonterminating-control']).rows)
            .toMatchObject([{rule: 'nonterminating-control'}]);
    }
);
