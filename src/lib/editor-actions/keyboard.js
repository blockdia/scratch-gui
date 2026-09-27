import {editableTarget, hasModal} from './context';
import {eventBinding, resolveBinding} from './keys';

// A single capture listener runs before legacy document listeners. Keyup is never consumed.
export class ShortcutController {
    constructor (registry, getState, isDragging = () => false) {
        this.registry = registry;
        this.getState = getState;
        this.isDragging = isDragging;
        this.stageFocused = false;
        this.pointerDown = false;
        this.track = this.track.bind(this);
        this.release = () => {
            this.pointerDown = false;
        };
        this.keydown = this.keydown.bind(this);
    }
    track (event) {
        const target = event.target;
        if (event.type === 'pointerdown') this.pointerDown = true;
        if (!target || !target.closest) return;
        if (target.closest('[data-shortcut-stage]')) this.stageFocused = true;
        else if (target !== document.body && target !== document.documentElement) this.stageFocused = false;
    }
    context (target) {
        const gui = this.getState().scratchGui;
        const keyboard = target && target.closest && target.closest('[data-shortcut-keyboard]');
        const window = target && target.closest && target.closest('[data-editor-window]');
        const stage = gui.mode.isFullScreen || gui.mode.isPlayerOnly || this.stageFocused;
        return {area: stage ? 'stage' : window ? 'window' : keyboard ? 'keyboard' :
            ['blocks', 'costumes', 'sounds', 'variables'][gui.editorTab.activeTabIndex],
        editing: !keyboard && editableTarget(target)};
    }
    keydown (event) {
        const registry = this.registry;
        if (registry.paletteOpen || registry.recording || registry.settingsOpen ||
            event.defaultPrevented || event.isComposing ||
            event.keyCode === 229 || this.pointerDown || this.isDragging() || hasModal()) return;
        const binding = eventBinding(event, registry.mac);
        if (!binding) return;
        const context = this.context(event.target);
        registry.context = context;
        // The proxy's printable input belongs to type-to-search and IME.
        if (context.area === 'keyboard' && Array.from(event.key).length === 1 &&
            !event.ctrlKey && !event.metaKey && !event.altKey) return;
        const resolved = resolveBinding(binding, registry.mac);
        const matches = registry.listActions(context).filter(action => action.available &&
            (!context.editing || (action.allowInInput && (event.ctrlKey || event.metaKey || event.altKey))) &&
            action.bindings.some(key => resolveBinding(key, registry.mac) === resolved));
        if (!matches.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return;
        if (matches.length > 1 || matches.some(action => registry.conflicts(action.id, [binding]).reserved.length)) {
            registry.report('conflict', matches.map(action => action.id));
            return;
        }
        registry.execute(matches[0].id, context);
    }
    mount (target = window) {
        target.addEventListener('keydown', this.keydown, true);
        target.addEventListener('pointerdown', this.track, true);
        target.addEventListener('focusin', this.track, true);
        target.addEventListener('pointerup', this.release, true);
        target.addEventListener('pointercancel', this.release, true);
        target.addEventListener('blur', this.release);
        return () => {
            target.removeEventListener('keydown', this.keydown, true);
            target.removeEventListener('pointerdown', this.track, true);
            target.removeEventListener('focusin', this.track, true);
            target.removeEventListener('pointerup', this.release, true);
            target.removeEventListener('pointercancel', this.release, true);
            target.removeEventListener('blur', this.release);
        };
    }
}
