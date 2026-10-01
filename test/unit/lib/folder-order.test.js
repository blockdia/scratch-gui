import {createFolderOrderScheduler, normalizeFolderOrder, remapAssetSelection,
    FOLDER_ORDER_CHANGED} from '../../../src/lib/folders/order';
import {renameEntries, reorderFolderItems} from '../../../src/lib/folders';

const VirtualMachine = require('scratch-vm/src/virtual-machine');
const Sprite = require('scratch-vm/src/sprites/sprite');

let vm;
const createTarget = (name, isStage = false) => {
    const sprite = new Sprite(null, vm.runtime);
    sprite.name = name;
    const target = sprite.createClone();
    target.isStage = isStage;
    sprite.costumes = [{name: 'default', assetId: 'default', dataFormat: 'svg'}];
    vm.runtime.addTarget(target);
    return target;
};
const assets = names => names.map((name, index) => ({name, assetId: String(index), dataFormat: 'svg'}));

beforeEach(() => { vm = new VirtualMachine(); });
afterEach(() => {
    vm.quit();
    jest.useRealTimers();
});

test('loaded assets follow first folder occurrence while original and clone appearances are retained', () => {
    const target = createTarget('actor');
    vm.editingTarget = target;
    target.sprite.costumes = assets(['Art//one', 'root', 'Art//two', 'Other//one']);
    target.sprite.sounds = assets(['SFX//first', 'root', 'SFX//last']);
    target.currentCostume = 1;
    const clone = target.sprite.createClone();
    vm.runtime.addTarget(clone);
    clone.currentCostume = 2;
    const originalCostume = target.getCurrentCostume();
    const cloneCostume = clone.getCurrentCostume();
    const editorCostume = target.sprite.costumes[3];
    const editorSound = target.sprite.sounds[1];
    let selectedCostume = 3;
    let selectedSound = 1;
    vm.on(FOLDER_ORDER_CHANGED, ({beforeCostumes, beforeSounds}) => {
        selectedCostume = remapAssetSelection(beforeCostumes, target.sprite.costumes, selectedCostume);
        selectedSound = remapAssetSelection(beforeSounds, target.sprite.sounds, selectedSound);
    });
    expect(normalizeFolderOrder(vm)).toBe(true);
    expect(target.sprite.costumes.map(item => item.name)).toEqual(['Art//one', 'Art//two', 'root', 'Other//one']);
    expect(target.sprite.sounds.map(item => item.name)).toEqual(['SFX//first', 'SFX//last', 'root']);
    expect(target.getCurrentCostume()).toBe(originalCostume);
    expect(clone.getCurrentCostume()).toBe(cloneCostume);
    expect(target.sprite.costumes[selectedCostume]).toBe(editorCostume);
    expect(target.sprite.sounds[selectedSound]).toBe(editorSound);
    const events = jest.fn();
    vm.on('targetsUpdate', events);
    expect(normalizeFolderOrder(vm)).toBe(false);
    expect(events).not.toHaveBeenCalled();
});

test('nested sprite normalization retains exact stage and clone slots', () => {
    const stage = createTarget('stage', true);
    const one = createTarget('A//Sub//one');
    const root = createTarget('root');
    const two = createTarget('A//two');
    const three = createTarget('A//Sub//three');
    const clone = one.sprite.createClone();
    vm.runtime.addTarget(clone);
    vm.runtime.targets = [one, clone, root, stage, two, three];
    normalizeFolderOrder(vm);
    expect(vm.runtime.targets).toEqual([one, clone, three, stage, two, root]);
});

test('new sound callbacks run before normalization and keep selecting the added sound', async () => {
    jest.useFakeTimers();
    const target = createTarget('actor');
    vm.editingTarget = target;
    target.sprite.sounds = assets(['Audio//first', 'root']);
    let selection = 0;
    vm.on(FOLDER_ORDER_CHANGED, ({beforeSounds}) => {
        selection = remapAssetSelection(beforeSounds, target.sprite.sounds, selection);
    });
    const scheduler = createFolderOrderScheduler(vm, () => true);
    const added = {name: 'Audio//new'};
    await Promise.resolve().then(() => {
        target.addSound(added);
        vm.emitTargetsUpdate();
    }).then(() => { selection = target.sprite.sounds.length - 1; });
    expect(selection).toBe(2);
    jest.runOnlyPendingTimers();
    expect(target.sprite.sounds).toEqual([expect.objectContaining({name: 'Audio//first'}), added,
        expect.objectContaining({name: 'root'})]);
    expect(selection).toBe(1);
    expect(target.sprite.sounds[selection]).toBe(added);
    expect(jest.getTimerCount()).toBe(0);
    scheduler.dispose();
});

test('rename and drag ordering finish as one transaction before deferred normalization', () => {
    jest.useFakeTimers();
    createTarget('stage', true);
    const target = createTarget('actor');
    vm.editingTarget = target;
    target.sprite.costumes = assets(['Art//one', 'root', 'other']);
    const moved = target.sprite.costumes[2];
    const scheduler = createFolderOrderScheduler(vm, () => true);
    renameEntries(vm, 'COSTUME', new Map([[2, 'Art//other']]));
    expect(target.sprite.costumes[2]).toBe(moved);
    reorderFolderItems(vm, 'COSTUME', [2, 0, 1]);
    jest.runOnlyPendingTimers();
    expect(target.sprite.costumes.map(item => item.name)).toEqual(['Art//other', 'Art//one', 'root']);
    scheduler.dispose();
});

test('scheduler pauses outside the editor, resumes on updates and cancels on unmount', () => {
    jest.useFakeTimers();
    const target = createTarget('actor');
    target.sprite.sounds = assets(['Audio//first', 'root', 'Audio//last']);
    const before = target.sprite.sounds.slice();
    let enabled = false;
    const scheduler = createFolderOrderScheduler(vm, () => enabled);
    vm.emitTargetsUpdate();
    expect(jest.getTimerCount()).toBe(0);
    enabled = true;
    vm.emitTargetsUpdate();
    enabled = false;
    jest.runOnlyPendingTimers();
    expect(target.sprite.sounds).toEqual(before);
    enabled = true;
    vm.emitTargetsUpdate();
    jest.runOnlyPendingTimers();
    expect(target.sprite.sounds).toEqual([before[0], before[2], before[1]]);
    vm.emitTargetsUpdate();
    scheduler.dispose();
    expect(jest.getTimerCount()).toBe(0);
    vm.emitTargetsUpdate();
    expect(jest.getTimerCount()).toBe(0);
});
