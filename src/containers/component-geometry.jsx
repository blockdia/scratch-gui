import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';
import VM from 'scratch-vm';
import messages from '../lib/component-messages';
import styles from '../components/component-panel/component-panel.css';

const copy = value => JSON.parse(JSON.stringify(value));

class ComponentGeometry extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleMove', 'handleFinish', 'handleCancel', 'handleStart',
            'handleNudge', 'handleUndo', 'handleRedo']);
        this.state = {undo: [], redo: [], draft: null};
        this.drag = null;
    }
    componentDidUpdate (previous) {
        if (previous.targetId !== this.props.targetId) {
            this.drag = null;
            this.setState({undo: [], redo: [], draft: null}); // eslint-disable-line react/no-did-update-set-state
        }
    }
    apply (metadata, previous) {
        try {
            this.props.vm.setComponentMetadata(this.props.targetId, metadata);
            this.setState(state => ({undo: [...state.undo, copy(previous)], redo: [], draft: null}));
        } catch (error) {
            this.setState({draft: null});
        }
    }
    handleMove (event) {
        if (!this.drag) return;
        const svg = event.currentTarget;
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const local = point.matrixTransform(svg.getScreenCTM().inverse());
        const draft = copy(this.state.draft || this.props.config.metadata);
        draft.sliderTrack[this.drag.name] = [Math.round(local.x), -Math.round(local.y)];
        this.setState({draft});
    }
    handleFinish () {
        if (!this.drag) return;
        const previous = this.drag.previous;
        this.drag = null;
        if (this.state.draft) this.apply(this.state.draft, previous);
    }
    history (from, to) {
        const list = this.state[from];
        if (!list.length) return;
        this.props.vm.setComponentMetadata(this.props.targetId, list[list.length - 1]);
        this.setState(state => ({[from]: list.slice(0, -1),
            [to]: [...state[to], copy(this.props.config.metadata)]}));
    }
    handleNudge (event) {
        const name = event.currentTarget.dataset.endpoint;
        const offsets = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]};
        if (!offsets[event.key]) return;
        event.preventDefault();
        const metadata = copy(this.props.config.metadata);
        const delta = offsets[event.key];
        metadata.sliderTrack[name] = metadata.sliderTrack[name].map((n, i) => n + delta[i]);
        this.apply(metadata, this.props.config.metadata);
    }
    handleCancel () {
        this.drag = null;
        this.setState({draft: null});
    }
    handleStart (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        const svg = event.currentTarget.ownerSVGElement;
        this.drag = {name: event.currentTarget.dataset.endpoint,
            previous: copy(this.props.config.metadata),
            viewBox: svg.getAttribute('viewBox')};
        svg.setPointerCapture(event.pointerId);
    }
    handleUndo () {
        this.history('undo', 'redo');
    }
    handleRedo () {
        this.history('redo', 'undo');
    }
    render () {
        const {config, targetId, vm, intl} = this.props;
        if (!config || !config.metadata || !config.metadata.sliderTrack) return null;
        const target = vm.runtime.getTargetById(targetId);
        if (!target || !target.componentController) return null;
        const trackPart = config.parts.find(part => part.name === 'track');
        const costume = target.getCostumes()[trackPart.costumeIndex];
        const metadata = this.state.draft || config.metadata;
        const {start, end} = metadata.sliderTrack;
        const size = vm.renderer.getSkinSize(costume.skinId);
        const resolution = costume.bitmapResolution || 1;
        const left = -costume.rotationCenterX / resolution;
        const top = -costume.rotationCenterY / resolution;
        const x = Math.min(left, start[0], end[0]) - 20;
        const y = Math.min(top, -start[1], -end[1]) - 20;
        const width = Math.max(left + size[0], start[0], end[0]) + 20 - x;
        const height = Math.max(top + size[1], -start[1], -end[1]) + 20 - y;
        return (
            <details className={styles.guides}>
                <summary>{intl.formatMessage(messages.guides)}</summary>
                <svg
                    viewBox={this.drag ? this.drag.viewBox : `${x} ${y} ${width} ${height}`}
                    aria-label={intl.formatMessage(messages.guides)}
                    onPointerMove={this.handleMove}
                    onPointerUp={this.handleFinish}
                    onPointerCancel={this.handleCancel}
                >
                    <image
                        href={costume.asset.encodeDataURI()}
                        x={left}
                        y={top}
                        width={size[0]}
                        height={size[1]}
                    />
                    <line
                        x1={start[0]}
                        y1={-start[1]}
                        x2={end[0]}
                        y2={-end[1]}
                        stroke="#ffab19"
                        strokeWidth="2"
                    />
                    {['start', 'end'].map(name => (
                        <circle
                            key={name}
                            role="button"
                            tabIndex="0"
                            aria-label={intl.formatMessage(messages[name])}
                            cx={metadata.sliderTrack[name][0]}
                            cy={-metadata.sliderTrack[name][1]}
                            r="5"
                            fill="#ffffff"
                            stroke="#4c97ff"
                            strokeWidth="2"
                            data-endpoint={name}
                            onKeyDown={this.handleNudge}
                            onPointerDown={this.handleStart}
                        />
                    ))}
                </svg>
                <button
                    disabled={!this.state.undo.length}
                    onClick={this.handleUndo}
                >
                    {intl.formatMessage(messages.undo)}
                </button>
                <button
                    disabled={!this.state.redo.length}
                    onClick={this.handleRedo}
                >
                    {intl.formatMessage(messages.redo)}
                </button>
            </details>
        );
    }
}
ComponentGeometry.propTypes = {
    vm: PropTypes.instanceOf(VM),
    intl: intlShape,
    targetId: PropTypes.string,
    config: PropTypes.object // eslint-disable-line react/forbid-prop-types
};
export default connect(state => {
    const targetId = state.scratchGui.targets.editingTarget;
    const target = state.scratchGui.targets.sprites[targetId];
    return {vm: state.scratchGui.vm, targetId, config: target && target.component};
})(injectIntl(ComponentGeometry));
