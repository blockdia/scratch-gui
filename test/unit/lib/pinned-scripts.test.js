import {itemKey, readPins, subscribe, pinScript, unpinScript, renameScript, scriptToXML}
    from '../../../src/lib/backpack/pinned-scripts';

const key = itemKey('_local_', null, '1');
let storage;
let listeners;
beforeEach(() => {
    storage = new Map();
    listeners = new Map();
    global.localStorage = {
        getItem: name => storage.get(name) || null,
        setItem: (name, value) => storage.set(name, value)
    };
    global.window = {
        addEventListener: (type, callback) => listeners.set(type, callback),
        removeEventListener: type => listeners.delete(type),
        dispatchEvent: event => {
            const callback = listeners.get(event.type);
            if (callback) callback(event);
        }
    };
});

test('pins are scoped to backpack host and user without ambiguous keys', () => {
    expect(itemKey('a', 'b', '1')).not.toBe(itemKey('a', 'c', '1'));
    expect(itemKey('a', 'b', '1')).not.toBe(itemKey('c', 'b', '1'));
    expect(itemKey('a:b', 'c', '1')).not.toBe(itemKey('a', 'b:c', '1'));
});

test('pin, rename and unpin persist and notify subscribed GUI components', () => {
    const changed = jest.fn();
    const unsubscribe = subscribe(changed);
    pinScript(key, 'Example', '<block type="control_wait"/>');
    pinScript(key, 'Replacement', '<block type="control_forever"/>');
    expect(readPins()).toEqual([{key, name: 'Replacement', xml: '<block type="control_forever"/>'}]);
    renameScript(key, 'Renamed');
    expect(readPins()[0].name).toBe('Renamed');
    unpinScript(key);
    expect(readPins()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(4);
    unsubscribe();
    expect(listeners.size).toBe(0);
});

test('storage failure is reported without notifying success', () => {
    const changed = jest.fn();
    subscribe(changed);
    global.localStorage.setItem = () => {
        throw new Error('quota');
    };
    expect(() => pinScript(key, 'Example', '<block/>')).toThrow('quota');
    expect(changed).not.toHaveBeenCalled();
    // Ordinary backpack deletion/rename must still work when there is no pin.
    expect(() => unpinScript(key)).not.toThrow();
    expect(() => renameScript(key, 'Example')).not.toThrow();
});

test('corrupt or unavailable storage does not prevent opening the editor', () => {
    global.localStorage.getItem = () => 'invalid JSON';
    expect(readPins()).toEqual([]);
    global.localStorage.getItem = () => '[null, {}, {"key": "x", "name": "x", "xml": "<block/>"}]';
    expect(readPins()).toHaveLength(1);
    global.localStorage.getItem = () => {
        throw new Error('denied');
    };
    expect(readPins()).toEqual([]);
});

test('only relevant changes in other tabs refresh the category', () => {
    const changed = jest.fn();
    subscribe(changed);
    const onStorage = listeners.get('storage');
    onStorage({key: 'unrelated'});
    expect(changed).not.toHaveBeenCalled();
    onStorage({key: null});
    expect(changed).toHaveBeenCalledTimes(1);
});

test('rejects broken and cyclic block graphs before invoking the XML serializer', () => {
    const vm = {editingTarget: {blocks: {}}};
    expect(() => scriptToXML([], vm)).toThrow('Invalid backpack script');
    expect(() => scriptToXML([{id: 'a', topLevel: true, next: 'a'}], vm)).toThrow('block graph');
    expect(() => scriptToXML([{id: 'a', topLevel: true, next: 'missing'}], vm)).toThrow('block graph');
    expect(() => scriptToXML([{id: 'a'}, {id: 'a'}], vm)).toThrow('block ID');
    expect(() => scriptToXML([{id: 'a', topLevel: true}, {id: 'b'}], vm)).toThrow('block graph');
});
