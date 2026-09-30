import { pluginStageSummaries } from "../../plugin-catalog.js";
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
    const path = typeof event.composedPath === 'function' ? event.composedPath().filter((node) => node instanceof Element) : [];
    const along = (selector) => path.some((node) => node.matches(selector)) || Boolean(event.target instanceof Element && event.target.closest(selector));
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

  const setWindow = (id, open) => {
    if(id==='im')document.dispatchEvent(new CustomEvent(open?'molis:side-open':'molis:side-close',{detail:{}}));
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
    if (open) pickerPopover.querySelector('[aria-current], [data-plugin-id]')?.focus();
  };
  // What the work area shows: the current plugin, or one per pane when it is split, the focused pane first in weight.
  const shown = () => {
    const panes = [...document.querySelectorAll('.tab-workspace-panes > [data-tab-pane]')];
    const railCurrent = rail().find((node) => node.hasAttribute('aria-current'))?.dataset.pluginId || 'home';
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

  /* The Dock: 项目首页 always, then the plugins chosen in the Dock menu. */
  const PINS_KEY = 'molis-work:dock-pins';
  const pins = dock.querySelector('[data-dock-pins]');
  const choices = dock.querySelector('[data-dock-choices]');
  // Shelf and 灵光 already stay beside the Assistant; the Dock does not offer them twice.
  const residents = new Set([...dock.querySelectorAll('[data-bar-resident]')].map((node) => node.dataset.barResident));
  const readPins = () => {
    try { const value = JSON.parse(localStorage.getItem(PINS_KEY) || 'null'); if (Array.isArray(value)) return value.filter((id) => typeof id === 'string' && !residents.has(id)); } catch {}
    return ['goals', 'inbox', 'feed', 'sessions'];
  };
  const makePin = (id, fixed) => {
    const source = railItem(id);
    if (!source || !pins) return null;
    const pin = document.createElement('button');
    pin.type = 'button'; pin.className = 'dock-pin' + (fixed ? ' is-fixed' : ''); pin.dataset.dockPin = id;
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
      overflow.replaceChildren(...[...pins.querySelectorAll('[data-dock-pin][hidden]')].map((pin) => {
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
    const all = [...pins.querySelectorAll('[data-dock-pin]')];
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
  const paintDock = () => {
    if (!pins) return;
    const chosen = readPins();
    pins.replaceChildren(...[makePin('home', true), ...chosen.filter((id) => id !== 'home').map((id) => makePin(id, false))].filter(Boolean));
    fit();
  };
  const paintPins = () => {
    if (!pins) return;
    const chosen = readPins();
    if (choices) {
      choices.replaceChildren(...rail().filter((node) => node.dataset.pluginId !== 'home' && !residents.has(node.dataset.pluginId)).map((node) => {
        const id = node.dataset.pluginId;
        const row = document.createElement('button');
        row.type = 'button'; row.className = 'dock-choice'; row.dataset.dockChoice = id;
        row.setAttribute('aria-pressed', String(chosen.includes(id)));
        const glyph = glyphOf(id);
        const name = document.createElement('span'); name.textContent = labelOf(node);
        if (glyph) row.append(glyph); row.append(name);
        return row;
      }));
    }
    paintDock();
  };
  choices?.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest('[data-dock-choice]') : null;
    if (!row) return;
    const order = rail().map((node) => node.dataset.pluginId);
    const next = new Set(readPins());
    const on = row.getAttribute('aria-pressed') !== 'true';
    if (on) next.add(row.dataset.dockChoice); else next.delete(row.dataset.dockChoice);
    try { localStorage.setItem(PINS_KEY, JSON.stringify(order.filter((id) => next.has(id)))); } catch {}
    // The row changes in place, so focus and the menu stay where the person is.
    row.setAttribute('aria-pressed', String(on));
    paintDock();
  });
  // The bar's width is the window's; watching it (not the Dock itself) keeps folding from feeding back into itself.
  if (pins && 'ResizeObserver' in window) new ResizeObserver(() => fit()).observe(dock);

  /* 能力 opens in the workbench, in a cover like settings, rather than leaving the page. Its own page runs in a frame,
     so its filters and details keep working; the frame only drops the page's close chrome, and links that lead out of
     能力 open at the top. */
  const capabilitiesFrame = document.querySelector('[data-capabilities-frame]');
  const capabilitiesLink = dock.querySelector('[data-capabilities-open]');
  const fitCapabilities = () => {
    const doc = capabilitiesFrame?.contentDocument;
    if (!doc?.body) return;
    doc.documentElement.dataset.workbenchCover = 'capabilities';
    if (!doc.querySelector('style[data-workbench-cover]')) {
      const style = doc.createElement('style'); style.dataset.workbenchCover = '';
      // The page keeps a 44px row for the close chrome it no longer shows; the content takes the whole frame instead.
      style.textContent = '.project-preferences-chrome,.settings-nav-back{display:none!important}body.settings-page{grid-template-rows:minmax(0,1fr)!important}';
      doc.head.append(style);
    }
    doc.querySelectorAll('a[href]').forEach((link) => {
      const url = new URL(link.getAttribute('href'), doc.location.href);
      if (url.origin === location.origin && !url.pathname.startsWith('/capabilities')) link.target = '_top';
    });
  };
  capabilitiesFrame?.addEventListener('load', fitCapabilities);
  const loadCapabilities = (href) => {
    if (!capabilitiesFrame || !href) return;
    if (capabilitiesFrame.getAttribute('src') !== href) capabilitiesFrame.setAttribute('src', href);
  };
  const openCapabilities = (href) => {
    if (!host.setExclusive) { location.href = href; return; }
    loadCapabilities(href);
    host.setDirectory?.('root', true, false);
    host.setExclusive('capabilities');
  };
  capabilitiesLink?.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) return;
    event.preventDefault();
    openCapabilities(capabilitiesLink.href);
  });
  // A reload that restores the cover restores what it shows.
  const coverRoot = document.querySelector('[data-tab-workspace]');
  const restoreCover = () => { if (coverRoot?.dataset.exclusive === 'capabilities' && !capabilitiesFrame?.getAttribute('src')) loadCapabilities(capabilitiesLink?.href); };
  if (coverRoot) new MutationObserver(restoreCover).observe(coverRoot, { attributes: true, attributeFilter: ['data-exclusive'] });
  restoreCover();

  const searchKey = dock.querySelector('.bar-composer-search kbd');
  if (searchKey && !/Mac|iPhone|iPad/.test(navigator.platform)) searchKey.textContent = 'Ctrl K';

  /* The resident Assistant: its answer opens above the bar and stays until closed. */
  const panel = dock.querySelector('[data-assistant-panel]');
  const composer = dock.querySelector('[data-assistant-composer]');
  const setPanel = (open) => { if (panel) panel.hidden = !open; };
  composer?.addEventListener('submit', () => setPanel(true), true);

  dock.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const toggle = target.closest('[data-dock-toggle]');
    if (toggle) { const id = toggle.dataset.dockToggle; setWindow(id, document.body.dataset.sideOpen !== 'true'); return; }
    const collapse = target.closest('[data-dock-collapse]');
    if (collapse) { const id = collapse.closest('[data-dock-window]')?.dataset.dockWindow; if (id) setWindow(id, false); return; }
    if (target.closest('[data-assistant-panel-close]')) { setPanel(false); return; }
    if (target.closest('[data-plugin-picker-toggle]')) { setPicker(pickerPopover?.hidden !== false); return; }
    if (target.closest('[data-dock-more]')) { setOverflow(overflow?.hidden !== false); return; }
    const pin = target.closest('[data-dock-pin], [data-bar-resident]');
    if (pin) { setOverflow(false); railItem(pin.dataset.dockPin || pin.dataset.barResident)?.click(); return; }
    // Choosing a plugin in the switcher closes it; 全部插件 only opens the rest of the list.
    if (pickerPopover && !pickerPopover.hidden && target.closest('.plugin-rail-items [data-plugin-id], .plugin-rail-items a.plugin-rail-item')) requestAnimationFrame(() => setPicker(false));
  });
  document.addEventListener('click', (event) => {
    if (pickerPopover && !pickerPopover.hidden && !(event.target instanceof Element && picker?.contains(event.target))) setPicker(false);
    if (overflow && !overflow.hidden && !(event.target instanceof Element && event.target.closest('[data-dock-overflow], [data-dock-more]'))) setOverflow(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (pickerPopover && !pickerPopover.hidden) { event.preventDefault(); setPicker(false); pickerToggle?.focus(); return; }
    if (overflow && !overflow.hidden) { event.preventDefault(); setOverflow(false); more?.focus(); return; }
    const active = document.activeElement;
    const inside = active instanceof Element && active.closest('[data-dock-window]');
    if (inside) { event.preventDefault(); setWindow(inside.dataset.dockWindow, false); return; }
    if (panel && !panel.hidden && active instanceof Element && active.closest('[data-assistant-island]')) { event.preventDefault(); setPanel(false); }
  });
  new MutationObserver(paintCurrent).observe(document.querySelector('.tab-workspace') || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'class'] });
  new MutationObserver(paintCurrent).observe(dock.querySelector('.plugin-rail-items') || dock, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  paintPins();
}`;
