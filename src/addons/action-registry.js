import actions from '../lib/editor-actions';

// Handles survive dynamic disable, just like addon window handles.
export default class AddonActions {
    constructor (id, isEnabled, registry = actions) {
        this.id = id;
        this.isEnabled = isEnabled;
        this.registry = registry;
        this.records = new Set();
    }
    register (definition) {
        if (!definition.id || definition.id.includes('/')) throw new Error('Invalid addon action ID');
        const id = `addon/${this.id}/${definition.id}`;
        if (Array.from(this.records).some(record => record.definition.id === id)) {
            throw new Error(`Duplicate addon action: ${id}`);
        }
        const record = {definition: {...definition, id, source: this.id}, handle: null};
        this.records.add(record);
        if (this.isEnabled()) record.handle = this.registry.registerAction(record.definition);
        return {
            execute: () => record.handle && record.handle.execute(),
            update: patch => {
                const {id: _id, source: _source, ...rest} = patch;
                Object.assign(record.definition, rest);
                if (record.handle) record.handle.update(rest);
            },
            unregister: () => {
                if (record.handle) record.handle.unregister();
                this.records.delete(record);
                record.handle = null;
            }
        };
    }
    setEnabled (enabled) {
        this.records.forEach(record => {
            if (enabled && !record.handle) record.handle = this.registry.registerAction(record.definition);
            else if (!enabled && record.handle) {
                record.handle.unregister();
                record.handle = null;
            }
        });
    }
}
