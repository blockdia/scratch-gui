import VM from 'scratch-vm';
import Sprite from 'scratch-vm/src/sprites/sprite';
import {Stage} from '../../src/containers/stage.jsx';

jest.mock('scratch-render', () => jest.fn());
jest.mock('@blockdia/scratch-svg-renderer', () => ({BitmapAdapter: jest.fn()}));
jest.mock('../../src/components/stage/stage.jsx', () => () => null);

const fixture = useEditorDragStyle => {
    const vm = new VM();
    const sprite = new Sprite(null, vm.runtime);
    sprite.name = 'Sprite';
    const original = sprite.createClone();
    vm.runtime.addTarget(original);
    vm.editingTarget = original;
    const clone = original.makeClone();
    vm.runtime.addTarget(clone);
    vm.runtime.renderer = {canvas: {}, draw: jest.fn(), getNativeSize: () => [480, 360]};
    const stage = new Stage({vm, useEditorDragStyle, customStageSize: {width: 480, height: 360}});
    stage.rect = {left: 0, top: 0, width: 480, height: 360};
    stage.dragCanvas = {width: 100, height: 100, style: {display: 'block'}};
    stage.setState = patch => Object.assign(stage.state, patch);
    stage.setState({mouseDown: true,
        mouseDownPosition: [240, 180],
        isDragging: true,
        dragId: clone.id,
        dragOffset: [5, 10]});
    vm.startDrag(clone.id);
    const postSpriteInfo = jest.spyOn(vm, 'postSpriteInfo');
    return {vm, stage, original, clone, postSpriteInfo};
};

test.each([
    [true, 'onMouseUp'], [false, 'onMouseUp'], [true, 'onMouseMove'], [false, 'onMouseMove']
])('releases a deleted clone in editor mode %s on %s', (editor, handler) => {
    const {vm, stage, original, clone, postSpriteInfo} = fixture(editor);
    try {
        vm.runtime.disposeTarget(clone);
        stage[handler]({clientX: 250, clientY: 160, button: 0});
        expect(stage.state).toMatchObject({isDragging: false, dragId: null, dragOffset: null, mouseDown: false});
        expect(postSpriteInfo).not.toHaveBeenCalled();
        expect(vm._dragTarget).toBe(null);
        expect(clone.dragging).toBe(false);
        expect(vm.editingTarget).toBe(original);
        if (editor) {
            expect(stage.dragCanvas).toMatchObject({width: 0, height: 0, style: {display: 'none'}});
        }
        // Later property edits must go to the current sprite, not the removed clone.
        vm.postSpriteInfo({x: 42});
        expect(original.x).toBe(42);
        expect(clone.x).toBe(0);
    } finally {
        vm.quit();
    }
});

test('a live transformed sprite still receives local coordinates on drop', () => {
    const {vm, stage, clone, postSpriteInfo} = fixture(true);
    try {
        clone.worldToLocal = jest.fn(() => [17, -8]);
        vm.setEditingTarget = jest.fn();
        stage.onMouseUp({clientX: 250, clientY: 160, button: 0});
        expect(clone.worldToLocal).toHaveBeenCalledWith(15, 10);
        expect(postSpriteInfo).toHaveBeenCalledWith({visible: true, x: 17, y: -8, force: true});
        expect(clone.x).toBe(17);
        expect(clone.y).toBe(-8);
        expect(vm._dragTarget).toBe(null);
        expect(vm.setEditingTarget).toHaveBeenCalledTimes(1);
        expect(stage.dragCanvas.style.display).toBe('none');
    } finally {
        vm.quit();
    }
});
