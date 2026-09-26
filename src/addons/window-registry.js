import windowManager from '../lib/editor-windows/manager';
import reactWindow from './react-window.jsx';

// Handles survive dynamic disable; registrations do not.
export default class AddonWindows {
    constructor (id, isEnabled, manager = windowManager) {
        this.id = id;
        this.isEnabled = isEnabled;
        this.manager = manager;
        this.records = new Set();
    }
    create (definition) {
        if (!definition.id) throw new Error('Missing addon window ID');
        const options = {...reactWindow(definition), id: `${this.id}/${definition.id}`};
        if (Array.from(this.records).some(record => record.options.id === options.id)) {
            throw new Error(`Duplicate addon window ID: ${options.id}`);
        }
        const record = {options,
            unread: false,
            handle: this.isEnabled() ? this.manager.registerWindow(options) : null};
        this.records.add(record);
        const api = {};
        for (const name of ['open', 'focus', 'hide', 'close', 'setPinned', 'own']) {
            api[name] = (...args) => (record.handle ? record.handle[name](...args) : null);
        }
        api.setUnread = unread => {
            record.unread = unread;
            if (record.handle) record.handle.setUnread(unread);
        };
        api.unregister = () => {
            if (record.handle) record.handle.unregister();
            record.handle = null;
            this.records.delete(record);
        };
        return api;
    }
    setEnabled (enabled) {
        for (const record of this.records) {
            if (enabled && !record.handle) {
                record.handle = this.manager.registerWindow(record.options);
                record.handle.setUnread(record.unread);
            } else if (!enabled && record.handle) {
                record.handle.unregister();
                record.handle = null;
            }
        }
    }
}
