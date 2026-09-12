import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';
import Popover from 'react-popover';
import {isRtl} from '@turbowarp/scratch-l10n';
import VM from 'scratch-vm';
import ComponentProperty from '../components/component-panel/component-property.jsx';
import Button from '../components/button/button.jsx';
import messages from '../lib/component-messages';
import {STAGE_DISPLAY_SIZES} from '../lib/layout-constants';
import styles from '../components/component-panel/component-panel.css';

class ComponentPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleChange', 'handleToggle', 'handleClose', 'handleKeyDown', 'handleButtonKeyDown']);
        this.state = {open: false, error: null};
    }
    static getDerivedStateFromProps (props, state) {
        const targetId = props.target && props.target.id;
        if (targetId !== state.targetId) return {targetId, open: false, error: null};
        return null;
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown);
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown);
    }
    handleKeyDown (event) {
        if (event.key === 'Escape') this.handleClose();
    }
    handleButtonKeyDown (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleToggle();
        }
    }
    handleToggle () {
        this.setState(state => ({open: !state.open}));
    }
    handleClose () {
        this.setState({open: false});
    }
    handleChange (key, value) {
        try {
            this.props.vm.setComponentProperties(this.props.target.id, {[key]: value});
            this.setState({error: null});
        } catch (error) {
            this.setState({error: 'invalid'});
        }
    }
    renderProperty ([key, value]) {
        return (
            <ComponentProperty
                key={`${this.props.target.id}-${key}`}
                label={this.props.intl.formatMessage(messages[key])}
                property={key}
                value={value}
                onChange={this.handleChange}
            />
        );
    }
    render () {
        const {target, intl, stageSize} = this.props;
        const config = target && target.component;
        if (!config) return null;
        if (target.componentError) return <div role="alert">{intl.formatMessage(messages.unavailable)}</div>;
        const entries = Object.entries(config.properties);
        const common = entries.filter(([key]) => key === 'value' || key === 'checked');
        const advanced = entries.filter(([key]) => key !== 'value' && key !== 'checked');
        const settings = intl.formatMessage(messages.settings);
        return (
            <section
                aria-label={intl.formatMessage(messages[config.type])}
                className={styles.panel}
            >
                {stageSize !== STAGE_DISPLAY_SIZES.small &&
                    <span className={styles.type}>{intl.formatMessage(messages[config.type])}</span>}
                {common.map(entry => this.renderProperty(entry))}
                <Popover
                    body={<div
                        aria-label={settings}
                        className={styles.popup}
                        dir={isRtl(intl.locale) ? 'rtl' : 'ltr'}
                        role="dialog"
                    >
                        <div className={styles.heading}>{settings}</div>
                        {advanced.map(entry => this.renderProperty(entry))}
                        {this.state.error && <div role="alert">{intl.formatMessage(messages[this.state.error])}</div>}
                    </div>}
                    isOpen={this.state.open}
                    preferPlace="above"
                    onOuterAction={this.handleClose}
                >
                    <Button
                        aria-label={settings}
                        title={settings}
                        aria-expanded={this.state.open}
                        aria-haspopup="dialog"
                        className={styles.settingsButton}
                        tabIndex="0"
                        onClick={this.handleToggle}
                        onKeyDown={this.handleButtonKeyDown}
                    >
                        <svg
                            aria-hidden="true"
                            className={styles.settingsIcon}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                        >
                            <path d="M4 6h16M4 12h16M4 18h16" />
                            <path d="M8 4v4M16 10v4M10 16v4" />
                        </svg>
                    </Button>
                </Popover>
                {this.state.error && !this.state.open && <div role="alert">
                    {intl.formatMessage(messages[this.state.error])}
                </div>}
            </section>
        );
    }
}
ComponentPanel.propTypes = {
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)),
    vm: PropTypes.instanceOf(VM),
    intl: intlShape,
    target: PropTypes.shape({id: PropTypes.string, component: PropTypes.object, componentError: PropTypes.string})
};
export default connect(state => ({
    vm: state.scratchGui.vm,
    target: state.scratchGui.targets.sprites[state.scratchGui.targets.editingTarget]
}))(injectIntl(ComponentPanel));
