import {analyzeProject, originalTargets, visibleMonitors, DEFAULT_RULES} from './analyzer';
import {resources} from './semantics';

// Structural fingerprints deliberately exclude live variable values and positions.
const targetSignature = targets => JSON.stringify(targets.map(target => [target.id, target.getName(),
    Object.values(target.variables || {}).map(variable =>
        [variable.id, variable.name, variable.type, variable.isCloud]),
    ['costume', 'sound'].map(kind => resources(target, kind).map(item => [item.name, item.assetId])),
    target.component && [target.component.type, target.component.parts], Boolean(target.componentError)]));
export const createLinterModel = (vm, getRules = () => DEFAULT_RULES, options = {}) => {
    let active = false;
    let revision = 0;
    let timer;
    let signature;
    let monitorSignature;
    let snapshot = {status: 'idle',
        results: [],
        targets: [],
        revision,
        coverage: {limitations: [],
            unknownOpcodes: []}};
    const listeners = new Set();
    const publish = update => {
        snapshot = {...snapshot, ...update};
        listeners.forEach(listener => listener(snapshot));
    };
    const cancel = () => {
        revision++;
        clearTimeout(timer);
    };
    const scan = () => {
        if (!active) return;
        cancel();
        const current = revision;
        const targets = originalTargets(vm.runtime);
        const monitors = visibleMonitors(vm.runtime);
        signature = targetSignature(targets);
        monitorSignature = JSON.stringify(monitors);
        publish({status: 'scanning',
            revision: current,
            targets: targets.map(target => ({id: target.id, name: target.getName(), isStage: target.isStage}))});
        let coverage = {limitations: [], unknownOpcodes: []};
        const iterator = analyzeProject(targets, monitors, getRules(), {
            runtimeOptions: {...vm.runtime.runtimeOptions},
            compilerOptions: {...vm.runtime.compilerOptions},
            addonBlocks: vm.runtime.addonBlocks || {},
            ...options.context,
            onCoverage: value => {
                coverage = value;
            }
        });
        let work = 0;
        const step = () => {
            if (!active || revision !== current) return;
            try {
                // A cap as well as a time budget keeps tests deterministic and
                // prevents very large projects from monopolizing the editor.
                const deadline = Date.now() + 8;
                for (let count = 0; count < 250; count++) {
                    if (++work > (options.maxWork || 250000)) {
                        iterator.return();
                        publish({status: 'incomplete',
                            results: [],
                            coverage: {limitations: ['work-limit'], unknownOpcodes: []}});
                        return;
                    }
                    const next = iterator.next();
                    if (next.done) {
                        publish({status: 'ready', results: next.value, coverage});
                        return;
                    }
                    if (Date.now() >= deadline) break;
                }
                timer = setTimeout(step, 0);
            } catch (error) {
                publish({status: 'failed', results: []});
            }
        };
        timer = setTimeout(step, 0);
    };
    const invalidate = () => {
        if (!active) return;
        cancel();
        publish({status: 'stale', revision});
        timer = setTimeout(scan, 400);
    };
    const targetsChanged = () => {
        const next = targetSignature(originalTargets(vm.runtime));
        if (next !== signature) {
            signature = next;
            invalidate();
        }
    };
    const monitorsChanged = () => {
        const next = JSON.stringify(visibleMonitors(vm.runtime));
        if (next !== monitorSignature) {
            monitorSignature = next;
            invalidate();
        }
    };
    const loaded = () => {
        publish({results: [], targets: []});
        scan();
    };
    return {
        snapshot: () => snapshot,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        refresh: scan,
        invalidate,
        setVisible: visible => {
            if (active === visible) return;
            active = visible;
            const method = active ? 'on' : 'removeListener';
            vm[method]('PROJECT_CHANGED', invalidate);
            vm[method]('targetsUpdate', targetsChanged);
            vm[method]('RUNTIME_OPTIONS_CHANGED', invalidate);
            vm[method]('COMPILER_OPTIONS_CHANGED', invalidate);
            vm[method]('EXTENSION_ADDED', invalidate);
            vm.runtime[method]('PROJECT_LOADED', loaded);
            vm.runtime[method]('MONITORS_UPDATE', monitorsChanged);
            if (active) scan();
            else cancel();
        }
    };
};
