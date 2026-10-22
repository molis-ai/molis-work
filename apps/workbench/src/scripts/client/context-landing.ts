/**
 * Where a thing in hand would land on the left (specs/context-program §3.4, §21.8 steps 2 and 5). A fragment of the factory
 * script in context-actions.ts, joined after the bus: it shares that closure (bus, bar, post, ownPane, panes, visible, ...).
 *
 * - The page that owns the object open on the left reports its landing (`molis:surface-landing`): cursor, selection or the
 *   end, with the version its positions belong to. One landing is kept; `null` clears it only when the same page sent it.
 * - A surface's focus is marked with where its element is: inside the right panel `side` (and which cell), inside the
 *   Assistant `assistant`, else `main`, the left. A place or cell the surface reports of itself never counts, whether it is
 *   this document's or a split pane's (anti-corruption §10.28 on #712 and #720). Only a thing in hand that is not on the left
 *   carries the landing, so an `attach.` candidate (「插入到光标处」) is offered for exactly that.
 * - Choosing an `attach.` candidate prepares its input and hands it to the landing's owner, which previews it at the
 *   landing; confirming there runs it through the Host (`run`, bound to this landing and this choice: the page cannot
 *   send another), never by the page writing on its own. Nobody taking it means the landing went away: the row says so.
 *
 * - A split pane is its own document (B-6): its page's landing comes up as a pane message, checked like every other (this
 *   origin, from the window of one of the panes), and is raised again on its frame, so the row and the strip read it as a
 *   landing on this page. Choosing it hands the prepared choice down to that pane, and its confirming comes back up here
 *   (a token only that pane's frame can use, once: S-30): the Host is called only from this document, with the landing
 *   that was ranked.
 */
export const CONTEXT_LANDING_SCRIPT = String.raw`  const landing = {
    value: null,
    element: null,
    // Where a surface is comes from its element alone: a place or cell it reports of itself is replaced.
    place(element) {
      const cell = element && element.closest("[data-side-panel] [data-side-body]");
      return { place: cell ? "side" : element && element.closest("[data-assistant-island]") ? "assistant" : "main", side_tab: cell?.dataset.sideBody };
    },
    with(focus) { return focus.place && focus.place !== "main" && this.value && visible(this.element) ? { landing: this.value } : {}; },
    // A way to put the thing here, hovered or focused on the bar or in its menu, shows where it would go: the page flashes its
    // landing once each time one comes into hand. A landing a split pane reported is asked of that pane's frame, which raises it
    // on its own landing (§21.4 W3-A3c); a landing whose element is gone is not asked. The element is always in this document:
    // it is the target of an event heard on this document.
    hinted: [],
    hint(keys, plan) {
      const now = plan ? keys.filter((key) => plan.candidates.some((item) => item.key === key && item.origin === "attach")) : [], element = this.element;
      if (now.some((key) => !this.hinted.includes(key)) && this.value && element?.isConnected) {
        if (element instanceof HTMLIFrameElement) element.contentWindow.postMessage({ type: "workbench-surface-landing-flash" }, location.origin);
        else element.dispatchEvent(new CustomEvent("molis:surface-landing-flash"));
      }
      this.hinted = now;
    },
    choose(focus, candidate) {
      const at = this.value, frame = this.element instanceof HTMLIFrameElement ? this.element : null;
      const send = (path, where, control) => post(path, { pane_id: ownPane, focus, landing: where, key: candidate.key, request_id: newRequestId() }, control?.signal, control?.page_id);
      const gone = () => bar.error(new Error(L("左边的内容已经换了，请重新选择要放进去的位置")));
      if (!at) { bar.error(new Error(L("左边没有可以放进去的位置"))); return; }
      send("/api/contextual/prepare", at).then((offer) => {
        const chosen = { plugin_id: at.plugin_id, context_id: focus.context_id, key: candidate.key, offer_id: candidate.offer_id, apply: candidate.apply,
          intent: candidate.intent, title: candidate.title, object: at.object, landing: at }, run = (control) => send("/api/contextual/attach", at, control);
        if (frame) {
          const token = newRequestId();
          panes.keep(token, frame, { run, gone });
          frame.contentWindow.postMessage({ type: "workbench-context-attach-chosen", token, chosen, offer }, location.origin);
          return;
        }
        const event = new CustomEvent("molis:assistant-context-action-chosen", { cancelable: true, detail: { ...chosen, prepare: async () => offer, run } });
        window.dispatchEvent(event);
        if (event.detail.handled) void event.detail.handled.then(taken => { if (!taken) gone(); });
        else if (!event.defaultPrevented) gone();
      }).catch((error) => bar.error(error));
    },
  };
  window.addEventListener("message", (event) => {
    const frame = panes.from(event), data = event.data;
    if (!frame) return;
    if (data.type === "workbench-surface-landing") {
      const value = data.landing && typeof data.landing === "object" && data.landing.object ? { ...data.landing, pane_id: frame.dataset.paneOwner || "pane" } : null;
      frame.dispatchEvent(new CustomEvent("molis:surface-landing", { bubbles: true, detail: value }));
      return;
    }
    const run = data.type === "workbench-context-attach-run", held = (run || data.type === "workbench-context-attach-taken" && !data.taken) && panes.take(data.token, frame);
    if (!held) return;
    if (!run) { held.gone(); return; }
    const done = (reply) => frame.contentWindow.postMessage({ type: "workbench-context-attach-done", token: data.token, ...reply }, location.origin);
    held.run().then((result) => done({ result }), (error) => done({ error: error && error.message || L("暂时处理不了，请稍后重试") }));
  });
  document.addEventListener("molis:surface-landing", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const { screen, ...value } = event.detail && typeof event.detail === "object" ? event.detail : {};
    if (value.object) { landing.value = { ...value, pane_id: value.pane_id || ownPane }; landing.element = element; }
    else if (!landing.element || landing.element === element) { landing.value = null; landing.element = null; }
  });
  document.addEventListener("molis:surface-focus", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const focus = event.detail && typeof event.detail === "object" ? { ...event.detail, ...landing.place(element) } : null;
    bus.report({ pane: ownPane, element, frame: null }, focus);
  });`;

/**
 * The same, in a split pane's own document (joined into the factory's embedded branch): its page's landing goes up to the
 * top document without where it is on screen, and a choice the top document hands down is offered to the page here as if
 * chosen in this document. Confirming asks the top document to run it and waits for its answer. Asked to show the landing
 * (`workbench-surface-landing-flash`, from the top document only), it raises the flash on the element that reported it.
 */
export const CONTEXT_LANDING_PANE_SCRIPT = String.raw`    const attaching = new Map();
    const up = (message) => parent.postMessage(message, location.origin);
    let reported = null;
    document.addEventListener("molis:surface-landing", (event) => {
      const { screen, ...value } = event.detail && typeof event.detail === "object" ? event.detail : {};
      reported = value.object ? event.target : null;
      up({ type: "workbench-surface-landing", landing: value.object ? value : null });
    });
    window.addEventListener("pagehide", () => up({ type: "workbench-surface-landing", landing: null }));
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!panes.fromParent(event)) return;
      // The top document asks this pane's landing to show itself: raised on the element that reported it, while it is still here.
      if (data.type === "workbench-surface-landing-flash" && reported?.isConnected) reported.dispatchEvent(new CustomEvent("molis:surface-landing-flash"));
      const wait = attaching.get(data.token);
      if (data.type === "workbench-context-attach-done" && wait) { attaching.delete(data.token); if (data.error) wait.reject(new Error(data.error)); else wait.resolve(data.result); }
      if (data.type !== "workbench-context-attach-chosen" || !data.chosen) return;
      const run = () => new Promise((resolve, reject) => { attaching.set(data.token, { resolve, reject }); up({ type: "workbench-context-attach-run", token: data.token }); });
      const chosen = new CustomEvent("molis:assistant-context-action-chosen", { cancelable: true, detail: { ...data.chosen, prepare: async () => data.offer, run } });
      window.dispatchEvent(chosen);
      up({ type: "workbench-context-attach-taken", token: data.token, taken: chosen.defaultPrevented });
    });`;
