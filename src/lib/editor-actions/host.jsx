import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import actions from './index';
import messages from './messages';
import registerFullscreenActions from './fullscreen';
import {ShortcutController} from './keyboard';
import {activateTab} from '../../reducers/editor-tab';
import {setFullScreen} from '../../reducers/mode';
import AddonHooks from '../../addons/hooks';
import windowManager from '../editor-windows/manager';
import ShortcutSettings from '../../components/shortcut-settings/shortcut-settings.jsx';

class ActionHost extends React.Component {
    componentDidMount () {
        this.handles = ['blocks', 'costumes', 'sounds'].map((name, index) => actions.registerAction({
            id: `builtin/tab-${name}`,
            title: messages[['tabBlocks', 'tabCostumes', 'tabSounds'][index]],
            source: 'builtin',
            scopes: ['editor'],
            run: () => {
                if (index === 1 && this.props.onActivateCostumesTab) return this.props.onActivateCostumesTab();
                if (index === 2 && this.props.onActivateSoundsTab) return this.props.onActivateSoundsTab();
                if (this.props.onActivateTab) return this.props.onActivateTab(index);
                return this.props.dispatch(activateTab(index));
            }
        }));
        this.handles.push(...registerFullscreenActions(actions,
            () => this.props.state.scratchGui.mode.isFullScreen,
            value => this.props.dispatch(setFullScreen(value))));
        this.handles.push(actions.registerAction({
            id: 'builtin/shortcuts',
            title: messages.openShortcuts,
            source: 'builtin',
            scopes: ['editor'],
            run: () => actions.openSettings()
        }));
        this.controller = new ShortcutController(actions, () => this.props.state, () =>
            windowManager.gesturing ||
            Boolean(AddonHooks.blocklyWorkspace && AddonHooks.blocklyWorkspace.isDragging()));
        this.unmount = this.controller.mount();
    }
    componentWillUnmount () {
        this.unmount();
        this.handles.forEach(handle => handle.unregister());
        actions.recording = false;
        actions.settingsOpen = false;
    }
    render () {
        return <ShortcutSettings />;
    }
}
ActionHost.propTypes = {
    state: PropTypes.object.isRequired,
    dispatch: PropTypes.func.isRequired,
    onActivateTab: PropTypes.func,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func
};
export default connect(state => ({state}))(ActionHost);
