// Blockdia resources are maintained independently of the upstream importer.
export default {
    'de': () => import(/* webpackChunkName: "blockdia-addon-l10n-de" */ './de.json'),
    'es': () => import(/* webpackChunkName: "blockdia-addon-l10n-es" */ './es.json'),
    'fi': () => import(/* webpackChunkName: "blockdia-addon-l10n-fi" */ './fi.json'),
    'fr': () => import(/* webpackChunkName: "blockdia-addon-l10n-fr" */ './fr.json'),
    'hu': () => import(/* webpackChunkName: "blockdia-addon-l10n-hu" */ './hu.json'),
    'it': () => import(/* webpackChunkName: "blockdia-addon-l10n-it" */ './it.json'),
    'ja': () => import(/* webpackChunkName: "blockdia-addon-l10n-ja" */ './ja.json'),
    'ko': () => import(/* webpackChunkName: "blockdia-addon-l10n-ko" */ './ko.json'),
    'nl': () => import(/* webpackChunkName: "blockdia-addon-l10n-nl" */ './nl.json'),
    'pl': () => import(/* webpackChunkName: "blockdia-addon-l10n-pl" */ './pl.json'),
    'pt': () => import(/* webpackChunkName: "blockdia-addon-l10n-pt" */ './pt.json'),
    'ru': () => import(/* webpackChunkName: "blockdia-addon-l10n-ru" */ './ru.json'),
    'sl': () => import(/* webpackChunkName: "blockdia-addon-l10n-sl" */ './sl.json'),
    'tr': () => import(/* webpackChunkName: "blockdia-addon-l10n-tr" */ './tr.json'),
    'zh-cn': () => import(/* webpackChunkName: "blockdia-addon-l10n-zh-cn" */ './zh-cn.json'),
    'zh-tw': () => import(/* webpackChunkName: "blockdia-addon-l10n-zh-tw" */ './zh-tw.json')
};
