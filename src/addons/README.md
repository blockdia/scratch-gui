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

## Block search and keyboard editing

[`keyboard-editing`](addons/keyboard-editing/README.md) is an independently enabled addon controlled by the Edit menu
and addon settings. `middle-click-popup` owns the legacy mouse and Ctrl/Command+Space
entry points. Neither addon enables the other.

Both use the singleton in `libraries/block-search/popup.js` for indexing, preview,
search and block creation. The keyboard addon supplies structural insertion planning;
the search library does not import keyboard navigation. Shared CSS uses the existing
conditional stylesheet system so disabling one consumer leaves the other styled.
Each addon stores its own popup size settings.
