import {parseQuery, filterResults, sortCommands} from '../../../src/lib/command-palette/search';
import {targetResults, symbolResults, referencesFor, commandResults} from '../../../src/lib/command-palette/providers';
import {ActionRegistry, STORAGE_KEY} from '../../../src/lib/editor-actions/registry';
import AddonActions from '../../../src/addons/action-registry';
import {loadAddonMessages, namespaceAddonMessages} from '../../../src/addons/translations';
import paletteMessages from '../../../src/lib/command-palette/messages';

const t = key => key;
const target = (id, blocks = {}, variables = {}, extra = {}) => ({id, isOriginal: true, variables,
    getName: () => id, sprite: {costumes: [], sounds: []},
    blocks: {_blocks: blocks, getBlock: key => blocks[key]}, ...extra});
const block = (id, opcode, fields = {}, extra = {}) => ({id, opcode, fields, ...extra});
const vmFor = targets => ({runtime: {targets}, editingTarget: targets[0]});

test.each([
    ['> baocun', '保存项目'], ['> BCXM', '保存项目'], ['> bao cun', '保存项目'],
    ['xiaomao', '小猫'], ['xm', '小猫'], ['@v fs', '分数'],
    ['@c chongfuzhixing', '重复执行'], ['@ wdbl', '我的變量'],
    ['> lvqi', '绿旗'], ['@ ydabc', '移动ABC']
])('palette search supports pinyin and initials: %s', (input, label) => {
    const item = {label};
    expect(filterResults([item, {label: 'other'}], parseQuery(input).query)).toEqual([item]);
});

test('pinyin ranks after literal matches, before initials, and preserves stable ties', () => {
    const items = ['牙医', '衣服', 'yi', '衣', '依'].map(label => ({label}));
    expect(filterResults(items, 'yi').map(item => item.label)).toEqual(['yi', '衣', '依', '衣服', '牙医']);
    expect(filterResults(items, '')).toEqual(items);
    expect(filterResults(items, 'zzzz')).toEqual([]);
});

test('prefixes, Chinese matching, exact/prefix/substring/subsequence priority and stable ties', () => {
    expect(parseQuery('> 保存 ')).toEqual({mode: 'commands', query: '保存'});
    expect(parseQuery('@计分')).toEqual({mode: 'symbols', query: '计分'});
    expect(parseQuery('猫')).toEqual({mode: 'targets', query: '猫'});
    expect(parseQuery('@v ')).toEqual({mode: 'symbols', kind: 'variable', query: ''});
    expect(parseQuery('@V  计分 ')).toEqual({mode: 'symbols', kind: 'variable', query: '计分'});
    expect(parseQuery('@v')).toEqual({mode: 'symbols', query: 'v'});
    expect(parseQuery('@ v 1')).toEqual({mode: 'symbols', query: 'v 1'});
    expect(parseQuery('@x test')).toEqual({mode: 'symbols', query: 'x test'});
    expect(['l', 'c', 'e', 'b'].map(code => parseQuery(`@${code} `).kind))
        .toEqual(['list', 'procedure', 'event', 'broadcast']);
    expect(parseQuery('@p test')).toEqual({mode: 'symbols', query: 'p test'});
    expect(parseQuery('@s pop')).toEqual({mode: 'symbols', query: 's pop'});
    const items = ['复位分数', '分数1', '计分数', '分数', '分数2', '分开计算数值', '其他'].map(label => ({label}));
    expect(filterResults(items, '分数').map(item => item.label))
        .toEqual(['分数', '分数1', '分数2', '计分数', '复位分数', '分开计算数值']);
    expect(filterResults([{label: 'Sprite'}], 'sprite')).toHaveLength(1);
});

test('target provider includes stage and components but excludes clones', () => {
    const vm = vmFor([target('Stage', {}, {}, {isStage: true}), target('Sprite'),
        target('Slider', {}, {}, {component: {type: 'slider'}}), target('clone', {}, {}, {isOriginal: false})]);
    expect(targetResults(vm, t).map(item => item.kind)).toEqual(['stage', 'sprite', 'component']);
    expect(targetResults(vm, t)[2].detail).toBe('component');
});

test('variable references distinguish same names by ID and stay in the original target', () => {
    const a = target('a', {local: block('local', 'data_variable', {VARIABLE: {id: 'local'}}),
        global: block('global', 'data_variable', {VARIABLE: {id: 'global'}})},
    {local: {id: 'local', name: 'score', type: ''}});
    const stage = target('stage', {}, {global: {id: 'global', name: 'score', type: ''}}, {isStage: true});
    const b = target('b', {other: block('other', 'data_variable', {VARIABLE: {id: 'global'}})});
    const vm = vmFor([a, b, stage]);
    const rows = symbolResults(vm, 'a', 0, null, t);
    expect(rows).toHaveLength(2);
    expect(referencesFor(vm, rows[0]).map(ref => ref.blockId)).toEqual(['local']);
    expect(referencesFor(vm, rows[1]).map(ref => ref.blockId)).toEqual(['global']);
});

test('procedures match signature inside one target, with definition first', () => {
    const blocks = {call: block('call', 'procedures_call', {}, {mutation: {proccode: 'test %s'}}),
        def: block('def', 'procedures_definition', {}, {inputs: {custom_block: {block: 'proto'}}}),
        proto: block('proto', 'procedures_prototype', {}, {mutation: {proccode: 'test %s'}})};
    const vm = vmFor([target('a', blocks), target('b', blocks)]);
    const row = symbolResults(vm, 'a', 0, null, t)[0];
    expect(referencesFor(vm, row).map(ref => [ref.targetId, ref.blockId]))
        .toEqual([['a', 'def'], ['a', 'call']]);
});

test('broadcasts span originals, ignore clones, retain the query target after switching', () => {
    const receive = id => block(id, 'event_whenbroadcastreceived', {BROADCAST_OPTION: {value: 'hello'}});
    const vm = vmFor([target('a', {a1: receive('a1')}), target('b', {b1: receive('b1')}),
        target('clone', {c1: receive('c1')}, {}, {isOriginal: false})]);
    const row = symbolResults(vm, 'a', 0, null, t)[0];
    vm.editingTarget = vm.runtime.targets[1];
    expect(referencesFor(vm, row).map(ref => ref.targetId)).toEqual(['a', 'b']);
    vm.runtime.targets.splice(1, 1);
    expect(referencesFor(vm, row)).toHaveLength(1);
});

test('event labels use the localized green flag name instead of the image alt text', async () => {
    const flag = block('flag', 'event_whenflagclicked', {}, {topLevel: true});
    const sprite = target('a', {flag});
    const vm = vmFor([sprite]);
    const image = {getValue: () => '/media/green-flag.svg', getText: () => 'flag'};
    const words = text => ({getText: () => text});
    const workspace = {getBlockById: () => ({inputList: [{fieldRow: [words('当'), image, words('被点击')]}]})};
    const translations = namespaceAddonMessages(await loadAddonMessages('zh-CN'));
    const localize = key => key === 'greenFlag' ? translations[paletteMessages.greenFlag.id] : key;
    const row = symbolResults(vm, 'a', 0, workspace, localize)[0];
    expect(row.label).toBe('当 旗 被点击');
    expect(filterResults([row], '旗')).toEqual([row]);
    expect(filterResults([row], 'flag')).toEqual([]);
});

test('resource provider uses stable asset identity and tab context', () => {
    const vm = vmFor([target('a', {}, {}, {sprite: {costumes: [{name: 'costume', assetId: 'c'}],
        sounds: [{name: 'sound', assetId: 's'}]}})]);
    expect(symbolResults(vm, 'a', 1, null, t)[0]).toMatchObject({kind: 'costume', assetId: 'c'});
    expect(symbolResults(vm, 'a', 2, null, t)[0]).toMatchObject({kind: 'sound', assetId: 's'});
    expect(symbolResults(vm, 'missing', 2, null, t)).toEqual([]);
});

test('command discovery retains unavailable commands, excludes internal commands and tracks addon lifecycle', () => {
    const registry = new ActionRegistry();
    registry.registerAction({id: 'builtin/hidden', internal: true, run: jest.fn()});
    registry.registerAction({id: 'builtin/paint', title: 'paint', scopes: ['costumes'], run: jest.fn()});
    const addon = new AddonActions('example', () => true, registry);
    addon.register({id: 'test', title: 'test', scopes: ['blocks'], run: jest.fn()});
    const read = () => commandResults(registry, {area: 'blocks'}, {formatMessage: value => value.id}, t);
    expect(read().map(item => [item.id, item.available]))
        .toEqual([['builtin/paint', false], ['addon/example/test', true]]);
    addon.setEnabled(false);
    expect(read()).toHaveLength(1);
    addon.setEnabled(true);
    expect(read()).toHaveLength(2);
});

test('migration preserves explicit unbindings, prefers new IDs and permanently removes old IDs', () => {
    let saved = JSON.stringify({version: 1, overrides: {'addon/find-bar/find': [],
        'addon/find-bar/back': ['Mod+b'], 'addon/find-bar/forward': ['Mod+j'],
        'builtin/navigate-forward': ['Mod+k']}});
    const storage = {getItem: () => saved, setItem: (key, value) => {
        expect(key).toBe(STORAGE_KEY);
        saved = value;
    }};
    const registry = new ActionRegistry({storage});
    expect(registry.overrides).toEqual({'builtin/find-symbol': [], 'builtin/navigate-back': ['Mod+b'],
        'builtin/navigate-forward': ['Mod+k']});
    expect(saved).not.toContain('addon/find-bar/');
    expect(new ActionRegistry({storage}).overrides).toEqual(registry.overrides);
});

 test('ignores orphan VM records and obscured shadows but retains visible variable references', () => {
    const a = target('a', {
        orphan: block('orphan', 'data_variable', {VARIABLE: {id: 'v'}}, {parent: null}),
        root: block('root', 'data_setvariableto', {VARIABLE: {id: 'v'}},
            {topLevel: true, inputs: {VALUE: {block: 'visible', shadow: 'hidden'}}}),
        visible: block('visible', 'data_variable', {VARIABLE: {id: 'v'}}, {parent: 'root'}),
        hidden: block('hidden', 'data_variable', {VARIABLE: {id: 'v'}}, {parent: 'root', shadow: true})
    }, {v: {id: 'v', name: 'VIDEO_RAM_SIZE', type: ''}});
    a.blocks.getScripts = () => ['root'];
    const vm = vmFor([a]);
    const symbol = symbolResults(vm, 'a', 0, null, t)[0];
    expect(referencesFor(vm, symbol).map(ref => ref.blockId)).toEqual(['root', 'visible']);
    a.blocks.getScripts = () => [];
    expect(referencesFor(vm, symbol)).toEqual([]);
});

test('commands prioritize availability then recency even when searching', () => {
    const items = [
        {id: 'disabled', label: 'save', available: false},
        {id: 'exact', label: 'save', available: true},
        {id: 'recent', label: 'save project', available: true},
        {id: 'other', label: 'save copy', available: true}
    ];
    for (const query of ['', 'save']) {
        expect(sortCommands(filterResults(items, query), ['disabled', 'recent']).map(item => item.id))
            .toEqual(['recent', 'exact', 'other', 'disabled']);
    }
});
