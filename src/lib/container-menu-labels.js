// A shared menu shadow may keep a selection unavailable in its new target's menu.
// Preserve its value and readable label, including a relative selection shared to the stage.
export default (ScratchBlocks, getIntl) => {
    const definition = ScratchBlocks.Blocks.containers_menu_containers;
    const init = definition.init;
    definition.init = function () {
        init.call(this);
        const field = this.getField('containers');
        const setValue = field.setValue;
        field.setValue = function (value) {
            setValue.call(this, value);
            const selected = this.getValue();
            if (selected === '_mycontainer_') {
                this.setText(getIntl().formatMessage({
                    id: 'containers.containingContainer',
                    defaultMessage: 'containing container'
                }));
            }
        };
    };
};
