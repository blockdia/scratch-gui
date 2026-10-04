import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from './sprite-tree.css';
import assetStyles from '../asset-panel/selector.css';
import {splitName, folderColor, isWithin, joinName} from '../../lib/folders';
import FolderCard from '../asset-panel/folder-card.jsx';
import TWRenderRecoloredImage from '../../lib/tw-recolor/render.jsx';
import showIcon from '!../../lib/tw-recolor/build!../sprite-info/icon--show.svg';
import hideIcon from '!../../lib/tw-recolor/build!../sprite-info/icon--hide.svg';

const stopPropagation = event => event.stopPropagation();

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

const FolderIcon = ({open, container, label}) => (
    <svg
        className={styles.folderIcon}
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        {label ? <title>{label}</title> : null}
        {container ? <React.Fragment>
            <path d="M12 4L21 8 12 12 3 8z" />
            <path
                d="M3 10l8 3.5V21l-8-4z"
                opacity="0.55"
            />
            <path d="M13 13.5l8-3.5V17l-8 4z" />
        </React.Fragment> : <React.Fragment>
            <path
                d="M3 5.5A1.5 1.5 0 0 1 4.5 4h4.3c.4 0 .8.2 1.1.5L11 6h6.5A1.5 1.5 0 0 1 19 7.5V19H3z"
                opacity="0.55"
            />
            <path
                d={open ?
                    'M6 9h15.2a.8.8 0 0 1 .77 1.02l-1.9 9.5A1.5 1.5 0 0 1 18.6 20.6H4.5A1.5 1.5 0 0 1 3 19.1z' :
                    'M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v11' +
                    'a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z'}
            />
        </React.Fragment>}
    </svg>
);

FolderIcon.propTypes = {open: PropTypes.bool, container: PropTypes.bool, label: PropTypes.string};

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

const FolderRow = function ({depth, hasSelection, id, name, onToggle, open, spriteCount, dragging,
    container, hidden, label, visibilityLabel, onToggleVisibility, renderContainerProperties}) {
    const handleClick = React.useCallback(() => onToggle(id), [onToggle, id]);
    const handleKeyDown = React.useCallback(e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(id);
        }
    }, [onToggle, id]);
    const handleToggleVisibility = React.useCallback(event => {
        event.stopPropagation();
        onToggleVisibility(id);
    }, [onToggleVisibility, id]);
    const handleVisibilityKeyDown = React.useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            // The VM's document keyup handler suppresses native space activation.
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) onToggleVisibility(id);
        }
    }, [onToggleVisibility, id]);
    return (
        <div
            aria-expanded={open}
            className={classNames(styles.row, styles.folderRow, {
                [styles.hoverable]: !dragging,
                [styles.hasSelection]: hasSelection,
                [styles.hiddenContainer]: hidden
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
            <FolderIcon
                open={open}
                container={container}
                label={label}
            />
            <span className={styles.name}>{name}</span>
            {container ? <button
                type="button"
                className={styles.visibilityButton}
                title={visibilityLabel}
                aria-pressed={!hidden}
                disabled={dragging}
                onClick={handleToggleVisibility}
                onKeyDown={handleVisibilityKeyDown}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
            >
                <TWRenderRecoloredImage
                    src={hidden ? hideIcon : showIcon}
                    alt=""
                    draggable={false}
                />
            </button> : null}
            {container && renderContainerProperties ? renderContainerProperties(id) : null}
            <span className={styles.count}>{spriteCount}</span>
        </div>
    );
};

FolderRow.propTypes = {
    renderContainerProperties: PropTypes.func,
    container: PropTypes.bool,
    hidden: PropTypes.bool,
    label: PropTypes.string,
    visibilityLabel: PropTypes.string,
    onToggleVisibility: PropTypes.func,
    depth: PropTypes.number.isRequired,
    dragging: PropTypes.bool,
    hasSelection: PropTypes.bool,
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    onToggle: PropTypes.func.isRequired,
    open: PropTypes.bool,
    spriteCount: PropTypes.number.isRequired
};

const matchesQuery = (node, query) => (node.type === 'folder' ?
    node.name.toLowerCase().includes(query) || node.children.some(child => matchesQuery(child, query)) :
    node.sprite.name.toLowerCase().includes(query));

const SpriteTree = function ({grid, assetMode, tree, selectedId, renderSprite,
    renderFolder, renderContainerProperties, onActiveFolderChange, onToggleContainerVisibility,
    folderTransition, dragPreview,
    dragging, dropPath, query = ''}) {
    const [openState, setOpenState] = React.useState(() => collectOpenState(tree));
    const findSelected = nodes => {
        for (const node of nodes) {
            if (node.type === 'sprite' && node.sprite.id === selectedId) return node.sprite.fullName || '';
            if (node.type === 'folder' && containsSprite(node.children, selectedId)) return findSelected(node.children);
        }
        return '';
    };
    const selectedName = findSelected(tree);
    const selectedPath = splitName(selectedName, !assetMode).folder;
    // Asset indices change when a whole folder moves; that is not a new selection.
    const selectedKey = assetMode ? selectedName : selectedId;
    React.useEffect(() => {
        if (!folderTransition) return;
        const {source, destination} = folderTransition;
        setOpenState(previous => {
            const next = {};
            Object.keys(previous).forEach(path => {
                if (isWithin(path, source)) {
                    // Dissolving a child must not overwrite its parent's state.
                    if (path === source && destination === splitName(source).folder) return;
                    const renamed = path === source ? destination :
                        joinName(destination, path.slice(source.length + 2));
                    if (renamed) next[renamed] = previous[path];
                } else next[path] = previous[path];
            });
            return next;
        });
    }, [folderTransition]);
    const previousSelection = React.useRef({id: selectedId, path: selectedPath});
    React.useEffect(() => {
        const selection = previousSelection.current;
        previousSelection.current = {id: selectedId, path: selectedPath};
        if (!selectedPath) return;
        if (folderTransition && selectedId === selection.id && isWithin(selection.path, folderTransition.source)) {
            const {source, destination} = folderTransition;
            const renamed = selection.path === source ? destination :
                joinName(destination, selection.path.slice(source.length + 2));
            if (selectedPath === renamed) return;
        }
        const ancestors = {};
        const parts = selectedPath.split('//');
        parts.forEach((part, index) => {
            ancestors[parts.slice(0, index + 1).join('//')] = true;
        });
        setOpenState(previous => ({...previous, ...ancestors}));
    }, [selectedKey, selectedPath]);

    // The selected item's deepest visible folder is the insertion destination.
    // Opening an unrelated folder must not redirect newly imported assets.
    React.useEffect(() => {
        if (!onActiveFolderChange) return;
        let active = '';
        if (selectedPath) {
            for (const part of selectedPath.split('//')) {
                const path = joinName(active, part);
                if (!openState[path]) break;
                active = path;
            }
        }
        onActiveFolderChange(active);
    }, [selectedPath, openState, onActiveFolderChange]);

    const toggle = id => {
        const open = !openState[id];
        setOpenState(prev => ({...prev, [id]: open}));
    };

    const sourceClasses = key => ({
        [styles.dragSource]: dragPreview && dragPreview.sourceKey === key && !dragPreview.placement,
        [styles.dragSourceHidden]: dragPreview && dragPreview.sourceKey === key && dragPreview.placement
    });
    const renderShadow = (key, position, depth) => {
        if (!dragPreview || !dragPreview.placement || dragPreview.placement.key !== key ||
            dragPreview.placement.position !== position) return null;
        return (<div
            aria-hidden="true"
            data-folder-placeholder={`${position}:${key}`}
            className={classNames(styles.placeholder, {
                [styles.gridCell]: grid && !dragPreview.isFolder,
                [styles.folderBlock]: grid && dragPreview.isFolder
            })}
            style={!grid && !assetMode ? {paddingInlineStart: depth * 16} : null}
        >
            <div
                className={classNames(styles.placeholderShape, {
                    [assetStyles.listItem]: assetMode,
                    [styles.placeholderCard]: grid && !dragPreview.isFolder,
                    [styles.placeholderRow]: !assetMode && (!grid || dragPreview.isFolder)
                })}
            />
        </div>);
    };

    const renderNodes = (nodes, depth, filter = query) => nodes.map(node => {
        if (filter && !matchesQuery(node, filter)) return null;
        if (node.type === 'sprite') {
            const key = `item:${node.sprite.index}`;
            return (
                <React.Fragment key={node.sprite.id}>
                    {renderShadow(key, 'before', depth)}
                    <div
                        className={classNames({[styles.gridCell]: grid,
                            [styles.dropTarget]: dropPath === key,
                            ...sourceClasses(key)})}
                        role="treeitem"
                        data-folder-entry={splitName(node.sprite.fullName || node.sprite.name, !assetMode).folder}
                        data-item-index={node.sprite.index}
                        data-drop-key={key}
                        style={assetMode ? {
                            '--folder-color': folderColor(splitName(node.sprite.fullName, false).folder)
                        } : null}
                    >
                        {renderSprite(node.sprite, depth)}
                    </div>
                    {renderShadow(key, 'after', depth)}
                </React.Fragment>
            );
        }

        const open = Boolean(query) || Boolean(openState[node.id]);
        const previewInside = dragPreview && dragPreview.placement && dragPreview.placement.key === node.id &&
            dragPreview.placement.position.startsWith('inside-');
        const hasSelection = !open && containsSprite(node.children, selectedId);
        const row = assetMode ? (
            <FolderCard
                node={node}
                dragging={dragging}
                open={open}
                onToggle={toggle} // eslint-disable-line react/jsx-no-bind
                hasSelection={hasSelection}
            />
        ) : (
            <FolderRow
                container={node.container}
                hidden={node.hidden}
                label={node.label}
                visibilityLabel={node.visibilityLabel}
                onToggleVisibility={onToggleContainerVisibility}
                renderContainerProperties={renderContainerProperties}
                depth={grid ? 0 : depth}
                dragging={dragging}
                hasSelection={hasSelection}
                id={node.id}
                name={node.name}
                open={open}
                spriteCount={countSprites(node.children)}
                onToggle={toggle} // eslint-disable-line react/jsx-no-bind
            />
        );
        return (
            <React.Fragment key={node.id}>
                {renderShadow(node.id, 'before', depth)}
                <div
                    className={classNames({[styles.folderBlock]: grid})}
                    role="none"
                >
                    <div
                        data-folder-entry={node.id}
                        data-drop-key={node.id}
                        data-folder-open={open}
                        data-container={node.container || null}
                        style={assetMode ? {'--folder-color': folderColor(node.id)} : null}
                        className={classNames({[styles.dropTarget]: dropPath === node.id, ...sourceClasses(node.id)})}
                    >
                        {renderFolder ? renderFolder(node, row, open) : row}
                    </div>
                    {open || previewInside ? (
                        <div
                            className={classNames({[styles.gridGroup]: grid, [styles.nestedGroup]: grid})}
                            role="group"
                            style={grid ? {'--group-indent': `${(depth + 1) * 16}px`} : null}
                        >
                            {renderShadow(node.id, 'inside-start', assetMode ? 0 : depth + 1)}
                            {open ? renderNodes(node.children, assetMode ? 0 : depth + 1,
                                node.name.toLowerCase().includes(filter) ? '' : filter) : null}
                            {renderShadow(node.id, 'inside-end', assetMode ? 0 : depth + 1)}
                        </div>
                    ) : null}
                </div>
                {renderShadow(node.id, 'after', depth)}
            </React.Fragment>
        );
    });

    return (
        <div
            className={classNames(styles.tree, {[styles.gridGroup]: grid,
                [styles.assetTree]: assetMode,
                [styles.dropTarget]: dropPath === 'root'})}
            role="tree"
        >
            {renderNodes(tree, 0)}
            {renderShadow('root', 'inside-end', 0)}
        </div>
    );
};

SpriteTree.propTypes = {
    grid: PropTypes.bool,
    assetMode: PropTypes.bool,
    dragging: PropTypes.bool,
    dropPath: PropTypes.string,
    dragPreview: PropTypes.shape({sourceKey: PropTypes.string, placement: PropTypes.object, isFolder: PropTypes.bool}),
    renderFolder: PropTypes.func,
    onActiveFolderChange: PropTypes.func,
    onToggleContainerVisibility: PropTypes.func,
    renderContainerProperties: PropTypes.func,
    folderTransition: PropTypes.shape({source: PropTypes.string, destination: PropTypes.string}),
    query: PropTypes.string,
    renderSprite: PropTypes.func.isRequired,
    selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    tree: PropTypes.arrayOf(PropTypes.object).isRequired // eslint-disable-line react/forbid-prop-types
};

export default SpriteTree;
