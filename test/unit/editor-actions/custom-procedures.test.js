import LazyScratchBlocks from '../../../src/lib/tw-lazy-scratch-blocks';

jest.mock('../../../src/components/custom-procedures/custom-procedures.jsx', () => () => null);
jest.mock('../../../src/lib/tw-lazy-scratch-blocks', () => ({get: jest.fn()}));

const originalElement = global.Element;
global.Element = class {};
const {CustomProcedures} = require('../../../src/containers/custom-procedures.jsx');
global.Element = originalElement;

const key = extra => ({target: {}, key: 'Enter', metaKey: true, preventDefault: jest.fn(),
    stopImmediatePropagation: jest.fn(), ...extra});

test('Command/Ctrl Enter commits the active field before serializing and ignores composition/repeat', () => {
    let name = 'old';
    const mutation = {};
    LazyScratchBlocks.get.mockReturnValue({FieldTextInput: {}, WidgetDiv: {hide: () => { name = 'new'; }}});
    const editor = new CustomProcedures({onRequestClose: jest.fn()});
    editor.mutationRoot = {mutationToDom: jest.fn(() => {
        expect(name).toBe('new');
        return mutation;
    })};
    for (const extra of [{isComposing: true}, {keyCode: 229}, {repeat: true},
        {metaKey: false}, {altKey: true}, {shiftKey: true}]) {
        editor.handleKeyDown(key(extra));
    }
    expect(editor.props.onRequestClose).not.toHaveBeenCalled();
    for (const extra of [{}, {metaKey: false, ctrlKey: true}]) {
        name = 'old';
        const event = key(extra);
        editor.handleKeyDown(event);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopImmediatePropagation).toHaveBeenCalled();
        expect(editor.props.onRequestClose).toHaveBeenLastCalledWith(mutation);
    }
});

test('Tab crosses nested declaration fields, then reaches buttons; Shift Tab can leave the first field', () => {
    class Field { constructor () { this.showEditor_ = jest.fn(); } }
    const first = new Field();
    const second = new Field();
    const htmlInput = {};
    Field.htmlInput_ = htmlInput;
    const widget = {owner_: first, hide: jest.fn()};
    LazyScratchBlocks.get.mockReturnValue({FieldTextInput: Field, WidgetDiv: widget});
    const editor = new CustomProcedures({onRequestClose: jest.fn()});
    editor.mutationRoot = {inputList: [{fieldRow: [first], connection: {
        targetBlock: () => ({inputList: [{fieldRow: [second]}]})
    }}]};
    const button = {focus: jest.fn()};
    editor.blocks = {focus: jest.fn(), parentElement: {querySelector: () => button}};
    const tab = extra => editor.handleKeyDown(key({key: 'Tab', metaKey: false, target: htmlInput, ...extra}));
    tab();
    expect(second.showEditor_).toHaveBeenCalledTimes(1);
    widget.owner_ = second;
    tab();
    expect(button.focus).toHaveBeenCalledTimes(1);
    widget.owner_ = first;
    tab({shiftKey: true});
    expect(editor.blocks.focus).toHaveBeenCalledTimes(1);
    expect(widget.hide).toHaveBeenCalledTimes(3);
});

test('Escape cancels field edits before closing, while Enter commits without closing the dialog', () => {
    const input = {value: 'edited', defaultValue: 'original'};
    const widget = {hide: jest.fn()};
    LazyScratchBlocks.get.mockReturnValue({FieldTextInput: {htmlInput_: input}, WidgetDiv: widget});
    const editor = new CustomProcedures({onRequestClose: jest.fn()});
    editor.blocks = {focus: jest.fn()};
    editor.handleKeyDown(key({key: 'Escape', metaKey: false, target: input}));
    expect(input.value).toBe('original');
    expect(editor.blocks.focus).toHaveBeenCalledTimes(1);
    expect(editor.props.onRequestClose).not.toHaveBeenCalled();
    editor.handleKeyDown(key({key: 'Escape', metaKey: false, target: editor.blocks}));
    expect(editor.props.onRequestClose).toHaveBeenCalledWith();
    editor.props.onRequestClose.mockClear();
    input.value = 'keep';
    editor.handleKeyDown(key({metaKey: false, target: input}));
    expect(input.value).toBe('keep');
    expect(editor.blocks.focus).toHaveBeenCalledTimes(2);
    expect(editor.props.onRequestClose).not.toHaveBeenCalled();
});
