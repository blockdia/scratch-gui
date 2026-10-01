import {defineMessages} from 'react-intl';

export default defineMessages({
    create: {id: 'blockdia.folders.create', defaultMessage: 'Create folder', description: 'Folder context menu'},
    rename: {id: 'blockdia.folders.rename', defaultMessage: 'Rename folder', description: 'Folder context menu'},
    dissolve: {id: 'blockdia.folders.dissolve',
        defaultMessage: 'Remove folder (keep contents)',
        description: 'Move folder contents up one level'},
    move: {id: 'blockdia.folders.move', defaultMessage: 'Move to {folder}', description: 'Folder destination'},
    root: {id: 'blockdia.folders.root', defaultMessage: 'Top level', description: 'Root folder destination'},
    name: {id: 'blockdia.folders.name', defaultMessage: 'Folder name', description: 'Folder name prompt'},
    invalid: {id: 'blockdia.folders.invalid',
        defaultMessage: 'Use a non-empty name without // or leading/trailing /.',
        description: 'Invalid folder name'},
    exists: {id: 'blockdia.folders.exists',
        defaultMessage: 'A folder with this name already exists here.',
        description: 'Folder name collision'}
});
