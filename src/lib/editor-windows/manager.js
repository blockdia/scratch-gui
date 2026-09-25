import {changeWindows, editorWindowsInitialState} from '../../reducers/editor-windows';

export const constrain = (rect, bounds, minimum = {width: 360, height: 240}) => {
    const width = Math.min(bounds.width, Math.max(minimum.width, rect.width));
    const height = Math.min(bounds.height, Math.max(minimum.height, rect.height));
    return {
        width,
        height,
        x: Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.width - width)),
        y: Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.height - height))
    };
};

// Content, callbacks and DOM references deliberately never enter Redux.
export class WindowManager {
    constructor () {
        this.definitions = new Map();
        this.listeners = new Set();
        this.state = editorWindowsInitialState;
        this.suspended = false;
        this.gesturing = false;
        this.bounds = {x: 8, y: 100, width: 1000, height: 600};
    }
    subscribe (callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
    emit () {
        this.listeners.forEach(callback => callback());
    }
    bind (store) {
        this.store = store;
        this.commit(this.state);
        return () => {
            this.store = null;
        };
    }
    commit (state) {
        this.state = state;
        if (this.store) this.store.dispatch(changeWindows(state));
        this.emit();
    }
    registerWindow (definition) {
        const {id} = definition;
        if (!id || this.definitions.has(id)) throw new Error(`Duplicate or missing window ID: ${id}`);
        const entry = Object.assign({size: {width: 565, height: 400}, minimum: {width: 360, height: 240}},
            definition, {owned: new Set()});
        this.definitions.set(id, entry);
        this.commit({...this.state,
            windows: {...this.state.windows,
                [id]: {status: 'closed', pinned: false, rect: null, unread: false}}});
        return {
            open: options => this.open(id, options),
            focus: () => this.focus(id),
            hide: () => this.hide(id),
            close: () => this.close(id),
            setPinned: pinned => this.setPinned(id, pinned),
            setUnread: unread => this.update(id, {unread}),
            own: element => {
                entry.owned.add(element);
                return () => entry.owned.delete(element);
            },
            unregister: () => this.unregister(id)
        };
    }
    update (id, patch) {
        if (!this.state.windows[id]) return;
        this.commit({...this.state,
            windows: {...this.state.windows,
                [id]: {...this.state.windows[id], ...patch}}});
    }
    call (id, event) {
        const entry = this.definitions.get(id);
        if (entry && entry[event]) entry[event]();
    }
    anchorRect (id, size) {
        const entry = this.definitions.get(id);
        const anchor = entry.anchor && entry.anchor.getBoundingClientRect();
        const rtl = entry.anchor && getComputedStyle(entry.anchor).direction === 'rtl';
        return constrain({x: anchor ? (rtl ? anchor.right - size.width : anchor.left) : this.bounds.x,
            y: anchor ? anchor.bottom + 8 : this.bounds.y,
            width: size.width,
            height: size.height}, this.bounds, entry.minimum);
    }
    open (id, {pinned} = {}) {
        const current = this.state.windows[id];
        if (!current || this.suspended) return;
        if (current.status === 'visible') {
            if (typeof pinned === 'boolean') this.setPinned(id, pinned);
            this.focus(id);
            return;
        }
        const entry = this.definitions.get(id);
        const rect = current.pinned && current.rect ? constrain(current.rect, this.bounds, entry.minimum) :
            this.anchorRect(id, current.rect || entry.size);
        this.update(id, {status: 'visible', rect, pinned: typeof pinned === 'boolean' ? pinned : current.pinned});
        this.focus(id);
    }
    focus (id) {
        if (this.suspended || !this.state.windows[id] || this.state.windows[id].status !== 'visible') return;
        if (this.state.active === id) return;
        Object.keys(this.state.windows).forEach(other => {
            if (other !== id && !this.state.windows[other].pinned) this.hide(other);
        });
        this.commit({...this.state, active: id, order: this.state.order.filter(item => item !== id).concat(id)});
        const entry = this.definitions.get(id);
        if (entry.element && !entry.element.contains(document.activeElement)) entry.element.focus();
    }
    toggle (id) {
        const current = this.state.windows[id];
        if (current.status !== 'visible') this.open(id);
        else if (this.state.active === id) this.hide(id);
        else this.focus(id);
    }
    hide (id, restoreFocus = true) {
        const current = this.state.windows[id];
        if (!current || current.status !== 'visible') return;
        if (restoreFocus) this.restoreFocus(id);
        this.commit({...this.state,
            active: this.state.active === id ? null : this.state.active,
            windows: {...this.state.windows, [id]: {...current, status: 'hidden'}}});
    }
    restoreFocus (id) {
        const entry = this.definitions.get(id);
        if (entry.element && entry.element.contains(document.activeElement) && entry.anchor) entry.anchor.focus();
    }
    close (id) {
        if (!this.state.windows[id]) return;
        this.hide(id);
        this.update(id, {status: 'closed', pinned: false, rect: null});
        this.call(id, 'onReset');
    }
    setPinned (id, pinned) {
        this.update(id, {pinned});
    }
    setRect (id, rect) {
        this.update(id, {rect: constrain(rect, this.bounds, this.definitions.get(id).minimum)});
    }
    setBounds (bounds) {
        if (Object.keys(bounds).every(key => bounds[key] === this.bounds[key])) return;
        this.bounds = bounds;
        this.definitions.forEach((entry, id) => {
            const current = this.state.windows[id];
            if (!current.rect) return;
            const rect = current.pinned ? constrain(current.rect, bounds, entry.minimum) :
                this.anchorRect(id, current.rect);
            if (Object.keys(rect).some(key => rect[key] !== current.rect[key])) this.update(id, {rect});
        });
    }
    outside (target) {
        if (this.gesturing || this.suspended) return;
        const owned = Array.from(this.definitions).find(([, entry]) =>
            [entry.element, entry.anchor, ...entry.owned].some(el => el && el.contains(target)));
        if (owned) {
            // The button click owns its toggle, including the previous active state.
            const entry = owned[1];
            if (![entry.anchor, entry.toolbarButton].some(el => el && el.contains(target))) this.focus(owned[0]);
            return;
        }
        Object.keys(this.state.windows).forEach(id => {
            if (!this.state.windows[id].pinned) this.hide(id, false);
        });
        if (this.state.active) this.commit({...this.state, active: null});
    }
    suspend (suspended) {
        if (this.suspended === suspended) return;
        if (suspended) {
            Object.keys(this.state.windows).forEach(id => {
                if (!this.state.windows[id].pinned) this.hide(id, false);
            });
        }
        this.suspended = suspended;
        this.commit({...this.state, active: null});
    }
    reset () {
        Array.from(this.definitions.keys()).forEach(id => this.close(id));
    }
    unregister (id) {
        if (!this.definitions.has(id)) return;
        this.hide(id);
        this.call(id, 'onDestroy');
        this.definitions.delete(id);
        const windows = {...this.state.windows};
        delete windows[id];
        this.commit({...this.state, windows, order: this.state.order.filter(item => item !== id)});
    }
}
export default new WindowManager();
