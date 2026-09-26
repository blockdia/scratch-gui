/* eslint-disable react/no-multi-comp, react/jsx-no-bind, no-negated-condition */
import React from 'react';
import PropTypes from 'prop-types';
import {injectIntl} from 'react-intl';
import {moveLayer} from './model';

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
        const list = React.useRef(null);
        const drag = React.useRef(null);
        const latest = React.useRef(snapshot);
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
                setSelected(null);
                refresh();
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
                let afterId = null;
                for (const element of list.current.querySelectorAll('[data-layer-id]')) {
                    if (element.dataset.layerId === active.id) continue;
                    const rect = element.getBoundingClientRect();
                    if (active.y < rect.top + (rect.height / 2)) break;
                    afterId = element.dataset.layerId;
                }
                active.afterId = afterId;
                setPreview(old => (old && old.id === active.id && old.afterId === afterId &&
                    old.inside === active.inside ? old : {id: active.id, afterId, inside: active.inside}));
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
                    const exists = id => current.rows.some(row => row.id === id && !row.stage);
                    if (current.generation === active.generation && exists(active.id) &&
                        (active.afterId === null || exists(active.afterId))) {
                        moveLayer(vm, active.id, active.afterId);
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
            if (!row.clone) vm.setEditingTarget(row.id);
        };
        const sprites = snapshot.rows.filter(row => !row.stage);
        const index = sprites.findIndex(row => row.id === selected);
        const step = delta => {
            const current = refresh();
            const rows = current.rows.filter(row => !row.stage);
            const from = rows.findIndex(row => row.id === selected);
            const to = from + delta;
            if (from < 0 || to < 0 || to >= rows.length) return;
            const remaining = rows.filter(row => row.id !== selected);
            moveLayer(vm, selected, to === 0 ? null : remaining[to - 1].id);
            refresh();
        };
        const rest = sprites.filter(item => !preview || item.id !== preview.id);
        const slot = preview && preview.inside ?
            (preview.afterId === null ? 0 : rest.findIndex(item => item.id === preview.afterId) + 1) : -1;
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
                    disabled={index < 0 || index >= sprites.length - 1 || Boolean(preview)}
                    onClick={() => step(1)}
                >
                    {'↓ '}{message('backward')}
                </button>
            </div>
            <div className="sa-layer-boundary">{message('front')}</div>
            <div
                className="sa-layer-list"
                ref={list}
            >
                {snapshot.rows.map(row => {
                    const before = preview && row.id !== preview.id &&
                        (row.stage ? slot === rest.length : rest.findIndex(item => item.id === row.id) === slot);
                    return (<div
                        key={row.id}
                        className={`sa-layer-row${selected === row.id ? ' is-selected' : ''}${
                            preview && preview.id === row.id ? ' is-dragging' : ''}${before ? ' insert-before' : ''}`}
                        data-layer-id={row.stage ? null : row.id}
                    >
                        {!row.stage ? <button
                            type="button"
                            className="sa-layer-handle"
                            aria-label={message('drag', {name: row.name})}
                            onPointerDown={event => {
                                if (event.button !== 0 || drag.current) return;
                                event.currentTarget.setPointerCapture(event.pointerId);
                                setSelected(row.id);
                                setNotice('');
                                drag.current = {id: row.id,
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
                        <button
                            type="button"
                            className="sa-layer-select"
                            aria-pressed={selected === row.id}
                            onClick={() => select(row)}
                        >
                            {row.thumbnail ? <img
                                src={row.thumbnail}
                                alt=""
                                draggable={false}
                            /> : (<span className="sa-layer-thumbnail" />)}
                            <span className="sa-layer-label">
                                <span
                                    className="sa-layer-name"
                                    title={row.name}
                                >{row.stage ? message('stage') : row.name}</span>
                                {row.clone ? <small>{message('clone', {number: row.clone})}</small> : null}
                            </span>
                            {!row.stage && !row.visible ? <small>{message('hidden')}</small> : null}
                        </button>
                    </div>);
                })}
            </div>
            <div className="sa-layer-boundary">{message('back')}</div>
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
