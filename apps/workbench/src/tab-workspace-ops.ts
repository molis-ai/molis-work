// @ts-nocheck
/** Pure tab-workspace rules. This function is stringified into the browser client; keep it type-annotation-free. */
export function createTabWorkspaceOps() {
  const MAX_PANES = 3;
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
  const normalizeLayout = (state) => {
    if (!state.layout) state.layout = { direction: "row", sizes: [] };
    if (!state.panes.length) {
      state.layout.sizes = [];
      return state;
    }
    const sizes = state.panes.map((_, index) => {
      const size = Number(state.layout.sizes?.[index]);
      return size > 0 ? size : 1;
    });
    const total = sizes.reduce((sum, size) => sum + size, 0);
    state.layout.sizes = sizes.map((size) => size / total);
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
    pane.tabs.push(tab);
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
  const closeTab = (state, paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return state;
    const index = pane.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return state;
    pane.tabs.splice(index, 1);
    if (pane.activeTabId === tabId) pane.activeTabId = pane.tabs[index]?.id || pane.tabs[index - 1]?.id || null;
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
  const splitPane = (state, paneId, edge, mode) => {
    if (state.panes.length >= MAX_PANES) return state;
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return state;
    const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
    const vertical = edge === "left" || edge === "right";
    const insertBefore = edge === "left" || edge === "top";
    const nextPane = { id: uid(), tabs: [], activeTabId: null, collapsed: {} };
    if (active) {
      if (mode === "move") {
        pane.tabs = pane.tabs.filter((tab) => tab.id !== active.id);
        pane.activeTabId = pane.tabs[0]?.id || null;
        nextPane.tabs = [active];
        nextPane.activeTabId = active.id;
      } else {
        const copy = { ...active, id: uid() };
        nextPane.tabs = [copy];
        nextPane.activeTabId = copy.id;
      }
    }
    const index = state.panes.indexOf(pane);
    const nextIndex = insertBefore ? index : index + 1;
    if (state.layout.direction && ((vertical && state.layout.direction !== "row") || (!vertical && state.layout.direction !== "column")) && state.panes.length > 1) {
      if (state.panes.length >= MAX_PANES) return state;
    }
    state.layout.direction = vertical ? "row" : "column";
    state.panes.splice(nextIndex, 0, nextPane);
    const share = 1 / state.panes.length;
    state.layout.sizes = state.panes.map(() => share);
    state.focusedPaneId = nextPane.id;
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
    closePane,
    splitPane,
    setExclusive,
    toggleGroup,
    normalizeLayout,
    ensureHome,
    focused,
    activeTab,
    countTabs,
  };
}
