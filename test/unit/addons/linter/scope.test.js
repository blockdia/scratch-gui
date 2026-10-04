import {analyzeProject} from '../../../../src/addons/addons/linter/analyzer';
import en from '../../../../src/addons/blockdia-l10n/en.json';
import zh from '../../../../src/addons/blockdia-l10n/zh-cn.json';

const block = (id, opcode, extra = {}) => ({id, opcode, inputs: {}, fields: {}, next: null, ...extra});
const target = (name, blocks = [], extra = {}) => ({id: name,
    isOriginal: true,
    isStage: name === 'Stage',
    getName: () => name,
    variables: {},
    blocks: {_blocks: Object.fromEntries(blocks.map(item => [item.id, item]))},
    ...extra});
const reference = (opcode, key, value, menu = 'text') => [
    block('operation', opcode, {inputs: {[key]: {block: 'menu', shadow: 'menu'}}}),
    block('menu', menu, {parent: 'operation', shadow: true, fields: {[key]: {value}}})
];
const scopeRules = ['invalid-scope', 'invalid-container', 'missing-target', 'invalid-component', 'invalid-argument'];
const run = (targets, rules = scopeRules, context = {}) => {
    let coverage;
    const iterator = analyzeProject(targets, [], rules, {containers: [],
        ...context,
        onCoverage: value => {
            coverage = value;
        }});
    let next;
    do {
        next = iterator.next();
    } while (!next.done);
    for (const row of next.value) {
        for (const messages of [en, zh]) {
            expect(messages[`linter/${row.message}`]).toBeDefined();
            expect(messages[`linter/${row.reason}`]).toBeDefined();
        }
    }
    return {rows: next.value, coverage};
};

test.each([
    'motion_movesteps', 'motion_goto', 'motion_gotoxy', 'motion_turnright', 'motion_turnleft',
    'motion_pointindirection', 'motion_pointtowards', 'motion_glidesecstoxy', 'motion_glideto',
    'motion_ifonedgebounce', 'motion_setrotationstyle', 'motion_changexby', 'motion_setx',
    'motion_changeyby', 'motion_sety', 'motion_xposition', 'motion_yposition', 'motion_direction',
    'looks_show', 'looks_hide', 'looks_changesizeby', 'looks_setsizeto', 'looks_size',
    'looks_gotofrontback', 'looks_goforwardbackwardlayers', 'sensing_setdragmode', 'sensing_distanceto',
    'control_start_as_clone', 'control_delete_this_clone', 'containers_setWorldProperty', 'containers_deleteClone',
    'pen_stamp', 'pen_penDown', 'pen_penUp', 'pen_setPenColorToColor', 'pen_changePenColorParamBy',
    'pen_setPenColorParamTo', 'pen_changePenSizeBy', 'pen_setPenSizeTo', 'pen_setPenHueToNumber',
    'pen_changePenHueBy', 'pen_setPenShadeToNumber', 'pen_changePenShadeBy'
])('%s requires a sprite but does not require the scanned original to be a clone', opcode => {
    const blocks = [block('op', opcode)];
    const stage = target('Stage', blocks);
    const rows = run([stage], ['invalid-scope']).rows;
    expect(rows).toMatchObject([{reason: 'reason-invalid-scope-sprite', location: {targetId: 'Stage', blockId: 'op'}}]);
    expect(run([target('Cat', blocks)], ['invalid-scope']).rows).toEqual([]);
    expect(run([stage], []).rows).toEqual([]);
    expect(run([stage], ['invalid-scope']).rows[0].id).toBe(rows[0].id);
});

test.each(['pen_clear', 'looks_switchbackdroptoandwait', 'looks_switchbackdropto', 'looks_nextbackdrop',
    'looks_backdropnumbername', 'looks_seteffectto', 'sound_play', 'event_broadcast',
    'sensing_askandwait', 'sensing_of', 'event_whenstageclicked', 'event_whenthisspriteclicked',
    'looks_switchcostumeto', 'looks_costumenumbername', 'looks_say', 'sensing_touchingcolor'])(
    'VM-supported cross-target operation %s remains legal', opcode => {
        for (const name of ['Stage', 'Cat']) {
            expect(run([target(name, [block('op', opcode)])], ['invalid-scope']).rows).toEqual([]);
        }
    }
);

test.each([
    ['control_create_clone_of', 'CLONE_OPTION', 'control_create_clone_of_menu'],
    ['containers_worldProperty', 'TARGET', 'containers_menu_sprites']
])('%s distinguishes myself, a named sprite, a missing sprite and a dynamic selection', (opcode, key, menu) => {
    const make = value => reference(opcode, key, value, menu);
    expect(run([target('Stage', make('_myself_'))]).rows).toMatchObject([{reason: 'reason-invalid-scope-self'}]);
    expect(run([target('Cat', make('_myself_'))]).rows).toEqual([]);
    expect(run([target('Stage', make('Cat')), target('Cat')]).rows).toEqual([]);
    expect(run([target('Stage', make('Ghost'))]).rows).toMatchObject([{rule: 'missing-target'}]);
    const dynamic = make('_myself_');
    dynamic[1] = block('menu', 'sensing_answer');
    const result = run([target('Stage', dynamic)]);
    expect(result.rows).toEqual([]);
    expect(result.coverage.limitations).toContain('dynamic-reference');
});

test.each(['property', 'setProperty', 'changeProperty', 'goToXY', 'setRotationStyle', 'effect', 'setEffect',
    'changeEffect', 'clearEffects', 'show', 'hide', 'isVisible', 'goToLayer', 'moveLayers',
    'createClone', 'deleteClone'])(
    'containers_%s checks menu shadows, definitions and membership', operation => {
        const blocks = value => reference(`containers_${operation}`, 'CONTAINER', value, 'containers_menu_containers');
        const context = {containers: [{path: 'Group'}, {path: 'Group//Nested'}]};
        const owner = value => target('Group//Nested//Cat', blocks(value));
        expect(run([owner('Missing')], ['invalid-container'], context).rows)
            .toMatchObject([{reason: 'reason-invalid-container-missing', values: {name: 'Missing'}}]);
        for (const value of ['_mycontainer_', 'Group', 'Group//Nested']) {
            expect(run([owner(value)], ['invalid-container'], context).rows).toEqual([]);
        }
        expect(run([target('Loose', blocks('_mycontainer_'))], ['invalid-container'], context).rows)
            .toMatchObject([{reason: 'reason-invalid-container-self'}]);
        // A folder is not a container until its definition exists.
        expect(run([owner('_mycontainer_')], ['invalid-container']).rows)
            .toMatchObject([{reason: 'reason-invalid-container-self'}]);
        const dynamic = blocks('Missing');
        dynamic[1] = block('menu', 'sensing_answer');
        const result = run([target('Cat', dynamic)], ['invalid-container'], context);
        expect(result.rows).toEqual([]);
        expect(result.coverage.limitations).toContain('dynamic-reference');
        expect(run([owner('Missing')], [], context).rows).toEqual([]);
    }
);

test('stage can operate on named containers but cannot select its containing container or delete clones', () => {
    const context = {containers: [{path: 'Group'}]};
    const blocks = (opcode, name) => reference(opcode, 'CONTAINER', name, 'containers_menu_containers');
    expect(run([target('Stage', blocks('containers_createClone', 'Group'))], scopeRules, context).rows).toEqual([]);
    expect(run([target('Stage', blocks('containers_hide', '_mycontainer_'))], scopeRules, context).rows)
        .toMatchObject([{reason: 'reason-invalid-container-self'}]);
    expect(run([target('Stage', blocks('containers_deleteClone', '_mycontainer_'))], scopeRules, context).rows)
        .toMatchObject([{rule: 'invalid-scope'}]);
    expect(run([target('Stage', blocks('containers_deleteClone', '_mycontainer_'))],
        ['invalid-container'], context).rows).toMatchObject([{reason: 'reason-invalid-container-self'}]);
});

test('container clone deletion only accepts own ancestry without assuming a clone currently exists', () => {
    const context = {containers: [{path: 'A'}, {path: 'B'}, {path: 'A//Child'}]};
    const make = name => target('A//Child//Cat', reference('containers_deleteClone', 'CONTAINER', name));
    expect(run([make('B')], scopeRules, context).rows).toMatchObject([{reason: 'reason-invalid-container-ancestry'}]);
    for (const name of ['A', 'A//Child', '_mycontainer_']) {
        expect(run([make(name)], scopeRules, context).rows).toEqual([]);
    }
});

test('omitted container metadata reports limited coverage rather than inventing missing definitions', () => {
    const result = run([target('Cat', reference('containers_hide', 'CONTAINER', 'A'))], scopeRules,
        {containers: null});
    expect(result.rows).toEqual([]);
    expect(result.coverage.limitations).toContain('container-metadata');
});

test.each([['components_whenClicked', 'button'], ['components_whenStateChanged', 'toggle']])(
    '%s checks component load errors as well as type', (opcode, type) => {
        const blocks = [block('hat', opcode)];
        expect(run([target('Widget', blocks, {component: {type}})]).rows).toEqual([]);
        expect(run([target('Widget', blocks, {component: {type}, componentError: 'missing costume'})]).rows)
            .toMatchObject([{rule: 'invalid-component'}]);
        expect(run([target('Widget', blocks, {component: {type: 'slider'}})]).rows)
            .toMatchObject([{rule: 'invalid-component'}]);
        expect(run([target('Stage', blocks)]).rows).toMatchObject([{rule: 'invalid-component'}]);
    }
);

test('stage can address a named component, while myself on stage remains invalid', () => {
    const blocks = name => reference('components_targetIsChecked', 'TARGET', name, 'components_menu_toggleTargets');
    const toggle = target('Toggle', [], {component: {type: 'toggle'}});
    expect(run([target('Stage', blocks('Toggle')), toggle]).rows).toEqual([]);
    expect(run([target('Stage', blocks('_myself_')), toggle]).rows).toMatchObject([{rule: 'invalid-component'}]);
});

test.each(['argument_reporter_string_number', 'argument_reporter_boolean'])(
    '%s outside a custom block warns, while bodies and prototype shadows remain legal', opcode => {
        const arg = block('arg', opcode, {fields: {VALUE: {value: 'value'}}});
        const event = [block('hat', 'event_whenflagclicked', {next: 'say'}),
            block('say', 'looks_say', {inputs: {MESSAGE: {block: 'arg'}}}), arg];
        expect(run([target('Cat', event)]).rows).toMatchObject([{reason: 'reason-invalid-argument-parameter-outside'}]);
        const definition = block('def', 'procedures_definition', {
            inputs: {custom_block: {block: 'proto'}}, next: 'say'
        });
        const proto = block('proto', 'procedures_prototype', {inputs: {value: {block: 'signature'}},
            mutation: {
                proccode: 'p %s',
                warp: 'false',
                argumentids: '["value"]',
                argumentnames: '["value"]',
                argumentdefaults: '[""]'
            }});
        const signature = {...arg, id: 'signature', parent: 'proto', shadow: true};
        expect(run([target('Cat', [definition, proto, signature, event[1], arg])]).rows).toEqual([]);
    }
);

test.each([['argument_reporter_string_number', 'last key pressed'], ['argument_reporter_boolean', 'is compiled?'],
    ['argument_reporter_boolean', 'is turbowarp?']])('legacy %s %s is legal outside definitions', (opcode, value) => {
    expect(run([target('Cat', [block('arg', opcode, {fields: {VALUE: {value}}})])]).rows).toEqual([]);
});

test('trusted external descriptors can declare a stage-only operation', () => {
    const context = {extensions: {custom_stage: {targetTypes: ['stage']}}};
    const blocks = [block('op', 'custom_stage')];
    expect(run([target('Cat', blocks)], ['invalid-scope'], context).rows)
        .toMatchObject([{reason: 'reason-invalid-scope-stage'}]);
    expect(run([target('Stage', blocks)], ['invalid-scope'], context).rows).toEqual([]);
});
