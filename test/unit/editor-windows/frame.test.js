import React from 'react';
import {shallow} from 'enzyme';
import {WindowFrame, Toolbar} from '../../../src/components/editor-windows/editor-windows.jsx';
import manager from '../../../src/lib/editor-windows/manager';

const intl = {formatMessage: message => message.defaultMessage, formatDate: jest.fn(), formatTime: jest.fn(),
    formatRelative: jest.fn(), formatNumber: jest.fn(), formatPlural: jest.fn(), formatHTMLMessage: jest.fn(),
    now: jest.fn(), locale: 'en'};
let handle;
let entry;
let frame;
const sync = () => frame.setProps({window: manager.state.windows.test, active: manager.state.active === 'test'});
beforeEach(() => {
    global.document = {activeElement: null};
    handle = manager.registerWindow({id: 'test', title: 'Test', onShow: jest.fn(), onHide: jest.fn(), onReset: jest.fn()});
    entry = manager.definitions.get('test');
    frame = shallow(<WindowFrame entry={entry} window={manager.state.windows.test} intl={intl} active={false} />);
    frame.instance().element = {focus: jest.fn()};
});
afterEach(() => { frame.unmount(); handle.unregister(); });
test('show/hide lifecycle fires once, including fullscreen suspension', () => {
    handle.open(); sync();
    expect(entry.onShow).toHaveBeenCalledTimes(1);
    frame.setProps({index: 2});
    expect(entry.onShow).toHaveBeenCalledTimes(1);
    frame.setProps({suspended: true});
    expect(entry.onHide).toHaveBeenCalledTimes(1);
    frame.setProps({suspended: false});
    expect(entry.onShow).toHaveBeenCalledTimes(2);
    handle.hide(); sync();
    expect(entry.onHide).toHaveBeenCalledTimes(2);
});
test('title drag pins only after threshold and cancellation releases capture', () => {
    handle.open(); sync();
    const target = {setPointerCapture: jest.fn(), hasPointerCapture: () => true, releasePointerCapture: jest.fn()};
    const instance = frame.instance();
    instance.start({button: 0, target: {closest: () => null}, currentTarget: target,
        preventDefault: jest.fn(), pointerId: 7, clientX: 100, clientY: 150}, '');
    instance.move({clientX: 102, clientY: 150});
    expect(manager.state.windows.test.pinned).toBe(false);
    instance.move({clientX: 130, clientY: 160});
    expect(manager.state.windows.test.pinned).toBe(true);
    expect(manager.gesturing).toBe(true);
    instance.finish();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(manager.gesturing).toBe(false);
});
test.each(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])('resize handle %s pins and enforces minimum size', edge => {
    handle.open(); sync();
    const instance = frame.instance();
    instance.start({button: 0, target: {closest: () => null}, currentTarget: {
        setPointerCapture: jest.fn(), hasPointerCapture: () => false},
    preventDefault: jest.fn(), pointerId: 1, clientX: 100, clientY: 150}, edge);
    instance.move({clientX: 1000, clientY: 1000});
    expect(manager.state.windows.test.pinned).toBe(true);
    expect(manager.state.windows.test.rect.width).toBeGreaterThanOrEqual(360);
    expect(manager.state.windows.test.rect.height).toBeGreaterThanOrEqual(240);
    instance.finish();
});
test('Escape respects a child-handled event', () => {
    handle.open(); sync();
    frame.find('section').simulate('keyDown', {key: 'Escape', defaultPrevented: true});
    expect(manager.state.windows.test.status).toBe('visible');
    frame.find('section').simulate('keyDown', {key: 'Escape', stopPropagation: jest.fn()});
    expect(manager.state.windows.test.status).toBe('hidden');
});
test('overflow provides access to every registered tool without adding demo tools to production', () => {
    const handles = ['two', 'three', 'four'].map(id => manager.registerWindow({id, title: id}));
    const toolbar = shallow(<Toolbar intl={intl} />, {disableLifecycleMethods: true});
    toolbar.setState({capacity: 1, expanded: true});
    expect(toolbar.find('[data-window-button]').length).toBe(4);
    handles.forEach(item => item.unregister());
});

test.each(['closed', 'hidden'])('double click opens and pins a %s tool without hiding between clicks', status => {
    if (status === 'hidden') { handle.open(); handle.hide(); }
    const toolbar = shallow(<Toolbar intl={intl} />, {disableLifecycleMethods: true});
    toolbar.find('[data-window-button="test"]').simulate('click', {detail: 1});
    expect(manager.state.windows.test.status).toBe('visible');
    expect(manager.state.windows.test.pinned).toBe(false);
    toolbar.find('[data-window-button="test"]').simulate('click', {detail: 2});
    expect(manager.state.windows.test.status).toBe('visible');
    expect(manager.state.windows.test.pinned).toBe(true);
});
