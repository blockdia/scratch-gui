import {createLayerModel, moveLayer} from '../../../src/addons/addons/layer-manager/model';
jest.mock('../../../src/lib/get-costume-url', () => asset => asset.url);

// Use the real VM target methods and renderer ordering algorithms without a WebGL context.
const RenderedTarget = require('scratch-vm/src/sprites/rendered-target');
const Runtime = require('scratch-vm/src/engine/runtime');
const RenderWebGL = require('scratch-render/src/RenderWebGL');
const StageLayering = require('scratch-vm/src/engine/stage-layering');
const fixture = () => {
    const renderer = Object.create(RenderWebGL.prototype);
    const group = StageLayering.SPRITE_LAYER;
    Object.assign(renderer, {_drawList: [0, 1, 2, 3, 4],
        _layerGroups: {[group]: {drawListOffset: 1, groupIndex: 0}}, _groupOrdering: [group],
        _drawableGroups: new Map([['component', {layerGroup: group, drawables: [2, 3]}]]),
        _drawableGroupById: new Map([[2, 'component'], [3, 'component']])});
    const runtime = Object.create(Runtime.prototype);
    Object.assign(runtime, {targets: [], executableTargets: [], requestRedraw: jest.fn(), emitProjectChanged: jest.fn()});
    const make = (id, drawableID, extra = {}) => Object.assign(Object.create(RenderedTarget.prototype), {
        id, drawableID, renderer, runtime, isOriginal: true, isStage: false, visible: true,
        currentCostume: 0, getName: () => id, getCostumes: () => [], ...extra
    });
    const stage = make('stage', 0, {isStage: true});
    const a = make('a', 1);
    const b = make('b', 2);
    const c = make('c', 4, {isOriginal: false, visible: false});
    runtime.targets = [stage, a, b, c];
    runtime.executableTargets = [a, b, c];
    return {runtime, renderer, editingTarget: a, a, b, c, stage};
};
const order = vm => vm.runtime.targets.filter(t => !t.isStage)
    .sort((a, b) => a.getLayerOrder() - b.getLayerOrder()).map(t => t.id);

test.each([
    ['a', null, ['b', 'c', 'a']],
    ['a', 'c', ['b', 'a', 'c']],
    ['c', 'a', ['c', 'a', 'b']],
    ['b', null, ['a', 'c', 'b']],
    ['b', 'a', ['b', 'a', 'c']]
])('moves %s behind %s with atomic component groups and matching execution order', (id, anchor, expected) => {
    const vm = fixture();
    expect(moveLayer(vm, id, anchor)).toBe(true);
    expect(order(vm)).toEqual(expected);
    expect(vm.runtime.executableTargets.map(t => t.id)).toEqual(expected);
    expect(vm.renderer._drawList.indexOf(3)).toBe(vm.renderer._drawList.indexOf(2) + 1);
    expect(vm.renderer._drawList[0]).toBe(0);
    expect(vm.runtime.requestRedraw).toHaveBeenCalledTimes(1);
    expect(vm.runtime.emitProjectChanged).toHaveBeenCalledTimes(id === 'c' ? 0 : 1);
});

test.each([['c', null], ['a', 'b'], ['b', 'b'], ['stage', null], ['a', 'stage'], ['missing', null],
    ['a', 'deleted']])('rejects no-op or invalid move %s %s without modifying project', (id, anchor) => {
    const vm = fixture();
    expect(moveLayer(vm, id, anchor)).toBe(false);
    expect(order(vm)).toEqual(['a', 'b', 'c']);
    expect(vm.runtime.requestRedraw).not.toHaveBeenCalled();
});

test('snapshots include hidden clones and keep clone numbers stable across order changes', () => {
    const vm = fixture();
    const model = createLayerModel(vm);
    const initial = model.snapshot();
    expect(model.snapshot()).toBe(initial);
    expect(initial.rows.map(r => r.id)).toEqual(['c', 'b', 'a', 'stage']);
    expect(initial.rows[0]).toMatchObject({clone: 1, visible: false});
    moveLayer(vm, 'c', 'a');
    expect(model.snapshot().rows.find(r => r.id === 'c').clone).toBe(1);
    vm.runtime.targets = [vm.stage, vm.a, vm.b];
    expect(model.snapshot().rows).toHaveLength(3);
    expect(moveLayer(vm, 'c', null)).toBe(false);
    vm.runtime.targets = fixture().runtime.targets;
    expect(model.snapshot().generation).toBe(initial.generation + 1);
    expect(model.snapshot().rows[0].clone).toBe(1);
});
