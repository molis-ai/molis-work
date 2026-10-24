import { tint } from "./chain.js";
import { EASE_SETTLE, MOD, arrive, calm, esc, ico, kindName, motion, required, said, settle, when } from "./dom.js";
import { emitCtx } from "./nav.js";
import type { WorkflowsPage } from "./page.js";
import { pipsHtml, runStatus } from "./run.js";
import { paintSave } from "./save.js";
import { label, readyState, stnMeta } from "./state.js";
import type { Flow, Station } from "./types.js";

function chainIssues(page: WorkflowsPage, chain: Flow) {
  return chain.links.map((link, index) => ({ index, link, state: readyState(page, link) })).filter((item) => !item.state.ready);
}

function stationHtml(page: WorkflowsPage, station: Station, index: number, count: number) {
  const { L } = page;
  const info = stnMeta(page, station.plugin), name = label(page, station);
  const away = station.availability?.available === false ? station.availability : null;
  return `<div class="wf-station" role="listitem" tabindex="0" draggable="true" data-wf-station="${index}" data-station-id="${esc(station.station_id)}" style="--station-tint:${tint(station.plugin)}"`
    + ` aria-label="${esc(L("workflows.station.label", { plugin: name, n: index + 1 }))}" aria-description="${esc(L("workflows.station.hint", { mod: MOD === "⌘" ? "⌥" : "Alt +" }))}">`
    + `<span class="wf-station__icon">${ico(info.icon)}</span>`
    + (station.action ? `<button type="button" class="wf-station__name wf-station__edit" tabindex="-1" data-wf-action="edit-step" data-index="${index}" title="${esc(L("workflows.station.edit-step"))}">${esc(name)}`
      + (station.action.group ? `<small>${esc(station.action.group)}</small>` : "") + "</button>" : `<span class="wf-station__name">${esc(name)}</span>`)
    + (away ? `<span class="wf-station__warning" role="img" aria-label="${esc(away.reason)}" title="${esc(away.reason)}">${ico("alert")}</span>` : "")
    + '<span class="wf-station__tools">'
    + (index > 0 ? `<button type="button" class="wf-tool" tabindex="-1" data-wf-action="move" data-from="${index}" data-gap="${index - 1}" aria-label="${esc(L("workflows.station.move-earlier"))}" title="${esc(L("workflows.station.move-earlier"))}">${ico("chevron-left")}</button>` : "")
    + (index < count - 1 ? `<button type="button" class="wf-tool" tabindex="-1" data-wf-action="move" data-from="${index}" data-gap="${index + 2}" aria-label="${esc(L("workflows.station.move-later"))}" title="${esc(L("workflows.station.move-later"))}">${ico("chevron-right")}</button>` : "")
    + `<button type="button" class="wf-tool wf-tool--danger" tabindex="-1" data-wf-action="remove" data-index="${index}" aria-label="${esc(L("workflows.station.remove"))}" title="${esc(L("workflows.station.remove"))}">${ico("x")}</button>`
    + "</span></div>";
}

function linkHtml(page: WorkflowsPage, flow: Flow, index: number) {
  const { ui, L } = page;
  const link = flow.links[index]!, ready = readyState(page, link);
  const from = flow.stations[index]!, to = flow.stations[index + 1]!;
  const between = label(page, from) + " → " + label(page, to);
  const open = ui.openLink === index;
  return `<div class="wf-link${ui.openGap === index + 1 ? " is-picking" : ""}" data-wf-gap="${index + 1}" data-link-key="${esc(from.station_id + ">" + to.station_id)}" data-kind="${link.kind}" data-ready="${ready.ready}">`
    + '<span class="wf-link__line" aria-hidden="true"></span>'
    + `<button type="button" class="wf-link__pill${open ? " is-open" : ""}" data-wf-action="link" data-link="${index}" aria-haspopup="dialog" aria-expanded="${open}" aria-label="${esc(between + " · " + kindName(L, link.kind) + (ready.ready ? "" : " · " + L("workflows.link.not-connected")))}">`
    + (ready.ready ? "" : ico("alert")) + `<span>${esc(kindName(L, link.kind))}</span></button>`
    + `<button type="button" class="wf-add" data-wf-action="gap" data-gap="${index + 1}" aria-label="${esc(L("workflows.gap.between", { a: label(page, from), b: label(page, to) }))}" title="${esc(L("workflows.gap.here"))}">${ico("plus")}</button>`
    + '<span class="wf-link__line" aria-hidden="true"></span></div>';
}

function chainBody(page: WorkflowsPage, flow: Flow) {
  const { ui, L } = page;
  if (!flow.stations.length) {
    return `<div class="wf-drop${ui.openGap === 0 ? " is-picking" : ""}" data-wf-gap="0"><span class="wf-drop__mark">${ico("workflow")}</span>`
      + `<button type="button" class="mw-btn mw-btn--ghost" data-wf-action="gap" data-gap="0">${ico("plus")}<span>${esc(L("workflows.gap.first"))}</span></button><span class="wf-muted">${esc(L("workflows.gap.drag-here"))}</span></div>`;
  }
  const end = (gap: number, name: string) => `<div class="wf-end${ui.openGap === gap ? " is-picking" : ""}" data-wf-gap="${gap}"><button type="button" class="wf-add" data-wf-action="gap" data-gap="${gap}" aria-label="${esc(name)}" title="${esc(name)}">${ico("plus")}</button></div>`;
  const parts = [end(0, L("workflows.gap.at-start"))];
  flow.stations.forEach((station, index) => {
    parts.push(stationHtml(page, station, index, flow.stations.length));
    if (index < flow.links.length) parts.push(linkHtml(page, flow, index));
  });
  parts.push(end(flow.stations.length, L("workflows.gap.at-end")));
  return parts.join("");
}

function faultHtml(page: WorkflowsPage, flow: Flow) {
  const { L } = page;
  const issues = chainIssues(page, flow);
  if (!issues.length) return "";
  return `<p class="wf-issues" role="status">${ico("alert")}<span>${esc(L("workflows.issues.count", { count: issues.length }))}` + issues.map((item) => {
    const message = esc(label(page, flow.stations[item.index]!) + " → " + label(page, flow.stations[item.index + 1]!) + "（" + said(L, item.state.reason) + "）");
    if (flow.stations.slice(item.index, item.index + 2).some((station) => station.availability?.available === false)) return `<span>${message}</span>`;
    return `<button type="button" class="wf-issue" data-wf-action="link" data-link="${item.index}">${message}</button>`;
  }).join('<span aria-hidden="true">；</span>') + "</span></p>";
}

function runsHtml(page: WorkflowsPage, flow: Flow) {
  const { ui, L } = page;
  const absent = flow.stations.find((station) => station.availability?.available === false);
  const failed = page.edits.get(flow.workflow_id)?.error;
  const canStart = flow.stations.length >= 2 && !absent && !failed;
  const startReason = failed ? L("workflows.save.failed") : absent ? absent.availability?.reason ?? "" : L("workflows.run.need-two");
  const head = `<div class="wf-section__head"><h2>${esc(L("workflows.run.heading"))}</h2><span class="wf-muted">${esc(ui.instances.length ? L("workflows.list.run-count", { count: ui.instances.length }) : "")}</span>`
    + `<button class="mw-btn mw-btn--primary" type="button" data-wf-action="start"${canStart ? "" : ` disabled title="${esc(startReason)}"`}>${ico("play")}<span>${esc(L("workflows.run.start"))}</span></button></div>`;
  if (!ui.instances.length) {
    return head + `<p class="wf-muted wf-runs-empty">${esc(absent ? L("workflows.run.restore-first") : canStart ? L("workflows.run.none-yet", { plugin: label(page, flow.stations[0]!) }) : L("workflows.run.arrange-first"))}</p>`;
  }
  return head + '<div class="wf-runs">' + ui.instances.map((run) => {
    const status = runStatus(page, run);
    return `<button type="button" class="wf-run-row" data-wf-open-instance="${esc(run.instance_id)}"><span class="wf-run-row__title">${esc(run.title)}</span>${pipsHtml(run)}`
      + `<span class="mw-status mw-status--${status.tone} mw-status--plain" data-mw-state="${status.state}">${esc(status.text)}</span><span class="wf-muted">${esc(when(run.updated_at))}</span></button>`;
  }).join("") + "</div>";
}

export function returnHtml(page: WorkflowsPage) {
  const { ui, L } = page;
  if (!ui.returnTo) return "";
  return `<button class="mw-btn mw-btn--ghost wf-return" type="button" data-wf-action="return-to-run">${ico("back")}<span>${esc(L("workflows.return.back", { title: ui.returnTo.title }))}</span></button>`;
}

function paletteHtml(page: WorkflowsPage) {
  const { ui, L } = page;
  const joinable = ui.stations.filter((info) => info.supported), others = ui.stations.filter((info) => !info.supported);
  return joinable.map((info) => `<button type="button" class="wf-chip" draggable="true" data-wf-plugin="${esc(info.plugin)}" data-wf-action="append" title="${esc(L("workflows.palette.chip-hint"))}" style="--station-tint:${tint(info.plugin)}">${ico(info.icon)}<span>${esc(said(L, info.label))}</span></button>`).join("")
    + `<button type="button" class="wf-chip wf-chip--action" data-wf-action="add-step" title="${esc(L("workflows.palette.action-hint"))}">${ico("zap")}<span>${esc(L("workflows.palette.add-action"))}</span></button>`
    + (others.length ? `<span class="wf-palette__others" title="${esc(others.map((info) => said(L, info.label)).join("、"))}">${esc(L("workflows.palette.others", { count: others.length }))}</span>` : "");
}

export function drawFlow(page: WorkflowsPage) {
  const { ui, view, L } = page;
  const flow = ui.workflow;
  if (!flow) return;
  emitCtx(page);
  const current = view.querySelector<HTMLElement>(".wf-editor");
  if (current && current.dataset.id === flow.workflow_id) { patchFlowRow(page, current); paintSave(page); return; }
  view.innerHTML = `<article class="wf-editor" data-id="${esc(flow.workflow_id)}">`
    + `<header class="plugin-stage-detail-bar wf-editor__bar"><button class="plugin-stage-back" type="button" data-wf-action="back" aria-label="${esc(L("workflows.editor.back"))}" title="${esc(L("workflows.editor.back"))}">${ico("chevron-right")}</button>`
    + `<input class="mw-input wf-title-input" data-wf-title data-inline-title value="${esc(flow.title)}" aria-label="${esc(L("workflows.editor.name"))}" maxlength="120">`
    + `<span class="wf-return-slot" data-wf-return>${returnHtml(page)}</span>`
    + `<span class="wf-save-state" data-wf-save-state data-state="idle" aria-live="polite">${esc(L("workflows.save.saved"))}</span>`
    + `<button class="mw-btn mw-btn--ghost wf-danger" type="button" data-wf-action="delete">${ico("trash")}<span>${esc(L("workflows.editor.delete"))}</span></button></header>`
    + '<div class="wf-editor__scroll">'
    + `<section class="wf-section"><h2>${esc(L("workflows.chain.heading"))}</h2><p class="wf-hint">${esc(L("workflows.chain.hint"))}</p>`
    + `<div class="wf-chain${flow.stations.length ? "" : " is-empty"}" data-wf-chain${flow.stations.length ? ' role="list"' : ""} aria-label="${esc(L("workflows.chain.label"))}">${chainBody(page, flow)}</div>`
    + `<div class="wf-issues-slot" data-wf-issues>${faultHtml(page, flow)}</div>`
    + `<div class="wf-palette" aria-label="${esc(L("workflows.palette.label"))}"><span class="wf-palette__label">${esc(L("workflows.palette.plugins"))}</span>${paletteHtml(page)}</div></section>`
    + `<section class="wf-section" data-wf-runs>${runsHtml(page, flow)}</section></div></article>`;
  arrive(view.querySelector<HTMLElement>(".wf-editor"));
  paintSave(page);
}

function patchFlowRow(page: WorkflowsPage, editor: HTMLElement) {
  const flow = page.ui.workflow!;
  const title = editor.querySelector<HTMLInputElement>("[data-wf-title]");
  if (title && document.activeElement !== title && title.value !== flow.title) title.value = flow.title;
  required(editor, "[data-wf-return]").innerHTML = returnHtml(page);
  patchChain(page, required(editor, "[data-wf-chain]"));
  const issues = required(editor, "[data-wf-issues]");
  const hadIssues = Boolean(issues.firstElementChild);
  issues.innerHTML = faultHtml(page, flow);
  if (!hadIssues && issues.firstElementChild) settle(issues.firstElementChild);
  required(editor, "[data-wf-runs]").innerHTML = runsHtml(page, flow);
}

/** Draws the chain again and moves what was there to where it now stands. */
function patchChain(page: WorkflowsPage, chainEl: HTMLElement) {
  const flow = page.ui.workflow!;
  const before = new Map<string, DOMRect>();
  for (const node of chainEl.querySelectorAll<HTMLElement>("[data-station-id]")) before.set(node.dataset.stationId!, node.getBoundingClientRect());
  const links = new Map<string, string>();
  for (const node of chainEl.querySelectorAll<HTMLElement>("[data-link-key]")) links.set(node.dataset.linkKey!, node.dataset.kind + ":" + node.dataset.ready);
  const focused = document.activeElement?.closest<HTMLElement>("[data-station-id]");
  const focusId = page.focusNext || (focused && chainEl.contains(focused) ? focused.dataset.stationId : null);
  page.focusNext = null;
  const empty = !flow.stations.length;
  chainEl.classList.toggle("is-empty", empty);
  if (empty) chainEl.removeAttribute("role"); else chainEl.setAttribute("role", "list");
  chainEl.innerHTML = chainBody(page, flow);
  let arrived: HTMLElement | null = null;
  for (const node of chainEl.querySelectorAll<HTMLElement>("[data-station-id]")) {
    const was = before.get(node.dataset.stationId!);
    if (!was) {
      arrived = node;
      motion(node, [{ opacity: 0, transform: "scale(.88)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE_SETTLE });
      continue;
    }
    const dx = was.left - node.getBoundingClientRect().left;
    if (Math.abs(dx) > 1) motion(node, [{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 260 });
  }
  for (const node of chainEl.querySelectorAll<HTMLElement>("[data-link-key]")) {
    const was = links.get(node.dataset.linkKey!);
    const now = node.dataset.kind + ":" + node.dataset.ready;
    if (was === undefined) motion(node, [{ opacity: 0 }, { opacity: 1 }], { duration: 190, delay: 60, fill: "backwards" });
    else if (was !== now) motion(node.querySelector(".wf-link__pill"), [{ transform: "scale(.86)", opacity: 0.4 }, { transform: "none", opacity: 1 }], { duration: 220, easing: EASE_SETTLE });
  }
  if (arrived) (arrived as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest", behavior: calm() ? "auto" : "smooth" });
  if (focusId) chainEl.querySelector<HTMLElement>(`[data-station-id="${focusId}"]`)?.focus({ preventScroll: true });
}
