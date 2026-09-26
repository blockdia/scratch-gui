export default {
    editorOnly: true,
    name: 'Code checks',
    description: 'Find missing sprite references, possible waits in custom blocks running without screen refresh, ' +
        'and unused data.',
    credits: [{name: 'LuYifei2011'}],
    dynamicDisable: true,
    enabledByDefault: false,
    userscripts: [{url: 'userscript.js'}],
    userstyles: [{url: 'style.css'}],
    tags: [],
    settings: [
        {id: 'missing-target', name: 'Missing sprite references', type: 'boolean', default: true, dynamic: true},
        {id: 'warp-wait',
            name: 'Possible waits in custom blocks running without screen refresh',
            type: 'boolean',
            default: true,
            dynamic: true},
        {id: 'unused-data', name: 'Unused variables and lists', type: 'boolean', default: true, dynamic: true}
    ]
};
