// Adapted from Scratch Addons find-bar, by griffpatch and TheColaber.
let current = null;
let timer = null;
let originalFill = '';

export default class BlockFlasher {
    static clear () {
        clearTimeout(timer);
        if (current && current.svgPath_) current.svgPath_.style.fill = originalFill;
        current = null;
        timer = null;
    }
    static flash (block) {
        BlockFlasher.clear();
        if (!block || !block.svgPath_) return;
        current = block;
        originalFill = block.svgPath_.style.fill;
        let remaining = 6;
        const tick = () => {
            if (!current || !current.svgPath_) return BlockFlasher.clear();
            current.svgPath_.style.fill = remaining % 2 === 0 ? '#ffff80' : originalFill;
            if (--remaining) timer = setTimeout(tick, 200);
            else BlockFlasher.clear();
        };
        tick();
    }
}
