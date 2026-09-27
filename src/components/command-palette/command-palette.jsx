/* eslint-disable react/jsx-no-bind */
import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {injectIntl, intlShape} from 'react-intl';
import withAddonIntl from '../../addons/intl-provider.jsx';
import AddonHooks from '../../addons/hooks';
import actions from '../../lib/editor-actions';
import {hasModal} from '../../lib/editor-actions/context';
import {displayBinding, eventBinding, resolveBinding} from '../../lib/editor-actions/keys';
import windowManager from '../../lib/editor-windows/manager';
import {activateTab} from '../../reducers/editor-tab';
import {navigationFor} from '../../lib/block-navigation';
import service from '../../lib/command-palette/service';
import installGestures from '../../lib/command-palette/gestures';
import messages from '../../lib/command-palette/messages';
import {parseQuery, filterResults} from '../../lib/command-palette/search';
import {targetResults, commandResults, symbolResults, referencesFor} from '../../lib/command-palette/providers';
import addonManifests from '../../addons/generated/addon-manifests';
import {loadAddonSettingsMessages} from '../../addons/settings/addon-translations';
import actionMessages from '../../lib/editor-actions/messages';
import {scrollIntoVisibleArea} from '../../lib/block-navigation/visible-area';
import SymbolIcon from './symbol-icon.jsx';
import styles from './command-palette.css';

export class CommandPalette extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false, query: '', index: 0, symbol: null, reference: null, error: false};
        this.refresh = this.refresh.bind(this);
        this.keydown = this.keydown.bind(this);
        this.outside = this.outside.bind(this);
        this.projectLoaded = () => {
            this.navigation.reset();
            this.close(false);
        };
        this.workspace = null;
        this.operation = 0;
        this.getOcclusion = () => this.panel && this.panel.getBoundingClientRect();
        this.keepVisible = () => {
            const ref = this.state.reference;
            if (!this.state.open || !ref || !this.workspace || this.navigation.pending ||
                (!this.vm.editingTarget || this.vm.editingTarget.id !== ref.targetId)) return;
            const block = this.workspace.getBlockById(ref.blockId);
            if (block) scrollIntoVisibleArea(this.workspace, block, this.getOcclusion());
        };
        this.bindWorkspace = () => {
            if (this.workspace === AddonHooks.blocklyWorkspace) return;
            if (this.workspace) this.workspace.removeChangeListener(this.refresh);
            this.workspace = AddonHooks.blocklyWorkspace;
            if (this.workspace) this.workspace.addChangeListener(this.refresh);
        };
    }
    componentDidMount () {
        this.navigation = navigationFor(this.vm);
        this.detach = service.attach(this);
        this.unsubscribe = actions.subscribe(this.refresh);
        this.vm.on('targetsUpdate', this.refresh);
        this.vm.on('PROJECT_CHANGED', this.refresh);
        this.vm.runtime.on('PROJECT_LOADED', this.projectLoaded);
        window.addEventListener('keydown', this.keydown, true);
        window.addEventListener('pointerdown', this.outside, true);
        this.bindWorkspace();
        window.addEventListener('resize', this.keepVisible);
        if (typeof ResizeObserver !== 'undefined') this.resizeObserver = new ResizeObserver(this.keepVisible);
        this.attachGestures = () => {
            if (!this.detached && !this.detachGestures) this.detachGestures = installGestures(AddonHooks.blockly);
        };
        if (AddonHooks.blockly) this.attachGestures();
        else AddonHooks.blocklyCallbacks.push(this.attachGestures);
    }
    componentDidUpdate (previous) {
        this.bindWorkspace();
        const gui = this.props.editorState.scratchGui;
        if (this.state.open && (gui.mode.isPlayerOnly || gui.mode.isFullScreen ||
            !this.vm.runtime.targets.some(target => target.id === this.originId))) {
            this.close(false);
            return;
        }
        if (this.state.open && previous.editorState !== this.props.editorState && !this.state.symbol) {
            const target = this.vm.editingTarget;
            if (target && (this.originId !== target.id || this.tab !== gui.editorTab.activeTabIndex)) {
                this.originId = target.id;
                this.tab = gui.editorTab.activeTabIndex;
                this.labelCache.clear();
                // Only reset when the external target or tab actually changes.
                this.setState({index: 0}); // eslint-disable-line react/no-did-update-set-state
            }
        }
        if (this.state.open && this.list) {
            const selected = this.list.querySelector('[aria-selected="true"]');
            if (selected && selected.scrollIntoView) selected.scrollIntoView({block: 'nearest'});
        }
    }
    componentWillUnmount () {
        this.detached = true;
        window.removeEventListener('resize', this.keepVisible);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.detach();
        this.unsubscribe();
        this.navigation.reset();
        actions.paletteOpen = false;
        if (this.detachGestures) this.detachGestures();
        if (this.workspace) this.workspace.removeChangeListener(this.refresh);
        this.vm.removeListener('targetsUpdate', this.refresh);
        this.vm.removeListener('PROJECT_CHANGED', this.refresh);
        this.vm.runtime.removeListener('PROJECT_LOADED', this.projectLoaded);
        window.removeEventListener('keydown', this.keydown, true);
        window.removeEventListener('pointerdown', this.outside, true);
        cancelAnimationFrame(this.refreshFrame);
    }
    get vm () {
        return this.props.editorState.scratchGui.vm;
    }
    t (key, values) {
        return this.props.intl.formatMessage(messages[key], values);
    }
    refresh () {
        this.bindWorkspace();
        if (!this.state.open || this.refreshFrame) return;
        this.refreshFrame = requestAnimationFrame(() => {
            this.refreshFrame = null;
            if (!this.detached && this.state.open) {
                if (this.state.symbol && !this.results().some(item => item.id === this.state.symbol.id)) {
                    this.navigation.cancel();
                    this.setState({symbol: null, reference: null, error: true});
                } else if (this.state.symbol && this.state.reference &&
                    !referencesFor(this.vm, this.state.symbol).some(ref =>
                        ref.targetId === this.state.reference.targetId &&
                        ref.blockId === this.state.reference.blockId)) {
                    this.navigation.cancel();
                    this.setState({reference: null, error: false});
                } else this.forceUpdate();
            }
        });
    }
    open ({mode = 'targets', blockId} = {}) {
        const gui = this.props.editorState.scratchGui;
        if (gui.mode.isPlayerOnly || gui.mode.isFullScreen || hasModal() ||
            windowManager.gesturing || (this.workspace && this.workspace.isDragging())) return false;
        if (!this.state.open) {
            this.returnFocus = document.activeElement;
            this.originContext = {...this.props.getContext(document.activeElement)};
        }
        for (const menu of Object.keys(gui.menus || {})) {
            if (gui.menus[menu]) this.props.dispatch({type: 'scratch-gui/menus/CLOSE_MENU', menu});
        }
        this.operation++;
        this.navigation.cancel();
        this.originId = this.vm.editingTarget && this.vm.editingTarget.id;
        this.tab = gui.editorTab.activeTabIndex;
        this.labelCache = new Map();
        actions.paletteOpen = true;
        this.setState({open: true,
            query: mode === 'commands' ? '>' : mode === 'symbols' ? '@' : '',
            index: 0,
            symbol: null,
            reference: null,
            error: false}, () => {
            if (this.input) this.input.focus();
            if (!blockId) this.selectFirst();
            if (blockId) {
                const items = this.results();
                const index = items.findIndex(item => referencesFor(this.vm, item)
                    .some(ref => ref.targetId === this.originId && ref.blockId === blockId));
                if (index !== -1) {
                    this.setState({index});
                    this.choose(items[index], blockId);
                }
            }
        });
        return true;
    }
    selectFirst () {
        if (this.composing || parseQuery(this.state.query).mode !== 'symbols') return;
        const item = this.results()[0];
        if (item) this.choose(item);
    }
    close (restore = true) {
        this.operation++;
        this.navigation.cancel();
        actions.paletteOpen = false;
        this.composing = false;
        this.setState({open: false, symbol: null, reference: null});
        if (restore && this.returnFocus && this.returnFocus.isConnected) this.returnFocus.focus();
    }
    outside (event) {
        if (this.state.open && this.panel && !this.panel.contains(event.target)) this.close();
    }
    results () {
        const {mode, query} = parseQuery(this.state.query);
        if (this.sourceLocale !== this.props.intl.locale) {
            this.sourceLocale = this.props.intl.locale;
            this.sourceNames = loadAddonSettingsMessages(this.sourceLocale);
        }
        let items;
        if (mode === 'targets') items = targetResults(this.vm, key => this.t(key));
        else if (mode === 'commands') {
            items = commandResults(actions, this.originContext, this.props.intl,
                source => (source === 'builtin' ? this.props.intl.formatMessage(actionMessages.builtin) :
                    this.sourceNames[`${source}/@name`] || (addonManifests[source] || {}).name || source));
        } else {
            items = symbolResults(this.vm, this.originId, this.tab, this.workspace, key => this.t(key));
            for (const item of items) {
                // Blockly labels are localized; keep them during a cross-target reference tour.
                if (this.vm.editingTarget && this.vm.editingTarget.id === this.originId) {
                    this.labelCache.set(item.id, item.label);
                } else if (this.labelCache.has(item.id)) item.label = this.labelCache.get(item.id);
            }
        }
        return filterResults(items, query);
    }
    keydown (event) {
        if (!this.state.open) return;
        // Preserve native typing and button behavior, but never deliver keys to the VM.
        const inside = this.panel && this.panel.contains(event.target);
        if (event.isComposing || event.keyCode === 229) {
            if (!inside) event.stopImmediatePropagation();
            return;
        }
        const binding = eventBinding(event, actions.mac);
        const opener = ['quick-open', 'command-palette', 'find-symbol'].find(id => binding &&
            actions.bindings(`builtin/${id}`).some(key =>
                resolveBinding(key, actions.mac) === resolveBinding(binding, actions.mac)));
        if (opener) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!event.repeat) actions.execute(`builtin/${opener}`);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (parseQuery(this.state.query).mode === 'symbols' && this.state.query.slice(1).length) {
                this.operation++;
                this.navigation.cancel();
                this.setState({query: '@', index: 0, symbol: null, reference: null, error: false},
                    () => this.selectFirst());
            } else this.close();
        } else if (event.target === this.input && this.state.symbol &&
            ['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.shiftKey && !event.metaKey &&
            !event.ctrlKey && !event.altKey && this.state.reference) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.cycle(event.key === 'ArrowLeft' ? -1 : 1);
        } else if (event.target === this.input && ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const items = this.results();
            if (!items.length || (event.repeat && event.key === 'Enter')) return;
            const index = Math.min(this.state.index, items.length - 1);
            const symbols = parseQuery(this.state.query).mode === 'symbols';
            if (event.key === 'Enter') this.choose(items[index], null, true);
            else if (symbols) {
                const next = this.state.symbol ?
                    Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))) : index;
                this.setState({index: next});
                if (!this.state.symbol || items[next].id !== this.state.symbol.id) this.choose(items[next]);
            } else this.setState({index: (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length});
        } else if (event.key === 'Tab') {
            event.preventDefault();
            event.stopImmediatePropagation();
            const elements = Array.from(this.panel.querySelectorAll('input, button:not(:disabled)'));
            const index = elements.indexOf(document.activeElement);
            elements[(index + (event.shiftKey ? elements.length - 1 : 1)) % elements.length].focus();
        } else if (!inside) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }
    activateCode () {
        this.props.dispatch(activateTab(0));
    }
    async navigate (symbol, index) {
        const references = referencesFor(this.vm, symbol);
        if (!references.length) {
            this.setState({symbol, reference: null, error: false});
            return;
        }
        index = (index + references.length) % references.length;
        const reference = references[index];
        this.setState({symbol, reference, error: false});
        const success = await this.navigation.locate(reference, {activate: () => this.activateCode(),
            getOcclusion: this.getOcclusion});
        if (this.detached || !this.state.open || this.state.reference !== reference) return;
        if (!success) this.setState({error: true});
        else if (this.input) this.input.focus();
    }
    cycle (delta) {
        const references = referencesFor(this.vm, this.state.symbol);
        const current = references.findIndex(ref => this.state.reference &&
            ref.targetId === this.state.reference.targetId && ref.blockId === this.state.reference.blockId);
        return this.navigate(this.state.symbol, current + delta);
    }
    async choose (item, blockId, closeAfter = false) {
        if (!item || item.available === false) return;
        if (parseQuery(this.state.query).mode === 'symbols') {
            const index = this.results().findIndex(result => result.id === item.id);
            if (index >= 0 && index !== this.state.index) this.setState({index});
        }
        if (!closeAfter && !blockId && this.state.symbol && this.state.symbol.id === item.id &&
            this.state.reference) return this.cycle(1);
        const operation = ++this.operation;
        if (item.kind === 'command') {
            this.close();
            actions.execute(item.id, this.originContext);
        } else if (['sprite', 'stage', 'component'].includes(item.kind)) {
            if (!this.vm.runtime.targets.some(target => target.id === item.targetId)) return this.refresh();
            this.close(false);
            this.vm.setEditingTarget(item.targetId);
            this.focusEditor();
        } else if (item.kind === 'costume' || item.kind === 'sound') {
            this.setState({symbol: item, reference: null, error: false});
            const success = await this.navigation.locate({...item, resourceKind: item.kind}, {record: false});
            if (this.detached || operation !== this.operation || !this.state.open) return;
            if (success && closeAfter) {
                this.close(false);
                this.focusEditor();
            } else if (!success) this.setState({error: true});
            else if (this.input) this.input.focus();
        } else {
            const references = referencesFor(this.vm, item);
            const requested = blockId || (this.state.symbol && this.state.symbol.id === item.id &&
                this.state.reference && this.state.reference.blockId);
            const index = Math.max(0, references.findIndex(ref => ref.blockId === requested));
            await this.navigate(item, index);
            if (closeAfter && !this.detached && operation === this.operation && this.state.open) {
                this.close(false);
                this.focusEditor();
            }
        }
    }
    focusEditor () {
        const workspace = this.workspace;
        const element = this.props.editorState.scratchGui.editorTab.activeTabIndex === 0 && workspace ?
            workspace.getParentSvg() : document.querySelector('[role="tabpanel"]:not([hidden])');
        if (element) {
            element.setAttribute('tabindex', '-1');
            element.focus();
        } else if (this.returnFocus && this.returnFocus.isConnected) this.returnFocus.focus();
    }
    render () {
        if (!this.state.open) return null;
        const items = this.results();
        const symbols = parseQuery(this.state.query).mode === 'symbols';
        const selected = Math.min(this.state.index, items.length - 1);
        const references = this.state.symbol ? referencesFor(this.vm, this.state.symbol) : [];
        const refIndex = references.findIndex(ref => this.state.reference &&
            ref.targetId === this.state.reference.targetId && ref.blockId === this.state.reference.blockId);
        const target = refIndex >= 0 && this.vm.runtime.targets.find(item => item.id === references[refIndex].targetId);
        return ReactDOM.createPortal(
            <div
                aria-label={this.t(parseQuery(this.state.query).mode)}
                className={styles.panel}
                data-command-palette
                ref={element => {
                    if (this.resizeObserver && this.panel !== element) {
                        this.resizeObserver.disconnect();
                        if (element) this.resizeObserver.observe(element);
                        if (element && this.workspace) this.resizeObserver.observe(this.workspace.getParentSvg());
                    }
                    this.panel = element;
                    if (element) {
                        element.onkeydown = event => event.stopPropagation();
                        element.onkeypress = event => event.stopPropagation();
                    }
                }}
                role="dialog"
                onKeyDown={event => event.stopPropagation()}
                onKeyPress={event => event.stopPropagation()}
            >
                <input
                    aria-activedescendant={selected >= 0 ? `palette-option-${selected}` : null}
                    aria-autocomplete="list"
                    aria-controls="palette-results"
                    aria-expanded
                    aria-label={this.t('placeholder')}
                    autoComplete="off"
                    placeholder={this.t('placeholder')}
                    ref={element => {
                        this.input = element;
                    }}
                    role="combobox"
                    value={this.state.query}
                    onCompositionStart={() => {
                        this.composing = true;
                    }}
                    onCompositionEnd={() => {
                        this.composing = false;
                        if (!this.state.symbol) this.selectFirst();
                    }}
                    onChange={event => {
                        this.operation++;
                        this.navigation.cancel();
                        this.setState({query: event.target.value,
                            index: 0,
                            symbol: null,
                            reference: null,
                            error: false}, () => this.selectFirst());
                    }}
                />
                <div
                    className={styles.results}
                    id="palette-results"
                    ref={element => {
                        this.list = element;
                    }}
                    role="listbox"
                >
                    {items.length ? items.map((item, index) => (
                        <div
                            aria-disabled={item.available === false}
                            aria-selected={index === selected}
                            className={`${styles.result} ${symbols ? styles.symbolResult : ''}`}
                            id={`palette-option-${index}`}
                            key={item.id}
                            role="option"
                            onClick={() => this.choose(item)}
                            onMouseDown={event => event.preventDefault()}
                            onMouseMove={() => {
                                if (!symbols && index !== this.state.index) this.setState({index});
                            }}
                        >
                            {symbols && <SymbolIcon
                                kind={item.kind}
                                title={item.detail}
                            />}
                            {item.image && <img
                                alt=""
                                src={item.image}
                            />}
                            <span
                                className={styles.text}
                                title={`${item.label} · ${item.detail}`}
                            >
                                <span>{item.label}</span>
                                <small>
                                    {item.detail}{item.available === false ? ` · ${this.t('unavailable')}` : ''}
                                </small>
                            </span>
                            {symbols && this.state.symbol && this.state.symbol.id === item.id &&
                                (references.length > 1 ||
                                    ['variable', 'list', 'procedure', 'broadcast'].includes(item.kind)) &&
                                    <span className={styles.references}>
                                        <button
                                            aria-label={this.t('previous')}
                                            disabled={!references.length}
                                            title={this.t('previous')}
                                            onClick={event => {
                                                event.stopPropagation(); this.cycle(-1);
                                            }}
                                        >{'◀'}</button>
                                        <span
                                            aria-live="polite"
                                            title={this.t('references', {index: refIndex + 1,
                                                count: references.length,
                                                target: target ? target.getName() : ''})}
                                        >{references.length ? `${refIndex + 1} / ${references.length}` : '0'}</span>
                                        <button
                                            aria-label={this.t('next')}
                                            disabled={!references.length}
                                            title={this.t('next')}
                                            onClick={event => {
                                                event.stopPropagation(); this.cycle(1);
                                            }}
                                        >{'▶'}</button>
                                    </span>}
                            {item.bindings && <kbd>
                                {item.bindings.map(key => displayBinding(key, actions.mac)).join(', ')}
                            </kbd>}
                        </div>
                    )) : <div className={styles.empty}>{this.t('empty')}</div>}
                </div>
                {this.state.error && <div role="alert">{this.t('failed')}</div>}
                <footer>{this.t(symbols ? 'symbolHint' : 'hint')}</footer>
            </div>, document.body);
    }
}
CommandPalette.propTypes = {
    editorState: PropTypes.object.isRequired,
    getContext: PropTypes.func.isRequired,
    dispatch: PropTypes.func.isRequired,
    intl: intlShape.isRequired
};
export default withAddonIntl(injectIntl(CommandPalette));
