import React from 'react';
import renderer from 'react-test-renderer';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import VM from 'scratch-vm';
import Sprite from 'scratch-vm/src/sprites/sprite';
import containersReducer from '../../src/reducers/containers';
import targetsReducer from '../../src/reducers/targets';
import vmListenerHOC from '../../src/lib/vm-listener-hoc.jsx';

jest.mock('../../src/reducers/custom-stage-size', () => ({setCustomStageSize: jest.fn()}));

test('container events reach Redux independently and refresh after leaving fullscreen', () => {
    const vm = new VM();
    const stage = new Sprite(null, vm.runtime).createClone();
    stage.isStage = true;
    vm.runtime.addTarget(stage);
    const sprite = new Sprite(null, vm.runtime);
    sprite.name = 'A//one';
    const member = sprite.createClone();
    vm.runtime.addTarget(member);
    const initial = {scratchGui: {vm,
        mode: {},
        modals: {},
        editorTab: {activeTabIndex: 0},
        tw: {hasCloudVariables: false},
        targets: targetsReducer(undefined, {}),
        containers: containersReducer(undefined, {})}};
    const store = createStore((state = initial, action) => ({scratchGui: {
        ...state.scratchGui,
        mode: action.type === 'fullscreen' ? {isFullScreen: action.value} : state.scratchGui.mode,
        targets: targetsReducer(state.scratchGui.targets, action),
        containers: containersReducer(state.scratchGui.containers, action)
    }}));
    const Wrapped = vmListenerHOC(() => <div />);
    let view;
    renderer.act(() => {
        view = renderer.create(<Provider store={store}><Wrapped attachKeyboardEvents={false} /></Provider>);
    });
    try {
        const initialTargets = store.getState().scratchGui.targets;
        renderer.act(() => vm.setSpriteFolderContainer('A', true));
        expect(store.getState().scratchGui.containers).toEqual({A: {path: 'A', visible: true}});
        renderer.act(() => { vm.setSpriteContainerTransform('A', {x: 42, size: 0}); });
        expect(store.getState().scratchGui.containers.A.transform).toMatchObject({x: 42, size: 0.01});
        expect(store.getState().scratchGui.targets).toBe(initialTargets);
        renderer.act(() => { store.dispatch({type: 'fullscreen', value: true}); });
        renderer.act(() => vm.setSpriteContainerVisible('A', false));
        expect(store.getState().scratchGui.containers.A.visible).toBe(true);
        renderer.act(() => { store.dispatch({type: 'fullscreen', value: false}); });
        expect(store.getState().scratchGui.containers.A.visible).toBe(false);
        renderer.act(() => vm.clear());
        expect(store.getState().scratchGui.containers).toEqual({});
        renderer.act(() => view.unmount());
        expect(vm.listenerCount('containersUpdate')).toBe(0);
    } finally {
        vm.quit();
    }
});
