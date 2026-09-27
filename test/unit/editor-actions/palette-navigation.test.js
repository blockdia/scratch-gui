import {Navigation} from '../../../src/lib/block-navigation';
import {scrollIntoVisibleArea} from '../../../src/lib/block-navigation/visible-area';
jest.mock('../../../src/lib/block-navigation/visible-area', () => ({scrollIntoVisibleArea: jest.fn()}));
import BlockFlasher from '../../../src/lib/block-navigation/BlockFlasher';
jest.mock('../../../src/lib/block-navigation/BlockFlasher', () => ({flash: jest.fn(), clear: jest.fn()}));

let vm;
let workspace;
let navigation;
let ready;
beforeEach(() => {
    jest.useFakeTimers();
    ready = false;
    const target = {id: 'target', isOriginal: true, blocks: {getBlock: id => id === 'block' ? {id} : null}};
    vm = {runtime: {targets: [target]}, editingTarget: target,
        setEditingTarget: jest.fn(), emit: jest.fn()};
    const metrics = {viewLeft: 5, viewTop: 10, contentLeft: 0, contentTop: 0};
    workspace = {getToolbox: () => ({}), isDragging: () => false,
        getMetrics: () => metrics, scale: 1,
        getBlockById: () => ready ? {id: 'block', workspace: {}} : null,
        centerOnBlock: jest.fn(), setScale: jest.fn(), scrollbar: {set: jest.fn()}};
    scrollIntoVisibleArea.mockImplementation(() => { metrics.viewTop = 100; });
    navigation = new Navigation(vm, () => workspace);
});
afterEach(() => {
    navigation.reset();
    jest.useRealTimers();
    jest.clearAllMocks();
});

test('waits for the target block to enter Blockly before scrolling and highlighting', async () => {
    const promise = navigation.locate({targetId: 'target', blockId: 'block'});
    jest.advanceTimersByTime(40);
    expect(scrollIntoVisibleArea).not.toHaveBeenCalled();
    ready = true;
    jest.advanceTimersByTime(40);
    expect(await promise).toBe(true);
    expect(scrollIntoVisibleArea).toHaveBeenCalledWith(workspace, expect.objectContaining({id: 'block'}), null);
    expect(BlockFlasher.flash).toHaveBeenCalled();
    expect(navigation.back).toHaveLength(1);
});

test('target deletion and cancellation settle pending navigation without stale highlighting', async () => {
    const promise = navigation.locate({targetId: 'target', blockId: 'block'});
    vm.runtime.targets = [];
    jest.runAllTimers();
    expect(await promise).toBe(false);
    expect(scrollIntoVisibleArea).not.toHaveBeenCalled();
});

test('new navigation cancels the previous pending operation', async () => {
    const first = navigation.locate({targetId: 'target', blockId: 'block'});
    const second = navigation.locate({targetId: 'target', blockId: 'block'});
    ready = true;
    jest.runAllTimers();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(scrollIntoVisibleArea).toHaveBeenCalledTimes(1);
});

test('resources wait for the editor selection bridge without invoking costume playback', async () => {
    const promise = navigation.locate({targetId: 'target', resourceKind: 'sound', name: 'sound', assetId: 'id'},
        {record: false});
    jest.advanceTimersByTime(0);
    vm.emit.mockImplementation((event, request) => { request.selected = true; });
    jest.advanceTimersByTime(40);
    expect(await promise).toBe(true);
    expect(vm.emit).toHaveBeenLastCalledWith('EDITOR_SELECT_RESOURCE', expect.objectContaining({assetId: 'id'}));
    expect(navigation.back).toHaveLength(0);
});

test('back/forward restore viewport and reset drops project-specific locations', async () => {
    ready = true;
    const promise = navigation.locate({targetId: 'target', blockId: 'block'});
    jest.runAllTimers();
    await promise;
    const back = navigation.travel('back');
    jest.runAllTimers();
    expect(await back).toBe(true);
    expect(workspace.scrollbar.set).toHaveBeenCalledWith(5, 10);
    expect(navigation.forward).toHaveLength(1);
    navigation.reset();
    expect(navigation.back).toHaveLength(0);
    expect(navigation.forward).toHaveLength(0);
});

test('reselecting an already visible location does not add duplicate history', async () => {
    ready = true;
    const first = navigation.locate({targetId: 'target', blockId: 'block'});
    jest.runAllTimers();
    await first;
    const second = navigation.locate({targetId: 'target', blockId: 'block'});
    jest.runAllTimers();
    await second;
    expect(navigation.back).toHaveLength(1);
});
