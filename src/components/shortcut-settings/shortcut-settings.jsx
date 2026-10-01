/* eslint-disable react/jsx-no-bind */
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';
import withAddonIntl from '../../addons/intl-provider.jsx';
import addonManifests from '../../addons/generated/addon-manifests';
import {loadAddonSettingsMessages} from '../../addons/settings/addon-translations';
import Modal from '../modal/modal.jsx';
import actions from '../../lib/editor-actions';
import messages from '../../lib/editor-actions/messages';
import {accessibleBinding, displayBinding, eventBinding} from '../../lib/editor-actions/keys';
import styles from './shortcut-settings.css';

const ShortcutSettings = ({intl}) => {
    const [, refresh] = React.useState(0);
    const [query, setQuery] = React.useState('');
    const [bindingFilter, setBindingFilter] = React.useState('all');
    const [source, setSource] = React.useState('');
    const [draft, setDraft] = React.useState(null);
    const [recording, setRecording] = React.useState(false);
    const draftElement = React.useRef(null);
    const searchInput = React.useRef(null);
    const returnFocus = React.useRef(null);
    React.useEffect(() => {
        if (draft && draftElement.current) {
            draftElement.current.focus();
            draftElement.current.scrollIntoView({block: 'nearest'});
        } else if (!draft && returnFocus.current) {
            if (returnFocus.current.isConnected) returnFocus.current.focus();
            else if (searchInput.current) searchInput.current.focus();
            returnFocus.current = null;
        }
    }, [draft]);
    const t = name => intl.formatMessage(messages[name]);
    const addonNames = React.useMemo(() => loadAddonSettingsMessages(intl.locale), [intl.locale]);
    const sourceName = id => (id === 'builtin' ? t('builtin') :
        intl.formatMessage(messages.addonSource, {
            name: addonNames[`${id}/@name`] || (addonManifests[id] || {}).name || id
        }));
    const label = value => (typeof value === 'string' ? value : intl.formatMessage(value));
    const title = action => (action.titleValues ? intl.formatMessage(action.title,
        Object.keys(action.titleValues).reduce((values, key) => ({...values,
            [key]: label(action.titleValues[key])}), {})) : label(action.title));
    React.useEffect(() => actions.subscribe(() => refresh(value => value + 1)), []);
    React.useEffect(() => {
        if (!recording) return;
        const record = event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.key === 'Escape') {
                setRecording(false);
                actions.recording = false;
                setDraft(null);
                return;
            }
            if (event.repeat) return;
            const binding = eventBinding(event, actions.mac);
            if (!binding) return;
            setDraft(previous => ({...previous,
                changedBinding: binding,
                bindings: [...new Set(previous.replacing ?
                    previous.bindings.map(key => (key === previous.replacing ? binding : key)) :
                    [...previous.bindings, binding])]}));
            setRecording(false);
            actions.recording = false;
        };
        window.addEventListener('keydown', record, true);
        return () => {
            window.removeEventListener('keydown', record, true);
            actions.recording = false;
        };
    }, [recording]);
    const cancel = () => {
        setRecording(false);
        actions.recording = false;
        setDraft(null);
    };
    const close = () => {
        cancel();
        actions.settingsOpen = false;
        actions.emit();
    };
    const list = actions.listShortcuts();
    const sources = [...new Set(list.map(action => action.source || 'builtin'))].sort();
    const conflicts = draft ? actions.conflicts(draft.id, draft.bindings) : null;
    const save = replace => {
        if (!actions.setBindings(draft.id, draft.bindings, replace)) cancel();
    };
    const notice = actions.notice ? (<div
        role="alert"
        className={styles.notice}
    >
        <span>{t(actions.notice.type)}</span>
        {!actions.settingsOpen && <button onClick={() => actions.openSettings()}>{t('shortcuts')}</button>}
        <button
            aria-label={t('close')}
            onClick={() => {
                actions.notice = null; actions.emit();
            }}
        >{'×'}</button>
    </div>) : null;
    if (!actions.settingsOpen) return notice;
    const customized = action => Object.prototype.hasOwnProperty.call(actions.overrides, action.id);
    const filtered = list.filter(action => (!source || action.source === source) &&
        (bindingFilter === 'all' || (bindingFilter === 'custom' && customized(action)) ||
            (bindingFilter === 'assigned' && action.bindings.length > 0) ||
            (bindingFilter === 'unbound' && !action.bindings.length)) &&
        `${title(action)} ${action.id} ${sourceName(action.source)} ${action.bindings.join(' ')} ${
            action.bindings.map(binding => displayBinding(binding, actions.mac)).join(' ')
        }`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return (<Modal
        className={styles.modal}
        contentLabel={t('shortcuts')}
        onRequestClose={close}
    >
        <div className={styles.body}>
            {notice}
            <div className={styles.filters}>
                <input
                    autoFocus
                    ref={searchInput}
                    disabled={Boolean(draft)}
                    type="search"
                    value={query}
                    aria-label={t('search')}
                    placeholder={t('search')}
                    onChange={event => setQuery(event.target.value)}
                />
                <select
                    disabled={Boolean(draft)}
                    aria-label={t('allSources')}
                    value={source}
                    onChange={event => setSource(event.target.value)}
                >
                    <option value="">{t('allSources')}</option>
                    {sources.map(item => (<option
                        key={item}
                        value={item}
                    >{sourceName(item)}</option>))}
                </select>
                <button
                    disabled={Boolean(draft)}
                    onClick={() => {
                        // Native confirmation preserves the settings layout and keyboard focus.
                        if (window.confirm(t('confirmReset'))) actions.reset(); // eslint-disable-line no-alert
                    }}
                >{t('resetAll')}</button>
            </div>
            <div className={styles.filterBar}>
                <div
                    className={styles.filterTabs}
                    role="group"
                    aria-label={t('bindingState')}
                >
                    {['all', 'assigned', 'custom', 'unbound'].map(filter => (<button
                        key={filter}
                        aria-pressed={bindingFilter === filter}
                        disabled={Boolean(draft)}
                        onClick={() => setBindingFilter(filter)}
                    >{t(filter)}</button>))}
                </div>
                <span
                    className={styles.count}
                    aria-live="polite"
                >
                    {intl.formatMessage(messages.resultCount, {count: filtered.length})}
                </span>
            </div>
            <div className={styles.list}>
                <div
                    className={styles.tableHeader}
                    aria-hidden="true"
                >
                    <span>{t('command')}</span><span>{t('keybinding')}</span>
                    <span>{t('scope')}</span><span>{t('source')}</span><span />
                </div>
                {!filtered.length && <p className={styles.empty}>{t('empty')}</p>}
                {filtered.map(action => {
                    const conflict = actions.conflicts(action.id, action.bindings);
                    const warning = conflict.reserved.length ? t('reserved') :
                        (conflict.actions.length ? intl.formatMessage(messages.conflicts, {
                            names: conflict.actions.map(title).join(', ')
                        }) : '');
                    return (<div
                        key={action.id}
                        className={styles.entry}
                    >
                        <div className={styles.row}>
                            <div
                                className={styles.description}
                                title={`${title(action)} · ${action.id}`}
                            >
                                <span>{title(action)}</span>
                                {warning && <span
                                    className={styles.warning}
                                >
                                    <span
                                        className={styles.warningIcon}
                                        aria-hidden="true"
                                    />
                                    <span>{warning}</span>
                                </span>}
                            </div>
                            <div className={styles.bindings}>
                                {!action.bindings.length && <span className={styles.muted}>{t('unbound')}</span>}
                                {action.bindings.map(binding => (<span
                                    key={binding}
                                    className={styles.binding}
                                >
                                    <button
                                        className={styles.editBinding}
                                        disabled={Boolean(draft)}
                                        title={t('edit')}
                                        aria-label={`${t('edit')}: ${accessibleBinding(binding, actions.mac)}`}
                                        onClick={event => {
                                            returnFocus.current = event.currentTarget;
                                            setDraft({id: action.id,
                                                bindings: action.bindings.slice(),
                                                replacing: binding});
                                            actions.recording = true;
                                            setRecording(true);
                                        }}
                                    ><kbd>{displayBinding(binding, actions.mac)}</kbd></button>
                                    <button
                                        disabled={Boolean(draft)}
                                        title={`${t('remove')}: ${displayBinding(binding, actions.mac)}`}
                                        aria-label={`${t('remove')}: ${accessibleBinding(binding, actions.mac)}`}
                                        onClick={() => actions.setBindings(action.id,
                                            action.bindings.filter(key => key !== binding))}
                                    ><span aria-hidden="true">{'×'}</span></button>
                                </span>))}
                            </div>
                            <span
                                className={styles.scope}
                                title={(action.scopes || ['editor']).map(t).join(', ')}
                            >{(action.scopes || ['editor']).map(t).join(', ')}</span>
                            <span
                                className={styles.source}
                                title={sourceName(action.source)}
                            >
                                {sourceName(action.source)}
                            </span>
                            <div className={styles.rowTools}>
                                {customized(action) ? <button
                                    className={styles.iconButton}
                                    title={t('reset')}
                                    aria-label={`${t('reset')}: ${title(action)}`}
                                    disabled={Boolean(draft)}
                                    onClick={() => actions.reset(action.id)}
                                ><span className={styles.resetIcon} /></button> : <span className={styles.toolSpace} />}
                                <button
                                    className={styles.iconButton}
                                    title={t('add')}
                                    aria-label={`${t('add')}: ${title(action)}`}
                                    disabled={Boolean(draft)}
                                    onClick={event => {
                                        returnFocus.current = event.currentTarget;
                                        setDraft({id: action.id, bindings: action.bindings.slice()});
                                        actions.recording = true;
                                        setRecording(true);
                                    }}
                                ><span aria-hidden="true">{'+'}</span></button>
                            </div>
                        </div>
                        {draft && draft.id === action.id && <div
                            className={styles.draft}
                            ref={draftElement}
                            tabIndex={-1}
                            role="region"
                            aria-label={t(draft.replacing ? 'edit' : 'add')}
                        >
                            <p aria-live="polite">
                                {recording ? t('recording') :
                                    draft.bindings.map(binding => (<kbd
                                        key={binding}
                                        className={binding === draft.changedBinding ? styles.changedBinding : null}
                                        aria-label={accessibleBinding(binding, actions.mac)}
                                    >{displayBinding(binding, actions.mac)}</kbd>))}
                            </p>
                            {conflicts.reserved.length > 0 && <p
                                className={styles.warning}
                                role="alert"
                            >{t('reserved')}</p>}
                            {conflicts.actions.length > 0 && <p
                                className={styles.warning}
                                role="alert"
                            >
                                {intl.formatMessage(messages.conflicts, {
                                    names: conflicts.actions.map(title).join(', ')
                                })}
                            </p>}
                            <div className={styles.buttons}>
                                <button
                                    disabled={recording ||
                                        Boolean(conflicts.reserved.length || conflicts.actions.length)}
                                    onClick={() => save(false)}
                                >{t('apply')}</button>
                                {conflicts.actions.length > 0 && !conflicts.reserved.length && <button
                                    disabled={recording}
                                    onClick={() => save(true)}
                                >{t('replace')}</button>}
                                <button onClick={cancel}>{t('cancel')}</button>
                            </div>
                        </div>}
                    </div>);
                })}
            </div>
        </div>
    </Modal>);
};
ShortcutSettings.propTypes = {intl: intlShape.isRequired};
export default withAddonIntl(injectIntl(ShortcutSettings));
