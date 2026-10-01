// A file to split Editor Devtools by features.
// Unlike userscript.js, this file mainly interacts with VM.
export default class ShowBroadcast {
  constructor(addon) {
    this.addon = addon;
    this.vm = this.addon.tab.traps.vm;
    this.highlights = {
      timeoutId: 0,
      callback: () => {},
    };
  }

  showSenders(broadcastId) {
    this.highlightTargets(this.getTargetsWithSenders(broadcastId));
  }

  getTargetsWithSenders(broadcastId) {
    const targetWithSenders = [];
    for (const target of this.vm.runtime.targets) {
      if (!target.isOriginal) return;
      for (const blockId of Object.keys(target.blocks._blocks)) {
        const block = target.blocks.getBlock(blockId);
        if (block.inputs.BROADCAST_INPUT) {
          const input = block.inputs.BROADCAST_INPUT;
          // For results, blocks must NOT be inserted, for convenience.
          if (
            input.block === input.shadow &&
            target.blocks.getBlock(input.shadow).fields.BROADCAST_OPTION.id === broadcastId
          ) {
            targetWithSenders.push(target);
            break;
          }
        }
      }
    }
    return targetWithSenders;
  }

  showReceivers(broadcastId) {
    this.highlightTargets(this.getTargetsWithReceivers(broadcastId));
  }

  getTargetsWithReceivers(broadcastId) {
    const targetWithReceivers = [];
    for (const target of this.vm.runtime.targets) {
      if (!target.isOriginal) return;
      for (const blockId of Object.keys(target.blocks._blocks)) {
        const block = target.blocks.getBlock(blockId);
        if (block.opcode === "event_whenbroadcastreceived" && block.fields.BROADCAST_OPTION.id === broadcastId) {
          targetWithReceivers.push(target);
          break;
        }
      }
    }
    return targetWithReceivers;
  }

  highlightTargets(targets) {
    if (this.highlights.timeoutId) {
      this.highlights.callback();
      clearTimeout(this.highlights.timeoutId);
      this.highlights = {
        timeoutId: 0,
        callback: () => {},
      };
    }
    const elemPendingToRemoveHighlights = [];
    for (const target of targets) {
      let elem = null;
      if (target.isStage) {
        elem = document.querySelector('div[class*="stage-selector_stage-selector"]');
      } else if (target.isOriginal) {
        elem = Array.from(document.querySelectorAll('[data-sprite-id]'))
          .find((item) => item.dataset.spriteId === target.id);
      }
      // A collapsed folder (or a search) can leave the target unmounted.
      if (!elem) continue;
      elem.dataset.highlighted = "true";
      elemPendingToRemoveHighlights.push(elem);
    }
    const callbackFactory = (elemToRemoveHighlights) => () => {
      for (const removingElem of elemToRemoveHighlights) {
        if (!removingElem.isConnected) continue;
        removingElem.dataset.highlighted = "false";
      }
    };
    const callback = callbackFactory(elemPendingToRemoveHighlights);
    this.highlights = {
      callback,
      timeoutId: setTimeout(callback, 2000),
    };
  }

  getAssociatedBroadcastId(blockId) {
    const editingTarget = this.vm.editingTarget;
    const block = editingTarget.blocks.getBlock(blockId);
    if (block.opcode === "event_whenbroadcastreceived") {
      return block.fields.BROADCAST_OPTION.id;
    } else {
      const input = block.inputs.BROADCAST_INPUT;
      // Allow shadow blocks
      return editingTarget.blocks.getBlock(input.shadow).fields.BROADCAST_OPTION.id;
    }
  }
}
