# Editor actions and keyboard shortcuts

`editor-actions` is the editor's command registry, separate from Redux actions.
It does not store functions, DOM nodes or shortcuts in project files. The GUI host
owns the capture listener; registered operations can also be used by a future
command palette. This release supports single strokes, not multi-stroke chords.

## Register and execute

```js
import actions from '../lib/editor-actions';

const handle = actions.registerAction({
    id: 'builtin/example',
    title: {id: 'gui.example', defaultMessage: 'Example'},
    category: 'editor',
    source: 'builtin',
    scopes: ['blocks'],
    defaultBindings: ['Mod+Shift+k'],
    enabled: () => Boolean(currentWorkspace),
    run: () => doSomething(currentWorkspace)
});

handle.execute(); // UI buttons use the same command as keyboard dispatch.
handle.update({run: () => doSomethingElse(currentWorkspace)});
handle.unregister();
```

IDs are stable and duplicate registrations throw. The returned handle's
`update` cannot change its ID. Read current props/state in callbacks instead of
capturing initial values; unregister when the owning component unmounts.
`title` should describe the operation (for example, “Switch to Code tab”), not
just its target. `titleValues` optionally supplies string or message-descriptor
values for a localized title template, as used by tool-window toggles.

`run()` may return a value or promise. Synchronous failures and rejected promises
produce a visible error notice. An unavailable/unregistered action returns false.

`execute(id, context?)` checks availability; passing context additionally checks
scope. Buttons omit keyboard context because their own UI determines the target.
`listActions(context?)` returns definitions, effective bindings and availability;
it keeps unavailable entries so a command palette can explain disabled commands.
`subscribe(listener)` returns an unsubscribe function. Consumers may refresh on
application state changes as well, since availability functions read live state.

Addon action names use descriptors such as `{id: 'addons.pause.action-toggle'}`.
Their English/translated strings live in `src/addons/blockdia-l10n/<locale>.json`
under `pause/action-toggle`, not the GUI action catalog. GUI-owned commands and
shared settings UI stay in the GUI catalog. Override upstream wording in the
Blockdia locale overlays; do not edit imported translation files.

Addon code uses `addon.tab.actions.register(definition)`, with a local ID such as
`toggle`. The bridge prefixes it with `addon/<addonId>/`, records the source, and
returns the same execute/update/unregister API. Handles stay dormant while the
addon is disabled and resume on re-enable. Addons that require reload still require
reload. Registered tool windows automatically get a toggle action:
`addon/<addonId>/<windowId>/toggle-window` (built-in windows: `builtin/window-<id>`).
It uses the same manager toggle as WindowToolbar: open, focus, or hide. Closing a
window keeps its action; unregistering the window removes the action.

## Context and keyboard dispatch

Scopes: `blocks`, `keyboard` (the IME-capable block-editing focus proxy),
`costumes`, `sounds`, `stage`, `window`; `editor` expands to all except stage,
and `global` includes stage. Overlap is computed from these explicit regions,
not arbitrary availability predicates. Two different predicates do not establish
that commands are mutually exclusive for the configuration UI.

Pointer/focus activity selects the stage or editor region; fullscreen and player
mode always select stage. Editing shortcuts do not fire while the stage owns
focus. Save/open are explicit global exceptions. Ordinary editable elements,
IME composition, pointer gestures and modal dialogs suppress command dispatch.
`allowInInput` opts a command's modified combinations into ordinary inputs.
The block keyboard proxy is distinguished from literal field editors; its
unmodified printable input remains reserved for type-to-search and IME.

Matching uses exact modifiers, case-normalized characters and portable `Mod`
(Cmd on macOS, Ctrl elsewhere). Option-letter/number uses the event code to
avoid macOS alternate-character substitution. Explicit Ctrl and Meta are also
supported. Key repeat never re-executes a command. A handled keydown is consumed
before old document listeners or VM input; keyup is always left to the existing
VM listener so previously pressed project keys cannot stick. Unmatched keys
continue down the existing path.

Escape, navigation, clipboard/undo/delete, sound-editing keys and known paint
keys remain reserved for the original components. See `context.js` for the
reservation table; extend it when integrating another legacy command. Bare
Escape remains contextual cancellation rather than a configurable global action.
Modal/child Escape handling precedes leaving fullscreen.

## Settings and persistence

Settings → Keyboard shortcuts lists actions with source and scope. Search,
source filtering, recording, per-binding removal, per-action reset and reset-all
are supported. Escape cancels recording; Save is explicit. Overlapping commands
require an explicit Replace, which removes only the conflicting combinations
from the other commands. Reserved editor interactions cannot be replaced.
Unexpected ambiguity (including newly enabled addons or restored defaults)
executes nothing and shows a notice. Conflict rows remain visible in settings.

Only overrides are persisted under `blockdia:shortcuts` as
`{version: 1, overrides: {actionId: ["Mod+k"]}}`.
Missing IDs use defaults, `[]` means explicitly unbound. Disabled addon overrides
remain stored. Invalid storage falls back to defaults; failed writes retain the
session's changes and show a notice. Settings are device-local, not synchronized
with addon settings or exported with the project.

## Initial commands and verification

Built-in commands: save/open, run/stop/turbo, editor tabs, toggle fullscreen,
shortcut settings and each tool window toggle. New commands have no default
binding. Addon migrations: pause, mute, find, history navigation, costume
navigation, mouse block search and keyboard block search. GUI costume navigation
uses the selection bridge, not a synthetic DOM click.

Sound editing, paint editing, Blockly editing and local input/navigation handlers
are intentionally not migrated in this release. Existing save/open, Alt+X,
Ctrl/Cmd+F, Ctrl/Cmd+Space and Ctrl/Cmd+Left/Right remain the defaults in their
applicable scopes. Defaults use portable `Mod`: Command on macOS and Control elsewhere.
Explicit user-defined Control/Meta bindings are preserved.

`internal: true` keeps an action callable by ID while excluding it from discovery,
shortcut matching and the settings list. Fullscreen entry/exit are internal; the
public `builtin/toggle-fullscreen` checks the current mode at execution time.
Old entry/exit binding overrides are merged into the toggle on load. This avoids
requiring two conflicting user bindings or introducing a general when-expression language.

`npm run test:unit` includes `test/unit/editor-actions`: registration and update,
async errors, input/IME/modal/drag protection, platform keys, rebinding, scope
conflicts/replacement, storage failure, addon lifecycle and window toggles.
Browser acceptance additionally checks recording/cancellation, persistence,
focus protection, alternate search contexts, modal Escape, theme and narrow
viewport layout. Browser-injected key tests are not native Windows/Linux or IME
end-to-end validation; OS-reserved shortcuts may never reach the browser.
