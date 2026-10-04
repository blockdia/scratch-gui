// Test installed packages by default; match webpack's explicit local-source switch.
const base = require('../package.json').jest;
const localPackages = process.env.BLOCKDIA_LOCAL_PACKAGES === '1';
module.exports = {
    ...base,
    rootDir: '..',
    testMatch: ['<rootDir>/test/unit/lib/sprite-containers.test.js',
        '<rootDir>/test/containers/stage-drag.test.js',
        '<rootDir>/test/containers/container-events.test.js',
        '<rootDir>/test/containers/folder-references.test.js',
        '<rootDir>/test/unit/lib/container-properties.test.js',
        '<rootDir>/test/unit/lib/container-native-messages.test.js',
        '<rootDir>/test/unit/lib/folders.test.js', '<rootDir>/test/unit/lib/folder-order.test.js',
        '<rootDir>/test/unit/addons/layer-manager.test.js',
        '<rootDir>/test/containers/layer-manager.test.js',
        '<rootDir>/test/unit/editor-windows/layer-manager-window.test.js'],
    moduleNameMapper: {
        ...base.moduleNameMapper,
        ...(localPackages ? {
            '^scratch-vm$': '<rootDir>/../scratch-vm/src/index.js',
            '^scratch-vm/(.*)$': '<rootDir>/../scratch-vm/$1',
            '^scratch-render$': '<rootDir>/../scratch-render/src/index.js',
            '^scratch-render/(.*)$': '<rootDir>/../scratch-render/$1'
        } : {})
    }
};
