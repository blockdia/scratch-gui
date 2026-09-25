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

Addon changes are recorded in `src/addons/patches/editor-windows.json`.
`pull.js` applies these after asset import rewriting and fails on source drift.
Update the patch and checked-in output together when rebasing upstream changes.

`npm run test:unit` includes window state, focus ownership, lifecycle, gesture,
Escape, overflow and patch regression tests. The extra test windows exist only
in tests. Browser acceptance covers toolbar toggling, outside dismissal,
move/resize, cross-tab pinning, close/reset with preserved logs, fullscreen
restore and both themes. Also check the existing find bar and modal layering.

Performance sampling retains the upstream behavior: FPS and clone-count history
continue in the background; charts update only while the performance tab is visible.
