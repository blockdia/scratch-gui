/* eslint-disable react/no-multi-comp, react/jsx-no-bind, no-negated-condition */
import React from 'react';
import PropTypes from 'prop-types';
import {injectIntl} from 'react-intl';
import {moveLayer, visibleLayerRows} from './model';
import {locateLayerDrop} from './drag';

const releaseDrag = ref => {
    const active = ref.current;
    ref.current = null;
    if (active && active.element.hasPointerCapture(active.pointerId)) {
        active.element.releasePointerCapture(active.pointerId);
    }
};

/**
 * Create one stable component identity for the lifetime of the addon.
 * @param {object} vm Scratch VM.
 * @param {object} model Snapshot reader shared across window mounts.
 * @returns {Function} React window component.
 */
export default function createLayerWindow (vm, model) {
    const LayerWindow = ({visible, locale, direction, intl}) => {
        const [snapshot, setSnapshot] = React.useState(() => model.snapshot());
        const [selected, setSelected] = React.useState(snapshot.editing);
        const [preview, setPreview] = React.useState(null);
        const [notice, setNotice] = React.useState('');
        const [collapsed, setCollapsed] = React.useState(new Set());
        const list = React.useRef(null);
        const drag = React.useRef(null);
        const latest = React.useRef(snapshot);
        const visibleRows = visibleLayerRows(snapshot.rows, collapsed);
        const displayed = React.useRef(visibleRows);
        displayed.current = visibleRows;
        const message = (key, values) => intl.formatMessage({id: `addons.layer-manager.${key}`}, values);
        const refresh = React.useCallback(() => {
            const next = model.snapshot();
            const previous = latest.current;
            if (drag.current && next.generation !== drag.current.generation) {
                releaseDrag(drag);
                setPreview(null);
                setNotice('cancelled');
            }
            if (drag.current) return next;
            if (previous.editing !== next.editing || previous.generation !== next.generation) {
                setSelected(next.editing);
                setCollapsed(old => {
                    const nextCollapsed = previous.generation !== next.generation ? new Set() : new Set(old);
                    let row = next.rows.find(item => item.id === next.editing);
                    while (row && row.parent) {
                        const parent = row.parent;
                        nextCollapsed.delete(parent);
                        row = next.rows.find(item => item.id === parent);
                    }
                    return nextCollapsed;
                });
            } else {
                setSelected(id => (next.rows.some(row => row.id === id) ? id : null));
            }
            if (next !== previous) {
                latest.current = next;
                setSnapshot(next);
            }
            return next;
        }, []);
        React.useEffect(() => {
            if (!visible) return;
            refresh();
            const timer = setInterval(refresh, 100);
            const reset = () => {
                releaseDrag(drag);
                setPreview(null);
                setCollapsed(new Set());
                setSelected(refresh().editing);
                setNotice('');
            };
            vm.runtime.on('PROJECT_LOADED', reset);
            return () => {
                clearInterval(timer);
                vm.runtime.removeListener('PROJECT_LOADED', reset);
                releaseDrag(drag);
                setPreview(null);
            };
        }, [visible, refresh]);

        React.useEffect(() => {
            if (!visible) return;
            let frame;
            const locate = () => {
                const active = drag.current;
                if (!active || !active.started || !list.current) return;
                const bounds = list.current.getBoundingClientRect();
                active.inside = active.x >= bounds.left && active.x <= bounds.right &&
                    active.y >= bounds.top && active.y <= bounds.bottom;
                const rectangles = Array.from(list.current.querySelectorAll('[data-layer-id]')).map(element => {
                    const rect = element.getBoundingClientRect();
                    return {id: element.dataset.layerId, top: rect.top, bottom: rect.bottom};
                });
                const slot = locateLayerDrop(displayed.current, active.id, rectangles, active.y);
                active.inside = active.inside && Boolean(slot);
                active.afterId = slot ? slot.afterId : null;
                const beforeId = slot && slot.beforeId;
                setPreview(old => (old && old.id === active.id && old.afterId === active.afterId &&
                    old.beforeId === beforeId && old.inside === active.inside ? old :
                    {id: active.id, afterId: active.afterId, beforeId, depth: active.depth, inside: active.inside}));
            };
            const scroll = () => {
                const active = drag.current;
                if (!active) return;
                if (active.started && list.current) {
                    const rect = list.current.getBoundingClientRect();
                    if (active.x >= rect.left && active.x <= rect.right &&
                        active.y >= rect.top && active.y <= rect.bottom) {
                        const speed = active.y < rect.top + 32 ? -8 : active.y > rect.bottom - 32 ? 8 : 0;
                        if (speed) {
                            list.current.scrollTop += speed;
                            locate();
                        }
                    }
                }
                frame = requestAnimationFrame(scroll);
            };
            const move = event => {
                const active = drag.current;
                if (!active || event.pointerId !== active.pointerId) return;
                active.x = event.clientX;
                active.y = event.clientY;
                if (!active.started && Math.hypot(active.x - active.startX, active.y - active.startY) >= 4) {
                    active.started = true;
                    frame = requestAnimationFrame(scroll);
                }
                if (active.started) {
                    event.preventDefault();
                    locate();
                }
            };
            const finish = event => {
                const active = drag.current;
                if (!active || (typeof event.pointerId !== 'undefined' && event.pointerId !== active.pointerId)) return;
                cancelAnimationFrame(frame);
                if (event.type === 'pointerup' && active.started) {
                    active.x = event.clientX;
                    active.y = event.clientY;
                    locate();
                }
                releaseDrag(drag);
                setPreview(null);
                if (event.type === 'pointerup' && active.started && active.inside) {
                    const current = model.snapshot();
                    const exists = id => current.rows.some(row => row.id === id && !row.stage &&
                        row.parent === active.parent);
                    if (current.generation === active.generation && exists(active.id) &&
                        (active.afterId === null || exists(active.afterId))) {
                        moveLayer(vm, active.id, active.afterId, active.parent);
                    } else setNotice('cancelled');
                }
                refresh();
            };
            const key = event => {
                if (event.key === 'Escape' && drag.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(event);
                }
            };
            document.addEventListener('pointermove', move, {passive: false});
            document.addEventListener('pointerup', finish);
            document.addEventListener('pointercancel', finish);
            document.addEventListener('keydown', key, true);
            window.addEventListener('blur', finish);
            return () => {
                cancelAnimationFrame(frame);
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', finish);
                document.removeEventListener('pointercancel', finish);
                document.removeEventListener('keydown', key, true);
                window.removeEventListener('blur', finish);
            };
        }, [visible, refresh]);

        const select = row => {
            setSelected(row.id);
            if (!row.clone && !row.container) vm.setEditingTarget(row.id);
        };
        const toggle = row => {
            const next = new Set(collapsed);
            if (next.has(row.id)) next.delete(row.id);
            else {
                next.add(row.id);
                if (!visibleLayerRows(snapshot.rows, next).some(item => item.id === selected)) setSelected(row.id);
            }
            setCollapsed(next);
        };
        const selectedRow = snapshot.rows.find(row => row.id === selected);
        const copyId = async () => {
            try {
                await navigator.clipboard.writeText(selectedRow.publicId);
                setNotice('idCopied');
            } catch (error) {
                setNotice('copyFailed');
            }
        };
        const siblings = snapshot.rows.filter(row => !row.stage && selectedRow && row.parent === selectedRow.parent);
        const index = siblings.findIndex(row => row.id === selected);
        const step = delta => {
            const current = refresh();
            const source = current.rows.find(row => row.id === selected && !row.stage);
            if (!source) return;
            const rows = current.rows.filter(row => !row.stage && row.parent === source.parent);
            const from = rows.findIndex(row => row.id === selected);
            const to = from + delta;
            if (from < 0 || to < 0 || to >= rows.length) return;
            const remaining = rows.filter(row => row.id !== selected);
            moveLayer(vm, selected, to === 0 ? null : remaining[to - 1].id);
            refresh();
        };
        const draggingIds = new Set();
        if (preview) {
            snapshot.rows.forEach(row => {
                if (row.id === preview.id || draggingIds.has(row.parent)) draggingIds.add(row.id);
            });
        }
        const focusRow = row => {
            if (!row) return;
            setSelected(row.id);
            const elements = list.current.querySelectorAll('[data-layer-id]');
            const element = Array.from(elements).find(item => item.dataset.layerId === row.id);
            if (element) element.focus();
        };
        const navigate = (event, row) => {
            if (event.target !== event.currentTarget || drag.current) return;
            const position = visibleRows.indexOf(row);
            switch (event.key) {
            case 'ArrowDown': focusRow(visibleRows[position + 1]); break;
            case 'ArrowUp': focusRow(visibleRows[position - 1]); break;
            case 'Home': focusRow(visibleRows[0]); break;
            case 'End': focusRow(visibleRows[visibleRows.length - 1]); break;
            case 'ArrowRight':
                if (row.container) {
                    if (collapsed.has(row.id)) toggle(row);
                    else focusRow(visibleRows[position + 1]);
                }
                break;
            case 'ArrowLeft':
                if (row.container && !collapsed.has(row.id)) toggle(row);
                else focusRow(visibleRows.find(item => item.id === row.parent));
                break;
            case 'Enter':
            case ' ': select(row); break;
            default: return;
            }
            event.preventDefault();
            event.stopPropagation();
        };
        return (<div
            className="sa-layer-manager"
            lang={locale}
            dir={direction}
        >
            <div className="sa-layer-actions">
                <button
                    type="button"
                    disabled={index <= 0 || Boolean(preview)}
                    onClick={() => step(-1)}
                >
                    {'↑ '}{message('forward')}
                </button>
                <button
                    type="button"
                    disabled={index < 0 || index >= siblings.length - 1 || Boolean(preview)}
                    onClick={() => step(1)}
                >
                    {'↓ '}{message('backward')}
                </button>
                {selectedRow && selectedRow.publicId ? <button
                    type="button"
                    onClick={copyId}
                >{message('copyId')}</button> : null}
            </div>
            <div className="sa-layer-boundary"><span>{message('front')}</span></div>
            <div
                className="sa-layer-list"
                ref={list}
                role="tree"
            >
                {snapshot.rows.every(row => row.stage) ?
                    <div className="sa-layer-empty">{message('empty')}</div> : null}
                {visibleRows.map(row => {
                    const before = preview && preview.inside && preview.beforeId === row.id;
                    return (<div
                        key={row.id}
                        className={`sa-layer-row${row.stage ? ' is-stage' : ''}${row.container ? ' is-container' : ''}${
                            !row.stage && !row.visible ? ' is-hidden' : ''}${
                            selected === row.id ? ' is-selected' : ''}${
                            draggingIds.has(row.id) ? ' is-dragging' : ''}${before ? ' insert-before' : ''}`}
                        data-layer-id={row.id}
                        data-container-path={row.container}
                        style={{'marginInlineStart': row.depth * 18,
                            '--layer-drop-offset': before ? `${(preview.depth - row.depth) * 18}px` : '0px'}}
                        role="treeitem"
                        aria-level={row.depth + 1}
                        aria-posinset={row.position}
                        aria-setsize={row.siblings}
                        aria-selected={selected === row.id}
                        aria-expanded={row.container ? !collapsed.has(row.id) : null}
                        tabIndex={selected === row.id || (!selected && row === visibleRows[0]) ? 0 : -1}
                        onKeyDown={event => navigate(event, row)}
                    >
                        {!row.stage ? <button
                            type="button"
                            className="sa-layer-handle"
                            title={message('drag', {name: row.name})}
                            onPointerDown={event => {
                                if (event.button !== 0 || drag.current) return;
                                event.currentTarget.setPointerCapture(event.pointerId);
                                setSelected(row.id);
                                setNotice('');
                                drag.current = {id: row.id,
                                    parent: row.parent,
                                    depth: row.depth,
                                    generation: snapshot.generation,
                                    element: event.currentTarget,
                                    pointerId: event.pointerId,
                                    x: event.clientX,
                                    y: event.clientY,
                                    startX: event.clientX,
                                    startY: event.clientY,
                                    started: false};
                            }}
                        >{'⠿'}</button> : <span
                            className="sa-layer-stage-mark"
                            aria-hidden="true"
                        >{'▧'}</span>}
                        {row.container ? <button
                            type="button"
                            className="sa-layer-toggle"
                            title={message(collapsed.has(row.id) ? 'expand' : 'collapse', {name: row.name})}
                            aria-expanded={!collapsed.has(row.id)}
                            disabled={Boolean(preview)}
                            onClick={() => toggle(row)}
                        >
                            <span aria-hidden="true">{
                                collapsed.has(row.id) ? (direction === 'rtl' ? '◂' : '▸') : '▾'
                            }</span>
                        </button> : null}
                        <button
                            type="button"
                            className="sa-layer-select"
                            aria-pressed={selected === row.id}
                            onClick={() => select(row)}
                        >
                            {row.container ? <svg
                                className="sa-layer-container-icon"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path d="M12 4L21 8 12 12 3 8z" />
                                <path
                                    d="M3 10l8 3.5V21l-8-4z"
                                    opacity="0.55"
                                />
                                <path d="M13 13.5l8-3.5V17l-8 4z" />
                            </svg> : row.thumbnail ? <img
                                src={row.thumbnail}
                                alt=""
                                draggable={false}
                            /> : (<span className="sa-layer-thumbnail" />)}
                            <span className="sa-layer-label">
                                <span
                                    className="sa-layer-name"
                                    title={row.fullName}
                                >{row.stage ? message('stage') : row.name}</span>
                                {row.clone ? <small title={row.publicId}>
                                    {message('clone', {number: row.clone})}
                                </small> : row.publicId ? <small title={row.publicId}>{row.publicId}</small> : null}
                                {row.container ? <small>{message('container', {count: row.count})}</small> : null}
                            </span>
                            {!row.stage && !row.visible ?
                                <small className="sa-layer-badge">{
                                    message(row.hiddenByContainer ? 'hiddenByContainer' : 'hidden')
                                }</small> : null}
                        </button>
                    </div>);
                })}
                {preview && preview.inside && !preview.beforeId ? <div
                    className="sa-layer-end-marker"
                    style={{marginInlineStart: preview.depth * 18}}
                /> : null}
            </div>
            <div className="sa-layer-boundary"><span>{message('back')}</span></div>
            <div
                className="sa-layer-notice"
                role="status"
            >{notice ? message(notice) : ''}</div>
        </div>);
    };
    LayerWindow.propTypes = {visible: PropTypes.bool,
        locale: PropTypes.string,
        direction: PropTypes.string,
        intl: PropTypes.object.isRequired};
    return injectIntl(LayerWindow);
}
