import adapter from 'scratch-vm/src/engine/adapter';

/**
 * Synchronize shadows synthesized during a successful workspace load.
 * Hidden shadows live in connection DOM, not workspace.getAllBlocks().
 * @param {object} Blockly Scratch Blocks API.
 * @param {object} workspace Loaded workspace.
 * @param {object} target Original VM target.
 */
export default function hydrateWorkspaceShadows (Blockly, workspace, target) {
    if (!target) return;
    for (const block of workspace.getAllBlocks(false)) {
        for (const input of block.inputList) {
            const connection = input.connection;
            if (!connection) continue;
            const child = connection.targetBlock();
            if (child && child.isShadow()) continue;
            const shadow = connection.getShadowDom();
            if (!shadow) continue;
            for (const node of [shadow, ...Array.from(shadow.getElementsByTagName('shadow'))]) {
                if (!node.getAttribute('id')) node.setAttribute('id', Blockly.utils.genUid());
            }
            connection.setShadowDom(shadow);
        }
    }
    const dom = Blockly.Xml.workspaceToDom(workspace);
    const snapshot = new Map();
    for (const node of Array.from(dom.children)) {
        if (node.tagName.toLowerCase() !== 'block' && node.tagName.toLowerCase() !== 'shadow') continue;
        for (const block of adapter({xml: node})) snapshot.set(block.id, block);
    }
    const blocks = target.blocks._blocks;
    const additions = new Map();
    const inputs = new Map();
    const exists = id => Object.prototype.hasOwnProperty.call(blocks, id) || additions.has(id);
    // Stage complete shadow trees, independently of ID/property enumeration
    // order. Unsupported trees are left intact in Blockly, never half imported.
    const collect = (id, parentId) => {
        const tree = new Map();
        const pending = [{id, parentId}];
        while (pending.length) {
            const current = pending.pop();
            const block = snapshot.get(current.id);
            if (!block || !block.shadow || block.parent !== current.parentId || block.next ||
                exists(block.id) || tree.has(block.id)) return null;
            tree.set(block.id, block);
            for (const input of Object.values(block.inputs)) {
                for (const child of new Set([input.block, input.shadow].filter(Boolean))) {
                    pending.push({id: child, parentId: block.id});
                }
            }
        }
        return tree;
    };
    for (const source of snapshot.values()) {
        if (!Object.prototype.hasOwnProperty.call(blocks, source.id)) continue;
        const parent = blocks[source.id];
        for (const [name, input] of Object.entries(source.inputs)) {
            if (!input.shadow || exists(input.shadow)) continue;
            const existing = parent.inputs[name];
            if (existing && (existing.shadow || (existing.block && existing.block !== input.block))) continue;
            if (input.block !== input.shadow && !Object.prototype.hasOwnProperty.call(blocks, input.block)) continue;
            const tree = collect(input.shadow, parent.id);
            if (!tree) continue;
            for (const [id, block] of tree) additions.set(id, block);
            if (!inputs.has(parent.id)) inputs.set(parent.id, {...parent.inputs});
            inputs.get(parent.id)[name] = {...input};
        }
    }
    if (!additions.size) return;
    for (const [id, block] of additions) blocks[id] = block;
    for (const [id, value] of inputs) blocks[id].inputs = value;
    target.blocks.resetCache();
}
