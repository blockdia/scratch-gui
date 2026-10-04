import React from 'react';
import renderer from 'react-test-renderer';
import ReactPopover from 'react-popover';
import Popover from '../../../src/components/popover/popover.jsx';

jest.mock('react-popover', () => {
    // eslint-disable-next-line global-require
    const MockReact = require('react');
    return class MockPopover extends MockReact.Component {
        render () {
            return this.props.children;
        }
    };
});

const fixture = () => {
    const listeners = new Map();
    const ownerDocument = {
        addEventListener: jest.fn((type, listener) => listeners.set(type, listener)),
        removeEventListener: jest.fn((type, listener) => {
            if (listeners.get(type) === listener) listeners.delete(type);
        })
    };
    const anchorInput = {blur: jest.fn()};
    const popupInput = {blur: jest.fn()};
    const targetEl = {ownerDocument, contains: node => node === targetEl || node === anchorInput};
    const containerEl = {contains: node => node === containerEl || node === popupInput};
    const onOuterAction = jest.fn();
    const render = (props = {}) => (
        <Popover
            isOpen={false}
            onOuterAction={onOuterAction}
            body={<div />}
            {...props}
        >
            <button />
        </Popover>
    );
    let root;
    renderer.act(() => {
        root = renderer.create(render());
    });
    Object.assign(root.root.findByType(ReactPopover).instance, {targetEl, containerEl});
    const update = props => renderer.act(() => root.update(render(props)));
    const fire = (type, target) => renderer.act(() => listeners.get(type)({type, target}));
    const unmount = () => renderer.act(() => root.unmount());
    return {root,
        ownerDocument,
        listeners,
        targetEl,
        containerEl,
        anchorInput,
        popupInput,
        onOuterAction,
        update,
        fire,
        unmount};
};

test('outside mouse and touch actions are captured only while open', () => {
    const f = fixture();
    expect(f.listeners.size).toBe(0);
    f.update({isOpen: true});
    for (const type of ['mousedown', 'touchstart']) {
        expect(f.ownerDocument.addEventListener).toHaveBeenCalledWith(type, expect.any(Function), true);
        f.fire(type, {});
        expect(f.onOuterAction).toHaveBeenLastCalledWith(expect.objectContaining({type}));
    }
    expect(f.onOuterAction).toHaveBeenCalledTimes(2);
    f.update({isOpen: false});
    expect(f.listeners.size).toBe(0);
    f.unmount();
});

test('popup contents and trigger descendants do not dismiss the popup', () => {
    const f = fixture();
    f.update({isOpen: true});
    for (const type of ['mousedown', 'touchstart']) {
        for (const target of [f.targetEl, f.containerEl, f.anchorInput, f.popupInput]) f.fire(type, target);
    }
    expect(f.onOuterAction).not.toHaveBeenCalled();
    f.unmount();
});

test.each(['anchorInput', 'popupInput'])('flushes %s before the close callback', key => {
    const f = fixture();
    f.ownerDocument.activeElement = f[key];
    const calls = [];
    f[key].blur.mockImplementation(() => calls.push('blur'));
    f.onOuterAction.mockImplementation(() => calls.push('close'));
    f.update({isOpen: true});
    f.fire('mousedown', {});
    expect(calls).toEqual(['blur', 'close']);
    f.unmount();
});

test('does not blur unrelated inputs or invoke the legacy bubbling callback twice', () => {
    const f = fixture();
    const blur = jest.fn();
    f.ownerDocument.activeElement = {blur};
    f.update({isOpen: true});
    f.fire('mousedown', {});
    f.root.root.findByType(ReactPopover).props.onOuterAction({});
    expect(blur).not.toHaveBeenCalled();
    expect(f.onOuterAction).toHaveBeenCalledTimes(1);
    f.unmount();
});

test('uses updated callbacks and removes both capture listeners on unmount', () => {
    const f = fixture();
    f.update({isOpen: true});
    const next = jest.fn();
    f.update({isOpen: true, onOuterAction: next});
    f.fire('mousedown', {});
    expect(next).toHaveBeenCalledTimes(1);
    expect(f.onOuterAction).not.toHaveBeenCalled();
    f.unmount();
    expect(f.listeners.size).toBe(0);
    for (const type of ['mousedown', 'touchstart']) {
        expect(f.ownerDocument.removeEventListener).toHaveBeenCalledWith(type, expect.any(Function), true);
    }
});
