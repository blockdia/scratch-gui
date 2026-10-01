export default {
    editorOnly: true,
    noTranslations: true,
    dynamicDisable: true,
    enabledByDefault: false,
    name: 'Short names',
    description: 'Hide folder paths in selected name fields. When editing short names, ' +
        'renaming keeps the folder; entering a full path moves the item to that path. Lists always show short names.',
    tags: [],
    settings: [
        {id: 'spriteName', type: 'boolean', name: 'Sprite name field', default: true, dynamic: true},
        {id: 'costumeName', type: 'boolean', name: 'Costume and backdrop name field', default: true, dynamic: true},
        {id: 'soundName', type: 'boolean', name: 'Sound name field', default: true, dynamic: true},
        {
            id: 'editShortNames',
            type: 'boolean',
            name: 'Also show short names while editing name fields',
            default: true,
            dynamic: true
        }
    ]
};
