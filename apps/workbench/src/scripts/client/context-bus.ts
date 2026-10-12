/**
 * What the person has in hand and what to do about it: the bus takes a surface's focus (from this document or a split
 * pane's frame), asks the Host for the candidates by rules at once and by the judgment shortly after, and hands a
 * choice to the page that owns the object or to the Assistant as a prepared card. Also the Assistant's starters and the
 * listeners that clear what was in hand. A fragment of the factory script in context-actions.ts: it shares that
 * closure (host, L, post, deliver, bar, ...) and is joined there in the order the text had before the split.
 *
 * Notes on the parts below (kept here, not in the script, because the script ships to every page):
 * - `set`: the person reaching for the row (pointer on it, or its focus) as what they had in hand lapses — a finished step's
 *   moment passing, say — keeps it until they leave; a surface that went away is cleared regardless. While writing, every
 *   keystroke is a new context: the row stays as it is (no dimming) and nothing is asked until the typing pauses; a selection
 *   is shown by rules at once and judged almost at once.
 * - `watch`: a surface that goes out of sight voids what was in hand there, looked for only while something is in hand.
 * - `signal`: what the person did with an offered action, for the memory to count (its capability and title, never the
 *   content). Nothing waits on it and nothing breaks without it.
 * - `choose`: a write goes to the Assistant as a prepared card; when no page here takes the choice (several objects, or a
 *   surface without its own handler) it is a card too, and only when even that fails the Assistant gets the words and the
 *   material. A card carries the exact action and its complete input; the Assistant runs it only when the person clicks,
 *   and the click places it (POST /api/assistant/cards) and opens the panel on that work.
 * - `starters` (spec §6.4.2): what the directory offers for the whole object open now, by rules only (no judgment for opening
 *   a page), or the plan on show while something is in hand; the Assistant shows them and hands a click back, so it runs
 *   exactly as a click on the row would. A plugin switched off or a grant withdrawn shows within the cache time; choosing
 *   checks again anyway.
 * - `chooseFrom`: a menu that shows the same plan (Pages' writing menu) chooses exactly as a click on the row does, also after
 *   the person put the row away for this passage.
 */
export const CONTEXT_BUS_SCRIPT = String.raw`  const bus = {
    focus: null,
    source: null,
    seq: 0,
    timer: 0,
    rulesTimer: 0,
    flush: null,
    judging: null,
    dismissed: new Map(),
    recent: [],
    request(focus) {
      return { pane_id: this.source.pane, focus, recent: this.recent.slice(0, 3), pinned: bar.pinned(),
        ...(bar.shown ? { previous: bar.shown } : {}), dismissed: [...(this.dismissed.get(focus.context_id) || [])] };
    },
    report(source, focus) {
      // “Nothing in hand” only clears what that same surface put there, not what another surface reported since.
      if (!focus) { if (this.source && this.source.pane === source.pane && (!this.source.element || !source.element || this.source.element === source.element)) this.set(null, null); return; }
      if (!focus.context_id || !focus.object || !Array.isArray(focus.targets)) return;
      this.set(focus, source);
    },
    set(focus, source, force) {
      if (!focus && !force && this.focus && bar.interacting()) { bar.clearWhenLeft = true; return; }
      bar.clearWhenLeft = false;
      if (focus && this.focus && focus.context_id === this.focus.context_id && this.source && source && this.source.pane === source.pane) return;
      const leaving = this.source, previous = this.focus;
      this.focus = focus; this.source = focus ? source : null;
      this.watch(Boolean(focus && source && source.element));
      clearTimeout(this.timer);
      clearTimeout(this.rulesTimer);
      if (this.judging) this.judging.abort();
      this.judging = null;
      const seq = ++this.seq;
      if (!focus) {
        if (leaving) post("/api/contextual/cancel", { pane_id: leaving.pane }).catch(() => undefined);
        bar.idle();
        return;
      }
      const writing = focus.activity === "editing";
      if (!(writing && previous && previous.activity === "editing" && previous.object.id === focus.object.id)) bar.pending(focus);
      const rules = () => post("/api/contextual/candidates", this.request(focus)).then((out) => {
        if (seq !== this.seq || !this.focus || out.plan.context_id !== this.focus.context_id) return;
        bar.render(out, focus, true);
      }).catch((error) => { if (seq === this.seq) bar.error(error); });
      this.flush = () => { clearTimeout(this.rulesTimer); this.flush = null; rules(); };
      if (writing) this.rulesTimer = setTimeout(() => this.flush && this.flush(), 400); else this.flush();
      this.timer = setTimeout(() => this.judge(seq, focus), writing ? 900 : 350);
    },
    async judge(seq, focus) {
      const controller = new AbortController();
      this.judging = controller;
      try {
        const out = await post("/api/contextual/judge", this.request(focus), controller.signal);
        if (seq !== this.seq || !this.focus || out.plan.context_id !== this.focus.context_id) return;
        bar.render(out, focus, false);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        if (seq === this.seq) bar.judgeFailed();
      } finally { if (this.judging === controller) this.judging = null; }
    },
    // The plan for the menus that show the same actions: in this document by an event, in the pane the focus came from by a message.
    publish(plan) {
      document.dispatchEvent(new CustomEvent("molis:assistant-context-actions", { detail: { context_id: plan.context_id, plan } }));
      if (this.source && this.source.frame) this.source.frame.contentWindow?.postMessage({ type: "workbench-context-plan", plan }, location.origin);
    },
    watching: 0,
    watch(on) {
      if (!on) { clearInterval(this.watching); this.watching = 0; return; }
      if (!this.watching) this.watching = setInterval(() => { if (this.source && this.source.element && !visible(this.source.element)) this.set(null, null, true); }, 800);
    },
    signal(key, signal) {
      if (!this.focus || !this.source) return;
      post("/api/contextual/signal", { pane_id: this.source.pane, focus: this.focus, key, signal, event_id: requestId() }).catch(() => undefined);
    },
    dismiss(key) {
      if (!this.focus) return;
      const keys = this.dismissed.get(this.focus.context_id) || new Set();
      keys.add(key);
      this.dismissed.set(this.focus.context_id, keys);
      while (this.dismissed.size > 50) this.dismissed.delete(this.dismissed.keys().next().value);
    },
  };

  const choose = (key, plan = bar.plan) => {
    const focus = bus.focus, source = bus.source;
    const candidate = plan && plan.candidates.find((item) => item.key === key);
    // Clicked while the row still showed the moment before the last keystroke: bring it up to date instead of acting.
    if (focus && plan && plan.context_id !== focus.context_id) { if (bus.flush) bus.flush(); return; }
    if (!focus || !source || !candidate || !candidate.available) return;
    bus.recent = [candidate.title, ...bus.recent.filter((title) => title !== candidate.title)].slice(0, 3);
    bus.signal(key, "accepted");
    const prepared = () => post("/api/contextual/prepare", { pane_id: source.pane, focus, key: candidate.key, request_id: requestId() });
    // What the workbench shows itself: a word looked up across the project opens in the search palette.
    if (candidate.action.capability_id === "search.query" && host.openSearch) {
      prepared().then((offer) => host.openSearch(offer.input && offer.input.query)).catch((error) => bar.error(error));
      return;
    }
    // A write goes to the Assistant as a prepared card: the person sees what it will do, and confirms it there.
    if (candidate.apply === "record") {
      prepared().then((offer) => suggestCard(focus, candidate, offer)).catch((error) => bar.error(error));
      return;
    }
    if (source.frame) {
      source.frame.contentWindow.postMessage({ type: "workbench-context-action-chosen", context_id: focus.context_id, candidate }, location.origin);
      return;
    }
    const fallback = deliver(focus, candidate);
    if (fallback) prepared().then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(fallback));
  };
  const suggestCard = async (focus, candidate, offer) => {
    const material = { title: L("选中的内容") + (focus.object.title ? " · " + focus.object.title : ""), text: quoted(focus) };
    const summary = offer.summary || candidate.hint;
    const source = { surface: focus.plugin_id, title: focus.object.title || "" };
    const card = { title: candidate.title, summary, reference: offer.action, input: offer.input,
      ...(offer.editable ? { editable: offer.editable } : {}), ...(offer.missing ? { missing: offer.missing } : {}),
      source_object: focus.object, materials: [material] };
    const placed = await post("/api/assistant/cards", { message_id: requestId(), source, card });
    openAssistant({ work_id: placed.work_id });
  };
  // The split pane's page did not take the choice: same as here, a card, else the words and the material.
  const unhandled = (contextId, key, detail) => {
    const focus = bus.focus, source = bus.source, plan = bar.plan;
    const candidate = plan && plan.candidates.find((item) => item.key === key);
    if (!focus || !source || !candidate || focus.context_id !== contextId) { openAssistant(detail); return; }
    post("/api/contextual/prepare", { pane_id: source.pane, focus, key, request_id: requestId() })
      .then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(detail));
  };
  const askAssistant = () => {
    const focus = bus.focus, plan = bar.plan;
    if (!focus || !plan || !plan.assistant) return;
    const titles = plan.assistant.keys.map((key) => (plan.candidates.find((item) => item.key === key) || {}).title).filter(Boolean);
    const words = plan.assistant.form === "compare" ? L("帮我并排比较这几处内容的相同点、不同点和冲突。")
      : plan.assistant.form === "options" ? L("这段内容可以往哪几个方向走？可以考虑：") + titles.join("、")
      : L("帮我看看这段内容，") + (titles[0] ? L("先从「") + titles[0] + L("」开始。") : "");
    openAssistant(assistantDetail(focus, words));
  };

  const starters = {
    focus: null,
    plan: null,
    at: 0,
    seq: 0,
    focusFor(context) {
      const object = context && context.object;
      if (!object || typeof object.kind !== "string" || typeof object.id !== "string" || !object.kind || !object.id) return null;
      const text = typeof context.draft_text === "string" && context.draft_text.trim() ? context.draft_text : object.title || "";
      return { context_id: ("start:" + object.kind + ":" + object.id + ":" + (object.version === undefined ? "" : String(object.version))).slice(0, 240),
        plugin_id: String(context.plugin_id || ""), activity: "browsing", granularity: "object",
        object: { kind: object.kind, id: object.id, ...(object.version !== undefined ? { version: object.version } : {}), ...(object.title ? { title: String(object.title) } : {}) },
        targets: [{ kind: "object", role: "object", text: String(text).slice(0, 4000) }] };
    },
    // Another plugin's action says whose it is, as on the row.
    items(plan, pluginId) {
      const byKey = new Map(plan.candidates.map((item) => [item.key, item]));
      return plan.primary.concat(...plan.more.map((group) => group.keys)).map((key) => byKey.get(key))
        .filter((item) => item && item.available).slice(0, 4)
        .map((item) => ({ key: item.key, label: item.title, hint: item.hint, ...(item.source.provider_id !== pluginId ? { kind: item.provider_title } : {}) }));
    },
    // Each answer names the request it answers, so the Assistant never shows one for what was open before.
    answer(requestId, objectKey, items) {
      document.dispatchEvent(new CustomEvent("molis:assistant-starters", { detail: { request_id: requestId, object_key: objectKey, items } }));
    },
    request(context, requestId) {
      const inHand = bar.plan || bar.published;
      if (bus.focus && inHand && inHand.context_id === bus.focus.context_id) { this.answer(requestId, bus.focus.context_id, this.items(inHand, bus.focus.plugin_id)); return; }
      const focus = this.focusFor(context);
      if (!focus || !focus.plugin_id) { this.answer(requestId, "", []); return; }
      if (this.plan && this.focus && this.focus.context_id === focus.context_id && Date.now() - this.at < 15000) { this.answer(requestId, focus.context_id, this.items(this.plan, focus.plugin_id)); return; }
      const seq = ++this.seq;
      post("/api/contextual/candidates", { pane_id: "assistant-start", focus }).then((out) => {
        if (seq !== this.seq) return;
        this.focus = focus; this.plan = out.plan; this.at = Date.now();
        this.answer(requestId, focus.context_id, this.items(out.plan, focus.plugin_id));
      }).catch(() => { if (seq === this.seq) this.answer(requestId, focus.context_id, []); });
    },
    choose(objectKey, key) {
      if (bus.focus && bus.focus.context_id === objectKey) { chooseFrom(objectKey, key); return; }
      const focus = this.focus, plan = this.plan;
      const candidate = focus && plan && focus.context_id === objectKey ? plan.candidates.find((item) => item.key === key) : null;
      // Shown a moment ago but gone or switched off since: say why instead of doing nothing.
      if (!candidate || !candidate.available) { bar.error(new Error(candidate ? candidate.reason || L("不可用") : L("这个动作已不在当前内容的候选里"))); return; }
      bus.recent = [candidate.title, ...bus.recent.filter((title) => title !== candidate.title)].slice(0, 3);
      const prepared = () => post("/api/contextual/prepare", { pane_id: "assistant-start", focus, key, request_id: requestId() });
      if (candidate.action.capability_id === "search.query" && host.openSearch) {
        prepared().then((offer) => host.openSearch(offer.input && offer.input.query)).catch((error) => bar.error(error));
        return;
      }
      if (candidate.apply === "record") { prepared().then((offer) => suggestCard(focus, candidate, offer)).catch((error) => bar.error(error)); return; }
      // The page that has this object open takes it when it can (Pages runs it on the whole document); else a card.
      const fallback = deliver(focus, { ...candidate, scope: "object" });
      if (fallback) prepared().then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(fallback));
    },
  };
  document.addEventListener("molis:assistant-starters-request", (event) => {
    const detail = event.detail || {};
    starters.request(detail.context, typeof detail.request_id === "string" ? detail.request_id : "");
  });
  document.addEventListener("molis:assistant-starter-choose", (event) => {
    const detail = event.detail || {};
    if (typeof detail.object_key === "string" && typeof detail.key === "string") starters.choose(detail.object_key, detail.key);
  });

  document.addEventListener("molis:surface-focus", (event) => {
    const focus = event.detail && typeof event.detail === "object" ? event.detail : null;
    bus.report({ pane: ownPane, element: event.target instanceof Element ? event.target : null, frame: null }, focus);
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || !event.data || typeof event.data.type !== "string") return;
    const frame = [...document.querySelectorAll("iframe[data-pane-owner]")].find((node) => node.contentWindow === event.source);
    if (!frame) return;
    if (event.data.type === "workbench-surface-focus") bus.report({ pane: frame.dataset.paneOwner || "pane", element: frame, frame }, event.data.focus || null);
    else if (event.data.type === "workbench-context-action-unhandled" && event.data.detail) unhandled(event.data.context_id, event.data.key, event.data.detail);
    else if (event.data.type === "workbench-context-action-choose" && bus.source && bus.source.frame === frame) chooseFrom(event.data.context_id, event.data.key);
  });
  const chooseFrom = (contextId, key) => {
    if (!bus.focus || bus.focus.context_id !== contextId || typeof key !== "string") return;
    choose(key, bar.plan || bar.published);
  };
  document.addEventListener("molis:assistant-context-action-choose", (event) => {
    const detail = event.detail || {};
    if (bus.source && !bus.source.frame) chooseFrom(detail.context_id, detail.key);
  });
  // A place change, or the surface going out of sight, voids what was in hand there.
  document.addEventListener("molis-work:place-changed", () => bus.set(null, null, true));`;
