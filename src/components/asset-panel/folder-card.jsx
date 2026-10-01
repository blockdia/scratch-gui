import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';
import FolderThumbnail, {getFolderPreview} from './folder-thumbnail.jsx';
import itemStyles from '../sprite-selector-item/sprite-selector-item.css';
import selectorStyles from './selector.css';
import styles from './folder-card.css';

const FolderCard = ({node, open, onToggle, dragging}) => {
    const handleClick = React.useCallback(() => onToggle(node.id), [onToggle, node.id]);
    const handleKeyDown = React.useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle(node.id);
        }
    }, [onToggle, node.id]);
    return (
        <div
            className={classNames(itemStyles.spriteSelectorItem, selectorStyles.listItem, styles.card, {
                [itemStyles.hoverable]: !dragging,
                [styles.hoverable]: !dragging
            })}
            role="treeitem"
            aria-expanded={open}
            tabIndex={0}
            title={node.id}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <div className={itemStyles.spriteImageOuter}>
                <div className={itemStyles.spriteImageInner}>
                    <FolderThumbnail
                        className={itemStyles.spriteImage}
                        loading="lazy"
                        preview={getFolderPreview(node, open)}
                    />
                </div>
            </div>
            <div className={itemStyles.spriteInfo}>
                <div className={itemStyles.spriteName}>{node.name}</div>
                <div className={itemStyles.spriteDetails}>
                    {open ? (
                        <FormattedMessage
                            id="blockdia.folders.close"
                            defaultMessage="Click to close"
                        />
                    ) : (
                        <FormattedMessage
                            id="blockdia.folders.open"
                            defaultMessage="Click to open"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
FolderCard.propTypes = {
    node: PropTypes.shape({id: PropTypes.string, name: PropTypes.string, children: PropTypes.array}).isRequired,
    open: PropTypes.bool,
    dragging: PropTypes.bool,
    onToggle: PropTypes.func
};
export default FolderCard;
