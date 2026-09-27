/* eslint-disable react/jsx-no-bind */
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
import settingsStore from '../../addons/settings-store-singleton';
import channels from '../../addons/channels';
import upstreamMeta from '../../addons/generated/upstream-meta.json';
import windowManager from '../editor-windows/manager';
import CommandPalette from '../../components/command-palette/command-palette.jsx';
import palette from '../command-palette/service';
import paletteMessages from '../command-palette/messages';
import {navigationFor} from '../block-navigation';
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
            id: 'addon/keyboard-editing/toggle-mode',
            title: {id: 'addons.keyboard-editing.action-toggle-mode'},
            source: 'keyboard-editing',
            scopes: ['editor'],
            run: () => {
                settingsStore.setAddonEnabled('keyboard-editing',
                    !settingsStore.getAddonEnabled('keyboard-editing'));
                if (channels.changeChannel) {
                    channels.changeChannel.postMessage({version: upstreamMeta.commit, store: settingsStore.store});
                }
            }
        }));
        this.handles.push(actions.registerAction({
            id: 'builtin/shortcuts',
            title: messages.openShortcuts,
            source: 'builtin',
            scopes: ['editor'],
            defaultBindings: ['Mod+Alt+k'],
            run: () => actions.openSettings()
        }));
        this.controller = new ShortcutController(actions, () => this.props.state, () =>
            windowManager.gesturing ||
            Boolean(AddonHooks.blocklyWorkspace && AddonHooks.blocklyWorkspace.isDragging()));
        this.unmount = this.controller.mount();
        const enabled = () => !this.props.state.scratchGui.mode.isPlayerOnly &&
            !this.props.state.scratchGui.mode.isFullScreen;
        for (const [id, mode, binding] of [['quick-open', 'targets', 'Mod+p'],
            ['command-palette', 'commands', 'Mod+Shift+p'], ['find-symbol', 'symbols', 'Mod+f']]) {
            this.handles.push(actions.registerAction({id: `builtin/${id}`,
                title: paletteMessages[mode],
                scopes: ['global'],
                defaultBindings: [binding],
                allowInInput: true,
                enabled,
                run: () => palette.open({mode})}));
        }
        for (const [direction, key] of [['back', 'ArrowLeft'], ['forward', 'ArrowRight']]) {
            this.handles.push(actions.registerAction({id: `builtin/navigate-${direction}`,
                title: paletteMessages[direction],
                scopes: ['blocks', 'keyboard'],
                defaultBindings: [`Mod+${key}`],
                enabled,
                run: () => navigationFor(this.props.state.scratchGui.vm).travel(direction,
                    () => this.props.dispatch(activateTab(0)))}));
        }
    }
    componentWillUnmount () {
        this.unmount();
        this.handles.forEach(handle => handle.unregister());
        actions.recording = false;
        actions.settingsOpen = false;
    }
    render () {
        return (<React.Fragment>
            <ShortcutSettings />
            <CommandPalette
                dispatch={this.props.dispatch}
                editorState={this.props.state}
                getContext={target => (this.controller ? this.controller.context(target) : {area: 'blocks'})}
            />
        </React.Fragment>);
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
