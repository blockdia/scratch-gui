/* eslint-disable react/jsx-no-bind, react/no-multi-comp */
import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape, defineMessages} from 'react-intl';
import manager from '../../lib/editor-windows/manager';
import styles from './editor-windows.css';

const messages = defineMessages({
    pin: {id: 'gui.windows.pin', defaultMessage: 'Pin window'},
    unpin: {id: 'gui.windows.unpin', defaultMessage: 'Unpin window'},
    hide: {id: 'gui.windows.hide', defaultMessage: 'Hide'},
    close: {id: 'gui.windows.close', defaultMessage: 'Close'},
    more: {id: 'gui.windows.more', defaultMessage: 'More tools'},
    tools: {id: 'gui.windows.tools', defaultMessage: 'Editor tools'}
});
const paths = {
    pin: 'M8 3h8l-1 6 3 3v2h-5v7l-1-2-1 2v-7H6v-2l3-3z',
    hide: 'M5 12h14',
    close: 'm6 6 12 12M18 6 6 18',
    more: 'M5 11v2m7-2v2m7-2v2'
};
const Icon = ({name}) => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path
            d={paths[name]}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
        />
    </svg>
);
Icon.propTypes = {name: PropTypes.string.isRequired};

export class WindowFrame extends React.Component {
    constructor (props) {
        super(props);
        this.element = null;
        this.shown = false;
        this.gesture = null;
        this.setElement = el => {
            this.element = el; props.entry.element = el;
        };
        this.setContent = el => {
            if (el && props.entry.content && props.entry.content.nodeType) el.appendChild(props.entry.content);
        };
    }
    componentDidMount () {
        this.syncVisibility();
    }
    componentDidUpdate () {
        this.syncVisibility();
    }
    componentWillUnmount () {
        if (this.shown && this.props.entry.onHide) this.props.entry.onHide();
        this.finish();
        this.props.entry.element = null;
    }
    syncVisibility () {
        const visible = this.props.window.status === 'visible' && !this.props.suspended;
        if (visible !== this.shown) {
            this.shown = visible;
            const callback = visible ? this.props.entry.onShow : this.props.entry.onHide;
            if (callback) callback();
            if (visible && this.props.active) this.element.focus();
        }
        if (!visible && this.gesture) this.finish();
    }
    start (event, edge) {
        if (event.button !== 0 || (event.target.closest('button') && !edge)) return;
        event.preventDefault();
        manager.focus(this.props.entry.id);
        this.gesture = {x: event.clientX,
            y: event.clientY,
            rect: this.props.window.rect,
            edge,
            target: event.currentTarget,
            pointer: event.pointerId};
        manager.gesturing = true;
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    move (event) {
        if (!this.gesture) return;
        const g = this.gesture;
        const dx = event.clientX - g.x;
        const dy = event.clientY - g.y;
        if (!g.moved && Math.hypot(dx, dy) < 4) return;
        g.moved = true;
        manager.setPinned(this.props.entry.id, true);
        const rect = {...g.rect};
        if (g.edge) {
            const min = this.props.entry.minimum;
            if (g.edge.includes('e')) rect.width += dx;
            if (g.edge.includes('s')) rect.height += dy;
            if (g.edge.includes('w')) {
                rect.width = Math.max(min.width, g.rect.width - dx);
                rect.x = g.rect.x + g.rect.width - rect.width;
            }
            if (g.edge.includes('n')) {
                rect.height = Math.max(min.height, g.rect.height - dy);
                rect.y = g.rect.y + g.rect.height - rect.height;
            }
        } else {
            rect.x += dx; rect.y += dy;
        }
        manager.setRect(this.props.entry.id, rect);
    }
    finish () {
        if (!this.gesture) return;
        const {target, pointer} = this.gesture;
        this.gesture = null;
        manager.gesturing = false;
        if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
    }
    render () {
        const {entry, window: state, active, suspended, index, intl} = this.props;
        const rect = state.rect || {x: 0, y: 0, ...entry.size};
        const title = `editor-window-${entry.id}`;
        const label = typeof entry.title === 'string' ? entry.title : intl.formatMessage(entry.title);
        return (
            <section
                ref={this.setElement}
                role="dialog"
                aria-modal="false"
                aria-labelledby={title}
                tabIndex={-1}
                data-editor-window={entry.id}
                data-active={active}
                data-pinned={state.pinned}
                className={styles.window}
                style={{display: state.status === 'visible' && !suspended ? 'flex' : 'none',
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                    zIndex: index + 1}}
                onKeyDown={event => {
                    if (event.key === 'Escape' && !event.defaultPrevented) {
                        event.stopPropagation();
                        manager.hide(entry.id);
                    }
                }}
            >
                <header
                    className={styles.header}
                    onPointerDown={event => this.start(event, '')}
                    onPointerMove={event => this.move(event)}
                    onPointerUp={() => this.finish()}
                    onPointerCancel={() => this.finish()}
                    onLostPointerCapture={() => this.finish()}
                >
                    <span
                        id={title}
                        className={styles.title}
                    >{label}</span>
                    {['pin', 'hide', 'close'].map(action => (
                        <button
                            key={action}
                            type="button"
                            title={intl.formatMessage(messages[action === 'pin' && state.pinned ? 'unpin' : action])}
                            aria-label={intl.formatMessage(
                                messages[action === 'pin' && state.pinned ? 'unpin' : action]
                            )}
                            aria-pressed={action === 'pin' ? state.pinned : null}
                            onClick={() => {
                                if (action === 'pin') manager.setPinned(entry.id, !state.pinned);
                                else manager[action](entry.id);
                            }}
                        ><Icon name={action} /></button>
                    ))}
                </header>
                <div
                    ref={this.setContent}
                    className={styles.content}
                >
                    {entry.render ? entry.render() : null}
                </div>
                {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(edge => (
                    <div
                        key={edge}
                        aria-hidden="true"
                        className={`${styles.resize} ${styles[edge]}`}
                        onPointerDown={event => this.start(event, edge)}
                        onPointerMove={event => this.move(event)}
                        onPointerUp={() => this.finish()}
                        onPointerCancel={() => this.finish()}
                        onLostPointerCapture={() => this.finish()}
                    />
                ))}
            </section>
        );
    }
}
WindowFrame.propTypes = {
    entry: PropTypes.object.isRequired,
    window: PropTypes.object.isRequired,
    active: PropTypes.bool,
    suspended: PropTypes.bool,
    index: PropTypes.number,
    intl: intlShape
};

class Host extends React.Component {
    componentDidMount () {
        this.unbind = manager.bind(this.context.store);
        this.unsubscribe = manager.subscribe(() => this.forceUpdate());
        this.pointer = event => manager.outside(event.target);
        this.focus = event => manager.outside(event.target);
        this.reset = () => manager.reset();
        this.measure = () => {
            const body = document.querySelector('[data-editor-window-bounds]');
            if (!body) return;
            const rect = body.getBoundingClientRect();
            manager.setBounds({x: Math.max(8, rect.left + 8),
                y: Math.max(8, rect.top + 8),
                width: Math.max(1, Math.min(innerWidth, rect.right) - Math.max(0, rect.left) - 16),
                height: Math.max(1, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top) - 16)});
        };
        document.addEventListener('pointerdown', this.pointer, true);
        document.addEventListener('focusin', this.focus);
        window.addEventListener('resize', this.measure);
        this.props.vm.on('PROJECT_LOADED', this.reset);
        this.observer = new ResizeObserver(this.measure);
        this.observer.observe(document.documentElement);
        this.sync();
    }
    componentDidUpdate () {
        this.sync();
    }
    componentWillUnmount () {
        manager.suspend(true);
        this.unsubscribe();
        this.unbind();
        this.observer.disconnect();
        document.removeEventListener('pointerdown', this.pointer, true);
        document.removeEventListener('focusin', this.focus);
        window.removeEventListener('resize', this.measure);
        this.props.vm.removeListener('PROJECT_LOADED', this.reset);
    }
    sync () {
        manager.suspend(this.props.suspended);
        this.measure();
        const bounds = document.querySelector('[data-editor-window-bounds]');
        if (bounds !== this.bounds) {
            if (this.bounds) this.observer.unobserve(this.bounds);
            this.bounds = bounds;
            if (bounds) this.observer.observe(bounds);
        }
    }
    render () {
        const state = manager.state;
        return ReactDOM.createPortal(
            <div
                className={styles.layer}
                dir={this.props.rtl ? 'rtl' : 'ltr'}
            >
                {Array.from(manager.definitions.values()).map(entry => (
                    <WindowFrame
                        key={entry.id}
                        entry={entry}
                        window={state.windows[entry.id]}
                        active={state.active === entry.id}
                        suspended={this.props.suspended}
                        index={state.order.indexOf(entry.id)}
                        intl={this.props.intl}
                    />
                ))}
            </div>, document.body);
    }
}
Host.contextTypes = {store: PropTypes.object};
Host.propTypes = {suspended: PropTypes.bool, rtl: PropTypes.bool, vm: PropTypes.object, intl: intlShape};
export const WindowHost = connect(state => ({
    suspended: state.scratchGui.mode.isPlayerOnly || state.scratchGui.mode.isFullScreen,
    rtl: state.locales.isRtl,
    vm: state.scratchGui.vm
}))(injectIntl(Host));

export class Toolbar extends React.Component {
    constructor (props) {
        super(props);
        this.state = {capacity: 1, expanded: false};
    }
    componentDidMount () {
        this.unsubscribe = manager.subscribe(() => this.forceUpdate());
        this.dismiss = event => {
            if (this.state.expanded && !this.element.contains(event.target)) this.setState({expanded: false});
        };
        document.addEventListener('pointerdown', this.dismiss);
        document.addEventListener('focusin', this.dismiss);
        this.observer = new ResizeObserver(() => {
            this.setState({capacity: Math.max(0, Math.floor(this.element.clientWidth / 36) - 1)});
        });
        this.observer.observe(this.element);
    }
    componentDidUpdate () {
        const entries = Array.from(manager.definitions.values());
        if (entries.length > this.state.capacity + 1) {
            entries.slice(this.state.capacity).forEach(entry => {
                entry.anchor = this.more;
            });
        }
    }
    componentWillUnmount () {
        this.unsubscribe();
        this.observer.disconnect();
        document.removeEventListener('pointerdown', this.dismiss);
        document.removeEventListener('focusin', this.dismiss);
        manager.definitions.forEach(entry => {
            entry.anchor = null;
            if (entry.toolbarButton) entry.owned.delete(entry.toolbarButton);
            entry.toolbarButton = null;
        });
    }
    renderButton (entry, overflow) {
        const state = manager.state.windows[entry.id];
        const label = typeof entry.title === 'string' ? entry.title : this.props.intl.formatMessage(entry.title);
        return (
            <button
                key={entry.id}
                ref={el => {
                    if (entry.toolbarButton) entry.owned.delete(entry.toolbarButton);
                    entry.toolbarButton = el;
                    if (el) entry.owned.add(el);
                    entry.anchor = overflow ? this.more : el;
                }}
                type="button"
                title={label}
                aria-label={label}
                aria-expanded={state.status === 'visible'}
                aria-pressed={manager.state.active === entry.id}
                data-status={state.status}
                data-pinned={state.pinned}
                data-unread={state.unread}
                data-window-button={entry.id}
                onPointerDown={event => event.preventDefault()}
                onClick={event => {
                    if (overflow) entry.anchor = this.more;
                    // The first click opens immediately; the second promotes it to a pinned window.
                    if (event.detail === 2) manager.open(entry.id, {pinned: true});
                    else manager.toggle(entry.id);
                    this.setState({expanded: false});
                }}
            >
                <span
                    className={styles.toolIcon}
                    style={{'--tool-icon': `url("${entry.icon}")`}}
                    aria-hidden="true"
                />
                {overflow ? label : null}
                {state.pinned ? <span className={styles.pinMark}><Icon name="pin" /></span> : null}
            </button>
        );
    }
    render () {
        const entries = Array.from(manager.definitions.values());
        const overflow = entries.length > this.state.capacity + 1;
        const visible = overflow ? this.state.capacity : entries.length;
        return (
            <div
                ref={el => {
                    this.element = el;
                }}
                className={styles.toolbar}
                role="toolbar"
                aria-label={this.props.intl.formatMessage(messages.tools)}
            >
                {entries.slice(0, visible).map(entry => this.renderButton(entry, false))}
                {overflow ? <div className={styles.more}>
                    <button
                        ref={el => {
                            this.more = el;
                        }}
                        type="button"
                        aria-expanded={this.state.expanded}
                        aria-label={this.props.intl.formatMessage(messages.more)}
                        onClick={() => this.setState({expanded: !this.state.expanded})}
                    ><Icon name="more" /></button>
                    {this.state.expanded ? <div
                        className={styles.overflow}
                        onKeyDown={event => {
                            if (event.key === 'Escape') {
                                this.setState({expanded: false}); this.more.focus();
                            }
                        }}
                    >{entries.slice(visible).map(entry => this.renderButton(entry, true))}</div> : null}
                </div> : null}
            </div>
        );
    }
}
Toolbar.propTypes = {intl: intlShape};
export const WindowToolbar = injectIntl(Toolbar);
