import {inputTargetForGesture, resolveInputTarget, acceptsInputBlock}
    from '../../../src/addons/libraries/block-search/input-target';

const Blockly = {INPUT_VALUE: 1};
const fixture = () => {
    const node = {};
    const root = {contains: target => target === node};
    const shadow = {isShadow: () => true, getSvgRoot: () => root, getParent: () => block};
    const connection = {type: Blockly.INPUT_VALUE, targetBlock: jest.fn(() => shadow)};
    const input = {name: 'VALUE', connection, outlinePath: root};
    const workspace = {getBlockById: id => id === 'owner' ? block : null};
    const block = {id: 'owner', workspace, inputList: [input], isShadow: () => false,
        isEditable: () => true, getInput: name => name === input.name ? input : null};
    const gesture = {startBlock_: shadow, mostRecentEvent_: {shiftKey: true, button: 0, target: node}};
    const target = {workspace, blockId: block.id, inputName: input.name};
    return {node, root, shadow, input, connection, workspace, block, gesture, target};
};

test('targets shadow fields and empty value outlines, including boolean slots', () => {
    const f = fixture();
    expect(inputTargetForGesture(Blockly, f.workspace, f.gesture)).toEqual(f.target);
    f.connection.targetBlock.mockReturnValue(null);
    f.gesture.startBlock_ = f.block;
    expect(inputTargetForGesture(Blockly, f.workspace, f.gesture)).toEqual(f.target);
    f.gesture.mostRecentEvent_.target = {};
    expect(inputTargetForGesture(Blockly, f.workspace, f.gesture)).toBeNull();
});

test('ignores normal clicks, non-left clicks, flyouts and occupied inputs', () => {
    const f = fixture();
    for (const event of [{shiftKey: false, button: 0}, {shiftKey: true, button: 1}, {shiftKey: true, button: 2}]) {
        expect(inputTargetForGesture(Blockly, f.workspace,
            {...f.gesture, mostRecentEvent_: {...event, target: f.node}})).toBeNull();
    }
    expect(inputTargetForGesture(Blockly, f.workspace, {...f.gesture, flyout_: {}})).toBeNull();
    f.connection.targetBlock.mockReturnValue({isShadow: () => false});
    expect(inputTargetForGesture(Blockly, f.workspace, f.gesture)).toBeNull();
});

test('revalidates the workspace, owner, input and editability before inserting', () => {
    const f = fixture();
    expect(resolveInputTarget(Blockly, f.workspace, f.target)).toBe(f.connection);
    expect(resolveInputTarget(Blockly, {}, f.target)).toBeNull();
    expect(resolveInputTarget(Blockly, f.workspace, {...f.target, blockId: 'deleted'})).toBeNull();
    expect(resolveInputTarget(Blockly, f.workspace, {...f.target, inputName: 'removed'})).toBeNull();
    f.block.isEditable = () => false;
    expect(resolveInputTarget(Blockly, f.workspace, f.target)).toBeNull();
    f.block.isEditable = () => true;
    f.connection.type = 3;
    expect(resolveInputTarget(Blockly, f.workspace, f.target)).toBeNull();
});

test('uses Blockly value compatibility and excludes stack blocks from slot search', () => {
    const output = {};
    const connection = {checkType_: jest.fn(candidate => candidate === output)};
    expect(acceptsInputBlock(connection, {workspaceForm: {outputConnection: output}})).toBe(true);
    expect(acceptsInputBlock(connection, {workspaceForm: {outputConnection: {}}})).toBe(false);
    expect(acceptsInputBlock(connection, {workspaceForm: {}})).toBe(false);
});
