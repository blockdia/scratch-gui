import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';
import VM from 'scratch-vm';
import messages from '../lib/component-messages';
import styles from '../components/component-panel/component-panel.css';

class ComponentPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleAdd', 'handleChangeBoolean', 'handleChangeNumber', 'handleFinishNumber']);
        this.state = {busy: false, error: null};
    }
    async handleAdd (event) {
        const type = event.target.value;
        if (!type) return;
        this.setState({busy: true, error: null});
        try {
            await this.props.vm.addComponent(type, this.props.intl.formatMessage(messages[type]));
        } catch (error) {
            this.setState({error: 'failed'});
        } finally {
            this.setState({busy: false});
        }
    }
    update (key, value) {
        try {
            this.props.vm.setComponentProperties(this.props.target.id, {[key]: value});
            this.setState({error: null});
        } catch (error) {
            this.setState({error: 'invalid'});
        }
    }
    handleChangeBoolean (event) {
        this.update(event.target.name, event.target.checked);
    }
    handleChangeNumber (event) {
        this.update(event.target.name, event.target.valueAsNumber);
    }
    handleFinishNumber (event) {
        if (event.key === 'Enter') event.target.blur();
    }
    render () {
        const {target, intl, vm} = this.props;
        if (!vm.addComponent) return null;
        const config = target && target.component;
        return (
            <section className={styles.panel}>
                <select
                    aria-label={intl.formatMessage(messages.add)}
                    disabled={this.state.busy}
                    value=""
                    onChange={this.handleAdd}
                >
                    <option value="">{intl.formatMessage(messages.add)}</option>
                    {['slider', 'button', 'toggle', 'progress'].map(type => (
                        <option
                            key={type}
                            value={type}
                        >{intl.formatMessage(messages[type])}</option>
                    ))}
                </select>
                {config && !target.componentError && <div className={styles.properties}>
                    {Object.entries(config.properties).map(([key, value]) => (
                        <label key={`${target.id}-${key}`}>
                            <span>{intl.formatMessage(messages[key])}</span>
                            {typeof value === 'boolean' ? <input
                                type="checkbox"
                                checked={value}
                                name={key}
                                onChange={this.handleChangeBoolean}
                            /> : <input
                                key={value}
                                type="number"
                                step="any"
                                defaultValue={value}
                                name={key}
                                onBlur={this.handleChangeNumber}
                                onKeyDown={this.handleFinishNumber}
                            />}
                        </label>
                    ))}
                </div>}
                {(this.state.error || (target && target.componentError)) && <div role="alert">
                    {intl.formatMessage(messages[this.state.error || 'unavailable'])}
                </div>}
            </section>
        );
    }
}
ComponentPanel.propTypes = {
    vm: PropTypes.instanceOf(VM),
    intl: intlShape,
    target: PropTypes.shape({id: PropTypes.string, component: PropTypes.object, componentError: PropTypes.string})
};
export default connect(state => ({
    vm: state.scratchGui.vm,
    target: state.scratchGui.targets.sprites[state.scratchGui.targets.editingTarget]
}))(injectIntl(ComponentPanel));
