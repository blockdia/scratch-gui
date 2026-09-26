import getBlockSearch from '../../libraries/block-search/popup.js';

export default async function (context) {
  const {addon} = context;
  const search = await getBlockSearch(context);
  const Blockly = await addon.tab.traps.getBlockly();
  const open = () => {
    if (!addon.self.disabled) search.openPopup({settings: addon.settings});
  };
  addon.self.addEventListener('disabled', search.closeMousePopup);
  document.addEventListener('keydown', event => {
    if (addon.self.disabled) return;
    if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
      open();
      event.preventDefault();
      event.stopPropagation();
    }
  });
  const original = Blockly.Gesture.prototype.doWorkspaceClick_;
  Blockly.Gesture.prototype.doWorkspaceClick_ = function () {
    search.setMousePosition(this.mostRecentEvent_);
    if (this.mostRecentEvent_.button === 1 || this.mostRecentEvent_.shiftKey) open();
    original.call(this);
  };
}
