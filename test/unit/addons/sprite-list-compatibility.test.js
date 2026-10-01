jest.mock('../../../src/lib/get-costume-url', () => asset => asset.encodeDataURI());
jest.mock('../../../src/components/sprite-selector-item/sprite-selector-item.css', () => new Proxy({}, {
    get: (target, name) => (name === '__esModule' ? false : name)
}));
import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {shallow} from 'enzyme';
import SpriteTree from '../../../src/components/sprite-selector/sprite-tree.jsx';
import SpriteSelectorItem from '../../../src/components/sprite-selector-item/sprite-selector-item.jsx';
import {buildFolderTree} from '../../../src/lib/folders';
import FolderThumbnail, {getFolderPreview} from '../../../src/components/asset-panel/folder-thumbnail.jsx';
import FolderCard from '../../../src/components/asset-panel/folder-card.jsx';
import folderIcon from '../../../src/components/asset-panel/folder.svg';
import DragLayer from '../../../src/components/drag-layer/drag-layer.jsx';
import moveToTop from '../../../src/addons/addons/move-to-top-layer/userscript';

const sprite = (id, name) => ({type: 'sprite', sprite: {id, name}});
const folder = (id, name, children, open = false) => ({type: 'folder', id, name, children, open});
const renderSprite = (item, depth) => <span data-id={item.id} data-depth={depth}>{String(item.name)}</span>;
const visibleIds = tree => tree.root.findAll(node => Boolean(node.props['data-id']))
    .map(node => node.props['data-id']);

test('active folder follows selection on mount and update, and ignores unrelated open folders', () => {
    const onActiveFolderChange = jest.fn();
    const items = [{id: 'one', name: 'Art//one'}, {id: 'two', name: 'Music//two'}, {id: 'root', name: 'root'}];
    const render = selectedId => <SpriteTree tree={buildFolderTree(items)} selectedId={selectedId}
        onActiveFolderChange={onActiveFolderChange} renderSprite={renderSprite} />;
    let view;
    act(() => { view = renderer.create(render('one')); });
    expect(onActiveFolderChange).toHaveBeenLastCalledWith('Art');
    const toggle = path => act(() => view.root.findAll(node => node.props.id === path && node.props.onToggle)[0]
        .props.onToggle(path));
    toggle('Music');
    expect(onActiveFolderChange).toHaveBeenLastCalledWith('Art');
    toggle('Art');
    expect(onActiveFolderChange).toHaveBeenLastCalledWith('');
    act(() => view.update(render('two')));
    expect(onActiveFolderChange).toHaveBeenLastCalledWith('Music');
    act(() => view.update(render('root')));
    expect(onActiveFolderChange).toHaveBeenLastCalledWith('');
    act(() => view.unmount());
});

test('nested insertion destinations follow the deepest visible selected ancestor', () => {
    const onActiveFolderChange = jest.fn();
    const tree = buildFolderTree([{id: 'one', name: 'Actors//Enemies//one'}]);
    let view;
    act(() => { view = renderer.create(<SpriteTree tree={tree} selectedId="one"
        onActiveFolderChange={onActiveFolderChange} renderSprite={renderSprite} />); });
    expect(onActiveFolderChange).toHaveBeenLastCalledWith('Actors//Enemies');
    act(() => view.root.findAll(node => node.props.id === 'Actors//Enemies' && node.props.onToggle)[0]
        .props.onToggle('Actors//Enemies'));
    expect(onActiveFolderChange).toHaveBeenLastCalledWith('Actors');
    act(() => view.unmount());
});

test('renaming an expanded unselected folder retains its expanded descendants', () => {
    const render = (path, folderTransition) => <SpriteTree
        tree={buildFolderTree([{id: 'one', name: `${path}//Inner//one`}, {id: 'root', name: 'root'}])}
        selectedId="root" folderTransition={folderTransition} renderSprite={renderSprite} />;
    let view;
    act(() => { view = renderer.create(render('Art')); });
    for (const path of ['Art', 'Art//Inner']) {
        act(() => view.root.findAll(node => node.props.id === path && node.props.onToggle)[0].props.onToggle(path));
    }
    expect(visibleIds(view)).toEqual(['one', 'root']);
    act(() => view.update(render('Pictures', {source: 'Art', destination: 'Pictures'})));
    expect(visibleIds(view)).toEqual(['one', 'root']);
    act(() => view.unmount());
});

test('renaming a collapsed selected folder preserves its collapsed state', () => {
    const render = (path, folderTransition) => <SpriteTree
        tree={buildFolderTree([{id: 'one', name: `${path}//one`}])}
        selectedId="one" folderTransition={folderTransition} renderSprite={renderSprite} />;
    let view;
    act(() => { view = renderer.create(render('Art')); });
    act(() => view.root.findAll(node => node.props.id === 'Art' && node.props.onToggle)[0].props.onToggle('Art'));
    expect(visibleIds(view)).toEqual([]);
    act(() => view.update(render('Pictures', {source: 'Art', destination: 'Pictures'})));
    expect(visibleIds(view)).toEqual([]);
    act(() => view.unmount());
});

test('dissolving a collapsed child folder keeps the parent expanded', () => {
    const render = (name, folderTransition) => <SpriteTree
        tree={buildFolderTree([{id: 'one', name}, {id: 'root', name: 'root'}])}
        selectedId="root" folderTransition={folderTransition} renderSprite={renderSprite} />;
    let view;
    act(() => { view = renderer.create(render('Art//Inner//one')); });
    act(() => view.root.findAll(node => node.props.id === 'Art' && node.props.onToggle)[0].props.onToggle('Art'));
    expect(visibleIds(view)).toEqual(['root']);
    act(() => view.update(render('Art//one', {source: 'Art//Inner', destination: 'Art'})));
    expect(visibleIds(view)).toEqual(['one', 'root']);
    act(() => view.unmount());
});

test('moving a collapsed asset folder keeps it closed when the selected asset index changes', () => {
    const inside = {name: 'Art//one'};
    const outside = {name: 'root'};
    const render = (items, selectedId) => <SpriteTree tree={buildFolderTree(items, false)}
        assetMode selectedId={selectedId} renderSprite={renderSprite} />;
    let view;
    act(() => { view = renderer.create(render([inside, outside], 0)); });
    act(() => view.root.findByType(FolderCard).props.onToggle('Art'));
    expect(view.root.findByType(FolderCard).props.open).toBe(false);
    act(() => view.update(render([outside, inside], 1)));
    expect(view.root.findByType(FolderCard).props.open).toBe(false);
    act(() => view.unmount());
});

test('insertion shadows retain real item indices and keep the source drag recognizer mounted', () => {
    const unmount = jest.fn();
    const Item = ({name}) => {
        React.useEffect(() => () => unmount(name), []);
        return <span>{name}</span>;
    };
    const tree = buildFolderTree([{id: 'one', name: 'first'}, {id: 'two', name: 'Art//second'}]);
    let view;
    const render = dragPreview => <SpriteTree
        tree={tree}
        assetMode
        selectedId="two"
        dragPreview={dragPreview}
        renderSprite={item => <Item name={item.name} />}
    />;
    act(() => { view = renderer.create(render(null)); });
    act(() => view.update(render({sourceKey: 'item:0', placement: {key: 'Art', position: 'inside-start'}})));
    expect(view.root.findAll(node => node.props['data-folder-placeholder']).map(node =>
        node.props['data-folder-placeholder'])).toEqual(['inside-start:Art']);
    expect(view.root.findAll(node => node.props['data-item-index'] !== undefined).map(node =>
        node.props['data-item-index'])).toEqual([0, 1]);
    expect(unmount).not.toHaveBeenCalled();
    act(() => view.update(render(null)));
    expect(view.root.findAll(node => node.props['data-folder-placeholder'])).toHaveLength(0);
    act(() => view.unmount());
});

test('folder drag layers retain the open icon or up to four actual member thumbnails', () => {
    const urls = Array.from({length: 5}, (_, i) => `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg"><text>${i}</text></svg>`
    )}`);
    const tree = buildFolderTree(urls.map((url, i) => ({id: i, name: `Art//${i}`,
        asset: {encodeDataURI: () => url}})), false);
    const closed = getFolderPreview(tree[0], false);
    expect(closed.urls).toEqual(urls.slice(0, 4));
    const view = renderer.create(<DragLayer dragging folderPreview={closed} currentOffset={{x: 12, y: 34}} />);
    const image = view.root.findByType('img');
    const svg = decodeURIComponent(image.props.src.split(',')[1]);
    expect(image.props.className).toBe('image');
    expect(svg).toContain('width="80" height="80"');
    expect(svg.match(/<image /g)).toHaveLength(4);
    expect(svg).toContain('x="40" y="40"');
    closed.urls.forEach(url => expect(svg).toContain(`href="${url}"`));
    view.update(<DragLayer dragging folderPreview={getFolderPreview(tree[0], true)} currentOffset={{x: 12, y: 34}} />);
    expect(view.root.findByType('img').props.src).toBe(folderIcon);
    expect(view.root.findByType('img').props.className).toBe('image');
    view.update(<DragLayer dragging={false} />);
    expect(view.toJSON()).toBeNull();
    view.unmount();
});

test('folder cards retain native image styling and suppress hover only while dragging', () => {
    const node = buildFolderTree([{id: 0, name: 'Art//first', url: 'sound.svg'}], false)[0];
    const view = shallow(<FolderCard node={node} hasSelection />);
    expect(view.find(FolderThumbnail).prop('className')).toBe('spriteImage');
    expect(view.prop('className')).toContain('hoverable');
    expect(view.prop('className')).not.toContain('hasSelection');
    view.setProps({dragging: true});
    expect(view.prop('className')).not.toContain('hoverable');
    expect(getFolderPreview(node, false).urls[0]).toMatch(/^data:image\/svg\+xml;/);
});

test.each([false, true])('search finds collapsed descendants and restores folder state (grid=%s)', grid => {
    const tree = [folder('outer', 'Actors', [folder('inner', 'Enemies', [sprite('boss', 'Boss')])]),
        sprite('player', 'Player')];
    let view;
    const render = query => <SpriteTree tree={tree} grid={grid} renderSprite={renderSprite} query={query} />;
    act(() => { view = renderer.create(render('')); });
    expect(visibleIds(view)).toEqual(['player']);
    act(() => view.update(render('boss')));
    expect(visibleIds(view)).toEqual(['boss']);
    act(() => view.update(render('actors')));
    // A matching folder includes all nested descendants, even collapsed folders.
    expect(visibleIds(view)).toEqual(['boss']);
    act(() => view.update(render('missing')));
    expect(visibleIds(view)).toEqual([]);
    act(() => view.update(render('')));
    expect(visibleIds(view)).toEqual(['player']);
    act(() => view.unmount());
});


test('sprite identity is independent of displayed text and optional thumbnail', () => {
    const item = shallow(<SpriteSelectorItem name="" spriteId="real-id" selected />);
    expect(item.prop('attributes')['data-sprite-id']).toBe('real-id');
});

test('shift-click uses target identity and ignores disabled, deleted and non-sprite entries', async () => {
    let click;
    const originalDocument = global.document;
    global.document = {body: {addEventListener: (name, handler) => { click = handler; }}};
    const goToFront = jest.fn();
    const getTargetById = jest.fn(id => id === 'cat' ? {goToFront} : null);
    const addon = {self: {disabled: false}, tab: {traps: {vm: {runtime: {getTargetById}}}}};
    try {
        await moveToTop({addon});
        const event = (id, shiftKey = true) => ({shiftKey,
            target: {closest: () => id ? {dataset: {spriteId: id}} : null}});
        click(event('cat'));
        expect(goToFront).toHaveBeenCalledTimes(1);
        click(event('cat', false));
        click(event('deleted'));
        click(event(null));
        addon.self.disabled = true;
        click(event('cat'));
        expect(goToFront).toHaveBeenCalledTimes(1);
    } finally {
        global.document = originalDocument;
    }
});

test('broadcast highlights tolerate hidden targets and the compact stage without a header', () => {
    const ShowBroadcast = require('../../../src/addons/addons/editor-devtools/show-broadcast').default;
    const originalDocument = global.document;
    const stage = {dataset: {}, isConnected: true};
    const item = {dataset: {spriteId: 'cat'}, isConnected: true};
    global.document = {querySelector: () => stage, querySelectorAll: () => [item]};
    jest.useFakeTimers();
    try {
        const show = new ShowBroadcast({tab: {traps: {vm: {}}}});
        show.highlightTargets([{isStage: true}, {isOriginal: true, id: 'cat'},
            {isOriginal: true, id: 'collapsed'}]);
        expect(stage.dataset.highlighted).toBe('true');
        expect(item.dataset.highlighted).toBe('true');
        jest.runAllTimers();
        expect(item.dataset.highlighted).toBe('false');
    } finally {
        global.document = originalDocument;
        jest.useRealTimers();
    }
});

test.each([false, true])('file drops use their own pane input when stage is nested (stage=%s)', async isStage => {
    const dragDrop = require('../../../src/addons/addons/drag-drop/userscript').default;
    const originalDocument = global.document;
    const originalWindow = global.window;
    let dragOver;
    const events = {};
    const stagePane = {};
    const pane = {
        closest: () => pane,
        matches: () => isStage,
        querySelector: () => null,
        animate: () => ({}),
        addEventListener: (type, handler) => { events[type] = handler; },
        removeEventListener: jest.fn()
    };
    const input = {closest: () => pane, dispatchEvent: jest.fn()};
    const nestedInput = {closest: () => stagePane, dispatchEvent: jest.fn()};
    // A compact unselected stage has no input until clicked. A sprite pane
    // has the nested stage input first, which must not receive sprite files.
    pane.querySelectorAll = () => isStage ? [] : [nestedInput, input];
    pane.click = jest.fn(() => { pane.querySelectorAll = () => [input]; });
    const inputPrototype = {};
    Object.defineProperty(inputPrototype, 'value', {set: () => {}});
    global.window = {HTMLInputElement: {prototype: inputPrototype}};
    global.document = {addEventListener: (name, handler) => { dragOver = handler; }};
    try {
        await dragDrop({addon: {self: {disabled: false}, settings: {get: () => false}}});
        const files = ['test.svg'];
        const event = {target: pane, preventDefault: jest.fn(), dataTransfer: {types: ['Files'], files}};
        dragOver(event);
        events.drop(event);
        expect(input.files).toBe(files);
        expect(input.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(nestedInput.dispatchEvent).not.toHaveBeenCalled();
        expect(pane.click).toHaveBeenCalledTimes(isStage ? 1 : 0);
    } finally {
        global.document = originalDocument;
        global.window = originalWindow;
    }
});
