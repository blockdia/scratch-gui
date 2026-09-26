/* Static source inventory: no VM/extension construction, network or hardware access. */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const expected = require('../src/addons/addons/linter/opcode-coverage.json');
const visit = (node, fn) => {
    if (!node || typeof node !== 'object') return;
    fn(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => visit(child, fn));
        else if (value && typeof value === 'object') visit(value, fn);
    }
};
const name = node => node && (node.name || node.value);
const inventory = (vmRoot, blocksRoot) => {
    const result = {};
    const add = (opcode, source, kind) => {
        if (!result[opcode]) result[opcode] = {source, kind};
    };
    const inspect = (file, extension) => {
        const source = fs.readFileSync(path.join(vmRoot, file), 'utf8');
        const ast = parser.parse(source, {sourceType: 'unambiguous'});
        visit(ast, node => {
            if (node.type === 'ClassMethod' && ['getPrimitives', 'getHats'].includes(name(node.key))) {
                visit(node.body, value => {
                    if (value.type !== 'ReturnStatement' || !value.argument ||
                        value.argument.type !== 'ObjectExpression') return;
                    for (const prop of value.argument.properties) {
                        add(name(prop.key), file,
                            name(node.key) === 'getHats' ? 'event' : 'primitive');
                    }
                });
            }
            if (extension && node.type === 'ObjectProperty' && name(node.key) === 'opcode' &&
                node.value.type === 'StringLiteral') add(`${extension}_${node.value.value}`, file, 'extension');
            if (extension && node.type === 'ObjectProperty' && name(node.key) === 'menus' &&
                node.value.type === 'ObjectExpression') {
                for (const prop of node.value.properties) add(`${extension}_menu_${name(prop.key)}`, file, 'menu');
            }
        });
    };
    for (const file of fs.readdirSync(path.join(vmRoot,
        'src/blocks')).filter(entry => /^scratch3_.*\.js$/.test(entry))) {
        inspect(`src/blocks/${file}`, file === 'scratch3_core_example.js' ? 'coreExample' : null);
    }
    for (const file of ['src/compiler/compat-blocks.js', 'src/compiler/irgen.js']) {
        const ast = parser.parse(fs.readFileSync(path.join(vmRoot, file), 'utf8'), {sourceType: 'unambiguous'});
        visit(ast, node => {
            const value = file.endsWith('compat-blocks.js') && node.type === 'StringLiteral' ? node.value :
                node.type === 'SwitchCase' && node.test && node.test.type === 'StringLiteral' ? node.test.value : '';
            if (/^(motion|looks|sound|event|control|sensing|operator|data|procedures|argument)_/.test(value)) {
                add(value, file, 'compatibility');
            }
        });
    }
    const ids = {scratch3_video_sensing: 'videoSensing', scratch3_gdx_for: 'gdxfor'};
    for (const dir of fs.readdirSync(path.join(vmRoot, 'src/extensions'))) {
        if (!fs.existsSync(path.join(vmRoot, 'src/extensions', dir, 'index.js'))) continue;
        inspect(`src/extensions/${dir}/index.js`, ids[dir] || dir.replace('scratch3_', ''));
    }
    for (const dir of ['blocks_common', 'blocks_vertical']) {
        for (const file of fs.readdirSync(path.join(blocksRoot, dir)).filter(entry => entry.endsWith('.js'))) {
            const source = fs.readFileSync(path.join(blocksRoot, dir, file), 'utf8');
            const regex = /Blockly\.Blocks\[['"]([^'"]+)['"]\]/g;
            let match;
            while ((match = regex.exec(source))) add(match[1], `scratch-blocks/${dir}/${file}`, 'editor');
        }
    }
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
};
module.exports = inventory;
if (require.main === module) {
    const vmRoot = process.argv[2] || path.dirname(require.resolve('scratch-vm/package.json'));
    const blocksRoot = process.argv[3] || path.dirname(require.resolve('scratch-blocks/package.json'));
    const actual = inventory(vmRoot, blocksRoot);
    const missing = Object.keys(actual).filter(op => !expected[op]);
    const stale = Object.keys(expected).filter(op => !actual[op]);
    if (missing.length || stale.length) {
        process.stderr.write(JSON.stringify({missing, stale}, null, 2));
        process.exitCode = 1;
    } else process.stdout.write(`${Object.keys(actual).length} opcodes classified.\n`);
}
