/**
 * Adding a plugin to the project, or taking it away, without bringing the page back (specs/plugin-picker-dock).
 *
 * The request is the one the market makes. Then the page that follows the project's plugins is brought in line with what the
 * server renders now: each tile of the switcher in place (so its colour, glyphs and buttons change where they stand), the
 * stage pages a plugin brings or takes along, the Dock. The page is fetched once and only read; nothing is swapped wholesale,
 * so nothing a client holds (open panes, focus, scroll) is lost.
 *
 * What cannot be brought in line in place ends the old way, once: a plugin whose page parts are wired when the page loads
 * (RELOAD_ON_MEMBERSHIP_IDS), a part of the page this does not know changed, or a result that does not match what the server
 * renders. The page's state is saved and the page is loaded again.
 */
export const PLUGIN_MEMBERSHIP_FACTORY_SCRIPT = `(host) => {
  const { route, translate: L, projectId, saveUiState, showToast } = host;
  const rail = (root = document) => root.querySelector('.plugin-rail-items');
  const tiles = (root = document) => [...(rail(root)?.querySelectorAll('.plugin-rail-tile') || [])];
  const tileOf = (id, root = document) => tiles(root).find((tile) => tile.dataset.pluginTile === id) || null;
  const owned = (root = document) => new Set(tiles(root).filter((tile) => !tile.classList.contains('is-available')).map((tile) => tile.dataset.pluginTile));
  const nameOf = (id) => tileOf(id)?.querySelector('.plugin-rail-item > span')?.textContent || id;
  const reload = () => { try { saveUiState?.(); } catch {} location.reload(); };
  const keys = (nodes, key) => [...nodes].map(key).join(',');

  /* The parts of the page that depend on the project's plugins but are not brought in line here: if they differ, load again. */
  const unfollowed = (root) => [
    keys(tiles(root), (tile) => tile.dataset.pluginTile),
    keys(root.querySelectorAll('.directory-content-scroll > *'), (node) => node.dataset.pluginSection || node.dataset.directoryPanel || node.className),
    keys(root.querySelectorAll('[data-settings-section]'), (node) => node.dataset.settingsSection),
    keys(root.querySelectorAll('[data-side-tab]'), (node) => node.dataset.sideTab),
  ].join('|');
  // A plugin's stage page. The workbench moves the pages it shows out of the pool, so "there" means anywhere on the page.
  const poolOf = (root) => [...root.querySelectorAll('[data-surface-pool] > [data-work-surface]')];
  const stageOf = (root, id) => poolOf(root).find((node) => node.dataset.workSurface === id) || null;
  const livePage = (id) => [...document.querySelectorAll('[data-work-surface="' + CSS.escape(id) + '"]')].filter((node) => !node.parentElement?.closest('[data-work-surface]'));

  const attrs = (live, next, keep = []) => {
    for (const attr of [...live.attributes]) if (!keep.includes(attr.name) && !next.hasAttribute(attr.name)) live.removeAttribute(attr.name);
    for (const attr of [...next.attributes]) if (!keep.includes(attr.name) && live.getAttribute(attr.name) !== attr.value) live.setAttribute(attr.name, attr.value);
  };
  // What the client owns on a tile (kept in the Dock, being asked, busy) is left alone; everything else follows the server.
  const OWN = ['is-kept', 'is-confirming', 'is-busy'];
  const patchTile = (live, next) => {
    const classes = new Set([...live.classList].filter((name) => OWN.includes(name)));
    next.classList.forEach((name) => { if (!OWN.includes(name)) classes.add(name); });
    live.className = [...classes].join(' ');
    attrs(live, next, ['class']);
    const entry = live.querySelector(':scope > .plugin-rail-item'), entryNext = next.querySelector(':scope > .plugin-rail-item');
    if (entry && entryNext) attrs(entry, entryNext, ['class', 'tabindex']);
    const buttons = [...live.querySelectorAll(':scope > .plugin-rail-ops > button')], buttonsNext = [...next.querySelectorAll(':scope > .plugin-rail-ops > button')];
    buttons.forEach((button, index) => {
      const mate = buttonsNext[index]; if (!mate) return;
      // The pin's colour is the Dock's (this browser's choice) except Shelf's and 灵光's, which are always on; the cross's colour is the project's.
      const dockOwned = button.matches('.dock-keep:not([data-resident])');
      attrs(button, mate, dockOwned ? ['class', 'aria-pressed'] : ['class']);
      if (!dockOwned) button.className = mate.className;
      if (button.matches('[data-resident]')) live.classList.toggle('is-kept', mate.getAttribute('aria-pressed') === 'true');
      const words = button.querySelector('.mw-sr-only'), wordsNext = mate.querySelector('.mw-sr-only');
      if (words && wordsNext) words.textContent = wordsNext.textContent;
    });
  };
  // The stage pages that came with a plugin are put in the pool (they load their client when first shown, as every deferred
  // page does); the ones that went with a plugin are taken out. Pages the page already has are never replaced.
  const patchStages = (next, came, gone) => {
    const livePool = document.querySelector('[data-surface-pool]'); if (!livePool) return;
    for (const id of gone) if (!stageOf(next, id)) livePage(id).forEach((node) => { host.untrackSurface?.(node); node.remove(); });
    const nextNodes = poolOf(next);
    for (const id of came) {
      const theirs = stageOf(next, id);
      if (!theirs || livePage(id).length) continue;
      const later = nextNodes.slice(nextNodes.indexOf(theirs) + 1).map((node) => node.dataset.workSurface).find((key) => livePool.querySelector(':scope > [data-work-surface="' + CSS.escape(key) + '"]'));
      const node = document.importNode(theirs, true);
      livePool.insertBefore(node, later ? livePool.querySelector(':scope > [data-work-surface="' + CSS.escape(later) + '"]') : null);
      // The page keeps a list of its stage pages from when it loaded; a page that came since must be on it to be opened.
      host.trackSurface?.(node);
    }
  };
  // A dialog's choices can say what a plugin makes possible (Sessions offers Codex natively only when Coding is here).
  const patchChoices = (next) => {
    const liveDialogs = [...document.querySelectorAll('dialog')], nextDialogs = [...next.querySelectorAll('dialog')];
    if (liveDialogs.length !== nextDialogs.length) return;
    liveDialogs.forEach((dialog, index) => {
      const mine = [...dialog.querySelectorAll('option')], theirs = [...nextDialogs[index].querySelectorAll('option')];
      if (mine.length === theirs.length) mine.forEach((option, at) => { if (option.value === theirs[at].value) attrs(option, theirs[at], ['selected']); });
    });
  };
  const fetchPage = async () => {
    const response = await fetch(route('/') + (document.body.dataset.desktopShell === 'true' ? '?desktop=1' : ''), { cache: 'no-store', headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error('page');
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  };

  const follow = async (pluginId, adding, before) => {
    let next;
    try { next = await fetchPage(); } catch { reload(); return; }
    const after = owned(next);
    const came = [...after].filter((id) => !before.has(id)), gone = [...before].filter((id) => !after.has(id));
    const wired = (rail()?.dataset.reloadPlugins || '').split(' ').filter(Boolean);
    if ([...came, ...gone].some((id) => wired.includes(id)) || unfollowed(document) !== unfollowed(next)) { reload(); return; }
    // What leaves is left first: a pane showing it goes back to where it was.
    gone.forEach((id) => host.leavePlugin?.(id));
    const nextTiles = tiles(next);
    tiles().forEach((tile) => { const mate = nextTiles.find((other) => other.dataset.pluginTile === tile.dataset.pluginTile); if (mate) patchTile(tile, mate); });
    patchStages(next, came, gone); patchChoices(next);
    document.dispatchEvent(new CustomEvent('molis-work:plugins-changed', { detail: { came, gone } }));
    const same = (a, b) => [...a].sort().join() === [...b].sort().join();
    // What the page has must now be what the server renders; if it is not, no half-way: load it again.
    if (!same(owned(), after) || [...came, ...gone].some((id) => Boolean(stageOf(next, id)) !== (livePage(id).length > 0))) { reload(); return; }
    try { saveUiState?.(); } catch {}
    const also = [...came, ...gone].filter((id) => id !== pluginId);
    if (also.length) showToast?.((adding ? L('同时添加了：{list}') : L('同时移除了：{list}')).replace('{list}', also.map(nameOf).join('、')));
  };

  const run = async (pluginId, action, quiet) => {
    if (!projectId) return { ok: false, error: '' };
    const adding = action === 'add';
    const tile = tileOf(pluginId);
    const before = owned();
    tile?.classList.add('is-busy');
    // The tile answers at once; the server confirms, or the tile goes back.
    tile?.classList.toggle('is-available', !adding);
    try {
      const response = await fetch('/api/settings/projects/' + encodeURIComponent(projectId) + '/plugins', {
        method: adding ? 'POST' : 'DELETE', headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify({ plugin_id: pluginId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L(adding ? '无法添加插件' : '无法移除插件'));
      await follow(pluginId, adding, before);
      return { ok: true, result };
    } catch (error) {
      tile?.classList.toggle('is-available', adding);
      if (!quiet) showToast?.(error.message, true);
      return { ok: false, error: error.message };
    } finally { tile?.classList.remove('is-busy'); }
  };
  // One change at a time: the next starts from what the last one left. The market asks to report a failure itself.
  let chain = Promise.resolve();
  const change = (pluginId, action, options = {}) => (chain = chain.then(() => run(pluginId, action, options.quiet)));
  return { change };
}`;
