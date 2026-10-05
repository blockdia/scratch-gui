// A shared menu shadow may keep a selection unavailable in its new target's menu.
// Preserve its value and readable label, including a relative selection shared to the stage.
export default (ScratchBlocks, getIntl) => {
    for (const [menu, relative, label] of [
        ['containers', '_mycontainer_', () => getIntl().formatMessage({
            id: 'containers.containingContainer', defaultMessage: 'my container'
        })],
        ['ancestorContainers', '_mycontainer_', () => getIntl().formatMessage({
            id: 'containers.innermostContainer', defaultMessage: 'innermost'
        })],
        ['positionTargets', '_myself_', () =>
            ScratchBlocks.ScratchMsgs.translate('CONTROL_CREATECLONEOF_MYSELF', 'myself')]
    ]) {
        const definition = ScratchBlocks.Blocks[`containers_menu_${menu}`];
        if (!definition) continue;
        const init = definition.init;
        definition.init = function () {
            init.call(this);
            const field = this.getField(menu);
            const setValue = field.setValue;
            field.setValue = function (value) {
                setValue.call(this, value);
                if (this.getValue() === relative) {
                    this.setText(label());
                }
            };
        };
    }
};
