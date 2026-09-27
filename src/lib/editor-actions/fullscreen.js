import messages from './messages';

// Explicit entry/exit remain callable by buttons and Escape, while users bind one toggle.
export default (registry, isFullscreen, setFullscreen) => [
    registry.registerAction({
        id: 'builtin/fullscreen',
        title: messages.fullscreen,
        scopes: ['global'],
        internal: true,
        enabled: () => !isFullscreen(),
        run: () => setFullscreen(true)
    }),
    registry.registerAction({
        id: 'builtin/exit-fullscreen',
        title: messages.exitFullscreen,
        scopes: ['global'],
        internal: true,
        enabled: () => isFullscreen(),
        run: () => setFullscreen(false)
    }),
    registry.registerAction({
        id: 'builtin/toggle-fullscreen',
        title: messages.toggleFullscreen,
        scopes: ['global'],
        defaultBindings: ['Alt+f'],
        run: () => registry.execute(isFullscreen() ? 'builtin/exit-fullscreen' : 'builtin/fullscreen')
    })
];
