import {injectExtensionBlockArtwork, injectExtensionCategoryArtwork} from '../../../src/lib/extension-artwork';

test('icons preserve input bindings and leave VM metadata unchanged', () => {
    const args = Array.from({length: 10}, (_, index) => ({type: 'input_value', name: `ARG${index}`}));
    const block = {
        type: 'clones_createWithId',
        message0: 'create %1 with %10',
        args0: args,
        extensions: ['from_extension']
    };
    const result = injectExtensionBlockArtwork(block);
    expect(result.message0).toBe('%1 %2 create %3 with %12');
    expect(result.args0.slice(2)).toEqual(args);
    expect(result.args0.slice(0, 2).map(arg => arg.type)).toEqual(['field_image', 'field_vertical_separator']);
    expect(result.extensions).toEqual(['from_extension', 'scratch_extension']);
    expect(block.message0).toBe('create %1 with %10');
    expect(block.args0).toBe(args);
    expect(block.extensions).toEqual(['from_extension']);
    expect(injectExtensionBlockArtwork(result)).toEqual(result);
});

test('reporters with no arguments receive an icon', () => {
    const result = injectExtensionBlockArtwork({
        type: 'clones_id', message0: 'my ID', extensions: ['from_extension']
    });
    expect(result.message0).toBe('%1 %2 my ID');
    expect(result.args0).toHaveLength(2);
});

test('menu shadows and other extensions retain their original definitions', () => {
    const menu = {type: 'clones_menu_targets', message0: '%1', args0: [{type: 'field_dropdown'}]};
    const other = {type: 'pen_clear', message0: 'erase all', extensions: ['from_extension']};
    expect(injectExtensionBlockArtwork(menu)).toBe(menu);
    expect(injectExtensionBlockArtwork(other)).toBe(other);
});

test('unrelated categories retain their original XML', () => {
    const other = {id: 'pen', xml: '<category name="Pen"/>'};
    expect(injectExtensionCategoryArtwork([other])[0]).toBe(other);
});
