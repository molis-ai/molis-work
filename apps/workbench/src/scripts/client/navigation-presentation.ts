import { DOCK_DEFAULT_PINS, pluginStageSummaries } from "../../plugin-catalog.js";
/** Menus of the bottom bar and the stage: presentation only; opening one never selects or starts a tool. */
export const NAVIGATION_PRESENTATION_SCRIPT = `(L) => {
  // Plugin list pages draw their heading from the surface's own label (craft-finish, "Plugin list pages").
  // The label is set once on the shell, so a plugin that re-renders its list keeps the heading.
  const STAGE_SUMMARIES = ${JSON.stringify(pluginStageSummaries())};
  const titleStages = () => document.querySelectorAll(':is(.plugin-stage-shell, .session-stage-shell)[data-work-surface-label]').forEach((shell) => {
    const title = JSON.stringify(L(shell.dataset.workSurfaceLabel || ''));
    if (shell.style.getPropertyValue('--stage-title') !== title) shell.style.setProperty('--stage-title', title);
    const summary = STAGE_SUMMARIES[shell.dataset.workSurface || ''];
    const desc = JSON.stringify(summary ? L(summary) : '');
    if (shell.style.getPropertyValue('--stage-desc') !== desc) shell.style.setProperty('--stage-desc', desc);
  });
  titleStages();
  const stageHost = document.querySelector('.immersive-plugin-stage');
  if (stageHost) new MutationObserver(titleStages).observe(stageHost, { childList: true });
  const dismiss = (event) => {
    // The project menu and the account menu close once something in them is chosen, on Escape, or on a click outside.
    // The path is taken at dispatch, so a row that re-rendered under the click still counts as inside its menu.
    const path = typeof event.composedPath === 'function' ? event.composedPath().filter((node) => node.nodeType === 1) : [];
    const along = (selector) => path.some((node) => node.matches(selector)) || Boolean(event.target?.nodeType === 1 && event.target.closest(selector));
    for (const menu of document.querySelectorAll('[data-project-menu][open], [data-global-menu][open], [data-feed-source-menu][open]')) {
      const inside = event.type !== 'keydown' && (path.includes(menu) || menu.contains(event.target));
      // Ticking a plugin for the Dock is a setting, not a destination: the menu stays for the next one.
      const chosen = inside && along('a, button') && !along('summary, [data-dock-choice]');
      if (event.type === 'keydown' ? event.key === 'Escape' : (!inside || chosen)) {
        const restore = menu.contains(document.activeElement) && event.type === 'keydown';
        menu.open = false;
        if (restore) menu.querySelector('summary').focus();
      }
    }
    for (const menu of document.querySelectorAll('.plugin-stage-more[open]')) {
      if (event.type === 'keydown' ? event.key === 'Escape' : !menu.contains(event.target)) {
        const restore = menu.contains(document.activeElement);
        menu.open = false;
        if (restore) menu.querySelector('summary').focus();
      }
    }
  };
  document.addEventListener('click', dismiss);
  document.addEventListener('keydown', dismiss);
}`;

/** The bottom bar. Left: the Dock menu, 项目首页 and the plugins chosen to stay; those that do not fit fold into
 * one overflow button instead of running under the Assistant. Centre: the resident Assistant with the plugin
 * switcher in front of it — one plugin, or one per pane when the work area is split. Right: Shelf and 灵光, the
 * side panel (discussion, browser and files, beside the work), then the project with its menu. Every button opens
 * its plugin through the switcher's own entry, so navigation has one path. Choices here are per-viewer conveniences. */
export const DOCK_SCRIPT = `(L, projectId, host = {}) => {
  if (document.body.hasAttribute('data-pane-embedded') || (window.parent !== window && new URLSearchParams(location.search).has('workbenchPane'))) return;
  const dock = document.querySelector('[data-dock]');
  if (!dock) return;
  const rail = () => [...dock.querySelectorAll('.plugin-rail-items [data-plugin-id]')];
  const railItem = (id) => dock.querySelector('.plugin-rail-items [data-plugin-id="' + CSS.escape(id) + '"]');
  const labelOf = (node) => node.querySelector('span')?.textContent?.trim() || node.getAttribute('title') || '';
  const glyphOf = (id) => railItem(id)?.querySelector('svg')?.cloneNode(true) || null;

  // Opened on purpose from the bar, the side panel takes focus (its current tab); opened by context it never does.
  const setWindow = (id, open, focus = false) => {
    if(id==='im')document.dispatchEvent(new CustomEvent(open?'molis:side-open':'molis:side-close',{detail:{focus}}));
  };

  /* The switcher. */
  const picker = dock.querySelector('[data-plugin-picker]');
  const pickerToggle = dock.querySelector('[data-plugin-picker-toggle]');
  const pickerPopover = dock.querySelector('[data-plugin-picker-popover]');
  const current = dock.querySelector('[data-plugin-picker-current]');
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
      const mark = pane.querySelector('.tab-strip [aria-current], .tab-strip .tab-view-chip');
      return { plugin: mark?.dataset.plugin || mark?.dataset.tabView || '', focused: pane.classList.contains('is-focused') };
    }).filter((entry) => entry.plugin);
  };
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
        const chip = document.createElement('span');
        chip.className = 'plugin-picker-chip is-focused is-cover';
        const glyph = source?.querySelector('svg')?.cloneNode(true);
        if (glyph) chip.append(glyph);
        const name = document.createElement('span');
        name.textContent = source?.querySelector(':scope > span')?.textContent || '';
        chip.append(name);
        current.replaceChildren(chip);
        current.parentElement?.classList.remove('is-split');
        dock.querySelectorAll('[data-dock-pin][aria-current], [data-bar-resident][aria-current]').forEach((button) => button.removeAttribute('aria-current'));
        more?.classList.remove('has-current');
        return;
      }
      const entries = shown();
      current.replaceChildren(...entries.map((entry) => {
        const chip = document.createElement('span');
        chip.className = 'plugin-picker-chip' + (entry.focused ? ' is-focused' : '');
        const glyph = glyphOf(entry.plugin);
        if (glyph) chip.append(glyph);
        const name = document.createElement('span');
        name.textContent = railItem(entry.plugin) ? labelOf(railItem(entry.plugin)) : entry.plugin;
        chip.append(name);
        return chip;
      }));
      current.parentElement?.classList.toggle('is-split', entries.length > 1);
      dock.querySelectorAll('[data-dock-pin], [data-bar-resident]').forEach((button) => {
        const id = button.dataset.dockPin || button.dataset.barResident;
        const on = entries.some((entry) => entry.plugin === id && entry.focused);
        if (on) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
      });
      if (more) {
        const hidden = [...pins.querySelectorAll('[data-dock-pin][hidden]')];
        more.classList.toggle('has-current', hidden.some((pin) => pin.hasAttribute('aria-current')));
      }
    });
  };

  /* The Dock: 项目首页 always, then the plugins chosen with the button at the end of their entry in the switcher. */
  const PINS_KEY = 'molis-work:dock-pins';
  const DEFAULT_PINS = ${JSON.stringify(DOCK_DEFAULT_PINS)};
  const pins = dock.querySelector('[data-dock-pins]');
  // Shelf and 灵光 already stay beside the Assistant; the Dock does not offer them twice.
  const residents = new Set([...dock.querySelectorAll('[data-bar-resident]')].map((node) => node.dataset.barResident));
  const readPins = () => {
    try { const value = JSON.parse(localStorage.getItem(PINS_KEY) || 'null'); if (Array.isArray(value)) return value.filter((id) => typeof id === 'string' && !residents.has(id)); } catch {}
    return DEFAULT_PINS.slice();
  };
  const makePin = (id, fixed, arriving = false) => {
    const source = railItem(id);
    if (!source || !pins) return null;
    const pin = document.createElement('button');
    pin.type = 'button'; pin.className = 'dock-pin' + (fixed ? ' is-fixed' : '') + (arriving ? ' is-arriving' : ''); pin.dataset.dockPin = id;
    if (arriving) pin.addEventListener('animationend', () => pin.classList.remove('is-arriving'), { once: true });
    pin.title = labelOf(source); pin.setAttribute('aria-label', labelOf(source));
    const glyph = glyphOf(id); if (glyph) pin.append(glyph);
    return pin;
  };
  /* What does not fit folds into one button at the end of the Dock; its list opens above it. */
  const more = pins && document.createElement('button');
  const overflow = pins && document.createElement('div');
  if (more && overflow) {
    more.type = 'button'; more.className = 'dock-pin dock-pin-more'; more.dataset.dockMore = '';
    more.setAttribute('aria-haspopup', 'true'); more.setAttribute('aria-expanded', 'false');
    overflow.className = 'dock-overflow'; overflow.dataset.dockOverflow = ''; overflow.hidden = true;
    pins.parentElement?.append(overflow);
  }
  const setOverflow = (open) => {
    if (!more || !overflow) return;
    if (open) {
      overflow.replaceChildren(...[...pins.querySelectorAll('[data-dock-pin][hidden]:not(.is-leaving)')].map((pin) => {
        const row = document.createElement('button');
        row.type = 'button'; row.className = 'dock-overflow-item'; row.dataset.dockPin = pin.dataset.dockPin;
        if (pin.hasAttribute('aria-current')) row.setAttribute('aria-current', 'page');
        const glyph = glyphOf(pin.dataset.dockPin); if (glyph) row.append(glyph);
        const name = document.createElement('span'); name.textContent = pin.getAttribute('aria-label') || ''; row.append(name);
        return row;
      }));
      const origin = pins.parentElement?.getBoundingClientRect().left ?? 0;
      overflow.style.left = Math.max(0, more.getBoundingClientRect().left - origin - 6) + 'px';
    }
    overflow.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    if (open) overflow.querySelector('button')?.focus();
  };
  const fit = () => {
    if (!pins || !more) return;
    const all = [...pins.querySelectorAll('[data-dock-pin]:not(.is-leaving)')];
    all.forEach((pin) => { pin.hidden = false; });
    more.remove();
    if (pins.scrollWidth <= pins.clientWidth + 1) { setOverflow(false); paintCurrent(); return; }
    pins.append(more);
    // 项目首页 never folds away; the rest leave from the end until the overflow button fits too.
    for (let index = all.length - 1; index > 0 && pins.scrollWidth > pins.clientWidth + 1; index -= 1) all[index].hidden = true;
    const count = all.filter((pin) => pin.hidden).length;
    more.textContent = '+' + count;
    more.title = L('更多常驻插件'); more.setAttribute('aria-label', L('更多常驻插件') + ' ' + count);
    if (overflow && !overflow.hidden) setOverflow(true);
    paintCurrent();
  };
  // The Dock keeps the buttons it has: one that is kept stays where it is, a new one lands, one that goes lets go.
  let dockPainted = false;
  const paintDock = () => {
    if (!pins) return;
    const wanted = ['home', ...readPins().filter((id) => id !== 'home')];
    const have = new Map([...pins.querySelectorAll('[data-dock-pin]:not(.is-leaving)')].map((pin) => [pin.dataset.dockPin, pin]));
    const next = [];
    for (const id of wanted) {
      if (!railItem(id)) continue;
      next.push(have.get(id) || makePin(id, id === 'home', dockPainted));
    }
    for (const [id, pin] of have) if (!next.includes(pin)) {
      pin.classList.add('is-leaving'); pin.setAttribute('aria-hidden', 'true'); pin.tabIndex = -1;
      setTimeout(() => pin.remove(), 260);
    }
    next.forEach((pin, index) => { if (pins.children[index] !== pin) pins.insertBefore(pin, pins.children[index] || null); });
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
    // The choice itself is this browser's. Shelf and 灵光 are always on, so their pin is never repainted.
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
    const message = list ? L('再点一次移除；同时移除：{list}').replace('{list}', list) : L('再点一次移除');
    tile.querySelector('.plugin-rail-confirm').textContent = message;
    const title = toggle.getAttribute('title');
    toggle.setAttribute('title', message);
    const label = toggle.getAttribute('aria-label') || '';
    const sure = L('确认移除') + label.slice(label.indexOf('：'));
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
  // The bar's width is the window's; watching it (not the Dock itself) keeps folding from feeding back into itself.
  if (pins && 'ResizeObserver' in window) new ResizeObserver(() => fit()).observe(dock);

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
    const toggle = target.closest('[data-dock-toggle]');
    if (toggle) { const id = toggle.dataset.dockToggle; setWindow(id, document.body.dataset.sideOpen !== 'true', true); return; }
    if (target.closest('[data-assistant-panel-close]')) { setPanel(false); return; }
    if (target.closest('[data-plugin-picker-toggle]')) { setPicker(pickerPopover?.hidden !== false); return; }
    if (target.closest('[data-dock-more]')) { setOverflow(overflow?.hidden !== false); return; }
    const pin = target.closest('[data-dock-pin], [data-bar-resident]');
    if (pin) {
      setOverflow(false);
      const id = pin.dataset.dockPin || pin.dataset.barResident;
      // Pressed again while its plugin is showing, an entry of the bar puts back what was there before it.
      if (host.leavePlugin?.(id)) return;
      railItem(id)?.click();
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
    if (overflow && !overflow.hidden && !(event.target?.nodeType === 1 && event.target.closest('[data-dock-overflow], [data-dock-more]'))) setOverflow(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (event.target?.nodeType === 1 && event.target.closest('dialog[open]')) return;
    if (pickerPopover && !pickerPopover.hidden) { event.preventDefault(); setPicker(false); pickerToggle?.focus(); return; }
    if (overflow && !overflow.hidden) { event.preventDefault(); setOverflow(false); more?.focus(); return; }
    const active = document.activeElement;
    const inside = active?.nodeType === 1 && active.closest('[data-dock-window]');
    if (inside) { event.preventDefault(); setWindow(inside.dataset.dockWindow, false); return; }
    if (panel && !panel.hidden && active?.nodeType === 1 && active.closest('[data-assistant-island]')) { event.preventDefault(); setPanel(false); }
  });
  new MutationObserver(paintCurrent).observe(document.querySelector('.tab-workspace') || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'class', 'data-exclusive'] });
  new MutationObserver(paintCurrent).observe(dock.querySelector('.plugin-rail-items') || dock, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  paintPins();
}`;
