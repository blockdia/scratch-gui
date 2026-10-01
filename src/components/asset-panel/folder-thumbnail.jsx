import React from 'react';
import PropTypes from 'prop-types';
import getCostumeUrl from '../../lib/get-costume-url';
import folderIcon from './folder.svg';
import soundIconSource from '!raw-loader!./icon--sound.svg';

const svgUrl = source => `data:image/svg+xml;utf8,${encodeURIComponent(source)}`;
const soundIcon = svgUrl(soundIconSource);
const escapeAttribute = value => value.replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

const previewItems = nodes => nodes.reduce((items, node) => (items.length >= 4 ? items :
    items.concat(node.type === 'folder' ? previewItems(node.children) : [node.sprite]).slice(0, 4)), []);

export const getFolderPreview = (node, open) => ({open,
    urls: open ? [] : previewItems(node.children).map(item => {
        const asset = item.asset || (item.costume && item.costume.asset);
        return asset ? getCostumeUrl(asset) : (item.url ? soundIcon : null);
    })
        .filter(Boolean)});

export const getFolderPreviewUrl = preview => {
    if (preview.open) return folderIcon;
    const images = preview.urls.slice(0, 4).map((url, index) => (
        `<image width="40" height="40" x="${(index % 2) * 40}" y="${Math.floor(index / 2) * 40}" ` +
        `href="${escapeAttribute(url)}"/>`
    ))
        .join('');
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">${images}</svg>`);
};

// Preserve the original image's intrinsic size so the card, compact editor and
// drag layer can each apply their existing image size and hover rules.
const FolderThumbnail = ({preview, className, loading}) => {
    const src = React.useMemo(() => getFolderPreviewUrl(preview), [preview]);
    return (<img
        className={className}
        src={src}
        loading={loading}
        draggable={false}
        alt=""
    />);
};

FolderThumbnail.propTypes = {
    className: PropTypes.string,
    loading: PropTypes.string,
    preview: PropTypes.shape({open: PropTypes.bool, urls: PropTypes.arrayOf(PropTypes.string)}).isRequired
};
export default FolderThumbnail;
