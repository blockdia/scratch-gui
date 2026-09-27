import {ActionRegistry} from '../../../src/lib/editor-actions/registry';
import registerSaveActions from '../../../src/lib/editor-actions/save';

test('server save keeps its destination when a local smart-save handler is present', () => {
    const registry = new ActionRegistry();
    let props = {canSave: true, onClickSave: jest.fn(), handleSaveProject: jest.fn()};
    const handles = registerSaveActions(registry, () => props);
    registry.execute('builtin/save-to-server');
    expect(props.onClickSave).toHaveBeenCalledTimes(1);
    expect(props.handleSaveProject).not.toHaveBeenCalled();

    registry.execute('builtin/save');
    expect(props.handleSaveProject).toHaveBeenCalledTimes(1);
    expect(props.onClickSave).toHaveBeenCalledTimes(1);
    expect(registry.bindings('builtin/save')).toEqual(['Mod+s']);
    expect(registry.listActions().map(action => action.id)).toEqual(['builtin/save']);

    props = {...props, canSave: false};
    expect(registry.execute('builtin/save-to-server')).toBe(false);
    expect(props.onClickSave).toHaveBeenCalledTimes(1);
    registry.execute('builtin/save');
    expect(props.handleSaveProject).toHaveBeenCalledTimes(2);

    props = {...props, canSave: true, onClickSave: jest.fn()};
    registry.execute('builtin/save-to-server');
    expect(props.onClickSave).toHaveBeenCalledTimes(1);
    handles.forEach(handle => handle.unregister());
    expect(registry.execute('builtin/save-to-server')).toBe(false);
    expect(registry.execute('builtin/save')).toBe(false);
});
