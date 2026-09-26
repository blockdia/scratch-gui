import WorkspaceQuerier from '../../../src/addons/libraries/block-search/WorkspaceQuerier';
import {BlockInstance, BlockShape, BlockInputNumber, BlockInputString, BlockInputEnum}
    from '../../../src/addons/libraries/block-search/BlockTypeInfo';
import {createSearchAliases, appendableSuggestion} from '../../../src/addons/libraries/block-search/search-aliases';

const block = (id, parts, shape = BlockShape.Stack) => {
    const type = {id, parts, shape, inputs: parts.filter(p => typeof p !== 'string')};
    type.createBlock = (...inputs) => new BlockInstance(type, ...inputs);
    return type;
};
const number = () => new BlockInputNumber(0, 0, 10);
const make = (...blocks) => {
    const querier = new WorkspaceQuerier();
    querier.indexWorkspace(blocks);
    return querier;
};
const move = () => block('move', ['移动', number(), '步']);

test.each(['yidong', 'yd', 'YIDONG', 'yid', '移动', 'yidong 10 bu', 'yd 10 b', '移动 10 bu'])(
    'finds and completes %s', input => {
        const results = make(move()).queryWorkspace(input).results;
        expect(results).toHaveLength(1);
        expect(results[0].getBlock().inputs).toEqual([input.includes('10') ? '10' : 10]);
        expect(results[0].toText(false)).toContain('移动');
    }
);
test('supports traditional Chinese, names, dropdown values and nested inputs', () => {
    const variable = block('variable', ['我的變量'], BlockShape.Round);
    const menu = new BlockInputEnum([['旋转方式', 'rotation']], 0, 0, false);
    const custom = block('procedures_call', ['自定义', menu]);
    const q = make(move(), variable, custom);
    expect(q.queryWorkspace('wdbl').results[0].getBlock().typeInfo).toBe(variable);
    expect(q.queryWorkspace('yidong wdbl bu').results[0].getBlock().inputs[0].typeInfo).toBe(variable);
    expect(q.queryWorkspace('zdy xzfs').results[0].getBlock().inputs[0]).toBe(menu.values[0]);
});
test('keeps literal text and numeric arguments intact during completion', () => {
    const q = make(block('say', ['说', new BlockInputString(0, 0, '你好')]));
    const result = q.queryWorkspace('shuo "yidong Hello"').results[0];
    expect(result.getBlock().inputs).toEqual(['yidong Hello']);
    expect(result.toText(false)).toBe('说 "yidong Hello"');
});
test('ranks original spelling before full pinyin before initials', () => {
    const q = make(block('initials', ['意义']), block('full', ['衣']), block('literal', ['yi']));
    expect(q.queryWorkspace('yi').results.map(r => r.getBlock().typeInfo.id)).toEqual(['literal', 'full', 'initials']);
});
test('reindexes names and does not merge distinct custom blocks with the same opcode', () => {
    const a = block('procedures_call', ['测试']);
    const b = block('procedures_call', ['测试']);
    const q = make(a, b);
    expect(q.queryWorkspace('cs').results).toHaveLength(2);
    q.indexWorkspace([block('new', ['新名称'])]);
    expect(q.queryWorkspace('cs').results).toHaveLength(0);
    expect(q.queryWorkspace('xmc').results).toHaveLength(1);
});
test('caches aliases, preserves Latin text and supports v', () => {
    const aliases = createSearchAliases();
    expect(aliases('绿旗').map(a => a.text)).toEqual(['绿旗', 'lvqi', 'lq']);
    expect(aliases('绿旗')).toBe(aliases('绿旗'));
    expect(aliases('移动ABC').map(a => a.text)).toEqual(['移动abc', 'yidongabc', 'ydabc']);
    expect(aliases('abc')).toEqual([{text: 'abc', rank: 0}]);
});
test('ghost text only appends while Tab can produce Chinese', () => {
    expect(appendableSuggestion('YID', 'yidong')).toBe('');
    expect(appendableSuggestion('yd', '移动')).toBe('');
    expect(appendableSuggestion('yid', 'yidong')).toBe('yidong');
    const result = make(move()).queryWorkspace('yid').results[0];
    expect(result.toText(true).startsWith('yid')).toBe(true);
    expect(result.toText(false)).toContain('移动');
});
test('preserves English search and free unquoted Latin text', () => {
    const q = make(block('move', ['move', number(), 'steps']),
        block('say', ['say', new BlockInputString(0, 0, 'hello')]),
        block('variable', ['你好'], BlockShape.Round));
    expect(q.queryWorkspace('move 42 steps').results[0].getBlock().inputs).toEqual(['42']);
    expect(q.queryWorkspace('mov').results[0].toText(false)).toContain('move');
    const result = q.queryWorkspace('say nihao').results[0];
    expect(result.getBlock().inputs).toEqual(['nihao']);
    expect(result.toText(false)).toBe('say nihao');
});
test('supports fallback name search, context readings and mixed Latin labels', () => {
    const q = make(block('rotation', ['将旋转方式设为', new BlockInputEnum([['左右翻转', 'left-right']], 0, 0, false)]));
    expect(q.queryWorkspace('zyfz').results[0].getBlock().inputs[0].value).toBe('left-right');
    expect(createSearchAliases()('重复执行').map(a => a.text)).toContain('chongfuzhixing');
    expect(make(block('mixed', ['移动ABC'])).queryWorkspace('ydabc').results).toHaveLength(1);
});
