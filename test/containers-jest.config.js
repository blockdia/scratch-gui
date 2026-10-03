// This integration suite intentionally resolves coordinated sibling VM sources.
const base = require('../package.json').jest;
module.exports = {
    ...base,
    rootDir: '..',
    testMatch: ['<rootDir>/test/unit/lib/sprite-containers.test.js',
        '<rootDir>/test/containers/stage-drag.test.js',
        '<rootDir>/test/containers/container-events.test.js',
        '<rootDir>/test/unit/lib/container-properties.test.js',
        '<rootDir>/test/unit/lib/folders.test.js', '<rootDir>/test/unit/lib/folder-order.test.js',
        '<rootDir>/test/unit/addons/layer-manager.test.js',
        '<rootDir>/test/containers/layer-manager.test.js',
        '<rootDir>/test/unit/editor-windows/layer-manager-window.test.js'],
    moduleNameMapper: {
        ...base.moduleNameMapper,
        '^scratch-vm$': '<rootDir>/../scratch-vm/src/index.js',
        '^scratch-vm/(.*)$': '<rootDir>/../scratch-vm/$1',
        '^scratch-render/(.*)$': '<rootDir>/../scratch-render/$1'
    }
};
