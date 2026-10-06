// These integration tests require the current VM container transaction contract.
import {moveFolder, renameEntries, folderPaths, getEntries} from '../../src/lib/folders';

test('resolved VM preserves asset references, component bindings and serialized folder names', () => {
    const VirtualMachine = require('scratch-vm/src/virtual-machine');
    const Sprite = require('scratch-vm/src/sprites/sprite');
    const vm = new VirtualMachine();
    const createTarget = (name, isStage = false) => {
        const sprite = new Sprite(null, vm.runtime);
        sprite.name = name;
        const target = sprite.createClone();
        target.isStage = isStage;
        vm.runtime.addTarget(target);
        return target;
    };
    const stage = createTarget('Stage', true);
    stage.sprite.costumes = [{name: 'background', assetId: 'd', dataFormat: 'svg'}];
    const target = createTarget('Actors//Hero');
    vm.editingTarget = target;
    // Component binding updates are part of RenderedTarget.renameCostume.
    target.componentController = {sync: jest.fn()};
    target.component = {parts: [{costume: 'Art//Idle'}]};
    target.sprite.costumes = [{name: 'Art//Idle', assetId: 'a', dataFormat: 'svg'},
        {name: 'Idle', assetId: 'b', dataFormat: 'svg'}];
    target.sprite.sounds = [{name: 'Audio//Hit', assetId: 'c', dataFormat: 'wav'}];
    const block = (id, opcode, field, value) => ({id, opcode, next: null, parent: null,
        inputs: {}, fields: {[field]: {name: field, value}}, shadow: true, topLevel: false});
    target.blocks.createBlock(block('costume-ref', 'looks_costume', 'COSTUME', 'Art//Idle'));
    target.blocks.createBlock(block('sound-ref', 'sound_sounds_menu', 'SOUND_MENU', 'Audio//Hit'));
    stage.blocks.createBlock(block('sprite-ref', 'motion_goto_menu', 'TO', 'Actors//Hero'));
    moveFolder(vm, 'COSTUME', 'Art', '', target.id);
    moveFolder(vm, 'SOUND', 'Audio', 'SFX', target.id);
    moveFolder(vm, 'SPRITE', 'Actors', 'Characters');
    expect(target.blocks.getBlock('costume-ref').fields.COSTUME.value).toBe('Idle2');
    expect(target.component.parts[0].costume).toBe('Idle2');
    expect(target.blocks.getBlock('sound-ref').fields.SOUND_MENU.value).toBe('SFX//Hit');
    expect(stage.blocks.getBlock('sprite-ref').fields.TO.value).toBe('Characters//Hero');
    delete target.componentController;
    delete target.component;
    const serialized = JSON.parse(vm.toJSON());
    expect(serialized.targets[1].name).toBe('Characters//Hero');
    expect(serialized.targets[1].costumes.map(costume => costume.name)).toEqual(['Idle2', 'Idle']);
    expect(serialized.targets[1].sounds[0].name).toBe('SFX//Hit');
    vm.quit();
});

test('SB3 save/load round trip retains nested sprites and single-level asset paths without folder metadata', async () => {
    const VirtualMachine = require('scratch-vm/src/virtual-machine');
    const Storage = require('@turbowarp/scratch-storage');
    const fs = require('fs');
    const path = require('path');
    const vm = new VirtualMachine();
    const reopened = new VirtualMachine();
    vm.attachStorage(new Storage());
    reopened.attachStorage(new Storage());
    try {
        await vm.loadProject(fs.readFileSync(path.join(__dirname, '../fixtures/project1.sb3')));
        const target = vm.runtime.targets.find(item => !item.isStage);
        vm.editingTarget = target;
        renameEntries(vm, 'SPRITE', new Map([[target.id, 'Actors//Enemies//Cat']]));
        renameEntries(vm, 'COSTUME', new Map([[0, 'Art//Frame1']]), target.id);
        if (target.sprite.sounds.length) renameEntries(vm, 'SOUND', new Map([[0, 'Audio//Meow']]), target.id);
        const saved = await vm.saveProjectSb3('nodebuffer');
        await reopened.loadProject(saved);
        const loaded = reopened.runtime.targets.find(item => item.getName() === 'Actors//Enemies//Cat');
        expect(loaded).toBeTruthy();
        expect(loaded.sprite.costumes[0].name).toBe('Art//Frame1');
        if (target.sprite.sounds.length) expect(loaded.sprite.sounds[0].name).toBe('Audio//Meow');
        expect(folderPaths(getEntries(reopened, 'SPRITE'))).toEqual(['Actors', 'Actors//Enemies']);
    } finally {
        vm.quit();
        reopened.quit();
    }
});
