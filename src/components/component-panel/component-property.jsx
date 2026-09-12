import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import Input from '../forms/input.jsx';
import Label from '../forms/label.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import Checkbox from '../tw-fancy-checkbox/checkbox.jsx';

const BufferedInput = BufferedInputHOC(Input);

class ComponentProperty extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSubmit', 'handleCheck']);
    }
    handleSubmit (value) {
        this.props.onChange(this.props.property, value);
    }
    handleCheck (event) {
        this.handleSubmit(event.target.checked);
    }
    render () {
        const {label, property, value} = this.props;
        return (
            <Label text={label}>
                {typeof value === 'boolean' ? <Checkbox
                    aria-label={label}
                    checked={value}
                    name={property}
                    onChange={this.handleCheck}
                /> : <BufferedInput
                    small
                    aria-label={label}
                    name={property}
                    type="number"
                    step="any"
                    value={value}
                    onSubmit={this.handleSubmit}
                />}
            </Label>
        );
    }
}
ComponentProperty.propTypes = {
    label: PropTypes.string.isRequired,
    property: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]).isRequired,
    onChange: PropTypes.func.isRequired
};

export default ComponentProperty;
