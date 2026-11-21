import { UNAVAILABLE_STAGE } from "../../unavailable-plugin-stage.js";
import { TOP_CORNER_PART } from "./top-corner.js";
/** Menus of the bottom bar and the stage: presentation only; opening one never selects or starts a tool. */
export const NAVIGATION_PRESENTATION_SCRIPT = `(readText) => {
  // Plugin list pages draw their heading from the surface's own label (craft-finish, "Plugin list pages").
  // The label is set once on the shell, so a plugin that re-renders its list keeps the heading.
  const titleStages = () => document.querySelectorAll('.plugin-stage-shell[data-work-surface-label]').forEach((shell) => {
    const title = JSON.stringify((shell.dataset.workSurfaceLabel || ''));
    if (shell.style.getPropertyValue('--stage-title') !== title) shell.style.setProperty('--stage-title', title);
    const desc = JSON.stringify(shell.dataset.workSurfaceDescription || '');
    if (shell.style.getPropertyValue('--stage-desc') !== desc) shell.style.setProperty('--stage-desc', desc);
  });
  titleStages();
  document.addEventListener("molis-work:language-changed", titleStages);
  const stageHost = document.querySelector('.immersive-plugin-stage');
  if (stageHost) new MutationObserver(titleStages).observe(stageHost, { childList: true });
  const dismiss = (event) => {
    // The project menu, the account menu and the Feed source menu also close once something in them is chosen. Escape and a
    // press outside close them as every floating details closes (design-system browser/floating-details.ts).
    // The path is taken at dispatch, so a row that re-rendered under the click still counts as inside its menu.
    const path = typeof event.composedPath === 'function' ? event.composedPath().filter((node) => node.nodeType === 1) : [];
    const along = (selector) => path.some((node) => node.matches(selector)) || Boolean(event.target?.nodeType === 1 && event.target.closest(selector));
    for (const menu of document.querySelectorAll('[data-project-menu][open], [data-global-menu][open], [data-feed-source-menu][open]')) {
      const inside = path.includes(menu) || menu.contains(event.target);
      if (inside && along('a, button') && !along('summary')) menu.open = false;
    }
  };
  document.addEventListener('click', dismiss);
}`;

/** The top strip's script (specs/screen-polish §3 方案 C, §4「底栏第十三版」第 1 条): its first place, 「项目 › 项目主页」, stands as
 * the ear on its sheet while the project home shows (top-corner.ts). Any other plugin is reached from ＋ (the start page) or ⌘K,
 * and its own page is a tab like any other. A plugin that did not start carries the amber point in the start page and on its tab. */
export const DOCK_SCRIPT = `(readText, projectId, host = {}) => {
  if (document.body.hasAttribute('data-pane-embedded') || (window.parent !== window && new URLSearchParams(location.search).has('workbenchPane'))) return;
  const dock = document.querySelector('[data-dock]');
  if (!dock) return;
  const rail = () => [...dock.querySelectorAll('.plugin-rail-items [data-plugin-id]')];
  const railItem = (id) => dock.querySelector('.plugin-rail-items [data-plugin-id="' + CSS.escape(id) + '"]');
  // The market and the plugin studio are buttons at the head of the switcher, not rows of the rail: the chip names them
  // from there too, so a place the rail does not list still reads as its name rather than its id (BL-114).
  const labelOf = (node) => node.querySelector('span')?.textContent?.trim() || node.getAttribute('title') || '';
  const namedItem = (id) => railItem(id) || dock.querySelector('[data-global-menu] [data-plugin-id="' + CSS.escape(id) + '"]');
  const nameOf = (id) => { const item = namedItem(id); return (item && labelOf(item)) || id; };
  const glyphOf = (id) => namedItem(id)?.querySelector('svg')?.cloneNode(true) || null;

  /* The switcher. */
  const picker = dock.querySelector('[data-plugin-picker]');
  const pickerToggle = dock.querySelector('[data-plugin-picker-toggle]');
  const pickerPopover = dock.querySelector('[data-plugin-picker-popover]');
  const toast = document.querySelector('[data-toast]');
  const current = dock.querySelector('[data-plugin-picker-current]');
  // The switcher is its glyph alone: its name says what the work area shows, so a screen reader hears where it is.
  const nameSwitcher = (names) => {
    const label = globalThis.t.text("workbench.navigation-presentation.switch-plugin-now-now", { now: names.join(globalThis.t.text("common.list.separator")) });
    if (pickerToggle && pickerToggle.getAttribute('aria-label') !== label) pickerToggle.setAttribute('aria-label', label);
  };
  // The start page says what the tab strip's own ＋ list did (PFG-23, PFG-24; specs/work-line §6.5): where a plugin already
  // open is, seen from the focused column; "beside" on ⌥↵ or the tile's own button; and what was just closed, last.
  const MAC_KEYS = /Mac|iP/.test(navigator.platform);
  const dressStart = () => {
    const page = host.startPage?.();
    for (const tile of pickerPopover.querySelectorAll('.plugin-rail-tile')) {
      const link = tile.querySelector('[data-plugin-id]'), place = (link && page?.placeOf(link.dataset.pluginId)) || '';
      let mark = tile.querySelector('.plugin-rail-where');
      if (!place) { mark?.remove(); } else {
        if (!mark) { mark = document.createElement('span'); mark.className = 'plugin-rail-where'; link.append(mark); }
        if (mark.textContent !== place) mark.textContent = place;
      }
      link?.setAttribute('aria-keyshortcuts', 'Alt+Enter');
      const beside = tile.querySelector('[data-rail-beside]');
      // (A tile patched after a change of membership has the server's title again: the key is said each time.)
      if (beside) beside.title = beside.title.replace(/ \\(.*\\)$/, '') + ' (' + (MAC_KEYS ? '⌥↵' : 'Alt+Enter') + ')';
    }
    const closed = page?.recent() || [];
    let box = pickerPopover.querySelector('[data-rail-recent]');
    if (!closed.length) { box?.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'plugin-rail-recent'; box.dataset.railRecent = ''; pickerPopover.append(box); }
    const title = document.createElement('p'), rows = document.createElement('div');
    title.className = 'plugin-rail-subgroup'; title.id = 'plugin-rail-recent-title'; title.textContent = globalThis.t.text("workbench.navigation-presentation.recently-closed");
    rows.className = 'plugin-rail-items'; rows.setAttribute('role', 'group'); rows.setAttribute('aria-labelledby', title.id);
    closed.forEach((entry, index) => {
      const row = document.createElement('button'), name = document.createElement('span'), glyph = glyphOf(entry.plugin);
      row.type = 'button'; row.className = 'immersive-plugin-link plugin-rail-item'; row.dataset.railZone = 'recent'; row.dataset.railReopen = String(index);
      name.textContent = entry.title; row.title = entry.title;
      if (glyph) row.append(glyph);
      row.append(name);
      if (!index) { const keys = document.createElement('kbd'); keys.textContent = MAC_KEYS ? '⌘⇧T' : 'Ctrl+Shift+T'; row.append(keys); row.setAttribute('aria-keyshortcuts', MAC_KEYS ? 'Meta+Shift+T' : 'Control+Shift+T'); }
      rows.append(row);
    });
    box.replaceChildren(title, rows);
  };
  // POLISH-04: the start page hangs under ＋, its left edge at ＋'s, moved in only as far as the window needs.
  const placeStart = () => {
    const plus = pickerToggle.getBoundingClientRect();
    pickerPopover.style.setProperty('--start-left', Math.round(Math.max(8, Math.min(plus.left, innerWidth - 8 - pickerPopover.offsetWidth))) + 'px');
  };
  addEventListener('resize', () => { if (pickerPopover && !pickerPopover.hidden) placeStart(); });
  const setPicker = (open) => {
    if (!pickerPopover || !pickerToggle) return;
    // One list at a time: the start page closes the first place's.
    if (open) { setCorner(false); dressStart(); }
    pickerPopover.hidden = !open;
    if (open) placeStart();
    toast?.toggleAttribute('data-plugin-picker-open', open);
    pickerToggle.setAttribute('aria-expanded', String(open));
    // POLISH-04: opening the start page puts focus on Search first, falling back to the rail if search is absent.
    if (open) pickerPopover.querySelector('[data-global-search-open], .plugin-rail-items [aria-current], .plugin-rail-items [data-plugin-id]')?.focus(); else stopAsking();
  };
  // What the work area shows: the current plugin, or one per pane when it is split, the focused pane first in weight.
  const shown = () => {
    const panes = [...document.querySelectorAll('.tab-workspace-panes > [data-tab-pane]')];
    const railCurrent = host.shownPlugin?.() || rail().find((node) => node.hasAttribute('aria-current'))?.dataset.pluginId || 'home';
    if (panes.length < 2) return [{ plugin: railCurrent, focused: true }];
    return panes.map((pane) => {
      const mark = pane.querySelector('.tab-strip .tab-item[aria-current]');
      return { plugin: mark?.dataset.plugin || '', focused: pane.classList.contains('is-focused') };
    }).filter((entry) => entry.plugin);
  };
  const chipOf = (kind, glyph, words) => {
    const chip = document.createElement('span'), name = document.createElement('span');
    chip.className = 'plugin-picker-chip' + kind;
    if (glyph) chip.append(glyph);
    name.textContent = words;
    chip.append(name);
    return chip;
  };
  // The label is rebuilt only when what it shows changed: a press that lands on it while it repaints still ends on the node it
  // started on, so it is a click.
  const put = (...chips) => { const next = current.cloneNode(); next.append(...chips); if (!next.isEqualNode(current)) current.replaceChildren(...chips); };
  let paintQueued = false, tabsWait = 0;
  // The strip shows once 项目主页 is drawn and the current one named (work-line.ts holds it unseen until then).
  const drawn = () => { if (dockPainted && !dock.hasAttribute('data-dock-drawn')) dock.setAttribute('data-dock-drawn', ''); };
  const paintCurrentNow = () => {
    if (!current) { drawn(); return; }
    // The tab workspace starts after this script: until it is up, which page shows is not known, so the strip waits (a
    // little, then draws anyway should the workspace not start).
    if (host.tabsReady && !host.tabsReady() && tabsWait++ < 100) { setTimeout(paintCurrent, 50); return; }
    // A cover (settings, the market) is what the person looks at: the switcher names it and no
    // Dock entry claims to be current underneath it.
    const cover = document.querySelector('[data-tab-workspace]')?.dataset.exclusive;
    if (cover) {
      const source = document.querySelector('[data-cover-chip]');
      put(chipOf(' is-focused is-cover', source?.querySelector('svg')?.cloneNode(true), source?.querySelector(':scope > span')?.textContent || ''));
      nameSwitcher([source?.querySelector(':scope > span')?.textContent || '']);
      current.parentElement?.classList.remove('is-split');
      paintCorner(false, false);
      drawn();
      return;
    }
    const entries = shown();
    put(...entries.map((entry) => chipOf(entry.focused ? ' is-focused' : '', glyphOf(entry.plugin), nameOf(entry.plugin))));
    nameSwitcher(entries.map((entry) => nameOf(entry.plugin)));
    current.parentElement?.classList.toggle('is-split', entries.length > 1);
    // The project home has no tab of its own in the strip: the first place is that tab, and grows on the sheet while it shows.
    const home = entries.some((entry) => entry.plugin === 'home' && entry.focused);
    paintCorner(home, host.pagePlugin?.() === 'home');
    drawn();
  };
  const paintCurrent = () => {
    if (!current) { drawn(); return; }
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => { paintQueued = false; paintCurrentNow(); });
  };

${TOP_CORNER_PART}
  // A plugin that did not start keeps its place and its stage says why; its entry in the start page carries the amber point
  // (and its tab, tab-workspace-strip.ts).
  rail().forEach((item) => {
    const stage = '[data-work-surface="' + CSS.escape(item.dataset.pluginId) + '"]';
    if (!document.querySelector(stage + '${UNAVAILABLE_STAGE}') || item.querySelector(':scope > .nav-warn-dot')) return;
    // A plugin stopped because its data was not upgraded did start; it is only unavailable for now (U3 §2.4).
    const held = document.querySelector(stage + ' [data-owner-unavailable]');
    const dot = document.createElement('span'); dot.className = 'nav-warn-dot';
    dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', globalThis.t.text(held ? "workbench.navigation-presentation.unavailable-for-now" : "workbench.navigation-presentation.didn-t-start"));
    item.append(dot);
  });
  let dockPainted = false;
  const paintDock = () => { dockPainted = true; paintCurrent(); };

  /* Removing asks once, in the tile's own second line, and gives up by itself. */
  let asking = null;
  const stopAsking = () => {
    if (!asking) return;
    const { tile, button, label, title } = asking;
    clearTimeout(asking.timer);
    tile.classList.remove('is-confirming');
    button.setAttribute('aria-label', label);
    if (title == null) button.removeAttribute('title'); else button.setAttribute('title', title);
    const words = button.querySelector('.mw-sr-only'); if (words) words.textContent = label;
    asking = null;
  };
  document.addEventListener('click', (event) => { if (asking && !(event.target?.nodeType === 1 && asking.tile.contains(event.target))) stopAsking(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && asking) { event.preventDefault(); stopAsking(); } });
  dock.addEventListener('click', (event) => {
    const target = event.target?.nodeType === 1 ? event.target : null;
    const toggle = target?.closest('[data-plugin-toggle]');
    if (!toggle || toggle.disabled) return;
    const tile = toggle.closest('.plugin-rail-tile');
    const id = toggle.dataset.pluginToggle;
    if (toggle.dataset.state === 'available') { stopAsking(); void host.membership?.change(id, 'add'); return; }
    if (asking && asking.tile === tile) { stopAsking(); void host.membership?.change(id, 'remove'); return; }
    stopAsking();
    const list = (tile.dataset.dependents || '').split('|').filter(Boolean).join(globalThis.t.text("common.list.separator"));
    const message = list ? globalThis.t.text("workbench.navigation-presentation.press-again-remove-also-removes-list", { list }) : globalThis.t.text("workbench.navigation-presentation.press-again-remove");
    tile.querySelector('.plugin-rail-confirm').textContent = message;
    const title = toggle.getAttribute('title');
    toggle.setAttribute('title', message);
    const label = toggle.getAttribute('aria-label') || '';
    // The tile's operations group carries the Plugin's own name (immersive-shell marks it); nothing is sliced out of a label.
    const name = tile.querySelector('.plugin-rail-ops')?.getAttribute('aria-label') || nameOf(id);
    const sure = globalThis.t.text("workbench.navigation-presentation.confirm-removal-named", { name });
    toggle.setAttribute('aria-label', sure);
    const words = toggle.querySelector('.mw-sr-only'); if (words) words.textContent = sure;
    tile.classList.add('is-confirming');
    asking = { tile, button: toggle, label, title, timer: setTimeout(stopAsking, 3200) };
  });
  const searchKey = dock.querySelector('.plugin-picker-search kbd');
  if (searchKey && !/Mac|iPhone|iPad/.test(navigator.platform)) searchKey.textContent = 'Ctrl K';

  dock.addEventListener('click', (event) => {
    const target = event.target?.nodeType === 1 ? event.target : null;
    if (!target) return;
    if (target.closest('[data-plugin-picker-toggle]')) { setPicker(pickerPopover?.hidden !== false); return; }
    const beside = target.closest('[data-rail-beside]'), reopen = target.closest('[data-rail-reopen]');
    if (beside) { setPicker(false); host.openBeside?.(beside.dataset.railBeside); return; }
    if (reopen) { setPicker(false); host.startPage?.()?.reopen(Number(reopen.dataset.railReopen)); return; }
    // Choosing a plugin in the switcher (or the market or studio at its head) closes it.
    if (pickerPopover && !pickerPopover.hidden && target.closest('.plugin-rail-items [data-plugin-id], .plugin-rail-items a.plugin-rail-item, .plugin-picker-extend [data-plugin-id]')) requestAnimationFrame(() => setPicker(false));
  });
  // Search heads the switcher's list, so the list stays behind it while it is open. Dismissed (×, Esc, ⌘K), you are back
  // on 搜索 in the list; a chosen result opens elsewhere, so the list closes with it and focus waits on the switcher.
  const searchDialog = document.querySelector('[data-global-search-dialog]');
  let searchDismissed = false;
  document.addEventListener('click', (event) => { if (event.target?.nodeType === 1 && event.target.closest('[data-global-search-close]')) searchDismissed = true; }, true);
  document.addEventListener('keydown', (event) => {
    if (searchDialog?.open && (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'))) searchDismissed = true;
  }, true);
  searchDialog?.addEventListener('close', () => {
    const dismissed = searchDismissed; searchDismissed = false;
    if (dismissed || !pickerPopover || pickerPopover.hidden) return;
    setPicker(false);
    requestAnimationFrame(() => { if (document.activeElement === document.body) pickerToggle?.focus({ preventScroll: true }); });
  });
  document.addEventListener('click', (event) => {
    const inSearch = event.target?.nodeType === 1 && event.target.closest('[data-global-search-dialog]');
    const opensPicker = event.target?.nodeType === 1 && event.target.closest('[data-home-control="picker"]');
    if (pickerPopover && !pickerPopover.hidden && !inSearch && !opensPicker && !(event.target?.nodeType === 1 && picker?.contains(event.target))) setPicker(false);
  });
  document.addEventListener('molis-work:place-changed', () => { if (pickerPopover && !pickerPopover.hidden) setPicker(false); if (!host.tabsReady || host.tabsReady()) paintCurrentNow(); });
  addEventListener('molis:surface-interaction', () => { if (pickerPopover && !pickerPopover.hidden && !searchDialog?.open) setPicker(false); });
  addEventListener('blur', () => { if (pickerPopover && !pickerPopover.hidden && !searchDialog?.open) setPicker(false); });
  // ⌥↵ on a tile opens its plugin beside what is showing (PFG-23).
  pickerPopover?.addEventListener('keydown', (event) => {
    const tile = event.key === 'Enter' && event.altKey && event.target?.nodeType === 1 ? event.target.closest('.plugin-rail-tile [data-plugin-id]') : null;
    if (!tile) return;
    event.preventDefault(); setPicker(false); host.openBeside?.(tile.dataset.pluginId);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (event.target?.nodeType === 1 && event.target.closest('dialog[open]')) return;
    if (pickerPopover && !pickerPopover.hidden) { event.preventDefault(); setPicker(false); pickerToggle?.focus(); return; }
  });
  // What shows can change with nothing below to see it (the workspace coming up after the first paint, the side opening):
  // the strip's size changing, or the side saying so, paints the current one again (paintCurrent waits for the next frame).
  if ('ResizeObserver' in window) new ResizeObserver(paintCurrent).observe(dock);
  document.addEventListener('molis:side-shown', paintCurrent);
  new MutationObserver(paintCurrent).observe(document.querySelector('.tab-workspace') || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'class', 'data-exclusive'] });
  new MutationObserver(paintCurrent).observe(dock.querySelector('.plugin-rail-items') || dock, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  paintDock();
}`;
