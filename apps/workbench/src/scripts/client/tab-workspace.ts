import { createTabWorkspaceOps } from "../../tab-workspace-ops.js";

export const TAB_WORKSPACE_FACTORY_SCRIPT = `(host) => {
  const { translate: L, getSurface, setWorkSurface, setDirectory, setWorkspaceMode, setMobileView,
    applySelection, locateGraphNode, selectFeedItem, selectInboxEntry, getProjectId, visibleGoals, showCanvas, restoreBoard, releaseFrame, isFrameTabActive } = host;
  const root = document.querySelector("[data-tab-workspace]");
  const panesEl = document.querySelector("[data-tab-panes]");
  const pool = document.querySelector("[data-surface-pool]");
  if (!root || !panesEl || !pool) return { apply() {}, openPlugin() {}, openItem() {}, setExclusive() {}, restore() {}, isExclusive() { return false; } };
  const ops = (${createTabWorkspaceOps.toString()})();
  const storageKey = "molis-work-tab-workspace:" + (getProjectId() || "board");
  const narrow = () => matchMedia("(max-width: 760px)").matches;
  let state = ops.create();
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {} };
  const restore = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored?.panes?.length) {
        state = stored;
        ops.ensureHome(state);
        persist();
      }
    } catch {}
  };
  const pluginSurface = (plugin) => plugin === "goals" ? "goal" : plugin === "home" ? "home" : plugin;
  const directoryOf = (plugin) => plugin === "home" ? "root" : plugin === "goals" ? "goals" : plugin;
  const topLevelSurface = (plugin) => plugin === "goals"
    ? document.querySelector("[data-goal-canvas-shell]")
    : [...document.querySelectorAll('[data-work-surface="' + pluginSurface(plugin) + '"]')]
      .find((node) => !node.closest("[data-goal-canvas-shell]")) || null;
  const rootForTab = (tab) => tab ? topLevelSurface(tab.plugin) : null;
  const titleForItem = (plugin, itemId, fallback) => {
    if (plugin === "goals") return visibleGoals()?.find((item) => item.goal.goal_id === itemId)?.goal.title || fallback || itemId;
    const row = document.querySelector('[data-operation-select="' + CSS.escape(itemId) + '"], [data-feed-entry-id="' + CSS.escape(itemId) + '"], [data-inbox-row="' + CSS.escape(itemId) + '"], [data-artifact-select="' + CSS.escape(itemId) + '"]');
    return row?.getAttribute("data-frame-asset-title") || row?.querySelector("strong")?.textContent?.trim() || fallback || itemId;
  };
  const applyTabContent = (tab, keepFrame) => {
    if (!tab) return;
    if (tab.plugin === "goals" && tab.kind === "item" && tab.itemId) {
      releaseFrame?.();
      applySelection?.(tab.itemId);
      setWorkspaceMode("focus", false, true);
      return;
    }
    if (tab.plugin === "goals") {
      if (keepFrame) {
        setWorkSurface("goal");
        setWorkspaceMode("graph", false, true);
        return;
      }
      (restoreBoard || showCanvas)?.();
      setWorkspaceMode("graph", false, true);
      return;
    }
    if (tab.plugin === "feed" && tab.kind === "item" && tab.itemId) selectFeedItem?.(tab.itemId, false, true, false);
    if (tab.plugin === "inbox" && tab.kind === "item" && tab.itemId) selectInboxEntry?.(tab.itemId, false);
    if (tab.plugin === "sessions" && tab.kind === "item" && tab.itemId) {
      const surface = topLevelSurface("sessions");
      surface?.querySelectorAll("[data-operation-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.detailId !== tab.itemId;
      });
      document.querySelectorAll('[data-operation-directory="sessions"] [data-operation-row]').forEach((row) => {
        const active = row.dataset.recordId === tab.itemId;
        row.classList.toggle("is-selected", active);
        row.setAttribute("aria-selected", String(active));
      });
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
    if (tab.kind === "mother") return tab.plugin === "goals" ? L("画布") : L("全部");
    return tab.title;
  };
  const renderStrip = (pane, strip) => {
    if (!strip) return;
    const fragment = document.createDocumentFragment();
    const groups = [];
    pane.tabs.forEach((tab) => {
      const last = groups[groups.length - 1];
      if (!last || last.plugin !== tab.plugin) groups.push({ plugin: tab.plugin, tabs: [tab] });
      else last.tabs.push(tab);
    });
    groups.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.className = "tab-group";
      wrap.dataset.tabGroup = group.plugin;
      if (pane.collapsed[group.plugin]) wrap.dataset.collapsed = "true";
      if (group.plugin !== "home") {
        const label = document.createElement("button");
        label.type = "button";
        label.className = "tab-group-label";
        label.dataset.tabGroupToggle = group.plugin;
        label.textContent = ops.pluginTitle(group.plugin);
        label.title = ops.pluginTitle(group.plugin);
        label.setAttribute("aria-expanded", String(!pane.collapsed[group.plugin]));
        wrap.append(label);
      }
      const pages = document.createElement("div");
      pages.className = "tab-group-pages";
      group.tabs.forEach((tab) => {
        const selected = tab.id === pane.activeTabId;
        const button = document.createElement("div");
        button.role = "tab";
        button.tabIndex = 0;
        button.className = "tab-item" + (selected ? " is-active" : "");
        button.dataset.tabId = tab.id;
        button.dataset.tabKind = tab.kind;
        button.draggable = true;
        if (selected) button.setAttribute("aria-current", "page");
        const name = document.createElement("span");
        name.textContent = tabLabel(tab);
        const close = document.createElement("button");
        close.type = "button";
        close.className = "tab-item-close";
        close.dataset.tabClose = tab.id;
        close.setAttribute("aria-label", L("关闭标签"));
        close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
        button.append(name, close);
        pages.append(button);
      });
      wrap.append(pages);
      fragment.append(wrap);
    });
    if (!pane.tabs.length) {
      const empty = document.createElement("p");
      empty.className = "tab-pane-empty-hint";
      empty.textContent = L("从左边打开，或把标签拖进来。");
      fragment.append(empty);
    }
    strip.replaceChildren(fragment);
  };
  const titlebarStrip = document.querySelector("[data-titlebar-tabs]");
  const exclusiveEl = document.querySelector("[data-tab-exclusive]");
  const collectMounted = () => [
    ...pool.querySelectorAll(":scope > [data-work-surface], :scope > [data-goal-canvas-shell]"),
    ...panesEl.querySelectorAll("[data-tab-pane-body] > [data-work-surface], [data-tab-pane-body] > [data-goal-canvas-shell]"),
    ...(exclusiveEl ? [...exclusiveEl.children] : []),
  ];
  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    const keepFrame = isFrameTabActive?.() === true;
    try {
    if (state.exclusive) {
      root.dataset.exclusive = state.exclusive;
      if (titlebarStrip) titlebarStrip.hidden = true;
      const node = [...document.querySelectorAll('[data-work-surface="' + state.exclusive + '"]')]
        .find((candidate) => !candidate.closest("[data-goal-canvas-shell]"));
      if (exclusiveEl && node) {
        exclusiveEl.hidden = false;
        exclusiveEl.append(node);
        node.hidden = false;
      }
      setWorkSurface(state.exclusive, false, false);
      return;
    }
    root.removeAttribute("data-exclusive");
    if (exclusiveEl) {
      exclusiveEl.hidden = true;
      [...exclusiveEl.children].forEach((child) => pool.append(child));
    }
    const direction = state.layout.direction || "row";
    ops.normalizeLayout(state);
    panesEl.dataset.layout = direction;
    root.toggleAttribute("data-split", state.panes.length > 1);
    const tracks = state.layout.sizes.map((size) => "minmax(0, " + size + "fr)").join(" ");
    panesEl.style.gridTemplateColumns = direction === "row" ? tracks : "minmax(0, 1fr)";
    panesEl.style.gridTemplateRows = direction === "column" ? tracks : "minmax(0, 1fr)";
    const chromeTabs = !keepFrame;
    if (titlebarStrip) titlebarStrip.hidden = !chromeTabs;
    const focusedTab = ops.activeTab(state);
    if (focusedTab) {
      const surface = pluginSurface(focusedTab.plugin);
      if (getSurface() !== surface) setWorkSurface(surface, false, false);
      setDirectory(directoryOf(focusedTab.plugin), false, false);
    }
    collectMounted().forEach((node) => {
      if (node.parentElement !== pool) pool.append(node);
    });
    const live = new Map();
    panesEl.querySelectorAll("[data-tab-pane]").forEach((node) => {
      if (!state.panes.some((pane) => pane.id === node.dataset.tabPane)) node.remove();
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
      section.style.order = String(state.panes.indexOf(pane));
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
      const node = rootForTab(tab);
      if (node) {
        if (live.has(node)) {
          const ghost = section.querySelector("[data-tab-pane-body]");
          ghost.replaceChildren();
          const hint = document.createElement("p");
          hint.className = "tab-pane-mirror";
          hint.textContent = tab?.plugin === "home" ? L("项目首页") : (tab?.title || "");
          ghost.append(hint);
        } else {
          live.set(node, pane.id);
          mount(pane, node);
          if (pane.id === state.focusedPaneId) applyTabContent(tab, keepFrame);
        }
      } else {
        section.querySelector("[data-tab-pane-body]")?.replaceChildren();
      }
    });
    } finally {
      applying = false;
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
  const openPlugin = (plugin) => {
    state.focusedPaneId = ops.focused(state).id;
    ops.openPlugin(state, plugin);
    apply();
    persist();
  };
  const openItem = (plugin, itemId, title) => {
    ops.openItem(state, plugin, itemId, titleForItem(plugin, itemId, title));
    apply();
    persist();
  };
  const setExclusive = (surface) => {
    ops.setExclusive(state, surface);
    apply();
    persist();
  };
  const handleStripClick = (paneId, event) => {
    if (!paneId) return;
    const close = event.target.closest("[data-tab-close]");
    if (close) {
      event.preventDefault();
      ops.closeTab(state, paneId, close.dataset.tabClose);
      apply();
      persist();
      return true;
    }
    const toggle = event.target.closest("[data-tab-group-toggle]");
    if (toggle) {
      ops.toggleGroup(state, paneId, toggle.dataset.tabGroupToggle);
      apply();
      persist();
      return true;
    }
    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
      activate(paneId, tab.dataset.tabId);
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
    activate(pane.dataset.tabPane, pane.querySelector("[data-tab-id][aria-current]")?.dataset.tabId);
  });
  if (titlebarStrip) {
    titlebarStrip.addEventListener("click", (event) => {
      handleStripClick(titlebarStrip.dataset.chromePane, event);
    });
    titlebarStrip.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("[data-tab-close], [data-tab-group-toggle]")) return;
      const tab = event.target.closest("[data-tab-id]");
      if (!tab || !titlebarStrip.dataset.chromePane) return;
      event.preventDefault();
      activate(titlebarStrip.dataset.chromePane, tab.dataset.tabId);
    });
    titlebarStrip.addEventListener("dragstart", (event) => {
      const tab = event.target.closest("[data-tab-id]");
      if (!tab) return;
      dragTab = { paneId: titlebarStrip.dataset.chromePane, tabId: tab.dataset.tabId };
      event.dataTransfer.effectAllowed = "copyMove";
      root.classList.add("is-tab-dragging");
    });
    titlebarStrip.addEventListener("dragend", () => { dragTab = null; root.classList.remove("is-tab-dragging"); });
  }
  panesEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-tab-close], [data-tab-pane-close], [data-tab-group-toggle]")) return;
    const tab = event.target.closest("[data-tab-id]");
    const pane = event.target.closest("[data-tab-pane]");
    if (!tab || !pane) return;
    event.preventDefault();
    activate(pane.dataset.tabPane, tab.dataset.tabId);
  });
  let dragTab = null;
  panesEl.addEventListener("dragstart", (event) => {
    const tab = event.target.closest("[data-tab-id]");
    if (!tab) return;
    const pane = event.target.closest("[data-tab-pane]");
    dragTab = { paneId: pane.dataset.tabPane, tabId: tab.dataset.tabId };
    event.dataTransfer.effectAllowed = "copyMove";
    root.classList.add("is-tab-dragging");
  });
  const finishDrag = () => { dragTab = null; root.classList.remove("is-tab-dragging"); };
  panesEl.addEventListener("dragend", finishDrag);
  panesEl.addEventListener("dragover", (event) => {
    if (!dragTab) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.altKey || event.target.closest("[data-tab-edge]") ? "copy" : "move";
  });
  panesEl.addEventListener("drop", (event) => {
    const edge = event.target.closest("[data-tab-edge]");
    const pane = event.target.closest("[data-tab-pane]");
    if (!dragTab || !pane) { finishDrag(); return; }
    event.preventDefault();
    if (edge && !narrow()) ops.splitPane(state, pane.dataset.tabPane, edge.dataset.tabEdge, "copy");
    else if (pane.dataset.tabPane !== dragTab.paneId) {
      const from = state.panes.find((candidate) => candidate.id === dragTab.paneId);
      const to = state.panes.find((candidate) => candidate.id === pane.dataset.tabPane);
      const tab = from?.tabs.find((item) => item.id === dragTab.tabId);
      if (from && to && tab) {
        if (event.altKey) to.tabs.push({ ...tab, id: "t" + Math.random().toString(36).slice(2, 10) });
        else {
          from.tabs = from.tabs.filter((item) => item.id !== tab.id);
          if (from.activeTabId === tab.id) from.activeTabId = from.tabs[0]?.id || null;
          to.tabs.push(tab);
        }
        to.activeTabId = to.tabs[to.tabs.length - 1].id;
        state.focusedPaneId = to.id;
        ops.ensureHome(state);
      }
    }
    finishDrag();
    apply();
    persist();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-goal-collapse]")) openPlugin("goals");
  });
  restore();
  return { apply, openPlugin, openItem, setExclusive, restore, isExclusive: () => Boolean(state.exclusive), state: () => state };
}`;
