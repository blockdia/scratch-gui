// Structural positions contain identifiers only: connections are resolved on demand.
export const bodyPosition = block => ({blockId: block.id, kind: 'body'});

export function positionsForBlock(block, Blockly) {
  const positions = [bodyPosition(block)];
  const at = (kind, extra = {}) => ({blockId: block.id, kind, ...extra});
  if (block.previousConnection) positions.push(at('before'));
  if (!block.isCollapsed()) {
    for (const input of block.inputList) {
      if (input.isVisible && !input.isVisible()) continue;
      for (const field of input.fieldRow) {
        if (field.name && field.isCurrentlyEditable()) {
          positions.push(at('field', {inputName: input.name, fieldName: field.name}));
        }
      }
      if (input.connection) {
        positions.push(at(input.type === Blockly.NEXT_STATEMENT ? 'statement' : 'input', {inputName: input.name}));
      }
    }
  }
  if (block.nextConnection) positions.push(at('after'));
  return positions;
}

export const samePosition = (a, b) => a && b && a.blockId === b.blockId &&
  a.kind === b.kind && a.inputName === b.inputName && a.fieldName === b.fieldName;

export function resolvePosition(workspace, position, Blockly) {
  if (!position?.blockId) return null;
  const block = workspace.getBlockById(position.blockId);
  if (!block || block.isShadow() || block.isInsertionMarker()) return null;
  const valid = positionsForBlock(block, Blockly).some(p => samePosition(p, position));
  if (!valid) return {block, position: bodyPosition(block)};
  const input = position.inputName !== undefined ? block.getInput(position.inputName) : null;
  const field = position.kind === 'field' ? block.getField(position.fieldName) : null;
  const connection = position.kind === 'after' ? block.nextConnection :
    position.kind === 'before' ? block.previousConnection : input?.connection;
  return {block, position, input, field, connection};
}

export function parentPosition(block, Blockly) {
  // getParent includes a preceding stack block; getSurroundParent skips those.
  const parent = block.getSurroundParent();
  if (!parent) return null;
  const input = parent.inputList.find(i => {
    let child = i.connection?.targetBlock();
    while (child) {
      if (child === block) return true;
      child = child.getNextBlock();
    }
    return false;
  });
  return input ? {blockId: parent.id, kind: input.type === Blockly.NEXT_STATEMENT ? 'statement' : 'input',
    inputName: input.name} : bodyPosition(parent);
}

const inlinePositions = (block, Blockly) => positionsForBlock(block, Blockly)
  .filter(p => p.kind === 'field' || p.kind === 'input');
const header = (block, Blockly) => {
  const inputs = inlinePositions(block, Blockly);
  return inputs.length ? inputs : [bodyPosition(block)];
};
// Flatten one horizontal expression row, including real reporters but not shadow internals.
export function horizontalPositions(block, Blockly) {
  while (block.outputConnection && block.getSurroundParent()) block = block.getSurroundParent();
  const result = [];
  const visit = current => {
    for (const position of inlinePositions(current, Blockly)) {
      result.push(position);
      const child = position.kind === 'input' && current.getInput(position.inputName).connection.targetBlock();
      if (child && !child.isShadow()) visit(child);
    }
  };
  visit(block);
  return result;
}

const rootsInOrder = workspace => workspace.getTopBlocks(false)
  .filter(b => !b.isShadow() && !b.isInsertionMarker())
  .sort((a, b) => {
    const x = a.getRelativeToSurfaceXY();
    const y = b.getRelativeToSurfaceXY();
    return x.y - y.y || x.x - y.x;
  });

// Each entry is a visual row: inline slots, or one horizontal stack connection.
// A join between two blocks appears once, as the preceding block's after position.
export function navigationRows(root, Blockly) {
  const rows = [];
  const visit = first => {
    for (let block = first; block && !block.isShadow(); block = block.getNextBlock()) {
      rows.push(header(block, Blockly));
      for (const position of positionsForBlock(block, Blockly).filter(p => p.kind === 'statement')) {
        rows.push([position]);
        const child = block.getInput(position.inputName).connection.targetBlock();
        if (child) visit(child);
      }
      if (block.nextConnection) rows.push([{blockId: block.id, kind: 'after'}]);
    }
  };
  if (root.previousConnection && !root.previousConnection.targetConnection) rows.push([{blockId: root.id, kind: 'before'}]);
  visit(root);
  return rows;
}

const normalizeJoin = (workspace, position, Blockly) => {
  if (position.kind !== 'before') return position;
  const previous = workspace.getBlockById(position.blockId)?.previousConnection?.targetConnection;
  if (!previous) return position;
  const owner = previous.getSourceBlock();
  return positionsForBlock(owner, Blockly).find(p =>
    (p.kind === 'after' && owner.nextConnection === previous) ||
    (p.kind === 'statement' && owner.getInput(p.inputName).connection === previous)) || position;
};

export function navigate(workspace, position, key, {shiftKey = false, altKey = false} = {}, Blockly) {
  let resolved = resolvePosition(workspace, position, Blockly);
  let block = resolved?.block;
  const roots = rootsInOrder(workspace);
  if (altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const index = block ? roots.indexOf(block.getRootBlock()) : -1;
    const next = index < 0 ? roots[0] : roots[index + (key === 'ArrowDown' ? 1 : -1)];
    return next ? header(next, Blockly)[0] : position;
  }
  if (!block) {
    if (key === 'Tab' && shiftKey) return null;
    return roots[0] ? header(roots[0], Blockly)[0] : position;
  }
  position = normalizeJoin(workspace, resolved.position, Blockly);
  resolved = resolvePosition(workspace, position, Blockly);
  block = resolved.block;
  if (altKey && key === 'ArrowLeft') return parentPosition(block, Blockly) || position;
  if (altKey && key === 'ArrowRight') {
    const child = resolved.input?.connection?.targetBlock();
    return child && !child.isShadow() ? header(child, Blockly)[0] : position;
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    // Never switch between block/connection and input levels at a row boundary.
    if (!['body', 'field', 'input'].includes(position.kind)) return position;
    const inputs = inlinePositions(block, Blockly);
    const direction = (key === 'ArrowLeft' ? -1 : 1) * (workspace.RTL ? -1 : 1);
    const index = inputs.findIndex(p => samePosition(p, position));
    if (index < 0) return inputs[direction > 0 ? 0 : inputs.length - 1] || position;
    return inputs[index + direction] || position;
  }
  const rows = roots.flatMap(root => navigationRows(root, Blockly));
  if (key === 'Tab') {
    const inputs = horizontalPositions(block, Blockly);
    const index = inputs.findIndex(p => samePosition(p, position));
    return inputs[index < 0 ? (shiftKey ? inputs.length - 1 : 0) : index + (shiftKey ? -1 : 1)] || position;
  }
  if (shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
    while (block.outputConnection && block.getSurroundParent()) block = block.getSurroundParent();
    if (position.kind === 'statement') {
      const child = resolved.input.connection.targetBlock();
      if (!child) return position;
      block = child;
    }
    if (key === 'ArrowUp') {
      while (block.getPreviousBlock()?.getNextBlock() === block) block = block.getPreviousBlock();
      const parent = parentPosition(block, Blockly);
      return parent?.kind === 'statement' ? parent :
        block.previousConnection ? {blockId: block.id, kind: 'before'} : header(block, Blockly)[0];
    }
    while (block.getNextBlock()) block = block.getNextBlock();
    return block.nextConnection ? {blockId: block.id, kind: 'after'} : header(block, Blockly)[0];
  }

  const index = rows.findIndex(row => row.some(p => samePosition(p, position)) ||
    (position.kind === 'body' && row[0].blockId === block.id && ['input', 'field'].includes(row[0].kind)));
  // Reporter nesting changes only with Alt+Left/Right.
  if (index < 0) return position;
  const row = rows[index + (key === 'ArrowDown' ? 1 : -1)];
  if (!row) return position;
  const column = Math.max(0, rows[index].findIndex(p => samePosition(p, position)));
  return row[Math.min(column, row.length - 1)];
}

export function firstPosition(block, Blockly) {
  const positions = positionsForBlock(block, Blockly);
  return positions.find(p => p.kind === 'field' || p.kind === 'input') ||
    positions.find(p => p.kind === 'statement') || positions.find(p => p.kind === 'after') || positions[0];
}

export function editableField(resolved) {
  if (resolved?.field) return resolved.field;
  const child = resolved?.input?.connection?.targetBlock();
  if (!child?.isShadow()) return null;
  for (const input of child.inputList) {
    const field = input.fieldRow.find(f => f.isCurrentlyEditable());
    if (field) return field;
  }
  return null;
}

// Plan connections before modifying the workspace; never displace a subsequent stack
// unless it can be reattached. Blockly.connect preserves shadow DOM and displaced values.
export function insertionPlan(workspace, position, newBlock, Blockly) {
  if (!newBlock.outputConnection && !newBlock.previousConnection && newBlock.nextConnection) return {kind: 'hat'};
  const resolved = resolvePosition(workspace, position, Blockly);
  if (!resolved) return {kind: 'drag'};
  const compatible = (a, b) => a && b && a.canConnectWithReason_(b) === Blockly.Connection.CAN_CONNECT;
  if (newBlock.outputConnection) {
    const connection = resolved.position.kind === 'input' ? resolved.input?.connection : null;
    return compatible(connection, newBlock.outputConnection) ?
      {kind: 'connect', parent: connection, child: newBlock.outputConnection} : {kind: 'drag'};
  }
  if (!newBlock.previousConnection) return {kind: 'drag'};
  let tail = newBlock;
  while (tail.getNextBlock()) tail = tail.getNextBlock();
  if (resolved.position.kind === 'before' && !resolved.block.previousConnection.targetConnection) {
    return compatible(tail.nextConnection, resolved.block.previousConnection) ?
      {kind: 'before', parent: tail.nextConnection, child: resolved.block.previousConnection} : {kind: 'drag'};
  }
  const connection = resolved.position.kind === 'before' ? resolved.block.previousConnection.targetConnection :
    resolved.position.kind === 'statement' ? resolved.input.connection :
    resolved.position.kind === 'after' ? resolved.block.nextConnection :
    positionsForBlock(resolved.block, Blockly).filter(p => p.kind === 'statement')
      .map(p => resolved.block.getInput(p.inputName).connection)[0] || resolved.block.nextConnection;
  if (!compatible(connection, newBlock.previousConnection)) return {kind: 'drag'};
  const next = connection.targetBlock();
  if (next && !next.isShadow() && !compatible(tail.nextConnection, next.previousConnection)) return {kind: 'drag'};
  return {kind: 'connect', parent: connection, child: newBlock.previousConnection};
}
