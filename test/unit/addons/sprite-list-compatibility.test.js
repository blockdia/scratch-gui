import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {shallow} from 'enzyme';
import SpriteTree from '../../../src/components/sprite-selector/sprite-tree.jsx';
import SpriteSelectorItem from '../../../src/components/sprite-selector-item/sprite-selector-item.jsx';
import moveToTop from '../../../src/addons/addons/move-to-top-layer/userscript';

const sprite = (id, name) => ({type: 'sprite', sprite: {id, name}});
const folder = (id, name, children, open = false) => ({type: 'folder', id, name, children, open});
const renderSprite = (item, depth) => <span data-id={item.id} data-depth={depth}>{String(item.name)}</span>;
const visibleIds = tree => tree.root.findAll(node => Boolean(node.props['data-id']))
    .map(node => node.props['data-id']);

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
