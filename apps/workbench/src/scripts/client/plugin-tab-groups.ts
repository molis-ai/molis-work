/**
 * The group colour of the workbench's own surfaces on the tab strip, which no plugin declares. A plugin's colour is the `hue` its
 * Manifest declares, read from the page's plugin directory (`script[data-plugin-directory]`) and handed in as `hues`; the platform
 * does not keep a list of plugins (W5-02 PR-D, PG-075). If that directory script is absent, plugin groups use the same
 * id-based spare hues as plugins that declare no hue.
 */
const SURFACE_HUES = { home: "gray", characters: "purple", workspace: "slate", settings: "steel" };
/** Hues a plugin outside the catalog (one built in the studio) may get, picked by its id so it keeps it. */
const SPARE_HUES = ["blue", "green", "orange", "purple", "cyan", "pink", "yellow", "mint", "red", "indigo"];

/**
 * Plugin groups on the tab strip: drawing a plugin's automatic group, the plugin tab as the current place, closing a
 * group with a way back, and ⌘/Ctrl- or middle-click on a record opening it as a tab in its group.
 */
export const PLUGIN_TAB_GROUPS_FACTORY = String.raw`({ getState, ops, apply, persist, L, rows, embedded, notify, editable, appendTab, hues = {} }) => {
  const HUES = { ...${JSON.stringify(SURFACE_HUES)}, ...hues };
  const SPARE = ${JSON.stringify(SPARE_HUES)};
  const hueOf = (plugin) => HUES[plugin] || SPARE[[...String(plugin)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % SPARE.length];
  const UNDO_MS = 6000;
  const closed = [];
  let undoTimer = 0;
  /** The plugin tab is the current tab while its pane shows that plugin's own page. */
  const shows = (pane, tab) => tab.kind === "plugin" && !pane.activeTabId && pane.viewPlugin === tab.plugin && !getState().exclusive;
  /** Draw the automatic group that starts at tabs[index]; answers the index after it, or -1 when no group starts there. */
  const render = (parent, pane, index) => {
    const first = pane.tabs[index];
    if (!ops.isLoose(first)) return -1;
    const plugin = first.plugin;
    let end = index;
    while (end < pane.tabs.length && ops.isLoose(pane.tabs[end]) && pane.tabs[end].plugin === plugin) end += 1;
    const members = pane.tabs.slice(index, end);
    const head = members.find((tab) => tab.kind === "plugin");
    if (!head) return -1;
    const wrap = document.createElement("div");
    wrap.className = "tab-group tab-plugin-group";
    wrap.dataset.pluginGroup = plugin;
    wrap.style.setProperty("--group-color", "var(--hue-" + hueOf(plugin) + ")");
    wrap.style.setProperty("--group-fill", "var(--hue-" + hueOf(plugin) + "-fill)");
    wrap.dataset.active = String(members.some((tab) => tab.id === pane.activeTabId || shows(pane, tab)));
    if (head?.collapsed) wrap.dataset.collapsed = "true";
    const pages = document.createElement("div"); pages.className = "tab-group-pages";
    members.forEach((tab) => appendTab(pages, pane, tab));
    const items = members.length - (head ? 1 : 0);
    const trigger = pages.querySelector('[data-tab-kind="plugin"] .tab-item-trigger');
    // A plugin tab with tabs behind it says whether they are shown, and how many, as a person's group label does.
    if (trigger && items) {
      trigger.setAttribute("aria-expanded", String(!head.collapsed));
      trigger.setAttribute("aria-label", trigger.getAttribute("aria-label") + " · " + L("组里还有 {n} 个标签", { n: items }));
    }
    if (head?.collapsed && items) {
      const count = document.createElement("span"); count.className = "tab-group-count"; count.textContent = String(items);
      count.title = L("组里还有 {n} 个标签", { n: items }); count.setAttribute("aria-hidden", "true");
      pages.querySelector('[data-tab-kind="plugin"]')?.append(count);
    }
    wrap.append(pages); parent.append(wrap);
    return end;
  };
  const undoLabel = (record) => L("撤销关闭 {plugin}", { plugin: L(ops.pluginTitle(record.plugin)) });
  // Screen readers hear that a group closed and how to get it back; the chip itself appears with the next render.
  const live = document.createElement("div");
  live.setAttribute("role", "status"); live.className = "mw-sr-only";
  document.body.append(live);
  /** Close a plugin's group and keep a way back: the strip offers it for a few seconds, ⌘⇧T / Ctrl+Shift+T after that. */
  const close = (paneId, plugin) => {
    const record = ops.closePluginGroup(getState(), paneId, plugin);
    if (!record) return record;
    closed.push({ record, until: Date.now() + UNDO_MS });
    live.textContent = L("已关闭 {plugin} 标签组", { plugin: L(ops.pluginTitle(plugin)) }) + " · " + undoLabel(record);
    if (closed.length > 10) closed.shift();
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => apply(), UNDO_MS + 20);
    return record;
  };
  const reopen = () => {
    const last = closed.pop();
    if (!last) return false;
    ops.reopenPluginGroup(getState(), last.record);
    apply(); persist();
    return true;
  };
  /** The way back after closing a group, at the end of the strip it was closed in. */
  const undoChip = (pane) => {
    const last = closed.at(-1);
    if (!last || last.until < Date.now() || last.record.paneId !== pane.id) return null;
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "tab-undo-chip"; chip.dataset.tabUndo = "";
    chip.style.setProperty("--group-color", "var(--hue-" + hueOf(last.record.plugin) + ")");
    chip.innerHTML = '<svg aria-hidden="true"><use href="#icon-undo"></use></svg><span></span>';
    chip.querySelector("span").textContent = undoLabel(last.record);
    chip.setAttribute("aria-label", undoLabel(last.record));
    chip.title = undoLabel(last.record) + (/Mac|iPhone|iPad/.test(navigator.platform) ? " (⌘⇧T)" : " (Ctrl+Shift+T)");
    chip.addEventListener("click", (event) => { event.stopPropagation(); reopen(); });
    return chip;
  };
  /** The plugin tab's own menu entries. */
  const menu = (paneId, tab, add) => {
    if (tab.kind !== "plugin") return false;
    const pane = getState().panes.find((candidate) => candidate.id === paneId);
    const items = pane ? ops.pluginGroup(pane, tab.plugin).length - 1 : 0;
    if (items > 0) add(L(tab.collapsed ? "展开标签组" : "收起标签组"), "chevron-down", "toggle-plugin-group", () => ops.togglePluginGroup(getState(), paneId, tab.plugin));
    return true;
  };
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "t" || !event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey) || editable(event.target)) return;
    if (reopen()) event.preventDefault();
  });
  /** Open a record as a tab in its plugin's group and keep the pane where it is; a split pane asks the workbench to. */
  const openBehind = (plugin, itemId, title) => {
    if (embedded) { notify("workbench-pane-open", { plugin, itemId, title, background: true }); return; }
    const state = getState(), pane = ops.focused(state);
    const before = { activeTabId: pane.activeTabId, viewPlugin: pane.viewPlugin };
    ops.openItem(state, plugin, itemId, title);
    pane.activeTabId = before.activeTabId; pane.viewPlugin = before.viewPlugin;
    apply(); persist();
  };
  /* ⌘/Ctrl- or middle-click on a record row (each plugin's catalog recordRow, else its searchRow) opens it behind;
     a list that picks several (aria-multiselectable) keeps ⌘/Ctrl-click. */
  const openInBackground = (event) => {
    if ((event.type === "click" && !(event.metaKey || event.ctrlKey)) || (event.type === "auxclick" && event.button !== 1)) return;
    const target = event.target?.nodeType === 1 ? event.target : null;
    if (!target || target.closest("a[href], [data-tab-strip], [data-titlebar-tabs]")) return;
    // Records belong to the plugin whose surface or directory section lists them, or that marks a container of its own.
    const scope = target.closest("[data-record-owner], [data-work-surface], [data-plugin-section]");
    const plugin = scope ? scope.dataset.recordOwner || ops.pluginOfSurface(scope.dataset.workSurface || scope.dataset.pluginSection) : "";
    const spec = rows.find(([id]) => id === plugin);
    const row = spec ? target.closest(spec[1]) : null;
    const itemId = row && scope.contains(row) ? row.dataset[spec[2]] : "";
    if (!itemId || event.type === "click" && scope.contains(row.closest("[aria-multiselectable=true]"))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    openBehind(plugin, itemId, row.getAttribute("data-frame-asset-title") || row.querySelector("strong")?.textContent?.trim() || itemId);
  };
  window.addEventListener("click", openInBackground, true);
  window.addEventListener("auxclick", openInBackground, true);
  return { shows, render, close, reopen, undoChip, menu, hueOf, openBehind };
}`;
