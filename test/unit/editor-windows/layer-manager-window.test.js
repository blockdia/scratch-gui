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
const fixture = (withContainers = false) => {
    const target = (id, order, extra = {}) => ({id, publicId: `@sprite:${id}`, isOriginal: true, isStage: false, visible: true,
        isEffectivelyVisible () { return this.visible; },
        getLayerOrder: () => order, getCostumes: () => [], getName: () => id, ...extra});
    const stage = target('stage', 0, {isStage: true, publicId: '_stage_'});
    const a = target('a', 1, withContainers ? {getName: () => 'A//N//Sprite', publicId: '@sprite:A//N//Sprite'} : {});
    const clone = target('clone', 2, {isOriginal: false, publicId: '@clone:1'});
    const runtime = new EventEmitter();
    runtime.targets = [stage, a, clone];
    runtime.spriteContainers = {getTargetContainers: member => withContainers && member === a ? [
        {id: 'A', path: 'A', visible: true}, {id: 'A//N', path: 'A//N', visible: true}
    ] : []};
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

test('containers select without changing the VM, collapse descendants and reveal externally selected sprites', () => {
    const {root, vm, render} = fixture(true);
    const item = id => root.root.findByProps({'data-layer-id': id});
    const select = id => item(id).findByProps({className: 'sa-layer-select'}).props.onClick();
    const toggle = id => item(id).findByProps({className: 'sa-layer-toggle'}).props.onClick();
    expect(item('a').props['aria-level']).toBe(3);
    renderer.act(() => select('container:A'));
    expect(vm.setEditingTarget).not.toHaveBeenCalled();
    expect(root.root.findByProps({className: 'sa-layer-actions'}).findAllByType('button')[1].props.disabled).toBe(true);
    renderer.act(() => select('a'));
    renderer.act(() => toggle('container:A'));
    expect(root.root.findAllByProps({'data-layer-id': 'a'})).toHaveLength(0);
    expect(item('container:A').props['aria-selected']).toBe(true);
    expect(item('container:A').props['aria-expanded']).toBe(false);
    renderer.act(() => root.update(render(false)));
    renderer.act(() => root.update(render(true)));
    expect(item('container:A').props['aria-expanded']).toBe(false);
    renderer.act(() => {
        vm.editingTarget = vm.runtime.targets[0];
        jest.advanceTimersByTime(100);
    });
    renderer.act(() => {
        vm.editingTarget = vm.runtime.targets[1];
        jest.advanceTimersByTime(100);
    });
    expect(item('a').props['aria-selected']).toBe(true);
    expect(item('container:A').props['aria-expanded']).toBe(true);
    renderer.act(() => toggle('container:A'));
    renderer.act(() => vm.runtime.emit('PROJECT_LOADED'));
    expect(item('container:A').props['aria-expanded']).toBe(true);
    renderer.act(() => root.unmount());
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
