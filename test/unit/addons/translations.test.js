import React from 'react';
import renderer from 'react-test-renderer';
import {FormattedMessage} from 'react-intl';
import {loadAddonMessages, resolveAddonLocale, namespaceAddonMessages} from '../../../src/addons/translations';
import {AddonIntlProvider} from '../../../src/addons/intl-provider.jsx';

jest.mock('../../../src/addons/generated/l10n-entries', () => ({
    'zh-cn': jest.fn(() => Promise.resolve({default: {'debugger/tab-logs': '日志'}})),
    es: jest.fn(),
    fr: jest.fn(() => Promise.resolve({'debugger/tab-logs': 'Journaux'}))
}));

test('normalizes locale codes and merges English fallback without mutating shared messages', async () => {
    expect(resolveAddonLocale('zh-CN')).toBe('zh-cn');
    expect(resolveAddonLocale('fr-CA')).toBe('fr');
    expect(resolveAddonLocale('unknown')).toBe('en');
    const chinese = await loadAddonMessages('zh-CN');
    const french = await loadAddonMessages('fr-CA');
    const english = await loadAddonMessages('en');
    expect(chinese['debugger/tab-logs']).toBe('日志');
    expect(chinese['debugger/tab-threads']).toBe('Threads');
    expect(french['debugger/tab-logs']).toBe('Journaux');
    expect(english['debugger/tab-logs']).toBe('Logs');
    expect(namespaceAddonMessages({'debugger/tab-logs': 'Logs', metadata: {}}))
        .toEqual({'addons.debugger.tab-logs': 'Logs'});
});

test('merges GUI and addon messages and updates locale without remounting the tool', async () => {
    const mounted = jest.fn();
    const View = () => {
        React.useEffect(() => { mounted(); }, []);
        return React.createElement('div', null,
            React.createElement(FormattedMessage, {id: 'gui.test'}),
            React.createElement(FormattedMessage, {id: 'addons.debugger.tab-logs'}));
    };
    const render = locale => React.createElement(AddonIntlProvider, {locale, messages: {'gui.test': 'GUI'}},
        React.createElement(View));
    let root;
    await renderer.act(async () => { root = renderer.create(render('en')); });
    expect(root.root.findAllByType('span').map(node => node.children[0])).toEqual(['GUI', 'Logs']);
    await renderer.act(async () => { root.update(render('zh-CN')); });
    expect(root.root.findAllByType('span').map(node => node.children[0])).toEqual(['GUI', '日志']);
    expect(mounted).toHaveBeenCalledTimes(1);
    await renderer.act(async () => { root.update(render('en')); });
    expect(root.root.findAllByType('span').map(node => node.children[0])).toEqual(['GUI', 'Logs']);
    root.unmount();
});


test('a slow previous locale cannot replace messages after switching back', async () => {
    const entries = require('../../../src/addons/generated/l10n-entries');
    let resolve;
    entries.es.mockImplementation(() => new Promise(done => { resolve = done; }));
    const render = locale => React.createElement(AddonIntlProvider, {locale, messages: {}},
        React.createElement(FormattedMessage, {id: 'addons.debugger.tab-logs'}));
    let root;
    await renderer.act(async () => { root = renderer.create(render('es')); });
    await renderer.act(async () => { root.update(render('en')); });
    await renderer.act(async () => { resolve({'debugger/tab-logs': 'Spanish log label'}); });
    expect(root.root.findByType('span').children).toEqual(['Logs']);
    root.unmount();
});
