/**
 * Where a thing in hand would land on the left (specs/context-program §3.4, §21.8 steps 2 and 5). A fragment of the factory
 * script in context-actions.ts, joined after the bus: it shares that closure (bus, bar, post, ownPane, visible, ...).
 *
 * - The page that owns the object open on the left reports its landing (`molis:surface-landing`): cursor, selection or the
 *   end, with the version its positions belong to. One landing is kept; `null` clears it only when the same page sent it.
 * - A surface's focus is marked with where it is: inside the right panel `side` (and which cell), inside the Assistant
 *   `assistant`, else the left. Only a thing in hand that is not on the left carries the landing, so an `attach.` candidate
 *   (「插入到光标处」) is offered for exactly that.
 * - Choosing an `attach.` candidate prepares its input and hands it to the landing's owner, which previews it at the
 *   landing; confirming there runs it through the Host (`run`, bound to this landing and this choice: the page cannot
 *   send another), never by the page writing on its own. Nobody taking it means the landing went away: the row says so.
 *
 * Only this document's landing is kept: a split pane's frame does not report one yet.
 */
export const CONTEXT_LANDING_SCRIPT = String.raw`  const landing = {
    value: null,
    element: null,
    place(element) {
      const cell = element && element.closest("[data-side-panel] [data-side-body]");
      return cell ? { place: "side", side_tab: cell.dataset.sideBody } : element && element.closest("[data-assistant-island]") ? { place: "assistant" } : {};
    },
    with(focus) { return focus.place && focus.place !== "main" && this.value && visible(this.element) ? { landing: this.value } : {}; },
    choose(focus, candidate) {
      const at = this.value;
      const send = (path, where) => post(path, { pane_id: ownPane, focus, landing: where, key: candidate.key, request_id: newRequestId() });
      if (!at) { bar.error(new Error(L("左边没有可以放进去的位置"))); return; }
      send("/api/contextual/prepare", at).then((offer) => {
        const event = new CustomEvent("molis:assistant-context-action-chosen", { cancelable: true, detail: {
          plugin_id: at.plugin_id, context_id: focus.context_id, key: candidate.key, offer_id: candidate.offer_id, apply: candidate.apply,
          intent: candidate.intent, title: candidate.title, object: at.object, landing: at, prepare: async () => offer,
          run: () => send("/api/contextual/attach", at) } });
        window.dispatchEvent(event);
        if (!event.defaultPrevented) bar.error(new Error(L("左边的内容已经换了，请重新选择要放进去的位置")));
      }).catch((error) => bar.error(error));
    },
  };
  document.addEventListener("molis:surface-landing", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const { screen, ...value } = event.detail && typeof event.detail === "object" ? event.detail : {};
    if (value.object) { landing.value = { ...value, pane_id: ownPane }; landing.element = element; }
    else if (!landing.element || landing.element === element) { landing.value = null; landing.element = null; }
  });
  document.addEventListener("molis:surface-focus", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const focus = event.detail && typeof event.detail === "object" ? { ...event.detail, ...landing.place(element) } : null;
    bus.report({ pane: ownPane, element, frame: null }, focus);
  });`;
