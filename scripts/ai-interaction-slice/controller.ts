import { createDemo, fieldOrder, type Layout, type Outcome } from "./model.ts";
import { backgroundUpdate, beginAnswer, cancelAnswer, invalidate, reopen, resolveConflict, settleAnswer } from "./state.ts";
import { beginExecution, continueDraft, preparePreview, reconcile, settleExecution } from "./execution.ts";
import { createRecommendation } from "./recommendation.ts";
import { atEnd, find, show } from "./dom.ts";
import { bindScene } from "./bindings.ts";
import { paint } from "./paint.ts";
import type { InteractionClient } from "@molis-ai/molis-work-plugin-sdk/page-globals";

const wide = () => matchMedia("(min-width: 1281px)").matches;

export function mountScene(root: HTMLElement, layout: Layout, updateCounters: () => void) {
  const state = createDemo(layout);
  const recommendation = createRecommendation();
  const thread = find(root, "[data-thread]");
  const composer = find<HTMLInputElement | HTMLTextAreaElement>(root, "[data-composer]");
  const tools = root.querySelector<HTMLElement>("[data-tools]");
  let nextOutcome: Outcome = "done";
  let answerFails = false;
  let client!: InteractionClient;
  if (tools) {
    tools.dataset.tools = wide() ? "open" : "closed";
    // Crossing the breakpoint resets the column: side by side when there is room, an overlay only on request.
    matchMedia("(min-width: 1281px)").addEventListener("change", event => { tools.dataset.tools = event.matches ? "open" : "closed"; refresh(); });
  }

  function paintFrame(): void {
    const closed = root.dataset.panel === "closed";
    show(root, '[data-action="panel-open"]', closed);
    if (tools) root.querySelectorAll('[data-action="tools"]').forEach(button => button.setAttribute("aria-expanded", String(tools.dataset.tools === "open")));
    find(root, "[data-jump]").hidden = atEnd(thread) || find(root, "[data-jump]").hidden;
  }
  // The status line confirms what just happened, then steps aside; the cards keep the lasting state.
  let lastNotice = "", noticeTimer = 0;
  function settleNotice(): void {
    if (state.notice === lastNotice) return;
    lastNotice = state.notice;
    root.querySelectorAll<HTMLElement>("[data-notice]").forEach(line => { line.hidden = false; });
    clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => root.querySelectorAll<HTMLElement>("[data-notice]").forEach(line => { line.hidden = true; }), 6000);
  }
  const refresh = () => { paint(root, state, recommendation, client); paintFrame(); settleNotice(); updateCounters(); };
  /** New content arrived below: follow it only when the person was already at the end, otherwise offer a way down. */
  function arrived(target: HTMLElement, focusTarget: boolean): void {
    const following = atEnd(thread) || focusTarget;
    if (focusTarget) target.focus({ preventScroll: true });
    if (following) target.scrollIntoView({ block: "nearest" });
    else find(root, "[data-jump]").hidden = false;
  }
  /** Focus moves with a result only if it had nowhere better to be (the pressed button went away or was disabled). */
  const idleFocus = (scope: Element) => document.activeElement === document.body || document.activeElement === null || scope.contains(document.activeElement);
  function land(element: Element | null): void {
    if (!element) return;
    element.removeAttribute("data-landed");
    void (element as HTMLElement).offsetWidth;
    element.setAttribute("data-landed", "");
    element.addEventListener("animationend", () => element.removeAttribute("data-landed"), { once: true });
  }
  const begin = () => {
    const ticket = beginAnswer(state);
    refresh();
    if (ticket === null) {
      const first = fieldOrder.find(name => state.errors[name]);
      if (first) client.focusField(first);
      return;
    }
    const fail = answerFails;
    const card = find(root, "[data-ix-question]");
    setTimeout(() => {
      const focusable = idleFocus(card);
      if (!settleAnswer(state, ticket, fail)) return;
      refresh();
      if (state.question === "received") arrived(find(root, "[data-ix-operation]"), focusable);
    }, 700);
  };
  const execute = () => {
    const ticket = beginExecution(state);
    if (ticket === null) return;
    const outcome = nextOutcome;
    refresh();
    setTimeout(() => {
      const focusable = idleFocus(find(root, "[data-ix-operation]"));
      if (!settleExecution(state, ticket, outcome)) return;
      refresh();
      if (state.execution === "done") arrived(find(root, "[data-ix-result]"), focusable);
    }, 900);
  };
  const showPreview = () => {
    if (!preparePreview(state)) return;
    refresh();
    const preview = find(root, "[data-ix-preview]");
    preview.focus({ preventScroll: true });
    preview.scrollIntoView({ block: "nearest" });
  };
  const firstField = () => { refresh(); client.focusField("format"); };
  const openTools = (open: boolean, focus = false) => {
    if (!tools) return;
    tools.dataset.tools = open ? "open" : "closed";
    refresh();
    const panel = find(root, "[data-tools-panel]");
    if (open && focus) { land(panel); panel.focus({ preventScroll: true }); }
    if (!open) root.querySelector<HTMLElement>(".cd-tools-toggle")?.focus();
  };
  function action(name: string): void {
    switch (name) {
      case "close": state.questionClosed = true; break;
      case "open": state.questionClosed = false; refresh(); client.focusField("format"); return;
      case "cancel": case "cancel-pending": cancelAnswer(state); break;
      case "reopen": case "revise": if (reopen(state)) { firstField(); return; } break;
      case "adopt": resolveConflict(state, true); refresh(); land(root.querySelector('[data-ix-field="minutes"]')); return;
      case "keep": resolveConflict(state, false); break;
      case "background": backgroundUpdate(state); refresh(); state.refreshed.forEach(name => land(root.querySelector(`[data-ix-field="${name}"]`))); return;
      case "expire": invalidate(state, "expired"); break;
      case "replace": invalidate(state, "replaced"); break;
      case "object": invalidate(state, "object"); break;
      case "preview": case "retry": showPreview(); return;
      case "execute": execute(); return;
      case "reconcile": if (reconcile(state)) { refresh(); if (state.execution === "done") arrived(find(root, "[data-ix-result]"), true); return; } break;
      case "result": show(root, "[data-ix-result-details]", true); refresh(); find(root, "[data-ix-result]").focus({ preventScroll: true }); find(root, "[data-ix-result]").scrollIntoView({ block: "nearest" }); return;
      case "continue": if (continueDraft(state)) { show(root, "[data-ix-result-details]", false); firstField(); return; } break;
      case "changes": openTools(true, true); return;
      case "tools": openTools(tools?.dataset.tools !== "open"); return;
      case "minimise": root.dataset.panel = "closed"; refresh(); find(root, '[data-action="panel-open"]').focus(); return;
      case "panel-open": root.dataset.panel = "open"; refresh(); composer.focus(); return;
      case "outcome-done": nextOutcome = "done"; answerFails = false; break;
      case "answer-failure": answerFails = true; break;
      case "outcome-failed": nextOutcome = "failed"; answerFails = false; break;
      case "outcome-unknown": nextOutcome = "unknown"; answerFails = false; break;
    }
    refresh();
  }
  client = bindScene({ root, state, recommendation, composer, thread, tools, refresh, action, begin, land, openTools, wide });
  show(root, "[data-ix-result-details]", false);
  refresh();
  return {
    state, action, refresh,
    description: () => `下一次：回答${answerFails ? "失败" : "成功"} · 执行${nextOutcome === "done" ? "完成" : nextOutcome === "failed" ? "失败" : "结果未知"}`,
  };
}
