# Addons

Addons and translations are from the [Scratch Addons browser extension](https://scratchaddons.com/). Feature requests should be sent [upstream](https://github.com/ScratchAddons/ScratchAddons/issues), but bug reports should be opened here first incase it's a bug caused by TurboWarp.

The imported addon sources are now maintained manually in this repository. There is no local upstream patch pipeline. Review and merge upstream changes manually, preserving local integrations.

entry.js exports a function that begins running addons.

`pull.js` is a legacy bulk importer. It requires `--overwrite-local-addons` because it deletes and replaces local addon sources, translations and generated entries. It is not the normal update workflow.

Directory structure:

 - addons - the addons (maintained locally; initially imported by pull.js)
 - addons-l10n - addon translations used at runtime (maintained locally; initially imported by pull.js)
 - addons-l10n-settings - addon translations used by the settings page (maintained locally; initially imported by pull.js)
 - libraries - libraries used by addons (maintained locally; initially imported by pull.js)
 - generated - additional generated files (maintained locally; initially imported by pull.js)
 - settings - the settings page and its translations

## React translations

The editor window IntlProvider automatically merges runtime addon translations with
GUI messages under the
`addons.` namespace. For example, `debugger/tab-logs` becomes
`addons.debugger.tab-logs`, usable with `FormattedMessage` or `intl.formatMessage`.
Keep text in `addons-l10n/*.json`; do not duplicate addon messages in GUI locale
files or repeat English defaults in components. Missing translations fall back
to the English addon resource. Locale chunks are loaded lazily and cached; locale
changes update the provider without changing the tool's component identity.

The legacy `msg('tab-logs')` API keeps using `debugger/tab-logs` and shares the same
translation loader. Existing DOM content created with `msg()` retains its startup
text unless the addon explicitly refreshes it. React window components belong in
their own addon directory (for example `addons/debugger/window.jsx`).
