# Editor windows

`WindowHost` lives above GUI/player mode switches. `WindowToolbar` occupies the
remaining space next to the editor tabs. The manager is scoped to the editor
session; geometry is not saved to project files or local storage.

## Register a tool

GUI tools import the default manager from `./manager` and call
`registerWindow(definition)`. Addons use `addon.tab.createWindow(definition)`;
the bridge prefixes the ID with the addon ID and unregisters windows on disable.
The returned addon handle remains usable after re-enable. Addons without dynamic
disable support (including debugger) retain their existing reload requirement;
window cleanup occurs when that settings change is applied.

```js
const window = addon.tab.createWindow({
    id: 'inspector',
    title: {id: 'gui.inspector.title', defaultMessage: 'Inspector'},
    icon: addon.self.getResource('/inspector.svg'),
    content: contentElement,
    size: {width: 565, height: 400},
    minimum: {width: 360, height: 240},
    onShow: () => startRendering(),
    onHide: () => stopRendering(),
    onReset: () => resetView(),
    onDestroy: () => releaseViewResources()
});
window.open();
```

`title` accepts a string or a react-intl message descriptor. Icons are monochrome
SVG masks using the current theme foreground. GUI tools may provide `render()`
instead of a DOM `content` element. Keep persistent tool data outside the view.
`onReset` must reset its controls and view state without deleting project data or
changing runtime state. Re-enabling a disabled addon must be able to reuse or
recreate its supplied content after `onDestroy`.

Handles expose `open({pinned})`, `focus()`, `hide()`, `close()`,
`setPinned(boolean)`, `setUnread(boolean)`, `unregister()`, and `own(element)`.
`own` registers a portal/menu as part of a window and returns a cleanup function.
Always release owned elements when their portal unmounts. DOM references and
callbacks stay in the registry; only serializable window state is mirrored to
`scratchGui.editorWindows` in Redux. Change state through the manager.

## Behavior

- Toolbar: open/resume, focus/raise, or hide when already active. Double-click to open and pin.
- A temporary window hides on editor pointer/focus activity outside itself,
  its trigger and its owned portals. Browser/app blur is ignored.
- Drag/resize has a 4px threshold and automatically pins.

- Hidden windows keep content and geometry; closed windows reset view, geometry
  and pinning. Escape hides unless a child handled the key.
- Pinned windows survive editor tab changes. Fullscreen/player mode suspends
  their rendering and restores them on return; temporary windows stay hidden.
- Project loads reset window/view state. Debugger logs and VM state retain their
  existing independent lifecycle. Breakpoints explicitly open and pin debugger.
- The visible editor body bounds geometry. Default/minimum debugger sizes are
  565×400 / 360×240, with viewport constraints taking precedence.

## Maintenance and verification

Addon sources are maintained manually in this repository. Update debugger source
and its React window directly; there is no upstream patch pipeline.

`npm run test:unit` includes window state, focus ownership, lifecycle, gesture,
Escape, overflow and React lifecycle regression tests. The extra test windows exist only
in tests. Browser acceptance covers toolbar toggling, outside dismissal,
move/resize, cross-tab pinning, close/reset with preserved logs, fullscreen
restore and both themes. Also check the existing find bar and modal layering.

Performance sampling retains the upstream behavior: FPS and clone-count history
continue in the background; charts update only while the performance tab is visible.

## React addon windows

Locally bundled addons can pass a React component to the existing bridge:

```jsx
import React from 'react';

export default function ({addon, msg}) {
    // Define the component once, outside render callbacks. Persistent tool data
    // belongs outside the component; local UI state resets when the window closes.
    const Inspector = ({visible, locale, direction, theme}) => {
        const [targetName, setTargetName] = React.useState('');
        React.useEffect(() => {
            if (!visible) return undefined;
            const vm = addon.tab.traps.vm;
            const refresh = () => setTargetName(vm.editingTarget ? vm.editingTarget.getName() : '');
            refresh();
            vm.on('targetsUpdate', refresh);
            return () => vm.removeListener('targetsUpdate', refresh);
        }, [visible]);
        return <div lang={locale} dir={direction} data-theme={theme}>{targetName}</div>;
    };
    return addon.tab.createWindow({
        id: 'target-inspector',
        title: msg('title'),
        component: Inspector
    });
}
```

React and ReactDOM must be 16.8 or newer within the supported React 16 range (Hooks).
Use the GUI's `react` dependency; do not bundle another React copy or create a
separate ReactDOM root. JSX is supported by the existing local source build.
This is a bundled-addon API, not a loader for remote npm packages. Files under `src/addons/addons` are maintained manually. The legacy `pull.js`
importer requires `--overwrite-local-addons` because it replaces local sources.

`component` is exclusive with `content` and `render`. It receives `visible`,
`locale`, `direction` (`ltr` / `rtl`) and `theme` (the GUI theme name) as live props.
The host's React context is retained, but addons should use these props and
existing addon APIs rather than depending on internal Redux state. Theme CSS
should inherit the editor's CSS color variables; the theme name is available for explicit variants.

The component mounts on first open. Hiding, switching to player or fullscreen
retains its local state and sets `visible=false`; effects doing background work
must stop when visibility changes. Closing or loading a project unmounts the
view, so reopening starts with fresh local UI state. Disabling, unregistering or
unmounting the editor also unmounts it and runs effect cleanup. Re-enabling uses
the same addon handle and creates a fresh view on the next open. Lifecycle
callbacks keep their existing meaning; release React subscriptions in effect
cleanup rather than depending on `onDestroy` ordering. Menus rendered into
portals should register with `handle.own(element)` and release ownership on cleanup.

React render and lifecycle failures are isolated to the affected tool window.
Closing and reopening retries its view. Event-handler and asynchronous errors
remain the responsibility of the addon. Registrations created while disabled
remain dormant until re-enabled; unregistering removes them permanently.

Debugger uses a React shell for tabs, warning and view lifecycle. Its existing
DOM log/threads/chart engines retain data outside that shell. Debugger still
requires reload on addon enable/disable because its VM hooks are not dynamically
removable; React window support does not change that manifest contract.
