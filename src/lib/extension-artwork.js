import clonesIcon from './libraries/extensions/clones/clones-small.svg';

// Presentation-only assets belong to the GUI, not the VM's extension metadata.
// TODO: Consolidate this map with gallery/theme artwork if more built-in extensions need GUI-owned icons.
const icons = {clones: clonesIcon};

const injectExtensionCategoryArtwork = categories => categories.map(category => {
    const icon = icons[category.id];
    if (!icon) return category;

    const dom = new DOMParser().parseFromString(category.xml, 'text/xml');
    dom.documentElement.setAttribute('iconURI', icon);
    return {...category, xml: new XMLSerializer().serializeToString(dom)};
});

const injectExtensionBlockArtwork = block => {
    const icon = icons[block.type.split('_')[0]];
    // Menu shadows are also blocks, but must not receive an icon or a separator.
    if (!icon || !block.extensions?.includes('from_extension')) return block;

    const args = block.args0 || [];
    if (args[0]?.type === 'field_image' && args[1]?.type === 'field_vertical_separator') {
        return {...block, args0: [{...args[0], src: icon}, ...args.slice(1)]};
    }

    return {
        ...block,
        message0: `%1 %2 ${block.message0.replace(/%(\d+)/g, (match, index) => `%${Number(index) + 2}`)}`,
        args0: [
            {type: 'field_image', src: icon, width: 40, height: 40},
            {type: 'field_vertical_separator'},
            ...args
        ],
        extensions: [...block.extensions.filter(extension => extension !== 'scratch_extension'), 'scratch_extension']
    };
};

export {injectExtensionCategoryArtwork, injectExtensionBlockArtwork};
