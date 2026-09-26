import {createNavigator} from '../../../../src/addons/addons/linter/navigation';
import BlockFlasher from '../../../../src/addons/addons/find-bar/blockly/BlockFlasher';
jest.mock('../../../../src/addons/addons/find-bar/blockly/BlockFlasher', () => ({flash: jest.fn()}));

const fixture = () => {
    const block = {workspace: {isFlyout: false}};
    const target = {id: 'a', isOriginal: true, blocks: {getBlock: () => block}, variables: {v: {id: 'v'}}};
    const toolbox = {setSelectedCategoryById: jest.fn()};
    const reporter = {getField: () => ({getValue: () => 'v'}), getRelativeToSurfaceXY: () => ({y: 100})};
    const flyout = {getWorkspace: () => ({getAllBlocks: () => [reporter]}), scrollTo: jest.fn()};
    const workspace = {getToolbox: () => toolbox, getBlockById: () => block, getFlyout: () => flyout, centerOnBlock: jest.fn()};
    const vm = {runtime: {targets: [target]},
        editingTarget: null,
        setEditingTarget: jest.fn(() => {
            vm.editingTarget = target;
        })};
    const addon = {tab: {traps: {vm, getWorkspace: () => workspace,
        getBlockly: async () => ({getMainWorkspace: () => {
            throw new Error('Focused workspace may be a disposed custom-block preview');
        }, hideChaff: jest.fn()})},
        redux: {dispatch: jest.fn()}}};
    return {navigator: createNavigator(addon), vm, addon, workspace, toolbox, flyout, reporter};
};
beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

test('activates code tab, switches target and waits for workspace before flashing', async () => {
    const {navigator, vm, addon, workspace} = fixture();
    const read = workspace.getBlockById;
    workspace.getBlockById = () => null;
    const pending = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'b'});
    await Promise.resolve();
    jest.advanceTimersByTime(40);
    expect(workspace.centerOnBlock).not.toHaveBeenCalled();
    workspace.getBlockById = read;
    jest.runAllTimers();
    expect(await pending).toBe(true);
    expect(vm.setEditingTarget).toHaveBeenCalledWith('a');
    expect(addon.tab.redux.dispatch).toHaveBeenCalledWith({type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 0});
    expect(workspace.centerOnBlock).toHaveBeenCalledWith('b');
});

test('variable navigation opens the data category and locates by ID', async () => {
    const {navigator, toolbox, flyout, reporter} = fixture();
    const pending = navigator.navigate({kind: 'variable', targetId: 'a', variableId: 'v', variableType: ''});
    await Promise.resolve();
    jest.runAllTimers();
    expect(await pending).toBe(true);
    expect(toolbox.setSelectedCategoryById).toHaveBeenCalledWith('variables');
    expect(flyout.scrollTo).toHaveBeenCalledWith(100);
    expect(BlockFlasher.flash).toHaveBeenCalledWith(reporter);
});

test('deletion or cancellation stops pending navigation without matching by name', async () => {
    const {navigator, vm} = fixture();
    const pending = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'b'});
    await Promise.resolve();
    vm.runtime.targets = [];
    jest.runAllTimers();
    expect(await pending).toBe(false);
    expect(await navigator.navigate({kind: 'variable', targetId: 'a', variableId: 'v'})).toBe(false);
    const other = fixture();
    const cancelled = other.navigator.navigate({kind: 'block', targetId: 'a', blockId: 'b'});
    await Promise.resolve();
    other.navigator.cancel();
    expect(await cancelled).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
});

test('resource navigation selects the asset editor without mutating the current costume', async () => {
    const {navigator, vm, addon} = fixture();
    const target = vm.runtime.targets[0];
    target.sprite = {costumes: [{name: 'spare', assetId: 'asset'}]};
    target.currentCostume = 0;
    vm.emit = jest.fn((event, request) => {
        request.selected = true;
    });
    const pending = navigator.navigate({kind: 'resource',
        targetId: 'a',
        resourceKind: 'costume',
        name: 'spare',
        assetId: 'asset'});
    jest.runAllTimers();
    expect(await pending).toBe(true);
    expect(addon.tab.redux.dispatch).toHaveBeenCalledWith({type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 1});
    expect(vm.emit).toHaveBeenCalledWith('EDITOR_SELECT_RESOURCE', expect.objectContaining({name: 'spare'}));
    expect(target.currentCostume).toBe(0);
    target.sprite.costumes = [];
    expect(await navigator.navigate({kind: 'resource',
        targetId: 'a',
        resourceKind: 'costume',
        name: 'spare',
        assetId: 'asset'})).toBe(false);
});


test('duplicate definitions navigate by exact ID through editor workspace replacement', async () => {
    const {navigator, addon, workspace} = fixture();
    const first = {id: 'first', workspace: {isFlyout: false}};
    const second = {id: 'second', workspace: {isFlyout: false}};
    workspace.getBlockById = id => ({first, second}[id]);
    for (const block of [first, second, first]) {
        const pending = navigator.navigate({kind: 'block', targetId: 'a', blockId: block.id});
        await Promise.resolve();
        jest.runAllTimers();
        expect(await pending).toBe(true);
        expect(workspace.centerOnBlock).toHaveBeenLastCalledWith(block.id);
        expect(BlockFlasher.flash).toHaveBeenLastCalledWith(block);
    }
    addon.tab.traps.getWorkspace = () => null;
    const pending = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'second'});
    await Promise.resolve();
    jest.advanceTimersByTime(80);
    const replacement = {...workspace, centerOnBlock: jest.fn()};
    addon.tab.traps.getWorkspace = () => replacement;
    jest.runAllTimers();
    expect(await pending).toBe(true);
    expect(replacement.centerOnBlock).toHaveBeenCalledWith('second');
});

test('a newer click cancels an older pending jump', async () => {
    const {navigator, addon, workspace} = fixture();
    addon.tab.traps.getWorkspace = () => null;
    const first = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'first'});
    await Promise.resolve();
    const second = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'second'});
    await Promise.resolve();
    addon.tab.traps.getWorkspace = () => workspace;
    jest.runAllTimers();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(workspace.centerOnBlock.mock.calls).toEqual([['second']]);
});

test('workspace errors settle pending navigation instead of escaping the timer', async () => {
    const {navigator, workspace} = fixture();
    workspace.centerOnBlock.mockImplementation(() => { throw new Error('disposed workspace'); });
    const pending = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'b'});
    await Promise.resolve();
    expect(() => jest.runAllTimers()).not.toThrow();
    expect(await pending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    workspace.centerOnBlock.mockReset();
    const retry = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'b'});
    await Promise.resolve();
    jest.runAllTimers();
    expect(await retry).toBe(true);
});
