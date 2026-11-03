import { tabShareWidth, tabShareMin, tabScrollAllotment } from "../../tab-strip-share.js";

/** The tab strip of a pane: markup, labels and glyphs, sharing the width, scrolling a tab into view, drawing the strip, choosing a tab, and the strip's keys and clicks. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_STRIP_PART = `  const tabShareWidth = ${tabShareWidth.toString()};
  const tabShareMin = ${tabShareMin.toString()};
  const tabScrollAllotment = ${tabScrollAllotment.toString()};
  const paneMarkup = () => '<nav class="tab-strip" data-tab-strip></nav><div class="tab-pane-body" data-tab-pane-body></div><button type="button" class="tab-pane-close" data-tab-pane-close aria-label="' + L("关闭分栏") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button><div class="tab-drop-edges" data-tab-edges><button type="button" data-tab-edge="left" aria-label="' + L("拆到左侧") + '"></button><button type="button" data-tab-edge="right" aria-label="' + L("拆到右侧") + '"></button><button type="button" data-tab-edge="top" aria-label="' + L("拆到上方") + '"></button><button type="button" data-tab-edge="bottom" aria-label="' + L("拆到下方") + '"></button></div>';
  const tabLabel = (tab) => tab.plugin === "home" ? (personal ? L("个人首页") : L("项目首页"))
    : tab.kind === "plugin" ? L(ops.pluginTitle(tab.plugin)) : tab.title;
  const tabIcon = (plugin) => PLUGIN_TAB_ICON[plugin] || "frame";
  const iconMarkup = (plugin) => '<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-' + tabIcon(plugin) + '"></use></svg>';
  const appendTab = (parent, pane, tab) => {
    if (personal && tab.kind === "home") return; const selected = tab.id === pane.activeTabId || pluginGroups.shows(pane, tab), label = tabLabel(tab);
    const button = document.createElement("div");
    button.className = "tab-item" + (selected ? " is-active" : "");
    button.dataset.tabId = tab.id;
    button.dataset.plugin = tab.plugin;
    if (tab.itemId) button.dataset.itemId = tab.itemId;
    button.dataset.tabKind = tab.kind;
    if (tab.pinned) button.dataset.pinned = "true";
    button.style.setProperty("--plugin-color", "var(--ink-soft)");
    button.draggable = true;
    button.title = label;
    if (selected) button.setAttribute("aria-current", "page");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.role = "tab";
    trigger.className = "tab-item-trigger";
    trigger.tabIndex = selected ? 0 : -1;
    trigger.ariaLabel = label;
    trigger.setAttribute("aria-selected", String(selected));
    const name = document.createElement("span");
    name.textContent = label;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-item-close";
    close.dataset.tabClose = tab.id;
    // A plugin tab closes its whole group.
    const closeWords = L(tab.kind === "plugin" ? "关闭标签组" : "关闭标签");
    close.ariaLabel = closeWords;
    close.title = closeWords + "·" + label;
    close.tabIndex = selected ? 0 : -1;
    close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    trigger.innerHTML = tab.kind === "system" ? '<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg>' : iconMarkup(tab.plugin);
    name.className = "tab-item-name";
    trigger.append(name);
    button.append(trigger);
    if (!tab.pinned) { button.append(close); trigger.setAttribute("aria-keyshortcuts", "Delete"); } // a tab not chosen keeps its close out of the tab order; Delete is its key
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
    // Scroll padding aligns a clipped active tab; it is not reserved content
    // for the next layout. Reusing it can alternate between sharing and hug.
    const scrollPad = scroll.querySelector("[data-tab-scroll-pad]");
    if (scrollPad) scrollPad.style.width = "0px";
    // Home and plugin tabs keep their names; the item tabs share what is left.
    const flexTabs = [...scroll.querySelectorAll('.tab-item:not([data-pinned]):not([data-tab-kind="home"]):not([data-tab-kind="plugin"])')].filter((tab) => !tab.closest('.tab-group[data-collapsed="true"], .is-tab-drag-source'));
    const slot = scroll.querySelector("[data-tab-reorder-slot]:not([data-tab-slot-leaving], .is-group)");
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
    // A closing slot and the dragged tab's old place are on their way to nothing; they take no room.
    const gone = (el) => el.hasAttribute?.("data-tab-slot-leaving") || el.classList?.contains("is-tab-drag-source");
    const scrollKids = [...scroll.children].filter((child) => !gone(child));
    reserved += gapOf(scroll) * Math.max(0, scrollKids.length - 1);
    for (const child of scrollKids) {
      if (flexSet.has(child)) continue;
      if (child.classList?.contains("tab-group")) {
        const label = child.querySelector(":scope > .tab-group-label");
        if (label) reserved += label.getBoundingClientRect().width;
        reserved += (Number.parseFloat(getComputedStyle(child).paddingLeft) || 0) + (Number.parseFloat(getComputedStyle(child).paddingRight) || 0);
        const pages = child.querySelector(".tab-group-pages") || child;
        const kids = [...pages.children].filter((el) => (el.classList.contains("tab-item") || el.hasAttribute("data-tab-reorder-slot")) && !gone(el));
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
    const stripStyle = getComputedStyle(strip);
    const innerWidth = strip.clientWidth - (Number.parseFloat(stripStyle.paddingLeft) || 0) - (Number.parseFloat(stripStyle.paddingRight) || 0);
    const allotted = tabScrollAllotment(innerWidth, siblingChrome, gapOf(strip), stripKids.length);
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
      if (box.left < rail.left + 28) scroller.scrollLeft -= rail.left + 28 - box.left;
      else if (box.right > rail.right - 28) scroller.scrollLeft += box.right - rail.right + 28;
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
    const scrollArea = document.createElement("div"); scrollArea.className = "tab-scroll"; scrollArea.dataset.tabScroll = scrollArea.dataset.overflowFade = "";
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
      const after = pluginGroups.render(scrollArea, pane, index);
      if (after > index) { index = after; continue; }
      appendTab(scrollArea, pane, tab);
      index += 1;
    }
    if (state.exclusive && !embedded && (strip.hasAttribute("data-titlebar-tabs") || pane.id === state.focusedPaneId)) {
      // Market and settings cover the panes; say so where the tabs are, with the way out beside the name.
      const cover = document.createElement("span");
      cover.className = "tab-view-chip is-exclusive"; cover.setAttribute("aria-current", "page");
      cover.dataset.coverChip = state.exclusive;
      const glyph = coverGlyph(state.exclusive);
      if (glyph) cover.append(glyph);
      const label = document.createElement("span");
      label.textContent = coverLabel(state.exclusive);
      cover.append(label);
      const close = document.createElement("button");
      close.type = "button"; close.className = "tab-view-chip-close"; close.dataset.coverClose = "";
      close.title = L("关闭") + " · " + coverLabel(state.exclusive) + " (Esc)";
      close.setAttribute("aria-label", L("关闭") + " " + coverLabel(state.exclusive));
      close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      cover.append(close);
      const divider = document.createElement("span"); divider.className = "tab-view-divider"; divider.setAttribute("aria-hidden", "true");
      fragment.prepend(cover, divider);
    }
    const pad = document.createElement("span");
    pad.dataset.tabScrollPad = "";
    pad.setAttribute("aria-hidden", "true");
    scrollArea.append(pad);
    const undo = pluginGroups.undoChip(pane);
    if (undo) fragment.append(undo);
    if (!pane.tabs.length) {
      const empty = document.createElement("p");
      empty.className = "tab-pane-empty-hint";
      empty.textContent = L("从下方切换插件，或把标签拖进来。");
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
      add.setAttribute("aria-label", L("打开插件")); add.title = L("打开插件"); add.setAttribute("aria-haspopup", "menu");
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
  const activate = (paneId, tabId) => {
    if (tabId) ops.activate(state, paneId, tabId);
    else {
      if (!paneById(paneId)) return;
      state.focusedPaneId = paneId;
    }
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
      closeTabBack(paneId, tab.dataset.tabId);
      focusActiveTab();
    } else if (target) {
      event.preventDefault();
      activate(paneId, target.dataset.tabId);
      focusActiveTab();
    }
  };
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
    if (event.target.closest("[data-cover-close]")) {
      event.preventDefault();
      closeCover();
      focusActiveTab();
      return true;
    }
    const close = event.target.closest("[data-tab-close]");
    if (close) {
      event.preventDefault();
      closeTabBack(paneId, close.dataset.tabClose);
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
    const pluginTab = event.target.closest('[data-tab-kind="plugin"]');
    if (pluginTab) {
      const pane = paneById(paneId);
      if (!pane) return true;
      // Already on the plugin's page: its tab goes back to the page's list.
      if (ops.shownPlugin(pane) === pluginTab.dataset.plugin && !pane.activeTabId && state.focusedPaneId === paneId && !state.exclusive) { resetPluginPage(pane.viewPlugin); return true; }
      state.focusedPaneId = paneId;
      const railButton = document.querySelector('[data-dock] [data-plugin-id="' + CSS.escape(pluginTab.dataset.plugin) + '"]');
      if (railButton && ops.shownPlugin(pane) !== pluginTab.dataset.plugin) railButton.click();
      else activate(paneId, pluginTab.dataset.tabId);
      focusActiveTab();
      return true;
    }
    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
      const pane = paneById(paneId);
      const alreadyActive = pane?.activeTabId === tab.dataset.tabId && state.focusedPaneId === paneId;
      if (!alreadyActive || state.exclusive) {
        activate(paneId, tab.dataset.tabId);
      }
      focusActiveTab();
      return true;
    }
    return false;
  };`;
