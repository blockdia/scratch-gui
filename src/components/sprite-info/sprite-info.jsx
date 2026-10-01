import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import Popover from 'react-popover';
import {isRtl} from '@turbowarp/scratch-l10n';

import Box from '../box/box.jsx';
import Label from '../forms/label.jsx';
import Input from '../forms/input.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import ResourceNameInput from '../forms/resource-name-input.jsx';
import DirectionPicker from '../../containers/direction-picker.jsx';

import {injectIntl, intlShape, defineMessages, FormattedMessage} from 'react-intl';

import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import {isWideLocale} from '../../lib/locale-utils.js';

import styles from './sprite-info.css';

import xIcon from './icon--x.svg';
import yIcon from './icon--y.svg';
import showIcon from '!../../lib/tw-recolor/build!./icon--show.svg';
import hideIcon from '!../../lib/tw-recolor/build!./icon--hide.svg';
import ToggleButtons from '../toggle-buttons/toggle-buttons.jsx';
import settingsIcon from '../stage-header/icon--settings.svg';

const BufferedInput = BufferedInputHOC(Input);

const messages = defineMessages({
    moreProperties: {
        id: 'blockdia.spriteInfo.moreProperties',
        defaultMessage: 'More sprite properties',
        description: 'Open size, direction and rotation style controls'
    },
    spritePlaceholder: {
        id: 'gui.SpriteInfo.spritePlaceholder',
        defaultMessage: 'Name',
        description: 'Placeholder text for sprite name'
    },
    showSpriteAction: {
        id: 'gui.SpriteInfo.showSpriteAction',
        defaultMessage: 'Show sprite',
        description: 'Tooltip for show sprite button'
    },
    hideSpriteAction: {
        id: 'gui.SpriteInfo.hideSpriteAction',
        defaultMessage: 'Hide sprite',
        description: 'Tooltip for hide sprite button'
    }
});

class SpriteInfo extends React.Component {
    constructor (props) {
        super(props);
        this.state = {propertiesOpen: false};
        this.propertiesButton = React.createRef();
        bindAll(this, ['handleToggleProperties', 'handleCloseProperties', 'handlePropertiesKeyDown']);
    }
    shouldComponentUpdate (nextProps, nextState) {
        return (
            this.state.propertiesOpen !== nextState.propertiesOpen ||
            this.props.targetId !== nextProps.targetId ||
            this.props.intl !== nextProps.intl ||
            this.props.rotationStyle !== nextProps.rotationStyle ||
            this.props.disabled !== nextProps.disabled ||
            this.props.name !== nextProps.name ||
            this.props.stageSize !== nextProps.stageSize ||
            this.props.visible !== nextProps.visible ||
            // Only update these if rounded value has changed
            Math.round(this.props.direction) !== Math.round(nextProps.direction) ||
            Math.round(this.props.size) !== Math.round(nextProps.size) ||
            Math.round(this.props.x) !== Math.round(nextProps.x) ||
            Math.round(this.props.y) !== Math.round(nextProps.y)
        );
    }
    componentDidUpdate (prevProps) {
        if (this.state.propertiesOpen && (prevProps.targetId !== this.props.targetId ||
            prevProps.stageSize !== this.props.stageSize || this.props.disabled)) {
            this.handleCloseProperties();
        }
    }
    handleToggleProperties () {
        this.setState(state => ({propertiesOpen: !state.propertiesOpen}));
    }
    handleCloseProperties () {
        this.setState({propertiesOpen: false});
    }
    handlePropertiesKeyDown (event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.handleCloseProperties();
            this.propertiesButton.current.focus();
        }
    }
    render () {
        const {
            stageSize
        } = this.props;

        const sprite = (
            <FormattedMessage
                defaultMessage="Sprite"
                description="Sprite info label"
                id="gui.SpriteInfo.sprite"
            />
        );
        const showLabel = (
            <FormattedMessage
                defaultMessage="Show"
                description="Sprite info show label"
                id="gui.SpriteInfo.show"
            />
        );
        const sizeLabel = (
            <FormattedMessage
                defaultMessage="Size"
                description="Sprite info size label"
                id="gui.SpriteInfo.size"
            />
        );

        const labelAbove = isWideLocale(this.props.intl.locale);

        const spriteNameInput = (
            <ResourceNameInput
                kind="SPRITE"
                className={classNames(
                    styles.spriteInput,
                    {
                        [styles.columnInput]: labelAbove
                    }
                )}
                disabled={this.props.disabled}
                autoComplete="off"
                data-1p-ignore="true"
                placeholder={this.props.intl.formatMessage(messages.spritePlaceholder)}
                tabIndex="0"
                type="text"
                value={this.props.disabled ? '' : this.props.name}
                onSubmit={this.props.onChangeName}
            />
        );

        const xPosition = (
            <div className={styles.group}>
                {
                    (stageSize === STAGE_DISPLAY_SIZES.full || stageSize === STAGE_DISPLAY_SIZES.large) ?
                        <div className={styles.iconWrapper}>
                            <img
                                aria-hidden="true"
                                className={classNames(styles.xIcon, styles.icon)}
                                src={xIcon}
                                draggable={false}
                            />
                        </div> :
                        null
                }
                <Label text="x">
                    <BufferedInput
                        small
                        disabled={this.props.disabled}
                        placeholder="x"
                        tabIndex="0"
                        type="number"
                        value={this.props.disabled ? '' : Math.round(this.props.x)}
                        onSubmit={this.props.onChangeX}
                    />
                </Label>
            </div>
        );

        const yPosition = (
            <div className={styles.group}>
                {
                    (stageSize === STAGE_DISPLAY_SIZES.full || stageSize === STAGE_DISPLAY_SIZES.large) ?
                        <div className={styles.iconWrapper}>
                            <img
                                aria-hidden="true"
                                className={classNames(styles.yIcon, styles.icon)}
                                src={yIcon}
                                draggable={false}
                            />
                        </div> :
                        null
                }
                <Label text="y">
                    <BufferedInput
                        small
                        disabled={this.props.disabled}
                        placeholder="y"
                        tabIndex="0"
                        type="number"
                        value={this.props.disabled ? '' : Math.round(this.props.y)}
                        onSubmit={this.props.onChangeY}
                    />
                </Label>
            </div>
        );

        if (stageSize === STAGE_DISPLAY_SIZES.small) {
            const moreProperties = this.props.intl.formatMessage(messages.moreProperties);
            const visibilityAction = this.props.intl.formatMessage(
                this.props.visible ? messages.hideSpriteAction : messages.showSpriteAction
            );
            return (
                <Box className={classNames(styles.spriteInfo, styles.small)}>
                    <div className={classNames(styles.row, styles.rowPrimary)}>
                        {spriteNameInput}
                        <ToggleButtons
                            className={styles.visibilityToggle}
                            buttons={[{
                                handleClick: this.props.visible ?
                                    this.props.onClickNotVisible : this.props.onClickVisible,
                                icon: this.props.visible ? showIcon : hideIcon,
                                isSelected: this.props.visible && !this.props.disabled,
                                title: visibilityAction
                            }]}
                            disabled={this.props.disabled}
                        />
                    </div>
                    <div className={classNames(styles.row, styles.coordinates)}>
                        {xPosition}
                        {yPosition}
                        <Popover
                            body={
                                <div
                                    aria-label={moreProperties}
                                    className={styles.propertiesPopup}
                                    dir={isRtl(this.props.intl.locale) ? 'rtl' : 'ltr'}
                                    role="dialog"
                                    onKeyDown={this.handlePropertiesKeyDown}
                                >
                                    <Label
                                        secondary
                                        text={sizeLabel}
                                    >
                                        <BufferedInput
                                            autoFocus
                                            small
                                            disabled={this.props.disabled}
                                            type="number"
                                            value={Math.round(this.props.size)}
                                            onSubmit={this.props.onChangeSize}
                                        />
                                    </Label>
                                    <DirectionPicker
                                        inline
                                        direction={Math.round(this.props.direction)}
                                        disabled={this.props.disabled}
                                        rotationStyle={this.props.rotationStyle}
                                        onChangeDirection={this.props.onChangeDirection}
                                        onChangeRotationStyle={this.props.onChangeRotationStyle}
                                    />
                                </div>
                            }
                            className={styles.propertiesPopover}
                            isOpen={this.state.propertiesOpen && !this.props.disabled}
                            preferPlace="above"
                            onOuterAction={this.handleCloseProperties}
                        >
                            <button
                                ref={this.propertiesButton}
                                aria-label={moreProperties}
                                aria-expanded={this.state.propertiesOpen}
                                aria-haspopup="dialog"
                                className={styles.propertiesButton}
                                disabled={this.props.disabled}
                                title={moreProperties}
                                type="button"
                                onClick={this.handleToggleProperties}
                                onKeyDown={this.handlePropertiesKeyDown}
                            >
                                <img
                                    alt=""
                                    draggable={false}
                                    src={settingsIcon}
                                />
                            </button>
                        </Popover>
                    </div>
                </Box>
            );
        }

        return (
            <Box className={styles.spriteInfo}>
                <div className={classNames(styles.row, styles.rowPrimary)}>
                    <div className={styles.group}>
                        <Label
                            above={labelAbove}
                            text={sprite}
                        >
                            {spriteNameInput}
                        </Label>
                    </div>
                    {xPosition}
                    {yPosition}
                </div>
                <div className={classNames(styles.row, styles.rowSecondary)}>
                    <div className={labelAbove ? styles.column : styles.group}>
                        {
                            stageSize === STAGE_DISPLAY_SIZES.full || stageSize === STAGE_DISPLAY_SIZES.large ?
                                <Label
                                    secondary
                                    text={showLabel}
                                /> :
                                null
                        }
                        <ToggleButtons
                            buttons={[
                                {
                                    handleClick: this.props.onClickVisible,
                                    icon: showIcon,
                                    isSelected: this.props.visible && !this.props.disabled,
                                    title: this.props.intl.formatMessage(messages.showSpriteAction)
                                },
                                {
                                    handleClick: this.props.onClickNotVisible,
                                    icon: hideIcon,
                                    isSelected: !this.props.visible && !this.props.disabled,
                                    title: this.props.intl.formatMessage(messages.hideSpriteAction)
                                }
                            ]}
                            disabled={this.props.disabled}
                        />
                    </div>
                    <div className={classNames(styles.group, styles.largerInput)}>
                        <Label
                            secondary
                            above={labelAbove}
                            text={sizeLabel}
                        >
                            <BufferedInput
                                small
                                disabled={this.props.disabled}
                                label={sizeLabel}
                                tabIndex="0"
                                type="number"
                                value={this.props.disabled ? '' : Math.round(this.props.size)}
                                onSubmit={this.props.onChangeSize}
                            />
                        </Label>
                    </div>
                    <div className={classNames(styles.group, styles.largerInput)}>
                        <DirectionPicker
                            direction={Math.round(this.props.direction)}
                            disabled={this.props.disabled}
                            labelAbove={labelAbove}
                            rotationStyle={this.props.rotationStyle}
                            onChangeDirection={this.props.onChangeDirection}
                            onChangeRotationStyle={this.props.onChangeRotationStyle}
                        />
                    </div>
                </div>
            </Box>
        );
    }
}

SpriteInfo.propTypes = {
    direction: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ]),
    disabled: PropTypes.bool,
    intl: intlShape,
    name: PropTypes.string,
    onChangeDirection: PropTypes.func,
    onChangeName: PropTypes.func,
    onChangeRotationStyle: PropTypes.func,
    onChangeSize: PropTypes.func,
    onChangeX: PropTypes.func,
    onChangeY: PropTypes.func,
    onClickNotVisible: PropTypes.func,
    onClickVisible: PropTypes.func,
    rotationStyle: PropTypes.string,
    size: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ]),
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    targetId: PropTypes.string,
    visible: PropTypes.bool,
    x: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ]),
    y: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ])
};

export default injectIntl(SpriteInfo);
