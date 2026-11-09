import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { WorkflowLink, WorkflowLinkKind } from "../model.js";
import { ruleKey } from "./chain.js";
import { escapeHtml as esc } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ico, kindHelp, kindName, required, said, settle } from "./dom.js";
import type { WorkflowsPage } from "./page.js";
import { fitPop, markOpen, pillOf, placePop } from "./popover.js";
import { saveFlow, chainOf } from "./save.js";
import { label, loadRules, readyState } from "./state.js";
import type { Ready } from "./types.js";

/** The words a function link's rule can take from the content handed over. */
const TOKENS = ["标题", "正文", "来源", "链接", "日期"];
const KINDS: readonly WorkflowLinkKind[] = ["judgment", "function", "ai", "manual"];

const field = (name: string, title: string, value: string, rows: number, placeholder: string) => `<label class="mw-field"><span class="mw-field__label">${esc(title)}</span>`
  + (rows === 1 ? `<input class="mw-input" data-wf-link-field="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}">`
    : `<textarea class="mw-textarea" rows="${rows}" data-wf-link-field="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`) + "</label>";

/** What the link needs from the person, by its kind. */
export function linkView(page: WorkflowsPage, link: WorkflowLink) {
  const { ui, L } = page;
  if (link.kind === "function") {
    return field("title_template", uiText.text("workflows.rule.title"), link.title_template, 1, "{标题}")
      + field("body_template", uiText.text("workflows.rule.body"), link.body_template, 5, uiText.text("workflows.rule.body-placeholder", { source: "{来源}", link: "{链接}", body: "{正文}" }))
      + `<p class="wf-tokens"><span>${esc(uiText.text("workflows.rule.insert"))}</span>` + TOKENS.map((name) => `<button type="button" class="wf-token" data-wf-token="{${name}}" title="${esc(uiText.text("workflows.rule.insert-into-body"))}">{${esc(name)}}</button>`).join("") + "</p>"
      + `<p class="wf-hint">${esc(uiText.text("workflows.rule.title-empty-note"))}</p>`;
  }
  if (link.kind === "ai") return field("instructions", uiText.text("workflows.ai.target"), link.instructions, 4, uiText.text("workflows.ai.placeholder"));
  if (link.kind === "judgment") {
    if (!ui.judgments) return '<div class="wf-judgment" aria-busy="true"><span class="mw-skeleton" style="width:70%"></span><span class="mw-skeleton wf-skeleton-small"></span></div>';
    const rows = [...ui.judgments];
    if (link.judgment && !rows.some((row) => ruleKey(row.ref) === ruleKey(link.judgment))) rows.unshift({ ref: link.judgment, title: link.judgment.title || link.judgment.capability_id, choices: [], available: false, reason: "workflows.judgment.gone" });
    const current = rows.find((row) => ruleKey(row.ref) === ruleKey(link.judgment));
    const picker = rows.length
      ? `<label class="mw-field"><span class="mw-field__label">${esc(uiText.text("workflows.kind.judgment"))}</span><select class="mw-select" data-wf-judgment>`
        + (link.judgment ? "" : `<option value="" selected>${esc(uiText.text("workflows.judgment.choose"))}</option>`)
        + rows.map((row) => `<option value="${esc(ruleKey(row.ref))}"${row === current ? " selected" : ""}>${esc(row.title + " · v" + row.ref.version + (row.available ? "" : " · " + said(L, row.reason || "workflows.judgment.unavailable")))}</option>`).join("") + "</select></label>"
      : `<p class="wf-hint">${esc(uiText.text("workflows.judgment.none"))} <a href="/capabilities/rules">${esc(uiText.text("workflows.judgment.write"))}</a></p>`;
    const choices = current ? `<fieldset class="wf-pass"><legend class="mw-field__label">${esc(uiText.text("workflows.judgment.pass-when"))}</legend>`
      + (current.choices.length ? current.choices.map((choice) => `<label class="mw-check-row"><input class="mw-check" type="checkbox" data-wf-pass value="${esc(choice)}"${(link.pass || []).includes(choice) ? " checked" : ""}><span>${esc(choice)}</span></label>`).join("")
        : `<p class="wf-muted">${esc(uiText.text("workflows.judgment.unreadable"))}</p>`) + "</fieldset>" : "";
    return picker + choices + `<p class="wf-hint">${esc(uiText.text("workflows.judgment.note"))}</p>`;
  }
  return `<p class="wf-hint">${esc(uiText.text("workflows.manual.note"))}</p>`;
}

function backFoot(page: WorkflowsPage, ready: Ready) {
  const { ui } = page;
  if (!ui.returnTo) return "";
  return `<footer class="wf-pop__foot"><button class="mw-btn mw-btn--primary" type="button" data-wf-action="return-to-run" data-wf-return-button${ready.ready ? "" : " disabled"}>${ico("arrow")}<span>${esc(uiText.text("workflows.link.return-continue", { title: ui.returnTo.title }))}</span></button></footer>`;
}

export function readyRow(page: WorkflowsPage, ready: Ready) {
  const { L } = page;
  if (ready.ready) return `${ico("check")}<span>${esc(uiText.text("workflows.link.connected"))}</span>`;
  // The settings open for this link and come back to it (specs/draft-and-return §4): the flow is the object, the link the step.
  const fix = ready.reason === "workflows.ready.no-model" ? ` <button class="mw-btn mw-btn--ghost mw-btn--sm wf-model-settings" type="button" data-wf-action="model-settings">${esc(uiText.text("workflows.link.open-model-settings"))}</button>` : "";
  return `${ico("alert")}<span>${esc(uiText.text("workflows.link.not-connected-reason", { reason: said(L, ready.reason) }))}${fix}</span>`;
}

/** The popover of one link: its kind, what that kind needs, and whether it can carry content now. */
export function showLink(page: WorkflowsPage, index: number) {
  const { ui, pop, L } = page;
  const flow = ui.workflow!, link = flow.links[index]!;
  const from = label(page, flow.stations[index]!), to = label(page, flow.stations[index + 1]!);
  const ready = readyState(page, link);
  ui.openLink = index; ui.openGap = null;
  pop.dataset.mode = "link"; pop.dataset.link = String(index);
  pop.innerHTML = `<header class="wf-pop__head"><strong>${esc(from + " → " + to)}</strong><span class="wf-muted">${esc(uiText.text("workflows.link.heading"))}</span></header>`
    + `<div class="mw-toggle-group wf-kinds" role="radiogroup" aria-label="${esc(uiText.text("workflows.link.type"))}">`
    + KINDS.map((kind) => `<button type="button" class="mw-toggle${kind === link.kind ? " is-current" : ""}" role="radio" aria-checked="${kind === link.kind}" data-wf-action="kind" data-kind="${kind}" data-link="${index}">${esc(kindName(L, kind))}</button>`).join("")
    + `</div><p class="wf-kind-help" data-wf-kind-help>${esc(kindHelp(L, link.kind))}</p><div class="wf-link-fields" data-wf-link-fields>${linkView(page, link)}</div>`
    + `<p class="wf-readiness" data-ready="${ready.ready}" data-wf-readiness>${readyRow(page, ready)}</p>${backFoot(page, ready)}`;
  markOpen(page);
  placePop(page, pillOf(page, index));
  if (link.kind === "judgment" && !ui.judgments) void checkRules(page, index);
}

export async function checkRules(page: WorkflowsPage, index: number, force?: boolean) {
  const { ui, pop } = page;
  const flow = ui.workflow;
  await loadRules(page, force);
  if (ui.workflow !== flow || pop.dataset.mode !== "link" || Number(pop.dataset.link) !== index) return;
  const fields = pop.querySelector<HTMLElement>("[data-wf-link-fields]");
  const link = ui.workflow!.links[index]!;
  if (fields && link.kind === "judgment") { fields.innerHTML = linkView(page, link); settle(fields); }
  checkReady(page, index);
}

export function switchKind(page: WorkflowsPage, index: number, kind: WorkflowLinkKind, { pointer = false } = {}) {
  const { ui, pop, L } = page;
  const chain = chainOf(page);
  if (chain.links[index]!.kind === kind) return;
  chain.links[index] = { ...chain.links[index]!, kind };
  saveFlow(page, { chain, undoable: true });
  for (const toggle of pop.querySelectorAll<HTMLElement>("[data-wf-action=kind]")) {
    const on = toggle.dataset.kind === kind;
    toggle.classList.toggle("is-current", on); toggle.setAttribute("aria-checked", String(on));
  }
  required(pop, "[data-wf-kind-help]").textContent = kindHelp(L, kind);
  const fields = required(pop, "[data-wf-link-fields]");
  fields.innerHTML = linkView(page, ui.workflow!.links[index]!);
  settle(fields);
  checkReady(page, index);
  fitPop(page);
  if (kind === "judgment" && !ui.judgments) void checkRules(page, index);
  if (pointer) fields.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
}

export function checkReady(page: WorkflowsPage, index: number) {
  const { ui, pop } = page;
  const ready = readyState(page, ui.workflow!.links[index]!);
  const line = pop.querySelector<HTMLElement>("[data-wf-readiness]");
  if (line) { if (line.dataset.ready !== String(ready.ready)) settle(line); line.dataset.ready = String(ready.ready); line.innerHTML = readyRow(page, ready); }
  const back = pop.querySelector<HTMLButtonElement>("[data-wf-return-button]");
  if (back) back.disabled = !ready.ready;
}
