export default async function ({ addon, console, msg }) {
  let spritesContainer;
  let spriteSelectorContainer;

  const container = document.createElement("div");
  container.className = "sa-search-sprites-container";
  addon.tab.displayNoneWhileDisabled(container, {
    display: "flex",
  });

  const searchBox = document.createElement("input");
  searchBox.className = "sa-search-sprites-box";
  searchBox.placeholder = msg("placeholder");
  searchBox.autocomplete = "off";
  // search might make more sense, but browsers treat them special in ways that this addon does not handle,
  // so just leave it as a text input. Also note that Scratch uses type=text for its own search inputs in
  // the libraries, so this fits right in.
  searchBox.type = "text";

  addon.tab.actions.register({
    id: 'focus', title: {id: 'addons.search-sprites.action-focus'}, scopes: ['editor'],
    enabled: () => container.isConnected && Boolean(searchBox.getClientRects().length),
    run: () => { searchBox.focus(); searchBox.select(); }
  });

  const search = (query) => {
    if (!spritesContainer) return;

    query = query.toLowerCase();
    const containsQuery = (str) => str.toLowerCase().includes(query);

    spriteSelectorContainer.dispatchEvent(new CustomEvent("blockdia:sprite-search", { detail: query }));
    // The legacy grid is still used by embedded selectors. Do not depend on
    // thumbnail/number/name child positions (folders and empty names differ).
    if (spritesContainer.matches('[class*="sprite-selector_items-wrapper"]')) {
      for (const sprite of spritesContainer.children) {
        const name = sprite.querySelector('[class*="sprite-selector-item_sprite-name"]');
        sprite.style.display = !query || (name && containsQuery(name.textContent)) ? "" : "none";
      }
    }
  };

  searchBox.addEventListener("input", (e) => {
    search(e.target.value);
  });

  const reset = () => {
    search("");
    searchBox.value = "";
  };

  const resetButton = document.createElement("button");
  resetButton.className = "sa-search-sprites-reset";
  resetButton.addEventListener("click", reset);
  resetButton.textContent = "×";
  addon.self.addEventListener("disabled", reset);

  container.appendChild(searchBox);
  container.appendChild(resetButton);

  while (true) {
    spriteSelectorContainer = await addon.tab.waitForElement("[data-sprite-list]", {
      markAsSeen: true,
      reduxEvents: ["scratch-gui/mode/SET_PLAYER", "fontsLoaded/SET_FONTS_LOADED", "scratch-gui/locales/SELECT_LOCALE"],
      reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
    });

    spritesContainer = spriteSelectorContainer.firstElementChild;
    spriteSelectorContainer.insertBefore(container, spritesContainer);
    reset(); // Clear search box after going outside then inside
  }
}
