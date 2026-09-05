const STORAGE_KEY = 'blockdia:pinned-backpack-scripts:v1';
const CHANGE_EVENT = 'blockdia:pinned-backpack-scripts-changed';

const itemKey = (host, username, id) => JSON.stringify([host, username || '', id]);

const readPins = () => {
    try {
        const pins = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(pins) ? pins.filter(pin => pin && typeof pin.key === 'string' &&
            typeof pin.name === 'string' && typeof pin.xml === 'string') : [];
    } catch {
        return [];
    }
};

const writePins = pins => {
    // Do not report success if storage is unavailable or full.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
    window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = callback => {
    const onStorage = event => {
        if (event.key === STORAGE_KEY || event.key === null) callback();
    };
    window.addEventListener(CHANGE_EVENT, callback);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, callback);
        window.removeEventListener('storage', onStorage);
    };
};

// Use the VM's serializer so mutations, inputs and shadow blocks retain their
// normal Scratch representation. The temporary container never touches a target.
const scriptToXML = (payload, vm) => {
    const blocks = payload && payload.extensionURLs ? payload.blocks : payload;
    if (!Array.isArray(blocks) || !blocks.length) throw new Error('Invalid backpack script');
    const container = Object.create(Object.getPrototypeOf(vm.editingTarget.blocks));
    container._blocks = Object.create(null);
    blocks.forEach(block => {
        if (!block || typeof block.id !== 'string' || container._blocks[block.id]) {
            throw new Error('Invalid backpack block ID');
        }
        container._blocks[block.id] = block;
    });
    const roots = blocks.filter(block => block.topLevel && !block.shadow);
    const visited = new Set();
    const visit = id => {
        if (!id) return;
        const block = container._blocks[id];
        if (!block || visited.has(id)) throw new Error('Invalid backpack block graph');
        visited.add(id);
        Object.values(block.inputs || {}).forEach(input => {
            visit(input.block);
            if (input.shadow !== input.block) visit(input.shadow);
        });
        visit(block.next);
    };
    roots.forEach(block => visit(block.id));
    if (visited.size !== blocks.length) throw new Error('Invalid backpack block graph');
    const document = new DOMParser().parseFromString(
        `<xml>${roots.map(block => container.blockToXML(block.id)).join('')}</xml>`, 'text/xml'
    );
    if (document.querySelector('parsererror')) throw new Error('Invalid backpack script XML');
    // Flyout copies must receive fresh block IDs. Resolve variables by name/type
    // through Blockly's potential-variable map, never by another project's IDs.
    document.querySelectorAll('block, shadow, field').forEach(element => {
        element.removeAttribute('id');
        element.removeAttribute('x');
        element.removeAttribute('y');
    });
    return Array.from(document.documentElement.children)
        .map(element => new XMLSerializer().serializeToString(element))
        .join('');
};

const pinScript = (key, name, xml) => {
    writePins([...readPins().filter(pin => pin.key !== key), {key, name, xml}]);
};
const unpinScript = key => {
    const pins = readPins();
    if (pins.some(pin => pin.key === key)) writePins(pins.filter(pin => pin.key !== key));
};
const renameScript = (key, name) => {
    const pins = readPins();
    if (pins.some(pin => pin.key === key)) {
        writePins(pins.map(pin => (pin.key === key ? {...pin, name} : pin)));
    }
};

const categoryXML = (ScratchBlocks, title, unavailable) => {
    const pins = readPins();
    if (!pins.length) return '';
    const document = new DOMParser().parseFromString('<category/>', 'text/xml');
    const category = document.documentElement;
    category.setAttribute('name', title);
    category.setAttribute('id', 'pinnedBackpack');
    category.setAttribute('colour', '#0FBD8C');
    category.setAttribute('secondaryColour', '#0DA57A');
    pins.forEach(pin => {
        const label = document.createElement('label');
        label.setAttribute('text', pin.name);
        category.appendChild(label);
        const script = new DOMParser().parseFromString(`<xml>${pin.xml}</xml>`, 'text/xml');
        const blocks = Array.from(script.querySelectorAll('block, shadow'));
        if (script.querySelector('parsererror') || !blocks.length ||
            blocks.some(block => !ScratchBlocks.Blocks[block.getAttribute('type')])) {
            const hint = document.createElement('label');
            hint.setAttribute('text', unavailable);
            category.appendChild(hint);
        } else {
            Array.from(script.documentElement.children).forEach(block => {
                category.appendChild(document.importNode(block, true));
            });
        }
    });
    return new XMLSerializer().serializeToString(category);
};

export {itemKey, readPins, subscribe, scriptToXML, pinScript, unpinScript, renameScript, categoryXML};
