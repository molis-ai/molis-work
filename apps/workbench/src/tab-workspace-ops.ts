// @ts-nocheck
/** Pure tab-workspace rules for additive tabs, user groups, and split panes. Stringified into the browser client; keep it type-annotation-free. */
export function createTabWorkspaceOps(titles) {
  const GROUP_COLORS = ["blue", "pink", "green", "purple", "yellow", "cyan", "red", "grey"];
  const uid = () => "t" + Math.random().toString(36).slice(2, 10);
  const homeTab = () => ({ id: uid(), plugin: "home", kind: "home", title: "项目首页" });
  const itemTab = (plugin, itemId, title) => ({ id: uid(), plugin, kind: "item", itemId, title });
  const pluginViewKey = (plugin) => "plugin:" + plugin;
  const tabKey = (tab) => tab.kind === "system" ? "system:" + tab.owner + ":" + tab.itemId : tab.kind === "item" ? tab.plugin + ":item:" + tab.itemId : tab.plugin + ":" + tab.kind;
  // Plugins name their tabs with their Manifest views' titles (the page passes `pluginTabTitles`); only the Host's own surfaces are named here.
  const pluginTitle = (plugin) => (titles && titles[plugin]) || ({ home: "项目首页", characters: "Characters" }[plugin] || plugin);
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
  const ensureHome = (state) => {
    if (countTabs(state) > 0) return normalizeLayout(state);
    if ((state.panes || []).some((pane) => pane.viewPlugin)) return normalizeLayout(state);
    const pane = focused(state) || state.panes[0];
    if (!pane) {
      const next = homeTab();
      return normalizeLayout({
        panes: [{ id: uid(), tabs: [next], activeTabId: next.id, groups: [], viewPlugin: null }],
        layout: { direction: "row", sizes: [1] },
        focusedPaneId: "",
        exclusive: state.exclusive ?? null,
      });
    }
    const next = homeTab();
    pane.tabs = [next];
    pane.activeTabId = next.id;
    pane.groups = [];
    pane.viewPlugin = null;
    return normalizeLayout(state);
  };
  const create = () => {
    const tab = homeTab();
    const paneId = uid();
    return {
      panes: [{ id: paneId, tabs: [tab], activeTabId: tab.id, groups: [], viewPlugin: null }],
      layout: { direction: "row", sizes: [1] },
      focusedPaneId: paneId,
      exclusive: null,
    };
  };
  const activateInPane = (pane, tab) => {
    pane.activeTabId = tab.id;
    if (tab.kind === "home") pane.viewPlugin = null;
    else if (tab.kind === "item") pane.viewPlugin = tab.plugin;
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
    for (const pane of state.panes) {
      if (!pane.viewPlugin) continue;
      pane.viewPlugin = null;
      const home = pane.tabs.find((tab) => tab.kind === "home");
      if (home) pane.activeTabId = home.id;
      else {
        const next = homeTab();
        pane.tabs = [next, ...pane.tabs];
        pane.activeTabId = next.id;
      }
    }
    return ensureHome(state);
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
  const openPlugin = (state, plugin) => {
    state.exclusive = null;
    const pane = focused(state);
    if (plugin === "home") {
      pane.viewPlugin = null;
      return openInPane(state, pane, homeTab());
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
      const neighbor = pane.tabs[index] || pane.tabs[index - 1] || null;
      if (neighbor && neighbor.kind !== "home") pane.activeTabId = neighbor.id;
      else if (pane.viewPlugin) pane.activeTabId = null;
      else pane.activeTabId = neighbor?.id || null;
    }
    if (!pane.tabs.length && state.panes.length > 1) return closePane(state, paneId);
    return ensureHome(state);
  };
  const closePane = (state, paneId) => {
    if (state.panes.length === 1) {
      const pane = state.panes[0];
      pane.tabs = [];
      pane.activeTabId = null;
      pane.groups = [];
      pane.viewPlugin = null;
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
    if (tab.kind === "system") copy = false;
    const next = copy ? { ...tab, id: uid() } : tab;
    if (copy || from !== to) delete next.groupId;
    if (!copy) {
      from.tabs = from.tabs.filter((item) => item.id !== tabId);
      if (from.activeTabId === tabId) {
        const nextActive = from.tabs.find((item) => item.kind !== "home") || (from.viewPlugin ? null : from.tabs[0]);
        from.activeTabId = nextActive?.id || null;
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
    return ensureHome(state);
  };
  const splitPane = (state, paneId, edge, mode, sourcePaneId = paneId, sourceTabId = null) => {
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const source = state.panes.find((candidate) => candidate.id === sourcePaneId);
    const active = source?.tabs.find((tab) => tab.id === (sourceTabId || source.activeTabId));
    if (!pane || (!active && !source?.viewPlugin)) return state;
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
      return ensureHome(state);
    }
    const next = { ...active, id: mode === "move" ? active.id : uid() };
    delete next.groupId;
    place({ id: uid(), tabs: [next], activeTabId: next.id, groups: [], viewPlugin: source.viewPlugin || (active.plugin !== "home" ? active.plugin : null) });
    if (mode === "move") {
      source.tabs = source.tabs.filter((tab) => tab.id !== active.id);
      if (source.activeTabId === active.id) source.activeTabId = source.tabs[0]?.id || null;
      pruneEmptyGroups(source);
      if (!source.tabs.length && !source.viewPlugin) closePane(state, source.id);
    }
    return ensureHome(state);
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
    ensureHome,
    focused,
    activeTab,
    shownPlugin,
    countTabs,
  };
}

/* Plugin tabs and their automatic groups, laid over the rules above (specs/plugin-tab-groups). */

/** A tab that belongs to its plugin's automatic group: a plugin or item tab that is neither pinned nor in a user group. */
export function isLoosePluginTab(tab) {
  return Boolean(tab) && (tab.kind === "plugin" || tab.kind === "item") && tab.plugin !== "home" && !tab.pinned && !tab.groupId;
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
    if (tab.kind === "item" && loose(tab) && !heads.has(tab.plugin)) { pane.tabs.splice(index, 0, newPluginTab(tab.plugin)); index += 1; }
  }
  if (pane.viewPlugin && pane.viewPlugin !== "home" && !heads.has(pane.viewPlugin)) pane.tabs.push(newPluginTab(pane.viewPlugin));
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
    "addTabToGroup", "removeTabFromGroup", "ungroup", "normalizeLayout", "ensureHome"]) ops[name] = settled(name);
  ops.create = () => settle(base.create());
  ops.openPlugin = (state, plugin) => {
    const shown = base.openPlugin(state, plugin);
    settle(state);
    return plugin === "home" ? shown : base.focused(state).tabs.find((tab) => tab.kind === "plugin" && tab.plugin === plugin);
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
    base.ensureHome(state);
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
    base.ensureHome(state);
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
    base.splitPane(state, paneId, edge, mode, sourcePaneId, sourceTabId);
    if (group) relocate(state, from, base.focused(state), group.moving, group.followers);
    return settle(state);
  };
  ops.togglePluginGroup = (state, paneId, plugin) => {
    const head = paneOf(state, paneId)?.tabs.find((tab) => tab.kind === "plugin" && tab.plugin === plugin);
    if (head) { if (head.collapsed) delete head.collapsed; else head.collapsed = true; }
    return state;
  };
  return ops;
}

/** Saved tabs use only the fields written by this workspace; a plugin's page is its plugin tab, shown through pane.viewPlugin. */
export function isCurrentTabWorkspace(value, plugins) {
  if (!value || !Array.isArray(value.panes) || !value.panes.length || typeof value.focusedPaneId !== "string") return false;
  if (!Object.keys(value).every(key => ["panes", "layout", "focusedPaneId", "exclusive"].includes(key))) return false;
  if (value.exclusive !== null && typeof value.exclusive !== "string") return false;
  const layout = value.layout;
  if (!layout || !["row", "column"].includes(layout.direction) || !Array.isArray(layout.sizes)) return false;
  if (!Object.keys(layout).every(key => ["direction", "sizes", "tree"].includes(key))) return false;
  return value.panes.every(pane => {
    if (!pane || typeof pane.id !== "string" || !Array.isArray(pane.tabs) || !Array.isArray(pane.groups)) return false;
    const heads = pane.tabs.filter(tab => tab?.kind === "plugin").map(tab => tab.plugin);
    if (new Set(heads).size !== heads.length) return false;
    if (!Object.keys(pane).every(key => ["id", "tabs", "activeTabId", "groups", "viewPlugin"].includes(key))) return false;
    if (pane.activeTabId !== null && typeof pane.activeTabId !== "string") return false;
    if (pane.viewPlugin !== null && (typeof pane.viewPlugin !== "string" || plugins && !Object.hasOwn(plugins, pane.viewPlugin))) return false;
    return pane.tabs.every(tab => tab && typeof tab.id === "string" && typeof tab.title === "string"
      && typeof tab.plugin === "string" && (!plugins || Object.hasOwn(plugins, tab.plugin))
      && (tab.kind === "home" && tab.plugin === "home" || tab.kind === "item" && typeof tab.itemId === "string" || tab.kind === "plugin" && tab.plugin !== "home")
      && (tab.collapsed === undefined || tab.kind === "plugin" && tab.collapsed === true)
      && (tab.pinned === undefined || typeof tab.pinned === "boolean") && (tab.groupId === undefined || typeof tab.groupId === "string")
      && (tab.goalView === undefined || ["frame", "work"].includes(tab.goalView)) && (tab.feedTask == null || typeof tab.feedTask === "string")
      && Object.keys(tab).every(key => ["id", "plugin", "kind", "itemId", "title", "pinned", "groupId", "goalView", "feedTask", "collapsed"].includes(key)))
      && pane.groups.every(group => group && typeof group.id === "string" && typeof group.title === "string"
        && typeof group.color === "string" && typeof group.collapsed === "boolean"
        && Object.keys(group).every(key => ["id", "title", "color", "collapsed"].includes(key)));
  });
}
