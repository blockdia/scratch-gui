import twTranslations from './generated-translations.json';
import blockdiaTranslations from './blockdia-translations.json';
import {APP_NAME} from '../brand';

const replaceUpstreamBrand = messages => {
    for (const [key, value] of Object.entries(messages)) {
        if (typeof value === 'string') {
            messages[key] = value
                .replace(/extensions\.turbowarp\.org/g, 'extensions.blockdia.com')
                .replace(/extension\.turbowarp\.org/g, 'extensions.blockdia.com')
                .replace(/extentions\.turbowarp\.org/g, 'extensions.blockdia.com')
                .replace(/desktop\.turbowarp\.org/g, 'desktop.blockdia.com')
                .replace(/packager\.turbowarp\.org/g, 'packager.blockdia.com')
                .replace(/docs\.turbowarp\.org/g, 'docs.blockdia.com')
                .replace(/clouddata\.turbowarp\.org/g, 'clouddata.blockdia.com')
                .replace(/trampoline\.turbowarp\.org/g, 'trampoline.blockdia.com')
                .replace(/windchimes\.turbowarp\.org/g, 'windchimes.blockdia.com')
                .replace(/turbowarp\.org/g, 'editor.blockdia.com')
                .replace(/TurboWarp/g, APP_NAME);
        }
    }
};

const addAdditionalTranslations = editorMessages => {
    for (const locale of Object.keys(editorMessages)) {
        const toMixIn = twTranslations[locale.toLowerCase()];
        if (toMixIn) {
            Object.assign(editorMessages[locale], toMixIn);
        }
        Object.assign(editorMessages[locale], blockdiaTranslations[locale.toLowerCase()]);
        replaceUpstreamBrand(editorMessages[locale]);
    }

    // We reuse our `es` translations for `es-419` instead of maintaining separate translations.
    Object.assign(editorMessages['es-419'], twTranslations.es);
    replaceUpstreamBrand(editorMessages['es-419']);
};

export default addAdditionalTranslations;
