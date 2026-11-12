/** The side panel's browser taken over by the person or handed back to the work, and the work read again when a page changes what it shows. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_BROWSER_HANDBACK_PART = String.raw`  // The side panel's browser: the person took it over, or handed it back to the work whose session drives it.
  const browserHeld = new Set();
  const holderOf = (session) => typeof session === "string" && session
    ? works.find((work) => work.session_id === session || (work.executor && work.executor.session_id === session)) : null;
  document.addEventListener("molis:side-browser-control", (event) => {
    const detail = event.detail || {}, holder = holderOf(detail.session_id);
    if (!holder) return;
    if (detail.action === "takeover") { browserHeld.add(holder.work_id); paintSum(); return; }
    if (detail.action !== "handback") return;
    browserHeld.delete(holder.work_id); paintSum();
    void (async () => {
      // The note goes to a running round as a steer, or starts the next one. A round waiting on an answer would take it
      // as that answer, and one waiting on a check refuses it: then the panel only says the browser is back.
      let latest = null;
      try {
        const seen = view && view.work.work_id === holder.work_id ? view : await api("/works/" + encodeURIComponent(holder.work_id));
        latest = seen.rounds[seen.rounds.length - 1] || null;
      } catch { host.showToast?.(globalThis.t.text("workbench.assistant-browser-handback.browser-back-assistant-when-ask-continue-will-look")); return; }
      if (latest && (latest.phase === "awaiting-input" || (latest.awaiting_input && latest.awaiting_input.length))) { host.showToast?.(globalThis.t.text("workbench.assistant-browser-handback.browser-back-assistant-still-waiting-answer-question-above")); return; }
      if (holder.state === "needs-check" || (latest && latest.phase === "reconcile-required")) { host.showToast?.(globalThis.t.text("workbench.assistant-browser-handback.browser-back-assistant-check-result-last-step-first")); return; }
      try {
        await api("/send", "POST", { work_id: holder.work_id, request_id: crypto.randomUUID(), written_by: "page", text: globalThis.t.text("workbench.assistant-browser-handback.i-ve-handed-browser-back-look-page-again") });
        await reload(); poll();
      } catch (error) { host.showToast?.(error); }
    })();
  });
  // A surface says the person changed something there that this work may show: read the work again.
  window.addEventListener("molis:assistant-surface-changed", (event) => {
    const detail = event.detail || {}, work = getWork();
    const id = detail.object && detail.object.id;
    if (!work || !id || !(work.executor && work.executor.session_id === id)) return;
    void reload().then(poll).catch(() => {});
  });`;
