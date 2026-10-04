import {moveFolder, getEntries, renameEntries} from '../../../src/lib/folders';
import {planFolderDrop} from '../../../src/lib/folders/drag';

test('container metadata follows folder rename, reparent and dissolve atomically', () => {
    const VirtualMachine = require('scratch-vm/src/virtual-machine');
    const Sprite = require('scratch-vm/src/sprites/sprite');
    const vm = new VirtualMachine();
    const stage = new Sprite(null, vm.runtime).createClone();
    stage.isStage = true;
    vm.runtime.addTarget(stage);
    const sprite = new Sprite(null, vm.runtime);
    sprite.name = 'A//B//one';
    const target = sprite.createClone();
    sprite.costumes = [{name: 'default', assetId: 'default', dataFormat: 'svg'}];
    vm.runtime.addTarget(target);
    vm.editingTarget = target;
    try {
        vm.setSpriteFolderContainer('A', true);
        vm.setSpriteFolderContainer('A//B', true);
        vm.setSpriteContainerVisible('A', false);
        moveFolder(vm, 'SPRITE', 'A', 'C');
        expect(vm.runtime.spriteContainers.serialize()).toEqual([
            {path: 'C', visible: false}, {path: 'C//B', visible: true}
        ]);
        expect(target.isEffectivelyVisible()).toBe(false);
        moveFolder(vm, 'SPRITE', 'C', '');
        expect(vm.runtime.spriteContainers.serialize()).toEqual([{path: 'B', visible: true}]);
        expect(target.isEffectivelyVisible()).toBe(true);
        const entries = getEntries(vm, 'SPRITE');
        const plan = planFolderDrop(entries, 'SPRITE', 'stage',
            {dragType: 'FOLDER', payload: {kind: 'SPRITE', scope: 'stage', path: 'B'}},
            {key: 'D', folder: 'D', index: null, after: true});
        renameEntries(vm, 'SPRITE', plan.changes, target.id, {source: 'B', destination: 'D//B'});
        expect(vm.runtime.spriteContainers.serialize()).toEqual([{path: 'D//B', visible: true}]);
        vm.setSpriteFolderContainer('D', true);
        vm.setSpriteContainerVisible('D', false);
        moveFolder(vm, 'SPRITE', 'D//B', 'D');
        expect(vm.runtime.spriteContainers.serialize()).toEqual([{path: 'D', visible: false}]);
        expect(target.isEffectivelyVisible()).toBe(false);
    } finally {
        vm.quit();
    }
});
