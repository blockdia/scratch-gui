import bowser from 'bowser';
import {ActionRegistry} from './registry';
let storage = null;
try {
    storage = typeof localStorage === 'undefined' ? null : localStorage;
} catch (_) { /* The registry reports unavailable storage when saving. */ }
const actions = new ActionRegistry({mac: Boolean(bowser.mac), storage});
export default actions;
