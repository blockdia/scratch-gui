import messages from './messages';
import registerSaveActions from './save';

const registrations = new WeakMap();

// The homepage and editor menus can overlap during a Redux mode transition.
// Keep one set of actions, using the most recently mounted menu's live props.
export default (registry, getProps) => {
    let registration = registrations.get(registry);
    const owner = {getProps};
    if (registration) {
        registration.owners.push(owner);
        registry.emit();
    } else {
        registration = {owners: [owner], handles: []};
        const currentProps = () => registration.owners[registration.owners.length - 1].getProps();
        try {
            registerSaveActions(registry, currentProps, registration.handles);
            registration.handles.push(registry.registerAction({
                id: 'builtin/open',
                title: messages.open,
                source: 'builtin',
                scopes: ['global'],
                allowInInput: true,
                defaultBindings: ['Mod+o'],
                enabled: () => Boolean(currentProps().canManageFiles && currentProps().onStartSelectingFileUpload),
                run: () => currentProps().onStartSelectingFileUpload()
            }));
        } catch (error) {
            registration.handles.forEach(handle => handle.unregister());
            throw error;
        }
        registrations.set(registry, registration);
    }
    return () => {
        const index = registration.owners.indexOf(owner);
        if (index === -1) return;
        if (registration.owners.length === 1) {
            // Keep props available to subscribers while unregistering the actions.
            registration.handles.forEach(handle => handle.unregister());
            registrations.delete(registry);
        }
        registration.owners.splice(index, 1);
        registry.emit();
    };
};
