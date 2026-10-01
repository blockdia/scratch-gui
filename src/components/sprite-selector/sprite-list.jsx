import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import classNames from 'classnames';

import DragConstants from '../../lib/drag-constants';

import Box from '../box/box.jsx';
import SpriteSelectorItem from '../../containers/sprite-selector-item.jsx';
import ThrottledPropertyHOC from '../../lib/throttled-property-hoc.jsx';
import FolderList from '../../containers/folder-list.jsx';

import styles from './sprite-selector.css';

const ThrottledSpriteSelectorItem = ThrottledPropertyHOC('asset', 500)(SpriteSelectorItem);

const SpriteList = function (props) {
    const {
        containerRef,
        editingTarget,
        draggingType,
        hoveredTarget,
        onDeleteSprite,
        onDuplicateSprite,
        onExportSprite,
        onSelectSprite,
        raised,
        selectedId,
        items,
        gridLayout,
        onDrop
    } = props;

    const [searchQuery, setSearchQuery] = React.useState('');
    const listRef = React.useRef(null);
    const setListRef = React.useCallback(node => {
        listRef.current = node;
        if (containerRef) containerRef(node);
    }, [containerRef]);
    React.useEffect(() => {
        const node = listRef.current;
        const onSearch = event => setSearchQuery(String(event.detail || '').toLowerCase());
        node.addEventListener('blockdia:sprite-search', onSearch);
        return () => node.removeEventListener('blockdia:sprite-search', onSearch);
    }, []);

    const getHighlightState = sprite => {
        // If the sprite has just received a block drop, used for green highlight
        const receivedBlocks = (
            hoveredTarget.sprite === sprite.id &&
            sprite.id !== editingTarget &&
            hoveredTarget.receivedBlocks
        );

        // If the sprite is indicating it can receive block dropping, used for blue highlight
        let isRaised = !receivedBlocks && raised && sprite.id !== editingTarget;

        // A sprite is also raised if a costume or sound is being dragged.
        // Note the absence of the self-sharing check: a sprite can share assets with itself.
        // This is a quirk of 2.0, but seems worth leaving possible, it
        // allows quick (albeit unusual) duplication of assets.
        isRaised = isRaised || [
            DragConstants.COSTUME,
            DragConstants.SOUND,
            DragConstants.BACKPACK_COSTUME,
            DragConstants.BACKPACK_SOUND,
            DragConstants.BACKPACK_CODE].includes(draggingType);

        return {receivedBlocks, isRaised};
    };

    const renderTreeSprite = (sprite, index, depth, folderMenu) => {
        const {receivedBlocks, isRaised} = getHighlightState(sprite);
        return (
            <ThrottledSpriteSelectorItem
                asset={sprite.costume && sprite.costume.asset}
                className={classNames({
                    [styles.sprite]: gridLayout,
                    [styles.raised]: isRaised,
                    [styles.receivedBlocks]: receivedBlocks
                })}
                dragPayload={sprite.id}
                dragType={DragConstants.SPRITE}
                id={sprite.id}
                index={index}
                folderMenu={folderMenu}
                name={sprite.name}
                fullName={sprite.fullName}
                selected={sprite.id === selectedId}
                treeDepth={gridLayout ? null : depth}
                onClick={onSelectSprite}
                onDeleteButtonClick={onDeleteSprite}
                onDuplicateButtonClick={onDuplicateSprite}
                onExportButtonClick={onExportSprite}
            />
        );
    };

    return (
        <Box
            className={classNames(styles.scrollWrapper, {
                [styles.scrollWrapperDragging]: draggingType === DragConstants.BACKPACK_SPRITE
            })}
            componentRef={setListRef}
            data-sprite-list="true"
        >
            <FolderList
                kind={DragConstants.SPRITE}
                grid={gridLayout}
                items={items}
                selectedId={selectedId}
                query={searchQuery}
                renderItem={renderTreeSprite} // eslint-disable-line react/jsx-no-bind
                onDrop={onDrop}
            />
        </Box>
    );
};

SpriteList.propTypes = {
    containerRef: PropTypes.func,
    draggingType: PropTypes.oneOf(Object.keys(DragConstants)),
    editingTarget: PropTypes.string,
    hoveredTarget: PropTypes.shape({
        hoveredSprite: PropTypes.string,
        receivedBlocks: PropTypes.bool,
        sprite: PropTypes.string
    }),
    items: PropTypes.arrayOf(PropTypes.shape({
        costume: PropTypes.shape({
            url: PropTypes.string,
            name: PropTypes.string.isRequired,
            bitmapResolution: PropTypes.number.isRequired,
            rotationCenterX: PropTypes.number.isRequired,
            rotationCenterY: PropTypes.number.isRequired
        }),
        name: PropTypes.string,
        order: PropTypes.number.isRequired
    })),
    onDrop: PropTypes.func,
    onDeleteSprite: PropTypes.func,
    onDuplicateSprite: PropTypes.func,
    onExportSprite: PropTypes.func,
    onSelectSprite: PropTypes.func,
    raised: PropTypes.bool,
    selectedId: PropTypes.string,
    gridLayout: PropTypes.bool
};

export default connect(state => ({draggingType: state.scratchGui.assetDrag.dragType}))(SpriteList);
