// Keep identifiers rather than a connection that mutations or undo can dispose.
export function resolveInputTarget(Blockly, workspace, target) {
  if (!target || target.workspace !== workspace) return null;
  const block = workspace.getBlockById(target.blockId);
  if (!block || block.isShadow() || block.isInFlyout || !block.isEditable()) return null;
  const input = block.getInput(target.inputName);
  if (input?.connection?.type !== Blockly.INPUT_VALUE) return null;
  const child = input.connection.targetBlock();
  return child && !child.isShadow() ? null : input.connection;
}

export function inputTargetForGesture(Blockly, workspace, gesture) {
  const event = gesture.mostRecentEvent_;
  if (!event.shiftKey || event.button !== 0 || gesture.flyout_) return null;
  let block = gesture.startBlock_;
  if (block?.isShadow()) block = block.getParent();
  if (!block || block.workspace !== workspace) return null;
  for (const input of block.inputList) {
    const target = {workspace, blockId: block.id, inputName: input.name};
    const connection = resolveInputTarget(Blockly, workspace, target);
    if (!connection) continue;
    const element = connection.targetBlock()?.getSvgRoot() || input.outlinePath;
    if (element?.contains(event.target)) return target;
  }
  return null;
}

export function acceptsInputBlock(connection, blockType) {
  const output = blockType.workspaceForm.outputConnection;
  return Boolean(output && connection.checkType_(output));
}
