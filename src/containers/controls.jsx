import actions from '../lib/editor-actions';
import actionMessages from '../lib/editor-actions/messages';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {connect} from 'react-redux';

import ControlsComponent from '../components/controls/controls.jsx';

class Controls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleGreenFlagClick',
            'handleStopAllClick'
        ]);
    }
    componentDidMount () {
        this.actionHandles = [actions.registerAction({
            id: 'builtin/run',
            title: actionMessages.run,
            source: 'builtin',
            scopes: ['editor'],
            defaultBindings: ['Mod+Enter'],
            run: () => {
                if (!this.props.isStarted) this.props.vm.start();
                this.props.vm.greenFlag();
            }
        }), actions.registerAction({
            id: 'builtin/stop',
            title: actionMessages.stop,
            source: 'builtin',
            scopes: ['editor'],
            defaultBindings: ['Mod+Shift+Enter'],
            run: () => this.props.vm.stopAll()
        }), actions.registerAction({
            id: 'builtin/turbo',
            title: actionMessages.turbo,
            source: 'builtin',
            scopes: ['editor'],
            run: () => this.props.vm.setTurboMode(!this.props.turbo)
        })];
    }
    componentWillUnmount () {
        this.actionHandles.forEach(handle => handle.unregister());
    }
    handleGreenFlagClick (e) {
        e.preventDefault();
        // tw: implement alt+click and right click to toggle FPS
        if (e.shiftKey || e.altKey || e.type === 'contextmenu') {
            if (e.shiftKey) {
                actions.execute('builtin/turbo');
            }
            if (e.altKey || e.type === 'contextmenu') {
                if (this.props.framerate === 30) {
                    this.props.vm.setFramerate(60);
                } else {
                    this.props.vm.setFramerate(30);
                }
            }
        } else {
            actions.execute('builtin/run');
        }
    }
    handleStopAllClick (e) {
        e.preventDefault();
        actions.execute('builtin/stop');
    }
    render () {
        const {
            vm, // eslint-disable-line no-unused-vars
            isStarted, // eslint-disable-line no-unused-vars
            projectRunning,
            turbo,
            ...props
        } = this.props;
        return (
            <ControlsComponent
                {...props}
                active={projectRunning && isStarted}
                turbo={turbo}
                onGreenFlagClick={this.handleGreenFlagClick}
                onStopAllClick={this.handleStopAllClick}
            />
        );
    }
}

Controls.propTypes = {
    isStarted: PropTypes.bool.isRequired,
    projectRunning: PropTypes.bool.isRequired,
    turbo: PropTypes.bool.isRequired,
    framerate: PropTypes.number.isRequired,
    interpolation: PropTypes.bool.isRequired,
    isSmall: PropTypes.bool,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.started,
    projectRunning: state.scratchGui.vmStatus.running,
    framerate: state.scratchGui.tw.framerate,
    interpolation: state.scratchGui.tw.interpolation,
    turbo: state.scratchGui.vmStatus.turbo
});
// no-op function to prevent dispatch prop being passed to component
const mapDispatchToProps = () => ({});

export default connect(mapStateToProps, mapDispatchToProps)(Controls);
