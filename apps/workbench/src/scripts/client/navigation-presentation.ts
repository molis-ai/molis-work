import { dockDefaultPins, pluginStageSummaries } from "../../plugin-catalog.js";
import { UNAVAILABLE_STAGE } from "../../unavailable-plugin-stage.js";
/** Menus of the bottom bar and the stage: presentation only; opening one never selects or starts a tool. */
export const NAVIGATION_PRESENTATION_SCRIPT = `(readText) => {
  // Plugin list pages draw their heading from the surface's own label (craft-finish, "Plugin list pages").
  // The label is set once on the shell, so a plugin that re-renders its list keeps the heading.
  // [the Plugin's id, its summary] by work surface.
  const STAGE_SUMMARIES = ${JSON.stringify(Object.fromEntries(Object.entries(pluginStageSummaries()).map(([id, { plugin_id, summary }]) => [id, [plugin_id, summary]])))};
  const titleStages = () => document.querySelectorAll('.plugin-stage-shell[data-work-surface-label]').forEach((shell) => {
    const title = JSON.stringify((shell.dataset.workSurfaceLabel || ''));
    if (shell.style.getPropertyValue('--stage-title') !== title) shell.style.setProperty('--stage-title', title);
    const summary = STAGE_SUMMARIES[shell.dataset.workSurface || ''];
    // The summary is the Plugin's own text: English from its own words.
    const desc = JSON.stringify(summary ? summary[1] : '');
    if (shell.style.getPropertyValue('--stage-desc') !== desc) shell.style.setProperty('--stage-desc', desc);
  });
  titleStages();
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
      // Ticking a plugin for the Dock is a setting, not a destination: the menu stays for the next one.
      if (inside && along('a, button') && !along('summary, [data-dock-choice]')) menu.open = false;
    }
  };
  document.addEventListener('click', dismiss);
}`;

/** The bottom bar in three zones (07-1 S4b). Left: the switcher as its glyph alone, whose name says what the work area shows
 * (one plugin, or one per pane when split), then the Dock: 项目首页 and the project's plugins chosen to stay. Centre: the
 * resident Assistant. Right: the person's own plugins chosen to stay (those the directory marks `personal`), then the project
 * with its menu. One list of kept plugins feeds both trays; every button opens its plugin through the switcher's own entry, so
 * navigation has one path. A plugin that did not start carries the amber point here and in the switcher. Choices here are
 * per-viewer conveniences.
 *
 * What a tray folds (`fit`): the pins leave from the end until the "+N" button fits with them, and 项目首页 never
 * folds (specs/craft-finish, round four). When even 项目首页 and "+N" do not fit (a phone's second row under 356px with
 * a directory button), the "+N" button goes too: the switcher lists every plugin, the kept ones included, so nothing is
 * lost. */
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
  const current = dock.querySelector('[data-plugin-picker-current]');
  // The switcher is its glyph alone: its name says what the work area shows, so a screen reader hears where it is.
  const nameSwitcher = (names) => {
    const label = globalThis.t.text("workbench.navigation-presentation.switch-plugin-now-now").replace('{now}', names.join(globalThis.t.text("common.list.separator")));
    if (pickerToggle && pickerToggle.getAttribute('aria-label') !== label) pickerToggle.setAttribute('aria-label', label);
  };
  const setPicker = (open) => {
    if (!pickerPopover || !pickerToggle) return;
    pickerPopover.hidden = !open;
    pickerToggle.setAttribute('aria-expanded', String(open));
    if (open) pickerPopover.querySelector('.plugin-rail-items [aria-current], .plugin-rail-items [data-plugin-id]')?.focus(); else stopAsking();
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
  // The label is rebuilt only when what it shows changed: a press that lands on it while the Dock refits still ends on the
  // node it started on, so it is a click.
  const put = (...chips) => { const next = current.cloneNode(); next.append(...chips); if (!next.isEqualNode(current)) current.replaceChildren(...chips); };
  let paintQueued = false;
  const paintCurrent = () => {
    if (paintQueued || !current) return;
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      // A cover (settings, the market) is what the person looks at: the switcher names it and no
      // Dock entry claims to be current underneath it.
      const cover = document.querySelector('[data-tab-workspace]')?.dataset.exclusive;
      if (cover) {
        const source = document.querySelector('[data-cover-chip]');
        put(chipOf(' is-focused is-cover', source?.querySelector('svg')?.cloneNode(true), source?.querySelector(':scope > span')?.textContent || ''));
        nameSwitcher([source?.querySelector(':scope > span')?.textContent || '']);
        current.parentElement?.classList.remove('is-split');
        dock.querySelectorAll('[data-dock-pin][aria-current]').forEach((button) => button.removeAttribute('aria-current'));
        trays.forEach((tray) => tray.more.classList.remove('has-current'));
        return;
      }
      const entries = shown();
      put(...entries.map((entry) => chipOf(entry.focused ? ' is-focused' : '', glyphOf(entry.plugin), nameOf(entry.plugin))));
      nameSwitcher(entries.map((entry) => nameOf(entry.plugin)));
      current.parentElement?.classList.toggle('is-split', entries.length > 1);
      dock.querySelectorAll('[data-dock-pin]').forEach((button) => {
        const id = button.dataset.dockPin;
        const on = entries.some((entry) => entry.plugin === id && entry.focused);
        if (on) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
      });
      trays.forEach((tray) => tray.more.classList.toggle('has-current', [...tray.pins.querySelectorAll('[data-dock-pin][hidden]')].some((pin) => pin.hasAttribute('aria-current'))));
    });
  };

  /* The Dock: 项目首页 always, then the plugins chosen with the button at the end of their entry in the switcher; those in the
     switcher's 个人 group (the tile says its group) sit in the right tray instead. */
  const PINS_KEY = 'molis-work:dock-pins';
  const DEFAULT_PINS = ${JSON.stringify(dockDefaultPins())};
  const pins = dock.querySelector('[data-dock-pins]'), own = dock.querySelector('[data-bar-own]');
  const personal = new Set([...dock.querySelectorAll('[data-plugin-tile][data-rail-group="personal"]')].map((tile) => tile.dataset.pluginTile));
  // A plugin that did not start keeps its place and its stage says why; wherever it is named here it carries the amber point.
  const failed = (id) => Boolean(document.querySelector('[data-work-surface="' + CSS.escape(id) + '"]${UNAVAILABLE_STAGE}'));
  const warn = (node, id) => { if (failed(id) && !node.querySelector(':scope > .nav-warn-dot')) node.insertAdjacentHTML('beforeend', '<span class="nav-warn-dot" aria-hidden="true"></span>'); };
  rail().forEach((item) => warn(item, item.dataset.pluginId));
  const readPins = () => {
    try { const value = JSON.parse(localStorage.getItem(PINS_KEY) || 'null'); if (Array.isArray(value)) return value.filter((id) => typeof id === 'string'); } catch {}
    return DEFAULT_PINS.slice();
  };
  const makePin = (id, fixed, arriving = false) => {
    const source = railItem(id);
    if (!source) return null;
    const pin = document.createElement('button');
    pin.type = 'button'; pin.className = 'dock-pin' + (fixed ? ' is-fixed' : '') + (arriving ? ' is-arriving' : ''); pin.dataset.dockPin = id;
    if (arriving) pin.addEventListener('animationend', () => pin.classList.remove('is-arriving'), { once: true });
    pin.title = labelOf(source); pin.setAttribute('aria-label', labelOf(source) + (failed(id) ? ' · ' + globalThis.t.text("workbench.navigation-presentation.didn-t-start") : ''));
    const glyph = glyphOf(id); if (glyph) pin.append(glyph);
    warn(pin, id);
    return pin;
  };
  /* What does not fit in a tray folds into one button at its end; its list opens above it. */
  const makeTray = (container, label) => {
    if (!container) return null;
    const more = document.createElement('button'), overflow = document.createElement('div');
    more.type = 'button'; more.className = 'dock-pin dock-pin-more'; more.dataset.dockMore = '';
    more.setAttribute('aria-haspopup', 'true'); more.setAttribute('aria-expanded', 'false');
    overflow.className = 'dock-overflow'; overflow.dataset.dockOverflow = ''; overflow.hidden = true;
    container.parentElement?.append(overflow);
    const tray = { pins: container, more, overflow };
    tray.setOverflow = (open) => {
      if (open) {
        overflow.replaceChildren(...[...container.querySelectorAll('[data-dock-pin][hidden]:not(.is-leaving)')].map((pin) => {
          const row = document.createElement('button');
          row.type = 'button'; row.className = 'dock-overflow-item'; row.dataset.dockPin = pin.dataset.dockPin;
          if (pin.hasAttribute('aria-current')) row.setAttribute('aria-current', 'page');
          const glyph = glyphOf(pin.dataset.dockPin); if (glyph) row.append(glyph);
          const name = document.createElement('span'); name.textContent = pin.getAttribute('aria-label') || ''; row.append(name);
          warn(row, pin.dataset.dockPin);
          return row;
        }));
        const origin = container.parentElement?.getBoundingClientRect() ?? { left: 0, right: 0 }, at = more.getBoundingClientRect();
        // The right tray's list opens toward the middle of the window, as the left one's does.
        if (container === own) { overflow.style.left = 'auto'; overflow.style.right = Math.max(0, origin.right - at.right - 6) + 'px'; }
        else overflow.style.left = Math.max(0, at.left - origin.left - 6) + 'px';
      }
      overflow.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
      if (open) overflow.querySelector('button')?.focus();
    };
    tray.fit = () => {
      const all = [...container.querySelectorAll('[data-dock-pin]:not(.is-leaving)')];
      all.forEach((pin) => { pin.hidden = false; });
      more.remove();
      if (container.scrollWidth <= container.clientWidth + 1) { tray.setOverflow(false); return; }
      container.append(more);
      // 项目首页 never folds; the right tray has no such pin and can fold every one of its own.
      const keep = container === pins ? 1 : 0;
      for (let index = all.length; --index >= keep && container.scrollWidth > container.clientWidth + 1;) all[index].hidden = true;
      if (container.scrollWidth > container.clientWidth + 1) more.remove();
      const count = all.filter((pin) => pin.hidden).length;
      more.textContent = '+' + count;
      more.title = label; more.setAttribute('aria-label', label + ' ' + count);
      if (!overflow.hidden) tray.setOverflow(more.isConnected);
    };
    return tray;
  };
  const trays = [makeTray(pins, globalThis.t.text("workbench.navigation-presentation.more-pinned-plugins")), makeTray(own, globalThis.t.text("workbench.navigation-presentation.own"))].filter(Boolean);
  const fit = () => { trays.forEach((tray) => tray.fit()); paintCurrent(); };
  const closeOverflows = (except) => trays.forEach((tray) => { if (tray !== except && !tray.overflow.hidden) tray.setOverflow(false); });
  // The trays keep the buttons they have: one that is kept stays where it is, a new one lands, one that goes lets go.
  let dockPainted = false;
  const paintTray = (container, wanted) => {
    const have = new Map([...container.querySelectorAll('[data-dock-pin]:not(.is-leaving)')].map((pin) => [pin.dataset.dockPin, pin]));
    const next = [];
    for (const id of wanted) {
      if (!railItem(id)) continue;
      const pin = have.get(id) || makePin(id, id === 'home', dockPainted);
      if (pin) next.push(pin);
    }
    for (const [, pin] of have) if (!next.includes(pin)) {
      pin.classList.add('is-leaving'); pin.setAttribute('aria-hidden', 'true'); pin.tabIndex = -1;
      setTimeout(() => pin.remove(), 260);
    }
    next.forEach((pin, index) => { if (container.children[index] !== pin) container.insertBefore(pin, container.children[index] || null); });
  };
  const paintDock = () => {
    if (!pins) return;
    const kept = readPins().filter((id) => id !== 'home');
    paintTray(pins, ['home', ...kept.filter((id) => !personal.has(id))]);
    if (own) {
      const mine = kept.filter((id) => personal.has(id) && railItem(id));
      paintTray(own, mine);
      // The bar's columns read this mark (navigation-flow.ts), not a :has() over the whole bar (VUX-36).
      dock.toggleAttribute('data-own-kept', mine.length > 0);
    }
    dockPainted = true;
    fit();
  };
  // The pin at the end of each entry says whether its plugin is in the Dock: graphite while it is, grey while not.
  const markKept = (button, on) => {
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('mw-btn--primary', on);
    button.classList.toggle('mw-btn--secondary', !on);
    button.closest('.plugin-rail-tile')?.classList.toggle('is-kept', on);
  };
  const paintPins = () => {
    if (!pins) return;
    // The choice itself is this browser's.
    const chosen = readPins();
    dock.querySelectorAll('[data-dock-choice]:not(:disabled)').forEach((button) => markKept(button, chosen.includes(button.dataset.dockChoice)));
    paintDock();
  };
  // A plugin was added to or removed from this project in place: the Dock follows what the project has.
  document.addEventListener('molis-work:plugins-changed', () => paintPins());

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
    const list = (tile.dataset.dependents || '').split('|').filter(Boolean).join('、');
    const message = list ? globalThis.t.text("workbench.navigation-presentation.press-again-remove-also-removes-list").replace('{list}', list) : globalThis.t.text("workbench.navigation-presentation.press-again-remove");
    tile.querySelector('.plugin-rail-confirm').textContent = message;
    const title = toggle.getAttribute('title');
    toggle.setAttribute('title', message);
    const label = toggle.getAttribute('aria-label') || '';
    const sure = globalThis.t.text("workbench.navigation-presentation.confirm-removal") + label.slice(label.indexOf('：'));
    toggle.setAttribute('aria-label', sure);
    const words = toggle.querySelector('.mw-sr-only'); if (words) words.textContent = sure;
    tile.classList.add('is-confirming');
    asking = { tile, button: toggle, label, title, timer: setTimeout(stopAsking, 3200) };
  });
  dock.addEventListener('click', (event) => {
    const row = event.target?.nodeType === 1 ? event.target.closest('[data-dock-choice]') : null;
    if (!row || row.disabled) return;
    const order = rail().map((node) => node.dataset.pluginId);
    const next = new Set(readPins());
    const on = row.getAttribute('aria-pressed') !== 'true';
    if (on) next.add(row.dataset.dockChoice); else next.delete(row.dataset.dockChoice);
    // The choice is the browser's, not the project's: a plugin this project does not have keeps its place for the ones that do.
    const away = [...next].filter((id) => !order.includes(id));
    try { localStorage.setItem(PINS_KEY, JSON.stringify([...order.filter((id) => next.has(id)), ...away])); } catch {}
    // The button changes in place, so focus and the list stay where the person is.
    markKept(row, on);
    paintDock();
  });
  // The bar's width is the window's; watching it (not the Dock itself) keeps folding from feeding back into itself. The right
  // group too: a directory button joins it after the first fit. And the switcher, whose name (a long plugin name) takes room
  // from the pins.
  if (pins && 'ResizeObserver' in window) { const watcher = new ResizeObserver(() => fit()); for (const node of [dock, dock.querySelector('.bar-end'), dock.querySelector('.plugin-picker'), own]) if (node) watcher.observe(node); }

  const searchKey = dock.querySelector('.plugin-picker-search kbd');
  if (searchKey && !/Mac|iPhone|iPad/.test(navigator.platform)) searchKey.textContent = 'Ctrl K';

  /* The resident Assistant: its answer opens above the bar and stays until closed. */
  const panel = dock.querySelector('[data-assistant-panel]');
  const composer = dock.querySelector('[data-assistant-composer]');
  const setPanel = (open) => { if (panel) panel.hidden = !open; };
  composer?.addEventListener('submit', () => setPanel(true), true);

  dock.addEventListener('click', (event) => {
    const target = event.target?.nodeType === 1 ? event.target : null;
    if (!target) return;
    if (target.closest('[data-plugin-picker-toggle]')) { setPicker(pickerPopover?.hidden !== false); return; }
    const moreOf = target.closest('[data-dock-more]'), tray = moreOf && trays.find((candidate) => candidate.more === moreOf);
    if (tray) { closeOverflows(tray); tray.setOverflow(tray.overflow.hidden); return; }
    const pin = target.closest('[data-dock-pin]');
    if (pin) {
      closeOverflows();
      const id = pin.dataset.dockPin;
      // Pressed again while its plugin is showing, an entry of the bar puts back what was there before it.
      if (host.leavePlugin?.(id)) return;
      host.open?.(id, railItem(id));
      return;
    }
    // Choosing a plugin in the switcher (or the market or studio at its head) closes it; the Dock buttons keep it open.
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
    if (pickerPopover && !pickerPopover.hidden && !inSearch && !(event.target?.nodeType === 1 && picker?.contains(event.target))) setPicker(false);
    if (!(event.target?.nodeType === 1 && event.target.closest('[data-dock-overflow], [data-dock-more]'))) closeOverflows();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (event.target?.nodeType === 1 && event.target.closest('dialog[open]')) return;
    if (pickerPopover && !pickerPopover.hidden) { event.preventDefault(); setPicker(false); pickerToggle?.focus(); return; }
    const opened = trays.find((tray) => !tray.overflow.hidden);
    if (opened) { event.preventDefault(); opened.setOverflow(false); opened.more.focus(); return; }
    const active = document.activeElement;
    if (panel && !panel.hidden && active?.nodeType === 1 && active.closest('[data-assistant-island]')) { event.preventDefault(); setPanel(false); }
  });
  new MutationObserver(paintCurrent).observe(document.querySelector('.tab-workspace') || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'class', 'data-exclusive'] });
  new MutationObserver(paintCurrent).observe(dock.querySelector('.plugin-rail-items') || dock, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  paintPins();
}`;
