import {visibleRegion, scrollIntoVisibleArea} from '../../../src/lib/block-navigation/visible-area';

const view = {left: 200, top: 80, right: 900, bottom: 700};
test('prefers usable space below the palette and uses side space when below cannot fit', () => {
    const overlay = {left: 300, top: 50, right: 850, bottom: 350};
    expect(visibleRegion(view, overlay, 150, 40)).toEqual({...view, top: 350});
    expect(visibleRegion(view, {...overlay, left: 500, bottom: 690}, 150, 40))
        .toEqual({...view, right: 500});
    expect(visibleRegion(view, {left: 950, top: 50, right: 1100, bottom: 300}, 150, 40)).toEqual(view);
});

const setup = (scale = 1, rtl = false) => {
    const metrics = {absoluteLeft: 50, absoluteTop: 0, viewWidth: 750, viewHeight: 620,
        viewLeft: 0, viewTop: 0, contentLeft: -500, contentTop: -500, flyoutWidth: 150};
    const workspace = {scale, RTL: rtl, getMetrics: () => metrics,
        getParentSvg: () => ({getBoundingClientRect: () => ({left: 0, top: 80})}),
        getFlyout: () => ({isVisible: () => true}),
        scrollbar: {set: jest.fn((x, y) => {
            metrics.viewLeft = x + metrics.contentLeft;
            metrics.viewTop = y + metrics.contentTop;
        })}};
    const block = {width: 160, height: 40, getRelativeToSurfaceXY: () => ({x: 250, y: 100})};
    return {workspace, block, metrics};
};

test.each([0.5, 1, 2])('positions the block below an overlay at zoom %s without repeated movement', scale => {
    const {workspace, block, metrics} = setup(scale);
    const overlay = {left: 100, top: 50, right: 750, bottom: 350};
    scrollIntoVisibleArea(workspace, block, overlay);
    const screenTop = 80 + 100 * scale - metrics.viewTop;
    const screenLeft = 50 + 250 * scale - metrics.viewLeft;
    expect(screenTop).toBeGreaterThanOrEqual(362);
    expect(screenLeft).toBeGreaterThanOrEqual(212);
    workspace.scrollbar.set.mockClear();
    scrollIntoVisibleArea(workspace, block, overlay);
    expect(workspace.scrollbar.set).not.toHaveBeenCalled();
});

test('respects the flyout and RTL coordinates; oversized blocks keep their top visible', () => {
    const {workspace, block, metrics} = setup(1, true);
    block.height = 1200;
    scrollIntoVisibleArea(workspace, block, {left: 100, top: 50, right: 750, bottom: 350});
    expect(80 + 100 - metrics.viewTop).toBe(382);
    expect(50 + 250 - 160 - metrics.viewLeft).toBeGreaterThanOrEqual(62);
});

test('refreshes scrollbar ratios and includes the hat above a zoomed block origin', () => {
    const {workspace, block, metrics} = setup(2);
    workspace.scrollbar.resize = jest.fn();
    block.startHat_ = true;
    scrollIntoVisibleArea(workspace, block, {left: 100, top: 50, right: 750, bottom: 350});
    expect(workspace.scrollbar.resize).toHaveBeenCalledTimes(1);
    expect(80 + 100 * 2 - metrics.viewTop - 40).toBeGreaterThanOrEqual(362);
});

 test('offscreen navigation uses the same fixed anchor from either direction', () => {
    const {workspace, block, metrics} = setup();
    for (const y of [-1000, 2000]) {
        block.getRelativeToSurfaceXY = () => ({x: y, y});
        scrollIntoVisibleArea(workspace, block);
        expect(50 + y - metrics.viewLeft).toBe(232);
        expect(80 + y - metrics.viewTop).toBe(112);
    }
});
