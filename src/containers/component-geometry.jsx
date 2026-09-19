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
        bindAll(this, [
            'handleGuideStart', 'handleGuideChange', 'handleGuideFinish', 'handleGuideCancel',
            'handleGuideSelect', 'handleNudge', 'handleUndo', 'handleRedo', 'handleSelect',
            'handleToggleSnap', 'handleToggleGuides', 'handleCoordinateChange',
            'handleCoordinateCommit', 'handleCoordinateKeyDown'
        ]);
        this.state = {
            undo: [],
            redo: [],
            draft: null,
            selected: 'start',
            snap: false,
            expanded: false
        };
        this.drag = null;
        this.coordinatePrevious = null;
    }
    componentDidUpdate (previous) {
        if (previous.targetId !== this.props.targetId) {
            this.drag = null;
            this.coordinatePrevious = null;
            this.setState({ // eslint-disable-line react/no-did-update-set-state
                undo: [],
                redo: [],
                draft: null,
                selected: 'start',
                expanded: false
            });
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
    handleGuideStart (name) {
        this.drag = {name: name, previous: copy(this.props.config.metadata)};
        this.setState({selected: name});
    }
    handleGuideChange (name, point) {
        const draft = copy(this.state.draft || this.props.config.metadata);
        draft.sliderTrack[name] = point.slice();
        this.setState({draft, selected: name});
    }
    handleGuideFinish (name, point) {
        const previous = this.drag ? this.drag.previous : this.props.config.metadata;
        const draft = copy(this.state.draft || this.props.config.metadata);
        draft.sliderTrack[name] = point.slice();
        this.drag = null;
        this.apply(draft, previous);
    }
    handleGuideCancel () {
        this.drag = null;
        this.setState({draft: null});
    }
    handleGuideSelect (name) {
        this.setState({selected: name});
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
        const multiplier = event.shiftKey ? 10 : 1;
        const delta = offsets[event.key].map(value => value * multiplier);
        metadata.sliderTrack[name] = metadata.sliderTrack[name].map((number, index) => number + delta[index]);
        this.setState({selected: name});
        this.apply(metadata, this.props.config.metadata);
    }
    handleSelect (event) {
        this.handleGuideSelect(event.currentTarget.dataset.endpoint);
    }
    handleToggleSnap (event) {
        this.setState({snap: event.target.checked});
    }
    handleToggleGuides (event) {
        if (event) event.preventDefault();
        this.drag = null;
        this.coordinatePrevious = null;
        this.setState(state => ({
            expanded: !state.expanded,
            draft: state.expanded ? null : state.draft
        }));
    }
    handleCoordinateChange (event) {
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        if (!this.coordinatePrevious) this.coordinatePrevious = copy(this.props.config.metadata);
        const draft = copy(this.state.draft || this.props.config.metadata);
        const index = event.target.dataset.axis === 'x' ? 0 : 1;
        const endpoint = event.target.dataset.endpoint;
        draft.sliderTrack[endpoint][index] = value;
        this.setState({draft, selected: endpoint});
    }
    handleCoordinateCommit () {
        if (!this.state.draft) return;
        const previous = this.coordinatePrevious || this.props.config.metadata;
        this.coordinatePrevious = null;
        this.apply(this.state.draft, previous);
    }
    handleCoordinateKeyDown (event) {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
            this.coordinatePrevious = null;
            const input = event.currentTarget;
            this.setState({draft: null}, () => input.blur());
        }
    }
    handleUndo () {
        this.history('undo', 'redo');
    }
    handleRedo () {
        this.history('redo', 'undo');
    }
    render () {
        const {config, targetId, vm, intl, children} = this.props;
        if (!config || !config.metadata || !config.metadata.sliderTrack) return children;
        const target = vm.runtime.getTargetById(targetId);
        if (!target || !target.componentController) return children;
        const metadata = this.state.draft || config.metadata;
        const selectedPoint = metadata.sliderTrack[this.state.selected];
        const guidesLabel = intl.formatMessage(messages.guides);
        const hint = intl.formatMessage(messages.guideHint);
        const snap = intl.formatMessage(messages.snap);
        const controlPointEditor = {
            active: this.state.expanded,
            canRedo: Boolean(this.state.redo.length),
            canUndo: Boolean(this.state.undo.length),
            labels: {
                edit: intl.formatMessage(messages.editGuides),
                end: intl.formatMessage(messages.end),
                exit: intl.formatMessage(messages.exitGuides),
                hint,
                redo: intl.formatMessage(messages.redo),
                snap,
                start: intl.formatMessage(messages.start),
                title: guidesLabel,
                undo: intl.formatMessage(messages.undo)
            },
            points: metadata.sliderTrack,
            selected: this.state.selected,
            snap: this.state.snap,
            onCoordinateChange: this.handleCoordinateChange,
            onCoordinateCommit: this.handleCoordinateCommit,
            onCoordinateKeyDown: this.handleCoordinateKeyDown,
            onEdit: this.handleToggleGuides,
            onExit: this.handleToggleGuides,
            onNudge: this.handleNudge,
            onRedo: this.handleRedo,
            onSelect: this.handleSelect,
            onToggleSnap: this.handleToggleSnap,
            onUndo: this.handleUndo
        };
        const controlPointGuide = this.state.expanded ? {
            points: {
                start: {label: intl.formatMessage(messages.start), position: metadata.sliderTrack.start},
                end: {label: intl.formatMessage(messages.end), position: metadata.sliderTrack.end}
            },
            selected: this.state.selected,
            snap: this.state.snap ? 5 : 1,
            onCancel: this.handleGuideCancel,
            onChange: this.handleGuideChange,
            onCommit: this.handleGuideFinish,
            onSelect: this.handleGuideSelect,
            onStart: this.handleGuideStart
        } : null;
        const paintEditor = React.isValidElement(children) ?
            React.cloneElement(children, {controlPointEditor, controlPointGuide}) : children;
        return (
            <div className={styles.geometryEditor}>
                <div className={styles.paintArea}>
                    {paintEditor}
                    <div
                        aria-live="polite"
                        className={styles.srOnly}
                    >
                        {`${intl.formatMessage(messages[this.state.selected])}: X ${selectedPoint[0]}, ` +
                            `Y ${selectedPoint[1]}`}
                    </div>
                </div>
            </div>
        );
    }
}
ComponentGeometry.propTypes = {
    vm: PropTypes.instanceOf(VM),
    intl: intlShape,
    targetId: PropTypes.string,
    config: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    children: PropTypes.node
};
export default connect(state => {
    const targetId = state.scratchGui.targets.editingTarget;
    const target = state.scratchGui.targets.sprites[targetId];
    return {vm: state.scratchGui.vm, targetId, config: target && target.component};
})(injectIntl(ComponentGeometry));
