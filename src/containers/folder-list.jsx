/* eslint-disable react/jsx-no-bind */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';
import {ContextMenuTrigger} from 'react-contextmenu';
import {ContextMenu, MenuItem} from '../components/context-menu/context-menu.jsx';
import Prompt from '../components/prompt/prompt.jsx';
import SpriteTree from '../components/sprite-selector/sprite-tree.jsx';
import {getFolderPreview} from '../components/asset-panel/folder-thumbnail.jsx';
import DragRecognizer from '../lib/drag-recognizer';
import {updateAssetDrag} from '../reducers/asset-drag';
import {buildFolderTree, folderPaths, splitName, splitItemName, joinName, parentFolder, isWithin,
    validFolderName, getEntries, renameEntries, moveFolder, setActiveFolder} from '../lib/folders';
import {dragSourceKey, planFolderDrop} from '../lib/folders/drag';
import messages from '../lib/folders/messages';
import styles from '../components/sprite-selector/sprite-tree.css';

let nextId = 0;
const noOp = () => {};

const DraggableFolder = ({children, node, open, scope, kind, onDrag, menu}) => {
    const path = node.id;
    const noClick = React.useRef(false);
    const preview = React.useRef(null);
    preview.current = getFolderPreview(node, open);
    const drag = React.useMemo(() => new DragRecognizer({
        onDrag: currentOffset => {
            noClick.current = true;
            onDrag({dragging: true,
                currentOffset,
                img: null,
                folderPreview: preview.current,
                dragType: 'FOLDER',
                index: null,
                payload: {path, scope, kind}});
        },
        onDragEnd: () => {
            if (noClick.current) {
                onDrag({dragging: false, currentOffset: null, dragType: null, payload: null, folderPreview: null});
            }
            setTimeout(() => {
                noClick.current = false;
            });
        }
    }), [path, scope, kind, onDrag]);
    React.useEffect(() => () => drag.reset(), [drag]);
    const id = React.useRef(`native-folder-${nextId++}`).current;
    return (
        <ContextMenuTrigger
            id={id}
            attributes={{
                onMouseDown: event => drag.start(event),
                onTouchStart: event => drag.start(event),
                onClickCapture: event => {
                    if (noClick.current) event.stopPropagation();
                }
            }}
        >
            {children}
            <ContextMenu id={id}>{menu}</ContextMenu>
        </ContextMenuTrigger>
    );
};
DraggableFolder.propTypes = {
    children: PropTypes.node,
    node: PropTypes.object,
    open: PropTypes.bool,
    scope: PropTypes.string,
    kind: PropTypes.string,
    onDrag: PropTypes.func,
    menu: PropTypes.node
};

class FolderList extends React.Component {
    constructor (props) {
        super(props);
        this.state = {prompt: null, input: '', error: null, preview: null, folderTransition: null};
        this.ref = null;
        this.setRef = node => {
            this.ref = node;
        };
        this.handleClosePrompt = () => this.setState({prompt: null});
        this.handleSubmitPrompt = this.handleSubmitPrompt.bind(this);
        this.handleActiveFolderChange = path => setActiveFolder(this.props.vm, this.props.kind,
            path, this.props.targetId);
    }
    /* Drag completion and hit testing depend on committed DOM geometry. State
     * updates below are guarded by transitions/changed hit targets. */
    /* eslint-disable react/no-did-update-set-state */
    componentDidUpdate (previous) {
        if (previous.scope !== this.props.scope) {
            this.dragEntries = null;
            this.setState({prompt: null, preview: null, folderTransition: null});
            return;
        }
        const drag = this.props.drag;
        if (drag.dragging && !previous.drag.dragging) {
            this.dragEntries = getEntries(this.props.vm, this.props.kind, this.props.targetId);
            this.captureGeometry();
        }
        if (drag.dragging && drag.currentOffset !== previous.drag.currentOffset) {
            const {kind, scope} = this.props;
            const ownsDrag = drag.dragType === kind || (drag.dragType === 'FOLDER' &&
                drag.payload.kind === kind && drag.payload.scope === scope);
            const plan = this.dragEntries && planFolderDrop(this.dragEntries, kind, scope,
                drag, this.hitTest(drag.currentOffset, drag));
            const preview = ownsDrag && this.dragEntries ? {
                sourceKey: dragSourceKey(this.dragEntries, kind, drag),
                placement: plan && plan.placement,
                isFolder: drag.dragType === 'FOLDER'
            } : null;
            if (JSON.stringify(preview) !== JSON.stringify(this.state.preview)) this.setState({preview});
        }
        if (!drag.dragging && previous.drag.dragging) {
            this.handleDrop(previous.drag);
            this.dragEntries = null;
            this.setState({preview: null});
        }
    }
    /* eslint-enable react/no-did-update-set-state */
    captureGeometry () {
        if (!this.ref) return;
        const origin = this.ref.getBoundingClientRect();
        this.boxes = Array.from(this.ref.querySelectorAll('[data-folder-entry]')).map(entry => {
            const rect = entry.getBoundingClientRect();
            return {folder: entry.dataset.folderEntry,
                index: entry.hasAttribute('data-item-index') ? Number(entry.dataset.itemIndex) : null,
                key: entry.dataset.dropKey,
                open: entry.dataset.folderOpen === 'true',
                left: rect.left - origin.left,
                top: rect.top - origin.top,
                right: rect.right - origin.left,
                bottom: rect.bottom - origin.top};
        });
    }
    hitTest (point, drag) {
        if (!point || !this.ref) return null;
        const element = document.elementFromPoint(point.x, point.y);
        if (!element || !this.ref.contains(element)) return null;
        const origin = this.ref.getBoundingClientRect();
        const x = point.x - origin.left;
        const y = point.y - origin.top;
        const boxes = this.boxes || [];
        if (!boxes.length || y > Math.max(...boxes.map(box => box.bottom))) {
            return {folder: '', index: null, key: 'root', after: true};
        }
        // Keep hit geometry stable while the shadow makes its neighbours move.
        // Coordinates relative to the list also follow scrolling during a drag.
        const distance = box => Math.pow(Math.max(box.left - x, 0, x - box.right), 2) +
            Math.pow(Math.max(box.top - y, 0, y - box.bottom), 2);
        const hit = boxes.reduce((nearest, box) =>
            (!nearest || distance(box) < distance(nearest) ? box : nearest), null);
        const source = this.dragEntries && dragSourceKey(this.dragEntries, this.props.kind, drag);
        const sourceIndex = boxes.findIndex(box => box.key === source);
        const after = this.props.assetMode && sourceIndex !== -1 ? sourceIndex < boxes.indexOf(hit) :
            (this.props.grid && hit.index !== null ? (x > (hit.left + hit.right) / 2) !== this.props.isRtl :
                y > (hit.top + hit.bottom) / 2);
        return {...hit, after};
    }
    handleDrop (drag) {
        const hit = this.hitTest(drag.currentOffset, drag);
        if (!hit) return;
        const {kind, scope, vm, targetId, onDrop} = this.props;
        if (drag.dragType !== kind && drag.dragType !== 'FOLDER') {
            onDrop({...drag,
                newIndex: hit.index === null ? this.props.items.length : hit.index,
                folder: hit.folder});
            return;
        }
        const entries = getEntries(vm, kind, targetId);
        if (!this.dragEntries || entries.length !== this.dragEntries.length ||
            entries.some((entry, i) => entry.value !== this.dragEntries[i].value ||
                entry.name !== this.dragEntries[i].name)) return;
        const plan = planFolderDrop(entries, kind, scope, drag, hit);
        if (!plan) return;
        if (drag.dragType === 'FOLDER' && kind === 'SPRITE' && plan.changes.size) {
            const source = drag.payload.path;
            const member = entries.find(entry => plan.changes.has(entry.id));
            const suffixLength = member.name.length - source.length;
            const destination = plan.changes.get(member.id).slice(0, -suffixLength);
            this.setState({folderTransition: {source, destination, scope}});
        }
        renameEntries(vm, kind, plan.changes, targetId);
        onDrop({...drag, dragType: kind, folderOrder: plan.order});
    }
    moveItem (item, folder) {
        const {vm, kind, targetId} = this.props;
        const entry = getEntries(vm, kind, targetId).find(candidate => candidate.id === item.id &&
            candidate.name === item.fullName);
        if (entry) {
            renameEntries(vm, kind, new Map([[entry.id, joinName(folder, splitItemName(entry.name, kind).basename)]]),
                targetId);
        }
    }
    moveFolder (source, destination) {
        const {vm, kind, targetId, scope} = this.props;
        if (source === destination) return;
        // Publish the state transition before VM updates expose the new names.
        this.setState({folderTransition: {source, destination, scope}});
        moveFolder(vm, kind, source, destination, targetId);
    }
    openPrompt (item, path) {
        this.setState({prompt: {item, path}, input: path ? splitName(path).basename : item.name, error: null});
    }
    handleSubmitPrompt () {
        const {prompt, input} = this.state;
        const {items, kind} = this.props;
        const name = input.trim();
        if (!validFolderName(name)) return this.setState({error: messages.invalid});
        const parent = kind === 'SPRITE' ?
            (prompt.path ? parentFolder(prompt.path) : splitName(prompt.item.fullName).folder) : '';
        const path = joinName(parent, name);
        if (path !== prompt.path && folderPaths(items, kind === 'SPRITE').includes(path)) {
            return this.setState({error: messages.exists});
        }
        if (prompt.path) this.moveFolder(prompt.path, path);
        else this.moveItem(prompt.item, path);
        this.handleClosePrompt();
    }
    menu (item, path) {
        const {intl, items, kind} = this.props;
        const current = path ? parentFolder(path) : splitItemName(item.fullName, kind).folder;
        const format = (message, values) => intl.formatMessage(message, values);
        const paths = folderPaths(items, kind === 'SPRITE');
        const destinations = (path && kind !== 'SPRITE' ? [] : ['', ...paths]).filter(folder => folder !== current &&
            (!path || !isWithin(folder, path)) &&
            (!path || !paths.includes(joinName(folder, splitName(path).basename))));
        return [
            <MenuItem
                key="name"
                onClick={() => this.openPrompt(item, path)}
            >
                {format(path ? messages.rename : messages.create)}
            </MenuItem>,
            path ? <MenuItem
                key="remove"
                onClick={() => this.moveFolder(path, parentFolder(path))}
            >
                {format(messages.dissolve)}
            </MenuItem> : null,
            ...destinations.map(folder => (<MenuItem
                key={`move:${folder}`}
                onClick={() => (path ?
                    this.moveFolder(path, joinName(folder, splitName(path).basename)) :
                    this.moveItem(item, folder))}
            >
                {format(messages.move, {folder: folder || format(messages.root)})}
            </MenuItem>))
        ];
    }
    render () {
        const {items, renderItem, selectedId, query, grid, assetMode, scope, kind, onDrag, intl} = this.props;
        return (
            <div
                ref={this.setRef}
                className={styles.folderList}
                data-folder-list={kind}
            >
                <SpriteTree
                    key={scope}
                    tree={buildFolderTree(items, !assetMode)}
                    grid={grid}
                    assetMode={assetMode}
                    selectedId={selectedId}
                    query={query}
                    dragPreview={this.state.preview}
                    dragging={this.props.drag.dragging}
                    onActiveFolderChange={this.handleActiveFolderChange}
                    folderTransition={this.state.folderTransition && this.state.folderTransition.scope === scope ?
                        this.state.folderTransition : null}
                    renderSprite={(item, depth) => renderItem(item, item.index, depth, this.menu(item))}
                    renderFolder={(node, row, open) => (<DraggableFolder
                        node={node}
                        open={open}
                        scope={scope}
                        kind={kind}
                        onDrag={onDrag}
                        menu={this.menu(null, node.id)}
                    >{row}</DraggableFolder>)}
                />
                {this.state.prompt ? <Prompt
                    canAddCloudVariable={false}
                    cloudSelected={false}
                    globalSelected={false}
                    isAddingCloudVariableScratchSafe={false}
                    isStage={false}
                    showListMessage={false}
                    showCloudOption={false}
                    showVariableOptions={false}
                    title={intl.formatMessage(this.state.prompt.path ? messages.rename : messages.create)}
                    label={intl.formatMessage(this.state.error || messages.name)}
                    defaultValue={this.state.input}
                    onChange={event => this.setState({input: event.target.value, error: null})}
                    onFocus={event => event.target.select()}
                    onKeyDown={noOp}
                    onScopeOptionSelection={noOp}
                    onKeyPress={event => {
                        if (event.key === 'Enter') this.handleSubmitPrompt();
                    }}
                    onCancel={this.handleClosePrompt}
                    onOk={this.handleSubmitPrompt}
                /> : null}
            </div>
        );
    }
}
FolderList.propTypes = {
    items: PropTypes.arrayOf(PropTypes.object).isRequired,
    renderItem: PropTypes.func.isRequired,
    onDrop: PropTypes.func.isRequired,
    selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    kind: PropTypes.string.isRequired,
    scope: PropTypes.string,
    targetId: PropTypes.string,
    query: PropTypes.string,
    grid: PropTypes.bool,
    assetMode: PropTypes.bool,
    isRtl: PropTypes.bool,
    drag: PropTypes.object,
    vm: PropTypes.object,
    intl: intlShape,
    onDrag: PropTypes.func
};

export {FolderList};
export default injectIntl(connect((state, props) => ({
    isRtl: state.locales.isRtl,
    vm: state.scratchGui.vm,
    drag: state.scratchGui.assetDrag,
    targetId: state.scratchGui.targets.editingTarget,
    scope: props.kind === 'SPRITE' ? (state.scratchGui.targets.stage || {}).id : state.scratchGui.targets.editingTarget
}), {onDrag: updateAssetDrag})(FolderList));
