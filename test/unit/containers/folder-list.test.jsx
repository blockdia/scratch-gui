import React from 'react';
import {shallowWithIntl} from '../../helpers/intl-helpers.jsx';
import {FolderList} from '../../../src/containers/folder-list.jsx';
import Prompt from '../../../src/components/prompt/prompt.jsx';
import messages from '../../../src/lib/folders/messages';

jest.mock('../../../src/components/asset-panel/folder-thumbnail.jsx', () => ({
    __esModule: true,
    default: () => null,
    getFolderPreview: jest.fn()
}));

const makeWrapper = (kind = 'SPRITE') => shallowWithIntl(<FolderList
    containers={{}}
    drag={{dragging: false}}
    items={[]}
    kind={kind}
    onDrop={jest.fn()}
    renderItem={() => null}
/>);

describe.each(['@clone:x', '@sprite:x', '@container:x', '@container-clone:x'])(
    'reserved folder prefix %s', name => {
        test.each(['create', 'rename'])('%s keeps the prompt open and explains the error', action => {
            const wrapper = makeWrapper();
            const instance = wrapper.instance();
            const moveItem = jest.spyOn(instance, 'moveItem').mockImplementation(() => {});
            const moveFolder = jest.spyOn(instance, 'moveFolder').mockImplementation(() => {});
            instance.openPrompt({name: 'Cat', fullName: 'Cat'}, action === 'rename' ? 'Old' : null);
            wrapper.find(Prompt).prop('onChange')({target: {value: name}});
            wrapper.find(Prompt).prop('onOk')();

            expect(wrapper.find(Prompt).exists()).toBe(true);
            expect(wrapper.find(Prompt).prop('label')).toBe(messages.invalid.defaultMessage);
            expect(wrapper.find(Prompt).prop('defaultValue')).toBe(name);
            expect(moveItem).not.toHaveBeenCalled();
            expect(moveFolder).not.toHaveBeenCalled();

            wrapper.find(Prompt).prop('onChange')({target: {value: 'Valid'}});
            expect(wrapper.state('error')).toBeNull();
            wrapper.find(Prompt).prop('onOk')();
            expect(action === 'rename' ? moveFolder : moveItem).toHaveBeenCalled();
            expect(wrapper.find(Prompt).exists()).toBe(false);
            wrapper.unmount();
        });
    }
);

test.each([
    ['SPRITE', 'Parent//Old', 'Parent//@container:x'],
    ['COSTUME', 'Old', '@container:x'],
    ['SOUND', 'Old', '@container:x']
])('%s permits reserved text when it is not a sprite path prefix', (kind, source, destination) => {
    const wrapper = makeWrapper(kind);
    const moveFolder = jest.spyOn(wrapper.instance(), 'moveFolder').mockImplementation(() => {});
    wrapper.instance().openPrompt(null, source);
    wrapper.find(Prompt).prop('onChange')({target: {value: '@container:x'}});
    wrapper.find(Prompt).prop('onOk')();
    expect(moveFolder).toHaveBeenCalledWith(source, destination);
    expect(wrapper.find(Prompt).exists()).toBe(false);
    wrapper.unmount();
});
