import { tabShareWidth, tabShareMin, tabScrollAllotment } from "../../tab-strip-share.js";

/** The tab strip of a pane: markup, labels and glyphs, sharing the width, scrolling a tab into view, drawing the strip, choosing a tab, and the strip's keys and clicks. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_STRIP_PART = `  const tabShareWidth = ${tabShareWidth.toString()};
  const tabShareMin = ${tabShareMin.toString()};
  const tabScrollAllotment = ${tabScrollAllotment.toString()};
  const paneMarkup = () => '<nav class="tab-strip" data-tab-strip></nav><div class="tab-pane-body" data-tab-pane-body></div><button type="button" class="tab-pane-close" data-tab-pane-close aria-label="' + globalThis.t.text("workbench.tab-workspace-strip.close-pane") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button><div class="tab-drop-edges" data-tab-edges><button type="button" data-tab-edge="left" aria-label="' + globalThis.t.text("workbench.tab-workspace-strip.split-left") + '"></button><button type="button" data-tab-edge="right" aria-label="' + globalThis.t.text("workbench.tab-workspace-strip.split-right") + '"></button><button type="button" data-tab-edge="top" aria-label="' + globalThis.t.text("workbench.tab-workspace-strip.split-up") + '"></button><button type="button" data-tab-edge="bottom" aria-label="' + globalThis.t.text("workbench.tab-workspace-strip.split-down") + '"></button></div>';
  /** One of the strip's text buttons (workbench-navigation.ts .tab-strip-button): a glyph and its words. */
  const stripButton = (kind, glyph, words, data) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "tab-strip-button " + kind; Object.assign(button.dataset, data);
    button.innerHTML = '<svg aria-hidden="true"><use href="#icon-' + glyph + '"></use></svg><span></span>';
    button.querySelector("span").textContent = words;
    return button;
  };
  /** 主区 | 右侧 before the titlebar's strip, shown at 760px and under, where only the focused column shows. */
  const paneSwitch = () => {
    const group = document.createElement("div"), inSide = column === "side" && Boolean(sidePane?.isOpen());
    group.className = "mw-toggle-group tab-pane-switch"; group.dataset.slot = "toggle-group"; group.setAttribute("role", "group"); group.setAttribute("aria-label", globalThis.t.text("workbench.tab-workspace-strip.which-pane-show"));
    [["main", globalThis.t.text("workbench.tab-workspace-strip.main"), !inSide], ["side", globalThis.t.text("workbench.tab-workspace-strip.right"), inSide]].forEach(([value, words, current]) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "mw-toggle" + (current ? " is-current" : ""); button.dataset.paneSwitch = value;
      button.setAttribute("aria-pressed", String(current)); button.textContent = words;
      if (value === "side" && !state.side.tabs.length) button.disabled = true;
      group.append(button);
    });
    return group;
  };
  const tabLabel = (tab) => tab.kind === "plugin" ? ops.pluginTitle(tab.plugin) : tab.title;
  const tabIcon = (plugin) => PLUGIN_TAB_ICON[plugin] || "frame";
  const iconMarkup = (plugin) => '<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-' + tabIcon(plugin) + '"></use></svg>';
  const appendTab = (parent, pane, tab) => {
    const selected = tab.id === pane.activeTabId || pluginGroups.shows(pane, tab), label = tabLabel(tab);
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
    // What is wrong with a tab says so on the tab and keeps it where it is (design README, shared part 7): its plugin was taken
    // out of the project (S1 keeps it, the group greys), its record is gone (struck through), or its plugin did not start (amber).
    const mark = tab.kind === "system" ? "" : removedPlugin(tab.plugin) ? "removed" : goneRecord(tab) ? "gone" : failedPlugin(tab.plugin) ? "failed" : "";
    if (mark === "removed") button.dataset.tabRemoved = "true"; else if (mark) button.dataset.tabState = mark;
    if (mark) button.title = trigger.ariaLabel = label + " · " + (mark === "removed" ? globalThis.t.text("workbench.tab-workspace-strip.removed") : mark === "gone" ? globalThis.t.text("workbench.tab-workspace-strip.one-no-longer-here") : globalThis.t.text("workbench.tab-workspace-strip.didn-t-start"));
    const name = document.createElement("span");
    name.textContent = label;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-item-close";
    close.dataset.tabClose = tab.id;
    // A plugin tab closes its whole group.
    const closeWords = globalThis.t.text(tab.kind === "plugin" ? "workbench.tab-workspace-strip.close-tab-group" : "workbench.tab-workspace-strip.close-tab");
    close.ariaLabel = closeWords;
    close.title = closeWords + "·" + label;
    close.tabIndex = selected ? 0 : -1;
    close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    trigger.innerHTML = tab.kind === "system" ? '<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg>' : iconMarkup(tab.plugin);
    name.className = "tab-item-name";
    trigger.append(name);
    if (mark === "failed") trigger.insertAdjacentHTML("beforeend", '<span class="nav-warn-dot" aria-hidden="true"></span>');
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
    // Plugin tabs keep their names; the item tabs share what is left.
    const flexTabs = [...scroll.querySelectorAll('.tab-item:not([data-pinned]):not([data-tab-kind="plugin"])')].filter((tab) => !tab.closest('.tab-group[data-collapsed="true"], .is-tab-drag-source'));
    const slot = scroll.querySelector("[data-tab-reorder-slot]:not([data-tab-slot-leaving], .is-group)");
    const flexNodes = slot ? flexTabs.concat(slot) : flexTabs;
    const clearShare = () => {
      scroll.style.removeProperty("--tab-share-width");
      scroll.style.removeProperty("width");
    };
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
        const kids = [...pages.children].filter((el) => (el.classList.contains("tab-item") || el.classList.contains("tab-group-sep") || el.hasAttribute("data-tab-reorder-slot")) && !gone(el) && el.getClientRects().length);
        reserved += gapOf(pages) * Math.max(0, kids.length - 1);
        for (const kid of kids) {
          if (flexSet.has(kid)) continue;
          const box = getComputedStyle(kid);
          reserved += kid.getBoundingClientRect().width + (Number.parseFloat(box.marginLeft) || 0) + (Number.parseFloat(box.marginRight) || 0);
        }
        continue;
      }
      reserved += child.getBoundingClientRect().width;
    }
    // 全部标签 takes room only while the tabs, at their narrowest, still do not fit (a phone always shows it, by CSS).
    const all = strip.querySelector(":scope > [data-tab-all]");
    const phone = window.matchMedia("(max-width: 760px)").matches;
    const min = tabShareMin(window.matchMedia("(max-width: 760px), (pointer: coarse)").matches), hugs = flexNodes.map(tabHugWidth);
    const stripStyle = getComputedStyle(strip);
    const innerWidth = strip.clientWidth - (Number.parseFloat(stripStyle.paddingLeft) || 0) - (Number.parseFloat(stripStyle.paddingRight) || 0);
    const allot = () => {
      let siblingChrome = 0;
      const stripKids = [...strip.children].filter((child) => child === scroll || child.getClientRects().length);
      for (const child of stripKids) {
        if (child === scroll) continue;
        if (child.classList.contains("tab-strip-spacer")) {
          siblingChrome += Number.parseFloat(getComputedStyle(child).minWidth) || 0;
          continue;
        }
        siblingChrome += child.getBoundingClientRect().width;
      }
      return tabScrollAllotment(innerWidth, siblingChrome, gapOf(strip), stripKids.length);
    };
    // On a phone the titlebar's row scrolls when it cannot hold it all (workbench-navigation.ts); its edges fade like other scrollers.
    if (strip.hasAttribute("data-titlebar-tabs")) strip.toggleAttribute("data-overflow-fade", phone);
    if (all) all.hidden = !phone;
    let allotted = allot();
    if (all && !phone && reserved + hugs.reduce((sum, hug) => sum + Math.min(hug, min), 0) > allotted + 0.5) { all.hidden = false; allotted = allot(); }
    const share = tabShareWidth(allotted - reserved, hugs, min);
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
    strip.setAttribute("aria-label", globalThis.t.text("workbench.tab-workspace-strip.workspace-tabs"));
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
        const title = (group?.collapsed ? globalThis.t.text("workbench.tab-workspace-strip.expand-tab-group") : globalThis.t.text("workbench.tab-workspace-strip.collapse-tab-group")) + (group?.title ? " · " + group.title : "");
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
      close.title = globalThis.t.text("common.control.close") + " · " + coverLabel(state.exclusive) + " (Esc)";
      close.setAttribute("aria-label", globalThis.t.text("common.control.close") + " " + coverLabel(state.exclusive));
      close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      cover.append(close);
      const divider = document.createElement("span"); divider.className = "tab-view-divider"; divider.setAttribute("aria-hidden", "true");
      fragment.prepend(cover, divider);
    }
    const pad = document.createElement("span");
    pad.dataset.tabScrollPad = "";
    pad.setAttribute("aria-hidden", "true");
    scrollArea.append(pad);
    // What stays at the visible end of the strip, never scrolled away (07-1 S3, scheme A): the way back after a group closed,
    // the way out of 独看, and 全部标签, which appears once the tabs no longer fit (shareTabStrip says when; a phone always shows it).
    const undo = pluginGroups.undoChip(pane.id);
    if (undo) fragment.append(undo);
    if (!embedded && state.solo?.paneId === pane.id) fragment.append(stripButton("tab-solo-chip", "maximize", globalThis.t.text("workbench.tab-workspace-strip.one-pane-show-all"), { soloChip: "" }));
    if (!embedded) {
      const all = stripButton("tab-all-button", "rows", globalThis.t.text("workbench.tab-workspace-strip.all-tabs"), { tabAll: pane.id });
      const count = document.createElement("span"); count.className = "tab-all-count"; count.textContent = String(pane.tabs.length); all.append(count);
      all.setAttribute("aria-label", globalThis.t.text("workbench.tab-workspace-strip.all-tabs") + " · " + globalThis.t.text("workbench.tab-workspace-strip.n-n", { n: pane.tabs.length })); all.setAttribute("aria-haspopup", "menu");
      all.setAttribute("aria-expanded", String(document.querySelector("[data-workspace-all-tabs]:popover-open")?.dataset.forPane === pane.id));
      all.hidden = true;
      fragment.append(all);
    }
    // On a phone only the focused column shows: the titlebar's strip leads with which one (design README 9).
    if (!embedded && strip.hasAttribute("data-titlebar-tabs")) fragment.prepend(paneSwitch());
    // A pane of its own with nothing in it says how to fill it; the titlebar's strip over the project home says nothing.
    if (!pane.tabs.length && !strip.hasAttribute("data-titlebar-tabs")) {
      const empty = document.createElement("p");
      empty.className = "tab-pane-empty-hint";
      empty.textContent = globalThis.t.text("workbench.tab-workspace-strip.switch-plugin-below-drag-tab-here");
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
      add.setAttribute("aria-label", globalThis.t.text("common.control.open")); add.title = globalThis.t.text("common.control.open"); add.setAttribute("aria-haspopup", "menu"); add.setAttribute("aria-expanded", "false");
      add.innerHTML = '<svg aria-hidden="true"><use href="#icon-plus"></use></svg>'; fragment.append(add);
    }
    strip.replaceChildren(fragment);
    scrollArea.scrollLeft = scrollLeft;
    shareTabStrip(scrollArea);
    // A phone's row that scrolls (the undo chip came in) keeps the current tab in view.
    const current = strip.hasAttribute("data-titlebar-tabs") && strip.scrollWidth > strip.clientWidth + 1 ? strip.querySelector("[data-tab-id][aria-current]") : null;
    if (current) {
      const edge = strip.getBoundingClientRect(), at = current.getBoundingClientRect();
      if (at.left < edge.left) strip.scrollLeft -= edge.left - at.left;
      else if (at.right > edge.right) strip.scrollLeft += at.right - edge.right;
    }
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
  /** The phone's 主区 | 右侧: the right side opens and takes the focus, or collapses and gives it back to the main area. */
  const showColumn = (which) => {
    const open = Boolean(sidePane?.isOpen());
    if ((which === "side") !== open) sidePane?.toggle();
    column = which === "side" && sidePane?.isOpen() ? "side" : "main";
    apply();
    if (column === "side") document.querySelector("[data-side-tabs] [data-side-tab][aria-selected=true]")?.focus({ preventScroll: true }); else focusActiveTab();
  };
  /** The focused column's current tab is paper and lifted; another column's keeps only its place (design README, shared part 5). */
  const markFocus = () => {
    const strips = [titlebarStrip, ...panesEl.querySelectorAll("[data-tab-pane] > [data-tab-strip]")].filter(Boolean);
    strips.forEach((node) => node.toggleAttribute("data-unfocused", column === "side" || (node !== titlebarStrip && node.closest("[data-tab-pane]")?.dataset.tabPane !== state.focusedPaneId)));
    document.querySelector("[data-side-tabs]")?.toggleAttribute("data-unfocused", column !== "side");
    document.querySelectorAll("[data-pane-switch]").forEach((button) => { const on = (button.dataset.paneSwitch === "side") === (column === "side"); button.classList.toggle("is-current", on); button.setAttribute("aria-pressed", String(on)); });
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
    const switchTo = event.target.closest("[data-pane-switch]");
    if (switchTo) { showColumn(switchTo.dataset.paneSwitch); return true; }
    if (event.target.closest("[data-solo-chip]")) { toggleSolo(); apply(); persist(); focusActiveTab(); return true; }
    if (!paneId) return;
    const all = event.target.closest("[data-tab-all]");
    if (all) { openAllTabs(paneId, all); return true; }
    const add = event.target.closest("[data-tab-add]");
    if (add) { openPlusMenu(paneId, add); return true; }
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
      if (ops.shownPlugin(pane) === pluginTab.dataset.plugin && !pane.activeTabId && state.focusedPaneId === paneId && !state.exclusive) {
        resetPluginPage(pane.viewPlugin);
        host.prepareSurface?.(findTopLevelSurface(pluginTab.dataset.plugin), "open");
        return true;
      }
      state.focusedPaneId = paneId;
      const railButton = document.querySelector('[data-dock] [data-plugin-id="' + CSS.escape(pluginTab.dataset.plugin) + '"]');
      if (railButton && ops.shownPlugin(pane) !== pluginTab.dataset.plugin) host.openEntry?.(pluginTab.dataset.plugin, railButton);
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
