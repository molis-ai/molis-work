export const HOME_OFFERS_FACTORY_SCRIPT = `(host) => {
  const { root, current, projectKey, api, refresh, translate: L } = host;
  const states = new Map();
  const rendered = new WeakMap();
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const keyOf = subject => JSON.stringify([projectKey, subject.kind, subject.id]);
  const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  const identity = offer => JSON.stringify(ordered([offer.source, offer.offer_id, offer.action, offer.input]));
  const currentState = () => {
    const event = current(); if (!event?.subject) return null;
    const key = keyOf(event.subject);
    if (!states.has(key)) {
      let pending = null; try { pending = JSON.parse(sessionStorage.getItem('molis.home-action:' + key) || 'null'); } catch {}
      states.set(key, { key, subject: event.subject, requestId: pending?.request_id || crypto.randomUUID(), pending: pending?.offer || null,
        offers: [], issues: [], loading: false, busy: false, reloadRequested: false, loadedAt: 0, error: '', result: null });
    }
    return states.get(key);
  };
  const persist = state => {
    try { const key = 'molis.home-action:' + state.key;
      if (state.pending) sessionStorage.setItem(key, JSON.stringify({ request_id: state.requestId, offer: state.pending }));
      else sessionStorage.removeItem(key);
    } catch { state.error = L('当前页面无法保存请求状态，请勿刷新，先到事项中核对执行结果。'); }
  };
  const render = () => {
    const node = root.querySelector('[data-home-offers]'), state = currentState(); if (!node || !state) return;
    if (!state.offers.length && !state.issues.length && !state.loading && !state.busy && !state.pending && !state.error && !state.result) { node.replaceChildren(); rendered.delete(node); return; }
    const recommended = current()?.suggested_behavior_ids || [];
    const offers = state.offers.map((offer, index) => ({ offer, index })).sort((a,b) => Number(recommended.includes(b.offer.recommendation_key)) - Number(recommended.includes(a.offer.recommendation_key)));
    const html = '<div class="home-offers-controls">' + offers.map(({offer,index}) => {
      return '<button type="button" class="mw-btn mw-btn--secondary" data-home-offer="' + index + '"' + (state.busy || state.loading || state.pending || !offer.availability.available ? ' disabled' : '') + '>' + esc(offer.title) + '</button>';
    }).join('') + '</div>' +
      (state.loading ? '<p role="status">' + L('正在查找可用动作…') + '</p>' : '') +
      (state.busy ? '<p role="status">' + L('正在执行，请稍候…') + '</p>' : '') +
      (!state.busy && state.pending ? '<p role="status">' + L('执行结果尚未确认。请打开事项核对；这项原请求不会再次提交。') + '</p>' : '') +
      [...state.issues, ...state.offers.filter(o => !o.availability.available).map(o => o.title + '：' + o.availability.reason)].map(message => '<p class="home-offers-note">' + esc(message) + '</p>').join('') +
      (state.error ? '<p role="alert">' + esc(state.error) + '</p>' : '') +
      (state.result ? '<details class="home-offers-result"><summary>' + esc(state.result.title) + ' · ' + L('查看结果') + '</summary><pre>' + esc(JSON.stringify(state.result.result, null, 2)) + '</pre></details>' : '') +
      (!state.busy && (state.error || state.pending || state.issues.length) ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-offers-reload>' + L('重新读取事项') + '</button>' : '');
    if (rendered.get(node)?.html !== html || rendered.get(node)?.key !== state.key) {
      const keepResultOpen = rendered.get(node)?.key === state.key && node.querySelector('.home-offers-result')?.open;
      node.innerHTML = html; rendered.set(node, { html, key: state.key });
      if (keepResultOpen && node.querySelector('.home-offers-result')) node.querySelector('.home-offers-result').open = true;
    }
  };
  const load = async state => {
    if (state.loading || state.busy) return;
    state.reloadRequested = false; state.loading = true; state.error = ''; render();
    try { const result = await api('/api/home/actions/prepare', 'POST', { subject: state.subject, request_id: state.requestId }); state.offers = result.offers; state.issues = result.issues;
      if (state.pending && result.sources.some(source => JSON.stringify(ordered(source)) === JSON.stringify(ordered(state.pending.source)))
        && !state.offers.some(offer => identity(offer) === identity(state.pending))) { state.pending = null; persist(state); }
    }
    catch(error) { state.offers = []; state.error = error.message || L('无法读取可用动作'); }
    finally { state.loading = false; state.loadedAt = Date.now(); if (currentState() === state) render(); }
    if (state.reloadRequested && !state.busy) await load(state);
  };
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-home-offer], [data-home-offers-reload]'); if (!button) return;
    const state = currentState(); if (!state || state.busy || state.loading) return;
    if (button.hasAttribute('data-home-offers-reload')) { await refresh(); await load(state); return; }
    const offer = state.offers[Number(button.dataset.homeOffer)];
    if (!offer?.availability.available || state.pending) return;
    const { availability, ...requestOffer } = offer;
    state.pending = requestOffer; state.busy = true; state.error = ''; state.result = null; persist(state); render();
    try {
      state.result = await api('/api/home/actions/execute', 'POST', { subject: state.subject, request_id: state.requestId, offer: requestOffer });
      state.pending = null; persist(state); state.requestId = crypto.randomUUID();
      state.offers = []; state.busy = false; state.loading = true; render();
      await refresh();
    } catch(error) { state.error = error instanceof TypeError ? L('连接中断，尚未取得执行结果。请先核对事项状态。') : error.message || L('暂时无法取得动作结果'); }
    finally { state.busy = false; state.loading = false; if (currentState() === state) render(); }
    if (!state.pending) await load(state);
  });
  return { refresh() { const state = currentState(); if (!state) return; state.reloadRequested = true; if (!state.loading && !state.busy) void load(state); }, render() { const state = currentState(); if (!state) return; render(); if (!state.loadedAt || Date.now() - state.loadedAt > 30000) load(state); } };
}`;
