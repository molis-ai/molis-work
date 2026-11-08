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


/**
 * The menus a tab and a tab group open (right click, ⇧F10), ＋ and the titlebar's one layout button (specs/product-flow-governance
 * §4.6.2 S2; docs/design/workbench-navigation). Their rows are the component board's menu rows (mw-menu__item, mw-menu__group),
 * and arrows move through them by the shared roving focus. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place.
 */
export const TAB_WORKSPACE_MENUS_PART = `  const svg = (name) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  // One row: glyph, label, keys at the end; \`checked\` makes it a checkbox row, \`data\` names it for the page and its tests.
  const menuRow = (label, icon, run, { key, keys, checked, disabled, data } = {}) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "mw-menu__item"; button.disabled = Boolean(disabled);
    button.setAttribute("role", checked === undefined ? "menuitem" : "menuitemcheckbox");
    if (checked !== undefined) button.setAttribute("aria-checked", String(checked));
    if (key) button.dataset.tabMenuAction = key;
    Object.assign(button.dataset, data);
    button.innerHTML = (checked === undefined ? (icon ? svg(icon) : "") : '<span class="mw-menu__check" aria-hidden="true">' + (checked ? svg("check") : "") + "</span>")
      + '<span data-slot="menu-item-label"></span>' + (keys ? '<span class="mw-menu__shortcut"></span>' : "");
    button.querySelector("[data-slot]").textContent = label;
    if (keys) button.lastChild.textContent = keys;
    button.addEventListener("click", run);
    return button;
  };
  const menuGroup = (label, rows) => {
    const group = document.createElement("div");
    group.className = "mw-menu__group"; group.setAttribute("role", "group");
    if (label) {
      const head = document.createElement("div");
      head.className = "mw-menu__label"; head.setAttribute("aria-hidden", "true"); head.textContent = label;
      group.setAttribute("aria-label", label); group.append(head);
    }
    group.append(...rows.filter(Boolean));
    return group;
  };
  const placeLayoutMenu = ${placeLayoutMenu.toString()};
  // A menu opens by what opened it and stays inside the window; \`start\` lines it up with the anchor's left edge, else its right.
  // A capped menu scrolls, and the shared roving focus moves without scrolling: keep the focused item in view. Added on each
  // placing, which adds the one function once (the tab menu is made after this part).
  const keepInView = (event) => event.target.scrollIntoView({ block: "nearest" });
  const placeMenu = (menu, anchor, start) => {
    menu.addEventListener("focusin", keepInView);
    const rect = anchor.getBoundingClientRect();
    menu.style.maxHeight = ""; menu.showPopover();
    const placed = placeLayoutMenu(start ? { top: rect.top, bottom: rect.bottom, right: rect.left + menu.offsetWidth } : rect, { width: menu.offsetWidth, height: menu.offsetHeight }, { width: innerWidth, height: innerHeight });
    if (placed.maxHeight != null) menu.style.maxHeight = placed.maxHeight + "px";
    menu.style.top = placed.top + "px"; menu.style.left = placed.left + "px";
  };
  const keyName = (mac, other) => MAC ? mac : other;
  // One tab's menu (or a group's) at a time, and none of them under another.
  const onlyMenu = (menu) => [tabMenu, plusMenu, allTabsMenu, layoutMenu].forEach((other) => { if (other !== menu && other.matches(":popover-open")) other.hidePopover(); });
  // One item of the tab menu, for a tab's menu and a group's alike; a tab's puts focus back on the active tab unless the item
  // took it somewhere else (it answers false).
  const menuItem = (paneId, refocus) => (label, icon, key, action, disabled) => tabMenu.append(menuRow(label, icon, () => {
    tabMenu.hidePopover(); state.focusedPaneId = paneId;
    const stay = action(); apply(); persist();
    if (refocus && stay !== false) focusActiveTab();
  }, { key, disabled }));
  const openTabMenu = (paneId, anchor, tabId) => {
    const pane = paneById(paneId), tab = pane?.tabs.find(candidate => candidate.id === tabId);
    if (!tab) return;
    tabMenuAnchor = anchor; tabMenu.replaceChildren();
    tabMenu.setAttribute("aria-label", L("标签操作"));
    const add = menuItem(paneId, true);
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
    // The tab's own moves (§4.6.2 S2): to the right side, or its view again in a pane beside this one.
    add(L("移到右侧"), "arrow", "to-side", () => { moveToSide(paneId, tab.id); return false; }, !ops.movable(state, paneId, tab.id));
    add(L("在旁边并排看"), "columns", "beside", () => ops.splitPane(state, paneId, "right", "copy", paneId, tab.id), narrow() || tab.kind === "system");
    add(L(tab.kind === "plugin" ? "关闭标签组" : "关闭标签"), "x", "close", () => closeTabBack(paneId, tab.id));
    onlyMenu(tabMenu); placeMenu(tabMenu, anchor, true);
    tabMenu.querySelector("button")?.focus();
  };
  // The right side's tabs open this same menu (07-S2); the side gives the rows (side-panel.ts), each named data-side-menu.
  const openSideTabMenu = (anchor, entries) => {
    tabMenuAnchor = anchor; tabMenu.replaceChildren();
    tabMenu.setAttribute("aria-label", L("标签操作"));
    const heading = document.createElement("strong"); heading.textContent = heading.title = anchor.querySelector(".tab-item-name")?.textContent || ""; tabMenu.append(heading);
    entries.forEach(({ key, icon, label, run }) => tabMenu.append(menuRow(label, icon, () => { tabMenu.hidePopover(); run(); }, { data: { sideMenu: key } })));
    onlyMenu(tabMenu); placeMenu(tabMenu, anchor, false);
    tabMenu.querySelector("button")?.focus();
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
    onlyMenu(tabMenu); placeMenu(tabMenu, anchor, true);
    name.focus();
  };
  /* ＋ only opens (§4.6.2 S2, 口径 8; PFG-23): the plugins of the Host's directory, never read from the page's buttons, the
     person's own after them, then what was just closed. One already open says where it is, and choosing it goes there (recall).
     ↵ opens in this pane, ⌥↵ or the row's end button beside it; typing narrows the list; Esc puts focus back on ＋. */
  const plusMenu = document.createElement("div");
  plusMenu.className = "workspace-layout-menu mw-menu tab-menu"; plusMenu.setAttribute("popover", "manual"); plusMenu.dataset.workspaceOpenMenu = "";
  document.body.append(plusMenu);
  let plusAnchor = null;
  const closePlus = (refocus) => {
    if (!plusMenu.matches(":popover-open")) return;
    plusMenu.hidePopover(); plusAnchor?.setAttribute("aria-expanded", "false");
    if (refocus) plusAnchor?.focus({ preventScroll: true });
  };
  ["pointerdown", "focusin"].forEach((type) => document.addEventListener(type, (event) => { if (!plusMenu.contains(event.target) && !plusAnchor?.contains(event.target)) closePlus(false); }));
  const openPlusMenu = (paneId, anchor) => {
    if (plusMenu.matches(":popover-open")) { closePlus(true); return; }
    plusAnchor = anchor; anchor.setAttribute("aria-expanded", "true");
    const go = (run) => () => { closePlus(false); state.focusedPaneId = paneId; column = "main"; run(); };
    const where = (plugin) => {
      const at = Object.hasOwn(SIDE_OPENED, plugin) ? state.side.tabs.some((tab) => tab.itemId === SIDE_OPENED[plugin]) && { side: true } : ops.locate(state, plugin);
      return !at ? "" : at.side ? L("在右侧") : at.paneId === paneId ? L("在这一栏") : L("在第 {n} 栏", { n: ops.paneNumber(state, at.paneId) });
    };
    const row = ({ id }) => {
      const name = L(ops.pluginTitle(id)), place = where(id), wrap = document.createElement("div"), beside = document.createElement("button");
      const item = menuRow(name, tabIcon(id), go(() => openPlugin(id)), { key: "open-" + id, data: { plusOpen: id } });
      item.style.setProperty("--group-color", "var(--hue-" + pluginGroups.hueOf(id) + ")");
      item.setAttribute("aria-keyshortcuts", "Alt+Enter");
      // A plugin that did not start keeps its row, with the amber point it carries wherever it is named (07-1 S4b).
      if (failedPlugin(id)) { const dot = document.createElement("span"); dot.className = "nav-warn-dot"; dot.setAttribute("role", "img"); dot.setAttribute("aria-label", L("没能启动")); item.querySelector("[data-slot]").after(dot); }
      if (place) { const mark = document.createElement("span"); mark.className = "tab-menu-where"; mark.textContent = place; item.append(mark); }
      // The pointer's way to "beside"; the keyboard's is ⌥↵ on the row, so this button is out of the tab order and the tree.
      beside.type = "button"; beside.className = "mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm tab-menu-beside"; beside.tabIndex = -1;
      beside.setAttribute("aria-hidden", "true"); beside.title = L("在旁边打开") + " · " + name + " (" + keyName("⌥↵", "Alt+Enter") + ")"; beside.innerHTML = svg("columns");
      beside.addEventListener("click", go(() => openBeside(id)));
      wrap.className = "tab-menu-row"; wrap.append(item, beside);
      return wrap;
    };
    const offered = directory.filter((entry) => Number.isInteger(entry.order)).sort((a, b) => a.order - b.order);
    const recent = pluginGroups.recent().map((entry, index) => menuRow(entry.record.tab ? entry.record.title : L(ops.pluginTitle(entry.record.plugin)), tabIcon(entry.record.plugin),
      go(() => pluginGroups.reopen(entry)), { key: "reopen", keys: index ? "" : keyName("⌘⇧T", "Ctrl+Shift+T") }));
    const find = document.createElement("label"), list = document.createElement("div"), foot = document.createElement("p");
    find.className = "mw-input-group tab-menu-find"; find.innerHTML = svg("search") + '<input class="mw-input" type="search" autocomplete="off">';
    const input = find.lastChild;
    input.placeholder = L("找插件，或刚关掉的标签"); input.setAttribute("aria-label", input.placeholder);
    list.setAttribute("role", "menu"); list.setAttribute("aria-label", L("打开"));
    list.append(menuGroup(L("这个项目的插件"), offered.filter((entry) => !entry.personal).map(row)), menuGroup(L("个人 · 所有项目共用"), offered.filter((entry) => entry.personal).map(row)), menuGroup(L("刚关掉的"), recent));
    foot.className = "tab-menu-foot"; foot.setAttribute("aria-hidden", "true"); foot.textContent = L("↵ 在这一栏打开　⌥↵ 在旁边打开").replace("⌥", keyName("⌥", "Alt+"));
    const filter = () => {
      const words = input.value.trim().toLowerCase();
      list.querySelectorAll("[role^=menuitem]").forEach((item) => { (item.closest(".tab-menu-row") || item).hidden = Boolean(words) && !item.querySelector("[data-slot]").textContent.toLowerCase().includes(words); });
      list.querySelectorAll(".mw-menu__group").forEach((group) => { group.hidden = ![...group.querySelectorAll("[role^=menuitem]")].some((item) => !item.closest("[hidden]")); });
    };
    input.addEventListener("input", filter);
    plusMenu.replaceChildren(find, list, foot); filter();
    onlyMenu(plusMenu); placeMenu(plusMenu, anchor, true);
    input.focus();
  };
  plusMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePlus(true); return; }
    const field = event.target.matches("input"), items = [...plusMenu.querySelectorAll("[role^=menuitem]")].filter((item) => !item.closest("[hidden]"));
    if (field && event.key === "ArrowDown") { event.preventDefault(); items[0]?.focus(); return; }
    if (event.key !== "Enter" || !field && !event.altKey) return;
    const item = field ? items[0] : event.target.closest("[role^=menuitem]");
    if (!item) return;
    event.preventDefault();
    if (event.altKey && item.dataset.plusOpen) item.nextElementSibling.click(); else item.click();
  });
  /* 全部标签 (07-1 S3, scheme A; PFG-26): every tab of the pane in sections by group, each with how many it holds, the current one
     marked; choosing one goes to it as its own tab would. It reaches the tabs scrolled out of the strip, and on a phone every tab
     but the current one (pinned ones too). A popover of its own like ＋: typing narrows it, Esc gives the focus back. */
  const allTabsMenu = document.createElement("div");
  allTabsMenu.className = "workspace-layout-menu mw-menu tab-menu"; allTabsMenu.setAttribute("popover", "manual"); allTabsMenu.dataset.workspaceAllTabs = "";
  document.body.append(allTabsMenu);
  // The strip may draw itself again while the list is open; its button is found again by the pane it lists.
  const allTabsAnchor = () => {
    const buttons = [...document.querySelectorAll('[data-tab-all="' + CSS.escape(allTabsMenu.dataset.forPane || "") + '"]')];
    return buttons.find((button) => button.getClientRects().length) || buttons[0];
  };
  // Its button says whether it is open as it opens and closes (the toggle event comes a task later); another menu opening closes it too.
  allTabsMenu.addEventListener("toggle", (event) => allTabsAnchor()?.setAttribute("aria-expanded", String(event.newState === "open")));
  const closeAllTabs = (refocus) => {
    if (!allTabsMenu.matches(":popover-open")) return;
    allTabsMenu.hidePopover(); allTabsAnchor()?.setAttribute("aria-expanded", "false");
    if (refocus) allTabsAnchor()?.focus({ preventScroll: true });
  };
  // Manual, so pressing 全部标签 again closes it rather than light-dismissing and reopening; a press or focus elsewhere closes it.
  ["pointerdown", "focusin"].forEach((type) => document.addEventListener(type, (event) => {
    if (allTabsMenu.matches(":popover-open") && !allTabsMenu.contains(event.target) && !allTabsAnchor()?.contains(event.target)) closeAllTabs(false);
  }));
  allTabsMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeAllTabs(true); return; }
    const items = [...allTabsMenu.querySelectorAll("[role=menuitem]")].filter((item) => !item.closest("[hidden]"));
    if (!event.target.matches("input")) return;
    if (event.key === "ArrowDown") { event.preventDefault(); items[0]?.focus(); }
    if (event.key === "Enter" && items[0]) { event.preventDefault(); items[0].click(); }
  });
  const openAllTabs = (paneId, anchor) => {
    const pane = paneById(paneId);
    if (!pane || allTabsMenu.matches(":popover-open")) { closeAllTabs(true); return; }
    allTabsMenu.dataset.forPane = paneId;
    const go = (tab) => () => {
      closeAllTabs(false);
      // The strip's own tab does the going, so a plugin's tab, a record and a system tab each behave as when pressed there.
      const own = (allTabsAnchor() || anchor).closest(".tab-strip")?.querySelector('[data-tab-id="' + CSS.escape(tab.id) + '"] .tab-item-trigger');
      if (own) own.click(); else { activate(paneId, tab.id); focusActiveTab(); }
    };
    const sections = [];
    pane.tabs.forEach((tab) => {
      const key = tab.pinned ? "pinned" : tab.groupId ? "group:" + tab.groupId : "plugin:" + (tab.plugin || tab.id);
      let section = sections.at(-1);
      if (section?.key !== key) {
        const group = !tab.pinned && tab.groupId ? (pane.groups || []).find((candidate) => candidate.id === tab.groupId) : null;
        section = { key, rows: [],
          name: tab.pinned ? L("已固定") : group ? group.title || L("分组") : tab.kind === "system" ? "" : L(ops.pluginTitle(tab.plugin)),
          color: tab.pinned || tab.kind === "system" ? "" : group ? GROUP_COLOR[group.color] || GROUP_COLOR.grey : "var(--hue-" + pluginGroups.hueOf(tab.plugin) + ")" };
        sections.push(section);
      }
      const row = menuRow(tabLabel(tab), tab.kind === "plugin" ? tabIcon(tab.plugin) : "", go(tab), { data: { allTab: tab.id } });
      if (tab.id === pane.activeTabId || pluginGroups.shows(pane, tab)) row.setAttribute("aria-current", "true");
      if (section.color) row.style.setProperty("--group-color", section.color);
      // The list carries the strip's marks: struck through when the record is gone, the amber point when its plugin did not start.
      // Both are said in the row's name as well, as the strip's tab says them.
      const notStarted = tab.kind !== "system" && failedPlugin(tab.plugin), recordGone = goneRecord(tab);
      if (recordGone) row.dataset.tabState = "gone";
      if (notStarted) row.insertAdjacentHTML("beforeend", '<span class="nav-warn-dot" aria-hidden="true"></span>');
      if (recordGone || notStarted) row.setAttribute("aria-label", tabLabel(tab) + " · " + (recordGone ? L("这一条已经不在了") : L("没能启动")));
      section.rows.push(row);
      section.lone = section.rows.length === 1 && tab.kind === "plugin";
    });
    // A plugin open with nothing behind it is a section of its own name and one row; such plugins share one unnamed section instead.
    for (let index = sections.length - 1; index > 0; index -= 1) {
      if (sections[index].lone && sections[index - 1].lone) { sections[index - 1].rows.push(...sections[index].rows); sections.splice(index, 1); }
    }
    sections.forEach((section) => { if (section.lone) { section.name = ""; section.color = ""; } });
    const find = document.createElement("label"), list = document.createElement("div");
    find.className = "mw-input-group tab-menu-find"; find.innerHTML = svg("search") + '<input class="mw-input" type="search" autocomplete="off">';
    const input = find.lastChild;
    input.placeholder = L("找标签"); input.setAttribute("aria-label", input.placeholder);
    list.setAttribute("role", "menu"); list.setAttribute("aria-label", L("全部标签"));
    list.append(...sections.map(({ name, color, rows }) => {
      const count = rows.length === 1 ? L("1 张") : L("{n} 张", { n: rows.length });
      const group = menuGroup(name ? name + " · " + count : "", rows), head = group.querySelector(".mw-menu__label");
      if (color && head) { const dot = document.createElement("span"); dot.className = "tab-menu-dot"; dot.setAttribute("aria-hidden", "true"); head.prepend(dot); group.style.setProperty("--group-color", color); }
      return group;
    }));
    input.addEventListener("input", () => {
      const words = input.value.trim().toLowerCase();
      list.querySelectorAll("[role=menuitem]").forEach((item) => { item.hidden = Boolean(words) && !item.querySelector("[data-slot]").textContent.toLowerCase().includes(words); });
      list.querySelectorAll(".mw-menu__group").forEach((group) => { group.hidden = !group.querySelector("[role=menuitem]:not([hidden])"); });
    });
    allTabsMenu.replaceChildren(find, list);
    onlyMenu(allTabsMenu); placeMenu(allTabsMenu, anchor, false);
    anchor.setAttribute("aria-expanded", "true");
    input.focus();
  };
  /* The titlebar's one layout button (§4.6.2 S2, 口径 6): its menu acts on the column the focus is in, the focused pane or the
     right side, and says which in its title. 独看 is its own state (口径 2), not a cover. */
  const layoutMenu = document.createElement("div");
  layoutMenu.className = "workspace-layout-menu mw-menu tab-menu"; layoutMenu.setAttribute("popover", "auto"); layoutMenu.setAttribute("role", "menu"); layoutMenu.dataset.workspaceLayout = "";
  document.body.append(layoutMenu);
  let layoutAnchor = null;
  layoutMenu.addEventListener("toggle", (event) => layoutAnchor?.setAttribute("aria-expanded", String(event.newState === "open")));
  layoutMenu.addEventListener("keydown", (event) => { if (event.key !== "Escape") return; event.preventDefault(); event.stopPropagation(); layoutMenu.hidePopover(); layoutAnchor?.focus({ preventScroll: true }); });
  // The focused column goes alone: the right side when the focus is in it (open), otherwise the focused pane (口径 2, PFG-22).
  const toggleSolo = () => { ops.toggleSolo(state, column === "side" && Boolean(sidePane?.isOpen())); sidePane?.restore(); };
  const equalWidths = (node) => { if (node?.children) { node.ratio = .5; node.children.forEach(equalWidths); } };
  const openLayoutMenu = (anchor) => {
    layoutAnchor = anchor;
    const pane = ops.focused(state), split = state.panes.length > 1, solo = Boolean(state.solo);
    const sideOpen = Boolean(sidePane?.isOpen()), inSide = column === "side" && sideOpen, sideTab = ops.sideActive(state);
    const title = inSide ? L("布局 · 右侧") : split ? L("布局 · 第 {n} 栏", { n: ops.paneNumber(state, pane.id) }) : L("布局 · 主区");
    const act = (run) => () => {
      layoutMenu.hidePopover(); run(); apply(); persist();
      if (column === "side") document.querySelector("[data-side-tabs] [data-side-tab][aria-selected=true]")?.focus({ preventScroll: true }); else focusActiveTab();
    };
    const head = document.createElement("p");
    head.className = "tab-menu-head"; head.setAttribute("aria-hidden", "true"); head.textContent = title;
    layoutMenu.setAttribute("aria-label", title);
    const soloRow = menuRow(L(solo ? "独看中 · 显示全部" : "独看这一栏"), "maximize", act(toggleSolo), { keys: keyName("⌘⇧↵", "Ctrl+Shift+Enter"), disabled: !solo && !inSide && !split && !sideOpen, data: { layoutAction: "solo" } });
    const goTo = [...state.panes].sort((a, b) => ops.paneNumber(state, a.id) - ops.paneNumber(state, b.id)).map((candidate) => menuRow(split ? L("第 {n} 栏", { n: ops.paneNumber(state, candidate.id) }) : L("主区"), "", act(() => { state.focusedPaneId = candidate.id; column = "main"; }), { checked: !inSide && candidate === pane, data: { focusPane: candidate.id } }));
    if (state.side.tabs.length) goTo.push(menuRow(L("右侧"), "", act(() => { column = "side"; if (!sideOpen) sidePane?.toggle(); }), { checked: inSide, data: { focusPane: "side" } }));
    layoutMenu.replaceChildren(head, menuGroup("", inSide ? [
      menuRow(L("把这张标签移到主区"), "arrow", act(() => moveToMain(sideTab.id)), { disabled: sideTab?.kind !== "pane", data: { layoutAction: "to-main" } }),
      soloRow,
    ] : [
      menuRow(L("向右分屏"), "columns", act(() => ops.splitPane(state, pane.id, "right", "copy")), { disabled: narrow(), data: { layoutSplit: "right" } }),
      menuRow(L("向下分屏"), "frame", act(() => ops.splitPane(state, pane.id, "bottom", "copy")), { disabled: narrow(), data: { layoutSplit: "bottom" } }),
      menuRow(L("把这张标签移到右侧"), "arrow", act(() => moveToSide(pane.id)), { disabled: !ops.movable(state, pane.id), data: { layoutAction: "to-side" } }),
      soloRow,
    ]), menuGroup("", [
      !inSide && menuRow(L("合并成一栏"), "minus", act(() => ops.mergePanes(state)), { disabled: !split, data: { layoutAction: "merge" } }),
      menuRow(L(sideOpen ? "收起右侧" : "打开右侧"), "panel", act(() => sidePane?.toggle()), { keys: keyName("⌘\\\\", "Ctrl+\\\\"), disabled: !state.side.tabs.length, data: { layoutAction: "side" } }),
      !inSide && menuRow(L("均分宽度"), "columns", act(() => equalWidths(state.layout.tree)), { disabled: !split, data: { layoutAction: "equal" } }),
      !inSide && menuRow(L("关闭这一栏"), "x", act(() => ops.closePane(state, pane.id)), { disabled: !split, data: { layoutAction: "close" } }),
    ]), menuGroup(L("切到"), goTo));
    onlyMenu(layoutMenu); placeMenu(layoutMenu, anchor, false);
    layoutMenu.querySelector("[role^=menuitem]:not(:disabled)")?.focus();
  };`;
