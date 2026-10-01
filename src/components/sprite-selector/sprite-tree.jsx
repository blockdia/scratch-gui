import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from './sprite-tree.css';

const collectOpenState = (nodes, state = {}) => {
    nodes.forEach(node => {
        if (node.type === 'folder') {
            state[node.id] = node.open;
            collectOpenState(node.children, state);
        }
    });
    return state;
};

const countSprites = nodes => nodes.reduce(
    (total, node) => total + (node.type === 'folder' ? countSprites(node.children) : 1),
    0
);

const containsSprite = (nodes, id) => nodes.some(node => (
    node.type === 'folder' ? containsSprite(node.children, id) : node.sprite.id === id
));

const Guides = ({depth}) => Array.from({length: depth}, (_, i) => (
    <span
        className={styles.guide}
        key={i}
    />
));

Guides.propTypes = {depth: PropTypes.number.isRequired};

const FolderIcon = ({open}) => (
    <svg
        className={styles.folderIcon}
        viewBox="0 0 24 24"
    >
        <path
            d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3c.4 0 .8.2 1.1.5L11 7h6.5A1.5 1.5 0 0 1 19 8.5V17H3z"
            opacity="0.55"
        />
        <path
            d={open ?
                'M6 10h16.2a.8.8 0 0 1 .77 1.02l-1.9 6.5A1.5 1.5 0 0 1 19.6 18.6H4.5A1.5 1.5 0 0 1 3 17.1z' :
                'M3 9.5A1.5 1.5 0 0 1 4.5 8h15A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z'}
        />
    </svg>
);

FolderIcon.propTypes = {open: PropTypes.bool};

const Chevron = ({open}) => (
    <svg
        className={classNames(styles.chevron, {[styles.chevronOpen]: open})}
        viewBox="0 0 12 12"
    >
        <path
            d="M4 2.5l4 3.5-4 3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
        />
    </svg>
);

Chevron.propTypes = {open: PropTypes.bool};

const FolderRow = function ({depth, hasSelection, id, name, onToggle, open, spriteCount}) {
    const handleClick = React.useCallback(() => onToggle(id), [onToggle, id]);
    const handleKeyDown = React.useCallback(e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(id);
        }
    }, [onToggle, id]);
    return (
        <div
            aria-expanded={open}
            className={classNames(styles.row, styles.folderRow, {
                [styles.hasSelection]: hasSelection
            })}
            role="treeitem"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <Guides depth={depth} />
            <span className={styles.chevronSlot}>
                <Chevron open={open} />
            </span>
            <FolderIcon open={open} />
            <span className={styles.name}>{name}</span>
            <span className={styles.count}>{spriteCount}</span>
        </div>
    );
};

FolderRow.propTypes = {
    depth: PropTypes.number.isRequired,
    hasSelection: PropTypes.bool,
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    onToggle: PropTypes.func.isRequired,
    open: PropTypes.bool,
    spriteCount: PropTypes.number.isRequired
};

const SpriteTree = function ({tree, selectedId, renderSprite}) {
    const [openState, setOpenState] = React.useState(() => collectOpenState(tree));

    const toggle = React.useCallback(id => setOpenState(prev => ({...prev, [id]: !prev[id]})), []);

    const renderNodes = (nodes, depth) => nodes.map(node => {
        if (node.type === 'sprite') {
            return node.sprite.fake ? (
                <div
                    className={classNames(styles.row, styles.fakeRow)}
                    key={node.sprite.id}
                    role="treeitem"
                >
                    <Guides depth={depth} />
                    <span className={styles.chevronSlot} />
                    <span className={styles.fakeThumb} />
                    <span className={styles.name}>{node.sprite.name}</span>
                </div>
            ) : (
                <React.Fragment key={node.sprite.id}>
                    {renderSprite(node.sprite, depth)}
                </React.Fragment>
            );
        }

        const open = Boolean(openState[node.id]);
        const hasSelection = !open && containsSprite(node.children, selectedId);
        return (
            <div
                key={node.id}
                role="none"
            >
                <FolderRow
                    depth={depth}
                    hasSelection={hasSelection}
                    id={node.id}
                    name={node.name}
                    open={open}
                    spriteCount={countSprites(node.children)}
                    onToggle={toggle}
                />
                {open ? (
                    <div role="group">
                        {node.children.length === 0 ? (
                            <div className={classNames(styles.row, styles.emptyRow)}>
                                <Guides depth={depth + 1} />
                                <span className={styles.chevronSlot} />
                                <span className={styles.name}>{'(空)'}</span>
                            </div>
                        ) : renderNodes(node.children, depth + 1)}
                    </div>
                ) : null}
            </div>
        );
    });

    return (
        <div
            className={styles.tree}
            role="tree"
        >
            {renderNodes(tree, 0)}
        </div>
    );
};

SpriteTree.propTypes = {
    renderSprite: PropTypes.func.isRequired,
    selectedId: PropTypes.string,
    tree: PropTypes.arrayOf(PropTypes.object).isRequired // eslint-disable-line react/forbid-prop-types
};

export default SpriteTree;
