/* eslint-disable react/jsx-no-bind */
import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import {MenuItem, MenuSection} from '../menu/menu.jsx';
import actions from '../../lib/editor-actions';
import messages from '../../lib/command-palette/messages';

const PaletteMenu = ({onClose}) => (
    <MenuSection>
        {[['targets', 'quick-open'], ['commands', 'command-palette'], ['symbols', 'find-symbol']].map(([mode, id]) => (
            <MenuItem
                key={id}
                onClick={() => {
                    onClose();
                    actions.execute(`builtin/${id}`);
                }}
            >
                <FormattedMessage {...messages[mode]} />
            </MenuItem>
        ))}
    </MenuSection>
);
PaletteMenu.propTypes = {onClose: PropTypes.func.isRequired};
export default PaletteMenu;
