/* eslint-disable react/jsx-no-bind */
import PropTypes from 'prop-types';
import React from 'react';
import SpriteSelectorItem from '../../containers/sprite-selector-item.jsx';
import Box from '../box/box.jsx';
import ActionMenu from '../action-menu/action-menu.jsx';
import FolderList from '../../containers/folder-list.jsx';
import DragConstants from '../../lib/drag-constants';

import styles from './selector.css';

const Selector = props => {
    const {
        buttons,
        dragType,
        isRtl,
        items,
        selectedItemIndex,
        onDrop,
        onDeleteClick,
        onDuplicateClick,
        onExportClick,
        onItemClick
    } = props;


    let newButtonSection = null;

    if (buttons.length > 0) {
        const {img, title, onClick} = buttons[0];
        const moreButtons = buttons.slice(1);
        newButtonSection = (
            <Box className={styles.newButtons}>
                <ActionMenu
                    img={img}
                    moreButtons={moreButtons}
                    title={title}
                    tooltipPlace={isRtl ? 'left' : 'right'}
                    onClick={onClick}
                />
            </Box>
        );
    }

    return (
        <Box
            className={styles.wrapper}
        >
            <Box className={styles.listArea}>
                <FolderList
                    kind={dragType}
                    items={items}
                    selectedId={selectedItemIndex}
                    assetMode
                    onDrop={onDrop}
                    renderItem={(item, index, depth, folderMenu) => (
                        <SpriteSelectorItem
                            asset={item.asset}
                            className={styles.listItem}
                            costumeURL={item.url}
                            details={item.details}
                            dragPayload={item.dragPayload}
                            dragType={dragType}
                            id={index}
                            index={index}
                            name={item.name}
                            fullName={item.fullName}
                            number={index + 1}
                            folderMenu={folderMenu}
                            selected={index === selectedItemIndex}
                            onClick={onItemClick}
                            onDeleteButtonClick={item.deletable === false ? null : onDeleteClick}
                            onDuplicateButtonClick={onDuplicateClick}
                            onExportButtonClick={onExportClick}
                        />
                    )}
                />
            </Box>
            {newButtonSection}
        </Box>
    );
};

Selector.propTypes = {
    buttons: PropTypes.arrayOf(PropTypes.shape({
        title: PropTypes.string.isRequired,
        img: PropTypes.string.isRequired,
        onClick: PropTypes.func
    })),
    dragType: PropTypes.oneOf(Object.keys(DragConstants)),
    isRtl: PropTypes.bool,
    items: PropTypes.arrayOf(PropTypes.shape({
        deletable: PropTypes.bool,
        url: PropTypes.string,
        name: PropTypes.string
    })),
    onDrop: PropTypes.func,
    onDeleteClick: PropTypes.func,
    onDuplicateClick: PropTypes.func,
    onExportClick: PropTypes.func,
    onItemClick: PropTypes.func.isRequired,
    selectedItemIndex: PropTypes.number.isRequired
};

export default Selector;
