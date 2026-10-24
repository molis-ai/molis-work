import { openGeneric } from "./dialog.js";
import { extractMaterial } from "./material.js";
import { openRecord } from "./notes.js";
import { run, showNote } from "./page.js";
import { command } from "./workspace.js";
import { addDays, civil, clockLabel, dayOffset, esc, parseClock } from "./util.js";
import type { JellyPage, JellyPlan, JellyPlanAction, PlanSource, PlanUi } from "./types.js";

const DURATIONS = [15, 30, 45, 60, 90] as const;
const LOCKS: readonly (readonly [string, string])[] = [["title", "jelly.field.title"], ["notes", "jelly.plan.lock-notes"], ["duration", "jelly.plan.lock-duration"], ["schedule", "jelly.plan.lock-schedule"]];

function planState(page: JellyPage, action: JellyPlanAction): PlanUi {
  const known = page.planUi.get(action.id);
  if (known) return known;
  const schedule = action.schedule;
  const span = schedule && schedule.start_time !== null && schedule.end_time !== null
    ? dayOffset(schedule.start_date, schedule.end_date) * 1440 + schedule.end_time - schedule.start_time : null;
  const duration = action.duration_minutes || (span === null ? 30 : Math.max(15, span));
  const created: PlanUi = { create: true, arrange: Boolean(schedule), date: schedule?.start_date || civil(), time: clockLabel(schedule?.start_time), duration, locks: new Set() };
  page.planUi.set(action.id, created);
  return created;
}

const planField = (page: JellyPage, name: string, id: string): HTMLInputElement => page.$<HTMLInputElement>(`[data-jelly-plan-${name}="${CSS.escape(id)}"]`);

/** Takes what the person typed into the open plan, so repainting it (reorder, remove, refine) keeps their edits. */
function capturePlan(page: JellyPage): void {
  if (!page.currentPlan) return;
  for (const action of page.currentPlan.actions) {
    if (!page.root.querySelector(`[data-jelly-plan-title="${CSS.escape(action.id)}"]`)) continue;
    const ui = planState(page, action);
    action.title = planField(page, "title", action.id).value;
    action.notes = planField(page, "notes", action.id).value;
    ui.create = planField(page, "check", action.id).checked;
    ui.arrange = planField(page, "schedule", action.id).checked;
    ui.date = planField(page, "date", action.id).value;
    ui.time = planField(page, "time", action.id).value;
    ui.duration = Number(planField(page, "minutes", action.id).value);
  }
}

function actionHtml(page: JellyPage, action: JellyPlanAction, index: number): string {
  const { btn, tx } = page;
  const id = esc(action.id);
  const ui = planState(page, action);
  const locks = LOCKS.map(([field, label]) => btn(label, `data-jelly-plan-lock="${field}" data-plan-action="${id}" aria-pressed="${ui.locks.has(field)}"`)).join("");
  return `<div class="jelly-plan-action"><input type="checkbox" class="mw-check" data-jelly-plan-check="${id}" ${ui.create ? "checked" : ""} aria-label="${tx("jelly.plan.create-task")} ${esc(action.title)}"><div>`
    + `<div class="jelly-plan-row-tools"><span class="jelly-muted">${index + 1}</span>${btn("jelly.block.move-up", `data-jelly-plan-up="${id}"`, "chevron-up")}${btn("jelly.plan.refine", `data-jelly-plan-refine="${id}"`, "sparkles")}${btn("jelly.plan.remove", `data-jelly-plan-remove="${id}"`, "x")}</div>`
    + `<input class="mw-input" data-jelly-plan-title="${id}" value="${esc(action.title)}" aria-label="${tx("jelly.plan.task-title")}">`
    + `<label class="jelly-field" style="margin:8px 0">${tx("jelly.plan.task-notes")}<textarea class="mw-textarea" rows="2" data-jelly-plan-notes="${id}">${esc(action.notes || "")}</textarea></label>`
    + `<label class="jelly-check"><input type="checkbox" class="mw-check" data-jelly-plan-schedule="${id}" ${ui.arrange ? "checked" : ""}>${tx("jelly.block.schedule")}</label>`
    + `<div class="jelly-form-grid" style="margin-top:8px"><label class="jelly-field">${tx("jelly.field.start-date")}<input class="mw-input" data-jelly-plan-date="${id}" value="${esc(ui.date)}" placeholder="YYYY-MM-DD"></label><label class="jelly-field">${tx("jelly.field.start-time")}<input class="mw-input" data-jelly-plan-time="${id}" value="${esc(ui.time)}" placeholder="HH:MM"></label></div>`
    + `<label class="jelly-field" style="margin-top:8px">${tx("jelly.plan.duration-minutes")}<input type="number" class="mw-input" min="15" max="720" step="15" data-jelly-plan-minutes="${id}" value="${ui.duration}"></label>`
    + `<div class="jelly-choice-row" style="margin-top:6px">${DURATIONS.map((minutes) => btn(String(minutes), `data-jelly-plan-duration="${minutes}" data-plan-action="${id}"`)).join("")}</div>`
    + `<details class="jelly-plan-locks"><summary>${tx("jelly.plan.keep-fields")}</summary><div class="jelly-choice-row">${locks}</div></details></div></div>`;
}

/** The checked candidates become the plan's actions, each with a validated schedule; the first problem stops the whole apply. */
function selectedActions(page: JellyPage, plan: JellyPlan): string[] {
  const { L } = page;
  const ids: string[] = [];
  for (const action of plan.actions) {
    const ui = planState(page, action);
    if (!ui.create) continue;
    ids.push(action.id);
    action.title = action.title.trim();
    if (!action.title) throw new Error(L("jelly.plan.error-title"));
    if (!ui.arrange) { action.schedule = null; continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ui.date)) throw new Error(L("jelly.plan.error-date"));
    if (ui.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(ui.time)) throw new Error(L("jelly.plan.error-time"));
    if (!Number.isFinite(ui.duration) || ui.duration < 15 || ui.duration > 720) throw new Error(L("jelly.plan.error-duration"));
    const start = parseClock(ui.time);
    const total = start === null ? 0 : start + ui.duration;
    action.schedule = { start_date: ui.date, end_date: start === null ? ui.date : addDays(ui.date, Math.floor(total / 1440)), start_time: start, end_time: start === null ? null : total % 1440 };
    if ((DURATIONS as readonly number[]).includes(ui.duration)) action.duration_minutes = ui.duration as JellyPlanAction["duration_minutes"];
  }
  if (!ids.length) throw new Error(L("jelly.plan.error-none"));
  return ids;
}

export function openPlan(page: JellyPage, plan: JellyPlan, source: PlanSource, preserve = false): void {
  const { btn, tx, L } = page;
  if (!preserve) page.planUi = new Map();
  page.currentPlan = plan;
  page.currentPlanSource = source;
  const questions = plan.clarification_questions?.length
    ? `<div class="jelly-plan-questions"><p class="jelly-muted">${tx("jelly.plan.questions")}</p>${plan.clarification_questions.map((question) => `<p>${esc(question)}</p>`).join("")}</div>` : "";
  const html = `${questions}<p class="jelly-muted">${tx("jelly.plan.help")}</p>`
    + `<div class="jelly-plan-refine"><textarea class="mw-textarea" data-jelly-plan-feedback rows="2" placeholder="${tx("jelly.plan.feedback")}"></textarea>${btn("jelly.plan.refresh", "data-jelly-plan-refresh", "refresh")}</div>`
    + plan.actions.map((action, index) => actionHtml(page, action, index)).join("");
  openGeneric(page, plan.title || "jelly.plan.confirm-title", html, "jelly.plan.confirm", async () => {
    capturePlan(page);
    const ids = selectedActions(page, plan);
    await command(page, { type: "plan.apply", plan, note_id: source.kind === "note" ? source.id : undefined, selected_action_ids: ids });
    if (page.selected?.kind === "note" && page.selected.id === source.id) openRecord(page, "note", source.id);
    page.currentPlan = null;
    showNote(page, L("jelly.plan.applied"));
  });
}

/** A regenerated candidate keeps the fields the person locked on the one it replaces. */
function carryLocks(page: JellyPage, from: JellyPlanAction, fromUi: PlanUi, to: JellyPlanAction): void {
  const toUi = planState(page, to);
  for (const field of ["title", "notes"] as const) if (fromUi.locks.has(field)) to[field] = from[field];
  if (fromUi.locks.has("duration")) toUi.duration = fromUi.duration;
  if (fromUi.locks.has("schedule")) Object.assign(toUi, { arrange: fromUi.arrange, date: fromUi.date, time: fromUi.time });
  toUi.locks = new Set(fromUi.locks);
}

function mergeRegenerated(page: JellyPage, original: JellyPlan, regenerated: JellyPlan, target: JellyPlanAction | null | undefined): void {
  if (target) {
    const index = original.actions.findIndex((action) => action.id === target.id);
    const first = regenerated.actions[0];
    if (first) carryLocks(page, target, planState(page, target), first);
    original.actions.splice(index, 1, ...regenerated.actions);
    return;
  }
  const old = original.actions;
  original.actions = regenerated.actions.map((action, index) => {
    const prior = old[index];
    if (!prior) return action;
    const priorUi = planState(page, prior);
    carryLocks(page, prior, priorUi, action);
    planState(page, action).create = priorUi.create;
    return action;
  });
  for (let index = regenerated.actions.length; index < old.length; index++) {
    const kept = old[index];
    if (kept && planState(page, kept).locks.size) original.actions.push(kept);
  }
}

async function refreshPlan(page: JellyPage, targetId?: string): Promise<void> {
  const original = page.currentPlan;
  const source = page.currentPlanSource;
  if (!original || !source) return;
  capturePlan(page);
  const feedback = page.root.querySelector<HTMLTextAreaElement>("[data-jelly-plan-feedback]")?.value || "";
  const target = targetId ? original.actions.find((action) => action.id === targetId) : null;
  const instructions = `${feedback}\n${target ? `只重新拆解下面这一个候选，其他候选不在本次生成范围：\n${target.title}\n${target.notes}` : `请重新审视原文并生成任务。当前候选供参考：\n${original.actions.map((action) => `${action.title} — ${action.notes}`).join("\n")}`}`;
  const now = new Date();
  let result: { plan: JellyPlan } | null;
  try {
    result = await extractMaterial(page, { kind: "decompose", source_type: original.source_type, source_id: original.source_id, text: original.source_type === "text" ? original.source_text : undefined,
      selection: original.selection, instructions, today: civil(), start_time: now.getHours() * 60 + now.getMinutes() });
  } catch (error) { openPlan(page, original, source, true); throw error; }
  if (!result) { openPlan(page, original, source, true); return; }
  mergeRegenerated(page, original, result.plan, target);
  original.clarification_questions = result.plan.clarification_questions || [];
  openPlan(page, original, source, true);
}

const swap = (items: JellyPlanAction[], index: number): void => { [items[index - 1], items[index]] = [items[index] as JellyPlanAction, items[index - 1] as JellyPlanAction]; };

export function handlePlanClick(page: JellyPage, target: HTMLElement): void {
  const plan = page.currentPlan;
  const source = page.currentPlanSource;
  const data = target.dataset;
  if (target.hasAttribute("data-jelly-plan-lock") && plan) {
    capturePlan(page);
    const action = plan.actions.find((entry) => entry.id === data.planAction);
    if (!action) return;
    const ui = planState(page, action);
    const field = data.jellyPlanLock ?? "";
    if (ui.locks.has(field)) ui.locks.delete(field); else ui.locks.add(field);
    target.setAttribute("aria-pressed", String(ui.locks.has(field)));
  } else if (target.hasAttribute("data-jelly-plan-duration")) {
    planField(page, "minutes", data.planAction ?? "").value = data.jellyPlanDuration ?? "";
  } else if (target.hasAttribute("data-jelly-plan-refresh")) void run(page, () => refreshPlan(page));
  else if (target.hasAttribute("data-jelly-plan-refine")) void run(page, () => refreshPlan(page, data.jellyPlanRefine));
  else if (target.hasAttribute("data-jelly-plan-up") && plan && source) {
    capturePlan(page);
    const index = plan.actions.findIndex((entry) => entry.id === data.jellyPlanUp);
    if (index > 0) { swap(plan.actions, index); openPlan(page, plan, source, true); }
  } else if (target.hasAttribute("data-jelly-plan-remove") && plan && source) {
    capturePlan(page);
    plan.actions = plan.actions.filter((entry) => entry.id !== data.jellyPlanRemove);
    openPlan(page, plan, source, true);
  }
}
