// Initial code was written by Norbiros

export default async function ({ addon, console }) {
  const vm = addon.tab.traps.vm;
  document.body.addEventListener("click", (e) => {
    if (e.shiftKey && !addon.self.disabled) {
      const item = e.target.closest("[data-sprite-id]");
      if (item) {
        const target = vm.runtime.getTargetById(item.dataset.spriteId);
        if (target && !target.isStage) target.goToFront();
      }
    }
  });
}
