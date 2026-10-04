import {NATIVE_MESSAGES, withNativeContainerMessages} from '../../../src/lib/container-native-messages';
import blockdiaTranslations from '../../../src/lib/tw-translations/blockdia-translations.json';

const ScratchBlocks = {
    ScratchMsgs: {
        translate: (key, fallback, locale) => ({'zh-tw': {LOOKS_EFFECT_COLOR: '顏色'}}[locale] || {})[key] || fallback
    }
};

test('built-in block translations extend a copy of the GUI messages', () => {
    const messages = {'containers.name': '容器'};
    const result = withNativeContainerMessages(ScratchBlocks, 'zh-tw', messages);
    expect(result).toEqual({'containers.name': '容器', 'containers.color': '顏色'});
    expect(messages).toEqual({'containers.name': '容器'});
});

test('menu items missing from scratch-blocks keep the GUI or default text', () => {
    const result = withNativeContainerMessages(ScratchBlocks, 'de', {'containers.color': 'Farbe'});
    expect(result['containers.color']).toBe('Farbe');
});

test('menu items reusing built-in translations are not duplicated in Blockdia translations', () => {
    for (const messages of Object.values(blockdiaTranslations)) {
        for (const id of Object.keys(NATIVE_MESSAGES)) expect(messages).not.toHaveProperty([id]);
    }
});
