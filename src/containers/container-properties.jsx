/* eslint-disable react/jsx-no-bind */
import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Popover from 'react-popover';
import {injectIntl, intlShape, FormattedMessage} from 'react-intl';
import {isRtl} from '@turbowarp/scratch-l10n';
import Input from '../components/forms/input.jsx';
import Label from '../components/forms/label.jsx';
import BufferedInputHOC from '../components/forms/buffered-input-hoc.jsx';
import DirectionPicker from './direction-picker.jsx';
import messages from '../lib/folders/messages';
import treeStyles from '../components/sprite-selector/sprite-tree.css';
import infoStyles from '../components/sprite-info/sprite-info.css';
import settingsIcon from '../components/stage-header/icon--settings.svg';

const BufferedInput = BufferedInputHOC(Input);
const defaults = {x: 0, y: 0, size: 100, direction: 90, rotationStyle: 'all around'};
const stopPropagation = event => event.stopPropagation();

const ContainerProperties = ({vm, path, container, disabled, intl}) => {
    const [open, setOpen] = React.useState(false);
    const button = React.useRef(null);
    const popup = React.useRef(null);
    const cancelled = React.useRef(false);
    const close = React.useCallback(() => setOpen(false), []);
    React.useEffect(() => {
        close();
    }, [vm, path, close]);
    React.useEffect(() => {
        if (disabled || !container) close();
    }, [disabled, Boolean(container), close]);
    React.useEffect(() => {
        if (!open) return;
        const ownerDocument = button.current.ownerDocument;
        const onOutsidePointer = event => {
            if (button.current.contains(event.target) || (popup.current && popup.current.contains(event.target))) {
                return;
            }
            // Flush buffered inputs before unmounting. Capture also reaches clicks handled by Blockly.
            if (popup.current && popup.current.contains(ownerDocument.activeElement)) {
                ownerDocument.activeElement.blur();
            }
            close();
        };
        ownerDocument.addEventListener('mousedown', onOutsidePointer, true);
        ownerDocument.addEventListener('touchstart', onOutsidePointer, true);
        return () => {
            ownerDocument.removeEventListener('mousedown', onOutsidePointer, true);
            ownerDocument.removeEventListener('touchstart', onOutsidePointer, true);
        };
    }, [open, close]);
    const toggle = event => {
        event.stopPropagation();
        cancelled.current = false;
        setOpen(value => !value);
    };
    const keyDown = event => {
        event.stopPropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            cancelled.current = true;
            close();
            button.current.focus();
        }
    };
    const submit = (key, value) => {
        if (!cancelled.current) vm.setSpriteContainerTransform(path, {[key]: value});
    };
    if (!container) return null;
    const transform = {...defaults, ...container.transform};
    const title = intl.formatMessage(messages.properties);
    const sizeLabel = (<FormattedMessage
        id="gui.SpriteInfo.size"
        defaultMessage="Size"
        description="Sprite info size label"
    />);
    return (
        <Popover
            body={<div
                ref={popup}
                role="dialog"
                data-container-properties-popup={path}
                className={infoStyles.propertiesPopup}
                dir={isRtl(intl.locale) ? 'rtl' : 'ltr'}
                onClick={stopPropagation}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onContextMenu={stopPropagation}
                onKeyDown={keyDown}
            >
                {['x', 'y'].map(key => (<Label
                    key={key}
                    text={key}
                >
                    <BufferedInput
                        autoFocus={key === 'x'}
                        small
                        type="number"
                        name={key}
                        value={Math.round(transform[key])}
                        onSubmit={value => submit(key, value)}
                    />
                </Label>))}
                <Label
                    secondary
                    text={sizeLabel}
                >
                    <BufferedInput
                        small
                        type="number"
                        value={Math.round(transform.size)}
                        onSubmit={value => submit('size', value)}
                    />
                </Label>
                <DirectionPicker
                    inline
                    direction={Math.round(transform.direction)}
                    disabled={false}
                    rotationStyle={transform.rotationStyle}
                    onChangeDirection={value => submit('direction', value)}
                    onChangeRotationStyle={value => submit('rotationStyle', value)}
                />
            </div>}
            className={infoStyles.propertiesPopover}
            isOpen={open && !disabled}
            preferPlace="above"
            onOuterAction={close}
        >
            <button
                ref={button}
                type="button"
                className={classNames(treeStyles.visibilityButton, treeStyles.propertiesButton)}
                data-container-properties={path}
                title={title}
                aria-expanded={open}
                aria-haspopup="dialog"
                disabled={disabled}
                onClick={toggle}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onKeyDown={event => {
                    keyDown(event);
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!event.repeat) toggle(event);
                    }
                }}
            >
                <img
                    src={settingsIcon}
                    alt=""
                    draggable={false}
                />
            </button>
        </Popover>
    );
};

ContainerProperties.propTypes = {
    vm: PropTypes.object.isRequired,
    path: PropTypes.string.isRequired,
    container: PropTypes.shape({transform: PropTypes.object}),
    disabled: PropTypes.bool,
    intl: intlShape.isRequired
};

export {ContainerProperties};
export default injectIntl(ContainerProperties);
