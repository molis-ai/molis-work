/**
 * The landing slot while a tab, or a plugin's whole group, is dragged along the strip (specs/plugin-tab-groups): a new slot
 * opens where the drop would land while the old one, and the dragged tab's own place, close by width. Layout follows the
 * widths, so the tabs and the group tints around them slide instead of jumping.
 */
export const TAB_DRAG_SLOT_FACTORY = String.raw`({ ms, ease }) => {
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gapOf = (node) => Number.parseFloat(getComputedStyle(node.parentElement).columnGap) || 0;
  const resize = (node, from, to, done) => {
    if (reduce()) { done?.(); return; }
    const gap = -gapOf(node) + "px";
    const anim = node.animate([{ width: from + "px", marginInlineEnd: from ? "0px" : gap }, { width: to + "px", marginInlineEnd: to ? "0px" : gap }], { duration: ms, easing: ease });
    if (done) { anim.onfinish = done; anim.oncancel = done; }
  };
  /** A slot, or the space a dragged tab left, closes from the width it has now and is then gone. */
  const close = (node) => {
    if (!node?.isConnected) return;
    const box = node.getBoundingClientRect();
    node.dataset.tabSlotLeaving = "";
    node.getAnimations().forEach((anim) => anim.cancel());
    node.style.height = box.height + "px"; node.style.width = "0px"; node.style.marginInlineEnd = -gapOf(node) + "px";
    resize(node, box.width, 0, () => node.remove());
  };
  return {
    /** The dragged tab or group leaves its place; the space it took closes as the slot opens. */
    vacate(source) {
      const box = source.getBoundingClientRect(), space = document.createElement("span");
      space.setAttribute("aria-hidden", "true");
      space.style.cssText = "flex:none;width:" + box.width + "px;height:" + box.height + "px;pointer-events:none;";
      source.before(space);
      close(space);
    },
    /** The slot a new one replaces starts closing; mark it before widths are shared, since it is on its way to nothing. */
    close,
    /** The new slot is in place: it opens to its width while the previous one closes. */
    open(slot) { resize(slot, 0, slot.getBoundingClientRect().width); },
    clear() { document.querySelectorAll("[data-tab-reorder-slot], [data-tab-slot-leaving]").forEach((node) => node.remove()); },
  };
}`;
