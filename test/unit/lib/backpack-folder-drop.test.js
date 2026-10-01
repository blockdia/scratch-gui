import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import {IntlProvider} from 'react-intl';
import VM from 'scratch-vm';
import Backpack from '../../../src/containers/backpack.jsx';
import BackpackComponent from '../../../src/components/backpack/backpack.jsx';
import {costumePayload, soundPayload, spritePayload, saveBackpackObject, LOCAL_API}
    from '../../../src/lib/backpack-api';
import assetDrag, {updateAssetDrag} from '../../../src/reducers/asset-drag';

jest.mock('scratch-vm', () => require('events').EventEmitter);
jest.mock('../../../src/components/backpack/backpack.jsx', () => () => null);
jest.mock('../../../src/lib/storage', () => ({}));
jest.mock('../../../src/lib/backpack/pinned-scripts', () => ({
    readPins: () => [], subscribe: () => () => {}, itemKey: (host, user, id) => id
}));
jest.mock('../../../src/lib/backpack-api', () => ({
    LOCAL_API: '_local_',
    costumePayload: jest.fn(), soundPayload: jest.fn(), spritePayload: jest.fn(),
    saveBackpackObject: jest.fn()
}));

test.each(['COSTUME', 'SOUND', 'SPRITE'])('backpack receives a %s folder through the drag HOC', async kind => {
    const members = ['Folder//first', 'Folder//second'].map((name, index) => ({
        id: `member-${index}`, name, isOriginal: true, getName: () => name, asset: {clean: true}
    }));
    const outside = {id: 'outside', name: 'outside', isOriginal: true, getName: () => 'outside'};
    const stage = {id: 'stage', isStage: true, isOriginal: true};
    const target = {id: 'target', sprite: {costumes: [...members, outside], sounds: [...members, outside]}};
    const vm = new VM();
    vm.runtime = {
        targets: [stage, ...members, outside],
        getTargetForStage: () => stage,
        getTargetById: id => (id === target.id ? target : null)
    };
    const payloader = {COSTUME: costumePayload, SOUND: soundPayload, SPRITE: spritePayload}[kind];
    payloader.mockReset().mockImplementation(payload => Promise.resolve({
        name: typeof payload === 'string' ? members.find(member => member.id === payload).name : payload.name
    }));
    saveBackpackObject.mockReset().mockImplementation(payload => Promise.resolve({id: payload.name, name: payload.name}));
    const store = createStore((state, action) => ({
        session: {session: {user: {username: 'test'}}},
        scratchGui: {vm, assetDrag: assetDrag(state && state.scratchGui.assetDrag, action)}
    }));
    let view;
    act(() => {
        view = renderer.create(<Provider store={store}><IntlProvider locale="en">
            <Backpack host={LOCAL_API} />
        </IntlProvider></Provider>);
    });
    const backpack = () => view.root.findByType(BackpackComponent);
    backpack().props.containerRef({getBoundingClientRect: () => ({left: 0, top: 0, right: 100, bottom: 100})});
    const drag = {dragging: true, dragType: 'FOLDER', currentOffset: {x: 50, y: 50},
        payload: {kind, path: 'Folder', scope: kind === 'SPRITE' ? stage.id : target.id}};
    try {
        act(() => { store.dispatch(updateAssetDrag(drag)); });
        expect(backpack().props.dragOver).toBe(true);
        // Leaving the backpack before releasing must cancel the drop.
        act(() => { store.dispatch(updateAssetDrag({currentOffset: {x: 150, y: 150}})); });
        act(() => { store.dispatch(updateAssetDrag({dragging: false, currentOffset: null, dragType: null})); });
        expect(saveBackpackObject).not.toHaveBeenCalled();

        act(() => { store.dispatch(updateAssetDrag(drag)); });
        await act(async () => {
            store.dispatch(updateAssetDrag({dragging: false, currentOffset: null, dragType: null}));
        });
        expect(payloader.mock.calls.map(([payload]) => payload)).toEqual(kind === 'SPRITE' ?
            [members[1].id, members[0].id] : [members[1], members[0]]);
        expect(saveBackpackObject).toHaveBeenCalledTimes(2);
        expect(backpack().props.contents.map(item => item.name)).toEqual(members.map(member => member.name));
        expect(backpack().props.dragOver).toBe(false);
    } finally {
        act(() => view.unmount());
    }
});
