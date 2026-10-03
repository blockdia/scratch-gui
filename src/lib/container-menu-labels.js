// A shared menu shadow may keep a selection unavailable in its new target's menu.
// Preserve its value and readable label, including a relative selection shared to the stage.
export default (ScratchBlocks, getIntl) => {
    for (const [menu, relative, id, defaultMessage] of [
        ['containers', '_mycontainer_', 'containers.containingContainer', 'containing container'],
        ['sprites', '_myself_', 'containers.myself', 'myself']
    ]) {
        const definition = ScratchBlocks.Blocks[`containers_menu_${menu}`];
        const init = definition.init;
        definition.init = function () {
            init.call(this);
            const field = this.getField(menu);
            const setValue = field.setValue;
            field.setValue = function (value) {
                setValue.call(this, value);
                if (this.getValue() === relative) {
                    this.setText(getIntl().formatMessage({id, defaultMessage}));
                }
            };
        };
    }
};
