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
        offers: [], issues: [], loading: false, busy: false, reload: false, loadedAt: 0, error: '', result: null });
    }
    return states.get(key);
  };
  const persist = s => {
    try { const key = 'molis.home-action:' + s.key;
      if (s.pending) sessionStorage.setItem(key, JSON.stringify({ request_id: s.requestId, offer: s.pending }));
      else sessionStorage.removeItem(key);
    } catch { s.error = L('当前页面无法保存请求状态，请勿刷新，先到事项中核对执行结果。'); }
  };
  const render = () => {
    const node = root.querySelector('[data-home-offers]'), s = currentState(); if (!node || !s) return;
    if (!s.offers.length && !s.issues.length && !s.loading && !s.busy && !s.pending && !s.error && !s.result) { node.replaceChildren(); rendered.delete(node); return; }
    const recommended = current()?.suggested_behavior_ids || [];
    const offers = s.offers.map((offer, index) => ({ offer, index })).sort((a,b) => Number(recommended.includes(b.offer.recommendation_key)) - Number(recommended.includes(a.offer.recommendation_key)));
    const html = '<div class="home-offers-controls">' + offers.map(({offer,index}) => {
      return '<button type="button" class="mw-btn mw-btn--secondary" data-home-offer="' + index + '"' + (s.busy || s.loading || s.pending || !offer.availability.available ? ' disabled' : '') + '>' + esc(offer.title) + '</button>';
    }).join('') + '</div>' +
      (s.loading ? '<p role="status">' + L('正在查找可用动作…') + '</p>' : '') +
      (s.busy ? '<p role="status">' + L('正在执行，请稍候…') + '</p>' : '') +
      (!s.busy && s.pending ? '<p role="status">' + L('执行结果尚未确认。请打开事项核对；这项原请求不会再次提交。') + '</p>' : '') +
      [...s.issues, ...s.offers.filter(o => !o.availability.available).map(o => o.title + '：' + o.availability.reason)].map(message => '<p class="home-offers-note">' + esc(message) + '</p>').join('') +
      (s.error ? '<p role="alert">' + esc(typeof s.error==='string'?s.error:molisWorkRequest.text(s.error)) + '</p>' : '') +
      (s.result ? '<details class="home-offers-result"><summary>' + esc(s.result.title) + ' · ' + L('查看结果') + '</summary><pre>' + esc(JSON.stringify(s.result.result, null, 2)) + '</pre></details>' : '') +
      (!s.busy && (s.error || s.pending || s.issues.length) ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-offers-reload>' + L('重新读取事项') + '</button>' : '');
    if (rendered.get(node)?.html !== html || rendered.get(node)?.key !== s.key) {
      const keepResultOpen = rendered.get(node)?.key === s.key && node.querySelector('.home-offers-result')?.open;
      const scroller = root.querySelector('[data-home-scroll]'), top = scroller?.scrollTop;
      node.innerHTML = html; rendered.set(node, { html, key: s.key });
      if (scroller) scroller.scrollTop = top;
      if (keepResultOpen && node.querySelector('.home-offers-result')) node.querySelector('.home-offers-result').open = true;
    }
    if(s.error && typeof s.error!=='string')molisWorkRequest.show(node.querySelector('[role=alert]'),s.error);
  };
  const load = async s => {
    if (s.loading || s.busy) return;
    // Finish a real press before a background prepare can replace its button.
    if (root.querySelector('[data-home-offer]:active')) { s.reload = true; return; }
    s.reload = false; s.loading = true; s.error = ''; render();
    try { const result = await api('/api/home/actions/prepare', 'POST', { subject: s.subject, request_id: s.requestId }); s.offers = result.offers; s.issues = result.issues;
      if (s.pending && result.sources.some(source => JSON.stringify(ordered(source)) === JSON.stringify(ordered(s.pending.source)))
        && !s.offers.some(offer => identity(offer) === identity(s.pending))) { s.pending = null; persist(s); }
    }
    catch(error) { s.offers = []; s.error=error; }
    finally { s.loading = false; s.loadedAt = Date.now(); if (currentState() === s) render(); }
    if (s.reload && !s.busy) await load(s);
  };
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => setTimeout(() => {
    const s = currentState(); if (s?.reload) void load(s);
  }, 0));
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-home-offer], [data-home-offers-reload]'); if (!button) return;
    const s = currentState(); if (!s || s.busy || s.loading) return;
    if (button.hasAttribute('data-home-offers-reload')) { await refresh(); await load(s); return; }
    const offer = s.offers[Number(button.dataset.homeOffer)];
    if (!offer?.availability.available || s.pending) return;
    const { availability, ...requestOffer } = offer;
    s.pending = requestOffer; s.busy = true; s.error = ''; s.result = null; persist(s); render();
    try {
      s.result = await api('/api/home/actions/execute', 'POST', { subject: s.subject, request_id: s.requestId, offer: requestOffer });
      s.pending = null; persist(s); s.requestId = crypto.randomUUID();
      s.offers = []; s.busy = false; s.loading = true; render();
      await refresh();
    } catch(error) { s.error = error instanceof TypeError ? L('连接中断，尚未取得执行结果。请先核对事项状态。') : error; }
    finally { s.busy = false; s.loading = false; if (currentState() === s) render(); }
    if (!s.pending) await load(s);
  });
  return { refresh() { const s = currentState(); if (!s) return; s.reload = true; if (!s.loading && !s.busy) void load(s); }, render() { const s = currentState(); if (!s) return; render(); if (!s.loadedAt || Date.now() - s.loadedAt > 30000) load(s); } };
}`;
