import searchSettings from '../../libraries/block-search/settings.js';
export default {
  editorOnly: true,
  dynamicDisable: true,
  name: 'Keyboard Editing Mode',
  description: 'Use the keyboard to navigate blocks, edit inputs, and search for blocks to insert.',
  credits: [{name: 'LuYifei2011'}],
  enabledByDefault: false,
  tags: [],
  userscripts: [{url: 'userscript.js'}],
  userstyles: [{url: 'search.css'}, {url: 'userstyle.css'}],
  settings: searchSettings
};
