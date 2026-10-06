/* eslint-env browser */
/* global vm */
// Run against an editor started with BLOCKDIA_LOCAL_PACKAGES=1.
const {chromium} = require(process.env.COMPONENTS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('assert/strict');
const {commit: version} = require('../src/addons/generated/upstream-meta.json');
const upstreamEnglish = require('../src/addons/addons-l10n/en.json');
const upstreamFrench = require('../src/addons/addons-l10n/fr.json');

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.COMPONENTS_CHROME_PATH});
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            localStorage.setItem('tw:language', 'zh-cn');
            localStorage.setItem('tw:addons', JSON.stringify({debugger: {log_failed_clone_creation: false}}));
        });
        await page.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8630/editor.html');
        await page.waitForFunction(() => window.vm && vm.editingTarget && vm.editingTarget.sprite.costumes.length);
        const button = page.locator('[data-window-button$="debugger"]');
        await button.waitFor({state: 'visible'});
        await page.evaluate(async () => {
            vm.extensionManager.loadExtensionIdSync('clones');
            vm.extensionManager.loadExtensionIdSync('containers');
            const caller = vm.editingTarget;
            vm.renameSprite(caller.id, 'Caller');
            await vm.duplicateSprite(caller.id);
            vm.renameSprite(vm.editingTarget.id, 'Group//One');
            await vm.duplicateSprite(caller.id);
            vm.renameSprite(vm.editingTarget.id, 'Group//Nested//Two');
            vm.setSpriteFolderContainer('Group', true);
            vm.setSpriteFolderContainer('Group//Nested', true);
            vm.setEditingTarget(vm.runtime.getTargetForStage().id);
            const blocks = [
                ['native', 'control_create_clone_of', {CLONE_OPTION: 'Group//One'}],
                ['id', 'clones_createWithId', {TARGET: 'Group//One', ID: 'boss'}],
                ['group', 'containers_createClone', {CONTAINER: '@container:Group'}],
                ['group-id', 'containers_createWithId', {CONTAINER: '@container:Group', ID: 'squad'}],
                ['invalid', 'clones_createWithId', {TARGET: 'Group//One', ID: '123'}],
                ['invalid-group', 'containers_createWithId', {CONTAINER: '@container:Group', ID: '123'}]
            ];
            for (const [id, opcode, values] of blocks) {
                caller.blocks.createBlock({id,
                    opcode,
                    parent: null,
                    next: null,
                    fields: {},
                    topLevel: true,
                    shadow: false,
                    inputs: Object.fromEntries(Object.keys(values).map(name =>
                        [name, {name, block: `${id}-${name}`, shadow: `${id}-${name}`}]))});
                for (const [name, value] of Object.entries(values)) {
                    caller.blocks.createBlock({id: `${id}-${name}`,
                        opcode: 'text',
                        parent: id,
                        next: null,
                        topLevel: false,
                        shadow: true,
                        inputs: {},
                        fields: {TEXT: {name: 'TEXT', value}}});
                }
            }
        });
        // Use the same versioned channel as the settings window, without reloading the editor.
        const setLimitLogging = enabled => page.evaluate(({value, settingsVersion}) => {
            const channel = new BroadcastChannel('addons-change');
            channel.postMessage({version: settingsVersion, store: {debugger: {log_failed_clone_creation: value}}});
            channel.close();
        }, {value: enabled, settingsVersion: version});
        const dialog = page.locator('[data-editor-window$="debugger"]');
        const limitRows = page.locator('.sa-debugger-log[data-code="CLONE_LIMIT"]');
        const invalidRow = page.locator('.sa-debugger-log[data-code="INVALID_CLONE_ID"][data-source="clones"]');
        for (const enabled of [false, true]) {
            const result = await page.evaluate(compiler => {
                vm.stopAll();
                vm.setCompilerOptions({enabled: compiler});
                const runtime = vm.runtime;
                const caller = runtime.getSpriteTargetByName('Caller');
                runtime.runtimeOptions.maxClones = 2;
                for (let i = 0; i < 2; i++) runtime.ext_scratch3_control._createClone('_myself_', caller);
                runtime.logger.clear();
                const compiled = [];
                for (const id of ['native', 'id', 'group', 'group-id']) {
                    const thread = runtime._pushThread(id, caller, {stackClick: true});
                    for (let step = 0; step < 8; step++) runtime._step();
                    compiled.push(Boolean(thread.isCompiled));
                }
                runtime.logger.flush();
                return {compiled,
                    entries: runtime.logger.getEntries(),
                    clones: runtime._cloneCounter,
                    groups: runtime.spriteContainers.cloneDefinitions.size};
            }, enabled);
            assert.deepEqual(result.compiled, [enabled, enabled, enabled, enabled]);
            assert.equal(result.clones, 2);
            assert.equal(result.groups, 0, 'failed group creation leaves no partial container');
            assert.equal(result.entries.length, 4, JSON.stringify(result));
            assert.deepEqual(result.entries.map(entry => entry.subjectName),
                ['Group//One', 'Group//One', 'Group', 'Group']);
            assert.deepEqual(result.entries.map(entry => entry.blockId), ['native', 'id', 'group', 'group-id']);
            assert.ok(result.entries.every(entry => entry.code === 'CLONE_LIMIT' && entry.count === 1));
            assert.notEqual(await button.getAttribute('data-unread'), 'true', 'disabled capacity logs stay read');
            await setLimitLogging(true);
            await page.waitForFunction(() =>
                document.querySelector('[data-window-button$="debugger"]').dataset.unread === 'true');
            await button.click();
            await limitRows.last().waitFor({state: 'visible'});
            assert.equal(await limitRows.count(), 4, 'one warning per failed operation');
            assert.deepEqual(await limitRows.locator('.sa-debugger-log-text').allTextContents(), [
                '无法创建“Group//One”的克隆体，不能创建超过2个克隆体。',
                '无法创建“Group//One”的克隆体，不能创建超过2个克隆体。',
                '无法创建“Group”的克隆体，不能创建超过2个克隆体。',
                '无法创建“Group”的克隆体，不能创建超过2个克隆体。'
            ]);
            if (enabled) await page.screenshot({path: '/tmp/blockdia-clone-limit-logs.png'});
            await setLimitLogging(false);
            await limitRows.first().waitFor({state: 'detached'});
            const idFailures = await page.evaluate(() => {
                const runtime = vm.runtime;
                runtime.runtimeOptions.maxClones = Infinity;
                const caller = runtime.getSpriteTargetByName('Caller');
                const compiled = [];
                for (const id of ['invalid', 'invalid-group', 'group-id', 'group-id']) {
                    const thread = runtime._pushThread(id, caller, {stackClick: true});
                    for (let step = 0; step < 8; step++) runtime._step();
                    compiled.push(Boolean(thread.isCompiled));
                }
                runtime.logger.flush();
                return {compiled, entries: runtime.logger.getEntries().slice(4), clones: runtime._cloneCounter};
            });
            assert.deepEqual(idFailures.compiled, [enabled, enabled, enabled, enabled]);
            assert.equal(idFailures.clones, 4, 'failed ID attempts do not create partial groups');
            assert.deepEqual(idFailures.entries.map(entry => [entry.source, entry.code, entry.count, entry.blockId]), [
                ['clones', 'INVALID_CLONE_ID', 1, 'invalid'],
                ['containers', 'INVALID_CLONE_ID', 1, 'invalid-group'],
                ['containers', 'CLONE_ID_IN_USE', 1, 'group-id']
            ]);
            await invalidRow.waitFor({state: 'visible'});
            const conflictRow = page.locator('.sa-debugger-log[data-code="CLONE_ID_IN_USE"]');
            await conflictRow.waitFor({state: 'visible'});
            assert.match(await conflictRow.textContent(), /@container-clone:squad/);
            assert.equal(await page.evaluate(() => vm.runtime.logger.getEntries().length), 7,
                'display settings preserve independent VM history');
            const downloadPromise = page.waitForEvent('download');
            await dialog.getByRole('button', {name: '导出', exact: true}).click();
            const download = await downloadPromise;
            const chunks = [];
            for await (const chunk of await download.createReadStream()) chunks.push(chunk);
            const exported = Buffer.concat(chunks).toString('utf8');
            assert.match(exported, /ID/);
            assert.doesNotMatch(exported, /超过/);
            assert.equal(exported.trim().split('\n').length, 3);
            await dialog.getByRole('button', {name: '导出', exact: true}).click({modifiers: ['Shift']});
            const prompt = page.locator('[data-addon-modal]');
            await prompt.waitFor({state: 'visible'});
            assert.match(await prompt.textContent(),
                /可用占位符：\{sprite\}, \{content\}, \{type\}, \{count\}, \{source\}, \{code\}/);
            if (enabled) await page.screenshot({path: '/tmp/blockdia-log-export-format.png'});
            await prompt.locator('input').fill('{count}|{source}|{code}');
            const customDownloadPromise = page.waitForEvent('download');
            await prompt.locator('input').press('Enter');
            const customChunks = [];
            for await (const chunk of await (await customDownloadPromise).createReadStream()) customChunks.push(chunk);
            const customExported = Buffer.concat(customChunks).toString('utf8');
            assert.deepEqual(customExported.trim().split('\n'), [
                '1|clones|INVALID_CLONE_ID', '1|containers|INVALID_CLONE_ID', '1|containers|CLONE_ID_IN_USE'
            ]);
            // The modal takes focus outside the unpinned debugger; reopen its retained window.
            if (await button.getAttribute('data-status') !== 'visible') await button.click();
            await dialog.getByRole('button', {name: '清除', exact: true}).click();
            await dialog.getByRole('button', {name: '关闭', exact: true}).click();
            console.log(`PASS compiler=${enabled}: native/ID/container limits, settings, dynamic filter, export`);
        }
        // Exercise both the eager English resource and a lazy locale outside the Blockdia overlays.
        for (const [locale, messages] of Object.entries({en: upstreamEnglish, fr: upstreamFrench})) {
            const localized = await browser.newPage();
            localized.on('pageerror', error => errors.push(error.message));
            await localized.addInitScript(language => {
                localStorage.setItem('tw:language', language);
                localStorage.setItem('tw:addons', '{}');
            }, locale);
            await localized.goto(process.env.COMPONENTS_EDITOR_URL || 'http://127.0.0.1:8630/editor.html');
            const localizedButton = localized.locator('[data-window-button$="debugger"]');
            await localizedButton.waitFor({state: 'visible'});
            await localized.evaluate(() => {
                const runtime = vm.runtime;
                const source = runtime.targets.find(target => target.isOriginal && !target.isStage);
                vm.renameSprite(source.id, 'Group300/$&');
                runtime.runtimeOptions.maxClones = 0;
                source.makeClone();
                runtime.logger.flush();
            });
            await localizedButton.click();
            const text = localized.locator('.sa-debugger-log[data-code="CLONE_LIMIT"] .sa-debugger-log-text');
            await text.waitFor({state: 'visible'});
            const upstream = messages['debugger/log-msg-clone-cap'];
            assert.equal(await text.textContent(),
                upstream.replace('300', '0').replace('{sprite}', () => 'Group300/$&'));
            await localized.close();
            console.log(`PASS bundled ${locale}: parameterized upstream message and unchanged sprite name`);
        }
        assert.deepEqual(errors, []);
        console.log('PAGE_ERRORS', errors);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
