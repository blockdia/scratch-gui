import { isPaused, setPaused, onPauseChanged, setup } from "../debugger/module.js";

export default async function ({ addon, console, msg }) {
  setup(addon);

  const img = document.createElement("img");
  img.className = "pause-btn";
  img.draggable = false;
  img.title = msg("pause");

  const setSrc = () => {
    img.src = addon.self.getResource((isPaused() ? "/play.svg" : "/pause.svg")) /* rewritten by pull.js */;
    img.title = isPaused() ? msg("play") : msg("pause");
  };
  const togglePause = addon.tab.actions.register({
    id: 'toggle', title: {id: 'addons.pause.action-toggle'}, scopes: ['editor'], defaultBindings: ['Alt+x'],
    run: () => setPaused(!isPaused())
  });
  img.addEventListener("click", () => togglePause.execute());
  addon.tab.displayNoneWhileDisabled(img);
  addon.self.addEventListener("disabled", () => setPaused(false));
  setSrc();
  onPauseChanged(setSrc);

  while (true) {
    await addon.tab.waitForElement("[class^='green-flag']", {
      markAsSeen: true,
      reduxEvents: ["scratch-gui/mode/SET_PLAYER", "fontsLoaded/SET_FONTS_LOADED", "scratch-gui/locales/SELECT_LOCALE"],
    });
    addon.tab.appendToSharedSpace({ space: "afterGreenFlag", element: img, order: 0 });
  }
}
