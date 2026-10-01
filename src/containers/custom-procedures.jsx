import bindAll from 'lodash.bindall';
import defaultsDeep from 'lodash.defaultsdeep';
import PropTypes from 'prop-types';
import React from 'react';
import CustomProceduresComponent from '../components/custom-procedures/custom-procedures.jsx';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import actions from '../lib/editor-actions';
import {displayBinding} from '../lib/editor-actions/keys';
import {CUSTOM_BLOCK_DIALOG, customBlockShortcuts} from '../lib/editor-actions/dialogs';
import {connect} from 'react-redux';

export class CustomProcedures extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAddLabel',
            'handleAddBoolean',
            'handleAddTextNumber',
            'handleToggleWarp',
            'handleCancel',
            'handleOk',
            'handleKeyDown',
            'handleWorkspaceKeyDown',
            'setBlocks'
        ]);
        this.state = {
            rtlOffset: 0,
            warp: false
        };
    }
    componentDidMount () {
        // Blockly text editors live outside the React modal in WidgetDiv.
        document.addEventListener('keydown', this.handleKeyDown, true);
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown, true);
        clearTimeout(this.focusTimeout);
        if (this.workspace) {
            this.workspace.dispose();
        }
    }
    setBlocks (blocksRef) {
        if (!blocksRef) return;
        this.blocks = blocksRef;
        const workspaceConfig = defaultsDeep({},
            CustomProcedures.defaultOptions,
            this.props.options,
            {rtl: this.props.isRtl}
        );

        const ScratchBlocks = LazyScratchBlocks.get();
        // @todo This is a hack to make there be no toolbox.
        const oldDefaultToolbox = ScratchBlocks.Blocks.defaultToolbox;
        ScratchBlocks.Blocks.defaultToolbox = null;
        this.workspace = ScratchBlocks.inject(this.blocks, workspaceConfig);
        ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;

        // Create the procedure declaration block for editing the mutation.
        this.mutationRoot = this.workspace.newBlock('procedures_declaration');
        // Make the declaration immovable, undeletable and have no context menu
        this.mutationRoot.setMovable(false);
        this.mutationRoot.setDeletable(false);
        this.mutationRoot.contextMenu = false;

        this.workspace.addChangeListener(() => {
            this.mutationRoot.onChangeFn();
            // Keep the block centered on the workspace
            const metrics = this.workspace.getMetrics();
            const {x, y} = this.mutationRoot.getRelativeToSurfaceXY();
            const dy = (metrics.viewHeight / 2) - (this.mutationRoot.height / 2) - y;
            let dx;
            if (this.props.isRtl) {
                // // TODO: https://github.com/LLK/scratch-gui/issues/2838
                // This is temporary until we can figure out what's going on width
                // block positioning on the workspace for RTL.
                // Workspace is always origin top-left, with x increasing to the right
                // Calculate initial starting offset and save it, every other move
                // has to take the original offset into account.
                // Calculate a new left postion based on new width
                // Convert current x position into LTR (mirror) x position (uses original offset)
                // Use the difference between ltrX and mirrorX as the amount to move
                const ltrX = ((metrics.viewWidth / 2) - (this.mutationRoot.width / 2) + 25);
                const mirrorX = x - ((x - this.state.rtlOffset) * 2);
                if (mirrorX === ltrX) {
                    return;
                }
                dx = mirrorX - ltrX;
                const midPoint = metrics.viewWidth / 2;
                if (x === 0) {
                    // if it's the first time positioning, it should always move right
                    if (this.mutationRoot.width < midPoint) {
                        dx = ltrX;
                    } else if (this.mutationRoot.width < metrics.viewWidth) {
                        dx = midPoint - ((metrics.viewWidth - this.mutationRoot.width) / 2);
                    } else {
                        dx = midPoint + (this.mutationRoot.width - metrics.viewWidth);
                    }
                    this.mutationRoot.moveBy(dx, dy);
                    this.setState({rtlOffset: this.mutationRoot.getRelativeToSurfaceXY().x});
                    return;
                }
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = dx + this.mutationRoot.width - metrics.viewWidth;
                }
            } else {
                dx = (metrics.viewWidth / 2) - (this.mutationRoot.width / 2) - x;
                // If the procedure declaration is wider than the view width,
                // keep the right-hand side of the procedure in view.
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = metrics.viewWidth - this.mutationRoot.width - x;
                }
            }
            this.mutationRoot.moveBy(dx, dy);
        });
        this.mutationRoot.domToMutation(this.props.mutator);
        this.mutationRoot.initSvg();
        this.mutationRoot.render();
        this.setState({warp: this.mutationRoot.getWarp()});
        // Allow the initial events to run to position this block, then focus.
        this.focusTimeout = setTimeout(() => {
            this.mutationRoot.focusLastEditor_();
        });
    }
    handleKeyDown (event) {
        const handler = CustomProcedures.shortcutHandlers[
            actions.matchDialogShortcut(CUSTOM_BLOCK_DIALOG, event)];
        if (handler) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!event.repeat) {
                LazyScratchBlocks.get().WidgetDiv.hide(true);
                this[handler]();
            }
            return;
        }
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!event.repeat) this.handleOk();
            return;
        }
        const ScratchBlocks = LazyScratchBlocks.get();
        const htmlInput = ScratchBlocks.FieldTextInput.htmlInput_;
        if (event.key === 'Escape' || (event.key === 'Enter' && event.target === htmlInput &&
            !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.repeat) return;
            if (event.target === htmlInput) {
                if (event.key === 'Escape') htmlInput.value = htmlInput.defaultValue;
                ScratchBlocks.WidgetDiv.hide(true);
                this.blocks.focus();
            } else if (event.key === 'Escape') this.handleCancel();
            return;
        }
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey ||
            event.target !== ScratchBlocks.FieldTextInput.htmlInput_) return;
        const fields = [];
        const visit = block => block.inputList.forEach(input => {
            input.fieldRow.forEach(field => {
                if (field instanceof ScratchBlocks.FieldTextInput) fields.push(field);
            });
            const child = input.connection && input.connection.targetBlock();
            if (child) visit(child);
        });
        visit(this.mutationRoot);
        const index = fields.indexOf(ScratchBlocks.WidgetDiv.owner_);
        if (index < 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        ScratchBlocks.WidgetDiv.hide(true);
        const next = fields[index + (event.shiftKey ? -1 : 1)];
        if (next) next.showEditor_();
        else if (event.shiftKey) this.blocks.focus();
        else this.blocks.parentElement.querySelector('[data-procedure-add-input]').focus();
    }
    handleWorkspaceKeyDown (event) {
        if (event.target === this.blocks && event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            this.mutationRoot.tab(null, true);
        }
    }
    handleCancel () {
        this.props.onRequestClose();
    }
    handleOk () {
        // Commit the active name/parameter before serializing the declaration.
        LazyScratchBlocks.get().WidgetDiv.hide(true);
        const newMutation = this.mutationRoot ? this.mutationRoot.mutationToDom(true) : null;
        this.props.onRequestClose(newMutation);
    }
    handleAddLabel () {
        if (this.mutationRoot) {
            this.mutationRoot.addLabelExternal();
        }
    }
    handleAddBoolean () {
        if (this.mutationRoot) {
            this.mutationRoot.addBooleanExternal();
        }
    }
    handleAddTextNumber () {
        if (this.mutationRoot) {
            this.mutationRoot.addStringNumberExternal();
        }
    }
    handleToggleWarp () {
        if (this.mutationRoot) {
            const newWarp = !this.mutationRoot.getWarp();
            this.mutationRoot.setWarp(newWarp);
            this.setState({warp: newWarp});
        }
    }
    render () {
        return (
            <CustomProceduresComponent
                componentRef={this.setBlocks}
                shortcutKeys={Object.keys(customBlockShortcuts).reduce((keys, name) => ({
                    ...keys,
                    [name]: actions.ariaShortcuts(customBlockShortcuts[name])
                }), {})}
                shortcutHints={Object.keys(customBlockShortcuts).reduce((hints, name) => ({
                    ...hints,
                    [name]: actions.bindings(customBlockShortcuts[name])
                        .map(binding => displayBinding(binding, actions.mac))
                        .join(', ')
                }), {confirm: displayBinding('Mod+Enter', actions.mac), cancel: displayBinding('Escape', actions.mac)})}
                warp={this.state.warp}
                onAddBoolean={this.handleAddBoolean}
                onAddLabel={this.handleAddLabel}
                onAddTextNumber={this.handleAddTextNumber}
                onCancel={this.handleCancel}
                onOk={this.handleOk}
                onToggleWarp={this.handleToggleWarp}
                onWorkspaceKeyDown={this.handleWorkspaceKeyDown}
            />
        );
    }
}

CustomProcedures.shortcutHandlers = {
    [customBlockShortcuts.addTextNumber]: 'handleAddTextNumber',
    [customBlockShortcuts.addBoolean]: 'handleAddBoolean',
    [customBlockShortcuts.addLabel]: 'handleAddLabel',
    [customBlockShortcuts.toggleWarp]: 'handleToggleWarp'
};

CustomProcedures.propTypes = {
    isRtl: PropTypes.bool,
    mutator: PropTypes.instanceOf(Element),
    onRequestClose: PropTypes.func.isRequired,
    options: PropTypes.shape({
        media: PropTypes.string,
        zoom: PropTypes.shape({
            controls: PropTypes.bool,
            wheel: PropTypes.bool,
            startScale: PropTypes.number
        }),
        comments: PropTypes.bool,
        collapse: PropTypes.bool
    })
};

CustomProcedures.defaultOptions = {
    zoom: {
        controls: false,
        wheel: false,
        startScale: 0.9
    },
    comments: false,
    collapse: false,
    scrollbars: true
};

CustomProcedures.defaultProps = {
    options: CustomProcedures.defaultOptions
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl,
    mutator: state.scratchGui.customProcedures.mutator
});

export default connect(
    mapStateToProps
)(CustomProcedures);
