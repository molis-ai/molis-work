import { MOD, esc, ico, kindName, messageOf, said, statusOf, when } from "./dom.js";
import { drawList } from "./list.js";
import { openRun, remember } from "./nav.js";
import type { WorkflowsPage } from "./page.js";
import { drawRun } from "./run.js";
import { label, readyState, ruleText } from "./state.js";
import { toast } from "./toast.js";
import type { FlowAnswer, InstanceAnswer, ListAnswer, PreviewAnswer, Run, WorkflowPayload } from "./types.js";

export function dataHtml(data: WorkflowPayload) {
  return `<div class="wf-payload"><strong>${esc(data.title)}</strong><pre>${esc(data.body)}</pre>` + (data.url ? `<a href="${esc(data.url)}" target="_blank" rel="noopener noreferrer">${esc(data.url)}</a>` : "") + "</div>";
}

/** What the handoff box shows, as a key: the box is only redrawn with motion when this changes. */
export function handoffKey(page: WorkflowsPage, run: Run, index: number) {
  const { ui } = page;
  const step = run.steps[index]!;
  if (step.handoff) return index + ":record";
  if (ui.handoff?.index === index) return index + ":manual";
  if (index >= run.chain.links.length || run.status !== "active" || index !== run.current) return index + ":" + run.status;
  return index + ":bar:" + readyState(page, run.chain.links[index]!).ready;
}

/** The box under a step's heading: the record of its handoff, or what can be done about it now. */
export function renderHandoff(page: WorkflowsPage, run: Run, index: number) {
  const { ui, L } = page;
  const step = run.steps[index]!, chain = run.chain;
  if (step.handoff) {
    const handoff = step.handoff, next = label(page, chain.stations[index + 1]!);
    const who = handoff.actor === "ai" ? L("workflows.handoff.ai-done", { next }) : handoff.actor === "function" ? L("workflows.handoff.rule-done", { next })
      : handoff.actor === "judgment" ? L("workflows.handoff.judged", { choice: handoff.verdict?.choice || "", next }) : L("workflows.handoff.manual-done", { next });
    return `<details class="wf-record mw-disclosure"${handoff.actor === "ai" ? " open" : ""}><summary><span class="wf-handoff__kind" data-kind="${handoff.kind}">${esc(kindName(L, handoff.kind))}</span><span>${esc(who)}</span><span class="wf-muted">${esc(when(handoff.at))}</span></summary>`
      + `<div class="wf-record__body"><p class="wf-record__label">${handoff.actor === "ai" ? esc(L("workflows.handoff.ai-output")) : esc(L("workflows.handoff.handed-content"))}</p>${dataHtml(handoff.output)}`
      + (handoff.rule ? `<p class="wf-record__label">${handoff.actor === "ai" ? esc(L("workflows.handoff.instruction")) : handoff.actor === "judgment" ? esc(L("workflows.kind.judgment")) : esc(L("workflows.handoff.rule"))}</p><pre class="wf-rule">${esc(handoff.rule)}</pre>` : "")
      + (handoff.verdict ? `<p class="wf-record__label">${esc(L("workflows.handoff.judgment"))}</p><p class="wf-verdict">${esc(ruleText(page, handoff.verdict))}</p>` : "")
      + `<button class="mw-btn mw-btn--ghost" type="button" data-wf-step="${index + 1}"><span>${esc(L("workflows.handoff.see-run", { next }))}</span>${ico("arrow")}</button></div></details>`;
  }
  if (index >= chain.links.length) {
    return run.status === "done" ? `<p class="wf-handoff__note is-done"><span data-mw-state="done" aria-hidden="true"></span><span>${esc(L("workflows.handoff.last-station"))}</span></p>` : "";
  }
  if (run.status !== "active" || index !== run.current) {
    if (run.status === "stopped" && index === run.current) {
      if (run.stopped && run.stopped.from === index) return `<p class="wf-handoff__note is-held">${ico("pause")}<span>${esc(said(L, run.stopped.reason))}` + (run.stopped.verdict ? " · " + esc(ruleText(page, run.stopped.verdict)) : "") + "</span></p>";
      return `<p class="wf-handoff__note">${ico("pause")}<span>${esc(L("workflows.handoff.ended-here"))}</span></p>`;
    }
    return "";
  }
  const link = chain.links[index]!, ready = readyState(page, link), next = label(page, chain.stations[index + 1]!);
  const busy = ui.busy && ui.busy.index === index ? ui.busy : null;
  const target = chain.stations[index + 1]!;
  if (target.action && step.pending?.attempted_at && !busy) {
    // The action was called and never confirmed: nothing repeats it until the person has checked.
    return '<div class="wf-handoff__bar is-blocked wf-uncertain" role="status"><span data-mw-state="verify" aria-hidden="true"></span><span>'
      + esc(step.pending.attempt_error ? L("workflows.action.last-failed", { action: target.action.title, error: step.pending.attempt_error }) : L("workflows.action.last-unconfirmed", { action: target.action.title }))
      + " · " + esc(L("workflows.action.check-first", { place: target.action.group || L("workflows.run.the-plugin") })) + "</span>"
      + `<button class="mw-btn mw-btn--secondary" type="button" data-wf-action="stop">${esc(L("workflows.run.end"))}</button>`
      + `<button class="mw-btn mw-btn--primary" type="button" data-wf-action="retry-action" data-index="${index}">${ico("refresh")}<span>${esc(L("workflows.action.run-again"))}</span></button></div>`;
  }
  if (ui.handoff?.index === index && ui.handoff.mode === "manual") {
    const draft = ui.handoff.draft;
    return `<form class="wf-manual" data-wf-manual><header><strong>${esc(L("workflows.manual.hand-to", { next }))}</strong><span class="wf-muted">${esc(L("workflows.manual.hint"))}</span></header>`
      + `<label class="mw-field"><span class="mw-field__label">${esc(L("workflows.field.title"))}</span><input class="mw-input" name="title" maxlength="200" value="${esc(draft.title)}"></label>`
      + `<label class="mw-field"><span class="mw-field__label">${esc(L("workflows.field.body"))}</span><textarea class="mw-textarea" name="body" data-fit rows="5">${esc(draft.body)}</textarea></label>`
      + `<footer><span class="wf-kbd-hint"><kbd class="mw-kbd">${esc(MOD)} ↵</kbd>${esc(L("workflows.manual.hand-over"))}<kbd class="mw-kbd">Esc</kbd>${esc(L("workflows.manual.not-now"))}</span>`
      + `<button class="mw-btn mw-btn--secondary" type="button" data-wf-action="handoff-cancel">${esc(L("workflows.manual.not-now"))}</button>`
      + `<button class="mw-btn mw-btn--primary" type="submit" data-wf-action="handoff-submit"${busy ? ' data-loading aria-disabled="true"' : ""}>${busy ? '<span class="mw-spinner" aria-hidden="true"></span>' : ""}<span>${esc(L("workflows.manual.submit-to", { next }))}</span></button></footer></form>`;
  }
  if (!ready.ready) {
    return `<p class="wf-handoff__bar is-blocked">${ico("alert")}<span>${esc(L("workflows.handoff.next-blocked", { kind: kindName(L, link.kind), next, reason: said(L, ready.reason) }))}</span><button class="mw-btn mw-btn--ghost" type="button" data-wf-action="edit-link" data-link="${index}">${esc(L("workflows.handoff.configure"))}</button></p>`;
  }
  const act = link.kind === "manual" ? L("workflows.handoff.review-and-hand", { next }) : link.kind === "ai" ? L("workflows.handoff.ai-and-hand", { next })
    : link.kind === "judgment" ? L("workflows.handoff.judge-and-hand", { next }) : L("workflows.handoff.rule-and-hand", { next });
  const working = busy ? (busy.kind === "preview" ? L("workflows.handoff.loading") : target.action && link.kind !== "ai" && link.kind !== "judgment" ? L("workflows.handoff.running") : link.kind === "ai" ? L("workflows.run.ai-working") : link.kind === "judgment" ? L("workflows.handoff.judging") : L("workflows.run.handing")) : act;
  return `<p class="wf-handoff__bar${busy ? " is-working" : ""}"><span class="wf-handoff__kind" data-kind="${link.kind}">${esc(kindName(L, link.kind))}</span><span>${esc(L("workflows.handoff.next", { kind: link.kind === "manual" ? L("workflows.handoff.after-person") : link.kind === "ai" ? L("workflows.handoff.after-ai") : link.kind === "judgment" ? L("workflows.handoff.after-judgment") : L("workflows.handoff.by-rule"), next }))}</span>`
    + `<button class="mw-btn mw-btn--primary" type="button" data-wf-action="continue" data-index="${index}"${busy ? ' aria-disabled="true" aria-busy="true"' : ""}>${busy ? '<span class="mw-spinner" aria-hidden="true"></span>' : ico("arrow")}<span>${esc(working)}</span></button></p>`;
}

/** Hands the content over: a manual link first shows what will be handed, the others go on at once. */
export async function resumeRun(page: WorkflowsPage, index: number, manual?: { title: string; body: string }, options: { retry?: boolean } = {}) {
  const { ui, view, L } = page;
  if (ui.busy) return;
  const run = ui.instance!, link = run.chain.links[index]!;
  if (link.kind === "manual" && !manual) {
    ui.busy = { index, kind: "preview" }; drawRun(page);
    try {
      const preview = await page.api<PreviewAnswer>("/instances/" + run.instance_id + "/preview", { from: index });
      ui.handoff = { index, mode: "manual", input: preview.input, draft: { title: preview.input.title, body: preview.input.body } };
    } catch (error) { toast(page, messageOf(error), "error"); }
    ui.busy = null; drawRun(page);
    view.querySelector<HTMLElement>("[data-wf-manual] input[name=title]")?.focus();
    return;
  }
  ui.busy = { index, kind: "handoff" }; drawRun(page);
  try {
    const answer = await page.api<InstanceAnswer>("/instances/" + run.instance_id + "/continue", { from: index, updated_at: run.updated_at, ...(manual || {}), ...(options.retry ? { retry_action: true } : {}) });
    ui.instance = answer.instance; ui.handoff = null; ui.step = index + 1;
    const target = run.chain.stations[index + 1]!;
    toast(page, target.action ? L("workflows.toast.action-ran", { action: target.action.title }) : L("workflows.toast.handed-to", { next: label(page, target) }));
    refreshFlow(page);
  } catch (error) {
    toast(page, messageOf(error), "error");
    if (statusOf(error) === 409 || run.chain.stations[index + 1]?.action) { ui.busy = null; await openRun(page, run.instance_id).catch(() => undefined); }
  }
  ui.busy = null; remember(page); drawRun(page);
}

/** The workflow's runs and the list's counts, read again after a run moved. */
export function refreshFlow(page: WorkflowsPage) {
  const { ui } = page;
  if (!ui.workflow) return;
  page.api<FlowAnswer>("/" + ui.workflow.workflow_id).then((answer) => { ui.instances = answer.instances; }).catch(() => undefined);
  page.api<ListAnswer>("").then((answer) => { ui.workflows = answer.workflows; drawList(page); }).catch(() => undefined);
}

export function selectStep(page: WorkflowsPage, index: number) {
  const { ui } = page;
  if (!ui.instance || index === ui.step) return;
  ui.step = index; if (ui.handoff && ui.handoff.index !== index) ui.handoff = null;
  remember(page); drawRun(page);
}

export function cancelHand(page: WorkflowsPage) {
  page.ui.handoff = null; drawRun(page);
  page.view.querySelector<HTMLElement>("[data-wf-action=continue]")?.focus({ preventScroll: true });
}
