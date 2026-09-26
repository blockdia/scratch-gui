import React from 'react';
import renderer from 'react-test-renderer';
import AddonWindows from '../../../src/addons/window-registry';
import {WindowManager} from '../../../src/lib/editor-windows/manager';

test('actual addon bridge defers late registrations, reuses handles and unmounts on disable', async () => {
    let enabled = true;
    const manager = new WindowManager();
    const bridge = new AddonWindows('addon', () => enabled, manager);
    const cleanup = jest.fn();
    const View = () => {
        React.useEffect(() => cleanup, []);
        return React.createElement('span', null, 'view');
    };
    enabled = false;
    bridge.setEnabled(false);
    await Promise.resolve(); // an async addon initialization finishes after disable
    const handle = bridge.create({id: 'late', component: View});
    handle.open(); handle.setUnread(true);
    expect(manager.definitions.size).toBe(0);
    expect(() => bridge.create({id: 'late', component: View})).toThrow(/Duplicate/);
    enabled = true;
    bridge.setEnabled(true);
    expect(manager.state.windows['addon/late'].unread).toBe(true);
    handle.open();
    const render = () => {
        const entry = manager.definitions.get('addon/late');
        return entry ? entry.render({status: manager.state.windows['addon/late'].status, visible: true}) : null;
    };
    let root;
    renderer.act(() => { root = renderer.create(render()); });
    enabled = false;
    renderer.act(() => { bridge.setEnabled(false); root.update(render()); });
    expect(cleanup).toHaveBeenCalledTimes(1);
    enabled = true;
    bridge.setEnabled(true);
    handle.open();
    renderer.act(() => { root.update(render()); });
    renderer.act(() => { handle.unregister(); root.update(render()); });
    expect(cleanup).toHaveBeenCalledTimes(2);
    bridge.setEnabled(false); bridge.setEnabled(true);
    expect(manager.definitions.size).toBe(0);
    root.unmount();
});
