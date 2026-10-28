import { tabIdsAfterMove } from "../../tab-reorder.js";

/** Dragging a tab: the reorder slot, the drop preview, the drop target, and finishing a drag. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_DRAG_PART = `  const tabIdsAfterMove = ${tabIdsAfterMove.toString()};
  const stripFor = (paneId) => {
    if (titlebarStrip && !titlebarStrip.hidden && titlebarStrip.dataset.chromePane === paneId) return titlebarStrip;
    return panesEl.querySelector('[data-tab-pane="' + paneId + '"] [data-tab-strip]');
  };
  const removeReorderSlot = () => {
    reorderKey = "";
    dragSlot.clear();
  };
  const hideDropPreview = () => {
    delete panesEl.dataset.splitDropPreview;
    panesEl.style.removeProperty("--split-preview-left");
    panesEl.style.removeProperty("--split-preview-top");
    panesEl.style.removeProperty("--split-preview-width");
    panesEl.style.removeProperty("--split-preview-height");
    document.querySelectorAll("[data-drop-preview]").forEach((node) => node.removeAttribute("data-drop-preview"));
    removeReorderSlot();
    document.querySelectorAll(".is-tab-drag-source").forEach((node) => node.classList.remove("is-tab-drag-source"));
    document.body.style.removeProperty("--tab-reorder-width");
  };
  const paintTabReorder = (target, copy) => {
    if (!target?.paneId || !dragTab) { removeReorderSlot(); return; }
    const preview = tabIdsAfterMove(state, ops, dragTab.paneId, dragTab.tabId, target.paneId, target.beforeId, copy);
    const destStrip = stripFor(preview.paneId);
    const tabEl = document.querySelector('.tab-item[data-tab-id="' + dragTab.tabId + '"]');
    const sourceEl = dragTab.members ? tabEl?.closest("[data-plugin-group]") : tabEl;
    if (!destStrip || !sourceEl) { removeReorderSlot(); return; }
    const key = [preview.paneId, preview.ids.join(","), preview.movingId, copy ? "copy" : "move"].join("|");
    if (key === reorderKey) return;
    if (!copy && !sourceEl.classList.contains("is-tab-drag-source")) dragSlot.vacate(sourceEl);
    sourceEl.classList.toggle("is-tab-drag-source", !copy);
    document.body.style.setProperty("--tab-reorder-width", dragTab.width + "px");
    const previous = document.querySelector("[data-tab-reorder-slot]:not([data-tab-slot-leaving])");
    const slot = document.createElement("span");
    slot.dataset.tabReorderSlot = "";
    slot.setAttribute("aria-hidden", "true");
    slot.style.setProperty("--plugin-color", sourceEl.closest(".tab-group")?.style.getPropertyValue("--group-color") || sourceEl.style.getPropertyValue("--plugin-color") || "var(--muted)");
    if (dragTab.members) { slot.classList.add("is-group"); slot.style.width = dragTab.width + "px"; }
    const ids = preview.ids, at = ids.indexOf(preview.movingId);
    // A plugin tab copied where its plugin already has one only shows that plugin there: nothing lands on the strip.
    if (at < 0) { removeReorderSlot(); return; }
    let next = at + 1;
    while (dragTab.members && dragTab.members.includes(ids[next])) next += 1;
    // A plugin's tab lands in its plugin's group, so the slot sits after its neighbour there; a whole group or a tab
    // from outside lands between groups, never inside one.
    const moving = state.panes.flatMap((pane) => pane.tabs).find((tab) => tab.id === dragTab.tabId);
    const loose = !dragTab.members && ops.isLoose(moving);
    const before = loose && ids[at - 1] && destStrip.querySelector('[data-plugin-group="' + moving.plugin + '"] .tab-item[data-tab-id="' + ids[at - 1] + '"]:not(.is-tab-drag-source)');
    let after = !before && ids[next] && destStrip.querySelector('.tab-item[data-tab-id="' + ids[next] + '"]:not(.is-tab-drag-source)');
    if (after && !loose && after.closest("[data-plugin-group]")) after = after.closest("[data-plugin-group]");
    const pad = destStrip.querySelector("[data-tab-scroll-pad]");
    if (before) before.after(slot);
    else if (after) after.before(slot);
    else if (pad) pad.before(slot);
    else (destStrip.querySelector("[data-tab-scroll]") || destStrip).append(slot);
    reorderKey = key;
    dragSlot.close(previous);
    shareTabStrip(destStrip.querySelector("[data-tab-scroll]"));
    dragSlot.open(slot);
  };
  const paintDropPreview = (target, copy) => {
    if (target?.edge) {
      removeReorderSlot();
      paintResultPreview(target, copy);
      return;
    }
    delete panesEl.dataset.splitDropPreview;
    paintTabReorder(target, copy);
  };
  const isCopyDrop = (event) => Boolean(event.altKey || document.body.dataset.tabDragCopy === "1");
  const finishDrag = () => {
    dragTab = null;
    root.classList.remove("is-tab-dragging");
    document.body.classList.remove("is-tab-dragging");
    hideDropPreview();
    delete document.body.dataset.tabDragCopy;
  };
  const dropTarget = (event, surface) => {
    const section = event.target.closest("[data-tab-pane]");
    const paneId = section?.dataset.tabPane || surface.dataset.chromePane;
    let tab = event.target.closest("[data-tab-id]");
    let edge = event.target.closest("[data-tab-edge]")?.dataset.tabEdge || null;
    if (section && !event.target.closest(".tab-strip") && !narrow()) {
      const body = section.querySelector("[data-tab-pane-body]");
      const rect = (body || section).getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = (event.clientY - rect.top) / Math.max(1, rect.height);
      edge ||= splitDropEdge(x, y);
    }
    if (tab && dragTab && tab.dataset.tabId === dragTab.tabId) tab = null;
    let beforeId = tab?.dataset.tabId;
    if (tab && event.clientX > tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2) {
      const pane = paneById(paneId);
      beforeId = pane?.tabs[pane.tabs.findIndex((item) => item.id === beforeId) + 1]?.id;
    }
    const overStrip = event.target.closest("[data-tab-strip], [data-titlebar-tabs]");
    if (overStrip && dragTab) {
      if (tab) dragTab.hoverBeforeId = beforeId;
      else beforeId = dragTab.hoverBeforeId;
    }
    if (dragTab?.members && tab) {
      // A whole group lands before or after another group, by which half of that group the pointer is over.
      const wrap = tab.closest(".tab-group"), box = (wrap || tab).getBoundingClientRect(), pane = paneById(paneId);
      const ids = wrap ? [...wrap.querySelectorAll(".tab-item[data-tab-id]")].map((node) => node.dataset.tabId) : [tab.dataset.tabId];
      beforeId = event.clientX < box.left + box.width / 2 ? ids[0] : pane?.tabs[pane.tabs.findIndex((item) => item.id === ids.at(-1)) + 1]?.id;
      dragTab.hoverBeforeId = beforeId;
    }
    const groupWrap = !dragTab?.members && event.target.closest("[data-tab-group]");
    const groupId = groupWrap && !groupWrap.hasAttribute("data-pinned-group") ? groupWrap.dataset.tabGroup : null;
    if (groupId && !tab) {
      const pane = paneById(paneId);
      const members = pane?.tabs.filter((item) => item.groupId === groupId) || [];
      const last = members.at(-1);
      const lastIndex = pane?.tabs.findIndex((item) => item.id === last?.id);
      beforeId = lastIndex >= 0 ? pane.tabs[lastIndex + 1]?.id : beforeId;
    }
    return { paneId, edge, beforeId, section, groupId };
  };`;
