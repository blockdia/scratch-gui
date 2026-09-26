import React from 'react';
import log from '../../../src/lib/log';
import renderer from 'react-test-renderer';
import reactWindow from '../../../src/addons/react-window.jsx';
import {WindowFrame} from '../../../src/components/editor-windows/editor-windows.jsx';
import {WindowManager} from '../../../src/lib/editor-windows/manager';

const intl = {formatMessage: message => message.defaultMessage, formatDate: jest.fn(), formatTime: jest.fn(),
    formatRelative: jest.fn(), formatNumber: jest.fn(), formatPlural: jest.fn(), formatHTMLMessage: jest.fn(),
    now: jest.fn()};

test('React window retains hidden state, receives environment changes and cleans up on close and disable', () => {
    const mounted = jest.fn();
    const cleanup = jest.fn();
    let view;
    class Inspector extends React.Component {
        constructor (props) {
            super(props);
            this.state = {count: 0};
            view = this;
        }
        componentDidMount () { mounted(); }
        componentWillUnmount () { cleanup(); }
        render () { return React.createElement('span', null, this.state.count); }
    }
    const manager = new WindowManager();
    const definition = reactWindow({id: 'addon/inspector', title: 'Inspector', component: Inspector});
    let handle = manager.registerWindow(definition);
    let suspended = false;
    let locale = 'en';
    let rtl = false;
    let theme = 'light';
    const render = () => {
        const entry = manager.definitions.get(definition.id);
        return entry ? React.createElement(WindowFrame, {
            entry, window: manager.state.windows[definition.id],
            intl: {...intl, locale},
            suspended, rtl, theme, active: false
        }) : null;
    };
    const root = renderer.create(render());
    const sync = () => root.update(render());
    expect(mounted).not.toHaveBeenCalled();
    handle.open(); sync();
    expect(mounted).toHaveBeenCalledTimes(1);
    view.setState({count: 7});
    handle.hide(); sync();
    expect(view.props.visible).toBe(false);
    expect(view.state.count).toBe(7);
    handle.open({pinned: true}); sync();
    suspended = true; sync();
    expect(view.props.visible).toBe(false);
    locale = 'ar'; rtl = true; theme = 'dark'; sync();
    expect(view.props).toMatchObject({locale: 'ar', direction: 'rtl', theme: 'dark'});
    suspended = false; sync();
    expect(view.props.visible).toBe(true);
    expect(view.state.count).toBe(7);
    handle.close(); sync();
    expect(cleanup).toHaveBeenCalledTimes(1);
    handle.open(); sync();
    expect(view.state.count).toBe(0);
    manager.reset(); sync();
    expect(cleanup).toHaveBeenCalledTimes(2);
    handle.open(); sync();
    handle.unregister(); sync();
    expect(cleanup).toHaveBeenCalledTimes(3);
    handle = manager.registerWindow(definition); sync();
    handle.open(); sync();
    expect(mounted).toHaveBeenCalledTimes(4);
    root.unmount();
    expect(cleanup).toHaveBeenCalledTimes(4);
    handle.unregister();
});

test('hook components inherit context and release visible-only subscriptions', () => {
    const Context = React.createContext('fallback');
    const subscribe = jest.fn();
    const cleanup = jest.fn();
    const Inspector = ({visible}) => {
        const value = React.useContext(Context);
        React.useEffect(() => {
            if (!visible) return undefined;
            subscribe();
            return cleanup;
        }, [visible]);
        return React.createElement('span', null, value);
    };
    const definition = reactWindow({component: Inspector});
    const render = visible => React.createElement(Context.Provider, {value: 'host'},
        definition.render({status: visible ? 'visible' : 'hidden', visible}));
    let root;
    renderer.act(() => { root = renderer.create(render(true)); });
    expect(root.toJSON().children).toEqual(['host']);
    expect(subscribe).toHaveBeenCalledTimes(1);
    renderer.act(() => { root.update(render(false)); });
    expect(cleanup).toHaveBeenCalledTimes(1);
    renderer.act(() => { root.update(render(true)); });
    expect(subscribe).toHaveBeenCalledTimes(2);
    renderer.act(() => { root.unmount(); });
    expect(cleanup).toHaveBeenCalledTimes(2);
});

test('DOM definitions stay unchanged and conflicting renderers are rejected', () => {
    const definition = {id: 'dom', content: {nodeType: 1}};
    expect(reactWindow(definition)).toBe(definition);
    const component = () => null;
    expect(() => reactWindow({...definition, component})).toThrow(/cannot also/);
    expect(() => reactWindow({component, render: () => null})).toThrow(/cannot also/);
});

test('a failed addon view leaves other tools mounted and close/reopen retries', () => {
    const {IntlProvider} = require('react-intl');
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logged = jest.spyOn(log, 'error').mockImplementation(() => {});
    let fail = true;
    const Component = () => {
        if (fail) throw new Error('broken addon');
        return React.createElement('span', null, 'recovered');
    };
    const definition = reactWindow({component: Component});
    const render = status => React.createElement(IntlProvider, {locale: 'en'},
        React.createElement('main', null,
            React.createElement('aside', null, 'editor remains mounted'),
            definition.render({status, visible: status === 'visible'})));
    let root;
    try {
        renderer.act(() => { root = renderer.create(render('visible')); });
        expect(root.root.findByType('aside').children).toEqual(['editor remains mounted']);
        expect(root.root.findByProps({role: 'alert'})).toBeTruthy();
        renderer.act(() => { root.update(render('closed')); });
        fail = false;
        renderer.act(() => { root.update(render('visible')); });
        expect(root.root.findByType('span').children).toEqual(['recovered']);
    } finally {
        if (root) root.unmount();
        error.mockRestore();
        logged.mockRestore();
    }
});
