import {ActionRegistry} from '../../../src/lib/editor-actions/registry';
import registerBlockActions from '../../../src/lib/editor-actions/blocks';

const setup = () => {
    const registry = new ActionRegistry();
    const editor = {
        visible: true,
        blocked: false,
        Blockly: {
            Variables: {createVariable: jest.fn()},
            Procedures: {createProcedureDefCallback_: jest.fn()}
        },
        workspace: {
            options: {zoomOptions: {startScale: 0.75}},
            isDragging: jest.fn(() => false),
            getTopBlocks: jest.fn(() => [{}]),
            cleanUp: jest.fn(),
            zoomCenter: jest.fn(),
            setScale: jest.fn(),
            scrollCenter: jest.fn(),
            zoomToFit: jest.fn()
        }
    };
    const handles = registerBlockActions(registry, () => editor);
    const execute = id => registry.execute(`builtin/${id}`, {area: 'keyboard'});
    return {registry, editor, handles, execute};
};

test('creation uses live Blockly hooks and the current workspace without changing variable scope defaults', () => {
    const {editor, execute} = setup();
    // Addons may replace the creation hook after registration.
    editor.Blockly.Variables.createVariable = jest.fn();
    execute('create-variable');
    execute('create-list');
    execute('create-procedure');
    expect(editor.Blockly.Variables.createVariable.mock.calls).toEqual([
        [editor.workspace, null, ''], [editor.workspace, null, 'list']
    ]);
    expect(editor.Blockly.Procedures.createProcedureDefCallback_).toHaveBeenCalledWith(editor.workspace);
});

test('cleanup follows the active implementation and reset follows live custom zoom settings', () => {
    const {editor, execute} = setup();
    const original = editor.workspace.cleanUp;
    editor.workspace.cleanUp = jest.fn();
    execute('cleanup-blocks');
    expect(original).not.toHaveBeenCalled();
    expect(editor.workspace.cleanUp).toHaveBeenCalledTimes(1);
    execute('zoom-in');
    execute('zoom-out');
    expect(editor.workspace.zoomCenter.mock.calls).toEqual([[1], [-1]]);
    editor.workspace.options.zoomOptions.startScale = 1.25;
    execute('zoom-reset');
    expect(editor.workspace.setScale).toHaveBeenCalledWith(1.25);
    expect(editor.workspace.scrollCenter).toHaveBeenCalledTimes(1);
    execute('zoom-fit');
    expect(editor.workspace.zoomToFit).toHaveBeenCalledTimes(1);
});

test('commands reject hidden, read-only, modal and dragging workspaces and other editor scopes', () => {
    const {registry, editor, execute, handles} = setup();
    const ids = registry.listActions().map(action => action.id);
    expect(ids).toHaveLength(8);
    ids.forEach(id => {
        expect(registry.bindings(id)).toEqual([]);
        for (const area of ['stage', 'costumes', 'sounds', 'variables']) {
            expect(registry.execute(id, {area})).toBe(false);
        }
    });
    for (const key of ['visible', 'blocked']) {
        editor[key] = !editor[key];
        ids.forEach(id => expect(registry.execute(id)).toBe(false));
        editor[key] = !editor[key];
    }
    editor.workspace.options.readOnly = true;
    expect(execute('create-variable')).toBe(false);
    editor.workspace.options.readOnly = false;
    editor.workspace.isDragging.mockReturnValue(true);
    expect(execute('cleanup-blocks')).toBe(false);
    editor.workspace.isDragging.mockReturnValue(false);
    editor.workspace.getTopBlocks.mockReturnValue([]);
    expect(execute('cleanup-blocks')).toBe(false);
    expect(execute('zoom-fit')).toBe(false);
    execute('create-variable');
    expect(editor.Blockly.Variables.createVariable).toHaveBeenCalledTimes(1);
    handles.forEach(handle => handle.unregister());
    expect(registry.listActions()).toEqual([]);
    expect(execute('create-variable')).toBe(false);
});
