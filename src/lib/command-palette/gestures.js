import palette from './service';

// Install once per Blockly instance. Keeping a passive wrapper is safe even when
// another addon has wrapped it later; only its active host handles the gesture.
const installed = new WeakMap();
export default Blockly => {
    const prototype = Blockly && Blockly.Gesture && Blockly.Gesture.prototype;
    if (!prototype) return () => {};
    let state = installed.get(prototype);
    if (!state) {
        state = {users: 0};
        installed.set(prototype, state);
        const original = prototype.doBlockClick_;
        prototype.doBlockClick_ = function () {
            const event = this.mostRecentEvent_;
            if (state.users && event && (event.button === 1 || event.shiftKey)) {
                for (let block = this.startBlock_; block; block = block.getSurroundParent()) {
                    // jump-to-def retains priority for calls while enabled.
                    if (this.jumpToDef && block.type === 'procedures_call') break;
                    if (block.type === 'procedures_definition' || block.type === 'procedures_call' ||
                        block.type.startsWith('data_') || block.type.startsWith('event_broadcast') ||
                        block.type === 'event_whenbroadcastreceived') {
                        if (palette.open({mode: 'symbols', blockId: block.id})) return;
                    }
                }
            }
            return original.call(this);
        };
    }
    state.users++;
    return () => state.users--;
};
