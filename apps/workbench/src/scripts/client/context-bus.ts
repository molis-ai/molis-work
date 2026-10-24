/**
 * What the person has in hand and what to do about it: the bus takes a surface's focus (from this document, a split
 * pane's frame or a side panel's plugin frame, which it marks as in the side panel and which tab), asks the Host for the
 * candidates by rules at once and by the judgment shortly after, and hands a choice to the page that owns the object or to
 * the Assistant as a prepared card. Also the Assistant's starters and the listeners that clear what was in hand. A fragment of the factory script in context-actions.ts: it shares that
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
 * - `choose`: a creation entry is made at once when its owner can undo it (`create`), else it is a card. Any other write goes
 *   to the Assistant as a prepared card; when no page here takes the choice (several objects, or a
 *   surface without its own handler) it is a card too, and only when even that fails the Assistant gets what is in hand. A card carries the exact action and its complete input; the Assistant runs it only when the person clicks,
 *   and the click places it (POST /api/assistant/cards) and opens the panel on that work.
 * - `starters` (spec §6.4.2): what the directory offers for the whole object open now, by rules only (no judgment for opening
 *   a page), or the plan on show while something is in hand; the Assistant shows them and hands a click back, so it runs
 *   exactly as a click on the row would. A plugin switched off or a grant withdrawn shows within the cache time; choosing
 *   checks again anyway.
 * - `chooseFrom`: a choice made in a split pane's toolbar is handled exactly as one made here, also after the person put the toolbar
 *   away for this passage.
 * - A split pane's or side tab's hold also names the keys under the pointer on its bar and in its menu (`pointed`, W3-C2): they
 *   are only looked up in this document's own plan (`landing.hint`), so a key that is not an `attach.` candidate there flashes
 *   nothing; the message has already passed the frame check (S-30) and the current-focus check.
 */
import { CARD_TARGET_ASK_SCRIPT } from "./context-card-target.js";

export const CONTEXT_BUS_SCRIPT = String.raw`  const bus = {
    focus: null,
    source: null,
    seq: 0,
    timer: 0,
    rulesTimer: 0,
    flush: null,
    judging: null,
    at: 0,
    dismissed: new Map(),
    recent: [],
    request(focus) {
      return { pane_id: this.source.pane, focus, recent: this.recent.slice(0, 3), pinned: bar.pinned(),
        ...(bar.shown ? { previous: bar.shown } : {}), dismissed: [...(this.dismissed.get(focus.context_id) || [])], ...landing.with(focus) };
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
      if (focus && this.focus && focus.context_id === this.focus.context_id && this.source && source && this.source.pane === source.pane) { this.focus = focus; bar.reanchor(); return; }
      const leaving = this.source, previous = this.focus;
      this.focus = focus; this.source = focus ? source : null; this.at = Date.now();
      this.watch(Boolean(focus && source && source.element));
      const seq = this.hush();
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
    // Nothing still on its way for what was in hand comes back to the toolbar: a new thing in hand, or Esc.
    hush() { clearTimeout(this.timer); clearTimeout(this.rulesTimer); if (this.judging) this.judging.abort(); this.judging = null; return ++this.seq; },
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
    watching: 0,
    watch(on) {
      if (!on) { clearInterval(this.watching); this.watching = 0; return; }
      if (!this.watching) this.watching = setInterval(() => { if (this.source && this.source.element && !visible(this.source.element)) this.set(null, null, true); }, 800);
    },
    signal(key, signal) {
      if (!this.focus || !this.source) return;
      post("/api/contextual/signal", { pane_id: this.source.pane, focus: this.focus, key, signal, event_id: newRequestId() }).catch(() => undefined);
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
    bus.signal(key, "accepted");
    const prepared = settle(focus, candidate, source.pane);
    if (!prepared) return;
    if (source.frame) {
      source.frame.contentWindow.postMessage({ type: "workbench-context-action-chosen", context_id: focus.context_id, candidate }, location.origin);
      return;
    }
    void deliver(focus, candidate).then(fallback => { if (fallback) prepared().then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(fallback)); });
  };
  // A choice from the row or a starter alike: into the object open on the left, its owner previews it at the landing
  // (context-landing.ts; an attach is a record too, so it goes first); a creation entry is made at once or drafted for a
  // card (create); a word looked up across the project opens in the search palette; a write goes to the Assistant as a
  // prepared card, which the person sees and confirms there. Anything else is the caller's to hand over, with the prepare
  // call it needs.
  const settle = (focus, candidate, pane) => {
    bus.recent = [candidate.title, ...bus.recent.filter((title) => title !== candidate.title)].slice(0, 3);
    const prepared = () => post("/api/contextual/prepare", { pane_id: pane, focus, key: candidate.key, request_id: newRequestId() });
    if (candidate.origin === "attach") landing.choose(focus, candidate);
    else if (candidate.origin === "intake") create(focus, candidate);
    else if (candidate.action.capability_id === "search.query" && host.openSearch) prepared().then((offer) => host.openSearch(offer.input && offer.input.query)).catch((error) => bar.error(error));
    else if (candidate.apply === "record") prepared().then((offer) => suggestCard(focus, candidate, offer)).catch((error) => bar.error(error));
    else return prepared;
    return null;
  };
  // A creation entry (intake.): drafted on the Host and made at once when its owner declared how it is undone; the completion
  // card offers 「打开」 and 「撤销」, whose undo stays on the Host behind a token. Without an undo it comes back as a draft, shown
  // as a card. Choosing it again for the same thing sends the same request, which its owner makes once.
  const made = new Map();
  const create = (focus, candidate, requestId) => {
    const id = focus.context_id + "\n" + candidate.key, held = made.get(id) || { request_id: requestId || newRequestId() };
    if (held.busy) return;
    made.set(id, held); held.busy = true;
    if (made.size > 20) made.delete(made.keys().next().value);
    post("/api/contextual/create", { focus, ...landing.with(focus), ...(candidate.intake_id ? { intake_id: candidate.intake_id } : { key: candidate.key }), request_id: held.request_id }).then((out) => {
      if (!out.created) { made.delete(id); return suggestCard(focus, candidate, out.draft); }
      const place = globalThis.molisPlacement, title = out.draft.summary || "", actions = [];
      if (out.subject) actions.push({ label: L("打开"), primary: true, run: () => place.describe({ ...out.subject, project_id: document.body.dataset.projectId || null }, true).then((view) => view.open && place.openObject(view.open)) });
      if (out.undo_token) actions.push({ label: L("撤销"), run: () => post("/api/contextual/undo", { undo_token: out.undo_token })
        .then(() => { made.delete(id); place.card(L("已撤销"), title, [], "done"); }, (error) => place.card(L("没能撤销"), error, [], "error")) });
      place.card(L("已{verb}", { verb: candidate.title || out.draft.title }), title, actions, "done");
    }).catch((error) => { made.delete(id); bar.error(error); }).finally(() => { held.busy = false; });
  };
  const suggestCard = async (focus, candidate, offer) => {
    const material = { title: L("选中的内容") + (focus.object.title ? " · " + focus.object.title : ""), text: quoted(focus) };
    const summary = offer.summary || candidate.hint;
    const source = { surface: focus.plugin_id, title: focus.object.title || "" };
    const card = { title: candidate.title, summary, reference: offer.action, input: offer.input,
      ...(offer.editable ? { editable: offer.editable } : {}), ...(offer.missing ? { missing: offer.missing } : {}),
      source_object: focus.object, materials: [material] };
    // Into the work the person is on when the Assistant says it holds this object (assistant-work-objects.ts); else a new work.
    const work_id = ${CARD_TARGET_ASK_SCRIPT}(focus.object);
    const placed = await post("/api/assistant/cards", { message_id: newRequestId(), source, card, ...(work_id ? { work_id } : {}) });
    openAssistant({ work_id: placed.work_id });
  };
  // The split pane's page did not take the choice: same as here, a card, else what is in hand.
  const unhandled = (contextId, key, detail) => {
    const focus = bus.focus, source = bus.source, plan = bar.plan;
    const candidate = plan && plan.candidates.find((item) => item.key === key);
    if (!focus || !source || !candidate || focus.context_id !== contextId) { openAssistant(detail); return; }
    post("/api/contextual/prepare", { pane_id: source.pane, focus, key, request_id: newRequestId() })
      .then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(detail));
  };
  // ✦ and 「带到助理」: what is in hand goes in the Assistant's strip, unsent; the person says what to do (spec §21.2 point 4).
  const bringToAssistant = () => { if (bus.focus) openAssistant(inHand(bus.focus)); };

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
    answer(newRequestId, objectKey, items) {
      document.dispatchEvent(new CustomEvent("molis:assistant-starters", { detail: { request_id: newRequestId, object_key: objectKey, items } }));
    },
    request(context, newRequestId) {
      const inHand = bar.plan || bar.published;
      if (bus.focus && inHand && inHand.context_id === bus.focus.context_id) { this.answer(newRequestId, bus.focus.context_id, this.items(inHand, bus.focus.plugin_id)); return; }
      const focus = this.focusFor(context);
      if (!focus || !focus.plugin_id) { this.answer(newRequestId, "", []); return; }
      if (this.plan && this.focus && this.focus.context_id === focus.context_id && Date.now() - this.at < 15000) { this.answer(newRequestId, focus.context_id, this.items(this.plan, focus.plugin_id)); return; }
      const seq = ++this.seq;
      post("/api/contextual/candidates", { pane_id: "assistant-start", focus }).then((out) => {
        if (seq !== this.seq) return;
        this.focus = focus; this.plan = out.plan; this.at = Date.now();
        this.answer(newRequestId, focus.context_id, this.items(out.plan, focus.plugin_id));
      }).catch(() => { if (seq === this.seq) this.answer(newRequestId, focus.context_id, []); });
    },
    choose(objectKey, key) {
      if (bus.focus && bus.focus.context_id === objectKey) { chooseFrom(objectKey, key); return; }
      const focus = this.focus, plan = this.plan;
      const candidate = focus && plan && focus.context_id === objectKey ? plan.candidates.find((item) => item.key === key) : null;
      // Shown a moment ago but gone or switched off since: say why instead of doing nothing.
      if (!candidate || !candidate.available) { bar.error(new Error(candidate ? candidate.reason || L("不可用") : L("这个动作已不在当前内容的候选里"))); return; }
      const prepared = settle(focus, candidate, "assistant-start");
      // The page that has this object open takes it when it can (Pages runs it on the whole document); else a card.
      if (prepared) void deliver(focus, { ...candidate, scope: "object" }).then(fallback => { if (fallback) prepared().then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(fallback)); });
    },
  };
  // A control on a plugin's page that names a creation entry (data-context-intake="todo") puts the object that page shows
  // into it: the surface says which plugin and which kind it opens (what the plugins declare as their search sources), the control
  // gives the object's id, title and words, and the entry's own provider drafts and makes it, as for a choice on the bar. The same
  // object asks the same request, which the entry's owner makes once, so a second click finds the first.
  document.addEventListener("molis:context-intake", (event) => {
    const detail = event.detail || {}, surface = event.target instanceof Element ? event.target.closest("[data-work-surface]") : null;
    const intake = typeof detail.intake_id === "string" ? detail.intake_id : "", id = typeof detail.id === "string" ? detail.id : "";
    if (!surface || !intake || !id) return;
    const title = String(detail.title || "").trim().slice(0, 200), text = String(detail.text || "").slice(0, 4000);
    known().then((declared) => {
      const entry = declared[surface.getAttribute("data-work-surface")];
      if (!entry) throw new Error(L("这个页面还没有声明它的对象，不能放进去"));
      const focus = starters.focusFor({ plugin_id: entry.plugin_id, object: { kind: entry.kind, id, ...(title ? { title } : {}) }, draft_text: text || title });
      if (!focus) throw new Error(L("没有可以放进去的内容"));
      // The Host finds the creation entry by its declared id among what is offered for exactly this object, and refuses when it is gone.
      create(focus, { key: "intake:" + intake, intake_id: intake, title: "" }, ("intake:" + intake + ":" + entry.kind + ":" + id).slice(0, 120));
    }).catch((error) => bar.error(error));
  });
  document.addEventListener("click", (event) => {
    const control = event.target instanceof Element ? event.target.closest("[data-context-intake]") : null;
    if (!control || control.disabled || event.defaultPrevented) return;
    event.preventDefault();
    const data = control.dataset;
    control.dispatchEvent(new CustomEvent("molis:context-intake", { bubbles: true, detail: { intake_id: data.contextIntake, id: data.contextId, title: data.contextTitle, text: data.contextText } }));
  });
  document.addEventListener("molis:assistant-starters-request", (event) => {
    const detail = event.detail || {};
    starters.request(detail.context, typeof detail.request_id === "string" ? detail.request_id : "");
  });
  document.addEventListener("molis:assistant-starter-choose", (event) => {
    const detail = event.detail || {};
    if (typeof detail.object_key === "string" && typeof detail.key === "string") starters.choose(detail.object_key, detail.key);
  });

  window.addEventListener("message", (event) => {
    const frame = panes.from(event) || sideFrame(event), data = event.data;
    if (!frame) return;
    if (data.type === "workbench-surface-focus") bus.report({ pane: frame.dataset.paneOwner || "side", element: frame, frame }, data.focus && { ...data.focus, ...landing.place(frame) });
    else if (data.type === "workbench-context-action-unhandled" && data.detail) unhandled(data.context_id, data.key, data.detail);
    else if (!bus.source || bus.source.frame !== frame || !bus.focus || data.context_id !== bus.focus.context_id) return;
    else if (data.type === "workbench-context-action-choose") chooseFrom(data.context_id, data.key);
    else if (data.type === "workbench-context-assistant") bringToAssistant();
    else if (data.type === "workbench-context-dismiss") bar.dismissAll();
    else if (data.type === "workbench-context-summon") bar.summon(true);
    else if (data.type === "workbench-context-hold") {
      bar.paneHold = { interacting: !!data.interacting, pinned: Array.isArray(data.pinned) ? data.pinned.filter((key) => typeof key === "string").slice(0, 8) : [] };
      bar.leave(); landing.hint(Array.isArray(data.pointed) ? data.pointed.slice(0, 16) : [], bar.plan);
    }
  });
  const chooseFrom = (contextId, key) => {
    if (!bus.focus || bus.focus.context_id !== contextId || typeof key !== "string") return;
    choose(key, bar.plan || bar.published);
  };
  // A place change, or the surface going out of sight, voids what was in hand there.
  document.addEventListener("molis-work:place-changed", () => bus.set(null, null, true));`;
