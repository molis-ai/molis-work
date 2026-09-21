import { MW_PLUGINS } from "@molis-ai/molis-work-design-system";
import { pluginTabGlyphs } from "../../plugin-catalog.js";
import { createTabWorkspaceOps } from "../../tab-workspace-ops.js";
import { tabIdsAfterMove, TAB_REORDER_EASE, TAB_REORDER_MS } from "../../tab-reorder.js";
import { tabShareWidth, tabShareMin, tabScrollAllotment, TAB_SHARE_MAX, TAB_SHARE_MIN, TAB_SHARE_MIN_TOUCH } from "../../tab-strip-share.js";
import { clampSplitRatio, focusedPaneBoxAfterDrop, layoutPaneBoxes, splitDropEdge, TAB_SASH_HALF, TAB_SASH_INSET, TAB_SPLIT_EDGE_X, TAB_SPLIT_EDGE_Y, TAB_SPLIT_RATIO } from "../../tab-split-drop.js";

/** Cross-plugin tabs and split panes. Goals canvas/kanban/Frame chrome stays in frame-container. */
export const TAB_WORKSPACE_FACTORY_SCRIPT = `(host) => {
  const { showGoalFrame, setFeedAddOpen, setFeedTask, translate: L, getSurface, setWorkSurface, setDirectory, setWorkspaceMode, setMobileView,
    applySelection, loadGoalDocument, getDocumentGoalId, locateGraphNode, selectFeedItem, selectInboxEntry, getProjectId, visibleGoals, showCanvas, restoreBoard, releaseFrame, isFrameTabActive } = host;
  const root = document.querySelector("[data-tab-workspace]");
  const panesEl = document.querySelector("[data-tab-panes]");
  const pool = document.querySelector("[data-surface-pool]");
  if (!root || !panesEl || !pool) return { apply() {}, openPlugin() {}, openItem() {}, setExclusive() {}, restore() {}, isExclusive() { return false; } };
  const PLUGIN_COLOR = ${JSON.stringify(Object.fromEntries(MW_PLUGINS.map((plugin) => [plugin.id, `var(--plugin-${plugin.id})`])))};
  const PLUGIN_TAB_ICON = ${JSON.stringify(pluginTabGlyphs())};
  const GROUP_COLOR = { grey: "var(--hue-gray)", blue: "var(--hue-blue)", red: "var(--hue-red)", yellow: "var(--hue-yellow)", green: "var(--hue-green)", pink: "var(--hue-pink)", purple: "var(--hue-purple)", cyan: "var(--hue-cyan)" };
  const ops = (${createTabWorkspaceOps.toString()})();
  const TAB_SPLIT_EDGE_X = ${TAB_SPLIT_EDGE_X};
  const TAB_SPLIT_EDGE_Y = ${TAB_SPLIT_EDGE_Y};
  const TAB_SPLIT_RATIO = ${TAB_SPLIT_RATIO};
  const TAB_SASH_INSET = ${TAB_SASH_INSET};
  const TAB_SASH_HALF = ${TAB_SASH_HALF};
  const clampSplitRatio = ${clampSplitRatio.toString()};
  const splitDropEdge = ${splitDropEdge.toString()};
  const layoutPaneBoxes = ${layoutPaneBoxes.toString()};
  const focusedPaneBoxAfterDrop = ${focusedPaneBoxAfterDrop.toString()};
  const tabIdsAfterMove = ${tabIdsAfterMove.toString()};
  const TAB_REORDER_MS = ${TAB_REORDER_MS};
  const TAB_REORDER_EASE = ${JSON.stringify(TAB_REORDER_EASE)};
  const tabShareWidth = ${tabShareWidth.toString()};
  const tabShareMin = ${tabShareMin.toString()};
  const tabScrollAllotment = ${tabScrollAllotment.toString()};
  const TAB_SHARE_MAX = ${TAB_SHARE_MAX};
  const TAB_SHARE_MIN = ${TAB_SHARE_MIN};
  const TAB_SHARE_MIN_TOUCH = ${TAB_SHARE_MIN_TOUCH};
  const storageKey = "molis-work-tab-workspace:" + (getProjectId() || "board");
  const paneParams = new URLSearchParams(location.search);
  const embedded = window.parent !== window && paneParams.has("workbenchPane");
  if (embedded) document.body.dataset.paneEmbedded = "true";
  const notifyParent = (type, payload = {}) => { if (embedded) parent.postMessage({ type, paneId: paneParams.get("workbenchPane"), ...payload }, location.origin); };
  if (embedded) {
    document.addEventListener("pointerdown", () => notifyParent("workbench-pane-focus"), true);
    document.addEventListener("focusin", () => notifyParent("workbench-pane-focus"));
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      const path = new URL(link.href, location.origin).pathname;
      if (!path.includes("/settings")) return;
      event.preventDefault();
      notifyParent("workbench-open-settings", { href: link.href });
    });
  }
  const narrow = () => matchMedia("(max-width: 760px)").matches;
  let state = ops.create();
  const persist = () => { if (embedded) return; try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {} };
  const restore = () => {
    if (embedded) {
      state = ops.create();
      const pane = ops.focused(state);
      const plugin = paneParams.get("panePlugin") || "home";
      if (paneParams.has("paneItem")) {
        pane.tabs = [];
        pane.activeTabId = null;
        pane.groups = [];
        const tab = ops.openItem(state, plugin, paneParams.get("paneItem"), paneParams.get("paneTitle"));
        if (plugin === "goals" && paneParams.get("paneGoalView") === "work") tab.goalView = "work";
      } else if (plugin === "home") {
        ops.openPlugin(state, "home");
      } else {
        pane.tabs = [];
        pane.activeTabId = null;
        pane.groups = [];
        ops.openPlugin(state, plugin);
      }
      apply();
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored?.panes?.length) {
        state = stored;
        ops.ensureHome(state);
        persist();
      }
    } catch {}
    rewriteRetiredTaskTabs();
    apply();
    persist();
  };
  const rewriteRetiredTaskTabs = () => {
    for (const pane of state.panes || []) {
      pane.tabs = (pane.tabs || []).filter((tab) => {
        if (tab.plugin !== "task") return true;
        if (tab.kind !== "item" || !tab.goalId) return false;
        tab.plugin = "goals";
        tab.itemId = tab.goalId;
        delete tab.goalId;
        delete tab.goalView;
        return true;
      });
      if (pane.activeTabId && !pane.tabs.some((tab) => tab.id === pane.activeTabId) && !pane.viewPlugin) pane.activeTabId = pane.tabs[0]?.id;
    }
    ops.ensureHome(state);
  };
  const pluginSurface = (plugin) => plugin === "goals" ? "goal" : plugin === "home" ? "home" : plugin;
  const directoryOf = (plugin) => {
      if (plugin === "home" || plugin === "market") return "root";
      const directory = plugin === "goals" ? "goals" : plugin;
      return document.querySelector('[data-directory-panel="' + directory + '"]') ? directory : "root";
    };
  const supportsGoalFrames = () => document.body.dataset.boardView === "current";
  const topLevelSurface = (plugin) => plugin === "goals"
    ? document.querySelector("[data-goal-canvas-shell]") || document.querySelector('[data-document-pane]')
    : [...document.querySelectorAll('[data-work-surface="' + pluginSurface(plugin) + '"]')]
      .find((node) => !node.closest("[data-goal-canvas-shell]")) || null;
  const rootForTab = (tab) => supportsGoalFrames() && tab?.plugin === "goals" && tab.kind === "item" && tab.goalView !== "work"
    ? document.querySelector("[data-goal-frame-surface]") : tab ? topLevelSurface(tab.plugin) : null;
  const titleForItem = (plugin, itemId, fallback) => {
    if (plugin === "goals") return visibleGoals()?.find((item) => item.goal.goal_id === itemId)?.goal.title || fallback || itemId;
    const row = document.querySelector('[data-operation-select="' + CSS.escape(itemId) + '"], [data-feed-entry-id="' + CSS.escape(itemId) + '"], [data-inbox-row="' + CSS.escape(itemId) + '"], [data-artifact-select="' + CSS.escape(itemId) + '"]');
    return row?.getAttribute("data-frame-asset-title") || row?.querySelector("strong")?.textContent?.trim() || fallback || itemId;
  };
  let loadingGoalId = null;
  const collapsePluginStage = (plugin) => {
    const surface = topLevelSurface(plugin);
    if (!surface) return;
    surface.setAttribute("data-expanded", "false");
    const workspace = surface.querySelector(".plugin-stage-workspace, [data-session-stage-workspace], [data-artifact-stage-workspace], [data-shelf-stage-workspace], [data-schedule-stage-workspace]");
    if (workspace) workspace.hidden = true;
    surface.querySelectorAll(".is-selected").forEach((row) => {
      row.classList.remove("is-selected");
      if (row.hasAttribute("aria-selected")) row.setAttribute("aria-selected", "false");
    });
  };
  const applyPluginDefault = (plugin) => {
    if (!plugin) return;
    if (plugin === "goals") {
      document.querySelector("[data-goal-collapse]")?.setAttribute("aria-label", L("收起 Goal，返回关系画布"));
      (restoreBoard || showCanvas)?.();
      return;
    }
    collapsePluginStage(plugin);
    if (plugin === "feed") setFeedTask?.("all", false);
  };
  const applyTabContent = (tab, keepFrame) => {
    if (!tab) return;
    if (tab.plugin === "goals" && tab.kind === "item" && tab.itemId) {
      if (supportsGoalFrames() && tab.goalView !== "work") { applySelection?.(tab.itemId); showGoalFrame?.(tab.itemId); return; }
      releaseFrame?.();
      applySelection?.(tab.itemId);
      if ((getDocumentGoalId() !== tab.itemId || loadingGoalId) && loadingGoalId !== tab.itemId) {
        const goalId = tab.itemId;
        loadingGoalId = goalId;
        void loadGoalDocument(goalId).then((loaded) => {
          if (loaded) document.dispatchEvent(new CustomEvent("molis-work:goal-document-loaded", { detail: { goalId } }));
        }).finally(() => { if (loadingGoalId === goalId) loadingGoalId = null; });
      }
      setWorkspaceMode("focus", false, true);
      const collapse = document.querySelector("[data-goal-collapse]");
      collapse?.setAttribute("aria-label", L("返回 Goal 画布"));
      collapse?.setAttribute("title", L("返回 Goal 画布"));
      return;
    }
    if (tab.plugin === "goals") {
      document.querySelector("[data-goal-collapse]")?.setAttribute("aria-label", L("收起 Goal，返回关系画布"));
      if (keepFrame) {
        setWorkSurface("goal");
        setWorkspaceMode("graph", false, true);
        return;
      }
      (restoreBoard || showCanvas)?.();
      return;
    }
    if (tab.plugin === "feed" && tab.feedTask) setFeedTask?.(tab.feedTask, false);
    if (tab.plugin === "feed" && tab.kind === "item" && tab.itemId) selectFeedItem?.(tab.itemId, false, true, false);
    if (tab.plugin === "inbox" && tab.kind === "item" && tab.itemId) selectInboxEntry?.(tab.itemId, false);
    if (tab.plugin === "sessions" && tab.kind === "item" && tab.itemId) {
      const surface = topLevelSurface("sessions");
      const row = document.querySelector('[data-operation-directory="sessions"] [data-record-id="' + CSS.escape(tab.itemId) + '"]');
      if (row && !row.classList.contains("is-selected")) row.click();
      else {
        surface?.setAttribute("data-expanded", "true");
        const workspace = surface?.querySelector("[data-session-stage-workspace]");
        if (workspace) workspace.hidden = false;
        surface?.querySelectorAll("[data-operation-detail]").forEach((detail) => {
          detail.hidden = detail.dataset.detailId !== tab.itemId;
        });
        document.querySelectorAll('[data-operation-directory="sessions"] [data-operation-row]').forEach((row) => {
          const active = row.dataset.recordId === tab.itemId;
          row.classList.toggle("is-selected", active);
          row.setAttribute("aria-selected", String(active));
        });
        surface?.querySelector('[data-operation-detail]:not([hidden]) [data-session-content-load]')?.click();
      }
    }
  };
  const mount = (pane, node) => {
    const body = panesEl.querySelector('[data-tab-pane="' + pane.id + '"] [data-tab-pane-body]');
    if (!body || !node) return;
    if (node.parentElement !== body) body.append(node);
    node.hidden = false;
  };
  const paneMarkup = () => '<nav class="tab-strip" data-tab-strip></nav><div class="tab-pane-body" data-tab-pane-body></div><button type="button" class="tab-pane-close" data-tab-pane-close aria-label="' + L("关闭分栏") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button><div class="tab-drop-edges" data-tab-edges><button type="button" data-tab-edge="left" aria-label="' + L("拆到左侧") + '"></button><button type="button" data-tab-edge="right" aria-label="' + L("拆到右侧") + '"></button><button type="button" data-tab-edge="top" aria-label="' + L("拆到上方") + '"></button><button type="button" data-tab-edge="bottom" aria-label="' + L("拆到下方") + '"></button></div>';
  const tabLabel = (tab) => {
    if (tab.plugin === "home") return L("项目首页");
    if (tab.kind === "mother") return tab.plugin === "goals" ? L("画布") : ops.pluginTitle(tab.plugin);
    return tab.title;
  };
  const tabIcon = (plugin) => PLUGIN_TAB_ICON[plugin] || "frame";
  const iconMarkup = (plugin) => '<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-' + tabIcon(plugin) + '"></use></svg>';
  const appendTab = (parent, pane, tab) => {
    const selected = tab.id === pane.activeTabId;
    const button = document.createElement("div");
    button.className = "tab-item" + (selected ? " is-active" : "");
    button.dataset.tabId = tab.id;
    button.dataset.plugin = tab.plugin;
    if (tab.itemId) button.dataset.itemId = tab.itemId;
    button.dataset.tabKind = tab.kind;
    if (tab.pinned) button.dataset.pinned = "true";
    button.style.setProperty("--plugin-color", PLUGIN_COLOR[tab.plugin] || "var(--muted)");
    button.draggable = true;
    button.title = tabLabel(tab);
    if (selected) button.setAttribute("aria-current", "page");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.role = "tab";
    trigger.className = "tab-item-trigger";
    trigger.tabIndex = selected ? 0 : -1;
    trigger.setAttribute("aria-label", tabLabel(tab));
    trigger.setAttribute("aria-selected", String(selected));
    const name = document.createElement("span");
    name.textContent = tabLabel(tab);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-item-close";
    close.dataset.tabClose = tab.id;
    close.setAttribute("aria-label", L("关闭标签"));
    close.title = L("关闭标签") + " · " + tabLabel(tab);
    close.tabIndex = selected ? 0 : -1;
    close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    trigger.innerHTML = iconMarkup(tab.plugin);
    name.className = "tab-item-name";
    trigger.append(name);
    button.append(trigger);
    if (!tab.pinned) button.append(close);
    parent.append(button);
  };
  const tabHugWidth = (node) => {
    if (node.hasAttribute("data-tab-reorder-slot")) {
      const fromVar = Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--tab-reorder-width"));
      return Math.min(TAB_SHARE_MAX, fromVar || node.getBoundingClientRect().width || TAB_SHARE_MIN);
    }
    const cs = getComputedStyle(node);
    const trigger = node.querySelector(".tab-item-trigger");
    const name = node.querySelector(".tab-item-name");
    const icon = node.querySelector(".tab-item-icon");
    const close = node.querySelector(".tab-item-close");
    const gap = trigger ? Number.parseFloat(getComputedStyle(trigger).gap) || 0 : 0;
    const itemGap = close ? Number.parseFloat(cs.columnGap) || Number.parseFloat(cs.gap) || 0 : 0;
    const inner = (icon ? icon.getBoundingClientRect().width : 0) + gap + (name ? name.scrollWidth : 0) + itemGap + (close ? close.getBoundingClientRect().width : 0);
    const chrome = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight) + Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.borderRightWidth);
    return Math.min(TAB_SHARE_MAX, Math.ceil(chrome + inner));
  };
  const shareTabStrip = (scroll) => {
    if (!scroll) return;
    const strip = scroll.parentElement;
    if (!strip || strip.clientWidth < 1) return;
    const flexTabs = [...scroll.querySelectorAll(".tab-item:not([data-pinned]):not(.is-tab-drag-source)")].filter((tab) => !tab.closest('.tab-group[data-collapsed="true"]'));
    const slot = scroll.querySelector("[data-tab-reorder-slot]");
    const flexNodes = slot ? flexTabs.concat(slot) : flexTabs;
    const clearShare = () => {
      scroll.style.removeProperty("--tab-share-width");
      scroll.style.removeProperty("width");
    };
    if (!flexNodes.length) {
      clearShare();
      return;
    }
    const flexSet = new Set(flexNodes);
    const gapOf = (el) => Number.parseFloat(getComputedStyle(el).gap) || 0;
    let reserved = 0;
    const scrollKids = [...scroll.children];
    reserved += gapOf(scroll) * Math.max(0, scrollKids.length - 1);
    for (const child of scrollKids) {
      if (flexSet.has(child)) continue;
      if (child.classList?.contains("tab-group")) {
        const label = child.querySelector(":scope > .tab-group-label");
        if (label) reserved += label.getBoundingClientRect().width;
        const pages = child.querySelector(".tab-group-pages") || child;
        const kids = [...pages.children].filter((el) => el.classList.contains("tab-item") || el.hasAttribute("data-tab-reorder-slot"));
        reserved += gapOf(pages) * Math.max(0, kids.length - 1);
        for (const kid of kids) {
          if (!flexSet.has(kid)) reserved += kid.getBoundingClientRect().width;
        }
        continue;
      }
      reserved += child.getBoundingClientRect().width;
    }
    let siblingChrome = 0;
    const stripKids = [...strip.children];
    for (const child of stripKids) {
      if (child === scroll) continue;
      if (child.classList.contains("tab-strip-spacer")) {
        siblingChrome += Number.parseFloat(getComputedStyle(child).minWidth) || 0;
        continue;
      }
      siblingChrome += child.getBoundingClientRect().width;
    }
    const allotted = tabScrollAllotment(strip.clientWidth, siblingChrome, gapOf(strip), stripKids.length);
    const share = tabShareWidth(allotted - reserved, flexNodes.map(tabHugWidth), tabShareMin(window.matchMedia("(max-width: 760px), (pointer: coarse)").matches));
    if (share == null) {
      if (!(scroll.style.getPropertyValue("--tab-share-width") || scroll.style.width)) return;
      clearShare();
      return;
    }
    const next = share + "px";
    const nextWidth = allotted + "px";
    if (scroll.style.getPropertyValue("--tab-share-width") === next && scroll.style.width === nextWidth) return;
    scroll.style.setProperty("--tab-share-width", next);
    scroll.style.width = nextWidth;
  };
  const tabShareObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const node = entry.target;
      shareTabStrip(node.matches("[data-tab-scroll]") ? node : node.querySelector("[data-tab-scroll]"));
    }
  });
  const scrollTabIntoStrip = (tab) => {
    const scroller = tab?.closest("[data-tab-scroll]") || tab?.closest(".tab-strip")?.querySelector("[data-tab-scroll]");
    if (!tab || !scroller) return;
    const pad = scroller.querySelector("[data-tab-scroll-pad]");
    if (pad) pad.style.width = "0px";
    const railBox = () => scroller.getBoundingClientRect();
    if (tab.getBoundingClientRect().width < 1 || railBox().width < 1) return;
    const alignActive = () => {
      const rail = railBox();
      const box = tab.getBoundingClientRect();
      if (box.left < rail.left) scroller.scrollLeft -= rail.left - box.left;
      else if (box.right > rail.right) scroller.scrollLeft += box.right - rail.right;
    };
    alignActive();
    for (let step = 0; step < 4; step += 1) {
      const rail = railBox();
      const hanging = [...scroller.querySelectorAll(".tab-item")].find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 1 && rect.left < rail.left - 1 && rect.right > rail.left + 1;
      });
      if (!hanging) return;
      if (hanging === tab) {
        scroller.scrollLeft -= rail.left - hanging.getBoundingClientRect().left;
        return;
      }
      const hang = hanging.getBoundingClientRect();
      const reveal = rail.left - hang.left;
      if (tab.getBoundingClientRect().right + reveal <= rail.right + 1) scroller.scrollLeft -= reveal;
      else {
        const sliver = Math.max(1, hang.right - rail.left);
        const before = scroller.scrollLeft;
        scroller.scrollLeft += sliver;
        if (pad && scroller.scrollLeft < before + sliver - 1) {
          pad.style.width = (Number.parseFloat(pad.style.width) || 0) + sliver + "px";
          scroller.scrollLeft += sliver;
        }
      }
      alignActive();
    }
  };
  const renderStrip = (pane, strip) => {
    if (!strip) return;
    const scrollLeft = strip.querySelector("[data-tab-scroll]")?.scrollLeft || 0;
    const previousActive = strip.querySelector('[data-tab-id][aria-current]')?.dataset.tabId;
    strip.setAttribute("role", "tablist");
    strip.setAttribute("aria-label", L("工作区标签"));
    const fragment = document.createDocumentFragment();
    const scrollArea = document.createElement("div"); scrollArea.className = "tab-scroll"; scrollArea.dataset.tabScroll = "";
    fragment.append(scrollArea);
    for (let index = 0; index < pane.tabs.length;) {
      const tab = pane.tabs[index];
      if (tab.pinned) {
        const wrap = document.createElement("div");
        wrap.className = "tab-group";
        wrap.dataset.pinnedGroup = "true";
        const pages = document.createElement("div"); pages.className = "tab-group-pages";
        while (index < pane.tabs.length && pane.tabs[index].pinned) { appendTab(pages, pane, pane.tabs[index]); index += 1; }
        wrap.append(pages); scrollArea.append(wrap); continue;
      }
      if (tab.groupId) {
        const group = (pane.groups || []).find((candidate) => candidate.id === tab.groupId);
        const wrap = document.createElement("div");
        wrap.className = "tab-group";
        wrap.dataset.tabGroup = tab.groupId;
        wrap.dataset.active = String(pane.tabs.some((candidate) => candidate.groupId === tab.groupId && candidate.id === pane.activeTabId));
        wrap.style.setProperty("--group-color", GROUP_COLOR[group?.color] || GROUP_COLOR.grey);
        if (group?.collapsed) wrap.dataset.collapsed = "true";
        const label = document.createElement("button");
        label.type = "button";
        label.className = "tab-group-label";
        label.dataset.tabGroupToggle = tab.groupId;
        const groupName = document.createElement("span"); groupName.className = "tab-group-name"; groupName.textContent = group?.title || ""; label.append(groupName);
        const title = (group?.collapsed ? L("展开标签组") : L("收起标签组")) + (group?.title ? " · " + group.title : "");
        label.title = title; label.setAttribute("aria-label", title); label.setAttribute("aria-expanded", String(!group?.collapsed));
        wrap.append(label);
        const pages = document.createElement("div"); pages.className = "tab-group-pages";
        while (index < pane.tabs.length && pane.tabs[index].groupId === tab.groupId) { appendTab(pages, pane, pane.tabs[index]); index += 1; }
        wrap.append(pages); scrollArea.append(wrap); continue;
      }
      appendTab(scrollArea, pane, tab);
      index += 1;
    }
    const pad = document.createElement("span");
    pad.dataset.tabScrollPad = "";
    pad.setAttribute("aria-hidden", "true");
    scrollArea.append(pad);
    if (!pane.tabs.length) {
      const empty = document.createElement("p");
      empty.className = "tab-pane-empty-hint";
      empty.textContent = L("从左边打开，或把标签拖进来。");
      scrollArea.append(empty);
    }
    if (!embedded) {
      if (strip.hasAttribute("data-titlebar-tabs")) {
        const spacer = document.createElement("div");
        spacer.className = "tab-strip-spacer";
        spacer.setAttribute("aria-hidden", "true");
        if (document.documentElement.dataset.nativeDesktop === "true" || document.body.dataset.nativeDesktop === "true") {
          spacer.dataset.tauriDragRegion = "";
        }
        fragment.append(spacer);
      }
      const add = document.createElement("button"); add.type = "button"; add.className = "tab-add-button"; add.dataset.tabAdd = pane.id;
      add.setAttribute("aria-label", L("打开标签")); add.title = L("打开标签"); add.setAttribute("aria-haspopup", "menu");
      add.innerHTML = '<svg aria-hidden="true"><use href="#icon-plus"></use></svg>'; fragment.append(add);
      const split = document.createElement("button");
      split.type = "button"; split.className = "tab-split-button"; split.dataset.tabSplit = pane.id;
      split.title = L("布局与分屏"); split.setAttribute("aria-label", split.title);
      split.innerHTML = '<svg aria-hidden="true"><use href="#icon-grid"></use></svg>';
      fragment.append(split);
    }
    strip.replaceChildren(fragment);
    scrollArea.scrollLeft = scrollLeft;
    shareTabStrip(scrollArea);
    tabShareObserver.observe(strip);
    if (previousActive !== pane.activeTabId) requestAnimationFrame(() => {
      scrollTabIntoStrip(strip.querySelector('[data-tab-id][aria-current]'));
    });
  };
  const titlebarStrip = document.querySelector("[data-titlebar-tabs]");
  if (titlebarStrip) new ResizeObserver(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.tab-strip:not([hidden]) [data-tab-id][aria-current]').forEach((tab) => {
        if (tab.getClientRects().length) scrollTabIntoStrip(tab);
      });
    });
  }).observe(titlebarStrip);
  const exclusiveEl = document.querySelector("[data-tab-exclusive]");
  const collectMounted = () => [
    ...pool.querySelectorAll(":scope > [data-work-surface], :scope > [data-goal-canvas-shell], :scope > [data-goal-frame-surface], :scope > [data-document-pane]"),
    ...panesEl.querySelectorAll("[data-tab-pane-body] > [data-work-surface], [data-tab-pane-body] > [data-goal-canvas-shell], [data-tab-pane-body] > [data-goal-frame-surface], [data-tab-pane-body] > [data-document-pane]"),
    ...(exclusiveEl ? [...exclusiveEl.children] : []),
  ];
  const findSplit = (node, id) => !node || node.paneId ? null : node.id === id ? node : findSplit(node.children[0], id) || findSplit(node.children[1], id);
  // Position leaves without reparenting their iframes: dragging a divider or adding a
  // neighbour must preserve unsaved editor state and active Runtime connections.
  const syncSplitSizes = (node, box = { x: 0, y: 0, w: 100, h: 100 }) => {
    if (!node) return;
    if (node.paneId) {
      const pane = panesEl.querySelector('[data-tab-pane="' + node.paneId + '"]');
      if (pane) {
        pane.style.left = "calc(" + box.x + "% + " + (box.x ? TAB_SASH_INSET : 0) + "px)";
        pane.style.top = "calc(" + box.y + "% + " + (box.y ? TAB_SASH_INSET : 0) + "px)";
        pane.style.width = "calc(" + box.w + "% - " + ((box.x ? TAB_SASH_INSET : 0) + (box.x + box.w < 99.99 ? TAB_SASH_INSET : 0)) + "px)";
        pane.style.height = "calc(" + box.h + "% - " + ((box.y ? TAB_SASH_INSET : 0) + (box.y + box.h < 99.99 ? TAB_SASH_INSET : 0)) + "px)";
        const stripHeight = pane.querySelector("[data-tab-strip]")?.hidden ? 0 : (matchMedia("(max-width: 760px), (pointer: coarse)").matches ? 44 : 32);
        panesEl.querySelectorAll('iframe[data-pane-owner="' + node.paneId + '"]').forEach((frame) => {
          const topInset = (box.y ? TAB_SASH_INSET : 0) + stripHeight;
          frame.style.left = pane.style.left; frame.style.width = pane.style.width;
          frame.style.top = "calc(" + box.y + "% + " + topInset + "px)";
          frame.style.height = "calc(" + box.h + "% - " + (topInset + (box.y + box.h < 99.99 ? TAB_SASH_INSET : 0)) + "px)";
          frame.classList.toggle("is-focused", node.paneId === state.focusedPaneId);
          frame.style.setProperty("--pane-strip-height", stripHeight + "px");
        });
      }
      return;
    }
    const ratio = clampSplitRatio(node.ratio);
    const split = panesEl.querySelector('[data-split-id="' + node.id + '"]');
    if (split) {
      Object.assign(split.style, { left: box.x + "%", top: box.y + "%", width: box.w + "%", height: box.h + "%" });
      const sash = split.firstElementChild;
      sash.style.left = node.direction === "row" ? "calc(" + ratio * 100 + "% - " + TAB_SASH_HALF + "px)" : "0";
      sash.style.top = node.direction === "column" ? "calc(" + ratio * 100 + "% - " + TAB_SASH_HALF + "px)" : "0";
      sash.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    }
    if (node.direction === "row") {
      syncSplitSizes(node.children[0], { ...box, w: box.w * ratio });
      syncSplitSizes(node.children[1], { ...box, x: box.x + box.w * ratio, w: box.w * (1 - ratio) });
    } else {
      syncSplitSizes(node.children[0], { ...box, h: box.h * ratio });
      syncSplitSizes(node.children[1], { ...box, y: box.y + box.h * ratio, h: box.h * (1 - ratio) });
    }
  };
  let applying = false;
  let applyQueued = false;
  let historyLock = false;
  const tabHistory = new Map();
  const paneHistory = (paneId) => {
    let entry = tabHistory.get(paneId);
    if (!entry) { entry = { stack: [], index: -1 }; tabHistory.set(paneId, entry); }
    return entry;
  };
  const historyId = (pane) => pane?.activeTabId || (pane?.viewPlugin ? "plugin:" + pane.viewPlugin : null);
  const pruneHistory = (pane) => {
    const entry = paneHistory(pane.id);
    const live = new Set(pane.tabs.map((tab) => tab.id));
    const next = [];
    let index = -1;
    for (let i = 0; i < entry.stack.length; i++) {
      const id = entry.stack[i];
      const keep = live.has(id) || String(id).startsWith("plugin:");
      if (!keep || next[next.length - 1] === id) continue;
      next.push(id);
      if (i <= entry.index) index = next.length - 1;
    }
    entry.stack = next;
    entry.index = index;
  };
  const rememberTab = (pane) => {
    const id = historyId(pane);
    if (!id) return;
    pruneHistory(pane);
    const entry = paneHistory(pane.id);
    if (historyLock) {
      const found = entry.stack.indexOf(id);
      if (found >= 0) entry.index = found;
      return;
    }
    if (entry.stack[entry.index] === id) return;
    entry.stack = entry.stack.slice(0, Math.max(entry.index, -1) + 1);
    if (entry.stack.at(-1) !== id) entry.stack.push(id);
    entry.index = entry.stack.length - 1;
  };
  const syncHistoryButtons = () => {
    const back = document.querySelector("[data-workspace-history=back]");
    const forward = document.querySelector("[data-workspace-history=forward]");
    if (!back || !forward) return;
    const pane = ops.focused(state);
    if (!pane || state.exclusive) { back.disabled = true; forward.disabled = true; return; }
    pruneHistory(pane);
    const entry = paneHistory(pane.id);
    back.disabled = entry.index <= 0;
    forward.disabled = entry.index < 0 || entry.index >= entry.stack.length - 1;
  };
  const goHistory = (delta) => {
    const pane = ops.focused(state);
    if (!pane || state.exclusive) return;
    pruneHistory(pane);
    const entry = paneHistory(pane.id);
    const live = new Set(pane.tabs.map((tab) => tab.id));
    let i = entry.index + delta;
    while (i >= 0 && i < entry.stack.length && !live.has(entry.stack[i]) && !String(entry.stack[i]).startsWith("plugin:")) i += delta;
    if (i < 0 || i >= entry.stack.length) return;
    entry.index = i;
    historyLock = true;
    try {
      const id = entry.stack[i];
      if (String(id).startsWith("plugin:")) {
        pane.viewPlugin = id.slice("plugin:".length);
        pane.activeTabId = null;
        state.focusedPaneId = pane.id;
        apply();
        persist();
      } else activate(pane.id, id);
    }
    finally { historyLock = false; }
  };
  const paneFrameKey = (pane) => {
    const tab = pane.tabs.find((item) => item.id === pane.activeTabId);
    if (tab) return tab.id;
    return pane.viewPlugin ? pane.id + ":view" : null;
  };
  const apply = () => {
    if (applying) { applyQueued = true; return; }
    applying = true;
    const keepFrame = false;
    try {
    if (state.exclusive) {
      root.dataset.exclusive = state.exclusive;
      if (titlebarStrip) titlebarStrip.hidden = true;
      const node = [...document.querySelectorAll('[data-work-surface="' + state.exclusive + '"]')]
        .find((candidate) => !candidate.closest("[data-goal-canvas-shell]"));
      if (exclusiveEl) {
        exclusiveEl.hidden = false;
        [...exclusiveEl.children].forEach((child) => { if (child !== node) pool.append(child); });
        if (node) {
          exclusiveEl.append(node);
          node.hidden = false;
        }
      }
      ops.normalizeLayout(state);
      root.toggleAttribute("data-split", state.panes.length > 1);
      state.panes.forEach((pane) => {
        if (panesEl.querySelector('[data-tab-pane="' + pane.id + '"]')) return;
        const section = document.createElement("section");
        section.className = "tab-pane";
        section.dataset.tabPane = pane.id;
        section.innerHTML = paneMarkup();
        panesEl.append(section);
      });
      setWorkSurface(state.exclusive, false, false);
      return;
    }
    root.removeAttribute("data-exclusive");
    if (exclusiveEl) {
      exclusiveEl.hidden = true;
      [...exclusiveEl.children].forEach((child) => pool.append(child));
    }
    ops.normalizeLayout(state);
    root.toggleAttribute("data-split", state.panes.length > 1);
    const chromeTabs = !embedded && state.panes.length < 2;
    if (titlebarStrip) {
      titlebarStrip.hidden = !chromeTabs;
      if (!chromeTabs) {
        titlebarStrip.replaceChildren();
        delete titlebarStrip.dataset.chromePane;
      }
    }
    const focusedTab = ops.activeTab(state);
    const focusedView = ops.focused(state)?.viewPlugin;
    if (focusedTab) {
      const surface = pluginSurface(focusedTab.plugin);
      if (getSurface() !== surface) setWorkSurface(surface, false, false);
      if (!["settings", "project-settings"].includes(document.querySelector("#goal-tree-pane")?.dataset.desktopDirectory)) {
        setDirectory(directoryOf(focusedTab.plugin), false, false);
      }
      if (focusedTab.plugin === "feed") setFeedTask?.(focusedTab.feedTask || "all", false);
      if (focusedTab.plugin === "goals" && focusedTab.kind === "item" && !embedded && (state.panes.length > 1 || panesEl.querySelector('iframe[data-pane-tab="' + focusedTab.id + '"]'))) applySelection?.(focusedTab.itemId);
      document.title = tabLabel(focusedTab) + " · Molis Work";
    } else if (focusedView) {
      const surface = pluginSurface(focusedView);
      if (getSurface() !== surface) setWorkSurface(surface, false, false);
      if (!["settings", "project-settings"].includes(document.querySelector("#goal-tree-pane")?.dataset.desktopDirectory)) {
        setDirectory(directoryOf(focusedView), false, false);
      }
      document.title = ops.pluginTitle(focusedView) + " · Molis Work";
    }
    collectMounted().forEach((node) => {
      if (node.parentElement !== pool) pool.append(node);
    });

    panesEl.querySelectorAll("[data-tab-pane]").forEach((node) => {
      if (!state.panes.some((pane) => pane.id === node.dataset.tabPane)) node.remove();
    });
    panesEl.querySelectorAll("iframe[data-pane-tab]").forEach((frame) => {
      const owner = state.panes.find((pane) => paneFrameKey(pane) === frame.dataset.paneTab);
      if (!owner) frame.remove();
      else { frame.hidden = true; frame.dataset.paneOwner = owner.id; }
    });
    const orderedPanes = [...state.panes].sort((a, b) => (a.id === state.focusedPaneId ? -1 : b.id === state.focusedPaneId ? 1 : 0));
    orderedPanes.forEach((pane) => {
      let section = panesEl.querySelector('[data-tab-pane="' + pane.id + '"]');
      if (!section) {
        section = document.createElement("section");
        section.className = "tab-pane";
        section.dataset.tabPane = pane.id;
        section.innerHTML = paneMarkup();
        panesEl.append(section);
      }
      section.classList.toggle("is-focused", pane.id === state.focusedPaneId);

      const closePane = section.querySelector("[data-tab-pane-close]");
      if (closePane) closePane.hidden = state.panes.length < 2;
      const inStrip = section.querySelector("[data-tab-strip]");
      const useTitlebar = chromeTabs && titlebarStrip && pane.id === state.focusedPaneId;
      if (useTitlebar) {
        titlebarStrip.dataset.chromePane = pane.id;
        renderStrip(pane, titlebarStrip);
        if (inStrip) {
          inStrip.hidden = true;
          inStrip.replaceChildren();
        }
      } else if (inStrip) {
        inStrip.hidden = false;
        renderStrip(pane, inStrip);
      }
      const tab = pane.tabs.find((item) => item.id === pane.activeTabId);
      const viewPlugin = tab ? null : pane.viewPlugin;
      const frameKey = paneFrameKey(pane);
      const paneKey = tab ? ops.tabKey(tab) : (viewPlugin ? "plugin:" + viewPlugin : "");
      const cachedFrame = frameKey && panesEl.querySelector('iframe[data-pane-tab="' + frameKey + '"]');
      if (cachedFrame && cachedFrame.dataset.paneKey !== paneKey) { cachedFrame.remove(); }
      const liveFrame = frameKey && panesEl.querySelector('iframe[data-pane-tab="' + frameKey + '"]');
      if (!embedded && frameKey && (state.panes.length > 1 || liveFrame)) {
        let frame = liveFrame;
        if (!frame) {
          frame = document.createElement("iframe"); frame.className = "tab-content-frame"; frame.dataset.paneTab = frameKey;
          frame.title = tab?.title || ops.pluginTitle(tab?.plugin || viewPlugin);
          const url = new URL(location.href); url.hash = "";
          url.pathname = location.pathname.startsWith("/projects/") ? "/projects/" + encodeURIComponent(getProjectId()) + "/" : "/";
          url.searchParams.set("workbenchPane", pane.id); url.searchParams.set("panePlugin", tab?.plugin || viewPlugin);
          url.searchParams.set("paneTitle", tab?.title || "");
          if (tab?.kind === "item") url.searchParams.set("paneItem", tab.itemId); else url.searchParams.delete("paneItem");
          if (tab?.feedTask) url.searchParams.set("paneFeedTask", tab.feedTask);
          if (tab?.goalView === "work") url.searchParams.set("paneGoalView", "work");
          frame.src = url.href; panesEl.append(frame);
        }
        frame.dataset.paneKey = paneKey;
        frame.dataset.paneOwner = pane.id; frame.hidden = false;
      } else {
        const node = tab ? rootForTab(tab) : (viewPlugin ? topLevelSurface(viewPlugin) : null);
        if (node) {
          mount(pane, node);
          if (tab) applyTabContent(tab, keepFrame);
          else applyPluginDefault(viewPlugin);
        }
      }
    });
    const treeSignature = JSON.stringify(state.layout.tree, (key, value) => key === "ratio" ? undefined : value);
    if (panesEl.dataset.treeSignature !== treeSignature) {
      panesEl.querySelectorAll("[data-split-id]").forEach((node) => node.remove());
      const renderSashes = (tree) => {
        if (tree.paneId) return;
        const split = document.createElement("div"); split.className = "tab-split"; split.dataset.splitId = tree.id; split.dataset.direction = tree.direction;
        const sash = document.createElement("div"); sash.className = "tab-sash"; sash.dataset.tabSash = tree.id; sash.role = "separator"; sash.tabIndex = 0;
        sash.setAttribute("aria-label", L("调整分屏大小")); sash.setAttribute("aria-orientation", tree.direction === "row" ? "vertical" : "horizontal");
        sash.setAttribute("aria-valuemin", "15"); sash.setAttribute("aria-valuemax", "85");
        const handle = document.createElement("span"); handle.className = "tab-sash-handle"; handle.setAttribute("aria-hidden", "true");
        handle.innerHTML = '<svg aria-hidden="true"><use href="#icon-grip"></use></svg>';
        sash.append(handle);
        split.append(sash); panesEl.append(split); tree.children.forEach(renderSashes);
      };
      renderSashes(state.layout.tree); panesEl.dataset.treeSignature = treeSignature;
    }
    syncSplitSizes(state.layout.tree);
    if (embedded) setMobileView("document");
    } finally {
      applying = false;
      rememberTab(ops.focused(state));
      syncHistoryButtons();
      if (applyQueued) {
        applyQueued = false;
        apply();
      }
    }
  };
  const activate = (paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return;
    state.focusedPaneId = paneId;
    if (tabId) pane.activeTabId = tabId;
    apply();
    persist();
  };
  const focusActiveTab = () => {
    const selected = (titlebarStrip && !titlebarStrip.hidden ? titlebarStrip : panesEl.querySelector('[data-tab-pane="' + state.focusedPaneId + '"] [data-tab-strip]'))?.querySelector('.tab-item-trigger[aria-selected="true"]');
    selected?.focus({ preventScroll: true });
    scrollTabIntoStrip(selected?.closest("[data-tab-id]"));
  };
  const handleStripKey = (paneId, event) => {
    if (!paneId || event.target.closest("[data-tab-close], [data-tab-group-toggle], [data-tab-pane-close]")) return;
    const tab = event.target.closest("[data-tab-id]");
    if (!tab) return;
    const strip = tab.closest(".tab-strip");
    const tabs = [...strip.querySelectorAll('[data-tab-id]')].filter((node) => node.getClientRects().length);
    const index = tabs.indexOf(tab);
    let target = null;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault(); openTabMenu(paneId, tab, tab.dataset.tabId); return;
    }
    if (event.key === "ArrowRight") target = tabs[(index + 1) % tabs.length];
    if (event.key === "ArrowLeft") target = tabs[(index - 1 + tabs.length) % tabs.length];
    if (event.key === "Home") target = tabs[0];
    if (event.key === "End") target = tabs[tabs.length - 1];
    if (event.key === "Enter" || event.key === " ") target = tab;
    if (event.key === "Delete") {
      event.preventDefault();
      ops.closeTab(state, paneId, tab.dataset.tabId);
      apply(); persist(); focusActiveTab();
    } else if (target) {
      event.preventDefault();
      activate(paneId, target.dataset.tabId);
      focusActiveTab();
    }
  };
  const openPlugin = (plugin) => {
    if (embedded) { notifyParent("workbench-pane-open", { plugin }); return; }
    state.focusedPaneId = ops.focused(state).id;
    ops.openPlugin(state, plugin);
    apply();
    persist();
  };
  const openItem = (plugin, itemId, title, goalView) => {
    if (embedded) { notifyParent("workbench-pane-open", { plugin, itemId, title: titleForItem(plugin, itemId, title), goalView }); return; }
    const tab = ops.openItem(state, plugin, itemId, titleForItem(plugin, itemId, title));
    if (plugin === "goals" && goalView === "frame") {
      delete tab.goalView;
      panesEl.querySelector('iframe[data-pane-tab="' + tab.id + '"]')?.contentWindow?.postMessage({type:"workbench-goal-view", view:"frame"}, location.origin);
    }
    apply();
    persist();
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
  const setExclusive = (surface) => {
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
    if (event.target.closest("input")) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...tabMenu.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]?.focus();
  });
  const openTabMenu = (paneId, anchor, tabId = null) => {
    const pane = state.panes.find(candidate => candidate.id === paneId); if (!pane) return;
    const tab = pane.tabs.find(candidate => candidate.id === (tabId || pane.activeTabId));
    tabMenuAnchor = anchor; tabMenu.replaceChildren();
    tabMenu.setAttribute("aria-label", L(tabId ? "标签操作" : "打开标签"));
    const add = (label, icon, key, action) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "mw-menu__item"; button.setAttribute("role", "menuitem"); button.dataset.tabMenuAction = key;
      button.innerHTML = '<svg aria-hidden="true"><use href="#icon-' + icon + '"></use></svg><span></span>';
      button.querySelector("span").textContent = label;
      button.addEventListener("click", () => { tabMenu.hidePopover(); state.focusedPaneId = paneId; action(); apply(); persist(); focusActiveTab(); });
      tabMenu.append(button);
    };
    if (!tabId) {
      ["home", "goals", "sessions", "feed", "inbox", "schedule", "shelf", "lingguang", "functions", "pages", "form", "dataset", "ppt", "artifacts"].filter(plugin => plugin === "home" || document.querySelector('[data-plugin-strip] [data-plugin-id="' + plugin + '"]')).forEach(plugin => {
        add(L(ops.pluginTitle(plugin)), tabIcon(plugin), "open-" + plugin, () => ops.openPlugin(state, plugin));
      });
      if (tab) tabMenu.append(document.createElement("hr"));
    }
    if (tab) {
      const heading = document.createElement("strong"); heading.textContent = tabLabel(tab); heading.title = tabLabel(tab); tabMenu.append(heading);
      add(L(tab.pinned ? "取消固定标签" : "固定标签"), "lock", "pin", () => ops.togglePinned(state, paneId, tab.id));
      if (!tab.pinned) {
        add(L("添加到新分组"), "frame", "new-group", () => ops.addTabToNewGroup(state, paneId, tab.id));
        (pane.groups || []).filter((group) => group.id !== tab.groupId).forEach((group) => {
          add(L("添加到分组") + (group.title ? " · " + group.title : ""), "frame", "join-" + group.id, () => ops.addTabToGroup(state, paneId, tab.id, group.id));
        });
        if (tab.groupId) add(L("从分组移除"), "x", "ungroup-tab", () => ops.removeTabFromGroup(state, paneId, tab.id));
      }
      add(L("关闭标签"), "x", "close", () => ops.closeTab(state, paneId, tab.id));
    }
    if (layoutMenu.matches(":popover-open")) layoutMenu.hidePopover();
    const rect = anchor.getBoundingClientRect(); tabMenu.showPopover();
    tabMenu.style.left = Math.max(8, Math.min(rect.left, innerWidth - tabMenu.offsetWidth - 8)) + "px";
    tabMenu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - tabMenu.offsetHeight - 8)) + "px";
    tabMenu.querySelector("button, input")?.focus();
  };
  const openGroupMenu = (paneId, groupId, anchor) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId); if (!pane) return;
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
    const add = (label, icon, key, action) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "mw-menu__item"; button.setAttribute("role", "menuitem"); button.dataset.tabMenuAction = key;
      button.innerHTML = '<svg aria-hidden="true"><use href="#icon-' + icon + '"></use></svg><span></span>';
      button.querySelector("span").textContent = label;
      button.addEventListener("click", () => { tabMenu.hidePopover(); state.focusedPaneId = paneId; action(); apply(); persist(); });
      tabMenu.append(button);
    };
    add(L("取消分组"), "x", "ungroup", () => ops.ungroup(state, paneId, groupId));
    add(L("关闭分组"), "x", "close-group", () => ops.closeGroup(state, paneId, groupId));
    if (layoutMenu.matches(":popover-open")) layoutMenu.hidePopover();
    const rect = anchor.getBoundingClientRect(); tabMenu.showPopover();
    tabMenu.style.left = Math.max(8, Math.min(rect.left, innerWidth - tabMenu.offsetWidth - 8)) + "px";
    tabMenu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - tabMenu.offsetHeight - 8)) + "px";
    name.focus();
  };
  const layoutMenu = document.createElement("div");
  layoutMenu.className = "workspace-layout-menu mw-menu"; layoutMenu.setAttribute("popover", "auto"); layoutMenu.dataset.workspaceLayout = "";
  layoutMenu.setAttribute("aria-label", L("布局与分屏")); document.body.append(layoutMenu);
  layoutMenu.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...layoutMenu.querySelectorAll("button:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]?.focus();
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
    layoutMenu.style.top = Math.min(rect.bottom + 6, innerHeight - 360) + "px";
    layoutMenu.style.left = Math.max(8, Math.min(rect.right - 260, innerWidth - 268)) + "px";
    layoutMenu.showPopover(); layoutMenu.querySelector("button:not(:disabled)")?.focus();
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
    const close = event.target.closest("[data-tab-close]");
    if (close) {
      event.preventDefault();
      ops.closeTab(state, paneId, close.dataset.tabClose);
      apply();
      persist();
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
    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
      const pane = state.panes.find((candidate) => candidate.id === paneId);
      const alreadyActive = pane?.activeTabId === tab.dataset.tabId && state.focusedPaneId === paneId;
      if (!alreadyActive) {
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
  panesEl.addEventListener("keydown", (event) => {
    const sash = event.target.closest("[data-tab-sash]");
    if (sash) {
      const node = findSplit(state.layout.tree, sash.dataset.tabSash);
      if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home"].includes(event.key)) {
        event.preventDefault(); node.ratio = event.key === "Home" ? TAB_SPLIT_RATIO : clampSplitRatio(node.ratio + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -.05 : .05));
        syncSplitSizes(state.layout.tree); persist();
      }
      return;
    }
    handleStripKey(event.target.closest("[data-tab-pane]")?.dataset.tabPane, event);
  });
  panesEl.addEventListener("dblclick", (event) => {
    const sash = event.target.closest("[data-tab-sash]"); if (!sash) return;
    findSplit(state.layout.tree, sash.dataset.tabSash).ratio = TAB_SPLIT_RATIO; syncSplitSizes(state.layout.tree); persist();
  });
  panesEl.addEventListener("pointerdown", (event) => {
    const sash = event.target.closest("[data-tab-sash]"); if (!sash) return;
    event.preventDefault(); sash.setPointerCapture(event.pointerId); sash.classList.add("is-dragging");
    const node = findSplit(state.layout.tree, sash.dataset.tabSash), rect = sash.parentElement.getBoundingClientRect();
    root.classList.add("is-resizing");
    const move = (pointer) => { node.ratio = clampSplitRatio(node.direction === "row" ? (pointer.clientX - rect.left) / rect.width : (pointer.clientY - rect.top) / rect.height); syncSplitSizes(state.layout.tree); };
    const end = () => { root.classList.remove("is-resizing"); sash.classList.remove("is-dragging"); sash.removeEventListener("pointermove", move); sash.removeEventListener("pointerup", end); sash.removeEventListener("pointercancel", end); persist(); };
    sash.addEventListener("pointermove", move); sash.addEventListener("pointerup", end); sash.addEventListener("pointercancel", end);
  });
  let dragTab = null;
  let reorderAnims = [];
  let reorderKey = "";
  const stripFor = (paneId) => {
    if (titlebarStrip && !titlebarStrip.hidden && titlebarStrip.dataset.chromePane === paneId) return titlebarStrip;
    return panesEl.querySelector('[data-tab-pane="' + paneId + '"] [data-tab-strip]');
  };
  const reorderNodes = () => [...document.querySelectorAll(".tab-item:not(.is-tab-drag-source), [data-tab-reorder-slot]")];
  const snapshotReorder = () => new Map(reorderNodes().map((node) => [node, node.getBoundingClientRect()]));
  const playReorderFlip = (first) => {
    reorderAnims.forEach((anim) => anim.cancel());
    reorderAnims = [];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const node of reorderNodes()) {
      const prev = first.get(node);
      if (!prev) continue;
      const dx = prev.left - node.getBoundingClientRect().left;
      if (Math.abs(dx) < 1) continue;
      reorderAnims.push(node.animate(
        [{ transform: "translateX(" + dx + "px)" }, { transform: "translateX(0)" }],
        { duration: reduce ? 0 : TAB_REORDER_MS, easing: TAB_REORDER_EASE },
      ));
    }
  };
  const removeReorderSlot = () => {
    reorderAnims.forEach((anim) => anim.cancel());
    reorderAnims = [];
    reorderKey = "";
    document.querySelector("[data-tab-reorder-slot]")?.remove();
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
    } catch {}
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
    const sourceEl = document.querySelector('.tab-item[data-tab-id="' + dragTab.tabId + '"]');
    if (!destStrip || !sourceEl) { removeReorderSlot(); return; }
    const key = [preview.paneId, preview.ids.join(","), preview.movingId, copy ? "copy" : "move"].join("|");
    if (key === reorderKey) return;
    const first = snapshotReorder();
    sourceEl.classList.toggle("is-tab-drag-source", !copy);
    document.body.style.setProperty("--tab-reorder-width", dragTab.width + "px");
    let slot = document.querySelector("[data-tab-reorder-slot]");
    if (!slot) {
      slot = document.createElement("span");
      slot.dataset.tabReorderSlot = "";
      slot.setAttribute("aria-hidden", "true");
    }
    slot.style.setProperty("--plugin-color", sourceEl.style.getPropertyValue("--plugin-color") || "var(--muted)");
    const afterId = preview.ids[preview.ids.indexOf(preview.movingId) + 1];
    const after = afterId && destStrip.querySelector('.tab-item[data-tab-id="' + afterId + '"]:not(.is-tab-drag-source)');
    const pad = destStrip.querySelector("[data-tab-scroll-pad]");
    if (after) after.before(slot);
    else if (pad) pad.before(slot);
    else (destStrip.querySelector("[data-tab-scroll]") || destStrip).append(slot);
    reorderKey = key;
    playReorderFlip(first);
    shareTabStrip(destStrip.querySelector("[data-tab-scroll]"));
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
      const pane = state.panes.find((candidate) => candidate.id === paneId);
      beforeId = pane?.tabs[pane.tabs.findIndex((item) => item.id === beforeId) + 1]?.id;
    }
    const overStrip = event.target.closest("[data-tab-strip], [data-titlebar-tabs]");
    if (overStrip && dragTab) {
      if (tab) dragTab.hoverBeforeId = beforeId;
      else beforeId = dragTab.hoverBeforeId;
    }
    const groupWrap = event.target.closest("[data-tab-group]");
    const groupId = groupWrap && !groupWrap.hasAttribute("data-pinned-group") ? groupWrap.dataset.tabGroup : null;
    if (groupId && !tab) {
      const pane = state.panes.find((candidate) => candidate.id === paneId);
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
      dragTab = {
        paneId: tab.closest("[data-tab-pane]")?.dataset.tabPane || surface.dataset.chromePane || state.focusedPaneId,
        tabId: tab.dataset.tabId,
        width: Math.round(tab.getBoundingClientRect().width) || 172,
        hoverBeforeId: undefined,
      };
      if (event.dataTransfer.effectAllowed !== "copy") event.dataTransfer.effectAllowed = "copyMove"; event.dataTransfer.setData("text/plain", tab.title);
      const ghost = tab.cloneNode(true);
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = "position:absolute;top:-1000px;left:0;width:" + dragTab.width + "px;margin:0;";
      document.body.append(ghost);
      try { event.dataTransfer.setDragImage(ghost, Math.min(event.offsetX || 24, dragTab.width), Math.min(event.offsetY || 12, 20)); } catch {}
      requestAnimationFrame(() => ghost.remove());
      root.classList.add("is-tab-dragging");
      document.body.classList.add("is-tab-dragging");
      document.body.style.setProperty("--tab-reorder-width", dragTab.width + "px");
    });
    surface.addEventListener("dragend", finishDrag);
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
      const copy = isCopyDrop(event);
      const target = dropTarget(event, surface);
      if (target.paneId) {
        if (target.edge) ops.splitPane(state, target.paneId, target.edge, copy ? "copy" : "move", dragTab.paneId, dragTab.tabId);
        else {
          ops.moveTab(state, dragTab.paneId, dragTab.tabId, target.paneId, target.beforeId, copy);
          if (target.groupId) ops.addTabToGroup(state, target.paneId, ops.activeTab(state)?.id, target.groupId);
        }
      }
      finishDrag(); apply(); persist();
    });
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (!embedded && event.data?.type === "workbench-open-settings") {
      document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: event.data.href || "" } }));
      return;
    }
    if (embedded && event.source === window.parent && event.data?.type === "workbench-goal-view") {
      const tab = ops.activeTab(state);
      if (tab?.plugin === "goals" && tab.kind === "item") {
        if (event.data.view === "work") tab.goalView = "work"; else delete tab.goalView;
      }
      apply();
      return;
    }
    if (!["workbench-pane-focus", "workbench-pane-open", "workbench-pane-goal-view"].includes(event.data?.type)) return;
    const frame = [...panesEl.querySelectorAll("iframe")].find((node) => node.contentWindow === event.source);
    const pane = state.panes.find((candidate) => candidate.id === frame?.dataset.paneOwner);
    if (!pane) return;
    if (event.data.type === "workbench-pane-goal-view") {
      const tab = pane.tabs.find(tab => tab.id === frame.dataset.paneTab);
      if (tab?.plugin === "goals" && tab.kind === "item") {
        if (event.data.view === "work") tab.goalView = "work"; else delete tab.goalView;
        persist(); apply();
      }
    } else if (event.data.type === "workbench-pane-focus") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
    } else {
      state.focusedPaneId = pane.id;
      if (event.data.itemId) openItem(event.data.plugin, event.data.itemId, event.data.title, event.data.goalView); else openPlugin(event.data.plugin);
    }
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-goal-collapse]")) {
      const tab = ops.activeTab(state);
      if (tab?.plugin === "goals" && tab.kind === "item") { delete tab.goalView; apply(); persist(); if (embedded) notifyParent("workbench-pane-goal-view", {view:"frame"}); }
    }
  });
  document.addEventListener("workbench-feed-task", (event) => {
    if (embedded) return;
    const pane = ops.focused(state), tab = ops.activeTab(state);
    if (tab?.plugin !== "feed") return;
    tab.feedTask = event.detail.taskId;
    const frame = panesEl.querySelector('iframe[data-pane-tab="' + tab.id + '"]');
    frame?.contentWindow?.postMessage({ type: "workbench-feed-task", taskId: tab.feedTask }, location.origin);
    persist();
  });
  if (embedded) window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === "workbench-feed-task") setFeedTask?.(event.data.taskId, false);
    if (event.data?.type === "workbench-feed-add") setFeedAddOpen?.(true);
  });
  if (embedded && paneParams.has("paneFeedTask")) requestAnimationFrame(() => setFeedTask?.(paneParams.get("paneFeedTask"), false));
  return { apply, openPlugin, openItem, openGoalWork, addFeedTask, setExclusive, restore, isExclusive: () => Boolean(state.exclusive), isEmbedded: () => embedded, state: () => state };
}`;
