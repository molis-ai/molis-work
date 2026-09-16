// @ts-nocheck
/** Pure tab-workspace rules for plugin groups, item tabs, and split panes. Stringified into the browser client; keep it type-annotation-free. */
export function createTabWorkspaceOps() {
  const MAX_PANES = Infinity;
  const uid = () => "t" + Math.random().toString(36).slice(2, 10);
  const homeTab = () => ({ id: uid(), plugin: "home", kind: "home", title: "项目首页" });
  const motherTab = (plugin, title) => ({ id: uid(), plugin, kind: "mother", title });
  const itemTab = (plugin, itemId, title) => ({ id: uid(), plugin, kind: "item", itemId, title });
  const tabKey = (tab) => tab.kind === "item" ? tab.plugin + ":item:" + tab.itemId : tab.plugin + ":" + tab.kind;
  const sameTab = (a, b) => tabKey(a) === tabKey(b);
  const pluginTitle = (plugin) => ({
    home: "项目首页",
    goals: "Goals",
    sessions: "Sessions",
    inbox: "Inbox",
    feed: "Feed",
    artifacts: "Artifacts",
  }[plugin] || plugin);
  const pluginOfSurface = (surface) => surface === "goal" ? "goals" : surface === "sources" ? "feed" : surface;
  const countTabs = (state) => state.panes.reduce((sum, pane) => sum + pane.tabs.length, 0);
  const focused = (state) => state.panes.find((pane) => pane.id === state.focusedPaneId) || state.panes[0];
  const mapTree = (node, fn) => node.paneId ? fn(node) : { ...node, children: node.children.map((child) => mapTree(child, fn)) };
  const pruneTree = (node, ids) => {
    if (!node) return null;
    if (node.paneId) return ids.has(node.paneId) ? node : null;
    const children = node.children.map((child) => pruneTree(child, ids)).filter(Boolean);
    return children.length === 2 ? { ...node, children } : children[0] || null;
  };
  const orderPinned = (pane) => { pane.tabs = [...pane.tabs.filter(tab => tab.pinned), ...pane.tabs.filter(tab => !tab.pinned)]; };
  const normalizeLayout = (state) => {
    state.panes.forEach(orderPinned);
    const old = state.layout || { direction: "row", sizes: [] };
    const sizes = state.panes.map((_, index) => Number(old.sizes?.[index]) > 0 ? Number(old.sizes[index]) : 1);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    old.sizes = sizes.map((size) => size / total);
    let tree = pruneTree(old.tree, new Set(state.panes.map((pane) => pane.id)));
    if (!tree && state.panes.length) {
      tree = { paneId: state.panes[0].id };
      state.panes.slice(1).forEach((pane, index) => {
        const before = sizes.slice(0, index + 1).reduce((sum, size) => sum + size, 0);
        tree = { id: uid(), direction: old.direction || "row", ratio: before / (before + sizes[index + 1]), children: [tree, { paneId: pane.id }] };
      });
    }
    state.layout = { ...old, tree };
    return state;
  };
  const ensureHome = (state) => {
    if (countTabs(state) === 0) {
      const pane = focused(state) || state.panes[0];
      if (!pane) {
        const next = homeTab();
        return normalizeLayout({
          panes: [{ id: uid(), tabs: [next], activeTabId: next.id, collapsed: {} }],
          layout: { direction: "row", sizes: [1] },
          focusedPaneId: "",
          exclusive: state.exclusive ?? null,
        });
      }
      const next = homeTab();
      pane.tabs = [next];
      pane.activeTabId = next.id;
    }
    return normalizeLayout(state);
  };
  const create = () => {
    const tab = homeTab();
    const paneId = uid();
    return {
      panes: [{ id: paneId, tabs: [tab], activeTabId: tab.id, collapsed: {} }],
      layout: { direction: "row", sizes: [1] },
      focusedPaneId: paneId,
      exclusive: null,
    };
  };
  const activateInPane = (pane, tab) => {
    pane.activeTabId = tab.id;
    return tab;
  };
  const openInPane = (state, pane, tab) => {
    const existing = pane.tabs.find((candidate) => sameTab(candidate, tab));
    if (existing) {
      activateInPane(pane, existing);
      return existing;
    }
    const lastGroupIndex = pane.tabs.findLastIndex((candidate) => candidate.plugin === tab.plugin && Boolean(candidate.pinned) === Boolean(tab.pinned));
    pane.tabs.splice(lastGroupIndex < 0 ? pane.tabs.length : lastGroupIndex + 1, 0, tab);
    orderPinned(pane);
    activateInPane(pane, tab);
    return tab;
  };
  const openPlugin = (state, plugin) => {
    state.exclusive = null;
    const pane = focused(state);
    if (plugin === "home") return openInPane(state, pane, homeTab());
    const existingMother = pane.tabs.find((tab) => tab.plugin === plugin && tab.kind === "mother");
    if (existingMother) {
      activateInPane(pane, existingMother);
      return existingMother;
    }
    return openInPane(state, pane, motherTab(plugin, pluginTitle(plugin)));
  };
  const openItem = (state, plugin, itemId, title) => {
    state.exclusive = null;
    const pane = focused(state);
    return openInPane(state, pane, itemTab(plugin, itemId, title || itemId));
  };
  const togglePinned = (state, paneId, tabId) => {
    const pane = state.panes.find(candidate => candidate.id === paneId);
    const tab = pane?.tabs.find(candidate => candidate.id === tabId);
    if (!tab) return state;
    tab.pinned = !tab.pinned;
    orderPinned(pane);
    return state;
  };
  const closeTab = (state, paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return state;
    const index = pane.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return state;
    pane.tabs.splice(index, 1);
    if (pane.activeTabId === tabId) pane.activeTabId = pane.tabs[index]?.id || pane.tabs[index - 1]?.id || null;
    if (!pane.tabs.length && state.panes.length > 1) return closePane(state, paneId);
    return ensureHome(state);
  };
  const closePane = (state, paneId) => {
    if (state.panes.length === 1) {
      const pane = state.panes[0];
      pane.tabs = [];
      pane.activeTabId = null;
      return ensureHome(state);
    }
    const index = state.panes.findIndex((pane) => pane.id === paneId);
    if (index < 0) return state;
    state.panes.splice(index, 1);
    state.layout.sizes.splice(index, 1);
    if (!state.panes.some((pane) => pane.id === state.focusedPaneId)) state.focusedPaneId = state.panes[Math.max(0, index - 1)].id;
    return ensureHome(state);
  };
  const moveTab = (state, fromId, tabId, toId, beforeId, copy = false) => {
    const from = state.panes.find((pane) => pane.id === fromId);
    const to = state.panes.find((pane) => pane.id === toId);
    const tab = from?.tabs.find((item) => item.id === tabId);
    if (!tab || !to || (!copy && from === to && beforeId === tabId)) return state;
    const next = copy ? { ...tab, id: uid() } : tab;
    if (!copy) {
      from.tabs = from.tabs.filter((item) => item.id !== tabId);
      if (from.activeTabId === tabId) from.activeTabId = from.tabs[0]?.id || null;
    }
    const duplicate = to.tabs.find((item) => sameTab(item, next));
    if (duplicate && from !== to) to.activeTabId = duplicate.id;
    else {
      const index = to.tabs.findIndex((item) => item.id === beforeId);
      to.tabs.splice(index < 0 ? to.tabs.length : index, 0, next);
      to.activeTabId = next.id;
    }
    state.focusedPaneId = to.id;
    if (!from.tabs.length && from !== to) closePane(state, from.id);
    return ensureHome(state);
  };
  const splitPane = (state, paneId, edge, mode, sourcePaneId = paneId, sourceTabId = null) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const source = state.panes.find((candidate) => candidate.id === sourcePaneId);
    const active = source?.tabs.find((tab) => tab.id === (sourceTabId || source.activeTabId));
    if (!pane || !active) return state;
    if (mode === "move" && pane === source && pane.tabs.length === 1) return state;
    normalizeLayout(state);
    const next = { ...active, id: mode === "move" ? active.id : uid() };
    const nextPane = { id: uid(), tabs: [next], activeTabId: next.id, collapsed: {} };
    const before = edge === "left" || edge === "top";
    state.layout.tree = mapTree(state.layout.tree, (node) => node.paneId === paneId
      ? { id: uid(), direction: edge === "left" || edge === "right" ? "row" : "column", ratio: .5, children: before ? [{ paneId: nextPane.id }, node] : [node, { paneId: nextPane.id }] } : node);
    state.panes.splice(state.panes.indexOf(pane) + (before ? 0 : 1), 0, nextPane);
    state.focusedPaneId = nextPane.id;
    if (mode === "move") {
      source.tabs = source.tabs.filter((tab) => tab.id !== active.id);
      if (source.activeTabId === active.id) source.activeTabId = source.tabs[0]?.id || null;
      if (!source.tabs.length) closePane(state, source.id);
    }
    return ensureHome(state);
  };
  const setExclusive = (state, surface) => {
    state.exclusive = surface || null;
    return state;
  };
  const toggleGroup = (state, paneId, plugin) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return state;
    pane.collapsed[plugin] = !pane.collapsed[plugin];
    return state;
  };
  const activeTab = (state) => {
    const pane = focused(state);
    return pane?.tabs.find((tab) => tab.id === pane.activeTabId) || null;
  };
  return {
    MAX_PANES,
    pluginTitle,
    pluginOfSurface,
    tabKey,
    create,
    openPlugin,
    openItem,
    closeTab,
    togglePinned,
    closePane,
    splitPane,
    moveTab,
    setExclusive,
    toggleGroup,
    normalizeLayout,
    ensureHome,
    focused,
    activeTab,
    countTabs,
  };
}
