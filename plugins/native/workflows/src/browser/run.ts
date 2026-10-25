import { tint } from "./chain.js";
import { arrive, calm, esc, ico, kindName, messageOf, required, said, settle, when } from "./dom.js";
import { dataHtml, handoffKey, renderHandoff } from "./handoff.js";
import type { WorkflowsPage } from "./page.js";
import { label, readyState, stnMeta } from "./state.js";
import type { Run, Station } from "./types.js";
import type { WorkflowStep } from "../model.js";

type StepState = "done" | "stopped" | "current" | "pending";
type LinkState = "done" | "working" | "waiting" | "blocked" | "future";

export function stepState(run: Run, index: number): StepState {
  const step = run.steps[index]!;
  if (step.status === "done" || (run.status === "done" && index <= run.current)) return "done";
  if (index === run.current && run.status !== "done") return run.status === "stopped" ? "stopped" : "current";
  return "pending";
}

export function linkState(page: WorkflowsPage, run: Run, index: number): LinkState {
  const { ui } = page;
  const link = run.chain.links[index]!, handoff = run.steps[index]!.handoff;
  if (handoff) return "done";
  if (ui.busy && ui.busy.kind === "handoff" && ui.busy.index === index) return "working";
  if (index === run.current && run.status === "active") return readyState(page, link).ready ? "waiting" : "blocked";
  return "future";
}

/** How the run reads in a list and in its bar. */
export function runStatus(page: WorkflowsPage, run: Run) {
  const { L } = page;
  if (run.status === "done") return { tone: "done", state: "done", text: L("workflows.run.done") };
  if (run.status === "stopped") return { tone: "quiet", state: "stopped", text: L("workflows.run.stopped", { n: run.current + 1 }) };
  return { tone: "progress", state: "doing", text: L("workflows.run.progress", { n: run.current + 1, total: run.chain.stations.length, plugin: label(page, run.chain.stations[run.current]!) }) };
}

export function pipsHtml(run: Run) {
  return '<span class="wf-pips" aria-hidden="true">' + run.chain.stations.map((station, index) => `<i data-state="${stepState(run, index)}" style="--station-tint:${tint(station.plugin)}"></i>`).join("") + "</span>";
}

function runBarHtml(page: WorkflowsPage, run: Run) {
  const { ui, L } = page;
  const status = runStatus(page, run);
  return `<button class="plugin-stage-back" type="button" data-wf-action="back-to-flow" aria-label="${esc(L("workflows.run.back-to-flow"))}" title="${esc(L("workflows.run.back-to-flow"))}">${ico("chevron-right")}</button>`
    + `<div class="wf-run__title"><h1>${esc(run.title)}</h1><span class="wf-muted">${esc(ui.instanceWorkflowTitle || "")}</span></div>`
    + pipsHtml(run) + `<span class="mw-status mw-status--${status.tone} mw-status--plain wf-run__status" data-mw-state="${status.state}">${esc(status.text)}</span>`
    + (run.status === "active" ? `<button class="mw-btn mw-btn--ghost" type="button" data-wf-action="stop">${ico("pause")}<span>${esc(L("workflows.run.end"))}</span></button>` : "");
}

const LINK_MARK: Record<LinkState, string> = { done: "done", working: "running", waiting: "answer", blocked: "blocked", future: "idle" };

function vchainHtml(page: WorkflowsPage, run: Run, selected: number) {
  const { L } = page;
  const chain = run.chain;
  return chain.stations.map((station, index) => {
    const step = run.steps[index]!, state = stepState(run, index);
    const mark = `<i data-mw-state="${state === "current" ? "doing" : state === "pending" ? "waiting" : state}"></i>`;
    let linkRow = "";
    if (index < chain.links.length) {
      const link = chain.links[index]!, ls = linkState(page, run, index), kind = kindName(L, link.kind);
      const text = ls === "done" ? L("workflows.run.kind-handed", { kind, time: when(step.handoff?.at) })
        : ls === "working" ? (link.kind === "ai" ? L("workflows.run.ai-working") : L("workflows.run.handing"))
        : ls === "waiting" ? (link.kind === "manual" ? L("workflows.run.manual-waiting") : L("workflows.run.waiting-continue", { kind }))
        : ls === "blocked" ? L("workflows.run.kind-not-connected", { kind }) : kind;
      linkRow = `<div class="wf-vlink" data-wf-vlink="${index}" data-kind="${link.kind}" data-state="${ls}"><span class="wf-vlink__line" aria-hidden="true"></span><span class="wf-vlink__label" data-mw-state="${LINK_MARK[ls]}">${esc(text)}</span></div>`;
    }
    const on = index === selected;
    const note = station.action ? (step.item ? L("workflows.run.ran-in", { place: station.action.group || L("workflows.run.the-plugin") }) : run.steps[index - 1]?.pending?.attempted_at ? L("workflows.run.unconfirmed") : state === "pending" ? L("workflows.run.not-reached") : "")
      : step.item ? step.item.title : (state === "pending" ? L("workflows.run.not-reached") : "");
    return `<button type="button" class="wf-vstep is-${state}${on ? " is-selected" : ""}" data-wf-step="${index}" tabindex="${on ? "0" : "-1"}" style="--station-tint:${tint(station.plugin)}"${on ? ' aria-current="step"' : ""}>`
      + `<span class="wf-vstep__mark">${mark}</span><span class="wf-station__icon">${ico(stnMeta(page, station.plugin).icon)}</span>`
      + `<span class="wf-vstep__copy"><strong>${esc(label(page, station))}</strong><small>${esc(note)}</small></span></button>${linkRow}`;
  }).join("");
}

export function drawRun(page: WorkflowsPage) {
  const { ui, view, L } = page;
  const run = ui.instance; if (!run) return;
  let article = view.querySelector<HTMLElement>(".wf-run");
  if (!article || article.dataset.id !== run.instance_id) {
    view.innerHTML = `<article class="wf-run" data-id="${esc(run.instance_id)}"><header class="plugin-stage-detail-bar wf-run__bar" data-wf-run-bar></header>`
      + `<div class="wf-run__body"><nav class="wf-vchain" data-wf-vchain aria-label="${esc(L("workflows.run.steps-heading"))}"></nav>`
      + '<section class="wf-stage"><header class="wf-stage__head" data-wf-stage-head></header><div class="wf-handoff" data-wf-handoff></div>'
      + '<div class="wf-stage__frame" data-wf-frame-slot></div></section></div></article>';
    article = required<HTMLElement>(view, ".wf-run");
    arrive(article);
    page.lastRun = { id: run.instance_id, steps: null, links: null };
  }
  patchInstance(page, article);
}

function patchInstance(page: WorkflowsPage, article: HTMLElement) {
  const { ui, L } = page;
  const run = ui.instance!;
  const index = Math.max(0, Math.min(ui.step, run.chain.stations.length - 1));
  const step = run.steps[index]!;
  required(article, "[data-wf-run-bar]").innerHTML = runBarHtml(page, run);

  const vchain = required(article, "[data-wf-vchain]");
  const stepFocus = vchain.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.wfStep : null;
  vchain.innerHTML = vchainHtml(page, run, index);
  const steps: string[] = run.steps.map((_, at) => stepState(run, at));
  const links: string[] = run.chain.links.map((_, at) => linkState(page, run, at));
  const last = page.lastRun;
  if (last.steps && last.links && !calm()) {
    steps.forEach((value, at) => { if (last.steps![at] !== value) vchain.querySelector(`[data-wf-step="${at}"]`)?.classList.add("is-changed"); });
    links.forEach((value, at) => { if (last.links![at] !== value) vchain.querySelector(`[data-wf-vlink="${at}"]`)?.classList.add("is-changed"); });
  }
  last.steps = steps; last.links = links;
  if (stepFocus !== null && stepFocus !== undefined) vchain.querySelector<HTMLElement>(`[data-wf-step="${stepFocus}"]`)?.focus({ preventScroll: true });
  required(article, "[data-wf-stage-head]").innerHTML = `<span class="wf-stage__step">${esc(L("workflows.run.step-n", { n: index + 1 }))}</span><span class="wf-station__icon" style="--station-tint:${tint(step.plugin)}">${ico(stnMeta(page, step.plugin).icon)}</span><strong>${esc(label(page, run.chain.stations[index]!))}</strong>`
    + (step.item && step.plugin !== "action" ? `<span class="wf-muted">${esc(step.item.title)}</span>` : "");
  const handoffBox = required(article, "[data-wf-handoff]");
  const actionFocus = handoffBox.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.wfAction : null;
  const key = handoffKey(page, run, index);
  handoffBox.innerHTML = renderHandoff(page, run, index);
  if (handoffBox.dataset.key !== key) { handoffBox.dataset.key = key; settle(handoffBox.firstElementChild); }
  if (actionFocus) handoffBox.querySelector<HTMLElement>(`[data-wf-action="${actionFocus}"]`)?.focus({ preventScroll: true });

  syncFrame(page, required(article, "[data-wf-frame-slot]"), step, run.chain.stations[index]);
}

/** The part of the stage that shows the step: what an action returned, or the plugin's own page for the item. */
function syncFrame(page: WorkflowsPage, slot: HTMLElement, step: WorkflowStep, station: Station | undefined) {
  const { L } = page;
  if (station?.action) {
    const key = "action:" + (step.item ? step.item.item_id : "pending") + ":" + (step.result === undefined ? "" : "done");
    if (slot.dataset.src === key) return;
    slot.dataset.src = key; slot.className = "wf-stage__frame is-empty";
    const result = step.result_presentation;
    slot.innerHTML = step.item
      ? `<div class="wf-stage__result"><div class="wf-result-summary" data-wf-result-summary><h3>${esc(said(L, result?.summary || "workflows.result.returned"))}</h3>`
        + (result?.title ? `<p class="wf-result-title">${esc(result.title)}</p>` : "")
        + (result?.text ? `<p class="wf-result-text">${esc(result.text)}</p>` : "")
        + (result?.text_truncated ? `<p class="wf-muted">${step.result_truncated ? esc(L("workflows.result.excerpt")) : esc(L("workflows.result.excerpt-full"))}</p>` : "")
        + (result?.link ? `<a class="mw-btn mw-btn--secondary" data-wf-result-link href="${esc(result.link.href)}">${esc(said(L, result.link.label))}</a>` : "") + "</div>"
        + `<details class="wf-result-details"><summary>${esc(L("workflows.result.technical"))}</summary>`
        + (step.result_truncated ? `<p class="wf-muted">${esc(L("workflows.result.too-long"))}</p>` : `<pre class="wf-rule">${esc(JSON.stringify(step.result ?? null, null, 2))}</pre>`) + "</details>"
        + `<details class="wf-result-details"><summary>${esc(L("workflows.result.input"))}</summary>${dataHtml(step.payload || { title: "", body: "" })}</details></div>`
      : `<div class="mw-empty wf-stage__empty"><span class="mw-empty__mark">${ico("zap")}</span><strong>${esc(L("workflows.run.not-at-step"))}</strong><p>${esc(L("workflows.run.will-run", { action: station.action.title }))}</p></div>`;
    settle(slot.firstElementChild);
    return;
  }
  if (!step.item) {
    if (slot.dataset.src === "") return;
    slot.dataset.src = "";
    slot.className = "wf-stage__frame is-empty";
    slot.innerHTML = `<div class="mw-empty wf-stage__empty"><span class="mw-empty__mark">${ico(stnMeta(page, step.plugin).icon)}</span><strong>${esc(L("workflows.run.not-at-step"))}</strong><p>${esc(L("workflows.run.will-show", { plugin: label(page, step.plugin) }))}</p></div>`;
    settle(slot.firstElementChild);
    return;
  }
  const src = step.item.plugin + ":" + step.item.item_id;
  if (slot.dataset.src === src) return;
  slot.dataset.src = src;
  slot.classList.remove("is-empty");
  const region = document.createElement("div");
  region.style.cssText = "width:100%;height:100%";
  slot.replaceChildren(region);
  slot.classList.add("is-loading", "is-cold");
  const embedded = page.host.view.embed(region, { surface: step.item.plugin, itemId: step.item.item_id, title: step.item.title || label(page, step.plugin) });
  embedded.ready.then(() => {
    if (slot.dataset.src === src) slot.classList.remove("is-loading", "is-cold");
  }).catch((error) => {
    if (!region.isConnected) return;
    slot.classList.remove("is-loading", "is-cold");
    region.textContent = messageOf(error);
  });
}
