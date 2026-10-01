import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import PromptComponent from '../components/prompt/prompt.jsx';
import VM from 'scratch-vm';
import {SCRATCH_MAX_CLOUD_VARIABLES} from '../lib/tw-cloud-limits.js';
import actions from '../lib/editor-actions';
import {displayBinding} from '../lib/editor-actions/keys';
import {VARIABLE_DIALOG, variableShortcuts} from '../lib/editor-actions/dialogs';

class Prompt extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleOk',
            'handleScopeOptionSelection',
            'handleCancel',
            'handleChange',
            'handleKeyPress',
            'handleKeyDown',
            'handleCloudVariableOptionChange'
        ]);
        this.state = {
            isAddingCloudVariableScratchSafe: (
                props.vm &&
                props.vm.runtime.getNumberOfCloudVariables() < SCRATCH_MAX_CLOUD_VARIABLES
            ) || false,
            inputValue: '',
            globalSelected: true,
            cloudSelected: false,
            canAddCloudVariable: (props.vm && props.vm.runtime.canAddCloudVariable()) || false
        };
    }
    handleKeyPress (event) {
        if (event.key === 'Enter') this.handleOk();
    }
    handleKeyDown (event) {
        // React 16 synthetic events have no `code`.
        if (actions.matchDialogShortcut(VARIABLE_DIALOG, event.nativeEvent) !== variableShortcuts.toggleScope) return;
        event.preventDefault();
        if (event.repeat || !this.props.showVariableOptions || this.props.isStage || this.state.cloudSelected) return;
        this.setState(state => ({globalSelected: !state.globalSelected}));
    }
    handleFocus (event) {
        event.target.select();
    }
    handleOk () {
        this.props.onOk(this.state.inputValue, {
            scope: this.state.globalSelected ? 'global' : 'local',
            isCloud: this.state.cloudSelected
        });
    }
    handleCancel () {
        this.props.onCancel();
    }
    handleChange (e) {
        this.setState({inputValue: e.target.value});
    }
    handleScopeOptionSelection (e) {
        this.setState({globalSelected: (e.target.value === 'global')});
    }
    handleCloudVariableOptionChange (e) {
        if (!this.props.showCloudOption) return;

        const checked = e.target.checked;
        this.setState({cloudSelected: checked});
        if (checked) {
            this.setState({globalSelected: true});
        }
    }
    render () {
        return (
            <PromptComponent
                isAddingCloudVariableScratchSafe={this.state.isAddingCloudVariableScratchSafe}
                canAddCloudVariable={this.state.canAddCloudVariable}
                cloudSelected={this.state.cloudSelected}
                defaultValue={this.props.defaultValue}
                globalSelected={this.state.globalSelected}
                isStage={this.props.isStage}
                showListMessage={this.props.showListMessage}
                label={this.props.label}
                showCloudOption={this.props.showCloudOption}
                showVariableOptions={this.props.showVariableOptions}
                title={this.props.title}
                toggleScopeHint={actions.bindings(variableShortcuts.toggleScope)
                    .map(binding => displayBinding(binding, actions.mac))
                    .join(', ')}
                toggleScopeShortcut={actions.ariaShortcuts(variableShortcuts.toggleScope)}
                onCancel={this.handleCancel}
                onChange={this.handleChange}
                onCloudVarOptionChange={this.handleCloudVariableOptionChange}
                onFocus={this.handleFocus}
                onKeyDown={this.handleKeyDown}
                onKeyPress={this.handleKeyPress}
                onOk={this.handleOk}
                onScopeOptionSelection={this.handleScopeOptionSelection}
            />
        );
    }
}

Prompt.propTypes = {
    defaultValue: PropTypes.string,
    isStage: PropTypes.bool.isRequired,
    showListMessage: PropTypes.bool.isRequired,
    label: PropTypes.string.isRequired,
    onCancel: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    showCloudOption: PropTypes.bool.isRequired,
    showVariableOptions: PropTypes.bool.isRequired,
    title: PropTypes.string.isRequired,
    vm: PropTypes.instanceOf(VM)
};

export default Prompt;
