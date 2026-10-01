import {availableIn, reservations, scopesOverlap} from './context';
import {ariaBinding, eventBinding, normalizeBinding, resolveBinding} from './keys';

export const STORAGE_KEY = 'blockdia:shortcuts';
export const RECENT_STORAGE_KEY = 'blockdia:recent-palette-actions';
export class ActionRegistry {
    constructor ({mac = false, storage = null} = {}) {
        this.mac = mac;
        this.storage = storage;
        this.definitions = new Map();
        // Dialog shortcuts are matched by their dialogs, never by the global controller or palette.
        this.dialogShortcuts = new Map();
        this.listeners = new Set();
        this.overrides = {};
        this.context = {area: 'blocks'};
        this.notice = null;
        this.settingsOpen = false;
        this.recording = false;
        this.read();
        this.recentActions = [];
        try {
            const saved = this.storage && JSON.parse(this.storage.getItem(RECENT_STORAGE_KEY));
            if (Array.isArray(saved)) {
                this.recentActions = [...new Set(saved.filter(id => typeof id === 'string'))].slice(0, 100);
            }
        } catch (_) { /* History is optional; keep working without storage. */ }
    }
    subscribe (listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    emit () {
        this.listeners.forEach(listener => listener());
    }
    report (type, detail) {
        this.notice = {type, detail};
        this.emit();
    }
    read () {
        if (!this.storage) return;
        try {
            const raw = this.storage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved.version !== 1 || !saved.overrides || typeof saved.overrides !== 'object' ||
                Array.isArray(saved.overrides)) throw new Error('Invalid configuration');
            const next = {};
            Object.keys(saved.overrides).forEach(id => {
                if (!id.includes('/') || !Array.isArray(saved.overrides[id])) {
                    throw new Error('Invalid configuration');
                }
                next[id] = saved.overrides[id].map(normalizeBinding);
            });
            // Consolidate old fullscreen bindings without losing explicit unbindings.
            const oldFullscreen = ['builtin/fullscreen', 'builtin/exit-fullscreen'];
            if (!Object.prototype.hasOwnProperty.call(next, 'builtin/toggle-fullscreen') &&
                oldFullscreen.some(id => Object.prototype.hasOwnProperty.call(next, id))) {
                next['builtin/toggle-fullscreen'] = [...new Set(oldFullscreen.reduce((keys, id) =>
                    keys.concat(next[id] || []), []))];
            }
            oldFullscreen.forEach(id => delete next[id]);
            const migratedFind = Object.keys(next).some(id => id.startsWith('addon/find-bar/'));
            for (const [oldName, newName] of [['find', 'find-symbol'], ['back', 'navigate-back'],
                ['forward', 'navigate-forward']]) {
                const oldId = `addon/find-bar/${oldName}`;
                const newId = `builtin/${newName}`;
                if (!Object.prototype.hasOwnProperty.call(next, newId) &&
                    Object.prototype.hasOwnProperty.call(next, oldId)) next[newId] = next[oldId];
                delete next[oldId];
            }
            Object.keys(next).filter(id => id.startsWith('addon/find-bar/'))
                .forEach(id => delete next[id]);
            this.overrides = next;
            if (migratedFind) {
                try {
                    this.storage.setItem(STORAGE_KEY, JSON.stringify({version: 1, overrides: next}));
                } catch (_) {
                    this.notice = {type: 'storage'};
                }
            }
        } catch (_) {
            this.overrides = {};
            this.notice = {type: 'invalidStorage'};
        }
    }
    persist () {
        try {
            if (!this.storage) throw new Error('Storage unavailable');
            this.storage.setItem(STORAGE_KEY, JSON.stringify({version: 1, overrides: this.overrides}));
        } catch (_) {
            this.notice = {type: 'storage'};
        }
        this.emit();
    }
    registerAction (definition) {
        if (!definition.id || this.definitions.has(definition.id) || typeof definition.run !== 'function') {
            throw new Error(`Duplicate or invalid action: ${definition.id}`);
        }
        const entry = {source: 'builtin',
            category: 'editor',
            title: definition.id,
            ...definition,
            defaultBindings: (definition.defaultBindings || []).map(normalizeBinding)};
        this.definitions.set(entry.id, entry);
        this.emit();
        return {
            execute: () => this.definitions.get(entry.id) === entry && this.execute(entry.id),
            update: patch => {
                if (this.definitions.get(entry.id) !== entry) return;
                const {id: _id, ...rest} = patch; // IDs remain stable for saved overrides.
                if (rest.defaultBindings) rest.defaultBindings = rest.defaultBindings.map(normalizeBinding);
                Object.assign(entry, rest);
                this.emit();
            },
            unregister: () => {
                if (this.definitions.get(entry.id) === entry) {
                    this.definitions.delete(entry.id);
                    this.emit();
                }
            }
        };
    }
    enabled (definition, context) {
        return availableIn(definition, context) && (!definition.enabled || definition.enabled(context));
    }
    listActions (context) {
        return Array.from(this.definitions.values()).filter(definition => !definition.internal)
            .map(definition => ({...definition,
                bindings: this.bindings(definition.id),
                available: this.enabled(definition, context)}));
    }
    defineDialogShortcuts (definitions) {
        definitions.forEach(definition => {
            if (!definition.id || this.definitions.has(definition.id) || this.dialogShortcuts.has(definition.id)) {
                throw new Error(`Duplicate or invalid shortcut: ${definition.id}`);
            }
            this.dialogShortcuts.set(definition.id, {source: 'builtin',
                title: definition.id,
                ...definition,
                defaultBindings: ((this.mac && definition.macBindings) || definition.defaultBindings || [])
                    .map(normalizeBinding)});
        });
        this.emit();
    }
    listShortcuts () {
        return this.listActions().concat(Array.from(this.dialogShortcuts.values()).map(definition => ({
            ...definition,
            bindings: this.bindings(definition.id),
            available: true
        })));
    }
    matchDialogShortcut (scope, event) {
        const binding = eventBinding(event, this.mac);
        if (!binding) return null;
        const resolved = resolveBinding(binding, this.mac);
        const match = Array.from(this.dialogShortcuts.values()).find(definition =>
            definition.scopes.includes(scope) && this.bindings(definition.id).some(key =>
                resolveBinding(key, this.mac) === resolved));
        return match ? match.id : null;
    }
    ariaShortcuts (id) {
        const keys = this.bindings(id).map(binding => ariaBinding(binding, this.mac));
        return keys.length ? keys.join(' ') : null;
    }
    bindings (id) {
        const bindings = Object.prototype.hasOwnProperty.call(this.overrides, id) ? this.overrides[id] :
            ((this.definitions.get(id) || this.dialogShortcuts.get(id) || {}).defaultBindings || []);
        return bindings.slice();
    }
    recordUsage (id, result) {
        if (result !== false && this.definitions.has(id) && !this.definitions.get(id).internal) {
            this.recentActions = [id, ...this.recentActions.filter(other => other !== id)].slice(0, 100);
            try {
                if (this.storage) this.storage.setItem(RECENT_STORAGE_KEY, JSON.stringify(this.recentActions));
            } catch (_) { /* Retain session history when storage is unavailable. */ }
            this.emit();
        }
        return result;
    }
    executeFromPalette (id, context) {
        const result = this.execute(id, context);
        if (result && typeof result.then === 'function') {
            return result.then(value => this.recordUsage(id, value));
        }
        return this.recordUsage(id, result);
    }
    execute (id, context) {
        const definition = this.definitions.get(id);
        if (!definition || !this.enabled(definition, context)) return false;
        try {
            const result = definition.run();
            if (result && typeof result.then === 'function') {
                return result.catch(error => {
                    this.report('execution', {id, error});
                    return false;
                });
            }
            return typeof result === 'undefined' ? true : result;
        } catch (error) {
            this.report('execution', {id, error});
            return false;
        }
    }
    conflicts (id, bindings) {
        const dialog = this.dialogShortcuts.get(id);
        const definition = this.definitions.get(id) || dialog;
        if (!definition) return {actions: [], reserved: []};
        const keys = bindings.map(binding => resolveBinding(binding, this.mac));
        const reserved = reservations.filter(item => scopesOverlap(definition.scopes, item.scopes) &&
            item.keys.some(binding => keys.includes(resolveBinding(binding, this.mac))));
        // Unmodified keys in a dialog would block typing in its text fields.
        if (dialog && keys.some(key => !/(Ctrl|Meta|Alt)\+/.test(key))) reserved.push({name: 'input'});
        return {
            actions: this.listShortcuts().filter(other => other.id !== id &&
                scopesOverlap(definition.scopes, other.scopes) &&
                other.bindings.some(binding => keys.includes(resolveBinding(binding, this.mac)))),
            reserved
        };
    }
    setBindings (id, bindings, replace = false) {
        const normalized = [...new Set(bindings.map(normalizeBinding))];
        const current = this.bindings(id);
        // Removing a binding is always safe, even while another conflict remains.
        if (normalized.length < current.length && normalized.every(binding => current.includes(binding))) {
            this.overrides[id] = normalized;
            this.persist();
            return null;
        }
        const conflicts = this.conflicts(id, normalized);
        if (conflicts.reserved.length || (conflicts.actions.length && !replace)) return conflicts;
        const keys = normalized.map(binding => resolveBinding(binding, this.mac));
        conflicts.actions.forEach(other => {
            this.overrides[other.id] = other.bindings.filter(binding =>
                !keys.includes(resolveBinding(binding, this.mac)));
        });
        this.overrides[id] = normalized;
        this.persist();
        return null;
    }
    reset (id) {
        if (id) delete this.overrides[id];
        else this.overrides = {};
        this.persist();
    }
    openSettings () {
        this.settingsOpen = true;
        this.emit();
    }
}
