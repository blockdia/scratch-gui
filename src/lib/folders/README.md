# Native editor folders

Folders are derived from names and have no separate persisted records. Removing
or moving the last member removes the folder (and any now-empty ancestors).

- Sprites: `Enemies//Forest//Slime` represents nested folders.
- Costumes/backdrops and sounds: only the first `//` separates folder and name,
  matching the original addon. `Art//Walk//Frame` is one folder named `Art` and a
  costume named `Walk//Frame`, not a nested asset folder.
- The sprite pane uses the responsive tree/grid view. Asset selectors retain the
  addon's colored cards, open-folder icon, closed-folder preview and real asset
  numbers. A card's context menu creates a folder containing that item; no empty
  folder can be created.
- By default, name inputs show and edit the complete name, including the folder path,
  like the original editor. Typing `Art//Frame` sets that exact name; it never
  prepends the previous folder. Removing the prefix moves the item to the root.
  Cards inside a folder display only the name after its folder prefix.
- The optional `short-names` addon is disabled by default and only configures name
  inputs. Lists always use short names. Its settings independently select sprite,
  costume/backdrop and sound fields. Enabled fields can also edit the short name:
  plain names retain their folder; explicit names containing `//` replace the
  whole path. An unchanged short name never moves an item, including single-level
  asset names that themselves contain `//`. Disabling the edit option shows the
  full path on focus. Editing semantics are fixed until blur, even if settings
  change during an edit. All rendering and rename logic lives in the GUI.
- Rename/move use VM APIs, preallocate collision-free names and temporarily
  rename affected entries to prevent reference cascades. Sprite menu references,
  costume/sound references and component costume bindings follow the final names.
- Members are kept contiguous in the actual resource order, matching the displayed
  group order and the original addon's behavior. Normalization runs after import,
  rename and reorder callbacks finish, retaining editor selections and running
  costumes (including clones) by object identity. Explicit drag reordering uses
  actual resource indices; folder rows are never passed to the VM as fake resources.
  Asset folders can be reordered, but not nested.
- Dragging retains the original floating thumbnail, border and drop shadow,
  including member previews for collapsed folders. A gray insertion shadow moves
  through the list without changing project data; the source stays mounted so
  its drag recognizer survives changes to the visual order.
- Folded/search-hidden entries are not drop indices. Visible DOM geometry is
  captured at drag start so moving placeholders cannot change their own drop
  targets. One operation plan drives both preview and drop, and completion checks
  the resource snapshot. Folder moves cannot target descendants or silently merge
  two existing folders.
- Asset drags follow the original folder boundaries: moving upward onto a folder
  puts the item before it; moving downward enters an open folder or passes a
  closed one. Whole asset folders reorder as a unit and cannot become nested.
- New GUI imports use the selected item's deepest open folder; insertion preferences
  are scoped to the VM's stage or target object, and only existing folders remain
  valid. Rename/move retain folder expansion state. Folder drops onto the backpack
  export each member through the normal payload APIs while preserving their order.

The old `folders` addon is removed from both runtime and settings registration.
`FolderList` owns operations/dragging; `SpriteTree` and `FolderCard` render views.
The VM and SB3 format require no changes. Other Scratch editors show encoded names;
legacy folder addons display sprite nesting after the first level as part of the
item name. Scripts computing literal resource names still need to account for
path prefixes, just as with the original addon.

Validation: `npm run test:unit` includes the folder model, name/reference collision
cases, the resolved VM's component/reference updates, and an SB3 save/load round
trip. Drag tests also cover folder boundaries, preview/drop ordering, thumbnail
generation and retaining source component identity. Browser checks include the
dragging state, gray placeholders, floating folder previews, drop completion and
cancellation, alongside the native menus and asset selectors.
