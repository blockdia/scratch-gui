import React from 'react';
import PropTypes from 'prop-types';
import variable from '../../addons/addons/block-palette-icons/icons/variables_icon.svg';
import list from '../../addons/addons/block-palette-icons/icons/list_icon.svg';
import event from '../../addons/addons/block-palette-icons/icons/events_icon.svg';
import procedure from '../../addons/addons/block-palette-icons/icons/block_icon.svg';
import costume from '../../addons/addons/block-palette-icons/icons/looks_icon.svg';
import sound from '../../addons/addons/block-palette-icons/icons/sound_icon.svg';
import styles from './command-palette.css';

const icons = {variable, list, event, broadcast: event, procedure, costume, sound};
const SymbolIcon = ({kind, title}) => (
    <span
        aria-hidden="true"
        className={styles.symbolIcon}
        data-kind={kind}
        title={title}
    >
        <span style={{maskImage: `url("${icons[kind]}")`, WebkitMaskImage: `url("${icons[kind]}")`}} />
    </span>
);
SymbolIcon.propTypes = {kind: PropTypes.string.isRequired, title: PropTypes.string.isRequired};
export default SymbolIcon;
