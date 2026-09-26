import {analyzeProject, originalTargets, visibleMonitors, RULES} from './analyzer';

// Structural fingerprints deliberately exclude live variable values and positions.
const targetSignature = targets => JSON.stringify(targets.map(target => [target.id, target.getName(),
    Object.values(target.variables || {}).map(variable =>
        [variable.id, variable.name, variable.type, variable.isCloud])]));
export const createLinterModel = (vm, getRules = () => RULES) => {
    let active = false;
    let revision = 0;
    let timer;
    let signature;
    let monitorSignature;
    let snapshot = {status: 'idle', results: [], targets: [], revision};
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
        const iterator = analyzeProject(targets, monitors, getRules());
        const step = () => {
            if (!active || revision !== current) return;
            try {
                // A cap as well as a time budget keeps tests deterministic and
                // prevents very large projects from monopolizing the editor.
                const deadline = Date.now() + 8;
                for (let count = 0; count < 250; count++) {
                    const next = iterator.next();
                    if (next.done) {
                        publish({status: 'ready', results: next.value});
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
            vm.runtime[method]('PROJECT_LOADED', loaded);
            vm.runtime[method]('MONITORS_UPDATE', monitorsChanged);
            if (active) scan();
            else cancel();
        }
    };
};
