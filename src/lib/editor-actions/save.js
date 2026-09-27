import messages from './messages';

// The File menu saves to the server; the existing shortcut saves a local file.
export default (registry, getProps) => [
    registry.registerAction({
        id: 'builtin/save',
        title: messages.save,
        scopes: ['global'],
        allowInInput: true,
        defaultBindings: ['Mod+s'],
        enabled: () => Boolean(getProps().handleSaveProject || getProps().onClickSave),
        run: () => (getProps().handleSaveProject || getProps().onClickSave)()
    }),
    registry.registerAction({
        id: 'builtin/save-to-server',
        title: messages.save,
        internal: true,
        enabled: () => Boolean(getProps().canSave && getProps().onClickSave),
        run: () => getProps().onClickSave()
    })
];
