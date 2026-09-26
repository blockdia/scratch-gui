import getBlockSearch from '../../libraries/block-search/popup.js';
import KeyboardEditor from './keyboard-editor.js';

export default async function (context) {
  const {addon, msg} = context;
  const search = await getBlockSearch(context);
  const Blockly = await addon.tab.traps.getBlockly();
  const editor = new KeyboardEditor({Blockly, addon, msg,
    openPopup: options => search.openPopup({...options, settings: addon.settings}),
    closePopup: search.closeKeyboardPopup, popupOpen: search.popupOpen});
  search.attachKeyboard(editor);
}
