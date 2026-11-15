/** The work in a sentence: its state and what it is doing now, the jump to what waits on the person, and the line over the conversation when the side pane is out of sight. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_STRIP_PART = String.raw`  /* 概况: the work's state and what it is doing now, where it belongs, who carries it, and what can be done to it now. */
  const nowLine = (work) => {
    if (!work) return globalThis.t.text("workbench.assistant-strip.starts-first-message-choose-who-does-where-lives");
    if (browserHeld.has(work.work_id)) return globalThis.t.text("workbench.assistant-strip.have-browser-hand-back-side-panel-assistant-will");
    const rounds = view && view.work.work_id === work.work_id ? view.rounds : [];
    const last = rounds[rounds.length - 1];
    const reviews = view && view.work.work_id === work.work_id ? view.reviews : [];
    // The state above already says it waits on the person; this line says on what.
    if (reviews.length) return reviews[0].summary + (reviews.length > 1 ? " · +" + (reviews.length - 1) : "");
    if (last && last.awaiting_input && last.awaiting_input.length) return clip(String(last.awaiting_input[0].prompt || ""), 80);
    if (work.state === "running") { const live = last && [...last.activity].reverse().find((item) => item.state === "started"); return live ? activityLine(live) : globalThis.t.text("workbench.assistant-strip.working"); }
    const ready = (view && view.cards ? view.cards : []).filter((card) => card.status === "ready" || card.status === "needs-input").length;
    if (ready) return ready + " " + globalThis.t.text("workbench.assistant-strip.actions-waiting");
    if (work.state === "paused") return globalThis.t.text("workbench.assistant-strip.paused-click-continue-go");
    if (work.state === "needs-check") return globalThis.t.text("workbench.assistant-strip.operation-s-outcome-unconfirmed-check-first");
    if ((work.state === "failed" || work.state === "stopped") && last && last.stop_reason && last.stop_reason_code !== "person") return last.stop_reason;
    if (work.state === "completed" && last && last.ended_at) return globalThis.t.text("workbench.assistant-strip.finished") + " " + when(last.ended_at);
    return "";
  };
  /** Scrolls the conversation to what waits on the person and marks it for a moment; a drawer steps aside first. */
  const jumpTo = (target) => {
    const node = typeof target === "string" ? thread.querySelector(target) : target;
    if (!node) return;
    if (!spacious() && drawerOpen) { drawerOpen = false; paintLayout(); }
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollOwner()?.release(); thread.scrollTo({ top: node.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - 16, behavior: still ? "auto" : "smooth" });
    node.removeAttribute("data-flash"); void node.offsetWidth; node.setAttribute("data-flash", "");
    setTimeout(() => node.removeAttribute("data-flash"), 700);
    // The card's own decision first (允许执行, 回答, the action), not a copy button inside the code it shows.
    (node.querySelector('.assistant-card-actions button:not([disabled]), [data-ix-action]:not([disabled]), [data-ix-focus]')
      || node.querySelector("button:not([disabled]):not(.assistant-code-copy):not(.assistant-code-more), input, select, textarea"))?.focus({ preventScroll: true });
  };
  // Something in this work waits on the person; what to press is in the row above the input.
  const waitsOn = (work) => Boolean(work && view && view.work.work_id === work.work_id && view.next_html && (WAITING.has(work.state) || view.next_html.includes("data-waiting")));
  const strip = island.querySelector("[data-assistant-strip]");
  /* With the side pane out of sight (a narrow panel's closed drawer, or folded away), the conversation's top line
     carries what the summary would when there is something to do: the state, the one next step, pause, resume or stop. */
  function paintStrip() {
    if (!strip || !panel) return;
    const work = view && view.work.work_id === curId ? view.work : getWork();
    stepRow?.paint();
    const state = work ? work.state : "idle", next = waitsOn(work);
    const liveChildren = work && view && view.delegated ? view.delegated.filter((child) => isLive(child.state)).length : 0;
    strip.hidden = !work || panel.hidden || sideOpen() || !(next || state === "running" || state === "paused" || liveChildren);
    if (strip.hidden) return;
    strip.dataset.tone = WAITING.has(state) ? "waiting" : state === "running" ? "running" : "";
    const stateNode = strip.querySelector("[data-assistant-strip-state]"), nowNode = strip.querySelector("[data-assistant-strip-now]");
    stateNode.textContent = stateLabel(state); stateNode.dataset.state = state; stateNode.dataset.mwState = ringState(state);
    nowNode.textContent = nowLine(work); nowNode.title = nowNode.textContent;
  }`;
