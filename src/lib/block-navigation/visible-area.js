// All rectangles use viewport CSS pixels, including at non-default Blockly zoom.
const area = rect => Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export const visibleRegion = (view, overlay, width, height) => {
    if (!overlay || !intersects(view, overlay)) return view;
    const regions = [
        {...view, top: Math.max(view.top, overlay.bottom)},
        {...view, right: Math.min(view.right, overlay.left)},
        {...view, left: Math.max(view.left, overlay.right)},
        {...view, bottom: Math.min(view.bottom, overlay.top)}
    ].filter(rect => area(rect) > 0);
    const fitting = regions.filter(rect => rect.right - rect.left >= width + 24 &&
        rect.bottom - rect.top >= height + 24);
    // Prefer below the palette when it fits; otherwise use the largest remaining region.
    if (fitting.includes(regions[0]) && regions[0].top >= overlay.bottom) return regions[0];
    return (fitting.length ? fitting : regions).sort((a, b) => area(b) - area(a))[0] || view;
};

export const scrollIntoVisibleArea = (workspace, block, overlay = null) => {
    if (!workspace.scrollbar || !workspace.getParentSvg) return;
    // A target switch or a newly rendered block can invalidate scrollbar ratios.
    if (workspace.scrollbar.resize) workspace.scrollbar.resize();
    const metrics = workspace.getMetrics();
    const svg = workspace.getParentSvg().getBoundingClientRect();
    const origin = {left: svg.left + metrics.absoluteLeft, top: svg.top + metrics.absoluteTop};
    const view = {left: origin.left,
        top: origin.top,
        right: origin.left + metrics.viewWidth,
        bottom: origin.top + metrics.viewHeight};
    const flyout = workspace.getFlyout && workspace.getFlyout();
    if (flyout && flyout.isVisible()) {
        if (workspace.horizontalLayout) view.top += metrics.flyoutHeight || 0;
        else if (workspace.RTL) view.right -= metrics.flyoutWidth || 0;
        else view.left += metrics.flyoutWidth || 0;
    }
    const root = block.getRootBlock ? block.getRootBlock() : block;
    let base = block;
    while (base.getOutputShape && base.getOutputShape() && base.getSurroundParent()) {
        base = base.getSurroundParent();
    }
    const xy = {x: root.getRelativeToSurfaceXY().x, y: base.getRelativeToSurfaceXY().y};
    const width = block.width * workspace.scale;
    // Hat curves extend above the stored block origin (including at high zoom).
    const hat = block.startHat_ ? 20 * workspace.scale : 0;
    const height = (block.height * workspace.scale) + hat;
    const region = visibleRegion(view, overlay, width, height);
    const left = origin.left + (xy.x * workspace.scale) - metrics.viewLeft - (workspace.RTL ? width : 0);
    const top = origin.top + (xy.y * workspace.scale) - metrics.viewTop - hat;
    // Keep an already visible stack still. When navigation needs scrolling, use
    // the original find-bar's stable top-left anchor instead of the nearest edge.
    const inset = 32;
    if (left >= region.left + inset - 4 && left + width <= region.right &&
        top >= region.top + inset - 4 && top + height <= region.bottom) return;
    const desiredLeft = region.left + inset;
    const desiredTop = region.top + inset;
    if (Math.abs(left - desiredLeft) < 1 && Math.abs(top - desiredTop) < 1) return;
    workspace.scrollbar.set(metrics.viewLeft + left - desiredLeft - metrics.contentLeft,
        metrics.viewTop + top - desiredTop - metrics.contentTop);
};
