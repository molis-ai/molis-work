import { TAB_DRAG_SLOT_FACTORY } from "./tab-drag-slot.js";
import { TAB_SASH_FACTORY } from "./tab-sash.js";
import { placeLayoutMenu } from "./tab-layout-menu.js";

/** Tab and layout menus, sash and tab reordering in TAB_WORKSPACE_FACTORY_SCRIPT (a part, joined in place). */
export const TAB_WORKSPACE_MENUS_PART = `
  // An item (or a plugin's own view) in the pane beside this one; a narrow window has no room, so it opens in place.
  const openBeside = (plugin, itemId, title) => {
    if (embedded) { notifyParent("workbench-pane-open-beside", { plugin, itemId: itemId || null, title: itemId ? titleForItem(plugin, itemId, title) : null }); return; }
    if (openInSide(plugin, itemId, title)) return;
    if (narrow()) { if (itemId) openItem(plugin, itemId, title); else openPlugin(plugin); return; }
    ops.openBeside(state, plugin, itemId || null, itemId ? titleForItem(plugin, itemId, title) : undefined);
    apply();
    persist();
  };
  // An object that moved to another place no longer opens here: its tabs close (the move card offers the new place).
  const closeItem = (plugin, itemId) => {
    let closed = false;
    state.panes.forEach((pane) => pane.tabs.filter((tab) => tab.plugin === plugin && tab.kind === "item" && tab.itemId === itemId).map((tab) => tab.id)
      .forEach((id) => { ops.closeTab(state, pane.id, id); closed = true; }));
    // Nor does its plugin's page reopen it after a reload.
    if (openRecords[plugin] === itemId) forgetRecord(plugin);
    if (closed) { apply(); persist(); }
  };
  const openGoalWork = () => {
    const tab = ops.activeTab(state);
    if (tab?.plugin !== "goals" || tab.kind !== "item") return;
    tab.goalView = "work"; apply(); persist();
    if (embedded) notifyParent("workbench-pane-goal-view", { view: "work", goalId: tab.itemId, title: tab.title });
  };
  const addFeedTask = () => {
    openPlugin("feed");
    setFeedAddOpen?.(true);
    setMobileView("document");
  };
  /* Whoever reads the page's situation (selection, context) learns when the place changes, in the same words history
     uses: "plugin:<id>", a tab id, or "cover:<kind>[|<page>]". */
  let announcedPlace = { paneId: "", place: "" };
  const announcePlace = () => {
    if (embedded) return;
    const pane = ops.focused(state);
    const next = { paneId: pane?.id || "", place: pane ? historyId(pane) || "" : "" };
    if (next.paneId === announcedPlace.paneId && next.place === announcedPlace.place) return;
    const previous = announcedPlace;
    announcedPlace = next;
    document.dispatchEvent(new CustomEvent("molis-work:place-changed", { detail: { ...next, previous } }));
  };
  /** The page itself moved (a record opened or closed on it): one step of history, outside any history walk. */
  const notePlace = () => {
    const pane = ops.focused(state);
    if (embedded || !pane || state.exclusive || historyLock || applying) return;
    rememberTab(pane);
    persistHistory();
    syncHistoryButtons();
    announcePlace();
  };
  /** A cover says where inside it the person went; the first place replaces the bare entry the cover opened with. */
  const noteCover = (kind, place) => {
    if (embedded || state.exclusive !== kind || coverPlace === (place || "")) return;
    coverPlace = place || "";
    if (historyLock) return;
    const pane = ops.focused(state);
    if (!pane) return;
    const entry = paneHistory(pane.id);
    if (entry.stack[entry.index] === "cover:" + kind) entry.stack[entry.index] = historyId(pane);
    else rememberTab(pane);
    persistHistory();
    syncHistoryButtons();
    announcePlace();
  };
  /** Where inside a cover restored by a reload the person was (its history entry), so it reopens there, not on its first page. */
  const historyCoverPlace = (kind) => {
    const pane = ops.focused(state);
    const entry = pane ? tabHistory.get(pane.id) : null;
    const id = String(entry?.stack[entry.index] ?? "");
    return coverOf(id) === kind ? id.split("|").slice(1).join("|") : "";
  };
  const restoredCoverPlace = (kind) => state.exclusive === kind ? coverPlace : "";
  const setExclusive = (surface) => {
    if (surface !== state.exclusive && !historyLock) coverPlace = "";
    ops.setExclusive(state, surface);
    apply();
    persist();
  };
  const tabMenu = document.createElement("div");
  tabMenu.className = "workspace-layout-menu workspace-tab-menu mw-menu mw-menu--context";
  // Contextmenu fires on mouse-down on macOS; auto popovers dismiss on its mouse-up.
  tabMenu.setAttribute("popover", "manual"); tabMenu.setAttribute("role", "menu");
  tabMenu.dataset.workspaceTabMenu = ""; document.body.append(tabMenu);
  document.addEventListener("pointerdown", event => {
    if (tabMenu.matches(":popover-open") && !tabMenu.contains(event.target)) tabMenu.hidePopover();
  });
  document.addEventListener("focusin", event => {
    if (tabMenu.matches(":popover-open") && !tabMenu.contains(event.target)) tabMenu.hidePopover();
  });
  let tabMenuAnchor = null;
  tabMenu.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); tabMenu.hidePopover();
      (tabMenuAnchor?.querySelector(".tab-item-trigger") || tabMenuAnchor)?.focus({preventScroll:true}); return;
    }
    // Arrows, Home and End move through its items by the shared roving focus (design-system browser/roving-focus.ts).
  });
  // One item of the tab menu, for a tab's menu and a group's alike; a tab's puts focus back on the active tab.
  const menuItem = (paneId, refocus) => (label, icon, key, action) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "mw-menu__item"; button.setAttribute("role", "menuitem"); button.dataset.tabMenuAction = key;
    button.innerHTML = '<svg aria-hidden="true"><use href="#icon-' + icon + '"></use></svg><span></span>';
    button.querySelector("span").textContent = label;
    button.addEventListener("click", () => { tabMenu.hidePopover(); state.focusedPaneId = paneId; action(); apply(); persist(); if (refocus) focusActiveTab(); });
    tabMenu.append(button);
  };
  const openTabMenu = (paneId, anchor, tabId = null) => {
    const pane = paneById(paneId); if (!pane) return;
    const tab = pane.tabs.find(candidate => candidate.id === (tabId || pane.activeTabId));
    tabMenuAnchor = anchor; tabMenu.replaceChildren();
    tabMenu.setAttribute("aria-label", L(tabId ? "标签操作" : "打开插件"));
    const add = menuItem(paneId, true);
    if (!tabId) {
      const mounted = ["home", ...new Set([...document.querySelectorAll('[data-plugin-strip] [data-plugin-id], [data-assistant-island] [data-plugin-id], [data-dock] [data-plugin-id]')].map((el) => el.dataset.pluginId).filter((id) => id && id !== "home" && id !== "market"))];
      mounted.forEach(plugin => {
        add(L(ops.pluginTitle(plugin)), tabIcon(plugin), "open-" + plugin, () => ops.openPlugin(state, plugin));
      });
      if (tab) tabMenu.append(document.createElement("hr"));
    }
    if (tab) {
      const heading = document.createElement("strong"); heading.textContent = tabLabel(tab); heading.title = tabLabel(tab); tabMenu.append(heading);
      pluginGroups.menu(paneId, tab, add);
      add(L(tab.pinned ? "取消固定标签" : "固定标签"), "lock", "pin", () => ops.togglePinned(state, paneId, tab.id));
      if (!tab.pinned) {
        add(L("添加到新分组"), "frame", "new-group", () => ops.addTabToNewGroup(state, paneId, tab.id));
        (pane.groups || []).filter((group) => group.id !== tab.groupId).forEach((group) => {
          add(L("添加到分组") + (group.title ? " · " + group.title : ""), "frame", "join-" + group.id, () => ops.addTabToGroup(state, paneId, tab.id, group.id));
        });
        if (tab.groupId) add(L("从分组移除"), "x", "ungroup-tab", () => ops.removeTabFromGroup(state, paneId, tab.id));
      }
      add(L(tab.kind === "plugin" ? "关闭标签组" : "关闭标签"), "x", "close", () => closeTabBack(paneId, tab.id));
    }
    if (layoutMenu.matches(":popover-open")) layoutMenu.hidePopover();
    const rect = anchor.getBoundingClientRect(); tabMenu.showPopover();
    tabMenu.style.left = Math.max(8, Math.min(rect.left, innerWidth - tabMenu.offsetWidth - 8)) + "px";
    tabMenu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - tabMenu.offsetHeight - 8)) + "px";
    tabMenu.querySelector("button, input")?.focus();
  };
  const openGroupMenu = (paneId, groupId, anchor) => {
    const pane = paneById(paneId); if (!pane) return;
    const group = pane.groups.find((candidate) => candidate.id === groupId); if (!group) return;
    tabMenuAnchor = anchor; tabMenu.replaceChildren();
    tabMenu.setAttribute("aria-label", L("分组操作"));
    const heading = document.createElement("strong"); heading.textContent = group.title || L("分组"); tabMenu.append(heading);
    const name = document.createElement("input");
    name.type = "text"; name.value = group.title || ""; name.placeholder = L("分组名称");
    name.addEventListener("change", () => { ops.setGroupTitle(state, paneId, groupId, name.value.trim()); persist(); });
    name.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); tabMenu.hidePopover(); apply(); persist(); } });
    tabMenu.append(name);
    const colors = document.createElement("div"); colors.className = "workspace-tab-menu-colors";
    ops.GROUP_COLORS.forEach((color) => {
      const swatch = document.createElement("button"); swatch.type = "button"; swatch.setAttribute("role", "menuitem");
      swatch.dataset.tabMenuAction = "color-" + color; swatch.title = L({grey:"灰色",blue:"蓝色",red:"红色",yellow:"黄色",green:"绿色",pink:"粉色",purple:"紫色",cyan:"青色"}[color]);
      swatch.style.setProperty("--group-color", GROUP_COLOR[color]);
      if (group.color === color) swatch.setAttribute("aria-current", "true");
      swatch.addEventListener("click", () => { tabMenu.hidePopover(); ops.setGroupColor(state, paneId, groupId, color); apply(); persist(); });
      colors.append(swatch);
    });
    tabMenu.append(colors);
    const add = menuItem(paneId, false);
    add(L("取消分组"), "x", "ungroup", () => ops.ungroup(state, paneId, groupId));
    add(L("关闭分组"), "x", "close-group", () => ops.closeGroup(state, paneId, groupId));
    if (layoutMenu.matches(":popover-open")) layoutMenu.hidePopover();
    const rect = anchor.getBoundingClientRect(); tabMenu.showPopover();
    tabMenu.style.left = Math.max(8, Math.min(rect.left, innerWidth - tabMenu.offsetWidth - 8)) + "px";
    tabMenu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - tabMenu.offsetHeight - 8)) + "px";
    name.focus();
  };
  const placeLayoutMenu = ${placeLayoutMenu.toString()};
  const layoutMenu = document.createElement("div");
  layoutMenu.className = "workspace-layout-menu mw-menu"; layoutMenu.setAttribute("popover", "auto"); layoutMenu.dataset.workspaceLayout = "";
  layoutMenu.setAttribute("aria-label", L("布局与分屏")); document.body.append(layoutMenu);
  layoutMenu.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...layoutMenu.querySelectorAll("button:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]?.focus(); buttons[next]?.scrollIntoView({ block: "nearest" });
  });
  let layoutPane = null;
  const openLayoutMenu = (paneId, trigger) => {
    if (tabMenu.matches(":popover-open")) tabMenu.hidePopover();
    layoutPane = paneId;
    layoutMenu.replaceChildren();
    const heading = document.createElement("strong"); heading.textContent = L("布局与分屏"); layoutMenu.append(heading);
    const add = (label, key, value, selected = false) => {
      const button = document.createElement("button"); button.type = "button"; button.dataset[key] = value;
      button.innerHTML = '<svg aria-hidden="true"><use href="#icon-panel"></use></svg><span></span>';
      button.querySelector("span").textContent = label;
      if (selected) { button.setAttribute("aria-current", "true"); const mark = document.createElement("span"); mark.textContent = "✓"; button.append(mark); }
      layoutMenu.append(button); return button;
    };
    [["right","向右分屏"],["bottom","向下分屏"],["left","向左分屏"],["top","向上分屏"]].forEach(([edge,label]) => { add(L(label),"layoutSplit",edge).disabled = narrow(); });
    layoutMenu.append(document.createElement("hr"));
    add(L("均分所有窗口"),"layoutAction","equal").disabled = state.panes.length < 2;
    add(L("关闭当前窗口"),"layoutAction","close").disabled = state.panes.length < 2;
    if (state.panes.length > 1) { layoutMenu.append(document.createElement("hr")); state.panes.forEach((pane,index) => add(String(index+1)+" · "+(pane.tabs.find(t=>t.id===pane.activeTabId)?.title || (pane.viewPlugin ? ops.pluginTitle(pane.viewPlugin) : L("项目首页"))),"focusPane",pane.id,pane.id===state.focusedPaneId)); }
    const rect = trigger.getBoundingClientRect();
    layoutMenu.style.maxHeight = "";
    layoutMenu.style.overflowY = "";
    layoutMenu.showPopover();
    const placed = placeLayoutMenu(rect, { width: layoutMenu.offsetWidth, height: layoutMenu.offsetHeight }, { width: innerWidth, height: innerHeight });
    if (placed.maxHeight != null) {
      layoutMenu.style.maxHeight = placed.maxHeight + "px";
      layoutMenu.style.overflowY = "auto";
    }
    layoutMenu.style.top = placed.top + "px";
    layoutMenu.style.left = placed.left + "px";
    layoutMenu.querySelector("button:not(:disabled)")?.focus();
  };
  layoutMenu.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.layoutSplit) ops.splitPane(state, layoutPane, button.dataset.layoutSplit, "copy");
    else if (button.dataset.layoutAction === "close") ops.closePane(state, layoutPane);
    else if (button.dataset.layoutAction === "equal") { const equal = node => { if (node?.children) { node.ratio=.5; node.children.forEach(equal); } }; equal(state.layout.tree); }
    else if (button.dataset.focusPane) state.focusedPaneId = button.dataset.focusPane;
    layoutMenu.hidePopover(); apply(); persist(); focusActiveTab();
  });
  const handleStripClick = (paneId, event) => {
    const focusPane = event.target.closest("[data-focus-pane]");
    if (focusPane) { activate(focusPane.dataset.focusPane); return true; }
    if (!paneId) return;
    const add = event.target.closest("[data-tab-add]");
    if (add) { openTabMenu(paneId, add); return true; }
    const split = event.target.closest("[data-tab-split]");
    if (split) {
      openLayoutMenu(paneId, split); return true;
    }
    if (event.target.closest("[data-cover-close]")) {
      event.preventDefault();
      closeCover();
      focusActiveTab();
      return true;
    }
    const close = event.target.closest("[data-tab-close]");
    if (close) {
      event.preventDefault();
      closeTabBack(paneId, close.dataset.tabClose);
      focusActiveTab();
      return true;
    }
    const toggle = event.target.closest("[data-tab-group-toggle]");
    if (toggle) {
      const strip = toggle.closest(".tab-strip");
      ops.toggleGroup(state, paneId, toggle.dataset.tabGroupToggle);
      apply();
      persist();
      const label = strip?.querySelector('[data-tab-group-toggle="' + CSS.escape(toggle.dataset.tabGroupToggle) + '"]');
      label?.focus({ preventScroll: true });
      return true;
    }
    const pluginTab = event.target.closest('[data-tab-kind="plugin"]');
    if (pluginTab) {
      const pane = paneById(paneId);
      if (!pane) return true;
      // Already on the plugin's page: its tab goes back to the page's list.
      if (ops.shownPlugin(pane) === pluginTab.dataset.plugin && !pane.activeTabId && state.focusedPaneId === paneId && !state.exclusive) { resetPluginPage(pane.viewPlugin); return true; }
      state.focusedPaneId = paneId;
      const railButton = document.querySelector('[data-dock] [data-plugin-id="' + CSS.escape(pluginTab.dataset.plugin) + '"]');
      if (railButton && ops.shownPlugin(pane) !== pluginTab.dataset.plugin) railButton.click();
      else activate(paneId, pluginTab.dataset.tabId);
      focusActiveTab();
      return true;
    }
    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
      const pane = paneById(paneId);
      const alreadyActive = pane?.activeTabId === tab.dataset.tabId && state.focusedPaneId === paneId;
      if (!alreadyActive || state.exclusive) {
        activate(paneId, tab.dataset.tabId);
      }
      focusActiveTab();
      return true;
    }
    return false;
  };
  panesEl.addEventListener("click", (event) => {
    const pane = event.target.closest("[data-tab-pane]");
    if (!pane) return;
    const closePane = event.target.closest("[data-tab-pane-close]");
    if (closePane) {
      event.preventDefault();
      ops.closePane(state, pane.dataset.tabPane);
      apply();
      persist();
      return;
    }
    const edge = event.target.closest("[data-tab-edge]");
    if (edge) {
      if (narrow()) return;
      ops.splitPane(state, pane.dataset.tabPane, edge.dataset.tabEdge, "copy");
      apply();
      persist();
      return;
    }
    if (handleStripClick(pane.dataset.tabPane, event)) return;
    // Content clicks in the focused pane must not remount its document and lose focus.
    if (state.focusedPaneId !== pane.dataset.tabPane) activate(pane.dataset.tabPane, pane.querySelector("[data-tab-id][aria-current]")?.dataset.tabId);
  });
  if (titlebarStrip) {
    titlebarStrip.addEventListener("click", (event) => handleStripClick(titlebarStrip.dataset.chromePane, event));
    titlebarStrip.addEventListener("keydown", (event) => handleStripKey(titlebarStrip.dataset.chromePane, event));
  }
  document.querySelector(".workspace-history")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-workspace-history]");
    if (!button || button.disabled) return;
    if (button.dataset.workspaceHistory === "back") goHistory(-1);
    if (button.dataset.workspaceHistory === "forward") goHistory(1);
  });
  /* The way back from the keyboard and the mouse: ⌘[ / ⌘] (Alt+← / Alt+→ elsewhere) and the side buttons walk the
     same history as the titlebar arrows. A pane in a frame hands the step to the window. */
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
  const editable = (node) => node?.nodeType === 1 && Boolean(node.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, [data-tui-pane]'));
  const historyStep = (event) => {
    if (event.defaultPrevented || event.repeat) return 0;
    if (MAC && event.metaKey && !event.altKey && !event.ctrlKey && (event.key === "[" || event.key === "]")) return event.key === "[" ? -1 : 1;
    if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !editable(event.target)) return event.key === "ArrowLeft" ? -1 : 1;
    return 0;
  };
  const stepHistory = (delta) => { if (embedded) notifyParent("workbench-pane-history", { delta }); else goHistory(delta); };
  document.addEventListener("keydown", (event) => {
    const delta = historyStep(event);
    if (!delta || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    stepHistory(delta);
  });
  // The side buttons would otherwise take the browser away from the workbench.
  const sideButton = (event) => event.button === 3 || event.button === 4;
  window.addEventListener("mousedown", (event) => { if (sideButton(event)) event.preventDefault(); });
  window.addEventListener("mouseup", (event) => {
    if (!sideButton(event)) return;
    event.preventDefault();
    stepHistory(event.button === 3 ? -1 : 1);
  });
  /* Esc steps out of a cover, unless something smaller is open in it (a field being typed in, a menu, a dialog, a
     page's own editor marked data-cover-layer) or a save is under way: those take the Esc first. */
  let escapeHadLayer = false;
  const openLayer = () => [...document.querySelectorAll("dialog[open], :popover-open, details[open][data-layer-open], details[open][data-project-menu], details[open][data-global-menu], [data-plugin-picker-popover]:not([hidden]), [data-dock-overflow]:not([hidden]), [data-assistant-panel]:not([hidden]), [data-cover-layer]:not([hidden]), form[aria-busy=true]")].some((node) => !node.closest("[hidden], [inert]") && node.getClientRects().length && getComputedStyle(node).visibility === "visible");
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") escapeHadLayer = openLayer(); }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || embedded || !state.exclusive || escapeHadLayer || event.defaultPrevented || editable(event.target)) return;
    event.preventDefault();
    closeCover();
  });
  /* The entry that opened a cover closes it when chosen again, and the menu it sits in closes with it. */
  window.addEventListener("click", (event) => {
    if (embedded || !state.exclusive || event.target?.nodeType !== 1) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const kind = coverKindOf(event.target);
    if (!kind || kind !== state.exclusive) return;
    event.preventDefault();
    event.stopPropagation();
    event.target.closest("details[open]")?.removeAttribute("open");
    closeCover();
  }, true);
  panesEl.addEventListener("keydown", (event) => { if (!event.target.closest("[data-tab-sash]")) handleStripKey(event.target.closest("[data-tab-pane]")?.dataset.tabPane, event); });
  (${TAB_SASH_FACTORY})({ panes: panesEl, root, find: (id) => findSplit(state.layout.tree, id), sync: layoutSplits, persist, range: splitRatioRange, snap: snapSplitRatio, defaultRatio: TAB_SPLIT_RATIO });
  let dragTab = null;
  let reorderKey = "";
  const stripFor = (paneId) => {
    if (titlebarStrip && !titlebarStrip.hidden && titlebarStrip.dataset.chromePane === paneId) return titlebarStrip;
    return panesEl.querySelector('[data-tab-pane="' + paneId + '"] [data-tab-strip]');
  };
  const dragSlot = (${TAB_DRAG_SLOT_FACTORY})({ ms: TAB_REORDER_MS, ease: TAB_REORDER_EASE });
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
  const paintResultPreview = (target, copy) => {
    if (!target?.paneId || !dragTab) { delete panesEl.dataset.splitDropPreview; return; }
    let box = null;
    try {
      box = focusedPaneBoxAfterDrop(state, ops, target, copy, dragTab.paneId, dragTab.tabId);
    } catch { /* the preview box is only a hint: without it the pane's current box is shown */ }
    if (!box) box = layoutPaneBoxes(state.layout.tree).find((item) => item.paneId === target.paneId);
    if (!box) { delete panesEl.dataset.splitDropPreview; return; }
    const stage = panesEl.getBoundingClientRect();
    panesEl.style.setProperty("--split-preview-left", (stage.left + stage.width * box.x / 100 + 4) + "px");
    panesEl.style.setProperty("--split-preview-top", (stage.top + stage.height * box.y / 100 + 4) + "px");
    panesEl.style.setProperty("--split-preview-width", Math.max(0, stage.width * box.w / 100 - 8) + "px");
    panesEl.style.setProperty("--split-preview-height", Math.max(0, stage.height * box.h / 100 - 8) + "px");
    // Recreate ::after so inherited custom properties recompute; changing only the vars leaves the old used size.
    delete panesEl.dataset.splitDropPreview;
    void panesEl.offsetWidth;
    panesEl.dataset.splitDropPreview = "1";
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
  };
  [panesEl, titlebarStrip].filter(Boolean).forEach((surface) => {
    surface.addEventListener("contextmenu", (event) => {
      const paneId = event.target.closest("[data-tab-pane]")?.dataset.tabPane || surface.dataset.chromePane;
      const groupLabel = event.target.closest("[data-tab-group-toggle]");
      if (groupLabel) {
        event.preventDefault(); openGroupMenu(paneId, groupLabel.dataset.tabGroupToggle, groupLabel); return;
      }
      const tab = event.target.closest("[data-tab-id]"); if (!tab) return;
      event.preventDefault(); openTabMenu(paneId, tab, tab.dataset.tabId);
    });
    surface.addEventListener("dragstart", (event) => {
      const tab = event.target.closest("[data-tab-id]"); if (!tab) return;
      // A plugin's tab carries its whole group.
      const group = tab.dataset.tabKind === "plugin" ? tab.closest("[data-plugin-group]") : null, source = group || tab;
      const paneId = tab.closest("[data-tab-pane]")?.dataset.tabPane || surface.dataset.chromePane || state.focusedPaneId;
      const members = group ? [...group.querySelectorAll(".tab-item[data-tab-id]")].map((node) => node.dataset.tabId) : null;
      const pane = paneById(paneId), last = pane ? pane.tabs.findIndex((item) => item.id === (members?.at(-1) || tab.dataset.tabId)) : -1;
      const box = source.getBoundingClientRect();
      // The first preview is the place the drag started from, so nothing moves until the pointer does.
      dragTab = { paneId, tabId: tab.dataset.tabId, width: Math.round(box.width) || 172, members, hoverBeforeId: pane?.tabs[last + 1]?.id, homeBeforeId: pane?.tabs[last + 1]?.id };
      if (event.dataTransfer.effectAllowed !== "copy") event.dataTransfer.effectAllowed = "copyMove"; event.dataTransfer.setData("text/plain", tab.title);
      const ghost = document.createElement("nav");
      ghost.className = "tab-strip"; ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = "position:absolute;top:-1000px;left:0;width:auto;height:auto;margin:0;padding:0;border:0;background:transparent;";
      const copyNode = source.cloneNode(true);
      copyNode.style.width = dragTab.width + "px"; copyNode.style.margin = "0";
      ghost.append(copyNode);
      document.body.append(ghost);
      try { event.dataTransfer.setDragImage(ghost, Math.max(0, Math.min(event.clientX - box.left, dragTab.width)), Math.max(0, Math.min(event.clientY - box.top, box.height))); } catch { /* the browser refused the custom drag image: the tab drags with its default one */ }
      requestAnimationFrame(() => ghost.remove());
      root.classList.add("is-tab-dragging"); window.addEventListener("pointermove", () => { if (dragTab) finishDrag(); }, { once: true, capture: true }); // a tab redrawn mid-drag takes its dragend with it; no pointer moves come during a drag
      document.body.classList.add("is-tab-dragging");
      document.body.style.setProperty("--tab-reorder-width", dragTab.width + "px");
    });
    surface.addEventListener("dragend", finishDrag); surface.addEventListener("dragleave", (event) => { if (dragTab && !event.relatedTarget?.closest?.("[data-tab-panes], [data-titlebar-tabs]")) { root.querySelectorAll("[data-drop-preview]").forEach((node) => node.removeAttribute("data-drop-preview")); paintDropPreview({ paneId: dragTab.paneId, beforeId: dragTab.homeBeforeId }, false); } }); // off every tab surface a drop does nothing, so the preview is the tab back where it was
    surface.addEventListener("dragover", (event) => {
      if (!dragTab) return; event.preventDefault();
      const copy = isCopyDrop(event);
      if (event.dataTransfer) event.dataTransfer.dropEffect = copy ? "copy" : "move";
      const target = dropTarget(event, surface);
      root.querySelectorAll("[data-drop-preview]").forEach((node) => node.removeAttribute("data-drop-preview"));
      if (target.section) target.section.dataset.dropPreview = target.edge || "center";
      paintDropPreview(target, copy);
    });
    surface.addEventListener("drop", (event) => {
      if (!dragTab) return; event.preventDefault();
      const target = dropTarget(event, surface);
      const copy = isCopyDrop(event);
      if (target.paneId) {
        if (target.edge) ops.splitPane(state, target.paneId, target.edge, copy ? "copy" : "move", dragTab.paneId, dragTab.tabId);
        else {
          ops.moveTab(state, dragTab.paneId, dragTab.tabId, target.paneId, target.beforeId, copy);
          if (target.groupId && !dragTab.members) ops.addTabToGroup(state, target.paneId, ops.activeTab(state)?.id, target.groupId);
        }
      }
      finishDrag(); apply(); persist();
    });
  });
  window.addEventListener("message", (event) => {
    if (embedded) {
      if (!panes.fromParent(event)) return;
      if (event.data.type === "workbench-feed-task") setFeedTask?.(event.data.taskId, false);
      if (event.data.type !== "workbench-goal-view") return;
      const tab = ops.activeTab(state);
      if (tab?.plugin === "goals" && tab.kind === "item") {
        if (event.data.view === "work") tab.goalView = "work"; else delete tab.goalView;
      }
      apply();
      return;
    }
    const frame = panes.from(event);
    if (frame && event.data.type === "workbench-open-settings") {
      document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: event.data.href || "" } }));
      return;
    }
    if (!["workbench-pane-focus", "workbench-pane-open", "workbench-pane-open-beside", "workbench-pane-goal-view", "workbench-pane-history"].includes(event.data?.type)) return;
    const pane = paneById(frame?.dataset.paneOwner);
    if (!pane) return;
    if (event.data.type === "workbench-pane-history") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
      if (event.data.delta === -1 || event.data.delta === 1) goHistory(event.data.delta);
    } else if (event.data.type === "workbench-pane-goal-view") {
      const tab = pane.tabs.find(tab => tab.id === frame.dataset.paneTab);
      if (tab?.plugin === "goals" && tab.kind === "item") {
        if (event.data.view === "work") tab.goalView = "work"; else delete tab.goalView;
        persist(); apply();
      }
    } else if (event.data.type === "workbench-pane-focus") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
    } else if (event.data.type === "workbench-pane-open-beside") {
      state.focusedPaneId = pane.id;
      openBeside(event.data.plugin, event.data.itemId, event.data.title);
    } else {
      state.focusedPaneId = pane.id;
      if (event.data.background === true && event.data.itemId) pluginGroups.openBehind(event.data.plugin, event.data.itemId, event.data.title);
      else if (typeof event.data.recordId === "string") openPluginRecord(event.data.plugin, event.data.recordId);
      else if (event.data.itemId) openItem(event.data.plugin, event.data.itemId, event.data.title, event.data.goalView); else openPlugin(event.data.plugin);
    }
  });
  document.addEventListener("click", (event) => {
    const sourceItem = event.target.closest("[data-workbench-item-plugin][data-workbench-item-id]");
    if (sourceItem) {
      event.preventDefault();
      const plugin = sourceItem.dataset.workbenchItemPlugin, itemId = sourceItem.dataset.workbenchItemId;
      if (!Object.hasOwn(PLUGIN_TAB_ICON, plugin) || !itemId) return;
      const title = sourceItem.dataset.workbenchItemTitle;
      if (embedded) notifyParent("workbench-pane-open", { plugin, itemId, title });
      else openItem(plugin, itemId, title);
      return;
    }
    if (event.target.closest("[data-goal-collapse]")) {
      const tab = ops.activeTab(state);
      if (tab?.plugin === "goals" && tab.kind === "item") { delete tab.goalView; apply(); persist(); if (embedded) notifyParent("workbench-pane-goal-view", {view:"frame"}); }
    }
  });
  // Choosing another Goal inside a Goal tab (its workspace directory, a relation link) takes the tab with it, so its
  // label and restore target match what it shows; a Goal that already has its own tab is opened there instead.
  document.addEventListener("molis-work:goal-changed", (event) => {
    const goalId = event.detail?.goalId;
    if (embedded || applying || !goalId) return;
    const pane = ops.focused(state), tab = ops.activeTab(state);
    if (!pane || tab?.plugin !== "goals" || tab.kind !== "item" || tab.itemId === goalId) return;
    const existing = pane.tabs.find((item) => item.plugin === "goals" && item.kind === "item" && item.itemId === goalId);
    if (existing) { if (tab.goalView === "work") existing.goalView = "work"; activate(pane.id, existing.id); return; }
    tab.itemId = goalId;
    if (event.detail.goalTitle) tab.title = event.detail.goalTitle;
    // The selection that fired this is already loading the Goal's document; redraw the tab without a second load,
    // which would race the one whose late response must not win.
    const loading = loadingGoalId;
    loadingGoalId = goalId;
    apply(); persist();
    if (loadingGoalId === goalId) loadingGoalId = loading;
  });
  document.addEventListener("workbench-feed-task", (event) => {
    if (embedded) return;
    const tab = ops.activeTab(state);
    if (tab?.plugin !== "feed") return;
    tab.feedTask = event.detail.taskId;
    const frame = panesEl.querySelector('iframe[data-pane-tab="' + tab.id + '"]');
    frame?.contentWindow?.postMessage({ type: "workbench-feed-task", taskId: tab.feedTask }, location.origin);
    persist();
  });
  if (embedded && paneParams.has("paneFeedTask")) requestAnimationFrame(() => setFeedTask?.(paneParams.get("paneFeedTask"), false));
  return { apply, openPlugin, openPluginRecord, openItem, openBeside, openBehind: pluginGroups.openBehind, openGoalWork, closeItem, addFeedTask, setExclusive, restore, landAtProjectRoot,
    pluginTitle: ops.pluginTitle, leavePlugin, closeCover, openCover, registerCover, noteCover, coverPlace: restoredCoverPlace, goHistory,
    shownPlugin: () => state.exclusive ? null : ops.shownPlugin(ops.focused(state)),
    exclusive: () => state.exclusive, isExclusive: () => Boolean(state.exclusive), isEmbedded: () => embedded, state: () => state };
}`;
