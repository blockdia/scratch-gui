import React from 'react';
import PropTypes from 'prop-types';
import FolderThumbnail from '../asset-panel/folder-thumbnail.jsx';
import styles from './drag-layer.css';

/* eslint no-confusing-arrow: ["error", {"allowParens": true}] */
const DragLayer = ({dragging, img, folderPreview, currentOffset}) => (dragging && currentOffset ? (
    <div className={styles.dragLayer}>
        <div
            className={styles.imageWrapper}
            style={{
                transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`
            }}
        >
            {folderPreview ? <FolderThumbnail
                className={styles.image}
                preview={folderPreview}
            /> : <img
                className={styles.image}
                src={img}
                draggable={false}
            />}
        </div>
    </div>
) : null);

DragLayer.propTypes = {
    currentOffset: PropTypes.shape({
        x: PropTypes.number.isRequired,
        y: PropTypes.number.isRequired
    }),
    dragging: PropTypes.bool.isRequired,
    folderPreview: PropTypes.shape({open: PropTypes.bool, urls: PropTypes.arrayOf(PropTypes.string)}),
    img: PropTypes.string
};

export default DragLayer;
