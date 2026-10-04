import React from 'react';
import PropTypes from 'prop-types';
import Popover from '../popover/popover.jsx';
import {injectIntl, intlShape, defineMessages, FormattedMessage} from 'react-intl';

import Label from '../forms/label.jsx';
import Input from '../forms/input.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import ToggleButtons from '../toggle-buttons/toggle-buttons.jsx';
import Dial from './dial.jsx';

import styles from './direction-picker.css';

import allAroundIcon from '!../../lib/tw-recolor/build!./icon--all-around.svg';
import leftRightIcon from '!../../lib/tw-recolor/build!./icon--left-right.svg';
import dontRotateIcon from '!../../lib/tw-recolor/build!./icon--dont-rotate.svg';

const BufferedInput = BufferedInputHOC(Input);

const directionLabel = (
    <FormattedMessage
        defaultMessage="Direction"
        description="Sprite info direction label"
        id="gui.SpriteInfo.direction"
    />
);

const RotationStyles = {
    ALL_AROUND: 'all around',
    LEFT_RIGHT: 'left-right',
    DONT_ROTATE: "don't rotate"
};

const messages = defineMessages({
    allAround: {
        id: 'gui.directionPicker.rotationStyles.allAround',
        description: 'Button to change to the all around rotation style',
        defaultMessage: 'All Around'
    },
    leftRight: {
        id: 'gui.directionPicker.rotationStyles.leftRight',
        description: 'Button to change to the left-right rotation style',
        defaultMessage: 'Left/Right'
    },
    dontRotate: {
        id: 'gui.directionPicker.rotationStyles.dontRotate',
        description: 'Button to change to the dont rotate rotation style',
        defaultMessage: 'Do not rotate'
    }
});

const DirectionPicker = props => {
    const controls = (
        <div className={styles.controls}>
            <Dial
                direction={props.direction}
                onChange={props.onChangeDirection}
            />
            <ToggleButtons
                className={styles.buttonRow}
                buttons={[
                    {
                        handleClick: props.onClickAllAround,
                        icon: allAroundIcon,
                        isSelected: props.rotationStyle === RotationStyles.ALL_AROUND,
                        title: props.intl.formatMessage(messages.allAround)
                    },
                    {
                        handleClick: props.onClickLeftRight,
                        icon: leftRightIcon,
                        isSelected: props.rotationStyle === RotationStyles.LEFT_RIGHT,
                        title: props.intl.formatMessage(messages.leftRight)
                    },
                    {
                        handleClick: props.onClickDontRotate,
                        icon: dontRotateIcon,
                        isSelected: props.rotationStyle === RotationStyles.DONT_ROTATE,
                        title: props.intl.formatMessage(messages.dontRotate)
                    }
                ]}
            />
        </div>
    );
    const input = (
        <BufferedInput
            small
            disabled={props.disabled}
            label={directionLabel}
            tabIndex="0"
            type="number"
            value={props.disabled ? '' : props.direction}
            onFocus={props.inline ? null : props.onOpenPopover}
            onSubmit={props.onChangeDirection}
        />
    );
    if (props.inline) {
        return (
            <div className={styles.inlinePicker}>
                <Label
                    secondary
                    text={directionLabel}
                >{input}</Label>
                {controls}
            </div>
        );
    }
    return (
        <Label
            secondary
            above={props.labelAbove}
            text={directionLabel}
        >
            <Popover
                body={controls}
                isOpen={props.popoverOpen}
                preferPlace="above"
                onOuterAction={props.onClosePopover}
            >
                {input}
            </Popover>
        </Label>
    );
};

DirectionPicker.propTypes = {
    direction: PropTypes.number,
    disabled: PropTypes.bool.isRequired,
    inline: PropTypes.bool,
    intl: intlShape,
    labelAbove: PropTypes.bool,
    onChangeDirection: PropTypes.func.isRequired,
    onClickAllAround: PropTypes.func.isRequired,
    onClickDontRotate: PropTypes.func.isRequired,
    onClickLeftRight: PropTypes.func.isRequired,
    onClosePopover: PropTypes.func.isRequired,
    onOpenPopover: PropTypes.func.isRequired,
    popoverOpen: PropTypes.bool.isRequired,
    rotationStyle: PropTypes.string
};

DirectionPicker.defaultProps = {
    labelAbove: false
};

const WrappedDirectionPicker = injectIntl(DirectionPicker);

export {
    WrappedDirectionPicker as default,
    RotationStyles
};
