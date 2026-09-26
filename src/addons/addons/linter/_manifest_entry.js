import {RULE_DEFINITIONS} from './rules';

export default {
    editorOnly: true,
    name: 'Code checks',
    description: 'Check references, custom blocks, components, execution behavior and unused project data.',
    credits: [{name: 'LuYifei2011'}],
    dynamicDisable: true,
    enabledByDefault: false,
    userscripts: [{url: 'userscript.js'}],
    userstyles: [{url: 'style.css'}],
    tags: [],
    settings: RULE_DEFINITIONS.map(rule => ({id: rule.id,
        name: rule.name,
        type: 'boolean',
        default: rule.enabled,
        dynamic: true}))
};
