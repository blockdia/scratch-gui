import {EventEmitter} from 'events';
import {createLinterModel} from '../../../../src/addons/addons/linter/model';

const fixture = (count = 1) => {
    const vm = new EventEmitter();
    vm.runtime = new EventEmitter();
    const target = {id: 'a', getName: () => 'a', isOriginal: true, variables: {}, blocks: {_blocks: {}}};
    for (let i = 0; i < count; i++) target.variables[i] = {id: String(i), name: `v${i}`, type: ''};
    vm.runtime.targets = [target, {...target, id: 'clone', isOriginal: false}];
    let monitors = [];
    vm.runtime.getMonitorState = () => ({valueSeq: () => monitors});
    const model = createLinterModel(vm);
    return {vm,
        target,
        model,
        monitors: value => {
            monitors = value; vm.runtime.emit('MONITORS_UPDATE');
        }};
};
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('scans when visible, debounces edits and ignores nonstructural updates', () => {
    const {vm, target, model} = fixture();
    model.setVisible(true);
    jest.runAllTimers();
    expect(model.snapshot().results).toHaveLength(1);
    const revision = model.snapshot().revision;
    target.variables[0].value = 200;
    vm.emit('targetsUpdate');
    expect(model.snapshot().revision).toBe(revision);
    vm.emit('PROJECT_CHANGED');
    jest.advanceTimersByTime(300);
    vm.emit('PROJECT_CHANGED');
    jest.advanceTimersByTime(300);
    expect(model.snapshot().status).toBe('stale');
    jest.runAllTimers();
    expect(model.snapshot().status).toBe('ready');
    model.setVisible(false);
    expect(vm.listenerCount('PROJECT_CHANGED')).toBe(0);
    expect(vm.runtime.listenerCount('MONITORS_UPDATE')).toBe(0);
    vm.emit('PROJECT_CHANGED');
    expect(jest.getTimerCount()).toBe(0);
    model.setVisible(true);
    expect(model.snapshot().status).toBe('scanning');
    model.setVisible(false);
    expect(jest.getTimerCount()).toBe(0);
});

test('project replacement and hiding cancel batched old results', () => {
    const {vm, model} = fixture(1000);
    model.setVisible(true);
    jest.runOnlyPendingTimers();
    expect(model.snapshot().status).toBe('scanning');
    vm.runtime.targets = [];
    vm.runtime.emit('PROJECT_LOADED');
    jest.runAllTimers();
    expect(model.snapshot().results).toEqual([]);
    model.refresh();
    model.setVisible(false);
    jest.runAllTimers();
    expect(jest.getTimerCount()).toBe(0);
});

test('monitor value updates do not trigger checks; visibility does', () => {
    const {model, monitors} = fixture();
    model.setVisible(true);
    jest.runAllTimers();
    monitors([{id: '0', targetId: 'a', opcode: 'data_variable', visible: true, value: 1}]);
    jest.runAllTimers();
    expect(model.snapshot().results).toEqual([]);
    const revision = model.snapshot().revision;
    monitors([{id: '0', targetId: 'a', opcode: 'data_variable', visible: true, value: 2}]);
    expect(model.snapshot().revision).toBe(revision);
    model.setVisible(false);
});

test('edits during a scan discard the old partial result', () => {
    const {vm, target, model} = fixture(1000);
    model.setVisible(true);
    jest.runOnlyPendingTimers();
    expect(model.snapshot().status).toBe('scanning');
    target.variables = {};
    vm.emit('PROJECT_CHANGED');
    jest.runAllTimers();
    expect(model.snapshot().results).toEqual([]);
    model.setVisible(false);
});

test('resource names, component capabilities and runtime options invalidate but live values do not', () => {
    const {vm, target, model} = fixture();
    target.sprite = {costumes: [{name: 'one', assetId: 'a'}], sounds: []};
    target.component = {type: 'slider', properties: {value: 0}, parts: []};
    model.setVisible(true);
    jest.runAllTimers();
    let revision = model.snapshot().revision;
    target.component.properties.value = 10;
    target.currentCostume = 1;
    target.x = 30;
    vm.emit('targetsUpdate');
    expect(model.snapshot().revision).toBe(revision);
    target.sprite.costumes[0].name = 'renamed';
    vm.emit('targetsUpdate');
    expect(model.snapshot().status).toBe('stale');
    jest.runAllTimers();
    revision = model.snapshot().revision;
    target.component.type = 'button';
    vm.emit('targetsUpdate');
    expect(model.snapshot().revision).toBeGreaterThan(revision);
    jest.runAllTimers();
    vm.emit('RUNTIME_OPTIONS_CHANGED');
    expect(model.snapshot().status).toBe('stale');
    model.setVisible(false);
    expect(vm.listenerCount('RUNTIME_OPTIONS_CHANGED')).toBe(0);
    expect(vm.listenerCount('COMPILER_OPTIONS_CHANGED')).toBe(0);
});

test('work limit produces incomplete status, never a successful empty result', () => {
    const {vm} = fixture(100);
    const model = createLinterModel(vm, () => ['unused-data'], {maxWork: 5});
    model.setVisible(true);
    jest.runAllTimers();
    expect(model.snapshot()).toMatchObject({status: 'incomplete',
        results: [],
        coverage: {limitations: ['work-limit']}});
    model.setVisible(false);
});

test('unknown blocks finish with ready results and separate coverage notes', () => {
    const {target, model} = fixture();
    target.blocks._blocks.unknown = {id: 'unknown', opcode: 'thirdparty_unknown', fields: {}, inputs: {}};
    model.setVisible(true);
    jest.runAllTimers();
    expect(model.snapshot()).toMatchObject({status: 'ready',
        coverage: {limitations: ['unknown-opcode'], unknownOpcodes: ['thirdparty_unknown']},
        results: [{rule: 'unused-data', message: 'unused-data-partial'}]});
    model.setVisible(false);
});

test.each([false, true])('current costume changes update cleanup results without rescanning (stage: %s)', isStage => {
    const {vm, target} = fixture(0);
    target.isStage = isStage;
    target.currentCostume = 0;
    // Distinct named costumes may share an asset; sounds must not be filtered.
    target.sprite = {costumes: [{name: 'one', assetId: 'shared'}, {name: 'two', assetId: 'shared'}],
        sounds: [{name: 'one', assetId: 'shared'}]};
    const model = createLinterModel(vm, () => ['unused-resource']);
    const costumes = () => model.snapshot().results.filter(row => row.location.resourceKind === 'costume')
        .map(row => row.values.name);
    model.setVisible(true);
    jest.runAllTimers();
    expect(costumes()).toEqual(['two']);
    const revision = model.snapshot().revision;
    for (let i = 0; i < 20; i++) {
        target.currentCostume = (i + 1) % 2;
        vm.emit('targetsUpdate');
        expect(costumes()).toEqual([target.currentCostume === 0 ? 'two' : 'one']);
        expect(model.snapshot().status).toBe('ready');
        expect(model.snapshot().revision).toBe(revision);
        expect(model.snapshot().results.filter(row => row.location.resourceKind === 'sound')).toHaveLength(1);
        expect(jest.getTimerCount()).toBe(0);
    }
    const listener = jest.fn();
    model.subscribe(listener);
    vm.emit('targetsUpdate');
    expect(listener).not.toHaveBeenCalled();
    model.setVisible(false);
});

test('a batched scan publishes the latest costume and keeps statically referenced costumes excluded', () => {
    const {vm, target} = fixture(1000);
    target.currentCostume = 0;
    target.sprite = {costumes: [{name: 'one'}, {name: 'two'}, {name: 'referenced'}], sounds: []};
    target.blocks._blocks = {
        switch: {id: 'switch', opcode: 'looks_switchcostumeto', inputs: {COSTUME: {block: 'name'}}},
        name: {id: 'name', opcode: 'looks_costume', fields: {COSTUME: {value: 'referenced'}}}
    };
    const model = createLinterModel(vm, () => ['unused-resource']);
    model.setVisible(true);
    jest.runOnlyPendingTimers();
    expect(model.snapshot().status).toBe('scanning');
    target.currentCostume = 1;
    vm.emit('targetsUpdate');
    jest.runAllTimers();
    expect(model.snapshot().results.map(row => row.values.name)).toEqual(['one']);
    target.currentCostume = 2;
    vm.emit('targetsUpdate');
    expect(model.snapshot().results.map(row => row.values.name).sort()).toEqual(['one', 'two']);
    model.setVisible(false);
});
