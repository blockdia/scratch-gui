import {IntlProvider} from 'react-intl';
import {EventEmitter} from 'events';
const act = callback => callback();
import {CommandPalette} from '../../../src/components/command-palette/command-palette.jsx';
import actions from '../../../src/lib/editor-actions';
import {navigationFor} from '../../../src/lib/block-navigation';

jest.mock('../../../src/addons/intl-provider.jsx', () => component => component);
let instance;
let vm;
let previous;
const intl = new IntlProvider({locale: 'en', messages: {}}, {}).getChildContext().intl;
const event = (key, extra = {}) => ({key, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn(), ...extra});

beforeEach(() => {
    actions.recentActions = [];
    vm = new EventEmitter();
    vm.runtime = new EventEmitter();
    const target = {id: 'sprite', isOriginal: true, getName: () => 'Sprite', variables: {},
        blocks: {_blocks: {}}, sprite: {costumes: [], sounds: []}};
    vm.runtime.targets = [target];
    vm.editingTarget = target;
    vm.setEditingTarget = jest.fn();
    previous = {isConnected: true, focus: () => { document.activeElement = previous; }};
    global.document = {activeElement: previous, querySelectorAll: () => []};
    instance = new CommandPalette({intl, dispatch: jest.fn(), getContext: () => ({area: 'blocks'}),
        editorState: {scratchGui: {vm, mode: {}, editorTab: {activeTabIndex: 0}}}});
    instance.navigation = navigationFor(vm);
    vm.on('PROJECT_CHANGED', instance.projectChanged);
    vm.on('workspaceUpdate', instance.workspaceUpdated);
    instance.forceUpdate = jest.fn();
    instance.input = {focus: () => { document.activeElement = instance.input; }};
    instance.setState = (patch, callback) => {
        instance.state = {...instance.state, ...patch};
        // React owns this field and replaces it on every update.
        instance.context = {};
        if (callback) callback();
    };
});
afterEach(() => {
    instance.navigation.reset();
    cancelAnimationFrame(instance.refreshFrame);
    actions.paletteOpen = false;
});

test('command availability survives React re-renders, Enter executes and closes', () => {
    const run = jest.fn();
    const handle = actions.registerAction({id: 'builtin/palette-test', title: 'Example', scopes: ['blocks'], run});
    act(() => instance.open({mode: 'commands'}));
    act(() => instance.setState({query: '>Example'}));
    expect(instance.results()[0].available).toBe(true);
    act(() => instance.keydown(event('Enter', {target: instance.input})));
    expect(run).toHaveBeenCalledTimes(1);
    expect(actions.recentActions).toEqual(['builtin/palette-test']);
    expect(instance.state.open).toBe(false);
    expect(actions.paletteOpen).toBe(false);
    handle.unregister();
});

test('IME Enter does not select; Escape restores focus and modal prevents opening', () => {
    act(() => instance.open());
    expect(document.activeElement).toBe(instance.input);
    act(() => instance.keydown(event('Enter', {target: instance.input, isComposing: true})));
    expect(instance.state.open).toBe(true);
    expect(vm.setEditingTarget).not.toHaveBeenCalled();
    act(() => instance.keydown(event('Escape', {target: instance.input})));
    expect(document.activeElement).toBe(previous);
    document.querySelectorAll = () => [{style: {}}];
    expect(instance.open()).toBe(false);

});

test('reference cycling wraps, preserves originating target and focuses the search field', async () => {
    const receive = id => ({id, opcode: 'event_whenbroadcastreceived', fields: {BROADCAST_OPTION: {value: 'hello'}}});
    const original = vm.editingTarget;
    original.blocks._blocks.a = receive('a');
    const other = {...original, id: 'other', getName: () => 'Other', blocks: {_blocks: {b: receive('b')}}};
    vm.runtime.targets.push(other);
    const navigation = navigationFor(vm);
    navigation.locate = jest.fn(async ref => {
        vm.editingTarget = vm.runtime.targets.find(target => target.id === ref.targetId);
        return true;
    });
    act(() => instance.open({mode: 'symbols'}));
    const symbol = instance.results()[0];
    expect(instance.state.symbol.id).toBe(symbol.id);
    expect(instance.state.reference.blockId).toBe('a');
    await act(async () => { await instance.navigate(symbol, 1); });
    expect(instance.state.reference.blockId).toBe('b');
    expect(instance.originId).toBe('sprite');
    await act(async () => { instance.cycle(1); });
    expect(instance.state.reference.blockId).toBe('a');
    expect(document.activeElement).toBe(instance.input);
});

test('closing during asynchronous resource selection prevents stale focus and errors', async () => {
    let finish;
    instance.navigation.locate = () => new Promise(resolve => { finish = resolve; });
    instance.focusEditor = jest.fn();
    instance.open({mode: 'symbols'});
    const selection = instance.choose({kind: 'costume', targetId: 'sprite', name: 'a', assetId: 'a'});
    instance.close();
    finish(true);
    await selection;
    expect(instance.state.open).toBe(false);
    expect(instance.focusEditor).not.toHaveBeenCalled();
});

test('localized event searches survive a broadcast preview in another target', async () => {
    const original = vm.editingTarget;
    const receive = id => ({id, opcode: 'event_whenbroadcastreceived',
        fields: {BROADCAST_OPTION: {value: 'hello'}}});
    original.blocks._blocks = {
        flag: {id: 'flag', opcode: 'event_whenflagclicked', topLevel: true},
        flag2: {id: 'flag2', opcode: 'event_whenflagclicked', topLevel: true},
        a: receive('a')
    };
    const other = {...original, id: 'other', blocks: {_blocks: {b: receive('b')}}};
    vm.runtime.targets.push(other);
    instance.workspace = {isDragging: () => false, getBlockById: () => ({inputList: [
        {fieldRow: [{getText: () => '当绿旗被点击'}]}
    ]})};
    instance.navigation.locate = jest.fn(async ref => {
        vm.editingTarget = vm.runtime.targets.find(target => target.id === ref.targetId);
        return true;
    });
    instance.open({mode: 'symbols'});
    const before = instance.results().find(item => item.kind === 'event');
    const broadcast = instance.results().find(item => item.kind === 'broadcast');
    await instance.navigate(broadcast, 1);
    expect(vm.editingTarget).toBe(other);
    instance.setState({query: '@e 绿旗'});
    expect(instance.results()).toEqual([before]);
    expect(instance.results()[0].blockIds).toEqual(['flag', 'flag2']);
});

test.each([1, 2])('event labels refresh after activating a relocalized workspace from tab %s', async tab => {
    const originalRaf = global.requestAnimationFrame;
    let scheduled;
    global.requestAnimationFrame = callback => { scheduled = callback; return 1; };
    let label = 'when space key pressed';
    instance.props.intl = new IntlProvider({locale: 'zh-CN', messages: {
        'gui.palette.event': '事件'
    }}, {}).getChildContext().intl;
    instance.props.editorState.scratchGui.editorTab.activeTabIndex = tab;
    const target = vm.editingTarget;
    target.blocks._blocks.key = {id: 'key', opcode: 'event_whenkeypressed', topLevel: true,
        fields: {KEY_OPTION: {value: 'space'}}};
    target.blocks.getScripts = jest.fn(() => ['key']);
    instance.workspace = {isDragging: () => false, getBlockById: () => ({
        inputList: [{fieldRow: [{getText: () => label}]}]
    })};
    instance.bindWorkspace = jest.fn();
    vm.on('targetsUpdate', instance.refresh);
    instance.navigation.locate = jest.fn(async (location, options) => {
        options.activate();
        await Promise.resolve();
        // Locale application reloads the same workspace with Blockly events disabled.
        // Emit before replacing its fields to cover either VM listener order.
        vm.emit('workspaceUpdate', {xml: '<xml/>'});
        label = '当按下 空格 键';
        vm.emit('targetsUpdate');
        return true;
    });
    try {
        instance.open({mode: 'symbols'});
        instance.setState({query: '@e '});
        const symbol = instance.results()[0];
        const references = instance.referencesFor(symbol);
        const scans = target.blocks.getScripts.mock.calls.length;
        await instance.choose(symbol);
        instance.setState({query: '@e 空格'});
        expect(instance.results()).toHaveLength(0);
        scheduled();
        expect(instance.results()).toHaveLength(1);
        expect(instance.results()[0].label).toBe(label);
        expect(instance.referencesFor(symbol)).toBe(references);
        expect(target.blocks.getScripts).toHaveBeenCalledTimes(scans);
    } finally {
        global.requestAnimationFrame = originalRaf;
    }
});

test('workspace reloads during broadcast tours preserve origin labels and the reference index', async () => {
    const originalRaf = global.requestAnimationFrame;
    let scheduled;
    global.requestAnimationFrame = callback => { scheduled = callback; return 1; };
    const original = vm.editingTarget;
    const receive = id => ({id, opcode: 'event_whenbroadcastreceived',
        fields: {BROADCAST_OPTION: {value: 'hello'}}});
    original.blocks._blocks = {
        flag: {id: 'flag', opcode: 'event_whenflagclicked', topLevel: true},
        a: receive('a')
    };
    original.blocks.getScripts = jest.fn(() => ['flag', 'a']);
    const other = {...original, id: 'other', blocks: {_blocks: {b: receive('b')},
        getScripts: jest.fn(() => ['b'])}};
    vm.runtime.targets.push(other);
    instance.workspace = {isDragging: () => false, getBlockById: id => (
        vm.editingTarget === original && id === 'flag' ? {inputList: [
            {fieldRow: [{getText: () => '当绿旗被点击'}]}
        ]} : null
    )};
    instance.bindWorkspace = jest.fn();
    instance.navigation.locate = jest.fn(async ref => {
        vm.editingTarget = vm.runtime.targets.find(target => target.id === ref.targetId);
        vm.emit('workspaceUpdate', {xml: '<xml/>'});
        return true;
    });
    try {
        instance.open({mode: 'symbols'});
        const broadcast = instance.results().find(item => item.kind === 'broadcast');
        const references = instance.referencesFor(broadcast);
        await instance.navigate(broadcast, 1);
        scheduled();
        expect(instance.results().find(item => item.kind === 'event').label).toBe('当绿旗被点击');
        await instance.navigate(broadcast, 0);
        scheduled();
        instance.setState({query: '@e 绿旗'});
        expect(instance.results()).toHaveLength(1);
        expect(instance.referencesFor(broadcast)).toBe(references);
        expect(original.blocks.getScripts).toHaveBeenCalledTimes(2);
        expect(other.blocks.getScripts).toHaveBeenCalledTimes(1);
    } finally {
        global.requestAnimationFrame = originalRaf;
    }
});

test('symbol Escape clears the query before closing, retaining the symbol prefix', () => {
    instance.open({mode: 'symbols'});
    instance.setState({query: '@score'});
    instance.keydown(event('Escape', {target: instance.input}));
    expect(instance.state.query).toBe('@');
    expect(instance.state.open).toBe(true);
    instance.keydown(event('Escape', {target: instance.input}));
    expect(instance.state.open).toBe(false);
});

test('code symbol filters keep events distinct from broadcasts and allow literal names', async () => {
    const target = vm.editingTarget;
    target.variables.v = {id: 'v', name: 'score', type: ''};
    target.variables.l = {id: 'l', name: 'v 1', type: 'list'};
    target.blocks._blocks.use = {id: 'use', opcode: 'data_variable', fields: {VARIABLE: {id: 'v'}}};
    target.blocks._blocks.flag = {id: 'flag', opcode: 'event_whenflagclicked', topLevel: true};
    target.blocks._blocks.receive = {id: 'receive', opcode: 'event_whenbroadcastreceived',
        fields: {BROADCAST_OPTION: {value: 'hello'}}, topLevel: true};
    target.blocks._blocks.definition = {id: 'definition', opcode: 'procedures_definition',
        inputs: {custom_block: {block: 'prototype'}}};
    target.blocks._blocks.prototype = {id: 'prototype', opcode: 'procedures_prototype',
        mutation: {proccode: 'custom %s'}};
    instance.navigation.locate = jest.fn(async (location, options) => {
        options.activate();
        return true;
    });
    instance.open({mode: 'symbols'});
    instance.setState({query: '@v '});
    expect(instance.results().map(item => item.kind)).toEqual(['variable']);
    instance.setState({query: '@l v 1'});
    expect(instance.results().map(item => item.kind)).toEqual(['list']);
    instance.setState({query: '@ v 1'});
    expect(instance.results().map(item => item.kind)).toEqual(['list']);
    instance.setState({query: '@v 1'});
    expect(instance.results()).toEqual([]);
    instance.setState({query: '@c custom'});
    expect(instance.results().map(item => item.kind)).toEqual(['procedure']);
    instance.setState({query: '@e '});
    expect(instance.results().map(item => item.kind)).toEqual(['event']);
    instance.setState({query: '@b '});
    expect(instance.results().map(item => item.kind)).toEqual(['broadcast']);
    instance.tab = 1;
    instance.props.editorState.scratchGui.editorTab.activeTabIndex = 1;
    instance.setState({query: '@v score'});
    expect(instance.results().map(item => item.kind)).toEqual(['variable']);
    await instance.choose(instance.results()[0]);
    expect(instance.props.dispatch).toHaveBeenCalledWith(expect.objectContaining({activeTabIndex: 0}));
});

test('costumes and sounds follow the active tab without category prefixes', () => {
    const target = vm.editingTarget;
    target.sprite.costumes = [{name: 'Blue', assetId: 'blue'}];
    target.sprite.sounds = [{name: 'Pop', assetId: 'pop'}];
    instance.open({mode: 'symbols'});
    instance.tab = 1;
    instance.setState({query: '@blue'});
    expect(instance.results().map(item => item.kind)).toEqual(['costume']);
    instance.setState({query: '@c blue'});
    expect(instance.results()).toEqual([]);
    instance.tab = 2;
    instance.setState({query: '@pop'});
    expect(instance.results().map(item => item.kind)).toEqual(['sound']);
    instance.setState({query: '@s pop'});
    expect(instance.results()).toEqual([]);
});

test('symbol arrows preview without wrapping; repeated clicks and horizontal arrows cycle references', async () => {
    const receive = id => ({id, opcode: 'event_whenbroadcastreceived', fields: {BROADCAST_OPTION: {value: 'hello'}}});
    vm.editingTarget.blocks._blocks = {a: receive('a'), b: receive('b')};
    instance.navigation.locate = jest.fn(async () => true);
    instance.open({mode: 'symbols'});
    instance.keydown(event('ArrowDown', {target: instance.input}));
    expect(instance.state.reference.blockId).toBe('a');
    expect(instance.state.open).toBe(true);
    instance.keydown(event('ArrowRight', {target: instance.input}));
    expect(instance.state.reference.blockId).toBe('b');
    await instance.choose(instance.results()[0]);
    expect(instance.state.reference.blockId).toBe('a');
    instance.keydown(event('ArrowDown', {target: instance.input}));
    expect(instance.state.index).toBe(0);
    expect(instance.state.reference.blockId).toBe('a');
});

test('mouse selection of a single symbol keeps the search open; Enter confirms', async () => {
    vm.editingTarget.blocks._blocks = {a: {id: 'a', opcode: 'event_whenbroadcastreceived',
        fields: {BROADCAST_OPTION: {value: 'hello'}}}};
    instance.navigation.locate = jest.fn(async () => true);
    instance.focusEditor = jest.fn();
    instance.open({mode: 'symbols'});
    const item = instance.results()[0];
    await instance.choose(item);
    expect(instance.state.open).toBe(true);
    await instance.choose(item, null, true);
    expect(instance.state.open).toBe(false);
    expect(instance.focusEditor).toHaveBeenCalled();
});

test('first symbol is active immediately and Down moves to the second item', () => {
    vm.editingTarget.blocks._blocks = {
        a: {id: 'a', opcode: 'event_whenbroadcastreceived', fields: {BROADCAST_OPTION: {value: 'hello'}}},
        b: {id: 'b', opcode: 'event_whenbroadcastreceived', fields: {BROADCAST_OPTION: {value: 'world'}}}
    };
    instance.navigation.locate = jest.fn(async () => true);
    instance.open({mode: 'symbols'});
    expect(instance.state.reference.blockId).toBe('a');
    instance.keydown(event('ArrowDown', {target: instance.input}));
    expect(instance.state.index).toBe(1);
    expect(instance.state.reference.blockId).toBe('b');
});

test('deleting an active reference clears its stale navigation state', () => {
    vm.editingTarget.blocks._blocks = {a: {id: 'a', opcode: 'data_variable', fields: {VARIABLE: {id: 'v'}}}};
    vm.editingTarget.variables.v = {id: 'v', name: 'value', type: ''};
    instance.navigation.locate = jest.fn(async () => true);
    instance.open({mode: 'symbols'});
    expect(instance.state.reference.blockId).toBe('a');
    delete vm.editingTarget.blocks._blocks.a;
    let refresh;
    const original = global.requestAnimationFrame;
    global.requestAnimationFrame = callback => { refresh = callback; return 1; };
    vm.emit('PROJECT_CHANGED');
    refresh();
    global.requestAnimationFrame = original;
    expect(instance.state.reference).toBeNull();
    expect(instance.state.error).toBe(false);
});

test('target history records confirmations, survives reopening and breaks search ties', async () => {
    const original = vm.editingTarget;
    vm.runtime.targets.push(
        {...original, id: 'copy', getName: () => 'Sprite copy'},
        {...original, id: 'other', getName: () => 'Sprite other'}
    );
    instance.focusEditor = jest.fn();
    const ids = () => instance.results().map(item => item.id);
    instance.open();
    instance.keydown(event('ArrowDown', {target: instance.input}));
    instance.close();
    expect(instance.recentTargets).toEqual([]);
    instance.open();
    await instance.choose(instance.results().find(item => item.id === 'other'));
    instance.open();
    expect(ids()).toEqual(['other', 'copy', 'sprite']);
    instance.setState({query: 'Sprite'});
    expect(ids()).toEqual(['sprite', 'other', 'copy']);
    instance.setState({query: ''});
    await instance.choose(instance.results().find(item => item.id === 'copy'));
    instance.open();
    expect(ids()).toEqual(['copy', 'other', 'sprite']);
    vm.runtime.targets[1].getName = () => 'Renamed';
    expect(instance.results()[0].label).toBe('Renamed');
    await instance.choose(instance.results()[0]);
    expect(instance.recentTargets).toEqual(['copy', 'other']);
});

test('target history prunes deleted targets while closed and resets on project load', async () => {
    const other = {...vm.editingTarget, id: 'other', getName: () => 'Other'};
    vm.runtime.targets.push(other);
    instance.focusEditor = jest.fn();
    instance.open();
    await instance.choose(instance.results().find(item => item.id === 'other'));
    vm.runtime.targets.pop();
    instance.bindWorkspace = jest.fn();
    instance.refresh();
    expect(instance.recentTargets).toEqual([]);
    vm.runtime.targets.push(other);
    instance.open();
    expect(instance.results().map(item => item.id)).toEqual(['other', 'sprite']);
    await instance.choose(instance.results()[0]);
    instance.projectLoaded();
    expect(instance.recentTargets).toEqual([]);
    instance.open();
    expect(instance.results().map(item => item.id)).toEqual(['other', 'sprite']);
});

test('current target comes last except when its search match is stronger', async () => {
    vm.runtime.targets.push(
        {...vm.editingTarget, id: 'copy', getName: () => 'Sprite copy'},
        {...vm.editingTarget, id: 'other', getName: () => 'Sprite other'}
    );
    vm.setEditingTarget.mockImplementation(id => {
        vm.editingTarget = vm.runtime.targets.find(target => target.id === id);
    });
    instance.focusEditor = jest.fn();
    instance.recentTargets = ['sprite', 'other'];
    const ids = () => instance.results().map(item => item.id);
    instance.open();
    expect(ids()).toEqual(['other', 'copy', 'sprite']);
    instance.setState({query: 'Sprite'});
    expect(ids()).toEqual(['sprite', 'other', 'copy']);
    instance.setState({query: 'Spr'});
    expect(ids()).toEqual(['other', 'copy', 'sprite']);
    await instance.choose(instance.results()[0]);
    instance.open();
    expect(ids()).toEqual(['sprite', 'copy', 'other']);
    vm.runtime.targets = [vm.editingTarget];
    expect(ids()).toEqual(['other']);
});

test('zero-reference symbols sort last but stronger search matches still win', () => {
    vm.editingTarget.variables = {
        unused: {id: 'unused', name: 'Score', type: ''},
        used: {id: 'used', name: 'Score used', type: ''},
        unusedList: {id: 'unusedList', name: 'Scores', type: 'list'}
    };
    vm.editingTarget.blocks._blocks = {
        use: {id: 'use', opcode: 'data_variable', fields: {VARIABLE: {id: 'used'}}}
    };
    instance.selectFirst = jest.fn();
    instance.open({mode: 'symbols'});
    const names = () => instance.results().map(item => item.label);
    expect(names()).toEqual(['Score used', 'Score', 'Scores']);
    instance.setState({query: '@ Sco'});
    expect(names()).toEqual(['Score used', 'Score', 'Scores']);
    instance.setState({query: '@ Score'});
    expect(names()).toEqual(['Score', 'Score used', 'Scores']);
    instance.setState({query: '@v '});
    expect(names()).toEqual(['Score used', 'Score']);
    delete vm.editingTarget.blocks._blocks.use;
    vm.emit('PROJECT_CHANGED');
    expect(names()).toEqual(['Score', 'Score used']);
});

test('typing and reference navigation reuse one index in a large workspace', async () => {
    const target = vm.editingTarget;
    for (let i = 0; i < 100; i++) target.variables[i] = {id: `${i}`, name: `value ${i}`, type: ''};
    for (let i = 0; i < 2000; i++) {
        target.blocks._blocks[i] = {id: `${i}`, opcode: 'data_variable', fields: {VARIABLE: {id: `${i % 100}`}}};
    }
    target.blocks.getScripts = jest.fn(() => Object.keys(target.blocks._blocks));
    instance.navigation.locate = jest.fn(async () => true);
    instance.open({mode: 'symbols'});
    const scans = target.blocks.getScripts.mock.calls.length;
    expect(scans).toBeLessThanOrEqual(2);
    for (const query of ['@v v', '@v va', '@v value', '@v value 1']) {
        instance.setState({query});
        const items = instance.results();
        expect(items.length).toBeGreaterThan(0);
        expect(instance.results()).toBe(items);
        await instance.choose(items[0]);
        await instance.cycle(1);
        instance.workspaceChanged({type: 'ui', element: 'stackclick'});
    }
    expect(target.blocks.getScripts).toHaveBeenCalledTimes(scans);

    target.variables['1'].name = 'renamed';
    vm.emit('PROJECT_CHANGED');
    instance.setState({query: '@v renamed'});
    expect(instance.results().map(item => item.label)).toEqual(['renamed']);
    expect(instance.referencesFor(instance.results()[0])).toHaveLength(20);
    expect(target.blocks.getScripts).toHaveBeenCalledTimes(scans + 2);
});

test('grouped event references update after edits and reopening discards the snapshot', () => {
    const target = vm.editingTarget;
    target.blocks._blocks.a = {id: 'a', opcode: 'event_whenflagclicked', topLevel: true};
    instance.navigation.locate = jest.fn(async () => true);
    instance.open({mode: 'symbols'});
    const symbol = instance.state.symbol;
    target.blocks._blocks.b = {id: 'b', opcode: 'event_whenflagclicked', topLevel: true};
    vm.emit('PROJECT_CHANGED');
    expect(instance.referencesFor(symbol).map(ref => ref.blockId)).toEqual(['a', 'b']);
    instance.close();
    delete target.blocks._blocks.a;
    instance.open({mode: 'symbols'});
    expect(instance.referencesFor(instance.state.symbol).map(ref => ref.blockId)).toEqual(['b']);
});

test('cancelled navigation cannot overwrite a later visit to the same cached reference', async () => {
    vm.editingTarget.variables.v = {id: 'v', name: 'value', type: ''};
    vm.editingTarget.blocks._blocks.a = {id: 'a', opcode: 'data_variable', fields: {VARIABLE: {id: 'v'}}};
    const finish = [];
    instance.navigation.locate = jest.fn(() => new Promise(resolve => finish.push(resolve)));
    instance.open({mode: 'symbols'});
    const latest = instance.cycle(1);
    finish[0](false);
    await Promise.resolve();
    expect(instance.state.error).toBe(false);
    finish[1](true);
    await latest;
    expect(instance.state.error).toBe(false);
});
