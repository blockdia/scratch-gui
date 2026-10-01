const folder = (id, name, open, children) => ({
    type: 'folder',
    id,
    name,
    open,
    children
});

const slot = index => ({
    type: 'sprite',
    slot: index
});

// Mock folder layout for previewing the nested sprite list. Each `slot` maps to the
// sprite at that position in the real sprite list, or a placeholder when missing.
const MOCK_LAYOUT = [
    folder('mock-folder-player', '玩家', true, [
        slot(0),
        slot(1),
        folder('mock-folder-weapons', '武器', true, [slot(2), slot(3)])
    ]),
    folder('mock-folder-enemies', '敌人', false, [
        slot(4),
        folder('mock-folder-boss', 'Boss', false, [slot(5), slot(6)])
    ]),
    folder('mock-folder-empty', '空文件夹', true, []),
    slot(7),
    slot(8)
];

const countSlots = nodes => nodes.reduce(
    (max, node) => Math.max(max, node.type === 'folder' ? countSlots(node.children) : node.slot + 1),
    0
);

const MOCK_SLOT_COUNT = countSlots(MOCK_LAYOUT);

const resolveNodes = (nodes, items) => nodes.map(node => {
    if (node.type === 'folder') {
        return {...node, children: resolveNodes(node.children, items)};
    }
    const sprite = items[node.slot] || {
        id: `mock-sprite-${node.slot}`,
        name: `示例角色 ${node.slot + 1}`,
        fake: true
    };
    return {type: 'sprite', sprite};
});

// Sprites beyond the mock slots are appended at the root so none are hidden.
const buildMockSpriteTree = items => [
    ...resolveNodes(MOCK_LAYOUT, items),
    ...items.slice(MOCK_SLOT_COUNT).map(sprite => ({type: 'sprite', sprite}))
];

export {buildMockSpriteTree};
