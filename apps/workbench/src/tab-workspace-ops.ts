// @ts-nocheck
/** Pure tab-workspace rules for preview tabs, user groups, and split panes. Stringified into the browser client; keep it type-annotation-free. */
export function createTabWorkspaceOps() {
  const MAX_PANES = Infinity;
  const GROUP_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan"];
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
  const emptyGroups = (pane) => {
    if (!Array.isArray(pane.groups)) pane.groups = [];
    delete pane.collapsed;
    pane.tabs.forEach((tab) => { if (tab.pinned) delete tab.groupId; });
    const used = new Set(pane.tabs.map((tab) => tab.groupId).filter(Boolean));
    pane.groups = pane.groups.filter((group) => used.has(group.id));
    pane.tabs.forEach((tab) => {
      if (tab.groupId && !used.has(tab.groupId)) delete tab.groupId;
    });
  };
  const orderPinned = (pane) => { pane.tabs = [...pane.tabs.filter(tab => tab.pinned), ...pane.tabs.filter(tab => !tab.pinned)]; };
  const pruneEmptyGroups = (pane) => {
    if (!pane) return;
    const used = new Set(pane.tabs.map((tab) => tab.groupId).filter(Boolean));
    pane.groups = (pane.groups || []).filter((group) => used.has(group.id));
  };
  const normalizeLayout = (state) => {
    state.panes.forEach((pane) => {
      emptyGroups(pane);
      orderPinned(pane);
    });
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
          panes: [{ id: uid(), tabs: [next], activeTabId: next.id, groups: [] }],
          layout: { direction: "row", sizes: [1] },
          focusedPaneId: "",
          exclusive: state.exclusive ?? null,
        });
      }
      const next = homeTab();
      pane.tabs = [next];
      pane.activeTabId = next.id;
      pane.groups = [];
    }
    return normalizeLayout(state);
  };
  const create = () => {
    const tab = homeTab();
    const paneId = uid();
    return {
      panes: [{ id: paneId, tabs: [tab], activeTabId: tab.id, groups: [] }],
      layout: { direction: "row", sizes: [1] },
      focusedPaneId: paneId,
      exclusive: null,
    };
  };
  const activateInPane = (pane, tab) => {
    pane.activeTabId = tab.id;
    return tab;
  };
  const insertIndex = (pane) => {
    const activeIndex = pane.tabs.findIndex((tab) => tab.id === pane.activeTabId);
    if (activeIndex < 0) return pane.tabs.length;
    const active = pane.tabs[activeIndex];
    if (active.groupId && !active.pinned) {
      let end = activeIndex;
      while (end + 1 < pane.tabs.length && pane.tabs[end + 1].groupId === active.groupId) end += 1;
      return end + 1;
    }
    return activeIndex + 1;
  };
  const assignIdentity = (target, source) => {
    target.plugin = source.plugin;
    target.kind = source.kind;
    target.title = source.title;
    if (source.kind === "item") target.itemId = source.itemId;
    else {
      delete target.itemId;
      delete target.goalView;
    }
    if (source.feedTask) target.feedTask = source.feedTask;
    else delete target.feedTask;
  };
  const insertNew = (pane, tab) => {
    pane.tabs.splice(insertIndex(pane), 0, tab);
    orderPinned(pane);
    activateInPane(pane, tab);
    return tab;
  };
  const findCommitted = (pane, tab) => pane.tabs.find((candidate) => sameTab(candidate, tab) && !candidate.preview);
  const findAny = (pane, tab) => findCommitted(pane, tab) || pane.tabs.find((candidate) => sameTab(candidate, tab));
  const previewInPane = (state, pane, tab) => {
    state.exclusive = null;
    const committed = findCommitted(pane, tab);
    if (committed) return activateInPane(pane, committed);
    const preview = pane.tabs.find((candidate) => candidate.preview);
    if (preview) {
      assignIdentity(preview, tab);
      preview.preview = true;
      return activateInPane(pane, preview);
    }
    tab.preview = true;
    return insertNew(pane, tab);
  };
  const commitInPane = (state, pane, tab) => {
    state.exclusive = null;
    const existing = findAny(pane, tab);
    if (existing) {
      existing.preview = false;
      pane.tabs = pane.tabs.filter((candidate) => candidate === existing || !(candidate.preview && sameTab(candidate, existing)));
      return activateInPane(pane, existing);
    }
    tab.preview = false;
    return insertNew(pane, tab);
  };
  const openInPane = (state, pane, tab, mode) => mode === "preview" ? previewInPane(state, pane, tab) : commitInPane(state, pane, tab);
  const openPlugin = (state, plugin, mode = "commit") => {
    state.exclusive = null;
    const pane = focused(state);
    if (plugin === "home") return commitInPane(state, pane, homeTab());
    return openInPane(state, pane, motherTab(plugin, pluginTitle(plugin)), mode);
  };
  const openItem = (state, plugin, itemId, title, mode = "commit") => {
    state.exclusive = null;
    const pane = focused(state);
    return openInPane(state, pane, itemTab(plugin, itemId, title || itemId), mode);
  };
  const commitTab = (state, paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const tab = pane?.tabs.find((candidate) => candidate.id === tabId);
    if (tab) tab.preview = false;
    return tab;
  };
  const nextGroupColor = (pane) => {
    const used = new Set((pane.groups || []).map((group) => group.color));
    return GROUP_COLORS.find((color) => !used.has(color)) || GROUP_COLORS[(pane.groups || []).length % GROUP_COLORS.length];
  };
  const gatherGroup = (pane, groupId, tab) => {
    const others = pane.tabs.filter((candidate) => candidate.id !== tab.id);
    const last = others.findLastIndex((candidate) => candidate.groupId === groupId);
    if (last < 0) pane.tabs = others.concat(tab);
    else {
      others.splice(last + 1, 0, tab);
      pane.tabs = others;
    }
    orderPinned(pane);
  };
  const addTabToNewGroup = (state, paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const tab = pane?.tabs.find((candidate) => candidate.id === tabId);
    if (!tab || tab.pinned) return state;
    const group = { id: uid(), title: "", color: nextGroupColor(pane), collapsed: false };
    pane.groups.push(group);
    tab.groupId = group.id;
    return state;
  };
  const addTabToGroup = (state, paneId, tabId, groupId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const tab = pane?.tabs.find((candidate) => candidate.id === tabId);
    const group = pane?.groups.find((candidate) => candidate.id === groupId);
    if (!tab || !group || tab.pinned) return state;
    tab.groupId = groupId;
    gatherGroup(pane, groupId, tab);
    pruneEmptyGroups(pane);
    return state;
  };
  const removeTabFromGroup = (state, paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const tab = pane?.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return state;
    delete tab.groupId;
    pruneEmptyGroups(pane);
    return state;
  };
  const ungroup = (state, paneId, groupId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return state;
    pane.tabs.forEach((tab) => { if (tab.groupId === groupId) delete tab.groupId; });
    pane.groups = (pane.groups || []).filter((group) => group.id !== groupId);
    return state;
  };
  const setGroupTitle = (state, paneId, groupId, title) => {
    const group = state.panes.find((candidate) => candidate.id === paneId)?.groups.find((candidate) => candidate.id === groupId);
    if (group) group.title = String(title || "");
    return state;
  };
  const setGroupColor = (state, paneId, groupId, color) => {
    const group = state.panes.find((candidate) => candidate.id === paneId)?.groups.find((candidate) => candidate.id === groupId);
    if (group && GROUP_COLORS.includes(color)) group.color = color;
    return state;
  };
  const togglePinned = (state, paneId, tabId) => {
    const pane = state.panes.find(candidate => candidate.id === paneId);
    const tab = pane?.tabs.find(candidate => candidate.id === tabId);
    if (!tab) return state;
    tab.pinned = !tab.pinned;
    if (tab.pinned) delete tab.groupId;
    orderPinned(pane);
    pruneEmptyGroups(pane);
    return state;
  };
  const closeTab = (state, paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return state;
    const index = pane.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return state;
    pane.tabs.splice(index, 1);
    pruneEmptyGroups(pane);
    if (pane.activeTabId === tabId) pane.activeTabId = pane.tabs[index]?.id || pane.tabs[index - 1]?.id || null;
    if (!pane.tabs.length && state.panes.length > 1) return closePane(state, paneId);
    return ensureHome(state);
  };
  const closePane = (state, paneId) => {
    if (state.panes.length === 1) {
      const pane = state.panes[0];
      pane.tabs = [];
      pane.activeTabId = null;
      pane.groups = [];
      return ensureHome(state);
    }
    const index = state.panes.findIndex((pane) => pane.id === paneId);
    if (index < 0) return state;
    state.panes.splice(index, 1);
    state.layout.sizes.splice(index, 1);
    if (!state.panes.some((pane) => pane.id === state.focusedPaneId)) state.focusedPaneId = state.panes[Math.max(0, index - 1)].id;
    return ensureHome(state);
  };
  const closeGroup = (state, paneId, groupId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return state;
    pane.tabs.filter((tab) => tab.groupId === groupId).map((tab) => tab.id).forEach((id) => closeTab(state, paneId, id));
    return state;
  };
  const groupIdAtInsert = (tabs, movingId, beforeId) => {
    const list = tabs.filter((tab) => tab.id !== movingId);
    const insertAt = beforeId ? list.findIndex((tab) => tab.id === beforeId) : list.length;
    const next = insertAt >= 0 && insertAt < list.length ? list[insertAt] : null;
    const prev = insertAt > 0 ? list[insertAt - 1] : null;
    if (next?.groupId && !next.pinned) return next.groupId;
    if (!next && prev?.groupId && !prev.pinned) return prev.groupId;
    return undefined;
  };
  const moveTab = (state, fromId, tabId, toId, beforeId, copy = false) => {
    const from = state.panes.find((pane) => pane.id === fromId);
    const to = state.panes.find((pane) => pane.id === toId);
    const tab = from?.tabs.find((item) => item.id === tabId);
    if (!tab || !to || (!copy && from === to && beforeId === tabId)) return state;
    const next = copy ? { ...tab, id: uid() } : tab;
    if (copy || from !== to) delete next.groupId;
    if (!copy) {
      from.tabs = from.tabs.filter((item) => item.id !== tabId);
      if (from.activeTabId === tabId) from.activeTabId = from.tabs[0]?.id || null;
      pruneEmptyGroups(from);
    }
    const duplicate = to.tabs.find((item) => sameTab(item, next));
    if (duplicate && from !== to) to.activeTabId = duplicate.id;
    else {
      if (!next.pinned) {
        const groupId = groupIdAtInsert(to.tabs, next.id, beforeId);
        if (groupId) next.groupId = groupId;
        else delete next.groupId;
      }
      const index = to.tabs.findIndex((item) => item.id === beforeId);
      to.tabs.splice(index < 0 ? to.tabs.length : index, 0, next);
      if (next.groupId) gatherGroup(to, next.groupId, next);
      else orderPinned(to);
      to.activeTabId = next.id;
    }
    state.focusedPaneId = to.id;
    if (!from.tabs.length && from !== to) closePane(state, from.id);
    pruneEmptyGroups(to);
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
    delete next.groupId;
    const nextPane = { id: uid(), tabs: [next], activeTabId: next.id, groups: [] };
    const before = edge === "left" || edge === "top";
    state.layout.tree = mapTree(state.layout.tree, (node) => node.paneId === paneId
      ? { id: uid(), direction: edge === "left" || edge === "right" ? "row" : "column", ratio: .5, children: before ? [{ paneId: nextPane.id }, node] : [node, { paneId: nextPane.id }] } : node);
    state.panes.splice(state.panes.indexOf(pane) + (before ? 0 : 1), 0, nextPane);
    state.focusedPaneId = nextPane.id;
    if (mode === "move") {
      source.tabs = source.tabs.filter((tab) => tab.id !== active.id);
      if (source.activeTabId === active.id) source.activeTabId = source.tabs[0]?.id || null;
      pruneEmptyGroups(source);
      if (!source.tabs.length) closePane(state, source.id);
    }
    return ensureHome(state);
  };
  const setExclusive = (state, surface) => {
    state.exclusive = surface || null;
    return state;
  };
  const toggleGroup = (state, paneId, groupId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const group = pane?.groups.find((candidate) => candidate.id === groupId);
    if (!group) return state;
    group.collapsed = !group.collapsed;
    return state;
  };
  const activeTab = (state) => {
    const pane = focused(state);
    return pane?.tabs.find((tab) => tab.id === pane.activeTabId) || null;
  };
  return {
    MAX_PANES,
    GROUP_COLORS,
    pluginTitle,
    pluginOfSurface,
    tabKey,
    create,
    openPlugin,
    openItem,
    commitTab,
    closeTab,
    togglePinned,
    closePane,
    splitPane,
    moveTab,
    setExclusive,
    toggleGroup,
    addTabToNewGroup,
    addTabToGroup,
    removeTabFromGroup,
    ungroup,
    closeGroup,
    setGroupTitle,
    setGroupColor,
    normalizeLayout,
    ensureHome,
    focused,
    activeTab,
    countTabs,
  };
}
