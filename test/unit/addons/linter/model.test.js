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
    return {vm, target, model, monitors: value => { monitors = value; vm.runtime.emit('MONITORS_UPDATE'); }};
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
