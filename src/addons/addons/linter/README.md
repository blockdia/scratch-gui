# Code checks

An opt-in React editor window. This addon reads project data; it never executes
primitives, compiles scripts, applies fixes or adds SB3 metadata. Its rule
switches use the existing addon settings store. URL-configured addons retain the
host's temporary-settings behavior.

Warnings describe potential behavior problems, not invalid programs. Suggestions
identify data with no statically visible use. Unknown extensions and dynamic
sprite names are not inferred; affected coverage is reported. Variable use is deliberately conservative: writes,
loose blocks, visible monitors and possible dynamic `sensing_of` reads all count.
Cloud variables are excluded. All original targets are checked; clones are not.

## Problems panel

Results are compact rows grouped by target. Click a row to select it and navigate;
arrow keys move focus, Enter/Space activate, and Left/Right collapse or expand a
target. Search matches all entered words across the message, target, rule and
location. Escape clears a nonempty search or closes the filter panel. Filters and
rule switches live behind the filter icon; Details shows the selected issue's
reason and related waiting operations. Diagnostic icons use Microsoft Codicons
(the pinned source and CC BY 4.0 license are in `icons/`).

Builtin opcode names are not translated or displayed by this addon. Locations
retain user-defined variable/list and procedure names; related waiting operations
use numbered navigation links. This avoids a duplicate block translation table.

## Warp checks

`semantics.js` contains the explicit builtin and bundled extension operation table. It is grounded in
`scratch-vm/src/blocks/scratch3_{control,motion,looks,sound,sensing,event}.js`,
`src/engine/sequencer.js` and `src/compiler/irgen.js` in the sibling VM repository.

- Wait, wait-until and glide can yield while waiting; interpreter warp execution
  can retry a normal yield until its warp timer expires.
- Timed say/think, ask and sound-until-done can wait for asynchronous completion.
- Broadcast-and-wait and backdrop-and-wait can wait for triggered scripts, including
  a whole tick. They need not wait when no matching script exists.
- Compiler waiting behavior is not identical to interpreter scheduling. Results
  therefore say **may wait or yield**, never **will refresh the screen**.
- Ordinary loop yields, recursion and termination are not independently flagged.
  A non-warp callee can still execute under its caller's warp context. Calls are
  followed by target-local procedure code, with cycle detection and related
  locations for actual waiting operations. Unknown extension calls are skipped.

## Lifecycle and locations

The generator yields small work units; the model advances at most 250 units or
8 ms per batch. A generation invalidates pending work on edits, replacement,
hiding and closing. Edits debounce for 400 ms. Target and monitor fingerprints
exclude runtime values so animation does not rescan the project each frame.
Current costume/backdrop changes filter cached resource candidates immediately,
including changes during a scan, without restarting static analysis. The model
requests these candidates with the analyzer's `includeCurrentCostumes` context
option; standalone analysis excludes current costumes by default.

Results use IDs, not names, for navigation. The adapter activates the code tab,
selects the owning original target and waits at most two seconds for Blockly.
Variables/lists navigate to their reporter in the data flyout; globals use the
stage. Deleted/unavailable locations refresh the results. Closing or hiding the
window cancels pending navigation.

Tests: `npx jest --runInBand test/unit/addons/linter test/unit/editor-windows/linter-window.test.js`.
The addon directory is excluded by the repository's general lint command; check
it explicitly with `npx eslint --no-ignore src/addons/addons/linter/*.{js,jsx}`.

## Expanded rule registry

`rules.js` is the source of truth for the 19 rule switches, categories, severities
and defaults. Existing IDs are unchanged. Reference/structure checks are warnings
and default on. New control-flow and cleanup suggestions default off; the existing
unused-data suggestion stays on. The addon itself remains opt-in.

See [COVERAGE.md](./COVERAGE.md) for the opcode audit, verification command and
precise limits. The optional fourth analyzer argument provides `runtimeOptions`,
`compilerOptions`, an `addonBlocks` map, `externalBroadcasts`, `extensions` and an
`onCoverage` callback. Trusted extension descriptors are keyed by exact opcode and
may declare `mayWait`, `targetInput: [inputName, allowedSentinels]`, or
`dataAccess: 'dynamic'`; the analyzer never calls extension code to obtain them.
The return value remains a diagnostic array. Diagnostics additionally carry a
localized reason key and stable per-detail IDs.

Resource findings open the owning target's costume/sound editor and select the
asset using a transient `EDITOR_SELECT_RESOURCE` UI request. This does not change
the sprite's running costume. Resource identity includes its kind, name and asset
ID; deletion or renaming makes old locations unavailable.
