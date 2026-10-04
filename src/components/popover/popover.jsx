import React from 'react';
import PropTypes from 'prop-types';
import ReactPopover from 'react-popover';

const noop = () => {};

// Keep react-popover's positioning and DOM structure, but observe outside actions
// before Blockly (or another editor) can stop them from bubbling to document.
const Popover = props => {
    const popover = React.useRef(null);
    const {isOpen, onOuterAction} = props;
    React.useEffect(() => {
        if (!isOpen || !onOuterAction) return;
        // react-popover 0.5 exposes these DOM nodes on its instance. Keeping this
        // adapter here avoids extra wrappers that would change flex layout or refs.
        const instance = popover.current;
        const ownerDocument = instance.targetEl.ownerDocument;
        const onOutsidePointer = event => {
            const {targetEl, containerEl} = instance;
            const contains = node => node && node.contains(event.target);
            if (contains(targetEl) || contains(containerEl)) return;

            // Commit buffered fields before closing; removing a focused input
            // does not reliably fire blur. The direction input lives in targetEl.
            const activeElement = ownerDocument.activeElement;
            if (activeElement && (targetEl.contains(activeElement) ||
                (containerEl && containerEl.contains(activeElement)))) {
                activeElement.blur();
            }
            onOuterAction(event);
        };
        ownerDocument.addEventListener('mousedown', onOutsidePointer, true);
        ownerDocument.addEventListener('touchstart', onOutsidePointer, true);
        return () => {
            ownerDocument.removeEventListener('mousedown', onOutsidePointer, true);
            ownerDocument.removeEventListener('touchstart', onOutsidePointer, true);
        };
    }, [isOpen, onOuterAction]);
    return (
        <ReactPopover
            {...props}
            ref={popover}
            onOuterAction={noop}
        />
    );
};

Popover.propTypes = {
    isOpen: PropTypes.bool,
    onOuterAction: PropTypes.func
};

export default Popover;
