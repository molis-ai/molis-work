/**
 * The project chooser, in the browser. The page arrives with the list and the bar; this program does what looking
 * through projects asks of it: preview one (its brief comes from the Host), search, move by keyboard, keep a draft for
 * the Assistant per project, and go in. It never decides what a project is — the brief is the Host's — and it never
 * blocks: every key and click works before anything has arrived.
 */
export const CHOOSER_CLIENT_SCRIPT = String.raw`
(() => {
  const L = globalThis.L || ((text) => text);
  const arrival = window.molisArrival;
  const root = document.querySelector('.arrival[data-screen="chooser"]');
  const dataNode = document.getElementById('arrival-data');
  if (!root || !dataNode || !arrival) return;
  const data = JSON.parse(dataNode.textContent || '{}');
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const detail = $('#chooser-detail'), list = $('#chooser-dir'), search = $('#chooser-q'), bar = $('.arrival-bar'), none = $('[data-chooser-none]');
  const PERSONAL = 'personal';
  const desktop = document.body.dataset.nativeDesktop === 'true';
  // A link the page already carries into the desktop shell (the rows do) is left as it is.
  const route = (path) => desktop && !/[?&]desktop=1(&|$)/.test(path) ? path + (path.includes('?') ? '&' : '?') + 'desktop=1' : path;
  const storage = {
    session: { get(key) { try { return sessionStorage.getItem(key); } catch { return null; } }, set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* per-viewer convenience only */ } } },
    local: { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ } } },
  };
  const state = { selected: data.selected, query: '', drafts: new Map(), draftOwner: data.selected, controller: null, loaded: new Map() };
  const rowOf = (id) => $$('.mw-dir-row', list).find((row) => row.dataset.id === id) || null;
  const nameOf = (id) => (id === PERSONAL ? data.personalTitle : rowOf(id)?.dataset.name) || '';
  const visibleRows = () => $$('.mw-dir-row', list).filter((row) => !row.hidden);
  const locale = () => (document.documentElement.lang || 'zh-CN');

  /* ───────── Time: “2 小时前”, kept true while the page is open ───────── */
  const dayKey = (date) => date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
  const ago = (iso) => {
    const at = iso ? new Date(iso) : null, now = new Date();
    if (!at || !Number.isFinite(at.getTime())) return '';
    const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));
    if (minutes < 1) return L('刚刚');
    if (minutes < 60) return L('{n} 分钟前', { n: minutes });
    if (minutes < 1440 && dayKey(at) === dayKey(now)) return L('{n} 小时前', { n: Math.round(minutes / 60) });
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (dayKey(at) === dayKey(yesterday)) return L('昨天');
    if (minutes < 10080) return L('{n} 天前', { n: Math.round(minutes / 1440) });
    return new Intl.DateTimeFormat(locale(), { month: 'numeric', day: 'numeric' }).format(at);
  };
  const refreshTimes = () => {
    $$('time[data-relative]', detail).forEach((node) => { node.textContent = ago(node.getAttribute('datetime')); });
    $$('.mw-dir-row', list).forEach((row) => {
      const caption = $('small', row), opened = row.dataset.openedAt;
      if (!caption || !opened || row.dataset.id === PERSONAL) return;
      const goal = row.dataset.current ? row.dataset.current + ' · ' : row.dataset.demo !== undefined ? L('演示数据') + ' · ' : '';
      caption.textContent = goal + ago(opened);
    });
  };

  /* ───────── Titlebar: the wordmark types once per launch; the caption cycles ───────── */
  const cold = (() => { if (storage.session.get('molis-work:arrived')) return false; storage.session.set('molis-work:arrived', '1'); return true; })();
  const wordmark = $('.arrival-titlebar .mw-wordmark');
  arrival.mountCaption($('.arrival-titlebar [data-caption]'));
  if (cold) arrival.typeWordmark(wordmark, { pace: 'quick', delay: 250 }); else arrival.settleWordmark(wordmark);

  /* ───────── The Assistant in the bar speaks for the project being looked at ───────── */
  const assistant = globalThis.__ARRIVAL_ASSISTANT__ || null;
  const composerInput = () => $('[data-assistant-input]', bar);
  const aboutSelection = () => {
    if (!state.selected || state.selected === PERSONAL) { assistant?.setProject(null); return; }
    assistant?.setProject({ id: state.selected, title: nameOf(state.selected) });
  };
  const swapDraft = (nextOwner) => {
    const input = composerInput();
    if (!input || state.draftOwner === nextOwner) return;
    state.drafts.set(state.draftOwner, input.value);
    state.draftOwner = nextOwner;
    input.value = state.drafts.get(nextOwner) || '';
    // The Assistant keeps its own copy of what is typed; tell it the words changed.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /* ───────── The bar's left block and the way in ───────── */
  const paintBar = () => {
    const id = state.selected, row = id ? rowOf(id) : null;
    const context = $('.bar-start', bar);
    const enter = $('[data-act="enter"]', bar);
    if (!id || !row) {
      context.innerHTML = '<div class="mw-bar-context" data-slot="bar-context"><span class="mw-bar-context__mark"><svg aria-hidden="true"><use href="#icon-search"></use></svg></span><span class="mw-bar-context__text"><strong></strong><small></small></span></div>';
      $('strong', context).textContent = L('没有匹配的项目');
      $('small', context).textContent = L('助理在个人空间里工作');
      enter.setAttribute('aria-disabled', 'true'); enter.removeAttribute('href');
      return;
    }
    context.innerHTML = '<div class="mw-bar-context" data-slot="bar-context"><span class="mw-bar-context__mark"></span><span class="mw-bar-context__text"><strong></strong><small></small></span></div>';
    $('.mw-bar-context__mark', context).innerHTML = row.dataset.mark || '';
    $('strong', context).textContent = nameOf(id);
    $('small', context).textContent = L('预览中 · 回车进入');
    enter.removeAttribute('aria-disabled');
    enter.setAttribute('href', route(row.dataset.href));
    $('[data-slot="button-label"]', enter).textContent = id === PERSONAL ? L('进入个人空间') : L('进入项目');
    arrival.arrive(context.firstElementChild, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 250 });
  };

  /* ───────── A project's brief ───────── */
  const cacheKey = (id) => 'molis-work:brief:v1:' + locale() + ':' + id;
  const readCache = (id) => { try { return JSON.parse(storage.local.get(cacheKey(id)) || 'null'); } catch { return null; } };
  const writeCache = (id, value) => storage.local.set(cacheKey(id), JSON.stringify(value));
  const fill = (template, values) => {
    const node = document.importNode($('template[data-tpl="' + template + '"]').content, true);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) for (const key of Object.keys(values)) text.nodeValue = text.nodeValue.split('{' + key + '}').join(values[key]);
    $$('[data-id="{id}"]', node).forEach((element) => element.setAttribute('data-id', values.id || ''));
    return node;
  };
  const show = (node, { animate = true } = {}) => {
    detail.replaceChildren(node);
    detail.scrollTop = 0;
    const brief = detail.firstElementChild;
    if (animate) {
      arrival.arrive(brief, [{ opacity: 0.4, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
      $$('.mw-goal-track__bar', brief).forEach((bar, index) => arrival.arrive(bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 420, delay: 120 + index * 45 }));
      arrival.cascade($$('.mw-brief__list .mw-dir-row, .mw-brief__recent li', brief), { delay: 160, step: 40 });
    }
    refreshTimes();
  };
  const setBrief = (html, id, options) => {
    const holder = document.createElement('template');
    holder.innerHTML = html;
    // Links into the project keep the desktop shell.
    $$('a[href^="/projects/"]', holder.content).forEach((link) => link.setAttribute('href', route(link.getAttribute('href'))));
    show(holder.content, options);
  };
  /** The row says what the brief found: how far along, what is current, what waits. */
  const paintRow = (summary) => {
    const row = rowOf(summary.project_id);
    if (!row) return;
    const headline = $('.mw-dir-row__headline', row);
    $('.mw-dir-row__count', headline)?.remove();
    $('.mw-dir-row__status', headline)?.remove();
    if (summary.goals_total) { const count = document.createElement('span'); count.className = 'mw-dir-row__count'; count.textContent = summary.goals_done + '/' + summary.goals_total; headline.append(count); }
    if (summary.waiting) {
      const status = document.createElement('span');
      status.className = 'mw-status mw-status--attention mw-status--plain mw-dir-row__status'; status.dataset.slot = 'status';
      status.innerHTML = '<svg aria-hidden="true"><use href="#icon-status-needs-you"></use></svg><span></span>';
      $('span', status).textContent = L('{n} 项等你', { n: summary.waiting });
      headline.append(status);
    }
    row.dataset.current = summary.current && summary.goals_done !== summary.goals_total ? summary.current : '';
    refreshTimes();
  };
  const SETTLE_MS = 160;
  const loadBrief = async (id, { force = false, immediate = false } = {}) => {
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;
    const cached = force ? null : readCache(id);
    if (cached && cached.html) { setBrief(cached.html, id); paintRow(cached.summary); }
    else show(fill('loading', { name: nameOf(id), id }), { animate: false });
    // Moving down the list asks the Host for nothing until the person stops on a project (it opens the project to read it).
    // What was read before shows at once; the first look and a retry do not wait.
    if (!immediate && !force) {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      if (controller.signal.aborted || state.selected !== id) return;
    }
    try {
      const response = await fetch('/api/projects/' + encodeURIComponent(id) + '/brief', { headers: globalThis.molisWorkControlHeaders(), signal: controller.signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L('请求失败，请重试'));
      if (controller.signal.aborted || state.selected !== id) return;
      paintRow(result.summary);
      writeCache(id, { html: result.html, summary: result.summary, at: Date.now() });
      // The brief that was already showing is left alone when nothing changed; a different one arrives.
      if (!cached || cached.html !== result.html) setBrief(result.html, id, { animate: !cached });
    } catch (error) {
      if (controller.signal.aborted || state.selected !== id) return;
      if (cached && cached.html) return;
      const node = fill('error', { name: nameOf(id), id });
      $('.mw-empty p', node).textContent = error && error.message ? error.message : L('这个项目没有及时响应。仍然可以直接进入它。');
      show(node, { animate: false });
    }
  };

  /* ───────── Selecting, searching, going in ───────── */
  const paintSelection = () => {
    $('.chooser').dataset.selected = state.selected || '';
    $$('.mw-dir-row', list).forEach((row) => {
      const on = row.dataset.id === state.selected;
      row.classList.toggle('is-selected', on);
      row.setAttribute('aria-selected', String(on));
      row.tabIndex = on ? 0 : -1;
    });
  };
  const pick = (id, { focus = false, scroll = true } = {}) => {
    if (id === state.selected) { if (focus) rowOf(id)?.focus({ preventScroll: true }); return; }
    state.selected = id;
    paintSelection();
    if (id) {
      const row = rowOf(id);
      if (scroll && row) {
        // The ends of the list go to the ends (the heading above the first row, the room below the last); the rest only as far as they need.
        const rows = visibleRows();
        if (row === rows[0]) list.scrollTop = 0; else if (row === rows[rows.length - 1]) list.scrollTop = list.scrollHeight; else row.scrollIntoView?.({ block: 'nearest' });
      }
      if (focus) row?.focus({ preventScroll: true });
    }
    swapDraft(id || PERSONAL);
    aboutSelection();
    paintBar();
    if (id) loadBrief(id);
  };
  const enterSelected = (id = state.selected) => {
    const row = id ? rowOf(id) : null;
    if (!row) return;
    storage.session.set('molis-work:arrived', '1');
    location.assign(route(row.dataset.href));
  };
  const showNone = (query) => {
    state.controller?.abort();
    show(fill('none', { q: query.trim() }), { animate: false });
  };
  const applySearch = () => {
    const query = state.query.trim().toLowerCase();
    let any = false;
    $$('.mw-dir-row', list).forEach((row) => {
      const hit = !query || (row.dataset.name || '').toLowerCase().includes(query) || (row.dataset.id === PERSONAL && data.personalTitle.toLowerCase().includes(query));
      row.hidden = !hit;
      if (hit) any = true;
    });
    // A heading with nothing under it goes quiet too.
    $$('[data-slot="directory-heading"]', list).forEach((heading) => {
      let next = heading.nextElementSibling, shown = false;
      while (next && next.getAttribute('data-slot') !== 'directory-heading') { if (!next.hidden) shown = true; next = next.nextElementSibling; }
      heading.hidden = !shown;
    });
    none.hidden = any || !query;
    const visible = visibleRows();
    if (!visible.length) { if (state.selected) state.previous = state.selected; state.selected = null; paintSelection(); swapDraft(PERSONAL); aboutSelection(); paintBar(); showNone(state.query); return; }
    if (!state.selected || !visible.some((row) => row.dataset.id === state.selected)) {
      const back = visible.find((row) => row.dataset.id === state.previous) || visible[0];
      state.selected = null;
      pick(back.dataset.id, { scroll: false });
    } else if (detail.querySelector('.brief-none')) { const id = state.selected; state.selected = null; pick(id, { scroll: false }); }
  };

  /* ───────── Events ───────── */
  root.addEventListener('click', (event) => {
    const row = event.target.closest('#chooser-dir .mw-dir-row');
    if (row) { pick(row.dataset.id); return; }
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    if (act === 'enter') { event.preventDefault(); if (target.getAttribute('aria-disabled') !== 'true') enterSelected(); }
    else if (act === 'enter-item' || act === 'new') storage.session.set('molis-work:arrived', '1');
    else if (act === 'clear-search') { search.value = ''; state.query = ''; applySearch(); search.focus(); }
    else if (act === 'new-named') { event.preventDefault(); location.assign(route('/onboarding?mode=new-project&name=' + encodeURIComponent(state.query.trim()))); }
    else if (act === 'retry-brief') { if (state.selected) loadBrief(state.selected, { force: true }); }
    else if (act === 'reload') location.reload();
    else if (act === 'prefill') { const input = composerInput(); if (input) { input.value = target.dataset.text || ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); } }
  });
  root.addEventListener('dblclick', (event) => { const row = event.target.closest('#chooser-dir .mw-dir-row'); if (row) { pick(row.dataset.id); enterSelected(row.dataset.id); } });
  search.addEventListener('input', () => { state.query = search.value; applySearch(); });
  search.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const row = state.selected ? rowOf(state.selected) : visibleRows()[0]; row?.focus(); }
    else if (event.key === 'Enter') { event.preventDefault(); enterSelected(); }
    else if (event.key === 'Escape' && search.value) { event.preventDefault(); search.value = ''; state.query = ''; applySearch(); }
  });
  list.addEventListener('keydown', (event) => {
    const row = event.target.closest('.mw-dir-row');
    if (!row) return;
    const rows = visibleRows(), at = rows.indexOf(row);
    let next = -1;
    if (event.key === 'ArrowDown') next = Math.min(rows.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;
    else if (event.key === 'Enter') { event.preventDefault(); enterSelected(row.dataset.id); return; }
    if (next >= 0) { event.preventDefault(); pick(rows[next].dataset.id, { focus: true }); }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.focus(); search.select(); return; }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (event.key === 'Enter' && !typing && !event.defaultPrevented && !event.isComposing && !document.querySelector('dialog[open], [popover]:popover-open') && !document.activeElement?.closest?.('button, a, [role="option"], summary')) {
      event.preventDefault(); enterSelected();
    }
  });
  window.addEventListener('focus', refreshTimes);
  window.addEventListener('pageshow', (event) => { if (event.persisted) { refreshTimes(); if (state.selected) loadBrief(state.selected); } });

  /* ───────── Arrival ───────── */
  const first = state.selected;
  $$('.mw-dir-row', list).forEach((row) => { if (row.dataset.id !== PERSONAL) { const summary = readCache(row.dataset.id)?.summary; if (summary) paintRow(summary); } });
  refreshTimes();
  aboutSelection();
  const input = composerInput();
  if (input) state.drafts.set(first, input.value);
  const base = cold ? 120 : 40;
  arrival.cascade($$('.mw-dir-row', list), { delay: base, step: 28 });
  arrival.arrive($('.chooser-head'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: base - 40 });
  arrival.arrive($('.chooser-search'), [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: base });
  arrival.arrive(bar, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: cold ? 60 : 0 });
  // With no project yet, the sheet says where to begin; when the list could not be read that is not known, and the personal space is what is there to look at.
  if (!data.projects.length && first === PERSONAL && !data.loadError) show(fill('nobody', {}), { animate: false });
  else loadBrief(first, { immediate: true });
})();
`;
