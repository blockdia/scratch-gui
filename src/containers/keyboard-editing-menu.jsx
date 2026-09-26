import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import {MenuItem} from '../components/menu/menu.jsx';
import settings from '../addons/settings-store-singleton';
import channels from '../addons/channels';
import upstreamMeta from '../addons/generated/upstream-meta.json';

const addonId = 'keyboard-editing';
const isEnabled = () => settings.getAddonEnabled(addonId);

class KeyboardEditingMenu extends React.Component {
    constructor (props) {
        super(props);
        this.state = {enabled: isEnabled()};
        this.handleChange = () => this.setState({enabled: isEnabled()});
        this.handleToggle = () => {
            const enabled = !isEnabled();
            settings.setAddonEnabled(addonId, enabled);
            if (channels.changeChannel) {
                channels.changeChannel.postMessage({version: upstreamMeta.commit, store: settings.store});
            }
            this.props.onClose();
        };
    }
    componentDidMount () {
        settings.addEventListener('setting-changed', this.handleChange);
        settings.addEventListener('addon-changed', this.handleChange);
    }
    componentWillUnmount () {
        settings.removeEventListener('setting-changed', this.handleChange);
        settings.removeEventListener('addon-changed', this.handleChange);
    }
    render () {
        return (
            <MenuItem onClick={this.handleToggle}>
                {this.state.enabled ? (
                    <FormattedMessage
                        defaultMessage="Turn off Keyboard Editing Mode"
                        description="Edit menu item to disable keyboard block editing"
                        id="blockdia.menuBar.keyboardEditingOff"
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage="Turn on Keyboard Editing Mode"
                        description="Edit menu item to enable keyboard block editing"
                        id="blockdia.menuBar.keyboardEditingOn"
                    />
                )}
            </MenuItem>
        );
    }
}

KeyboardEditingMenu.propTypes = {onClose: PropTypes.func.isRequired};

export default KeyboardEditingMenu;
