# Keyboard Editing Mode

Enable **Edit → Turn on Keyboard Editing Mode**, or enable **Keyboard Editing Mode**
in addon settings. The mode is off by default. Its preferences are stored in the
browser and do not change SB3 files or VM interfaces.

Keyboard editing and **Insert blocks by name** (`middle-click-popup`) are independent
addons. Either can run on its own. They share one search window and the same search
syntax, indexing, previews, and block creation code. Each addon has its own popup
size settings.

## Focus and navigation

Click a block, input, connection, or empty workspace area to position the cursor.
The code workspace also participates in the browser's Tab order. Once it has focus,
typing opens block search and retains the first character. Composition input is
supported, including Chinese IMEs.

| Key | Action |
| --- | --- |
| Left / Right | Move between the current block's inline fields and inputs. Direction follows RTL layouts. |
| Up / Down | Move through blocks, stack connections, and substack entries in visual order. A shared connection is visited once. |
| Tab / Shift+Tab | Move forward / backward through inline parameters, including nested reporters and boolean blocks. Does not enter substacks. |
| Shift+Up / Shift+Down | Jump to the start / end of the current stack or substack. A terminal block has no bottom connection, so the cursor stops on that block. |
| Alt+Right / Alt+Left | Enter a real nested reporter / return to its containing input. |
| Alt+Up / Alt+Down | Switch top-level scripts, ordered from top to bottom and then left to right. |
| Enter | Edit a literal, toggle a boolean literal, open a native dropdown, or search when the position has no editable field. |
| Ctrl/Cmd+Space | Open search at the structural cursor. |
| Escape | Release workspace focus. |

Navigation stops at boundaries instead of wrapping. Shadow blocks are represented
by their parent input, without duplicate stops. A cursor in an empty workspace
retains a position for searching. Input outlines follow Blockly's actual SVG shapes;
stack connections have an insertion marker, and the empty-workspace dot is centered
on the pointer position.

On macOS, the shortcut hint uses **Option** and **Cmd**. Other platforms show **Alt**
and **Ctrl**.

## Editing parameters and searching

Enter opens Blockly's native field editor or dropdown, retaining native validation.
In a text field, Tab and Shift+Tab move to the next or previous text-editable
parameter across reporter nesting and update the structural cursor as well. At the
first or last field, focus stays in place. Enter commits; Escape cancels and restores
workspace focus. Enter toggles boolean literals; a real boolean block is never
removed by this action. Space has no boolean-specific binding and follows normal
search typing behavior.

Inside search:

- Up / Down select a result.
- Tab accepts completion.
- Escape clears the query first, then closes search and returns focus.
- Enter attempts automatic placement.
- Cmd+Enter on macOS, or Ctrl+Enter on Windows/Linux, always starts mouse dragging.
- Clicking a result preserves the existing mouse-dragging behavior.

Search is anchored to the structural cursor. Mouse placement uses a separate last
valid workspace pointer position, so keyboard navigation does not move that anchor.

## Placement and undo

- **Hat blocks:** place at the last valid workspace pointer position without dragging.
  If no valid position exists, use the visible workspace center.
- **Stack blocks:** insert at an explicitly selected connection. From a C-shaped
  block's body or parameter, prefer its first visible substack; otherwise use the
  owning block's bottom connection. Existing successors attach to the new stack's
  tail. Inserting before a top-level stack keeps the existing stack in place.
- **Reporter and boolean blocks:** use the selected input only, subject to Blockly's
  actual connection compatibility checks. Displaced real blocks are preserved nearby;
  shadow inputs retain native restoration behavior. Dropdown-only fields are not
  reporter connection targets.
- **No compatible target:** start the existing mouse-dragging flow. No other input or
  nesting level is searched. A terminal block also falls back to dragging if automatic
  insertion would displace a successor that cannot be reattached.

After automatic placement, the cursor moves to the new block's first editable
parameter, then its first substack entry, then its bottom connection, then its body.
Creation, connection, displacement, and placement share one undo group. Failed
creation removes partial blocks and restores Blockly event and workspace resize state.

## Ownership and lifecycle

Only the current editable code workspace handles navigation. Menus, dialogs, native
field editors, search, and dragging retain input priority. Consumed editing keys do
not also press stage keys; key releases can still clear keys held before focus changed.

Positions store block IDs and field/input/connection identifiers, resolved against
the current workspace. Deletion, undo, mutations, sprite switches, and project loads
revalidate or clear the cursor. Scrolling, zooming, and block layout changes update
its outline; keyboard navigation scrolls offscreen targets into view. Leaving the
Code tab pauses the mode. Disabling it removes keyboard interception and restores
the workspace's original tab stop.

## Implementation

- `keyboard-navigation.js`: structural positions, horizontal traversal, visual stack
  navigation, and connection planning.
- `keyboard-editor.js`: workspace focus, native field editing, composition input,
  cursor rendering, keyboard handling, and lifecycle.
- `userscript.js`: connects this addon to the shared search service.
- `../../libraries/block-search/`: shared query engine, renderer, popup, creation
  transactions, size settings, and styles.
- `../middle-click-popup/userscript.js`: the legacy mouse and shortcut entry points.
- `../../../containers/keyboard-editing-menu.jsx`: the Edit menu's settings-store toggle.

The search service is a singleton. The keyboard addon supplies insertion planning;
the shared search module does not import structural navigation. Shared styles use
addon-dependent stylesheet activation so disabling either consumer does not remove
the other consumer's styles.

## Validation

Run against the actual `scratch-blocks` package installed by the GUI:

```sh
npm run test:unit -- --runInBand
npm run build
node_modules/.bin/jest test/integration/keyboard-editing.test.js --runInBand
```

The Chrome integration suite starts a temporary local server for `build/`, opens an isolated
browser session, and closes both afterward. Set `CHROMEDRIVER_PATH` to a driver matching
your Chrome installation. `KEYBOARD_TEST_URL` selects an existing editor server;
`KEYBOARD_SCREENSHOTS` saves theme and outline screenshots. The delayed-load regression
requires the suite's own server and is skipped with an external URL.

Coverage includes search and composition events, hats, stack heads/tails and shared
joins, empty and occupied substacks, if/else branches, terminal blocks, reporter
replacement, native field focus, boolean toggles, dropdowns, undo, forced dragging,
failed creation, settings synchronization, independent addon activation, and disabling
an addon before its runtime finishes loading. Geometry checks cover light/dark themes,
normal/Compact layouts, small/large stage layouts, zoom, and scrolling.

Composition tests synthesize browser composition events; they do not automate the
operating system's IME candidate picker.

A separate Playwright release check covers a second browser without changing the
repository's legacy Selenium dependency:

```sh
KEYBOARD_BROWSER=firefox node scripts/verify-keyboard-editing.cjs
```

This requires Playwright and its browser binary. Set `KEYBOARD_PLAYWRIGHT_PATH` to an
existing Playwright package directory if it is not available through Node's normal
module resolution. `KEYBOARD_BROWSER` accepts `firefox`, `chromium`, or `webkit`;
the script also supports `KEYBOARD_TEST_URL` and `KEYBOARD_SCREENSHOTS`. It exercises
independent keyboard-only startup, nested input traversal, native field focus,
boolean editing, substack insertion and undo, forced dragging, composition events,
and disabling the mode. Both harnesses fail on unexpected page errors.
