import React from 'react';
import PropTypes from 'prop-types';
import BufferedInputHOC from './buffered-input-hoc.jsx';
import Input from './input.jsx';
import {useNameField} from '../../lib/folders/short-names';

const BufferedInput = BufferedInputHOC(Input);

// Display and edit settings never alter the name passed in by the VM.
const ResourceNameInput = ({kind, value, onSubmit, ...props}) => {
    const field = useNameField(value, kind);
    return (<BufferedInput
        {...props}
        value={field.name}
        title={value}
        onFocus={field.handleFocus}
        onBlurCapture={field.handleBlur}
        onSubmit={input => onSubmit(field.resolveName(input))} // eslint-disable-line react/jsx-no-bind
    />);
};
ResourceNameInput.propTypes = {
    kind: PropTypes.oneOf(['SPRITE', 'COSTUME', 'SOUND']).isRequired,
    onSubmit: PropTypes.func.isRequired,
    value: PropTypes.string
};
export default ResourceNameInput;
