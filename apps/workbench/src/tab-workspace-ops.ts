// @ts-nocheck
/** Pure tab-workspace rules for additive tabs, user groups, and split panes. Stringified into the browser client; keep it type-annotation-free. */
export function createTabWorkspaceOps(titles) {
  const GROUP_COLORS = ["blue", "pink", "green", "purple", "yellow", "cyan", "red", "grey"];
  const uid = () => "t" + Math.random().toString(36).slice(2, 10);
  const itemTab = (plugin, itemId, title) => ({ id: uid(), plugin, kind: "item", itemId, title });
  const pluginViewKey = (plugin) => "plugin:" + plugin;
  const tabKey = (tab) => tab.kind === "system" ? "system:" + tab.owner + ":" + tab.itemId : tab.kind === "item" ? tab.plugin + ":item:" + tab.itemId : tab.plugin + ":" + tab.kind;
  // Plugins name their tabs with their Manifest views' titles (the page passes `pluginTabTitles`); only the Host's own surfaces are named here.
  const pluginTitle = (plugin) => (titles && titles[plugin]) || ({ home: "项目首页", characters: "Characters", market: "插件市场" }[plugin] || plugin);
  const pluginOfSurface = (surface) => surface === "sources" ? "feed" : surface;
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
  // The pane's shown plugin is the plugin of what it shows: an item tab's own plugin, not whichever plugin page
  // the pane happened to show before that tab was chosen again.
  const followActiveItem = (pane) => {
    const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
    if (active?.kind === "item") pane.viewPlugin = active.plugin;
  };
  const normalizeLayout = (state) => {
    state.panes.forEach((pane) => {
      emptyGroups(pane);
      orderPinned(pane);
      followActiveItem(pane);
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
  const create = () => {
    const paneId = uid();
    return {
      panes: [{ id: paneId, tabs: [], activeTabId: null, groups: [], viewPlugin: null }],
      layout: { direction: "row", sizes: [1] },
      focusedPaneId: paneId,
      exclusive: null,
    };
  };
  const activateInPane = (pane, tab) => {
    pane.activeTabId = tab.id;
    if (tab.kind === "item") pane.viewPlugin = tab.plugin;
    return tab;
  };
  // Choosing a tab is going there: a cover over the panes steps aside.
  const activate = (state, paneId, tabId) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const tab = pane?.tabs.find((candidate) => candidate.id === tabId);
    if (!pane || !tab) return state;
    state.focusedPaneId = paneId;
    state.exclusive = null;
    activateInPane(pane, tab);
    return state;
  };
  /** The plugin a pane shows right now: its active tab's, or the plugin page's; home when neither. */
  const shownPlugin = (pane) => {
    const tab = pane?.tabs.find((candidate) => candidate.id === pane.activeTabId);
    return tab ? tab.plugin : pane?.viewPlugin || "home";
  };
  // Entering a project (not reloading it) starts at its home: a cover left open last time does not greet you.
  const landAtProjectRoot = (state) => {
    state.exclusive = null;
    if (state.panes.some((pane) => pane.tabs.some((tab) => tab.kind === "item"))) return state;
    if (!state.panes.some((pane) => pane.viewPlugin)) return state;
    for (const pane of state.panes) if (pane.viewPlugin) { pane.viewPlugin = null; pane.activeTabId = null; }
    return normalizeLayout(state);
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
  const insertNew = (pane, tab) => {
    pane.tabs.splice(insertIndex(pane), 0, tab);
    orderPinned(pane);
    activateInPane(pane, tab);
    return tab;
  };
  const openInPane = (state, pane, tab) => {
    state.exclusive = null;
    const existing = pane.tabs.find((candidate) => tabKey(candidate) === tabKey(tab));
    if (existing && tab.kind === "item" && tab.title && tab.title !== tab.itemId) existing.title = tab.title;
    if (existing) return activateInPane(pane, existing);
    return insertNew(pane, tab);
  };
  // Answers the plugin's page view; the project home has no tab and no view to write to, so it answers null.
  const openPlugin = (state, plugin) => {
    state.exclusive = null;
    const pane = focused(state);
    if (plugin === "home") {
      pane.viewPlugin = null;
      pane.activeTabId = null;
      return null;
    }
    pane.viewPlugin = plugin;
    pane.activeTabId = null;
    return { id: pluginViewKey(plugin), plugin, kind: "view" };
  };
  const openItem = (state, plugin, itemId, title) => {
    state.exclusive = null;
    const pane = focused(state);
    pane.viewPlugin = plugin;
    return openInPane(state, pane, itemTab(plugin, itemId, title || itemId));
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
    if (pane.activeTabId === tabId) {
      pane.activeTabId = (pane.tabs[index] || pane.tabs[index - 1])?.id || null;
    }
    if (!pane.tabs.length && state.panes.length > 1) return closePane(state, paneId);
    return normalizeLayout(state);
  };
  const closePane = (state, paneId) => {
    if (state.panes.length === 1) {
      const pane = state.panes[0];
      pane.tabs = [];
      pane.activeTabId = null;
      pane.groups = [];
      pane.viewPlugin = null;
      return normalizeLayout(state);
    }
    const index = state.panes.findIndex((pane) => pane.id === paneId);
    if (index < 0) return state;
    state.panes.splice(index, 1);
    state.layout.sizes.splice(index, 1);
    if (!state.panes.some((pane) => pane.id === state.focusedPaneId)) state.focusedPaneId = state.panes[Math.max(0, index - 1)].id;
    return normalizeLayout(state);
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
    if (tab.kind === "system") copy = false;
    const next = copy ? { ...tab, id: uid() } : tab;
    if (copy || from !== to) delete next.groupId;
    if (!copy) {
      from.tabs = from.tabs.filter((item) => item.id !== tabId);
      if (from.activeTabId === tabId) {
        from.activeTabId = from.tabs[0]?.id || null;
      }
      pruneEmptyGroups(from);
    }
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
    state.focusedPaneId = to.id;
    if (!from.tabs.length && from !== to && !from.viewPlugin) closePane(state, from.id);
    pruneEmptyGroups(to);
    return normalizeLayout(state);
  };
  const splitPane = (state, paneId, edge, mode, sourcePaneId = paneId, sourceTabId = null) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const source = state.panes.find((candidate) => candidate.id === sourcePaneId);
    const active = source?.tabs.find((tab) => tab.id === (sourceTabId || source.activeTabId));
    // A pane on the project home splits off another on it; only something shown can be moved.
    if (!pane || !source || !active && !source.viewPlugin && mode === "move") return state;
    if (active?.kind === "system") mode = "move";
    if (mode === "move" && pane === source && !source.viewPlugin && (active ? pane.tabs.length === 1 : !source.tabs.length)) return state;
    normalizeLayout(state);
    const before = edge === "left" || edge === "top";
    const place = (nextPane) => {
      state.layout.tree = mapTree(state.layout.tree, (node) => node.paneId === paneId
        ? { id: uid(), direction: edge === "left" || edge === "right" ? "row" : "column", ratio: .5, children: before ? [{ paneId: nextPane.id }, node] : [node, { paneId: nextPane.id }] } : node);
      state.panes.splice(state.panes.indexOf(pane) + (before ? 0 : 1), 0, nextPane);
      state.focusedPaneId = nextPane.id;
    };
    if (!active) {
      place({ id: uid(), tabs: [], activeTabId: null, groups: [], viewPlugin: source.viewPlugin });
      if (mode === "move") {
        source.viewPlugin = null;
        if (!source.tabs.length) closePane(state, source.id);
      }
      return normalizeLayout(state);
    }
    const next = { ...active, id: mode === "move" ? active.id : uid() };
    delete next.groupId;
    place({ id: uid(), tabs: [next], activeTabId: next.id, groups: [], viewPlugin: source.viewPlugin || active.plugin });
    if (mode === "move") {
      source.tabs = source.tabs.filter((tab) => tab.id !== active.id);
      if (source.activeTabId === active.id) source.activeTabId = source.tabs[0]?.id || null;
      pruneEmptyGroups(source);
      if (!source.tabs.length && !source.viewPlugin) closePane(state, source.id);
    }
    return normalizeLayout(state);
  };
  /**
   * Open an item — or, without one, a plugin's own view — in the pane beside the focused one: the pane to its right
   * when the layout already has one there, otherwise a new pane split off to the right. The focused pane keeps showing
   * what it showed, so two items of one plugin (two Coding sessions, say) can sit side by side.
   */
  const openBeside = (state, plugin, itemId = null, title = undefined) => {
    state.exclusive = null;
    normalizeLayout(state);
    const from = focused(state);
    const firstPane = (node) => node.paneId ? node.paneId : firstPane(node.children[0]);
    const trail = (node, steps) => node.paneId ? (node.paneId === from.id ? steps : null)
      : node.children.reduce((found, child, index) => found || trail(child, [...steps, { node, index }]), null);
    const step = [...(trail(state.layout.tree, []) || [])].reverse().find(({ node, index }) => node.direction === "row" && index === 0);
    let pane = step ? state.panes.find((candidate) => candidate.id === firstPane(step.node.children[1])) : null;
    if (!pane) {
      pane = { id: uid(), tabs: [], activeTabId: null, groups: [], viewPlugin: plugin };
      state.layout.tree = mapTree(state.layout.tree, (node) => node.paneId === from.id
        ? { id: uid(), direction: "row", ratio: .5, children: [node, { paneId: pane.id }] } : node);
      state.panes.splice(state.panes.indexOf(from) + 1, 0, pane);
    }
    state.focusedPaneId = pane.id;
    pane.viewPlugin = plugin;
    if (itemId === null) pane.activeTabId = null;
    else openInPane(state, pane, itemTab(plugin, itemId, title || itemId));
    return normalizeLayout(state);
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
  const viewTab = (state, paneId, tabId) => {
    const pane = state.panes.find((entry) => entry.id === paneId);
    if (!pane) return null;
    if (tabId !== undefined) return pane.tabs.find((tab) => tab.id === tabId) || null;
    const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
    return active?.kind === "item" ? active : pane.tabs.find((tab) => tab.kind === "plugin" && tab.plugin === pane.viewPlugin) || null;
  };
  const readView = (state, paneId, tabId) => viewTab(state, paneId, tabId)?.view;
  const writeView = (state, paneId, view, tabId) => {
    const tab = viewTab(state, paneId, tabId);
    if (!tab || view !== undefined && typeof view !== "string") return false;
    if (view === undefined) delete tab.view; else tab.view = view;
    return true;
  };
  return {
    GROUP_COLORS,
    pluginTitle,
    pluginOfSurface,
    tabKey,
    create,
    openPlugin,
    openItem,
    activate,
    landAtProjectRoot,
    closeTab,
    togglePinned,
    closePane,
    splitPane,
    openBeside,
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
    focused,
    activeTab,
    readView,
    writeView,
    shownPlugin,
    countTabs,
  };
}

/* Plugin tabs and their automatic groups, laid over the rules above (specs/plugin-tab-groups). */

/** A tab that belongs to its plugin's automatic group: a plugin or item tab that is neither pinned nor in a user group. */
export function isLoosePluginTab(tab) {
  return Boolean(tab) && (tab.kind === "plugin" || tab.kind === "item") && !tab.pinned && !tab.groupId;
}

/**
 * Settle one pane after any change: a plugin tab chosen means its page is shown, a pane keeps one plugin tab per plugin
 * (the first), a plugin page or a loose item without its plugin tab gets one, and each plugin's loose tabs sit together
 * at the plugin tab (or, without a loose one, at the first of them).
 */
export function settlePluginTabs(pane, newPluginTab, loose) {
  const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
  if (active?.kind === "plugin") { pane.viewPlugin = active.plugin; pane.activeTabId = null; }
  const heads = new Set();
  pane.tabs = pane.tabs.filter((tab) => tab.kind !== "plugin" || !heads.has(tab.plugin) && Boolean(heads.add(tab.plugin)));
  for (let index = 0; index < pane.tabs.length; index += 1) {
    const tab = pane.tabs[index];
    if (tab.kind === "item" && loose(tab) && !heads.has(tab.plugin)) { pane.tabs.splice(index, 0, newPluginTab(tab.plugin)); heads.add(tab.plugin); index += 1; }
  }
  if (pane.viewPlugin && !heads.has(pane.viewPlugin)) pane.tabs.push(newPluginTab(pane.viewPlugin));
  const members = new Map();
  pane.tabs.forEach((tab) => { if (loose(tab)) members.set(tab.plugin, [...(members.get(tab.plugin) || []), tab]); });
  const anchors = new Map([...members].map(([plugin, group]) => [plugin, (group.find((tab) => tab.kind === "plugin") || group[0]).id]));
  pane.tabs = pane.tabs.flatMap((tab) => {
    if (!loose(tab)) return [tab];
    if (anchors.get(tab.plugin) !== tab.id) return [];
    const group = members.get(tab.plugin);
    return group.filter((member) => member.kind === "plugin").concat(group.filter((member) => member.kind !== "plugin"));
  });
  return pane;
}

/** The tab-workspace rules with plugin tabs: every change is settled, and closing a plugin tab closes its group. */
export function withPluginGroups(base, settlePane, loose) {
  const uid = () => "t" + Math.random().toString(36).slice(2, 10);
  const pluginTab = (plugin) => ({ id: uid(), plugin, kind: "plugin", title: base.pluginTitle(plugin) });
  const settle = (state) => { (state.panes || []).forEach((pane) => settlePane(pane, pluginTab, loose)); return state; };
  const settled = (name) => (state, ...args) => { const result = base[name](state, ...args); settle(state); return result; };
  const paneOf = (state, paneId) => state.panes.find((pane) => pane.id === paneId);
  const ops = { ...base };
  for (const name of ["openItem", "activate", "landAtProjectRoot", "togglePinned", "closePane", "openBeside", "addTabToNewGroup",
    "addTabToGroup", "removeTabFromGroup", "ungroup", "normalizeLayout"]) ops[name] = settled(name);
  ops.create = () => settle(base.create());
  ops.openPlugin = (state, plugin) => {
    base.openPlugin(state, plugin);
    settle(state);
    return plugin === "home" ? null : base.focused(state).tabs.find((tab) => tab.kind === "plugin" && tab.plugin === plugin);
  };
  ops.isLoose = loose;
  ops.pluginGroup = (pane, plugin) => pane.tabs.filter((tab) => tab.plugin === plugin && loose(tab));
  ops.closePluginGroup = (state, paneId, plugin) => {
    const pane = paneOf(state, paneId);
    if (!pane) return null;
    const head = pane.tabs.find((tab) => tab.kind === "plugin" && tab.plugin === plugin);
    const closing = head && !loose(head) ? [head] : ops.pluginGroup(pane, plugin);
    if (!closing.length && pane.viewPlugin !== plugin) return null;
    const shown = base.shownPlugin(pane) === plugin;
    const closed = { paneId, plugin, shown, activeTabId: pane.activeTabId, tabs: closing.map((tab) => ({ tab, index: pane.tabs.indexOf(tab) })) };
    const first = closing.length ? pane.tabs.indexOf(closing[0]) : pane.tabs.length;
    pane.tabs = pane.tabs.filter((tab) => !closing.includes(tab));
    if (pane.viewPlugin === plugin) pane.viewPlugin = null;
    if (shown) {
      const neighbor = pane.tabs[first] || pane.tabs[first - 1] || null;
      pane.activeTabId = neighbor?.id || null;
      if (neighbor?.kind === "item") pane.viewPlugin = neighbor.plugin;
    }
    base.normalizeLayout(state);
    settle(state);
    return closed;
  };
  ops.closeTab = (state, paneId, tabId) => {
    const tab = paneOf(state, paneId)?.tabs.find((candidate) => candidate.id === tabId);
    if (tab?.kind !== "plugin") return settled("closeTab")(state, paneId, tabId);
    ops.closePluginGroup(state, paneId, tab.plugin);
    return state;
  };
  /** A user group closed with a plugin tab in it closes that plugin's loose tabs too, instead of growing a new plugin tab. */
  ops.closeGroup = (state, paneId, groupId) => {
    const plugins = (paneOf(state, paneId)?.tabs || []).filter((tab) => tab.groupId === groupId && tab.kind === "plugin").map((tab) => tab.plugin);
    base.closeGroup(state, paneId, groupId);
    plugins.forEach((plugin) => ops.closePluginGroup(state, paneId, plugin));
    return settle(state);
  };
  /** Put a closed group back where it was; tabs that were opened again meanwhile are not doubled. */
  ops.reopenPluginGroup = (state, closed) => {
    const pane = paneOf(state, closed?.paneId) || base.focused(state);
    if (!pane) return state;
    const keys = new Set(pane.tabs.map(base.tabKey));
    closed.tabs.forEach(({ tab, index }) => {
      if (keys.has(base.tabKey(tab))) return;
      pane.tabs.splice(Math.min(index, pane.tabs.length), 0, tab);
    });
    if (closed.shown) {
      state.focusedPaneId = pane.id;
      state.exclusive = null;
      const active = pane.tabs.find((tab) => tab.id === closed.activeTabId);
      pane.viewPlugin = closed.plugin;
      pane.activeTabId = active?.id || null;
    }
    return settle(base.normalizeLayout(state));
  };
  /**
   * A plugin tab moved to another pane takes its loose tabs with it, and the pane it left stops showing that plugin. Where
   * that pane already has the plugin's tab, the group joins it: one plugin tab, and a record already open there is not doubled.
   */
  const relocate = (state, from, to, moving, followers) => {
    if (!to || to === from) return;
    if (state.panes.includes(from)) {
      from.tabs = from.tabs.filter((tab) => !followers.includes(tab));
      if (from.viewPlugin === moving.plugin) { from.viewPlugin = null; if (!from.tabs.some((tab) => tab.id === from.activeTabId)) from.activeTabId = from.tabs[0]?.id || null; }
      if (!from.tabs.length) base.closePane(state, from.id);
    }
    const existing = to.tabs.find((tab) => tab.kind === "plugin" && tab.plugin === moving.plugin && tab !== moving);
    let head = moving;
    if (existing) {
      const keys = new Set(to.tabs.map(base.tabKey));
      followers = followers.filter((tab) => !keys.has(base.tabKey(tab)));
      to.tabs = to.tabs.filter((tab) => tab !== moving);
      if (to.activeTabId === moving.id) to.activeTabId = existing.id;
      head = existing;
    }
    to.tabs.splice(to.tabs.findIndex((tab) => tab.id === head.id) + 1, 0, ...followers);
    base.normalizeLayout(state);
  };
  const movingGroup = (pane, tabId, carry) => {
    const moving = pane?.tabs.find((tab) => tab.id === tabId);
    return moving?.kind === "plugin" && carry ? { moving, followers: ops.pluginGroup(pane, moving.plugin).filter((tab) => tab !== moving) } : null;
  };
  ops.moveTab = (state, fromId, tabId, toId, beforeId, copy = false) => {
    const from = paneOf(state, fromId), group = movingGroup(from, tabId, !copy && fromId !== toId);
    const tab = from?.tabs.find((candidate) => candidate.id === tabId), to = paneOf(state, toId);
    // A plugin tab is not doubled: copied where its plugin already has a tab, it shows that plugin's page there.
    const head = copy && tab?.kind === "plugin" && to?.tabs.find((candidate) => candidate.kind === "plugin" && candidate.plugin === tab.plugin);
    if (head) { to.activeTabId = head.id; state.focusedPaneId = to.id; return settle(state); }
    base.moveTab(state, fromId, tabId, toId, beforeId, copy);
    if (group) relocate(state, from, paneOf(state, toId), group.moving, group.followers);
    return settle(state);
  };
  ops.splitPane = (state, paneId, edge, mode, sourcePaneId = paneId, sourceTabId = null) => {
    const from = paneOf(state, sourcePaneId), group = movingGroup(from, sourceTabId, mode === "move");
    const focused = base.focused(state);
    const view = !sourceTabId && !from?.activeTabId ? base.readView(state, sourcePaneId) : undefined;
    base.splitPane(state, paneId, edge, mode, sourcePaneId, sourceTabId);
    if (group) relocate(state, from, base.focused(state), group.moving, group.followers);
    settle(state);
    const next = base.focused(state);
    if (view !== undefined && next !== focused) base.writeView(state, next.id, view);
    return state;
  };
  ops.togglePluginGroup = (state, paneId, plugin) => {
    const head = paneOf(state, paneId)?.tabs.find((tab) => tab.kind === "plugin" && tab.plugin === plugin);
    if (head) { if (head.collapsed) delete head.collapsed; else head.collapsed = true; }
    return state;
  };
  return ops;
}

/*
 * The right side (specs/product-flow-governance §4.6.2 口径 1): one more pane of the same workspace state, `state.side`. Its tabs
 * are the views the page offers beside the work (the discussion, Shelf, 灵光, 资料, the browser, the computer, the background
 * tasks, each plugin's `slot: "side"` view), one tab per view, keyed by the view (`itemId`), and the main area's tabs moved
 * there (`kind: "pane"`, keyed "pane:" + the main tab's key; withLayout). Whether it is open, which tab it shows, how wide it is
 * and which offered views the person closed (`closed`) are kept with the rest, so a reload, a project switch and a collapse
 * keep them (PFG-22, PFG-24). A view is a document that stays where it is: these rules only say which one shows.
 * (The function ships as its own text, so what each rule does is said here, not inside it.)
 * - syncSide(state, views, only, keep): settle the tabs on the views the page offers now (`views`, in their declared order): a
 *   view's tab whose view is gone leaves, unless `keep(tab)` says to hold it (a plugin taken out of the project keeps its tabs
 *   where they were, marked removed, as the main area's do: 口径 4); a moved tab is not a view and stays until closed. An
 *   offered view without a tab gets one where its order puts it, unless the person closed it (`closed`, kept across a reload).
 *   `only` limits the views that may join and names views asked for now, which come back even if they were closed.
 * - openSide(state, key, views): bring a view forward: the tab it has is chosen (never a second one); one without gets it back.
 * - selectSide(state, key): choose a tab without opening or closing the side (a collapsed side remembers it for the next open).
 * - closeSideTab(state, tabId): close a tab; an offered view is remembered as closed, so a reload does not bring it back. The
 *   answer is what puts it back (`reopenSideTab`), the record a closed plugin group has too. reopenSideTab puts it back where it
 *   was; a view that got its tab again meanwhile is not doubled. A close that collapsed the side (its last tab) says so
 *   (`collapsed`), and putting that tab back opens the side again, as it was.
 */
export function withSidePane(base) {
  const uid = () => "t" + Math.random().toString(36).slice(2, 10);
  const RATIO_MIN = .25, RATIO_MAX = .55;
  const createSide = () => ({ id: "side", tabs: [], activeTabId: null, open: false, ratio: .35, closed: [] });
  const tabOf = (side, key) => side.tabs.find((tab) => tab.itemId === key) || null;
  const viewTab = (view) => ({ id: uid(), kind: "side", plugin: view.plugin || "", itemId: view.key, title: view.title || view.key });
  const forget = (side, key) => { side.closed = side.closed.filter((closed) => closed !== key); };
  const syncSide = (state, views, only, keep = () => false) => {
    const side = state.side, offered = new Set(views.map((view) => view.key));
    only?.forEach((key) => forget(side, key));
    side.closed = side.closed.filter((closed) => offered.has(closed));
    side.tabs = side.tabs.filter((tab) => tab.kind === "pane" || offered.has(tab.itemId) || keep(tab));
    views.forEach((view, index) => {
      const tab = tabOf(side, view.key);
      if (tab) { tab.title = view.title || tab.title; tab.plugin = view.plugin || ""; return; }
      if (only && !only.has(view.key) || side.closed.includes(view.key)) return;
      const after = views.slice(index + 1).map((next) => side.tabs.findIndex((candidate) => candidate.itemId === next.key)).find((at) => at >= 0);
      side.tabs.splice(after ?? side.tabs.length, 0, viewTab(view));
    });
    if (!side.tabs.some((tab) => tab.id === side.activeTabId)) side.activeTabId = side.tabs[0]?.id || null;
    return state;
  };
  const openSide = (state, key, views = []) => {
    const side = state.side;
    if (!tabOf(side, key) && views.some((view) => view.key === key)) syncSide(state, views, new Set([key]));
    const tab = tabOf(side, key);
    if (!tab) return null;
    side.activeTabId = tab.id;
    side.open = true;
    return tab;
  };
  const selectSide = (state, key) => {
    const tab = tabOf(state.side, key);
    if (tab) state.side.activeTabId = tab.id;
    return tab;
  };
  const closeSideTab = (state, tabId) => {
    const side = state.side, index = side.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return null;
    const [tab] = side.tabs.splice(index, 1), active = side.activeTabId === tabId, collapsed = side.open && !side.tabs.length;
    if (tab.kind === "side" && !side.closed.includes(tab.itemId)) side.closed.push(tab.itemId);
    if (active) side.activeTabId = (side.tabs[index] || side.tabs[index - 1])?.id || null;
    if (!side.tabs.length) side.open = false;
    return { paneId: side.id, side: true, plugin: tab.plugin, title: tab.title, tab, index, active, collapsed };
  };
  const reopenSideTab = (state, record) => {
    const side = state.side;
    let tab = tabOf(side, record?.tab?.itemId);
    if (!record?.tab) return null;
    forget(side, record.tab.itemId);
    if (!tab) { tab = record.tab; side.tabs.splice(Math.min(record.index, side.tabs.length), 0, tab); }
    if (record.active || !side.tabs.some((candidate) => candidate.id === side.activeTabId)) side.activeTabId = tab.id;
    if (record.collapsed) side.open = true;
    return tab;
  };
  const setSideOpen = (state, open) => { state.side.open = Boolean(open) && state.side.tabs.length > 0; return state.side.open; };
  const setSideRatio = (state, ratio) => {
    const next = Number(ratio);
    if (Number.isFinite(next)) state.side.ratio = Math.min(RATIO_MAX, Math.max(RATIO_MIN, next));
    return state.side.ratio;
  };
  const sideActive = (state) => state.side.tabs.find((tab) => tab.id === state.side.activeTabId) || null;
  return { ...base, create: () => ({ ...base.create(), side: createSide() }), SIDE_RATIO: [RATIO_MIN, RATIO_MAX],
    syncSide, openSide, selectSide, closeSideTab, reopenSideTab, setSideOpen, setSideRatio, sideActive };
}

/*
 * The layout button's rules (§4.6.2 S2; 口径 2, 8) over the whole workspace, panes and side together:
 * - locate(state, plugin, itemId): where an open view already is, the focused pane first, then the other panes, then the side:
 *   { paneId } or { side: key }, else null. A plugin's view is its page (its plugin tab, or the page a pane shows); an item's
 *   is its tab. Opening what is already open goes there (recall, PFG-24) instead of opening a second copy.
 * - movable(state, paneId, tabId): the tab moveToSide would move (the tab given, else the pane's current one, else the plugin
 *   tab of the page it shows), or null when there is none or it cannot move.
 * - moveToSide(state, paneId, tabId): the tab (or, without one, the page the pane shows) leaves the pane and becomes a tab of
 *   the side, keeping its record and view; the side opens on it. A plugin tab with records in its group does not move (its
 *   records would lose their head). The side's tab is a new document: the plugin's own drafts bring back what it held.
 * - moveToMain(state, sideTabId): a moved tab goes back to the focused pane, as its tab or its plugin's page.
 * - toggleSolo(state, inSide): show only the focused column (`solo`, not `exclusive`, which is a cover): the other panes and
 *   the side step aside with their places kept; again, everything comes back. With the focus in the open right side
 *   (`inSide`), the side is that column: `solo` names it (`paneId` is the side's id) and the main area steps aside, since
 *   the side is a column like the main area's (PFG-22). settleSolo(state, inSide) ends it once the focus goes to another
 *   column, the side is opened (or, for the side's, collapsed), or the pane is gone, and the side opens again if solo had
 *   collapsed it. soloSide(state) says whether the side is the one shown.
 * - mergePanes(state): every pane's tabs join the focused one, which keeps what it shows.
 * - paneNumber(state, paneId): the pane's number as the stage reads, left to right and top to bottom (the layout's leaves in
 *   order), which is not the order panes were opened in once a split runs down.
 */
export function withLayout(base) {
  const paneOf = (state, paneId) => state.panes.find((pane) => pane.id === paneId);
  const paneNumber = (state, paneId) => {
    const order = [];
    const walk = (node) => { if (node?.children) node.children.forEach(walk); else if (node?.paneId) order.push(node.paneId); };
    walk(state.layout.tree);
    return order.indexOf(paneId) + 1;
  };
  const locate = (state, plugin, itemId) => {
    const key = itemId ? plugin + ":item:" + itemId : plugin + ":plugin";
    const has = (pane) => itemId ? pane.tabs.some((tab) => base.tabKey(tab) === key) : pane.viewPlugin === plugin || pane.tabs.some((tab) => tab.kind === "plugin" && tab.plugin === plugin);
    const pane = [base.focused(state), ...state.panes].find((candidate) => candidate && has(candidate));
    if (pane) return { paneId: pane.id };
    return state.side.tabs.some((tab) => tab.itemId === "pane:" + key) ? { side: "pane:" + key } : null;
  };
  const movable = (state, paneId, tabId) => {
    const pane = paneOf(state, paneId);
    const tab = pane && (tabId ? pane.tabs.find((candidate) => candidate.id === tabId)
      : pane.activeTabId ? pane.tabs.find((candidate) => candidate.id === pane.activeTabId)
        : pane.tabs.find((candidate) => candidate.kind === "plugin" && candidate.plugin === pane.viewPlugin));
    return !tab || tab.kind === "system" || tab.kind === "plugin" && base.pluginGroup(pane, tab.plugin).length > 1 ? null : tab;
  };
  const moveToSide = (state, paneId, tabId) => {
    const tab = movable(state, paneId, tabId);
    if (!tab) return null;
    const key = "pane:" + base.tabKey(tab), side = state.side;
    let moved = side.tabs.find((candidate) => candidate.itemId === key);
    if (!moved) {
      moved = { id: tab.id, kind: "pane", plugin: tab.plugin, itemId: key, title: tab.kind === "plugin" ? base.pluginTitle(tab.plugin) : tab.title };
      if (tab.kind === "item") moved.item = tab.itemId;
      if (tab.view !== undefined) moved.view = tab.view;
      side.tabs.unshift(moved);
    }
    if (tab.kind === "plugin") base.closePluginGroup(state, paneId, tab.plugin); else base.closeTab(state, paneId, tab.id);
    side.activeTabId = moved.id;
    side.open = true;
    return moved;
  };
  const moveToMain = (state, sideTabId) => {
    const tab = state.side.tabs.find((candidate) => candidate.id === sideTabId && candidate.kind === "pane");
    if (!tab) return null;
    base.closeSideTab(state, tab.id);
    const shown = tab.item ? base.openItem(state, tab.plugin, tab.item, tab.title) : base.openPlugin(state, tab.plugin);
    if (tab.view !== undefined && shown) base.writeView(state, base.focused(state).id, tab.view, shown.id);
    return shown;
  };
  const soloSide = (state) => state.solo?.paneId === state.side.id;
  const toggleSolo = (state, inSide = false) => {
    const solo = state.solo;
    if (solo) { state.solo = null; if (solo.side) base.setSideOpen(state, true); return false; }
    if (inSide && state.side.open) { state.solo = { paneId: state.side.id, side: false }; return true; }
    if (state.panes.length < 2 && !state.side.open) return false;
    state.solo = { paneId: base.focused(state).id, side: state.side.open };
    state.side.open = false;
    return true;
  };
  const settleSolo = (state, inSide = false) => {
    const solo = state.solo;
    if (!solo || (soloSide(state) ? inSide && state.side.open : solo.paneId === state.focusedPaneId && paneOf(state, solo.paneId) && !state.side.open)) return state;
    state.solo = null;
    if (solo.side) base.setSideOpen(state, true);
    return state;
  };
  const mergePanes = (state) => {
    const into = base.focused(state), keep = { activeTabId: into.activeTabId, viewPlugin: into.viewPlugin };
    state.panes.filter((pane) => pane !== into).forEach((pane) => pane.tabs.map((tab) => tab.id).forEach((tabId) => base.moveTab(state, pane.id, tabId, into.id)));
    state.panes = [into];
    Object.assign(into, keep);
    state.focusedPaneId = into.id;
    state.layout = { direction: "row", sizes: [1] };
    return base.normalizeLayout(state);
  };
  return { ...base, create: () => ({ ...base.create(), solo: null }), locate, movable, moveToSide, moveToMain, toggleSolo, settleSolo, soloSide, mergePanes, paneNumber };
}

/** Saved tabs use only the fields written by this workspace; a plugin's page is its plugin tab, shown through pane.viewPlugin.
 * Only the shape is checked (口径 4): a plugin id is a value, so a tab of a plugin this build and Home no longer know (one
 * uninstalled from Home) is read as it is and drawn removed, never a reason to start the whole layout again. */
export function isCurrentTabWorkspace(value) {
  if (!value || !Array.isArray(value.panes) || !value.panes.length || typeof value.focusedPaneId !== "string") return false;
  if (!Object.keys(value).every(key => ["panes", "layout", "focusedPaneId", "exclusive", "side", "solo"].includes(key))) return false;
  if (value.exclusive !== null && typeof value.exclusive !== "string") return false;
  // 独看 (口径 2) is part of the shape too: a layout saved without it, or with a home tab (口径 3), is started again (口径 4).
  const solo = value.solo;
  if (solo !== null && !(solo && typeof solo.paneId === "string" && typeof solo.side === "boolean" && Object.keys(solo).length === 2)) return false;
  // The right side is part of the shape: a layout saved before it (no `side`) is not read, it is started again (口径 4).
  const side = value.side;
  if (!side || side.id !== "side" || !Array.isArray(side.tabs) || typeof side.open !== "boolean" || !(side.ratio >= .25 && side.ratio <= .55)) return false;
  if (side.activeTabId !== null && typeof side.activeTabId !== "string") return false;
  if (!Object.keys(side).every(key => ["id", "tabs", "activeTabId", "open", "ratio", "closed"].includes(key))) return false;
  if (!Array.isArray(side.closed) || !side.closed.every(key => typeof key === "string")) return false;
  if (new Set(side.tabs.map(tab => tab?.itemId)).size !== side.tabs.length) return false;
  if (!side.tabs.every(tab => tab && typeof tab.id === "string" && typeof tab.itemId === "string" && typeof tab.title === "string" && typeof tab.plugin === "string"
    && (tab.kind === "side" && Object.keys(tab).every(key => ["id", "kind", "plugin", "itemId", "title"].includes(key))
      || tab.kind === "pane" && tab.itemId.startsWith("pane:") && (tab.item === undefined || typeof tab.item === "string") && (tab.view === undefined || typeof tab.view === "string")
        && Object.keys(tab).every(key => ["id", "kind", "plugin", "itemId", "title", "item", "view"].includes(key))))) return false;
  const layout = value.layout;
  if (!layout || !["row", "column"].includes(layout.direction) || !Array.isArray(layout.sizes)) return false;
  if (!Object.keys(layout).every(key => ["direction", "sizes", "tree"].includes(key))) return false;
  return value.panes.every(pane => {
    if (!pane || typeof pane.id !== "string" || !Array.isArray(pane.tabs) || !Array.isArray(pane.groups)) return false;
    const heads = pane.tabs.filter(tab => tab?.kind === "plugin").map(tab => tab.plugin);
    if (new Set(heads).size !== heads.length) return false;
    if (!Object.keys(pane).every(key => ["id", "tabs", "activeTabId", "groups", "viewPlugin"].includes(key))) return false;
    if (pane.activeTabId !== null && typeof pane.activeTabId !== "string") return false;
    if (pane.viewPlugin !== null && (typeof pane.viewPlugin !== "string" || pane.viewPlugin === "")) return false;
    return pane.tabs.every(tab => tab && typeof tab.id === "string" && typeof tab.title === "string"
      && typeof tab.plugin === "string" && tab.plugin !== ""
      && (tab.kind === "item" && typeof tab.itemId === "string" || tab.kind === "plugin" && tab.plugin !== "home")
      && (tab.collapsed === undefined || tab.kind === "plugin" && tab.collapsed === true)
      && (tab.pinned === undefined || typeof tab.pinned === "boolean") && (tab.groupId === undefined || typeof tab.groupId === "string")
      && (tab.view === undefined || typeof tab.view === "string")
      && Object.keys(tab).every(key => ["id", "plugin", "kind", "itemId", "title", "pinned", "groupId", "view", "collapsed"].includes(key)))
      && pane.groups.every(group => group && typeof group.id === "string" && typeof group.title === "string"
        && typeof group.color === "string" && typeof group.collapsed === "boolean"
        && Object.keys(group).every(key => ["id", "title", "color", "collapsed"].includes(key)));
  });
}
