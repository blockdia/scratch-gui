// This registry is shared by the analyzer, addon settings and Problems panel.
const rule = (id, type, name, enabled = true, severity = 'warning') =>
    ({id, type, name, enabled, severity});
export const RULE_DEFINITIONS = [
    rule('missing-target', 'reference', 'Missing sprite references'),
    rule('warp-wait', 'execution', 'Possible waits in custom blocks running without screen refresh'),
    rule('unused-data', 'cleanup', 'Unused variables and lists', true, 'info'),
    rule('missing-costume', 'reference', 'Missing costume or backdrop references'),
    rule('missing-sound', 'reference', 'Missing sound references'),
    rule('invalid-data', 'reference', 'Invalid variable or list references'),
    rule('invalid-property', 'reference', 'Invalid sprite or stage properties'),
    rule('invalid-procedure', 'reference', 'Invalid custom block definitions or calls'),
    rule('invalid-argument', 'reference', 'Invalid custom block parameters or returns'),
    rule('invalid-component', 'reference', 'Invalid component operations'),
    rule('invalid-graph', 'reference', 'Broken block connections'),
    rule('broadcast-flow', 'execution', 'Unmatched broadcasts and receivers', false, 'info'),
    rule('unused-procedure', 'cleanup', 'Custom blocks without callers', false, 'info'),
    rule('write-only-data', 'cleanup', 'Data written but not read', false, 'info'),
    rule('constant-control', 'execution', 'Fixed conditions and empty blocks', false, 'info'),
    rule('unreachable-code', 'execution', 'Blocks that execution cannot reach', false, 'info'),
    rule('nonterminating-control', 'execution', 'Constant waits or loops that cannot finish', false, 'info'),
    rule('numeric-result', 'execution', 'Calculations producing infinity or an invalid number', false, 'info'),
    rule('unused-resource', 'cleanup', 'Resources without visible uses', false, 'info')
];
export const RULES = RULE_DEFINITIONS.map(item => item.id);
export const DEFAULT_RULES = RULE_DEFINITIONS.filter(item => item.enabled).map(item => item.id);
export const RULE_BY_ID = new Map(RULE_DEFINITIONS.map(item => [item.id, item]));
