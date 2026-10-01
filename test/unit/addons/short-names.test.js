import React from 'react';
import renderer, {act} from 'react-test-renderer';
import settings from '../../../src/addons/settings-store-singleton';
import manifest from '../../../src/addons/addons/short-names/_manifest_entry';
import ResourceNameInput from '../../../src/components/forms/resource-name-input.jsx';
import {buildFolderTree} from '../../../src/lib/folders';
import {displayResourceName, resolveEditedName} from '../../../src/lib/folders/short-names';

jest.mock('../../../src/addons/settings-store-singleton', () => {
    const SettingsStore = require('../../../src/addons/settings-store').default; // eslint-disable-line global-require
    const store = new SettingsStore();
    store.remote = true;
    return {__esModule: true, default: store};
});

let root;
beforeEach(() => {
    settings.setAddonEnabled('short-names', null);
    manifest.settings.forEach(setting => settings.setAddonSetting('short-names', setting.id, null));
});
afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
});

const mount = (kind = 'SPRITE', value = 'Folder//Nested//Name') => {
    const onSubmit = jest.fn();
    act(() => {
        root = renderer.create(React.createElement(ResourceNameInput, {kind, value, onSubmit}));
    });
    return onSubmit;
};
const input = () => root.root.findByType('input');
const focus = () => act(() => input().props.onFocus());
const change = value => act(() => input().props.onChange({target: {value}}));
const blur = () => act(() => {
    const props = input().props;
    props.onBlurCapture();
    props.onBlur();
});
const enable = () => act(() => settings.setAddonEnabled('short-names', true));
const set = (id, value) => act(() => settings.setAddonSetting('short-names', id, value));

test('defaults off, only configures name fields, and leaves list basenames unchanged', () => {
    expect(settings.getAddonEnabled('short-names')).toBe(false);
    expect(manifest.settings.map(setting => setting.id))
        .toEqual(['spriteName', 'costumeName', 'soundName', 'editShortNames']);
    const items = [{id: 'sprite', name: 'Folder//Name'}];
    const before = buildFolderTree(items);
    enable();
    expect(buildFolderTree(items)).toEqual(before);
    expect(items[0].name).toBe('Folder//Name');
});

test.each(['SPRITE', 'COSTUME', 'SOUND'])('disabled addon edits the full %s name directly', kind => {
    const onSubmit = mount(kind, 'Folder//Name');
    expect(input().props.value).toBe('Folder//Name');
    focus();
    change('Elsewhere//Name');
    blur();
    expect(onSubmit).toHaveBeenCalledWith('Elsewhere//Name');
});

test.each([
    ['SPRITE', 'spriteName'], ['COSTUME', 'costumeName'], ['SOUND', 'soundName']
])('%s scope updates live and independently', (kind, scope) => {
    enable();
    mount(kind, 'Folder//Name');
    expect(input().props.value).toBe('Name');
    expect(input().props.title).toBe('Folder//Name');
    set(scope, false);
    expect(input().props.value).toBe('Folder//Name');
    manifest.settings.filter(setting => setting.id !== scope)
        .forEach(setting => set(setting.id, false));
    set(scope, true);
    expect(input().props.value).toBe('Name');
    act(() => settings.setAddonEnabled('short-names', false));
    expect(input().props.value).toBe('Folder//Name');
});

test('full-path editing option expands on focus and restores the short display without renaming', () => {
    enable();
    set('editShortNames', false);
    const onSubmit = mount();
    expect(input().props.value).toBe('Name');
    focus();
    expect(input().props.value).toBe('Folder//Nested//Name');
    blur();
    expect(input().props.value).toBe('Name');
    expect(onSubmit).not.toHaveBeenCalled();
});

test.each(['SPRITE', 'COSTUME', 'SOUND'])('short %s editing preserves the folder on blur and Enter', kind => {
    enable();
    const onSubmit = mount(kind, 'Folder//Name');
    focus();
    expect(input().props.value).toBe('Name');
    blur();
    expect(onSubmit).not.toHaveBeenCalled();
    focus();
    change('Renamed');
    blur();
    expect(onSubmit).toHaveBeenLastCalledWith('Folder//Renamed');
    focus();
    change('ViaEnter');
    const target = {blur: jest.fn()};
    act(() => input().props.onKeyPress({key: 'Enter', target}));
    expect(onSubmit).toHaveBeenLastCalledWith('Folder//ViaEnter');
    expect(target.blur).toHaveBeenCalled();
});

test('explicit full paths replace rather than duplicate the folder during short editing', () => {
    enable();
    const onSubmit = mount('SPRITE', 'Folder//Name');
    focus();
    change('Folder//Name');
    blur();
    expect(onSubmit).toHaveBeenLastCalledWith('Folder//Name');
    focus();
    change('Other//Nested//Name');
    blur();
    expect(onSubmit).toHaveBeenLastCalledWith('Other//Nested//Name');
});

test('assets keep single-level basenames, and unchanged basenames containing separators do not move', () => {
    expect(displayResourceName('Art//Walk//Frame', 'COSTUME', true)).toBe('Walk//Frame');
    expect(displayResourceName('Art//Walk//Frame', 'SPRITE', true)).toBe('Frame');
    expect(resolveEditedName('Walk//Frame', 'Art//Walk//Frame', 'COSTUME', true))
        .toBe('Art//Walk//Frame');
    expect(resolveEditedName('Run', 'Art//Walk//Frame', 'COSTUME', true)).toBe('Art//Run');
    expect(resolveEditedName('Run', 'Art//Walk//Frame', 'SPRITE', true)).toBe('Art//Walk//Run');
});

test('settings changed during short editing cannot strip the folder', () => {
    enable();
    const onSubmit = mount('SOUND', 'Folder//Name');
    focus();
    change('Renamed');
    act(() => settings.setAddonEnabled('short-names', false));
    blur();
    expect(onSubmit).toHaveBeenLastCalledWith('Folder//Renamed');
    expect(input().props.value).toBe('Folder//Name');
});

test('enabling short editing during full editing cannot reinterpret a move to root', () => {
    const onSubmit = mount('SPRITE', 'Folder//Name');
    focus();
    change('RootName');
    enable();
    blur();
    expect(onSubmit).toHaveBeenLastCalledWith('RootName');
});
