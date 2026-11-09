import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { WorkflowActionStep } from "../model.js";
import { ruleKey } from "./chain.js";
import { escapeHtml as esc } from "@molis-ai/molis-work-plugin-sdk/ui";
import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { copy, ico, said, settle, uid } from "./dom.js";
import type { WorkflowsPage } from "./page.js";
import { fitPop, markOpen, placePop } from "./popover.js";
import { chainOf, saveFlow } from "./save.js";
import { insertStn } from "./chain.js";
import { toast } from "./toast.js";
import type { ActionChoice, StepDraft, Translate, PayloadFieldName } from "./types.js";

const PAYLOAD_FIELDS: readonly PayloadFieldName[] = ["title", "body", "source", "url", "date"];
const payloadField = (_L: Translate, key: PayloadFieldName) =>
  key === "title" ? uiText.text("workflows.field.title") : key === "body" ? uiText.text("workflows.field.body") : key === "source" ? uiText.text("workflows.field.source") : key === "url" ? uiText.text("workflows.field.link") : uiText.text("workflows.field.date");

/** The actions a step may run, read once. */
export async function loadActions(page: WorkflowsPage): Promise<ActionChoice[]> {
  const { ui } = page;
  if (ui.actionSteps) return ui.actionSteps;
  try { ui.actionSteps = (await page.api<{ actions: ActionChoice[] }>("/steps/actions")).actions; } catch (error) { ui.actionSteps = []; toast(page, messageOf(error), "error"); }
  return ui.actionSteps;
}

export const stepOf = (page: WorkflowsPage, draft: StepDraft) => (page.ui.actionSteps || []).find((row) => ruleKey(row.ref) === ruleKey(draft.ref));

/** Why the step cannot be saved yet, or an empty string. */
export function stepError(page: WorkflowsPage, draft: StepDraft, choice: ActionChoice | undefined) {
  const { L } = page;
  if (!draft.ref) return uiText.text("workflows.step.no-action");
  if (!choice) return uiText.text("workflows.step.action-gone");
  if (!choice.available) return said(L, choice.reason || "workflows.step.action-unavailable");
  for (const field of choice.fields) if (field.required && !draft.mapping[field.name]) return uiText.text("workflows.step.field-empty", { field: field.title || field.name });
  for (const [name, source] of Object.entries(draft.mapping)) {
    const field = choice.fields.find((item) => item.name === name);
    if (!field) return uiText.text("workflows.step.field-dropped", { field: name });
    if ("value" in source && (source.value === "" || source.value === undefined || (typeof source.value === "number" && Number.isNaN(source.value)))) return uiText.text("workflows.step.fixed-empty", { field: field.title || name });
  }
  return "";
}

function formHtml(page: WorkflowsPage, draft: StepDraft, choice: ActionChoice | undefined) {
  const { L } = page;
  if (!choice) return "";
  if (!choice.fields.length) return `<p class="wf-hint">${esc(uiText.text("workflows.step.no-input"))}</p>`;
  return `<div class="wf-map" role="group" aria-label="${esc(uiText.text("workflows.step.fields-heading"))}">` + choice.fields.map((field) => {
    const source = draft.mapping[field.name];
    const current = !source ? "" : "from" in source ? "from:" + source.from : "value";
    const named = field.title || field.name;
    const mappable = field.type === "string" && !field.enum;
    const options = (field.required ? (current === "" ? `<option value="" selected disabled>${esc(uiText.text("workflows.step.pick-source"))}</option>` : "") : `<option value=""${current === "" ? " selected" : ""}>${esc(uiText.text("workflows.step.leave-empty"))}</option>`)
      + (mappable ? PAYLOAD_FIELDS.map((key) => `<option value="from:${key}"${current === "from:" + key ? " selected" : ""}>${esc(uiText.text("workflows.step.from-handed", { field: payloadField(L, key) }))}</option>`).join("") : "")
      + `<option value="value"${current === "value" ? " selected" : ""}>${esc(uiText.text("workflows.step.fixed-value"))}</option>`;
    let valueEl = "";
    if (source && "value" in source) {
      const value = source.value;
      const aria = ` aria-label="${esc(uiText.text("workflows.step.fixed-value-for", { field: named }))}"`;
      valueEl = field.enum ? `<select class="mw-select" data-wf-map-value="${esc(field.name)}"${aria}>` + field.enum.map((option) => `<option value="${esc(String(option))}"${option === value ? " selected" : ""}>${esc(String(option))}</option>`).join("") + "</select>"
        : field.type === "boolean" ? `<select class="mw-select" data-wf-map-value="${esc(field.name)}"${aria}><option value="true"${value === true ? " selected" : ""}>${esc(uiText.text("workflows.step.yes"))}</option><option value="false"${value === false ? " selected" : ""}>${esc(uiText.text("workflows.step.no"))}</option></select>`
        : `<input class="mw-input" data-wf-map-value="${esc(field.name)}"${aria}${field.type === "string" ? "" : ' type="number" inputmode="decimal"' + (field.type === "integer" ? ' step="1"' : "")} value="${esc(value === undefined ? "" : String(value))}">`;
    }
    return `<div class="wf-map__row"><span class="wf-map__name">${esc(named)}${field.required ? `<i aria-label="${esc(uiText.text("workflows.step.required"))}">*</i>` : ""}`
      + (field.title && field.title !== field.name ? `<small>${esc(field.name)}</small>` : "") + "</span>"
      + `<select class="mw-select" data-wf-map-source="${esc(field.name)}" aria-label="${esc(uiText.text("workflows.step.comes-from", { field: named }))}">${options}</select>${valueEl}</div>`;
  }).join("") + "</div>";
}

export function readyView(page: WorkflowsPage, problem: string) {
  if (problem) return `${ico("alert")}<span>${esc(problem)}</span>`;
  return `${ico("check")}<span>${Object.keys(page.ui.stepDraft!.mapping).length ? esc(uiText.text("workflows.step.all-filled")) : esc(uiText.text("workflows.step.no-required"))}</span>`;
}

function editHtml(page: WorkflowsPage) {
  const { ui, L } = page;
  const draft = ui.stepDraft!, rows = [...(ui.actionSteps || [])];
  if (draft.ref && ui.actionSteps && !stepOf(page, draft)) rows.unshift({ ref: draft.ref, title: draft.title, group: draft.group || "", fields: [], available: false, reason: "workflows.judgment.gone" });
  const choice = rows.find((row) => ruleKey(row.ref) === ruleKey(draft.ref));
  const query = (ui.stepQuery || "").trim().toLowerCase();
  const visible = query ? rows.filter((row) => row === choice || [row.title, row.group, row.description || ""].join(" ").toLowerCase().includes(query)) : rows;
  const groups = [...new Set(visible.map((row) => row.group))];
  const search = rows.length > 12 ? `<label class="mw-field"><span class="mw-field__label">${esc(uiText.text("workflows.step.find"))}</span><input class="mw-input" type="search" data-wf-step-search value="${esc(ui.stepQuery || "")}" placeholder="${esc(uiText.text("workflows.step.filter-hint"))}" aria-label="${esc(uiText.text("workflows.step.filter-hint"))}"></label>` : "";
  const picker = !ui.actionSteps ? '<div class="wf-judgment" aria-busy="true"><span class="mw-skeleton" style="width:70%"></span><span class="mw-skeleton wf-skeleton-small"></span></div>'
    : rows.length ? search + (visible.length ? `<label class="mw-field"><span class="mw-field__label">${esc(uiText.text("workflows.step.which"))}${query ? `<small>${esc(uiText.text("workflows.step.match-count", { count: String(visible.length) }))}</small>` : ""}</span><select class="mw-select" data-wf-step-action>`
      + (draft.ref ? "" : `<option value="" selected disabled>${esc(uiText.text("workflows.step.choose"))}</option>`)
      + groups.map((group) => `<optgroup label="${esc(group)}">` + visible.filter((row) => row.group === group).map((row) => `<option value="${esc(ruleKey(row.ref))}"${row === choice ? " selected" : ""}>`
        + esc(row.title + (row.available ? "" : " · " + said(L, row.reason || "workflows.judgment.unavailable"))) + "</option>").join("") + "</optgroup>").join("") + "</select></label>"
      : `<p class="wf-hint" role="status">${esc(uiText.text("workflows.step.no-match"))}</p>`)
      + (choice?.description ? `<p class="wf-hint">${esc(choice.description)}</p>` : "")
      : `<p class="wf-hint">${esc(uiText.text("workflows.step.none-available"))}</p>`;
  const problem = ui.actionSteps ? stepError(page, draft, choice) : "";
  const editing = ui.stepIndex !== null;
  return `<header class="wf-pop__head"><strong>${editing ? esc(uiText.text("workflows.step.running-heading")) : esc(uiText.text("workflows.palette.add-action"))}</strong><span class="wf-muted">${esc(uiText.text("workflows.step.running-hint"))}</span></header>`
    + `<div class="wf-link-fields">${picker}<div data-wf-step-fields>${formHtml(page, draft, choice)}</div>`
    + (ui.actionSteps && rows.length ? `<p class="wf-readiness" data-ready="${!problem}" data-wf-step-ready>${readyView(page, problem)}</p>` : "") + "</div>"
    + `<footer class="wf-pop__foot"><button class="mw-btn mw-btn--primary" type="button" data-wf-action="step-save"${problem || !ui.actionSteps ? " disabled" : ""}>${ico(editing ? "check" : "plus")}<span>${editing ? esc(uiText.text("workflows.step.save")) : esc(uiText.text("workflows.step.append"))}</span></button></footer>`;
}

export function drawStep(page: WorkflowsPage) {
  page.pop.innerHTML = editHtml(page);
  fitPop(page);
}

/** The popover of an action step: which action runs and where each of its inputs comes from. */
export async function openStep(page: WorkflowsPage, index: number | null, anchorOf: () => Element | null) {
  const { ui, pop } = page;
  const flow = ui.workflow!, station = index === null ? null : flow.stations[index];
  ui.stepIndex = index;
  ui.stepDraft = station?.action ? copy(station.action) as StepDraft : { ref: null, title: "", group: "", mapping: {} };
  ui.stepQuery = "";
  ui.openLink = null; ui.openGap = null;
  pop.dataset.mode = "step"; delete pop.dataset.link;
  drawStep(page);
  markOpen(page);
  placePop(page, anchorOf);
  await loadActions(page);
  if (ui.workflow !== flow || pop.dataset.mode !== "step" || !pop.matches(":popover-open")) return;
  drawStep(page); settle(pop.querySelector(".wf-link-fields"));
  pop.querySelector<HTMLElement>("[data-wf-step-action]")?.focus({ preventScroll: true });
}

export function saveStep(page: WorkflowsPage) {
  const { ui, pop } = page;
  const draft = ui.stepDraft!, chain = chainOf(page);
  const ref = draft.ref;
  if (!ref || stepError(page, draft, stepOf(page, draft))) return;
  pop.hidePopover();
  // stepError has just refused an empty fixed value, so the mapping is whole.
  const action = { ...draft, ref } as WorkflowActionStep;
  if (ui.stepIndex === null) {
    const id = uid(); page.focusNext = id;
    const inserted = insertStn(chain, chain.stations.length, "action", id);
    inserted.stations[inserted.stations.length - 1] = { station_id: id, plugin: "action", action };
    saveFlow(page, { chain: inserted, undoable: true, announce: uiText.text("workflows.toast.action-added", { action: draft.title }) });
    return;
  }
  const { availability, ...kept } = chain.stations[ui.stepIndex]!;
  void availability;
  chain.stations[ui.stepIndex] = { ...kept, action };
  saveFlow(page, { chain, undoable: true });
}

/** Takes the fixed value the person typed or picked for an input of the step. */
export function setMap(page: WorkflowsPage, fieldEl: HTMLInputElement | HTMLSelectElement) {
  const { ui } = page;
  const draft = ui.stepDraft!, name = fieldEl.dataset.wfMapValue!;
  const field = stepOf(page, draft)?.fields.find((item) => item.name === name);
  const raw = fieldEl.value;
  const value = field?.type === "boolean" ? raw === "true" : field?.type === "number" || field?.type === "integer" ? (raw.trim() === "" ? "" : Number(raw))
    : field?.enum ? field.enum.find((option) => String(option) === raw) : raw;
  ui.stepDraft = { ...draft, mapping: { ...draft.mapping, [name]: { value } } };
}

export function checkStep(page: WorkflowsPage) {
  const { ui, pop } = page;
  const draft = ui.stepDraft!;
  const problem = stepError(page, draft, stepOf(page, draft));
  const line = pop.querySelector<HTMLElement>("[data-wf-step-ready]");
  if (line) { line.dataset.ready = String(!problem); line.innerHTML = readyView(page, problem); }
  const save = pop.querySelector<HTMLButtonElement>("[data-wf-action=step-save]");
  if (save) save.disabled = Boolean(problem);
}
