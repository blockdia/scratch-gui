import observeToolbarLayout from '../../../src/lib/editor-windows/toolbar-layout';

const rect = (left, right) => ({left, right, top: 48, bottom: 92, width: right - left});

test('toolbar reserves only visible stage controls across small, hidden, and left-stage layouts', () => {
    const original = {window: global.window, ResizeObserver: global.ResizeObserver, MutationObserver: global.MutationObserver,
        requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame};
    global.window = {addEventListener: jest.fn(), removeEventListener: jest.fn()};
    let resizeCallback;
    const disconnect = jest.fn();
    global.ResizeObserver = class {
        constructor (callback) { resizeCallback = callback; }
        observe () {} // eslint-disable-line no-empty-function
        disconnect () { disconnect(); }
    };
    global.MutationObserver = class {
        observe () {} // eslint-disable-line no-empty-function
        disconnect () { disconnect(); }
    };
    global.requestAnimationFrame = callback => { callback(); return 1; };
    global.cancelAnimationFrame = jest.fn();
    const values = {};
    let hidden = false;
    let headerRect = rect(900, 1440);
    let rowRect = rect(0, 890);
    let sizesRect = rect(1260, 1440);
    const row = {getBoundingClientRect: () => rowRect, style: {
        setProperty: (name, value) => { values[name] = value; },
        removeProperty: name => { delete values[name]; }
    }};
    const sizes = {getBoundingClientRect: () => sizesRect};
    const header = {getBoundingClientRect: () => headerRect, querySelector: () => sizes, parentElement: {}};
    const bounds = {querySelector: () => header, classList: {contains: () => hidden}};
    const toolbar = {parentElement: row, closest: () => bounds};
    try {
        const cleanup = observeToolbarLayout(toolbar);
        expect(values['--stage-header-inset-right']).toBe('0px');
        rowRect = rect(0, 1190);
        headerRect = rect(1160, 1440);
        resizeCallback();
        expect(values['--stage-header-inset-right']).toBe('30px');
        hidden = true;
        rowRect = rect(0, 1440);
        resizeCallback();
        expect(values['--stage-header-inset-right']).toBe('180px');
        sizesRect = rect(8, 250);
        resizeCallback();
        expect(values['--stage-header-inset-right']).toBe('0px');
        expect(values['--stage-header-inset-left']).toBe('250px');
        cleanup();
        expect(values).toEqual({});
        expect(disconnect).toHaveBeenCalledTimes(2);
    } finally {
        Object.assign(global, original);
    }
});
