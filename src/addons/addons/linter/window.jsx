/* eslint-disable react/no-multi-comp, react/jsx-no-bind */
import React from 'react';
import PropTypes from 'prop-types';
import {injectIntl} from 'react-intl';
import {RULE_DEFINITIONS, DEFAULT_RULES} from './rules';

const Icon = ({name}) => (<span
    className={`sa-linter-icon sa-linter-icon-${name}`}
    aria-hidden="true"
/>);
Icon.propTypes = {name: PropTypes.string.isRequired};

/**
 * Create a stable React view for this addon instance.
 * @returns {Function} Localized window component.
 */
export default function createWindow ({addon, model, navigator, getRules, setRule}) {
    const LinterWindow = ({visible, locale, direction, theme, intl}) => {
        const [snapshot, setSnapshot] = React.useState(model.snapshot);
        const [rules, updateRules] = React.useState(getRules);
        const [severity, setSeverity] = React.useState('all');
        const [targetId, setTarget] = React.useState('all');
        const [query, setQuery] = React.useState('');
        const [filtersOpen, setFiltersOpen] = React.useState(false);
        const [detailsOpen, setDetailsOpen] = React.useState(false);
        const [collapsed, setCollapsed] = React.useState(new Set());
        const [selectedId, setSelected] = React.useState(null);
        const [focusedKey, setFocused] = React.useState(null);
        const [notice, setNotice] = React.useState('');
        const navigationVersion = React.useRef(0);
        const elements = React.useRef(new Map());
        const filterButton = React.useRef(null);
        const message = (key, values) => intl.formatMessage({id: `addons.linter.${key}`}, values);
        const label = location => location.label || '';
        const targetName = row => (row.isStage ? message('stage') : row.targetName);
        React.useEffect(() => {
            const unsubscribe = model.subscribe(setSnapshot);
            const settingsChanged = () => {
                updateRules(getRules());
                model.invalidate();
            };
            addon.settings.addEventListener('change', settingsChanged);
            return () => {
                unsubscribe();
                addon.settings.removeEventListener('change', settingsChanged);
            };
        }, []);
        React.useEffect(() => {
            model.setVisible(Boolean(visible));
            return () => {
                navigationVersion.current++;
                navigator.cancel();
                model.setVisible(false);
            };
        }, [visible]);
        React.useEffect(() => {
            if (targetId !== 'all' && !snapshot.targets.some(target => target.id === targetId)) setTarget('all');
        }, [snapshot.targets, targetId]);
        const ready = snapshot.status === 'ready';
        const navigate = async location => {
            if (!ready) return;
            const version = ++navigationVersion.current;
            setNotice('');
            let found = false;
            try {
                found = await navigator.navigate(location);
            } catch (error) {
                // An extension/workspace may disappear while Blockly is loading.
            }
            if (version !== navigationVersion.current) return;
            if (!found) {
                setNotice('unavailable');
                model.refresh();
            }
        };
        const words = query.trim().toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
        const rows = snapshot.results.filter(row => {
            if ((severity !== 'all' && row.severity !== severity) ||
                (targetId !== 'all' && row.location.targetId !== targetId)) return false;
            const text = [targetName(row), message(row.message, row.values), message(`rule-${row.rule}`),
                label(row.location)].join(' ').toLowerCase();
            return words.every(word => text.includes(word));
        });
        const groups = [];
        const byTarget = new Map();
        rows.forEach(row => {
            const id = row.location.targetId;
            if (!byTarget.has(id)) {
                const group = {id, name: targetName(row), rows: []};
                byTarget.set(id, group);
                groups.push(group);
            }
            byTarget.get(id).rows.push(row);
        });
        const nodes = [];
        groups.forEach(group => {
            nodes.push({key: `target:${group.id}`, group});
            if (!collapsed.has(group.id)) group.rows.forEach(row => nodes.push({key: row.id, row, group}));
        });
        const activeKey = nodes.some(node => node.key === focusedKey) ? focusedKey : nodes[0] && nodes[0].key;
        const selected = rows.find(row => row.id === selectedId);
        const focus = key => {
            setFocused(key);
            const element = elements.current.get(key);
            if (element) {
                element.focus();
                element.scrollIntoView({block: 'nearest', inline: 'nearest'});
            }
        };
        const toggleGroup = id => setCollapsed(old => {
            const next = new Set(old);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        const activate = row => {
            if (!ready) return;
            setSelected(row.id);
            setFocused(row.id);
            navigate(row.location);
        };
        const keyDown = (event, node) => {
            // Child treeitem events also bubble through the owning target item.
            if (event.target !== event.currentTarget) return;
            const index = nodes.findIndex(item => item.key === node.key);
            const expandKey = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
            const collapseKey = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
            let next;
            if (event.key === 'ArrowDown') next = nodes[Math.min(index + 1, nodes.length - 1)];
            else if (event.key === 'ArrowUp') next = nodes[Math.max(0, index - 1)];
            else if (event.key === 'Home') next = nodes[0];
            else if (event.key === 'End') next = nodes[nodes.length - 1];
            else if (event.key === expandKey && !node.row) {
                if (collapsed.has(node.group.id)) toggleGroup(node.group.id);
                else next = nodes[index + 1];
            } else if (event.key === collapseKey) {
                if (node.row) next = nodes.find(item => item.key === `target:${node.group.id}`);
                else if (!collapsed.has(node.group.id)) toggleGroup(node.group.id);
            } else if (event.key === 'Enter' || event.key === ' ') {
                if (node.row) activate(node.row);
                else toggleGroup(node.group.id);
            } else return;
            event.preventDefault();
            event.stopPropagation();
            if (next) focus(next.key);
        };
        const treeProps = node => ({
            tabIndex: activeKey === node.key ? 0 : -1,
            ref: element => {
                if (element) elements.current.set(node.key, element);
                else elements.current.delete(node.key);
            },
            onFocus: event => {
                if (event.target === event.currentTarget) setFocused(node.key);
            },
            onKeyDown: event => keyDown(event, node)
        });
        const allCollapsed = groups.length > 0 && groups.every(group => collapsed.has(group.id));
        const filtered = Boolean(query.trim()) || severity !== 'all' || targetId !== 'all';
        const issueText = row => `${message(row.severity)}: ${message(row.message, row.values)}`;
        return (<div
            className="sa-linter"
            lang={locale}
            dir={direction}
            data-theme={theme}
        >
            <div className="sa-linter-toolbar">
                <span className="sa-linter-heading">{message('problems')}
                    <span
                        className="sa-linter-count"
                        title={message('result-count', {
                            count: rows.length, total: snapshot.results.length
                        })}
                    >{rows.length}</span>
                </span>
                <div className="sa-linter-search">
                    <Icon name="search" />
                    <input
                        type="search"
                        aria-label={message('search')}
                        placeholder={message('search')}
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Escape' && query) {
                                event.preventDefault(); event.stopPropagation(); setQuery('');
                            }
                            if (event.key === 'ArrowDown' && nodes.length) {
                                event.preventDefault(); focus(activeKey);
                            }
                        }}
                    />
                </div>
                <button
                    type="button"
                    className="sa-linter-tool"
                    ref={filterButton}
                    aria-label={message('filters')}
                    title={message('filters')}
                    aria-expanded={filtersOpen}
                    aria-pressed={filtered || rules.length !== DEFAULT_RULES.length ||
                        DEFAULT_RULES.some(rule => !rules.includes(rule))}
                    onClick={() => setFiltersOpen(value => !value)}
                ><Icon name="filter" /></button>
                <button
                    type="button"
                    className="sa-linter-tool"
                    aria-label={message('refresh')}
                    title={message('refresh')}
                    onClick={() => {
                        setNotice(''); model.refresh();
                    }}
                >
                    <Icon name="refresh" />
                </button>
                <button
                    type="button"
                    className="sa-linter-tool"
                    disabled={!groups.length}
                    aria-label={message(allCollapsed ? 'expand-all' : 'collapse-all')}
                    title={message(allCollapsed ? 'expand-all' : 'collapse-all')}
                    onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map(group => group.id)))}
                >
                    <Icon name={allCollapsed ? 'expand-all' : 'collapse-all'} />
                </button>
            </div>
            {filtersOpen ? <div
                className="sa-linter-options"
                onKeyDown={event => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault(); event.stopPropagation(); setFiltersOpen(false);
                    filterButton.current.focus();
                }}
            >
                <div className="sa-linter-filter-selects">
                    <label>{message('level')}<select
                        value={severity}
                        onChange={event => setSeverity(event.target.value)}
                    >
                        {['all', 'warning', 'info'].map(value => (<option
                            key={value}
                            value={value}
                        >
                            {message(value)}</option>))}
                    </select></label>
                    <label>{message('target')}<select
                        value={targetId}
                        onChange={event => setTarget(event.target.value)}
                    >
                        <option value="all">{message('all-targets')}</option>
                        {snapshot.targets.map(target => (<option
                            key={target.id}
                            value={target.id}
                        >
                            {target.isStage ? message('stage') : target.name}</option>))}
                    </select></label>
                </div>
                {['reference', 'execution', 'cleanup'].map(category => (<fieldset key={category}>
                    <legend>{message(category)}</legend>
                    {RULE_DEFINITIONS.filter(rule => rule.type === category).map(({id: rule}) => (
                        <label key={rule}><input
                            type="checkbox"
                            name={rule}
                            checked={rules.includes(rule)}
                            onChange={event => {
                                setRule(rule, event.target.checked); updateRules(getRules()); model.invalidate();
                            }}
                        />{message(`rule-${rule}`)}</label>
                    ))}
                </fieldset>))}
                <p className="sa-linter-scope">{message('coverage')}</p>
            </div> : null}
            {ready && snapshot.coverage && snapshot.coverage.limitations.length ?
                <p
                    className="sa-linter-scope"
                    role="status"
                >
                    {snapshot.coverage.limitations.map(item => (<span key={item}>
                        {' '}{message(`limit-${item}`)}
                    </span>))}
                </p> : null}
            <div
                className="sa-linter-results"
                aria-busy={snapshot.status === 'scanning'}
            >
                {ready && !rows.length ? <p className="sa-linter-empty">
                    {message(rules.length === 0 ? 'no-rules' : snapshot.results.length ? 'filtered-empty' : 'empty')}
                </p> : null}
                <ul
                    role="tree"
                    aria-label={message('problems')}
                >
                    {groups.map(group => {
                        const node = {key: `target:${group.id}`, group};
                        const expanded = !collapsed.has(group.id);
                        return (<li
                            key={group.id}
                            role="treeitem"
                            aria-label={message('target-count', {
                                name: group.name, count: group.rows.length
                            })}
                            aria-expanded={expanded}
                            {...treeProps(node)}
                            className="sa-linter-group"
                        >
                            <div
                                className="sa-linter-group-row"
                                onClick={() => {
                                    focus(node.key); toggleGroup(group.id);
                                }}
                            >
                                <span className={expanded ? 'sa-linter-chevron is-open' : 'sa-linter-chevron'}>
                                    <Icon name="chevron-right" />
                                </span>
                                <span className="sa-linter-group-name">{group.name}</span>
                                <span className="sa-linter-count">{group.rows.length}</span>
                            </div>
                            {expanded ? <ul role="group">
                                {group.rows.map(row => (<li
                                    key={row.id}
                                    role="treeitem"
                                    aria-selected={selectedId === row.id}
                                    aria-disabled={!ready}
                                    aria-label={[issueText(row), label(row.location), message(row.type)]
                                        .filter(Boolean).join(' · ')}
                                    className={`sa-linter-row${selectedId === row.id ? ' is-selected' : ''}`}
                                    title={[issueText(row), label(row.location),
                                        message(row.reason || `reason-${row.rule}`, row.values)].join('\n')}
                                    {...treeProps({key: row.id, row, group})}
                                    onClick={() => activate(row)}
                                >
                                    <span className={`sa-linter-severity sa-linter-${row.severity}`}>
                                        <Icon name={row.severity} />
                                    </span>
                                    <span className="sa-linter-row-message">{message(row.message, row.values)}</span>
                                    {label(row.location) ? <span className="sa-linter-row-location">
                                        {label(row.location)}
                                    </span> : null}
                                </li>))}
                            </ul> : null}
                        </li>);
                    })}
                </ul>
            </div>
            {selected && detailsOpen ? <div className="sa-linter-detail">
                <div className="sa-linter-detail-meta">
                    {message(selected.severity)}{' · '}{message(selected.type)}
                </div>
                <strong>{message(selected.message, selected.values)}</strong>
                <p>{message(selected.reason || `reason-${selected.rule}`, selected.values)}</p>
                {selected.related.length ? <div className="sa-linter-related">
                    <span>{message('related', {count: selected.related.length})}</span>
                    {selected.related.map((location, index) => (<button
                        key={location.blockId}
                        type="button"
                        disabled={!ready}
                        onClick={() => navigate(location)}
                    >{message('related-location', {index: index + 1})}</button>))}
                </div> : null}
            </div> : null}
            <div className="sa-linter-footer">
                <span
                    className="sa-linter-status"
                    role="status"
                    aria-live="polite"
                >
                    {notice ? message(notice) : snapshot.status === 'ready' ?
                        message('result-count', {count: rows.length, total: snapshot.results.length}) :
                        message(snapshot.status)}
                </span>
                <button
                    type="button"
                    className="sa-linter-details-toggle"
                    disabled={!selected}
                    aria-expanded={Boolean(selected && detailsOpen)}
                    onClick={() => setDetailsOpen(value => !value)}
                >
                    <Icon name="info" />{message('details')}
                </button>
            </div>
        </div>);
    };
    LinterWindow.propTypes = {visible: PropTypes.bool,
        locale: PropTypes.string,
        direction: PropTypes.string,
        theme: PropTypes.string,
        intl: PropTypes.object.isRequired};
    return injectIntl(LinterWindow);
}
