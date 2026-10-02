// This integration suite intentionally resolves coordinated sibling VM sources.
const base = require('../package.json').jest;
module.exports = {
    ...base,
    rootDir: '..',
    testMatch: ['<rootDir>/test/unit/lib/sprite-containers.test.js',
        '<rootDir>/test/unit/lib/folders.test.js', '<rootDir>/test/unit/lib/folder-order.test.js'],
    moduleNameMapper: {
        ...base.moduleNameMapper,
        '^scratch-vm/(.*)$': '<rootDir>/../scratch-vm/$1'
    }
};
