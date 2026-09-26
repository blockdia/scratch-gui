import React from 'react';
import renderer from 'react-test-renderer';
import {IntlProvider} from 'react-intl';
import {EventEmitter} from 'events';
import createWindow from '../../../src/addons/addons/linter/window.jsx';
import {createLinterModel} from '../../../src/addons/addons/linter/model';
import {RULES} from '../../../src/addons/addons/linter/analyzer';
import {englishAddonMessages} from '../../../src/addons/translations';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
const fixture = (multiple = false) => {
    const vm = new EventEmitter();
    vm.runtime = new EventEmitter();
    vm.runtime.targets = [{id: 'stage', isStage: true, isOriginal: true, getName: () => 'Stage',
        variables: {v: {id: 'v', name: 'spare', type: ''}}, blocks: {_blocks: {}}}];
    if (multiple) vm.runtime.targets.push({id: 'cat', isOriginal: true, getName: () => 'Cat', variables: {},
        blocks: {_blocks: {
            move: {id: 'move', opcode: 'motion_goto', inputs: {TO: {block: 'menu'}}},
            menu: {id: 'menu', opcode: 'text', fields: {TEXT: {value: 'Ghost'}}}
        }}});
    const settings = new EventEmitter();
    settings.addEventListener = settings.on;
    settings.removeEventListener = settings.removeListener;
    let rules = [...RULES];
    const getRules = () => rules;
    const model = createLinterModel(vm, getRules);
    const navigator = {navigate: jest.fn(async () => true), cancel: jest.fn()};
    const View = createWindow({addon: {settings}, model, navigator, getRules,
        setRule: (rule, enabled) => {
            rules = enabled ? [...rules, rule] : rules.filter(item => item !== rule);
        }});
    const render = visible => <IntlProvider locale="en" messages={englishAddonMessages}>
        <View visible={visible} locale="en" direction="ltr" theme="dark" />
    </IntlProvider>;
    let root;
    const mockNodes = [];
    renderer.act(() => {
        root = renderer.create(render(true), {createNodeMock: element => {
            const node = {focus: jest.fn(), scrollIntoView: jest.fn(), label: element.props['aria-label']};
            mockNodes.push(node);
            return node;
        }});
    });
    renderer.act(() => jest.runAllTimers());
    return {root, render, vm, model, navigator, settings, mockNodes};
};
const button = (root, name) => root.root.findByProps({'aria-label': name});
const issues = root => root.root.findAllByProps({role: 'treeitem'}).filter(row => 'aria-selected' in row.props);
const key = (item, value) => {
    const currentTarget = {};
    const event = {key: value, currentTarget, target: currentTarget, preventDefault: jest.fn(), stopPropagation: jest.fn()};
    renderer.act(() => item.props.onKeyDown(event));
    return event;
};

test('unused data identifies variables and lists and builtins need no operation translations', () => {
    const {root, vm} = fixture(true);
    expect(issues(root)[1].props['aria-label']).toContain('Variable "spare" has no references');
    expect(issues(root)[0].props['aria-label']).not.toContain('motion_goto');
    expect(issues(root)[0].props['aria-label']).not.toContain('operation-');
    vm.runtime.targets[0].variables.v.type = 'list';
    renderer.act(() => { vm.emit('PROJECT_CHANGED'); });
    renderer.act(() => jest.runAllTimers());
    expect(issues(root)[1].props['aria-label']).toContain('List "spare" has no references');
    renderer.act(() => root.unmount());
});

test('filters, toggles rules and cleans up hidden or disabled windows', () => {
    const {root, render, vm, model, settings, navigator} = fixture();
    expect(issues(root)).toHaveLength(1);
    renderer.act(() => button(root, 'Filters and rules').props.onClick());
    const severity = root.root.findAllByType('select')[0];
    renderer.act(() => severity.props.onChange({target: {value: 'warning'}}));
    expect(JSON.stringify(root.toJSON())).toContain('No results match these filters.');
    renderer.act(() => severity.props.onChange({target: {value: 'all'}}));
    const unused = root.root.findAllByProps({type: 'checkbox'})[2];
    renderer.act(() => unused.props.onChange({target: {checked: false}}));
    renderer.act(() => jest.runAllTimers());
    expect(model.snapshot().results).toEqual([]);
    renderer.act(() => root.update(render(false)));
    expect(vm.listenerCount('PROJECT_CHANGED')).toBe(0);
    const hiddenRevision = model.snapshot().revision;
    renderer.act(() => jest.runAllTimers());
    expect(model.snapshot().revision).toBe(hiddenRevision);
    renderer.act(() => root.update(render(true)));
    expect(vm.listenerCount('PROJECT_CHANGED')).toBe(1);
    renderer.act(() => root.unmount());
    expect(vm.listenerCount('PROJECT_CHANGED')).toBe(0);
    expect(settings.listenerCount('change')).toBe(0);
    expect(navigator.cancel).toHaveBeenCalled();
});

test('one click selects and navigates; stale rows never navigate', async () => {
    const {root, navigator, vm} = fixture(true);
    await renderer.act(async () => issues(root)[0].props.onClick());
    expect(navigator.navigate).toHaveBeenCalledWith(expect.objectContaining({kind: 'block', blockId: 'move'}));
    expect(issues(root)[0].props['aria-selected']).toBe(true);
    renderer.act(() => { vm.emit('PROJECT_CHANGED'); });
    renderer.act(() => issues(root)[1].props.onClick());
    expect(navigator.navigate).toHaveBeenCalledTimes(1);
    renderer.act(() => root.unmount());
});

test('text search matches translated issue, target and location; Escape clears without closing the window', () => {
    const {root} = fixture(true);
    const search = () => root.root.findByProps({type: 'search'});
    renderer.act(() => search().props.onChange({target: {value: 'cat Ghost'}}));
    expect(issues(root)).toHaveLength(1);
    expect(issues(root)[0].props['aria-label']).toContain('Ghost');
    const event = key(search(), 'Escape');
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(issues(root)).toHaveLength(2);
    renderer.act(() => root.unmount());
});

test('group collapse removes hidden rows from the tab order; arrow keys focus and Enter navigates', async () => {
    const {root, navigator, mockNodes} = fixture(true);
    renderer.act(() => button(root, 'Collapse all').props.onClick());
    expect(issues(root)).toHaveLength(0);
    expect(root.root.findAllByProps({role: 'treeitem'})).toHaveLength(2);
    const first = root.root.findAllByProps({role: 'treeitem'})[0];
    key(first, 'ArrowRight');
    expect(issues(root)).toHaveLength(1);
    key(root.root.findAllByProps({role: 'treeitem'})[0], 'ArrowDown');
    expect(mockNodes.some(node => node.label && node.label.includes('Ghost') && node.focus.mock.calls.length)).toBe(true);
    expect(navigator.navigate).not.toHaveBeenCalled();
    await renderer.act(async () => key(issues(root)[0], 'Enter'));
    expect(navigator.navigate).toHaveBeenCalledTimes(1);
    expect(root.root.findAllByProps({role: 'treeitem'}).filter(item => item.props.tabIndex === 0)).toHaveLength(1);
    renderer.act(() => root.unmount());
});

test('unavailable locations refresh results and display a notice', async () => {
    const {root, navigator} = fixture();
    navigator.navigate.mockResolvedValue(false);
    await renderer.act(async () => issues(root)[0].props.onClick());
    expect(JSON.stringify(root.toJSON())).toContain('This location is no longer available');
    renderer.act(() => root.unmount());
});

test('indirect waits expose related navigation only in the selected details', async () => {
    const {root, vm, navigator} = fixture();
    const definition = (name, warp, next) => [
        {id: name, opcode: 'procedures_definition', next, inputs: {custom_block: {block: `${name}-proto`}}},
        {id: `${name}-proto`, opcode: 'procedures_prototype', mutation: {proccode: name, warp}}
    ];
    const blocks = [...definition('outer', true, 'call'), ...definition('inner', false, 'wait'),
        {id: 'call', opcode: 'procedures_call', mutation: {proccode: 'inner'}},
        {id: 'wait', opcode: 'control_wait'}];
    vm.runtime.targets[0].blocks._blocks = Object.fromEntries(blocks.map(block => [block.id, block]));
    renderer.act(() => { vm.emit('PROJECT_CHANGED'); });
    renderer.act(() => jest.runAllTimers());
    await renderer.act(async () => issues(root)[0].props.onClick());
    const details = root.root.findByProps({className: 'sa-linter-details-toggle'});
    renderer.act(() => details.props.onClick());
    expect(JSON.stringify(root.toJSON())).toContain('Waiting operations (1)');
    const related = root.root.findAllByType('button').find(item => item.children.includes('Waiting operation 1'));
    await renderer.act(async () => related.props.onClick());
    expect(navigator.navigate).toHaveBeenLastCalledWith({kind: 'block', targetId: 'stage', blockId: 'wait'});
    renderer.act(() => root.unmount());
});
