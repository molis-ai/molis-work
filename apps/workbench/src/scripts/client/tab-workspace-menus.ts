/** Keep a popover inside the viewport. Tall menus scroll instead of clipping past the top.
 *  Stringified into the browser factory. Type annotations are erased before that string is sent. */
export function placeLayoutMenu(
  anchor: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
) {
  const availableHeight = Math.max(0, viewport.height - margin * 2);
  const maxHeight = menu.height > availableHeight ? availableHeight : null;
  const height = maxHeight == null ? menu.height : maxHeight;
  const width = menu.width;
  let top = anchor.bottom + 6;
  if (top + height > viewport.height - margin) {
    const above = anchor.top - 6 - height;
    top = above >= margin ? above : margin;
  }
  if (top < margin) top = margin;
  let left = anchor.right - width;
  const maxLeft = viewport.width - width - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;
  return { top, left, maxHeight };
}

/** The menus a tab, a tab group and the layout button open. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_MENUS_PART = `  // One item of the tab menu, for a tab's menu and a group's alike; a tab's puts focus back on the active tab.
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
  };`;
