/* eslint-env node */
/* eslint-disable import/no-commonjs */
const patches = require('./editor-windows.json');
module.exports = (file, source) => {
    const patch = patches.find(item => item.file === file);
    if (!patch) return source;
    for (const {before, after} of patch.replacements) {
        if (source.split(before).length !== 2) {
            throw new Error(`Local editor-windows patch no longer matches ${file}; rebase it before pulling addons.`);
        }
        source = source.replace(before, () => after);
    }
    return source;
};
