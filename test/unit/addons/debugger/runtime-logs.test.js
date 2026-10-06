import fs from 'fs';
import path from 'path';
import IntlMessageFormat from 'intl-messageformat';
import buildAddonTranslations from '../../../../scripts/loaders/addon-translations';
import {followRuntimeLogs, isCloneLimit, logToRuntime, toLogRow}
    from '../../../../src/addons/addons/debugger/runtime-logs';

const msg = (id, values) => id === 'clone-of' ? `clone of ${values.sprite}` : id;
const record = (id, extra = {}) => ({id, message: 'bad ID', level: 'warn', source: 'clones',
    code: 'INVALID_CLONE_ID', count: 1, targetId: 'clone', originalTargetId: 'sprite', targetName: 'Enemy',
    publicId: '@clone:boss', isClone: true, blockId: 'block', ...extra});

test('internal warnings remain visible to unread tracking and use saved clone provenance', () => {
    const row = toLogRow(record(1), msg);
    expect(row.targetInfo).toEqual({exists: true, originalId: 'sprite', name: 'clone of Enemy (@clone:boss)'});
    expect(row.internal).toBe(false);
    expect(row.preview).toBe(false);
    expect(row.code).toBe('INVALID_CLONE_ID');
    expect(toLogRow(record(2, {source: 'debugger'}), msg).internal).toBe(false);
    expect(toLogRow(record(3, {source: 'debugger', level: 'log'}), msg).internal).toBe(true);
    expect(toLogRow(record(4, {source: 'script'}), msg).preview).toBe(true);
    expect(toLogRow(record(5, {targetId: ''}), msg).targetInfo).toBe(null);
});

test('late subscription replays history, updates counts in place, clears and releases listeners', () => {
    let sync;
    const unsubscribe = jest.fn();
    const logger = {
        getEntries: () => [record(1)],
        subscribe: listener => { sync = listener; return unsubscribe; }
    };
    const update = jest.fn();
    const dispose = followRuntimeLogs(logger, msg, update);
    const row = update.mock.calls[0][0][0];
    expect(update.mock.calls[0][1]).toBe(true);
    sync([record(1, {count: 20})]);
    expect(update.mock.calls[1][0][0]).toBe(row);
    expect(row.count).toBe(20);
    expect(update.mock.calls[1][1]).toBe(true);
    sync([record(1, {count: 20}), record(2, {source: 'debugger', level: 'log'})]);
    expect(update.mock.calls[2][1]).toBe(false);
    sync([]);
    expect(update).toHaveBeenLastCalledWith([], false);
    sync([record(3)]);
    expect(update.mock.calls[4][0][0]).not.toBe(row);
    dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('legacy log blocks and lifecycle events use the same logger without retaining threads', () => {
    const logger = {captureContext: jest.fn(() => ({targetId: 'sprite', blockId: 'block'})),
        log: jest.fn(), warn: jest.fn(), error: jest.fn()};
    const thread = {};
    logToRuntime(logger, 'hello', thread, 'log');
    expect(logger.log).toHaveBeenCalledWith('hello', {targetId: 'sprite', blockId: 'block', source: 'script'});
    logToRuntime(logger, 'limit', thread, 'internal-warn');
    expect(logger.warn).toHaveBeenCalledWith('limit', {targetId: 'sprite', blockId: 'block', source: 'debugger'});
    logToRuntime(logger, 'green flag', null, 'internal');
    expect(logger.log).toHaveBeenLastCalledWith('green flag', {
        targetId: 'sprite', blockId: 'block', source: 'debugger'
    });
});

const upstreamDirectory = path.resolve(__dirname, '../../../../src/addons/addons-l10n');
const upstreamCloneMessages = fs.readdirSync(upstreamDirectory).filter(file => file.endsWith('.json'))
    .map(file => [file.slice(0, -5),
        JSON.parse(fs.readFileSync(path.join(upstreamDirectory, file), 'utf8'))['debugger/log-msg-clone-cap']])
    .filter(([, template]) => template);

test.each(upstreamCloneMessages)('clone limits inherit the upstream %s wording and preserve names', (locale, template) => {
    expect(template).toMatch(/300|\{limit\}/);
    const messages = JSON.parse(buildAddonTranslations(JSON.stringify({'debugger/log-msg-clone-cap': template})));
    expect(messages['debugger/log-msg-clone-cap']).toContain('{limit}');
    const message = jest.fn((id, values) => new IntlMessageFormat(messages[`debugger/${id}`], locale).format(values));
    const name = 'Group300/$&';
    for (const source of ['clones', 'containers']) {
        for (const limit of ['0', '2', '300', '1000']) {
            const entry = record(1, {source, code: 'CLONE_LIMIT', subjectName: name, limit, isClone: false});
            const expected = new IntlMessageFormat(template.replace('300', limit), locale).format({sprite: name});
            expect(toLogRow(entry, message).text).toBe(expected);
            expect(message).toHaveBeenLastCalledWith('log-msg-clone-cap', {sprite: name, limit});
        }
    }
});

test.each(['三百个', '３００個', '300 or 300'])('unexpected clone-limit wording fails the build: %s', template => {
    expect(() => buildAddonTranslations(JSON.stringify({'debugger/log-msg-clone-cap': template})))
        .toThrow('debugger/log-msg-clone-cap');
});

test('the build adapter preserves unrelated translations and already parameterized clone limits', () => {
    for (const messages of [
        {'debugger/log-msg-clone-cap': '{sprite}: {limit}', unrelated: '300'},
        {unrelated: '300'},
        {'debugger/log-msg-clone-cap': null, unrelated: '300'}
    ]) {
        expect(JSON.parse(buildAddonTranslations(JSON.stringify(messages)))).toEqual(messages);
    }
});

test('only clone and container capacity diagnostics use the clone-limit message', () => {
    expect(isCloneLimit(record(1))).toBe(false);
    expect(isCloneLimit(record(1, {source: 'unrelated', code: 'CLONE_LIMIT'}))).toBe(false);
});

test('the original clone-limit switch filters history and unread changes without hiding other diagnostics', () => {
    const entries = [record(1, {code: 'CLONE_LIMIT'}),
        record(2, {code: 'CLONE_LIMIT', source: 'containers'}), record(3)];
    let enabled = false;
    let sync;
    const logger = {getEntries: () => entries, subscribe: listener => { sync = listener; return () => {}; }};
    const update = jest.fn();
    followRuntimeLogs(logger, msg, update, entry => !isCloneLimit(entry) || enabled);
    expect(update.mock.calls[0][0].map(row => row.id)).toEqual([3]);
    enabled = true;
    sync(entries);
    expect(update.mock.calls[1][0].map(row => row.id)).toEqual([1, 2, 3]);
    enabled = false;
    sync(entries.slice(0, 2));
    expect(update).toHaveBeenLastCalledWith([], false);
    expect(logger.getEntries()).toHaveLength(3);
});
