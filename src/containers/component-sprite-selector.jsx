import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';
import VM from 'scratch-vm';
import SpriteSelector from '../components/sprite-selector/sprite-selector.jsx';
import Library from '../components/library/library.jsx';
import messages from '../lib/component-messages';
import slider from '../components/component-library/slider.svg';
import button from '../components/component-library/button.svg';
import toggle from '../components/component-library/toggle.svg';
import progress from '../components/component-library/progress.svg';

const icons = {slider, button, toggle, progress};

class ComponentSpriteSelector extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleOpen', 'handleClose', 'handleSelect']);
        this.state = {open: false, busy: false, error: false};
    }
    handleOpen () {
        if (!this.state.busy) this.setState({open: true, error: false});
    }
    handleClose () {
        this.setState({open: false});
    }
    async handleSelect (item) {
        if (this.state.busy) return;
        this.setState({busy: true, error: false});
        try {
            await this.props.vm.addComponent(item.type, item.name);
            this.props.onActivateBlocksTab();
        } catch (error) {
            this.setState({error: true});
        } finally {
            this.setState({busy: false});
        }
    }
    render () {
        const {vm, intl, onActivateBlocksTab, dispatch, ...props} = this.props; // eslint-disable-line no-unused-vars
        return (
            <React.Fragment>
                {this.state.error && <div role="alert">{intl.formatMessage(messages.failed)}</div>}
                <SpriteSelector
                    {...props}
                    onNewComponentClick={vm.addComponent ? this.handleOpen : null}
                />
                {this.state.open && <Library
                    data={Object.keys(icons).map(type => ({
                        type,
                        name: intl.formatMessage(messages[type]),
                        rawURL: icons[type]
                    }))}
                    filterable={false}
                    id="componentLibrary"
                    persistableKey="type"
                    title={intl.formatMessage(messages.add)}
                    onItemSelected={this.handleSelect}
                    onRequestClose={this.handleClose}
                />}
            </React.Fragment>
        );
    }
}
ComponentSpriteSelector.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired,
    intl: intlShape.isRequired,
    dispatch: PropTypes.func,
    onActivateBlocksTab: PropTypes.func.isRequired
};
export default connect(state => ({vm: state.scratchGui.vm}))(injectIntl(ComponentSpriteSelector));
