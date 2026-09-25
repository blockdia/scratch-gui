// Focused controller tests without a browser, renderer, or VM runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const identity = value => value;
const reactRedux = {connect: () => identity};
const load = (filename, mocks, globals = {}) => {
  const output = {exports: {}};
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: [['@babel/preset-env', {targets: {node: 'current'}}], '@babel/preset-react']
  });
  vm.runInNewContext(code, {
    module: output, exports: output.exports,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    ...globals
  }, {filename});
  return output.exports.default;
};
const Geometry = load(path.resolve(__dirname, '../src/containers/component-geometry.jsx'), {
  'react-redux': reactRedux,
  'react-intl': {injectIntl: identity, intlShape: () => null},
  'scratch-vm': class VM {},
  '../lib/component-messages': {},
  '../components/component-panel/component-panel.css': {}
});
let commits = 0;
const geometry = new Geometry({
  config: {metadata: {sliderTrack: {start: [-84, 0], end: [84, 0]}}},
  vm: {setComponentMetadata: () => commits++}
});
// Simulate React batching: blur fires synchronously but setState flushes later.
const pending = [];
geometry.setState = (update, callback) => pending.push(() => {
  Object.assign(geometry.state, typeof update === 'function' ? update(geometry.state) : update);
  if (callback) callback();
});
geometry.state.coordinateInput = {endpoint: 'start', axis: 'x', value: '-10'};
geometry.handleCoordinateKeyDown({key: 'Escape', currentTarget: {blur: geometry.handleCoordinateCommit}});
while (pending.length) pending.shift()();
assert.equal(commits, 0, 'Escape must discard the draft before blur can commit');
assert.equal(geometry.state.draft, null);

let lastMetadata;
geometry.props.vm.setComponentMetadata = (targetId, metadata) => { commits++; lastMetadata = metadata; };
for (const value of ['', '-1', '-12']) {
  geometry.handleCoordinateChange({target: {value, dataset: {endpoint: 'start', axis: 'x'}}});
  while (pending.length) pending.shift()();
  assert.equal(geometry.state.coordinateInput.value, value);
  assert.equal(commits, 0, 'typing does not commit partial coordinates');
}
geometry.handleCoordinateCommit();
while (pending.length) pending.shift()();
assert.equal(lastMetadata.sliderTrack.start[0], -12);
assert.equal(commits, 1);
for (const value of ['', 'NaN']) {
  geometry.handleCoordinateChange({target: {value, dataset: {endpoint: 'end', axis: 'y'}}});
  while (pending.length) pending.shift()();
  geometry.handleCoordinateCommit();
  while (pending.length) pending.shift()();
}
assert.equal(commits, 1, 'incomplete coordinates are discarded, not converted to zero');

const KeyboardHOC = load(path.resolve(__dirname, '../../scratch-paint/src/hocs/keyboard-shortcuts-hoc.jsx'), {
  'react-redux': reactRedux,
  './copy-paste-hoc.jsx': identity,
  '../helper/bitmap': {}, '../helper/selection': {}, '../helper/group': {},
  '../reducers/selected-items': {}, '../reducers/modes': {},
  '../lib/format': {}, '../lib/modes': {}
}, {HTMLInputElement: class {}, HTMLTextAreaElement: class {}});
const calls = [];
const Keyboard = KeyboardHOC(() => null);
const keyboard = new Keyboard({
  controlPointEditor: {active: true, onUndo: () => calls.push('undo'), onRedo: () => calls.push('redo')},
  changeMode: () => { throw new Error('paint mode changed'); },
  onUpdateImage: () => { throw new Error('costume changed'); }
});
for (const key of ['b', 'Delete', 'Backspace', 'Escape']) {
  keyboard.handleKeyPress({key, target: {}, preventDefault() {}});
}
for (const [key, shiftKey] of [['z', false], ['z', true], ['y', false]]) {
  keyboard.handleKeyPress({key, shiftKey, ctrlKey: true, target: {}, preventDefault() {}});
}
assert.deepEqual(calls, ['undo', 'redo', 'redo']);
console.log('Control-point contracts passed: Escape cancellation, disabled paint shortcuts, geometry undo/redo.');
