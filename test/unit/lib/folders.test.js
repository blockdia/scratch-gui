import {buildFolderTree, splitName, folderPaths, moveFolder, renameEntries, dropOrder,
    reorderFolderItems, getEntries, setActiveFolder, getActiveFolder, prepareAsset} from '../../../src/lib/folders';
import {planFolderDrop} from '../../../src/lib/folders/drag';

// A VM double which updates references like VM.renameSprite/RenderedTarget.renameCostume.
const makeVM = names => {
    const references = names.slice();
    const targets = names.map((name, id) => ({id: `sprite-${id}`, isOriginal: true,
        sprite: {name, costumes: [], sounds: []}, getName () { return this.sprite.name; }}));
    const stage = {id: 'stage', isStage: true, isOriginal: true};
    const vm = {
        runtime: {targets: [stage, ...targets], getTargetById (id) { return this.targets.find(t => t.id === id); },
            getTargetForStage: () => stage, emitProjectChanged: jest.fn()},
        editingTarget: targets[0], emitTargetsUpdate: jest.fn(), emitWorkspaceUpdate: jest.fn(),
        renameSprite: jest.fn((id, name) => {
            const target = vm.runtime.getTargetById(id);
            references.forEach((ref, index) => { if (ref === target.getName()) references[index] = name; });
            target.sprite.name = name;
        }),
        reorderTarget: (from, to) => {
            const [target] = vm.runtime.targets.splice(from, 1);
            vm.runtime.targets.splice(to, 0, target);
        }
    };
    return {vm, references};
};

test('nested paths retain true indices, duplicate basenames and root ordering', () => {
    const items = [{id: 'a', name: '敌人//森林//史莱姆'}, {id: 'b', name: '玩家'},
        {id: 'c', name: '敌人//森林//蝙蝠'}, {id: 'd', name: '敌人//史莱姆'}];
    const tree = buildFolderTree(items);
    expect(folderPaths(items)).toEqual(['敌人', '敌人//森林']);
    expect(tree[0].children[0].children.map(node => [node.sprite.name, node.sprite.index]))
        .toEqual([['史莱姆', 0], ['蝙蝠', 2]]);
    expect(tree[1].sprite.id).toBe('b');
    expect(buildFolderTree([{name: '玩家'}]).every(node => node.type === 'sprite')).toBe(true);
    expect(buildFolderTree([])).toEqual([]);
});

test.each(['//name', 'a////b', 'a///b'])('malformed names preserve text: %s', name => {
    const {folder, basename} = splitName(name);
    expect(folder ? `${folder}//${basename}` : basename).toBe(name);
});

test('moving a nested folder updates only its subtree and avoids cycles', () => {
    const {vm, references} = makeVM(['A//B//one', 'A//B//C//two', 'A//BB//three', 'outside']);
    expect(moveFolder(vm, 'SPRITE', 'A//B', 'D//B')).toBe(true);
    expect(getEntries(vm, 'SPRITE').map(entry => entry.name))
        .toEqual(['D//B//one', 'D//B//C//two', 'A//BB//three', 'outside']);
    expect(references).toEqual(getEntries(vm, 'SPRITE').map(entry => entry.name));
    expect(moveFolder(vm, 'SPRITE', 'D', 'D//B//C')).toBe(false);
    expect(vm.runtime.emitProjectChanged).toHaveBeenCalledTimes(1);
});

test('dissolving a folder preserves nested paths, deduplicates names and does not cascade references', () => {
    const {vm, references} = makeVM(['A//one', 'one', 'A//B//two', 'A//one2']);
    moveFolder(vm, 'SPRITE', 'A', '');
    expect(getEntries(vm, 'SPRITE').map(entry => entry.name)).toEqual(['one2', 'one', 'B//two', 'one3']);
    expect(references).toEqual(['one2', 'one', 'B//two', 'one3']);
    expect(folderPaths(getEntries(vm, 'SPRITE'))).toEqual(['B']);
});

test('simultaneous renames preserve references when destination names overlap old names', () => {
    const {vm, references} = makeVM(['A', 'B']);
    renameEntries(vm, 'SPRITE', new Map([['sprite-0', 'B'], ['sprite-1', 'A']]));
    expect(references).toEqual(['B', 'A']);
});

test('moving reserved basenames out of a folder produces legal Scratch sprite names', () => {
    const {vm, references} = makeVM(['A//_stage_', 'A//', 'A//_mycontainer_',
        'A//_container_:A', '__container_:A']);
    moveFolder(vm, 'SPRITE', 'A', '');
    const names = getEntries(vm, 'SPRITE').map(entry => entry.name);
    expect(names).toEqual(['_stage_2', '2', '_mycontainer_2', '__container_:A2', '__container_:A']);
    expect(references).toEqual(names);
});

test('drop ordering uses actual indices, preserves grouped order and never moves the stage', () => {
    const {vm} = makeVM(['A//one', 'root', 'A//two', 'last']);
    const order = dropOrder(4, [0, 2], 3, true);
    expect(order).toEqual([1, 3, 0, 2]);
    reorderFolderItems(vm, 'SPRITE', order);
    expect(vm.runtime.targets[0].id).toBe('stage');
    expect(getEntries(vm, 'SPRITE').map(entry => entry.name)).toEqual(['root', 'last', 'A//one', 'A//two']);
    expect(dropOrder(4, [0, 2], 2)).toBeNull();
});

test('active insertion folder is scoped and disappears when its final member leaves', () => {
    const {vm} = makeVM(['A//one']);
    setActiveFolder(vm, 'SPRITE', 'A');
    expect(getActiveFolder(vm, 'SPRITE')).toBe('A');
    expect(prepareAsset(vm, 'SPRITE', {name: 'new'}).name).toBe('A//new');
    expect(prepareAsset(vm, 'SPRITE', {name: 'B//new'}).name).toBe('B//new');
    moveFolder(vm, 'SPRITE', 'A', '');
    expect(getActiveFolder(vm, 'SPRITE')).toBe('');
});

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
    target.componentController = {};
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
        await vm.loadProject(fs.readFileSync(path.join(__dirname, '../../fixtures/project1.sb3')));
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


test('asset folders use only the first separator and cannot be nested', () => {
    const items = [{name: 'A//B//costume'}, {name: 'A//sound'}, {name: 'outside'}];
    const tree = buildFolderTree(items, false);
    expect(folderPaths(items, false)).toEqual(['A']);
    expect(tree[0].children.every(node => node.type === 'sprite')).toBe(true);
    expect(tree[0].children[0].sprite.name).toBe('B//costume');
    const {vm} = makeVM(['sprite']);
    expect(moveFolder(vm, 'COSTUME', 'A', 'B//A')).toBe(false);
});

const assetEntries = names => names.map((name, id) => ({id, name}));
const assetDrag = index => ({dragType: 'COSTUME', index});
const folderHit = (folder, after, open = false) => ({key: folder, folder, index: null, after, open});

test.each([false, true])('downward asset drops follow closed/open folder boundaries (open=%s)', open => {
    const entries = assetEntries(['one', 'Art//two', 'Art//three', 'four']);
    const plan = planFolderDrop(entries, 'COSTUME', 'target', assetDrag(0), folderHit('Art', true, open));
    expect(plan.placement).toEqual({key: 'Art', position: open ? 'inside-start' : 'after'});
    expect(plan.changes.get(0)).toBe(open ? 'Art//one' : 'one');
    expect(plan.order).toEqual(open ? [0, 1, 2, 3] : [1, 2, 0, 3]);
    expect(entries[0].name).toBe('one'); // Preview must not write to project data.
});

test('upward asset drops go before the folder; dragging out its last member keeps its position', () => {
    const entries = assetEntries(['before', 'Art//two', 'Art//three', 'last']);
    const plan = planFolderDrop(entries, 'COSTUME', 'target', assetDrag(3), folderHit('Art', false, true));
    expect(plan.order).toEqual([0, 3, 1, 2]);
    expect(plan.changes.get(3)).toBe('last');
    expect(plan.placement).toEqual({key: 'Art', position: 'before'});
    const single = planFolderDrop(assetEntries(['Art//only', 'last']), 'COSTUME', 'target', assetDrag(0),
        folderHit('Art', false, true));
    expect(single.order).toEqual([0, 1]);
    expect(single.changes.get(0)).toBe('only');
});

test('asset folder previews move the whole group without allowing nesting or crossing target scopes', () => {
    const entries = assetEntries(['Art//one', 'Art//two', 'Other//three', 'root']);
    const drag = {dragType: 'FOLDER', payload: {kind: 'COSTUME', scope: 'target', path: 'Art'}};
    const plan = planFolderDrop(entries, 'COSTUME', 'target', drag, folderHit('Other', true, true));
    expect(plan.order).toEqual([2, 0, 1, 3]);
    expect(plan.changes.size).toBe(0);
    expect(plan.placement).toEqual({key: 'Other', position: 'after'});
    expect(planFolderDrop(entries, 'COSTUME', 'elsewhere', drag, folderHit('Other', true))).toBeNull();
    expect(planFolderDrop(entries, 'COSTUME', 'target', drag,
        {key: 'item:2', index: 2, folder: 'Other', after: true})).toBeNull();
});

test('nested sprite drop previews and final ordering share the same plan', () => {
    const {vm} = makeVM(['A//one', 'A//Sub//two', 'B//three']);
    const entries = getEntries(vm, 'SPRITE');
    const drag = {dragType: 'FOLDER', payload: {kind: 'SPRITE', scope: 'stage', path: 'A'}};
    const plan = planFolderDrop(entries, 'SPRITE', 'stage', drag, folderHit('B', true));
    expect(plan.placement).toEqual({key: 'B', position: 'inside-end'});
    renameEntries(vm, 'SPRITE', plan.changes);
    reorderFolderItems(vm, 'SPRITE', plan.order);
    expect(getEntries(vm, 'SPRITE').map(entry => entry.name)).toEqual(['B//three', 'B//A//one', 'B//A//Sub//two']);
    expect(planFolderDrop(entries, 'SPRITE', 'stage', drag, folderHit('A//Sub', true))).toBeNull();
});
