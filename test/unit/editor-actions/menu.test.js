import {ActionRegistry} from '../../../src/lib/editor-actions/registry';
import registerMenuActions from '../../../src/lib/editor-actions/menu';

const menuProps = () => ({
    canSave: true,
    canManageFiles: true,
    onClickSave: jest.fn(),
    handleSaveProject: jest.fn(),
    onStartSelectingFileUpload: jest.fn()
});

test.each(['old', 'new'])('overlapping menus keep actions alive when the %s menu unmounts first', first => {
    const registry = new ActionRegistry();
    const oldProps = menuProps();
    const newProps = menuProps();
    const oldCleanup = registerMenuActions(registry, () => oldProps);
    const newCleanup = registerMenuActions(registry, () => newProps);
    expect(registry.definitions.size).toBe(3);
    registry.execute('builtin/save');
    expect(newProps.handleSaveProject).toHaveBeenCalledTimes(1);
    expect(oldProps.handleSaveProject).not.toHaveBeenCalled();

    const cleanup = first === 'old' ? oldCleanup : newCleanup;
    const remainingCleanup = first === 'old' ? newCleanup : oldCleanup;
    const remainingProps = first === 'old' ? newProps : oldProps;
    cleanup();
    cleanup(); // A stale cleanup must not remove the remaining owner's actions.
    registry.execute('builtin/save-to-server');
    registry.execute('builtin/open');
    expect(remainingProps.onClickSave).toHaveBeenCalledTimes(1);
    expect(remainingProps.onStartSelectingFileUpload).toHaveBeenCalledTimes(1);
    expect(registry.bindings('builtin/save')).toEqual(['Mod+s']);
    expect(registry.bindings('builtin/open')).toEqual(['Mod+o']);
    remainingCleanup();
    expect(registry.definitions.size).toBe(0);

    const remountCleanup = registerMenuActions(registry, () => oldProps);
    registry.execute('builtin/save');
    expect(oldProps.handleSaveProject).toHaveBeenCalledTimes(1);
    remountCleanup();
    expect(registry.definitions.size).toBe(0);
});

test('menu actions follow updated props and permissions', () => {
    const registry = new ActionRegistry();
    let props = menuProps();
    const cleanup = registerMenuActions(registry, () => props);
    props = {...menuProps(), canSave: false, canManageFiles: false};
    expect(registry.execute('builtin/save-to-server')).toBe(false);
    expect(registry.execute('builtin/open')).toBe(false);
    registry.execute('builtin/save');
    expect(props.handleSaveProject).toHaveBeenCalledTimes(1);
    expect(props.onClickSave).not.toHaveBeenCalled();
    expect(props.onStartSelectingFileUpload).not.toHaveBeenCalled();
    cleanup();
});

test.each(['builtin/save', 'builtin/save-to-server', 'builtin/open'])(
    'failed registration rolls back its own actions while preserving %s', id => {
        const registry = new ActionRegistry();
        const existing = registry.registerAction({id, run: jest.fn()});
        expect(() => registerMenuActions(registry, menuProps)).toThrow('Duplicate or invalid action');
        expect([...registry.definitions.keys()]).toEqual([id]);
        existing.unregister();
        const cleanup = registerMenuActions(registry, menuProps);
        expect(registry.definitions.size).toBe(3);
        cleanup();
        expect(registry.definitions.size).toBe(0);
    }
);
