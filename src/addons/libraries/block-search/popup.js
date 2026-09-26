//@ts-check

import { appendableSuggestion } from "./search-aliases.js";

import WorkspaceQuerier, { QueryResult } from "./WorkspaceQuerier.js";
import renderBlock, { BlockComponent, getBlockHeight } from "./BlockRenderer.js";
import { BlockInstance, BlockShape, BlockTypeInfo } from "./BlockTypeInfo.js";
import { onClearTextWidthCache } from "./module.js";

// Both entry points share one popup, index, gesture hook and creation transaction.
let servicePromise;
export default function getBlockSearch(context) {
  if (!servicePromise) servicePromise = createBlockSearch(context).catch(error => {
    servicePromise = null;
    throw error;
  });
  return servicePromise;
}

async function createBlockSearch({ addon, msg, console }) {
  const Blockly = await addon.tab.traps.getBlockly();
  const vm = addon.tab.traps.vm;

  const PREVIEW_LIMIT = 50;

  const popupRoot = document.body.appendChild(document.createElement("div"));
  popupRoot.classList.add("sa-mcp-root");
  popupRoot.dir = addon.tab.direction;
  popupRoot.style.display = "none";

  const popupContainer = popupRoot.appendChild(document.createElement("div"));
  popupContainer.classList.add("sa-mcp-container");

  const popupInputContainer = popupContainer.appendChild(document.createElement("div"));
  popupInputContainer.classList.add(addon.tab.scratchClass("input_input-form"));
  popupInputContainer.classList.add("sa-mcp-input-wrapper");

  const popupInputSuggestion = popupInputContainer.appendChild(document.createElement("input"));
  popupInputSuggestion.classList.add("sa-mcp-input-suggestion");

  const popupInput = popupInputContainer.appendChild(document.createElement("input"));
  popupInput.classList.add("sa-mcp-input");
  popupInput.setAttribute("autocomplete", "off");

  const popupPreviewContainer = popupContainer.appendChild(document.createElement("div"));
  popupPreviewContainer.classList.add("sa-mcp-preview-container");

  const popupPreviewScrollbarSVG = popupContainer.appendChild(
    document.createElementNS("http://www.w3.org/2000/svg", "svg")
  );
  popupPreviewScrollbarSVG.classList.add(
    "sa-mcp-preview-scrollbar",
    "blocklyScrollbarVertical",
    "blocklyMainWorkspaceScrollbar"
  );
  popupPreviewScrollbarSVG.style.display = "none";

  const popupPreviewScrollbarBackground = popupPreviewScrollbarSVG.appendChild(
    document.createElementNS("http://www.w3.org/2000/svg", "rect")
  );
  popupPreviewScrollbarBackground.setAttribute("width", "11");
  popupPreviewScrollbarBackground.classList.add("blocklyScrollbarBackground");

  const popupPreviewScrollbarHandle = popupPreviewScrollbarSVG.appendChild(
    document.createElementNS("http://www.w3.org/2000/svg", "rect")
  );
  popupPreviewScrollbarHandle.setAttribute("rx", "3");
  popupPreviewScrollbarHandle.setAttribute("ry", "3");
  popupPreviewScrollbarHandle.setAttribute("width", "6");
  popupPreviewScrollbarHandle.setAttribute("x", "2.5");
  popupPreviewScrollbarHandle.classList.add("blocklyScrollbarHandle");

  const popupPreviewBlocks = popupPreviewContainer.appendChild(
    document.createElementNS("http://www.w3.org/2000/svg", "svg")
  );
  popupPreviewBlocks.classList.add("sa-mcp-preview-blocks");

  const querier = new WorkspaceQuerier();

  let mousePosition = { x: 0, y: 0 };
  document.addEventListener("mousemove", (e) => {
    mousePosition = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener("mousedown", (e) => {
    mousePosition = { x: e.clientX, y: e.clientY };
  }, { capture: true });

  onClearTextWidthCache(closePopup);

  /**
   * @typedef ResultPreview
   * @property {BlockInstance} block
   * @property {((endOnly: boolean) => string)?} autocompleteFactory
   * @property {BlockComponent} renderedBlock
   * @property {SVGGElement} svgBlock
   * @property {SVGRectElement} svgBackground
   */
  /** @type {ResultPreview[]} */
  let queryPreviews = [];
  /** @type {QueryResult | null} */
  let queryIllegalResult = null;
  let selectedPreviewIdx = 0;
  /** @type {BlockTypeInfo[]?} */
  let blockTypes = null;
  let limited = false;

  let allowMenuClose = true;

  let keyboardEditor = {enabled: false};
  let popupKeyboard = false;
  let popupPosition = null;
  let popupOrigin = null;

  let previewWidth = 0;
  let previewHeight = 0;

  let previewScale = 0;

  let previewMinHeight = 0;
  let previewMaxHeight = 0;

  function openPopup({initialValue = "", keyboard = false, settings} = {}) {
    popupKeyboard = keyboard;

    // Don't show the menu if we're not in the code editor
    if (addon.tab.editorMode !== "editor") return;
    if (addon.tab.redux.state.scratchGui.editorTab.activeTabIndex !== 0) return;

    blockTypes = BlockTypeInfo.getBlocks(Blockly, vm, Blockly.getMainWorkspace(), msg);
    querier.indexWorkspace([...blockTypes]);
    blockTypes.sort((a, b) => {
      const prio = (block) => ["operators", "data"].indexOf(block.category.name) - block.id.startsWith("data_");
      return prio(b) - prio(a);
    });

    previewScale = window.innerWidth * 0.00005 + settings.get("popup_scale") / 100;
    previewWidth = (window.innerWidth * settings.get("popup_width")) / 100;
    previewMaxHeight = (window.innerHeight * settings.get("popup_max_height")) / 100;

    popupContainer.style.width = previewWidth + "px";

    popupOrigin = keyboard ? keyboardEditor.anchorPoint() : { x: mousePosition.x, y: mousePosition.y };
    popupRoot.style.display = "";
    popupInput.value = initialValue;
    popupInput.focus();
    updateInput();
  }

  function closePopup(restoreFocus = false) {
    if (allowMenuClose) {
      popupOrigin = null;
      popupPosition = null;
      popupRoot.style.display = "none";
      blockTypes = null;
      querier.clearWorkspaceIndex();
      const restore = restoreFocus === true && keyboardEditor?.enabled;
      if (restore) keyboardEditor.focus();
    }
  }

  popupInput.addEventListener("input", updateInput);

  function updateInput() {
    /**
     * @typedef MenuItem
     * @property {BlockInstance} block
     * @property {(endOnly: boolean) => string} [autocompleteFactory]
     */
    /** @type {MenuItem[]} */
    const blockList = [];

    if (popupInput.value.trim().length === 0) {
      queryIllegalResult = null;
      if (blockTypes)
        for (const blockType of blockTypes) {
          blockList.push({
            block: blockType.createBlock(),
          });
        }
      limited = false;
    } else {
      // Get the list of blocks to display using the input content
      const queryResultObj = querier.queryWorkspace(popupInput.value);
      const queryResults = queryResultObj.results;
      queryIllegalResult = queryResultObj.illegalResult;
      limited = queryResultObj.limited;

      if (queryResults.length > PREVIEW_LIMIT) queryResults.length = PREVIEW_LIMIT;

      for (const queryResult of queryResults) {
        blockList.push({
          block: queryResult.getBlock(),
          autocompleteFactory: (endOnly) => queryResult.toText(endOnly),
        });
      }
    }

    // @ts-ignore Delete the old previews
    while (popupPreviewBlocks.firstChild) popupPreviewBlocks.removeChild(popupPreviewBlocks.lastChild);

    // Create the new previews
    queryPreviews.length = 0;
    let y = 0;
    for (let resultIdx = 0; resultIdx < blockList.length; resultIdx++) {
      const result = blockList[resultIdx];

      const mouseMoveListener = () => {
        updateSelection(resultIdx);
      };

      const mouseDownListener = (e) => {
        e.stopPropagation();
        e.preventDefault();
        updateSelection(resultIdx);
        allowMenuClose = !e.shiftKey;
        selectBlock();
        allowMenuClose = true;
        if (e.shiftKey) popupInput.focus();
      };

      const svgBackground = popupPreviewBlocks.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "rect")
      );

      const height = getBlockHeight(result.block);
      svgBackground.setAttribute("transform", `translate(0, ${(y + height / 10) * previewScale})`);
      svgBackground.setAttribute("height", height * previewScale + "px");
      svgBackground.classList.add("sa-mcp-preview-block-bg");
      svgBackground.addEventListener("mousemove", mouseMoveListener);
      svgBackground.addEventListener("mousedown", mouseDownListener);

      const svgBlock = popupPreviewBlocks.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"));
      svgBlock.addEventListener("mousemove", mouseMoveListener);
      svgBlock.addEventListener("mousedown", mouseDownListener);
      svgBlock.classList.add("sa-mcp-preview-block");

      const renderedBlock = renderBlock(result.block, svgBlock);

      queryPreviews.push({
        block: result.block,
        autocompleteFactory: result.autocompleteFactory ?? null,
        renderedBlock,
        svgBlock,
        svgBackground,
      });

      y += height;
    }

    const height = (y + 8) * previewScale;

    if (height < previewMinHeight) previewHeight = previewMinHeight;
    else if (height > previewMaxHeight) previewHeight = previewMaxHeight;
    else previewHeight = height;

    popupPreviewBlocks.setAttribute("height", `${height}px`);
    popupPreviewContainer.style.height = previewHeight + "px";
    popupPreviewScrollbarSVG.style.height = previewHeight + "px";
    popupPreviewScrollbarBackground.setAttribute("height", "" + previewHeight);
    popupInputContainer.dataset["error"] = "" + limited;

    popupPosition = { x: popupOrigin.x + 16, y: popupOrigin.y - 8 };

    const popupHeight = popupContainer.getBoundingClientRect().height;
    const popupBottom = popupPosition.y + popupHeight;
    if (popupBottom > window.innerHeight) {
      popupPosition.y -= popupBottom - window.innerHeight;
    }

    popupPosition.x = Math.max(0, Math.min(popupPosition.x, window.innerWidth - previewWidth));
    popupPosition.y = Math.max(0, popupPosition.y);
    popupRoot.style.top = popupPosition.y + "px";
    popupRoot.style.left = popupPosition.x + "px";

    selectedPreviewIdx = -1;
    updateSelection(0);
    updateCursor();
    updateScrollbar();
  }

  function updateSelection(newIdx) {
    if (selectedPreviewIdx === newIdx) return;

    const oldSelection = queryPreviews[selectedPreviewIdx];
    if (oldSelection) {
      oldSelection.svgBackground.classList.remove("sa-mcp-preview-block-bg-selection");
      oldSelection.svgBlock.classList.remove("sa-mcp-preview-block-selection");
    }

    if (queryPreviews.length === 0 && queryIllegalResult) {
      popupInputSuggestion.value =
        appendableSuggestion(popupInput.value, queryIllegalResult.toText(true));
      return;
    }

    const newSelection = queryPreviews[newIdx];
    if (newSelection && newSelection.autocompleteFactory) {
      newSelection.svgBackground.classList.add("sa-mcp-preview-block-bg-selection");
      newSelection.svgBlock.classList.add("sa-mcp-preview-block-selection");

      newSelection.svgBackground.scrollIntoView({
        block: "nearest",
        behavior: Math.abs(newIdx - selectedPreviewIdx) > 1 ? "smooth" : "auto",
      });

      popupInputSuggestion.value =
        appendableSuggestion(popupInput.value, newSelection.autocompleteFactory(true));
    } else {
      popupInputSuggestion.value = "";
    }

    selectedPreviewIdx = newIdx;
  }

  // @ts-ignore
  document.addEventListener("selectionchange", updateCursor);

  function updateCursor() {
    const cursorPos = popupInput.selectionStart ?? 0;
    const cursorPosRel = popupInput.value.length === 0 ? 0 : cursorPos / popupInput.value.length;

    let y = 0;
    for (let previewIdx = 0; previewIdx < queryPreviews.length; previewIdx++) {
      const preview = queryPreviews[previewIdx];

      var blockX = 5;
      if (blockX + preview.renderedBlock.width > previewWidth / previewScale)
        blockX += (previewWidth / previewScale - blockX - preview.renderedBlock.width) * previewScale * cursorPosRel;
      var blockY = (y + 30) * previewScale;

      preview.svgBlock.setAttribute("transform", `translate(${blockX}, ${blockY}) scale(${previewScale})`);

      y += getBlockHeight(preview.block);
    }

    popupInputSuggestion.scrollLeft = popupInput.scrollLeft;
  }

  popupPreviewContainer.addEventListener("scroll", updateScrollbar);

  function updateScrollbar() {
    const scrollTop = popupPreviewContainer.scrollTop;
    const scrollY = popupPreviewContainer.scrollHeight;

    if (scrollY <= previewHeight) {
      popupPreviewScrollbarSVG.style.display = "none";
      return;
    }

    const scrollbarHeight = (previewHeight / scrollY) * previewHeight;
    const scrollbarY = (scrollTop / scrollY) * previewHeight;

    popupPreviewScrollbarSVG.style.display = "";
    popupPreviewScrollbarHandle.setAttribute("height", "" + scrollbarHeight);
    popupPreviewScrollbarHandle.setAttribute("y", "" + scrollbarY);
  }

  // true: placed; false: dragging; null: failed or no result (keep search open).
  function selectBlock({keyboard = false, forceDrag = false} = {}) {
    const selectedPreview = queryPreviews[selectedPreviewIdx];
    if (!selectedPreview) return null;
    const workspace = Blockly.getMainWorkspace();
    const automatic = keyboard && keyboardEditor.enabled && !forceDrag;
    const point = keyboard && keyboardEditor.enabled ? keyboardEditor.placementPoint() : mousePosition;
    const previousGroup = Blockly.Events.getGroup();
    const previousResizesEnabled = workspace.resizesEnabled_;
    const existing = new Set(workspace.getAllBlocks(false).map(block => block.id));
    let newBlock;
    let plan;
    let displaced;
    let created = false;
    let drag = true;
    Blockly.Events.setGroup(previousGroup || true);
    const insertionGroup = Blockly.Events.getGroup();
    workspace.setResizesEnabled(false);
    try {
      Blockly.Events.disable();
      try {
        newBlock = selectedPreview.block.createWorkspaceForm();
        Blockly.scratchBlocksUtils.changeObscuredShadowIds(newBlock);
        if (!newBlock.getSvgRoot()) throw new Error("newBlock is not rendered.");
        const bounds = newBlock.svgPath_.getBoundingClientRect();
        newBlock.moveBy(Math.floor((point.x - (bounds.left + bounds.right) / 2) / workspace.scale),
          Math.floor((point.y - (bounds.top + bounds.bottom) / 2) / workspace.scale));
      } catch (error) {
        // createWorkspaceForm may fail after creating only some of its children.
        for (const block of workspace.getTopBlocks(false)) {
          if (!existing.has(block.id)) block.dispose(false);
        }
        throw error;
      } finally {
        Blockly.Events.enable();
      }
      Blockly.Events.fire(new Blockly.Events.BlockCreate(newBlock));
      created = true;
      plan = automatic ? keyboardEditor.planInsertion(workspace, newBlock) : {kind: 'drag'};
      drag = plan.kind === 'drag';
      if (plan.parent) {
        displaced = plan.parent.targetConnection;
        if (plan.kind === 'before') {
          // The existing root stays in place when inserting before its top notch.
          newBlock.moveBy(plan.child.x_ - plan.parent.x_, plan.child.y_ - plan.parent.y_);
        }
        plan.parent.connect(plan.child);
      }
      if (!drag) keyboardEditor.inserted(newBlock);
    } catch (error) {
      if (newBlock?.workspace && created) {
        // Detach the old stack before disposing the failed insertion.
        const oldBlocks = newBlock.getDescendants(false).filter(block => existing.has(block.id));
        for (const block of oldBlocks) {
          const parent = block.getParent();
          if (parent && !existing.has(parent.id)) block.unplug(false);
        }
        newBlock.dispose(false);
        if (displaced?.getSourceBlock().workspace && plan?.parent?.getSourceBlock().workspace &&
            !displaced.isConnected()) plan.parent.connect(displaced);
      }
      console.error('Could not insert block', error);
      return null;
    } finally {
      workspace.setResizesEnabled(previousResizesEnabled);
      Blockly.Events.setGroup(previousGroup);
    }
    if (drag) {
      const fakeEvent = {
        clientX: point.x, clientY: point.y, type: "mousedown",
        stopPropagation() {}, preventDefault() {}, target: selectedPreview.svgBlock
      };
      try {
        // The native dragger closes this group on drop, keeping creation and
        // placement in the same undo step, including the mouse fallback path.
        Blockly.Events.setGroup(insertionGroup);
        if (!workspace.getGesture(fakeEvent)) throw new Error('Could not start block drag');
        workspace.startDragWithFakeEvent(fakeEvent, newBlock);
        if (keyboardEditor.enabled) keyboardEditor.draggingBlock = newBlock.id;
      } catch (error) {
        newBlock.dispose(false);
        workspace.setResizesEnabled(previousResizesEnabled);
        Blockly.Events.setGroup(previousGroup);
        console.error('Could not start block drag', error);
        return null;
      }
    }
    return !drag;
  }

  function acceptAutocomplete() {
    let factory;
    if (queryPreviews[selectedPreviewIdx]) factory = queryPreviews[selectedPreviewIdx].autocompleteFactory;
    else if (queryIllegalResult) factory = (endOnly) => queryIllegalResult.toText(endOnly);
    else return;
    if (!factory) return;
    popupInput.value = factory(false);
    // Move cursor to the end of the newly inserted text
    popupInput.selectionStart = popupInput.value.length + 1;
    updateInput();
  }

  popupInput.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    switch (e.key) {
      case "Escape":
        // If there's something in the input, clear it
        if (popupInput.value.length > 0) {
          popupInput.value = "";
          updateInput();
        } else {
          // If not, close the menu
          closePopup(true);
        }
        e.stopPropagation();
        e.preventDefault();
        break;
      case "Tab":
        acceptAutocomplete();
        e.stopPropagation();
        e.preventDefault();
        break;
      case "Enter":
        {
          const placed = selectBlock({keyboard: popupKeyboard && keyboardEditor.enabled, forceDrag: e.metaKey || e.ctrlKey});
          if (placed !== null) closePopup(placed);
        }
        e.stopPropagation();
        e.preventDefault();
        break;
      case "ArrowDown":
        if (selectedPreviewIdx + 1 >= queryPreviews.length) updateSelection(0);
        else updateSelection(selectedPreviewIdx + 1);
        e.stopPropagation();
        e.preventDefault();
        break;
      case "ArrowUp":
        if (selectedPreviewIdx - 1 < 0) updateSelection(queryPreviews.length - 1);
        else updateSelection(selectedPreviewIdx - 1);
        e.stopPropagation();
        e.preventDefault();
        break;
    }
  });

  popupInput.addEventListener("focusout", () => closePopup());

  // The popup should delete blocks dragged ontop of it
  const _isDeleteArea = Blockly.WorkspaceSvg.prototype.isDeleteArea;
  Blockly.WorkspaceSvg.prototype.isDeleteArea = function (e) {
    if (popupPosition) {
      if (
        e.clientX > popupPosition.x &&
        e.clientX < popupPosition.x + previewWidth &&
        e.clientY > popupPosition.y &&
        e.clientY < popupPosition.y + previewHeight
      ) {
        return Blockly.DELETE_AREA_TOOLBOX;
      }
    }
    return _isDeleteArea.call(this, e);
  };
  return {
    openPopup, closePopup,
    popupOpen: () => Boolean(popupPosition),
    closeMousePopup: () => { if (!popupKeyboard) closePopup(false); },
    closeKeyboardPopup: () => { if (popupKeyboard) closePopup(); },
    attachKeyboard: editor => { keyboardEditor = editor; },
    setMousePosition: event => { mousePosition = {x: event.clientX, y: event.clientY}; }
  };

}
