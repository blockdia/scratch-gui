import React from 'react';
import renderer from 'react-test-renderer';
import {IntlProvider} from 'react-intl';
import {englishAddonMessages} from '../../../src/addons/translations';
import {EventEmitter} from 'events';
import createDebuggerWindow from '../../../src/addons/addons/debugger/window.jsx';

const container = () => ({
    children: [],
    appendChild (child) {
        this.children.push(child);
        child.parentNode = this;
    },
    removeChild (child) {
        this.children.splice(this.children.indexOf(child), 1);
        child.parentNode = null;
    }
});

test('debugger switches DOM engines, retains buffers and releases its compiler listener', () => {
    const vm = new EventEmitter();
    vm.runtime = {compilerOptions: {enabled: false}};
    const tabs = ['Logs', 'Threads', 'Performance'].map(text => ({
        tab: {text, icon: '/icon.svg'}, content: {}, buttons: [], show: jest.fn(), hide: jest.fn()
    }));
    const addon = {tab: {scratchClass: () => '', redux: {dispatch: jest.fn()}}};
    const Component = createDebuggerWindow({addon, vm, tabs, unpauseButton: {element: {}}});
    const render = visible => React.createElement(IntlProvider, {locale: 'en', messages: englishAddonMessages},
        React.createElement(Component, {visible, locale: 'en', direction: 'ltr'}));
    let root;
    renderer.act(() => { root = renderer.create(render(true), {createNodeMock: container}); });
    expect(tabs[0].show).toHaveBeenCalledTimes(1);
    expect(tabs[0].content.parentNode).toBeTruthy();
    expect(vm.listenerCount('COMPILER_OPTIONS_CHANGED')).toBe(1);
    renderer.act(() => { root.root.findAllByProps({role: 'tab'})[2].props.onClick(); });
    expect(tabs[0].hide).toHaveBeenCalledTimes(1);
    expect(tabs[0].content.parentNode).toBe(null);
    expect(tabs[2].content.parentNode).toBeTruthy();
    renderer.act(() => { root.update(render(false)); });
    expect(tabs[2].hide).toHaveBeenCalledTimes(1);
    renderer.act(() => { root.update(render(true)); });
    expect(tabs[2].show).toHaveBeenCalledTimes(2);
    renderer.act(() => {
        vm.runtime.compilerOptions.enabled = true;
        vm.emit('COMPILER_OPTIONS_CHANGED');
    });
    expect(root.root.findAllByType('button')).toHaveLength(1);
    renderer.act(() => { root.unmount(); });
    expect(tabs[2].content.parentNode).toBe(null);
    expect(tabs[2].hide).toHaveBeenCalledTimes(2);
    expect(vm.listenerCount('COMPILER_OPTIONS_CHANGED')).toBe(0);
});
