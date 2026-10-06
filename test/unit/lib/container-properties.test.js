import React from 'react';
import renderer from 'react-test-renderer';
import {IntlProvider} from 'react-intl';
import ContainerProperties from '../../../src/containers/container-properties.jsx';
import DirectionPicker from '../../../src/containers/direction-picker.jsx';

jest.mock('../../../src/components/popover/popover.jsx', () => ({isOpen, body, children}) => (
    <div>{children}{isOpen ? body : null}</div>
));
jest.mock('../../../src/containers/direction-picker.jsx', () => () => <div />);

const fixture = () => {
    const vm = {setSpriteContainerTransform: jest.fn(), setSpriteContainerStretch: jest.fn()};
    const focus = jest.fn();
    const ownerDocument = {addEventListener: jest.fn(), removeEventListener: jest.fn()};
    const render = (props = {}) => (<IntlProvider locale="en">
        <ContainerProperties vm={vm} path="A" container={{}} {...props} />
    </IntlProvider>);
    let root;
    renderer.act(() => { root = renderer.create(render(), {createNodeMock: () => ({focus, ownerDocument})}); });
    const button = () => root.root.findByType('button');
    const event = key => ({key, stopPropagation: jest.fn(), preventDefault: jest.fn()});
    const open = () => renderer.act(() => button().props.onClick(event()));
    return {vm, root, render, button, event, open, focus};
};

test('property button opens a popup with native buffered fields and no per-container VM listeners', () => {
    const {vm, root, button, event, open} = fixture();
    expect(root.root.findAllByProps({role: 'dialog'})).toHaveLength(0);
    open();
    expect(button().props['aria-expanded']).toBe(true);
    const fields = root.root.findAllByType('input');
    expect(fields.map(input => input.props.value)).toEqual([0, 0, 100, 100, 100]);
    renderer.act(() => fields[0].props.onChange({target: {value: '12.5'}}));
    expect(vm.setSpriteContainerTransform).not.toHaveBeenCalled();
    renderer.act(() => fields[0].props.onBlur());
    expect(vm.setSpriteContainerTransform).toHaveBeenCalledWith('A', {x: 12.5});
    renderer.act(() => button().props.onKeyDown(event(' ')));
    expect(button().props['aria-expanded']).toBe(false);
    renderer.act(() => root.unmount());
});

test('Escape cancels pending input, closes the popup and returns focus to its button', () => {
    const {vm, root, open, event, focus} = fixture();
    open();
    const input = root.root.findAllByType('input')[0];
    renderer.act(() => input.props.onChange({target: {value: '99'}}));
    const flush = input.props.onBlur;
    renderer.act(() => {
        root.root.findByProps({role: 'dialog'}).props.onKeyDown(event('Escape'));
        flush(); // Focusing the trigger can blur the active input before unmount.
    });
    expect(vm.setSpriteContainerTransform).not.toHaveBeenCalled();
    expect(root.root.findAllByProps({role: 'dialog'})).toHaveLength(0);
    expect(focus).toHaveBeenCalled();
    renderer.act(() => root.unmount());
});

test('native rounded display and default numeric step preserve fractional submitted values', () => {
    const {vm, root, open, render} = fixture();
    renderer.act(() => root.update(render({container: {transform: {
        x: 12.5, y: -12.5, size: 123.456, direction: 111.54889466
    }}})));
    open();
    const fields = root.root.findAllByType('input');
    expect(fields.map(input => input.props.value)).toEqual([13, -12, 123, 100, 100]);
    expect(fields.every(input => typeof input.props.step === 'undefined')).toBe(true);
    const picker = root.root.findByType(DirectionPicker);
    expect(picker.props.direction).toBe(112);
    renderer.act(() => picker.props.onChangeDirection(112.25));
    expect(vm.setSpriteContainerTransform).toHaveBeenLastCalledWith('A', {direction: 112.25});
    renderer.act(() => fields[2].props.onChange({target: {value: '142.625'}}));
    renderer.act(() => fields[2].props.onBlur());
    expect(vm.setSpriteContainerTransform).toHaveBeenLastCalledWith('A', {size: 142.625});
    renderer.act(() => root.unmount());
});

test('folder changes and dragging close the popup, and fresh container props update the fields', () => {
    const {root, open, render} = fixture();
    open();
    renderer.act(() => root.update(render({container: {transform: {x: 35, size: 150}}})));
    expect(root.root.findAllByType('input').map(input => input.props.value)).toEqual([35, 0, 150, 100, 100]);
    renderer.act(() => root.update(render({disabled: true})));
    expect(root.root.findAllByProps({role: 'dialog'})).toHaveLength(0);
    renderer.act(() => root.update(render()));
    open();
    renderer.act(() => root.update(render({path: 'B'})));
    expect(root.root.findAllByProps({role: 'dialog'})).toHaveLength(0);
    renderer.act(() => root.unmount());
});

test('axis stretch is independent from the native size field', () => {
    const {vm, root, open} = fixture();
    open();
    const field = root.root.findAllByType('input').find(input => input.props.name === 'stretch-x');
    renderer.act(() => field.props.onChange({target: {value: '-150'}}));
    renderer.act(() => field.props.onBlur());
    expect(vm.setSpriteContainerStretch).toHaveBeenCalledWith('A', {x: -150, y: 100});
    expect(vm.setSpriteContainerTransform).not.toHaveBeenCalled();
    renderer.act(() => root.unmount());
});
