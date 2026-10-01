/**
 * Reserve tab-row space for a stage header extending beyond a small/custom stage.
 * Hide-stage leaves only its absolutely positioned size buttons visible.
 * @param {HTMLElement} toolbar the editor window toolbar
 * @returns {Function} release layout observers
 */
export default function observeToolbarLayout (toolbar) {
    const row = toolbar.parentElement;
    const bounds = toolbar.closest('[data-editor-window-bounds]');
    if (!bounds) return () => {};
    let frame;
    let resize; // eslint-disable-line prefer-const -- update closes over the observer initialized below
    const observed = new Set();
    const update = () => {
        const header = bounds.querySelector('[data-editor-stage-header]');
        const sizes = header && header.querySelector('[data-editor-stage-sizes]');
        const elements = [row, bounds, header, sizes].filter(Boolean);
        if (Array.from(observed).some(element => !elements.includes(element))) {
            resize.disconnect();
            observed.clear();
        }
        elements.forEach(element => {
            if (!observed.has(element)) {
                resize.observe(element);
                observed.add(element);
            }
        });
        const occupied = bounds.classList.contains('sa-stage-hidden') ? sizes : header;
        const area = row.getBoundingClientRect();
        const stage = occupied && occupied.getBoundingClientRect();
        let left = 0;
        let right = 0;
        if (stage && stage.width && stage.bottom > area.top && stage.top < area.bottom &&
            stage.right > area.left && stage.left < area.right) {
            if (stage.left + stage.right < area.left + area.right) {
                left = Math.max(0, stage.right - area.left);
            } else {
                right = Math.max(0, area.right - stage.left);
            }
        }
        row.style.setProperty('--stage-header-inset-left', `${left}px`);
        row.style.setProperty('--stage-header-inset-right', `${right}px`);
    };
    const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
    };
    resize = new ResizeObserver(schedule);
    const mutation = new MutationObserver(schedule);
    mutation.observe(bounds, {attributes: true, attributeFilter: ['class']});
    const header = bounds.querySelector('[data-editor-stage-header]');
    if (header) mutation.observe(header.parentElement, {childList: true, subtree: true});
    window.addEventListener('resize', schedule);
    update();
    return () => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        mutation.disconnect();
        window.removeEventListener('resize', schedule);
        row.style.removeProperty('--stage-header-inset-left');
        row.style.removeProperty('--stage-header-inset-right');
    };
}
