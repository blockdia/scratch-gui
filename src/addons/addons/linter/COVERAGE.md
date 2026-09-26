# Opcode audit and rule coverage

The checked-in `opcode-coverage.json` inventories **325** core, compatibility,
editor helper, extension and extension-menu opcodes from the installed Blockdia
VM/blocks packages. The sibling source check currently has the same inventory.
This includes bundled but not normally registered speech recognition and example
blocks. It does not include arbitrary downloaded extension implementations.

Each entry records its source, category, applicable rules, waiting and data-access
behavior, target scope, static-analysis limitation and relevant test suites.
Structural checks apply to every active block. A category without a specific
behavior diagnostic is deliberate: for example, collision results, hardware
connection state and camera measurements cannot be proven from project code.

Run `node scripts/linter-opcode-inventory.cjs` to compare the inventory against
installed dependencies, or pass VM and scratch-blocks source directories as the
two arguments. The same comparison runs in `rules.test.js`, included by the
existing CI unit-test command. Additions/removals fail the check: **do not simply
regenerate the list**. Inspect the operation, interpreter/compiler behavior and
extension helpers, update its classification and applicable rules, and add a
positive case and a legal counterexample for new diagnostics.

## Audited behavior families

- References: all seven core target inputs and their distinct sentinels; component
  targets/capabilities; costume/backdrop/sound selectors and backdrop event hats;
  scoped scalar/list IDs; `sensing_of` built-ins and target-local scalar names.
- Procedures: target-local definition/call signatures, argument IDs and VM default
  inputs, return-valued calls, parameter scope, legacy TurboWarp argument reporters,
  cyclic call graphs and registered VM addon callbacks.
- Waiting: core explicit waits and async operations, `miscLimits`-conditional sound
  effects/volume, music timed operations, translation reporters, text-to-speech,
  speech recognition, and asynchronous micro:bit/EV3/WeDo/Boost commands. Hardware
  connectivity can change whether an operation actually waits. Compiler sound
  operations use the compatibility primitives; no rule promises a screen redraw.
- Data/cleanup: exact IDs and scope, writes, reads, displays/monitors, loose blocks,
  possible dynamic property reads, cloud exclusions, rooted procedure call graphs,
  resource names plus conservative index/dynamic/current-costume/component uses.
- Control/arithmetic: pure constant branches/repeat counts, empty pure structures,
  unconditional termination successors, constant loops without potential body
  exits, and non-finite arithmetic. Scratch coercions, comparisons and mathematical
  behavior are tested against real VM helpers. General loop termination, races,
  runtime list bounds and mutable-variable propagation are deliberately excluded.

## Meaning of coverage

Inventory classification is 325/325, **not a promise to find every bug** and not a
code-coverage percentage. Unknown blocks, dynamic references, addon callbacks and
expression budgets are reported separately. Unknown callbacks qualify cleanup
suggestions which they could invalidate. Pure-expression evaluation is bounded by
64 nested levels, 512 uncached nodes per request and 16 KiB strings. The UI scan
has a 250,000-work-unit ceiling and reports `incomplete` rather than an empty success.

Every registered rule has independently authored positive/negative, switch and
stable-location fixtures in `rules.test.js`. `vm-semantics.test.js` also loads a
real SB3-shaped project, compares VM serialization before/after inspection and
checks casting and sound lookup against the installed implementation. These
families are the test mapping in the inventory; they are not an assertion of a
separate semantic test for every runtime-dependent opcode.

Bundled debugger addon signatures (breakpoint, log, warn, error) are explicitly
known when registered with the VM. Their callbacks do not indirectly access
project data/resources or invoke project procedures. Breakpoint is a debugger
pause rather than a VM wait primitive. Other addon callbacks remain unknown.
