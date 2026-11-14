export const HOME_OFFERS_FACTORY_SCRIPT = `(host) => {
  const { root, current, projectKey, api, refresh, translate: readText, confirm } = host;
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
        offers: [], issues: [], loading: false, busy: false, reloadRequested: false, loadedAt: 0, error: '', result: null, confirming: null });
    }
    return states.get(key);
  };
  const persist = state => {
    try { const key = 'molis.home-action:' + state.key;
      if (state.pending) sessionStorage.setItem(key, JSON.stringify({ request_id: state.requestId, offer: state.pending }));
      else sessionStorage.removeItem(key);
    } catch { state.error = globalThis.t.text("workbench.home-offers.page-couldn-t-save-request-state-don-t"); }
  };
  const render = () => {
    const node = root.querySelector('[data-home-offers]'), state = currentState(); if (!node || !state) return;
    const recommended = current()?.suggested_behavior_ids || [];
    // R-65: without an automatic judgment result the panel says what automatic judgment can see; a result shows itself by its offers.
    const hint = recommended.length || current()?.subject.kind !== 'feed_item' ? '' : '<p class="home-offers-note">' + globalThis.t.text("workbench.home-offers.automatic-judgment-only-considers-actions-feed-has-been") + '</p>';
    if (!state.offers.length && !state.issues.length && !state.loading && !state.busy && !state.pending && !state.error && !state.result) {
      if (hint) { node.innerHTML = hint; rendered.set(node, { html: hint, key: state.key }); } else { node.replaceChildren(); rendered.delete(node); }
      return;
    }
    const offers = state.offers.map((offer, index) => ({ offer, index })).sort((a,b) => Number(recommended.includes(b.offer.recommendation_key)) - Number(recommended.includes(a.offer.recommendation_key)));
    const html = '<div class="home-offers-controls">' + offers.map(({offer,index}) => {
      return '<button type="button" class="mw-btn mw-btn--secondary" data-home-offer="' + index + '"' + (state.busy || state.loading || state.pending || !offer.availability.available ? ' disabled' : '') + '>' + esc(offer.title) + '</button>';
    }).join('') + '</div>' +
      (state.confirming ? '<div class="home-offers-controls"><strong>' + esc(state.confirming.title) + '</strong><button type="button" class="mw-btn mw-btn--ghost" data-home-offer-cancel>' + globalThis.t.text("common.control.cancel") + '</button><button type="button" class="mw-btn mw-btn--primary" data-home-offer-confirm>' + globalThis.t.text("workbench.home-offers.confirm") + '</button></div>' : '') +
      (state.loading ? '<p role="status">' + globalThis.t.text("workbench.home-offers.finding-available-actions") + '</p>' : '') +
      (state.busy ? '<p role="status">' + globalThis.t.text("workbench.home-offers.running-please-wait") + '</p>' : '') +
      (!state.busy && state.pending ? '<p role="status">' + globalThis.t.text("workbench.home-offers.result-isn-t-confirmed-yet-open-item-check") + '</p>' : '') +
      [...state.issues, ...state.offers.filter(o => !o.availability.available).map(o => o.title + globalThis.t.text('common.punctuation.label-separator') + o.availability.reason)].map(message => '<p class="home-offers-note">' + esc(message) + '</p>').join('') +
      (state.error ? '<p role="alert">' + esc(typeof state.error==='string'?state.error:molisWorkRequest.text(state.error)) + '</p>' : '') +
      (state.result ? '<details class="home-offers-result"><summary>' + esc(state.result.title) + ' · ' + globalThis.t.text("workbench.home-offers.view-result") + '</summary><pre>' + esc(JSON.stringify(state.result.result, null, 2)) + '</pre></details>' : '') +
      (!state.busy && (state.error || state.pending || state.issues.length) ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-offers-reload>' + globalThis.t.text("workbench.home-offers.reload-item") + '</button>' : '') + hint;
    if (rendered.get(node)?.html !== html || rendered.get(node)?.key !== state.key) {
      const keepResultOpen = rendered.get(node)?.key === state.key && node.querySelector('.home-offers-result')?.open;
      node.innerHTML = html; rendered.set(node, { html, key: state.key });
      // The offers as shown, in order, for the subject in view (ui.candidates); running one is the Host's action, the exit's record.
      const shownOffers = offers.map(({ offer }) => offer.offer_id || offer.recommendation_key || offer.title).join('\\n');
      if (host.records && offers.length && !state.loading && state.recorded !== shownOffers && (state.recorded = shownOffers)) host.records.record({ fact: 'ui.candidates', stage: 'presented', work: { work_ref: 'ui:home-offers:' + state.requestId },
        subjects: [host.records.subject(state.subject.kind, state.subject.id), ...offers.slice(0, 15).map(({ offer }) => host.records.subject('home_offer', offer.offer_id || offer.recommendation_key || offer.title))],
        detail: { list: 'home_offers', count: offers.length } });
      if (keepResultOpen && node.querySelector('.home-offers-result')) node.querySelector('.home-offers-result').open = true;
    }
    if(state.error && typeof state.error!=='string')molisWorkRequest.show(node.querySelector('[role=alert]'),state.error);
  };
  const load = async state => {
    if (state.loading || state.busy) return;
    state.reloadRequested = false; state.loading = true; state.error = ''; render();
    try { const result = await api('/api/home/actions/prepare', 'POST', { subject: state.subject, request_id: state.requestId }); state.offers = result.offers; state.issues = result.issues;
      if (state.pending && result.sources.some(source => JSON.stringify(ordered(source)) === JSON.stringify(ordered(state.pending.source)))
        && !state.offers.some(offer => identity(offer) === identity(state.pending))) { state.pending = null; persist(state); }
    }
    catch(error) { state.offers = []; state.error=error; }
    finally { state.loading = false; state.loadedAt = Date.now(); if (currentState() === state) render(); }
    if (state.reloadRequested && !state.busy) await load(state);
  };
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-home-offer], [data-home-offers-reload], [data-home-offer-confirm], [data-home-offer-cancel]'); if (!button || confirm && !event.isTrusted) return;
    const state = currentState(); if (!state || state.busy || state.loading) return;
    if (button.hasAttribute('data-home-offers-reload')) { await refresh(); await load(state); return; }
    if (button.hasAttribute('data-home-offer-cancel')) { state.confirming = null; render(); nodeFocus(); return; }
    const accepted = button.hasAttribute('data-home-offer-confirm');
    const offer = accepted ? state.confirming : state.offers[Number(button.dataset.homeOffer)];
    if (!offer?.availability.available || state.pending) return;
    if (confirm && !accepted) { state.confirming = offer; render(); root.querySelector('[data-home-offer-cancel]')?.focus(); return; }
    state.confirming = null;
    const { availability, ...requestOffer } = offer;
    state.pending = requestOffer; state.busy = true; state.error = ''; state.result = null; persist(state); render();
    try {
      state.result = await api('/api/home/actions/execute', 'POST', { subject: state.subject, request_id: state.requestId, offer: requestOffer });
      state.pending = null; persist(state); state.requestId = crypto.randomUUID();
      state.offers = []; state.busy = false; state.loading = true; render();
      await refresh();
    } catch(error) { state.error = error instanceof TypeError ? globalThis.t.text("workbench.home-offers.connection-dropped-before-result-arrived-check-item-s") : error; }
    finally { state.busy = false; state.loading = false; if (currentState() === state) render(); }
    if (!state.pending) await load(state);
    function nodeFocus() { root.querySelector('[data-home-offer]:not([disabled])')?.focus(); }
  });
  return { clear() { const state = currentState(); if (state) states.delete(state.key); root.querySelector('[data-home-offers]')?.replaceChildren(); }, refresh() { const state = currentState(); if (!state) return; state.reloadRequested = true; if (!state.loading && !state.busy) void load(state); }, render() { const state = currentState(); if (!state) return; render(); if (!state.loadedAt || Date.now() - state.loadedAt > 30000) load(state); } };
}`;
