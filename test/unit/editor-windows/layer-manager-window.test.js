import React from 'react';
import renderer from 'react-test-renderer';
import {IntlProvider} from 'react-intl';
import {EventEmitter} from 'events';
import createWindow from '../../../src/addons/addons/layer-manager/window.jsx';
import {createLayerModel} from '../../../src/addons/addons/layer-manager/model';
import {englishAddonMessages} from '../../../src/addons/translations';
jest.mock('../../../src/lib/get-costume-url', () => asset => asset.url);

let listeners;
let previousDocument;
let previousWindow;
beforeEach(() => {
    jest.useFakeTimers();
    listeners = {};
    previousDocument = global.document;
    previousWindow = global.window;
    global.document = {addEventListener: (name, fn) => { listeners[name] = fn; },
        removeEventListener: name => { delete listeners[name]; }};
    global.window = {addEventListener: jest.fn(), removeEventListener: jest.fn()};
});
afterEach(() => {
    jest.useRealTimers();
    global.document = previousDocument;
    global.window = previousWindow;
});
const fixture = () => {
    const target = (id, order, extra = {}) => ({id, isOriginal: true, isStage: false, visible: true,
        getLayerOrder: () => order, getCostumes: () => [], getName: () => id, ...extra});
    const stage = target('stage', 0, {isStage: true});
    const a = target('a', 1);
    const clone = target('clone', 2, {isOriginal: false});
    const runtime = new EventEmitter();
    runtime.targets = [stage, a, clone];
    const vm = {runtime, editingTarget: a, setEditingTarget: jest.fn()};
    const model = createLayerModel(vm);
    const snapshot = jest.spyOn(model, 'snapshot');
    const View = createWindow(vm, model);
    const render = visible => <IntlProvider locale="en" messages={englishAddonMessages}>
        <View visible={visible} locale="en" direction="ltr" />
    </IntlProvider>;
    let root;
    renderer.act(() => { root = renderer.create(render(true)); });
    return {root, vm, snapshot, render};
};

test('polls only while visible, preserves clone selection and removes listeners on unmount', () => {
    const {root, vm, snapshot, render} = fixture();
    const selections = root.root.findAllByProps({className: 'sa-layer-select'});
    renderer.act(() => selections[0].props.onClick());
    expect(vm.setEditingTarget).not.toHaveBeenCalled();
    renderer.act(() => { jest.advanceTimersByTime(200); });
    expect(root.root.findAllByProps({className: 'sa-layer-select'})[0].props['aria-pressed']).toBe(true);
    renderer.act(() => selections[1].props.onClick());
    expect(vm.setEditingTarget).toHaveBeenCalledWith('a');
    renderer.act(() => root.update(render(false)));
    const calls = snapshot.mock.calls.length;
    renderer.act(() => { jest.advanceTimersByTime(500); });
    expect(snapshot).toHaveBeenCalledTimes(calls);
    expect(vm.runtime.listenerCount('PROJECT_LOADED')).toBe(0);
    expect(Object.keys(listeners)).toHaveLength(0);
    renderer.act(() => root.update(render(true)));
    expect(vm.runtime.listenerCount('PROJECT_LOADED')).toBe(1);
    renderer.act(() => root.unmount());
    expect(vm.runtime.listenerCount('PROJECT_LOADED')).toBe(0);
    const finalCalls = snapshot.mock.calls.length;
    renderer.act(() => { jest.advanceTimersByTime(500); });
    expect(snapshot).toHaveBeenCalledTimes(finalCalls);
});

test('Escape cancels a pending drag and a project replacement resets selection', () => {
    const {root, vm} = fixture();
    const handle = root.root.findAllByProps({className: 'sa-layer-handle'})[0];
    renderer.act(() => handle.props.onPointerDown({button: 0, pointerId: 1, clientX: 10, clientY: 10,
        stopPropagation: jest.fn(), currentTarget: {setPointerCapture: jest.fn(), hasPointerCapture: () => false}}));
    const event = {type: 'keydown', key: 'Escape', preventDefault: jest.fn(), stopPropagation: jest.fn()};
    renderer.act(() => listeners.keydown(event));
    expect(event.preventDefault).toHaveBeenCalled();
    const next = {...vm.runtime.targets[0], id: 'new-stage'};
    vm.runtime.targets = [next];
    vm.editingTarget = next;
    renderer.act(() => { vm.runtime.emit('PROJECT_LOADED'); });
    expect(root.root.findAllByProps({className: 'sa-layer-handle'})).toHaveLength(0);
    expect(root.root.findByProps({className: 'sa-layer-select'}).props['aria-pressed']).toBe(true);
    renderer.act(() => root.unmount());
});
