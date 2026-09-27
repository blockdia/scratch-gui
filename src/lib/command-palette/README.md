# Command palette

The editor owns the palette. `service.open({mode})` accepts `targets`, `commands`
or `symbols`; `service.close()` cancels and restores focus. ActionHost registers
`builtin/quick-open` (Mod+P), `builtin/command-palette` (Mod+Shift+P),
`builtin/find-symbol` (Mod+F), and `builtin/navigate-back` / `navigate-forward`.
The Edit menu invokes the same registered actions. All bindings are configurable.

No prefix searches original sprite/stage/component targets, `>` discovers editor
actions, and `@` searches the current target's symbols or the active costume/sound
editor's resources. The Variables tab uses code symbols. Internal commands stay
hidden; unavailable commands remain visible at the bottom. Available commands
used most recently come first, including when searching; remaining ties retain
search relevance and registration order. Successful executions selected from the command palette update a
bounded, device-local history under `blockdia:recent-palette-actions`.
Shortcut and button invocations do not change this history. Failed or unavailable executions do
not update history; blocked storage falls back to session history. The originating shortcut context is
captured separately from React's reserved `context` field and checked again on
execution. Commands execute synchronously from the confirmation gesture, including
file pickers, after initiating palette dismissal.

Target results default to most recently opened through this palette, followed by
unused targets in project order, with the current target placed last. Search
relevance takes priority; equally relevant matches put the current target last
and otherwise follow recency. Only confirmed target navigation updates this in-memory history;
closing the palette retains it, deleting a target removes its ID, and loading or
creating a project clears it. It is never persisted or exported with the project.

Code symbols with zero references appear after symbols with references, preserving
provider order within both groups. Search relevance still wins, with zero-reference
symbols placed last only among equally relevant matches. Costume and sound ordering
is unchanged.

In symbol mode, a single-letter filter followed by whitespace restricts code
symbols: `@v ` variables, `@l ` lists, `@c ` custom blocks, `@e ` events, and
`@b ` broadcasts. Events include non-broadcast hat blocks such as flag, key,
and clone starts; broadcasts have their own category. Text after the space
still uses the usual fuzzy matching. A filter searches code symbols from any
editor tab and selection activates the code tab. Costumes and sounds continue
to follow the active tab without filters. Without the space, `@v` remains a
normal name query. To search a name that begins with a filter code and a space,
insert a space after `@`: `@ v 1` finds a list named `v 1` without treating `v`
as a variable filter. `@l v 1` also finds that list.

The symbol provider queries VM IDs, never names for variable identity. Procedures
and variable/list references stay target-local; broadcasts span original targets.
The first symbol/resource is previewed immediately on opening or filtering.
Symbol and resource clicks preview without closing. Up/down preview adjacent results
without wrapping, left/right cycle references, clicking the same result again
advances its reference, and Enter confirms and closes. Escape clears a symbol query
first (retaining `@`), then closes. A compact `◀ n / N ▶` control appears on the
right of the active result; colored block-palette-icons identify symbol categories.
Cross-target navigation freezes the query origin until a new search session.
Resources use the existing `EDITOR_SELECT_RESOURCE` bridge. Loading another project
clears the palette and navigation history; pending navigation can be cancelled.

`../block-navigation` provides per-VM shared navigation and viewport history,
waiting for the requested Blockly block or resource selection bridge before acting.
Palette navigation refreshes scrollbar geometry, excludes the toolbox/flyout and
palette rectangle, and accounts for zoom, RTL and protruding hat shapes. It keeps
already-visible stacks in place; offscreen stacks use a stable 32px top-left
anchor in the unobscured area, shared with jump-to-definition navigation;
ResizeObserver maintains visibility when the panel or workspace resizes.
The former find-bar helper paths are compatibility exports/adapters for debugger,
linter and jump-to-def. Find-bar is no longer a separately enabled addon; the old
UI/runtime/manifest are removed. Its find/back/forward binding overrides migrate
once to the built-in IDs (including explicit unbindings); new IDs take precedence
and old IDs are removed from persisted storage. A storage write failure preserves
the migrated session configuration and uses the registry's existing notice.

Indexing and navigation originated in Scratch Addons' find-bar by griffpatch and
TheColaber (https://github.com/ScratchAddons/ScratchAddons). Keep their attribution
when updating the extracted helpers.

## Verification

The normal `npm run test:unit` includes palette search/provider, migration,
navigation and interaction-controller tests under `test/unit/editor-actions`.
The controller tests use lightweight DOM/VM doubles; browser checks remain necessary
for native focus, Blockly rendering, IME and asset editor integration.

Browser acceptance: all three keyboard/menu entries; prefix switching and Chinese
queries; unavailable commands and addon enable/disable; stage/sprite/component
selection; active-tab resource selection without playback; repeated broadcast
navigation across targets; Escape/outside click and focus restoration; shortcut
rebinding; light/dark themes and narrow viewports. Preserve keyup delivery to the
VM so keys held before opening cannot become stuck.
