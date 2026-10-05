// Coordinated VM/renderer coverage: run with test/containers-jest.config.js.
import {containerLayerId, createLayerModel, moveLayer, visibleLayerRows} from '../../src/addons/addons/layer-manager/model';
import {locateLayerDrop} from '../../src/addons/addons/layer-manager/drag';
jest.mock('../../src/lib/get-costume-url', () => asset => asset.url);

const RenderedTarget = require('scratch-vm/src/sprites/rendered-target');
const Runtime = require('scratch-vm/src/engine/runtime');
const VirtualMachine = require('scratch-vm/src/virtual-machine');
const SpriteContainers = require('scratch-vm/src/engine/sprite-containers');
const RenderWebGL = require('scratch-render/src/RenderWebGL');
const StageLayering = require('scratch-vm/src/engine/stage-layering');
const A = containerLayerId('A');
const N = containerLayerId('A//N');

const fixture = () => {
    const renderer = Object.create(RenderWebGL.prototype);
    renderer.updateDrawableParentTransform = jest.fn();
    const group = StageLayering.SPRITE_LAYER;
    Object.assign(renderer, {_drawList: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        _layerGroups: {[group]: {drawListOffset: 1, groupIndex: 0}}, _groupOrdering: [group],
        _drawableGroups: new Map([['component', {layerGroup: group, drawables: [4, 5]}]]),
        _drawableGroupById: new Map([[4, 'component'], [5, 'component']])});
    const runtime = Object.create(Runtime.prototype);
    Object.assign(runtime, {targets: [], executableTargets: [], renderer,
        requestRedraw: jest.fn(), emitProjectChanged: jest.fn()});
    runtime.spriteContainers = new SpriteContainers(runtime);
    const make = (id, name, drawableID, extra = {}) => Object.assign(Object.create(RenderedTarget.prototype), {
        id, drawableID, renderer, runtime, isOriginal: true, isStage: false, visible: true,
        currentCostume: 0, getName: () => name, getCostumes: () => [],
        getDrawableIDs: () => (drawableID === 4 ? [4, 5] : [drawableID]),
        getCustomState: () => null, updateContainerVisibility: jest.fn(), ...extra
    });
    runtime.targets = [make('stage', 'Stage', 0, {isStage: true}), make('back', 'Back', 1),
        make('a', 'A//Ordinary//Back', 2), make('n', 'A//N//First', 3), make('component', 'A//N//Slider', 4),
        make('clone', 'A//N//First', 6, {isOriginal: false, publicId: '@clone:1'}), make('b', 'A//Front', 7), make('front', 'Front', 8)];
    runtime.executableTargets = runtime.targets.slice(1);
    runtime.spriteContainers.load([{path: 'A', visible: true}, {path: 'A//N', visible: true}]);
    runtime.spriteContainers.sync();
    runtime.requestRedraw.mockClear();
    return Object.assign(Object.create(VirtualMachine.prototype), {runtime, editingTarget: runtime.targets[2],
        setSpriteContainerOrder: VirtualMachine.prototype.setSpriteContainerOrder,
        emitContainersUpdate: jest.fn(),
        emitTargetsUpdate: () => runtime.emitProjectChanged()});
};
const ordered = vm => vm.runtime.targets.filter(t => !t.isStage)
    .sort((a, b) => a.getLayerOrder() - b.getLayerOrder()).map(t => t.id);

test.each([
    [A, null, ['back', 'front', 'a', 'n', 'component', 'clone', 'b']],
    [A, 'back', ['a', 'n', 'component', 'clone', 'b', 'back', 'front']],
    ['back', 'front', ['a', 'n', 'component', 'clone', 'b', 'back', 'front']],
    ['front', A, ['back', 'front', 'a', 'n', 'component', 'clone', 'b']],
    [N, null, ['back', 'a', 'b', 'n', 'component', 'clone', 'front']],
    [N, 'a', ['back', 'n', 'component', 'clone', 'a', 'b', 'front']],
    ['a', 'b', ['back', 'n', 'component', 'clone', 'a', 'b', 'front']],
    ['b', N, ['back', 'a', 'b', 'n', 'component', 'clone', 'front']],
    ['n', null, ['back', 'a', 'component', 'clone', 'n', 'b', 'front']],
    ['clone', 'n', ['back', 'a', 'clone', 'n', 'component', 'b', 'front']],
    ['component', 'n', ['back', 'a', 'component', 'n', 'clone', 'b', 'front']]
])('moves %s behind %s as a sibling with atomic render and execution order', (id, anchor, expected) => {
    const vm = fixture();
    expect(moveLayer(vm, id, anchor)).toBe(true);
    expect(ordered(vm)).toEqual(expected);
    expect(vm.runtime.executableTargets.map(t => t.id)).toEqual(expected);
    expect(vm.renderer._drawList.indexOf(5)).toBe(vm.renderer._drawList.indexOf(4) + 1);
    expect(vm.renderer._drawList[0]).toBe(0);
    expect(vm.runtime.emitProjectChanged.mock.calls.length > 0).toBe(id !== 'clone');
});

test.each([[A, 'front'], ['n', 'back'], [N, A], [A, N], ['a', 'clone'], ['a', 'a'], ['back', A], ['a', N],
    ['front', null], ['missing', null], ['a', null, null], ['a', null, N]].map(args => [args[0], args[1], args[2]]))(
    'rejects no-ops, cross-container drops and stale parents: %s %s %s', (id, anchor, parent) => {
        const vm = fixture();
        const before = vm.renderer._drawList.slice();
        expect(moveLayer(vm, id, anchor, parent)).toBe(false);
        expect(vm.renderer._drawList).toEqual(before);
        expect(vm.runtime.emitProjectChanged).not.toHaveBeenCalled();
    });

test('snapshots form a render-ordered tree, preserve ordinary paths and inherit visibility', () => {
    const vm = fixture();
    const model = createLayerModel(vm);
    const initial = model.snapshot();
    expect(initial.rows.map(row => row.id)).toEqual(['front', A, 'b', N, 'clone', 'component', 'n', 'a', 'back', 'stage']);
    expect(initial.rows.find(row => row.id === A)).toMatchObject({parent: null, depth: 0, count: 5});
    expect(initial.rows.find(row => row.id === N)).toMatchObject({parent: A, depth: 1, count: 3});
    expect(initial.rows.find(row => row.id === 'a')).toMatchObject({name: 'Ordinary//Back', parent: A, depth: 1});
    expect(initial.rows.find(row => row.id === 'clone')).toMatchObject({parent: N, depth: 2, clone: '1'});
    expect(model.snapshot()).toBe(initial);
    expect(visibleLayerRows(initial.rows, new Set([N])).map(row => row.id))
        .toEqual(['front', A, 'b', N, 'a', 'back', 'stage']);
    expect(visibleLayerRows(initial.rows, new Set([A])).map(row => row.id))
        .toEqual(['front', A, 'back', 'stage']);
    vm.runtime.spriteContainers.setVisible('A', false);
    const hidden = model.snapshot();
    expect(hidden.rows.find(row => row.id === A)).toMatchObject({visible: false, hiddenByContainer: false});
    expect(hidden.rows.find(row => row.id === N)).toMatchObject({visible: false, hiddenByContainer: true});
    expect(hidden.rows.filter(row => row.parent).every(row => !row.visible && row.hiddenByContainer)).toBe(true);
    vm.runtime.spriteContainers.set('A//N', false);
    const dissolved = model.snapshot();
    expect(dissolved.rows.some(row => row.id === N)).toBe(false);
    expect(dissolved.rows.find(row => row.id === 'clone')).toMatchObject({name: 'N//First', parent: A, depth: 1, clone: '1'});
});

test('runtime container instances have separate layer rows, labels and atomic movement', () => {
    const vm = fixture();
    const manager = vm.runtime.spriteContainers;
    manager.cloneDefinitions.set('instance', {path: 'A', publicId: '@container-clone:boss', visible: true});
    manager.cloneDefinitions.set('nested-instance', {path: 'A//N', publicId: '@container-clone:7', visible: true});
    const clone = vm.runtime.targets.find(target => target.id === 'clone');
    const component = vm.runtime.targets.find(target => target.id === 'component');
    clone._containerClonePaths = ['instance', 'nested-instance'];
    component._containerClonePaths = ['instance', 'nested-instance'];
    component.isOriginal = false;
    component.publicId = '@clone:2';
    manager.sync();
    const model = createLayerModel(vm);
    const rows = model.snapshot().rows;
    const instanceId = containerLayerId('instance');
    const nestedId = containerLayerId('nested-instance');
    expect(rows.find(row => row.id === instanceId)).toMatchObject({name: 'A', parent: null,
        count: 2, isContainerClone: true});
    expect(rows.find(row => row.id === instanceId)).toMatchObject({clone: 'boss', publicId: '@container-clone:boss'});
    expect(rows.find(row => row.id === nestedId)).toMatchObject({name: 'N', parent: instanceId});
    expect(rows.find(row => row.id === 'clone')).toMatchObject({name: 'First', parent: nestedId});
    expect(rows.find(row => row.id === 'component')).toMatchObject({name: 'Slider', parent: nestedId});
    expect(rows.find(row => row.id === A)).toMatchObject({count: 3, clone: null});
    const cloneLabel = rows.find(row => row.id === instanceId).clone;
    expect(moveLayer(vm, instanceId, null)).toBe(true);
    expect(ordered(vm).slice(-2)).toEqual(['component', 'clone']);
    expect(model.snapshot().rows.find(row => row.id === instanceId).clone).toBe(cloneLabel);
    expect(moveLayer(vm, 'clone', 'n')).toBe(false, 'source and clone containers are separate parents');
    manager.setVisible('instance', false);
    expect(model.snapshot().rows.find(row => row.id === instanceId).visible).toBe(false);
    expect(model.snapshot().rows.find(row => row.id === A).visible).toBe(true);
});

test('drop slots use whole subtrees and stay inside the current parent when expanded or collapsed', () => {
    const rows = createLayerModel(fixture()).snapshot().rows;
    const rectangles = items => items.map((row, i) => ({id: row.id, top: i * 50, bottom: (i + 1) * 50}));
    expect(locateLayerDrop(rows, 'front', rectangles(rows), 80)).toEqual({afterId: null, beforeId: A});
    expect(locateLayerDrop(rows, 'front', rectangles(rows), 350)).toEqual({afterId: A, beforeId: 'back'});
    expect(locateLayerDrop(rows, 'a', rectangles(rows), 249)).toEqual({afterId: 'b', beforeId: N});
    expect(locateLayerDrop(rows, 'a', rectangles(rows), 351)).toEqual({afterId: N, beforeId: 'back'});
    expect(locateLayerDrop(rows, 'n', rectangles(rows), 175)).toBe(null);
    expect(locateLayerDrop(rows, 'n', rectangles(rows), 380)).toBe(null);
    const collapsed = visibleLayerRows(rows, new Set([N]));
    expect(locateLayerDrop(collapsed, 'a', rectangles(collapsed), 225)).toEqual({afterId: N, beforeId: 'back'});
});
