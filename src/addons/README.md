# Addons

Addons and translations are from the [Scratch Addons browser extension](https://scratchaddons.com/). Feature requests should be sent [upstream](https://github.com/ScratchAddons/ScratchAddons/issues), but bug reports should be opened here first incase it's a bug caused by TurboWarp.

The imported addon sources are now maintained manually in this repository. There is no local upstream patch pipeline. Review and merge upstream changes manually, preserving local integrations.

entry.js exports a function that begins running addons.

`pull.js` is a legacy bulk importer. It requires `--overwrite-local-addons` because it deletes and replaces local addon sources, translations and generated entries. It is not the normal update workflow.

Directory structure:

 - addons - the addons (maintained locally; initially imported by pull.js)
 - addons-l10n - addon translations used at runtime (maintained locally; initially imported by pull.js)
 - addons-l10n-settings - addon translations used by the settings page (maintained locally; initially imported by pull.js)
 - blockdia-l10n - Blockdia runtime additions and overrides, loaded after upstream translations
 - blockdia-l10n-settings - Blockdia settings additions and overrides (English defaults stay in addon manifests)
 - libraries - libraries used by addons (maintained locally; initially imported by pull.js)
 - generated - additional generated files (maintained locally; initially imported by pull.js)
 - settings - the settings page and its translations

## React translations

The editor window IntlProvider automatically merges runtime addon translations with
GUI messages under the
`addons.` namespace. For example, `debugger/tab-logs` becomes
`addons.debugger.tab-logs`, usable with `FormattedMessage` or `intl.formatMessage`.
Keep upstream text in `addons-l10n/*.json` and Blockdia additions or overrides in
`blockdia-l10n/*.json`; do not duplicate addon messages in GUI locale files or repeat
English defaults in components. Runtime merge order is upstream English, Blockdia
English, upstream locale, then Blockdia locale. Settings translations similarly
apply `blockdia-l10n-settings` after `addons-l10n-settings`, falling back to the
English addon manifest. Register new overlay locales in the corresponding
`blockdia-l10n*/index.js`; these indexes are maintained manually and are not
replaced by `pull.js`. Preserve existing message IDs when moving text into an overlay. Missing translations fall back
to the English addon resource. Locale chunks are loaded lazily and cached; locale
changes update the provider without changing the tool's component identity.

The legacy `msg('tab-logs')` API keeps using `debugger/tab-logs` and shares the same
translation loader. Existing DOM content created with `msg()` retains its startup
text unless the addon explicitly refreshes it. React window components belong in
their own addon directory (for example `addons/debugger/window.jsx`).

## Debugger defaults

The debugger is enabled by default, with its window initially closed. Project diagnostics mark the toolbar button
as unread without opening the window. Explicitly saved addon enable/disable preferences take precedence.
`show_blocks` defaults to false and requires reloading the editor when changed. It hides the four debugger blocks
from the palette while retaining their VM registration, existing project blocks and execution behavior.
The addon API's `addBlock(..., {hidden: true})` forwards the VM's existing palette visibility option.
Disabling the debugger requires reloading the page; it has no dynamic teardown/reload support. Its VM subscription
and settings listener share the page lifetime and remain active while the debugger window is hidden or closed.

Native clones, clones with IDs and whole-container clones share the existing `log_failed_clone_creation` switch
and clone-limit wording. The switch immediately controls the log view, unread indicators and exports; other
diagnostics such as invalid IDs remain visible. VM history is independent of this display preference.
All limits reuse the upstream localized message. During webpack builds, `scripts/loaders/addon-translations.js`
replaces the literal `300` in `debugger/log-msg-clone-cap` with `{limit}`, for both English and lazy locale chunks.
Upstream JSON files stay unchanged; the debugger simply supplies `sprite` and `limit` to the formatter.
The build fails if this message contains neither `{limit}` nor exactly one literal `300`, preventing silent drift
when upstream wording changes. Locale files missing the message keep the normal English fallback.

The shared VM cache retains the latest 1000 records, down from the old debugger's 200000. Consecutive identical
messages share one record with a repeat count. Old records are evicted when the cache is full and cannot be exported.
Shift-click **Export** to customize the format: `{sprite}` (sprite name), `{content}` (message), `{type}` (level),
`{count}` (repeat count), `{source}` (origin), and `{code}` (diagnostic code). Repeats also receive a `×count` suffix.

### Manual log integration checks

The GUI CI runs unit tests, including the logger adapter, settings and all available clone-limit translations.
The browser scripts below are manual integration checks against coordinated GUI/VM/renderer sources; they are not
CI coverage. Install sibling dependencies and provide a Playwright installation with Chromium first.

In terminal 1, from scratch-gui:

```sh
BLOCKDIA_LOCAL_PACKAGES=1 PORT=8630 npm start -- --host 127.0.0.1
```

After the editor has compiled, in terminal 2:

```sh
node scripts/verify-runtime-logs.cjs
node scripts/verify-clone-limit-logs.cjs
node scripts/verify-perspective-logs.cjs
```

The scripts default to `http://127.0.0.1:8630/editor.html`. Set `COMPONENTS_EDITOR_URL` to use another server,
`COMPONENTS_PLAYWRIGHT_PATH` to use a Playwright module outside node_modules, or `COMPONENTS_CHROME_PATH` to use
an existing browser executable. Without the browser override, Playwright uses its installed Chromium.

## Block search and keyboard editing

[`keyboard-editing`](addons/keyboard-editing/README.md) is an independently enabled addon controlled by the Edit menu
and addon settings. `middle-click-popup` owns the legacy mouse and Ctrl/Command+Space
entry points. Neither addon enables the other.

Shift-clicking an input opens search for blocks that fit it. Clicking a result or
pressing Enter inserts it there without dragging; creation and connection share one
undo step. Inputs already holding a non-shadow block, non-input fields, and flyout
blocks retain their usual click behavior. This works independently of
keyboard editing. Closing search clears the target, and insertion revalidates it
against the current workspace and sprite.

Both use the singleton in `libraries/block-search/popup.js` for indexing, preview,
search and block creation. The keyboard addon supplies structural insertion planning;
the search library does not import keyboard navigation. Shared CSS uses the existing
conditional stylesheet system so disabling one consumer leaves the other styled.
Each addon stores its own popup size settings.
