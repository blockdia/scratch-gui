import messages from './messages';

// Resolve the workspace and Blockly methods at execution time: addons can wrap
// creation, cleanup and zoom after the editor has mounted.
export default (registry, getEditor) => {
    const available = () => {
        const {workspace, visible, blocked} = getEditor();
        return Boolean(workspace && visible && !blocked && !workspace.options.readOnly &&
            !workspace.isDragging());
    };
    const definitions = [
        ['create-variable', messages.createVariable, ({Blockly, workspace}) =>
            Blockly.Variables.createVariable(workspace, null, '')],
        ['create-list', messages.createList, ({Blockly, workspace}) =>
            Blockly.Variables.createVariable(workspace, null, 'list')],
        ['create-procedure', messages.createProcedure, ({Blockly, workspace}) =>
            Blockly.Procedures.createProcedureDefCallback_(workspace)],
        ['cleanup-blocks', messages.cleanupBlocks, ({workspace}) => workspace.cleanUp(), true],
        ['zoom-in', messages.zoomIn, ({workspace}) => workspace.zoomCenter(1)],
        ['zoom-out', messages.zoomOut, ({workspace}) => workspace.zoomCenter(-1)],
        ['zoom-reset', messages.zoomReset, ({workspace}) => {
            workspace.setScale(workspace.options.zoomOptions.startScale);
            workspace.scrollCenter();
        }],
        ['zoom-fit', messages.zoomFit, ({workspace}) => workspace.zoomToFit(), true]
    ];
    return definitions.map(([id, title, run, needsBlocks]) => registry.registerAction({
        id: `builtin/${id}`,
        title,
        scopes: ['blocks', 'keyboard'],
        enabled: () => available() && (!needsBlocks || getEditor().workspace.getTopBlocks(false).length > 0),
        run: () => run(getEditor())
    }));
};
