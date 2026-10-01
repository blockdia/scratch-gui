import getBlockSearch from '../../libraries/block-search/popup.js';
import {inputTargetForGesture} from '../../libraries/block-search/input-target.js';

export default async function (context) {
  const {addon} = context;
  const search = await getBlockSearch(context);
  const Blockly = await addon.tab.traps.getBlockly();
  const openAction = addon.tab.actions.register({
    id: 'search', title: {id: 'addons.middle-click-popup.action-search'}, scopes: ['blocks'], defaultBindings: ['Mod+Space'],
    enabled: () => Boolean(addon.tab.traps.getWorkspace()) && !addon.tab.traps.getWorkspace().isDragging(),
    run: () => search.openPopup({settings: addon.settings})
  });
  const open = () => openAction.execute();
  addon.self.addEventListener('disabled', search.closeMousePopup);
  const original = Blockly.Gesture.prototype.doWorkspaceClick_;
  Blockly.Gesture.prototype.doWorkspaceClick_ = function () {
    search.setMousePosition(this.mostRecentEvent_);
    if (this.mostRecentEvent_.button === 1 || this.mostRecentEvent_.shiftKey) open();
    original.call(this);
  };
  for (const method of ['doFieldClick_', 'doBlockClick_']) {
    const originalClick = Blockly.Gesture.prototype[method];
    Blockly.Gesture.prototype[method] = function () {
      const workspace = addon.tab.traps.getWorkspace();
      const target = !addon.self.disabled && workspace &&
        inputTargetForGesture(Blockly, workspace, this);
      if (target) {
        search.setMousePosition(this.mostRecentEvent_);
        search.openPopup({settings: addon.settings, inputTarget: target});
        return;
      }
      return originalClick.call(this);
    };
  }
}
