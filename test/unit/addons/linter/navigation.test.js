import {createNavigator} from '../../../../src/addons/addons/linter/navigation';
import Utils from '../../../../src/addons/addons/find-bar/blockly/Utils';
import BlockFlasher from '../../../../src/addons/addons/find-bar/blockly/BlockFlasher';
jest.mock('../../../../src/addons/addons/find-bar/blockly/Utils', () => jest.fn().mockImplementation(() => ({
    scrollBlockIntoView: jest.fn()
})));
jest.mock('../../../../src/addons/addons/find-bar/blockly/BlockFlasher', () => ({flash: jest.fn()}));

const fixture = () => {
    const block = {workspace: {isFlyout: false}};
    const target = {id: 'a', isOriginal: true, blocks: {getBlock: () => block}, variables: {v: {id: 'v'}}};
    const toolbox = {setSelectedCategoryById: jest.fn()};
    const reporter = {getField: () => ({getValue: () => 'v'}), getRelativeToSurfaceXY: () => ({y: 100})};
    const flyout = {getWorkspace: () => ({getAllBlocks: () => [reporter]}), scrollTo: jest.fn()};
    const workspace = {getToolbox: () => toolbox, getBlockById: () => block, getFlyout: () => flyout};
    const vm = {runtime: {targets: [target]}, editingTarget: null,
        setEditingTarget: jest.fn(() => { vm.editingTarget = target; })};
    const addon = {tab: {traps: {vm, getBlockly: async () => ({getMainWorkspace: () => workspace})},
        redux: {dispatch: jest.fn()}}};
    return {navigator: createNavigator(addon), vm, addon, workspace, toolbox, flyout, reporter};
};
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

test('activates code tab, switches target and waits for workspace before flashing', async () => {
    const {navigator, vm, addon, workspace} = fixture();
    const read = workspace.getBlockById;
    workspace.getBlockById = () => null;
    const pending = navigator.navigate({kind: 'block', targetId: 'a', blockId: 'b'});
    await Promise.resolve();
    jest.advanceTimersByTime(40);
    expect(Utils).not.toHaveBeenCalled();
    workspace.getBlockById = read;
    jest.runAllTimers();
    expect(await pending).toBe(true);
    expect(vm.setEditingTarget).toHaveBeenCalledWith('a');
    expect(addon.tab.redux.dispatch).toHaveBeenCalledWith({type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 0});
    expect(Utils.mock.results[0].value.scrollBlockIntoView).toHaveBeenCalled();
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
