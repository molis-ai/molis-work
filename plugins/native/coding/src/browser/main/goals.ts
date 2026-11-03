import { codingGoalVersionLabel } from "../../goal-versions.js";
import { el, errorMessage } from "../dom.js";
import type { Page } from "./page.js";
import { api, sessionPath, status } from "./request.js";
import type { GoalChoice, GoalSummary } from "./shapes.js";
import { onShow } from "./board.js";
import { renderArtifacts } from "./artifacts.js";

type Choice = NonNullable<GoalChoice>;

/** The goal's fields the preview shows, labelled; an empty one is named at the end instead. */
function goalSections(page: Page, goal: Choice["snapshot"]["goal"]): [string, string][] {
  const { L } = page;
  return [
    [L("coding.goal.why"), goal.why], [L("coding.goal.logic"), goal.business_logic], [L("coding.goal.scope"), goal.in_scope.join("\n")],
    [L("coding.goal.out-of-scope"), goal.out_of_scope.join("\n")], [L("coding.goal.constraints"), goal.constraints.join("\n")],
    [L("coding.goal.inputs"), goal.required_inputs.join("\n")], [L("coding.goal.outputs"), goal.promised_outputs.join("\n")],
  ];
}

/** The goal version a session's next round is fixed to, as the dialog previews it. */
export function renderGoalPreview(page: Page) {
  const { L, q } = page, { s } = page;
  const region = q("[data-coding-goal-preview]");
  region.replaceChildren();
  const choice = s.goalChoice;
  if (!choice) {
    region.textContent = L("coding.goal.none-next");
    return;
  }
  const goal = choice.snapshot.goal;
  region.append(el("h3", goal.title), el("p", choice.snapshot.state.agreement.outcome || goal.outcome),
    el("p", codingGoalVersionLabel({ agreement_version: choice.snapshot.state.agreement.version }, L)));
  const sections = goalSections(page, goal);
  for (const [title, value] of sections.filter(item => item[1])) {
    const content = el("p", value);
    content.style.whiteSpace = "pre-wrap";
    region.append(el("strong", title), content);
  }
  const requirements = choice.snapshot.state.requirements;
  if (requirements.length) {
    const list = el("ul");
    for (const item of requirements) list.append(el("li", item.human_decision_required ? L("coding.goal.needs-person", { statement: item.statement }) : item.statement));
    region.append(el("strong", L("coding.goal.requirements")), list);
  }
  const missing = sections.filter(item => !item[1]).map(item => item[0]);
  if (missing.length) region.append(el("p", L("coding.goal.missing-fields", { fields: missing.join(L("coding.list.joiner")) })));
  const details = el("details");
  details.append(el("summary", L("coding.goal.fixed-context", { cursor: choice.snapshot.state.goal_event_cursor })), el("pre", choice.material.text));
  region.append(details);
}

/** One goal of the picker's list. */
function goalRow(page: Page, row: GoalSummary, selected: boolean): HTMLElement {
  const { L } = page;
  const button = el("button", "", "mw-dir-row mw-dir-row--compact directory-list-row");
  button.type = "button";
  button.dataset.codingGoalId = row.goal_id;
  button.title = row.title;
  button.classList.toggle("is-selected", selected);
  button.setAttribute("aria-pressed", String(selected));
  const mark = el("span", "", "mw-dir-row__icon");
  mark.innerHTML = '<svg aria-hidden="true"><use href="#icon-target"></use></svg>';
  const copy = el("span", "", "mw-dir-row__copy"), headline = el("span", "", "mw-dir-row__headline");
  headline.append(el("strong", row.title));
  if (row.work_status === "completed" || row.work_status === "cancelled") {
    headline.append(el("span", row.work_status === "completed" ? L("coding.goal.completed") : L("coding.state.cancelled"), "mw-dir-row__status"));
  }
  copy.append(headline);
  button.append(mark, copy);
  return button;
}

export function renderGoalRows(page: Page) {
  const { L, q } = page, { s } = page;
  const list = q("[data-coding-goal-list]"), search = q<HTMLInputElement>("[data-coding-goal-search]").value.trim().toLowerCase();
  const selectedId = s.goalChoice?.snapshot?.goal?.goal_id || "";
  list.replaceChildren();
  for (const row of s.goalRows.filter(item => item.title.toLowerCase().includes(search))) list.append(goalRow(page, row, row.goal_id === selectedId));
  if (!list.children.length) list.textContent = s.goalRows.length ? L("coding.goal.no-match") : L("coding.goal.none-yet");
  q("[data-coding-goal-more]").hidden = !s.goalCursor;
}

export async function loadGoals(page: Page, ticket: number) {
  const { s } = page;
  const data = await api<{ goals: GoalSummary[]; next_cursor: string | null }>(page, "/goals" + (s.goalCursor ? "?after_cursor=" + encodeURIComponent(s.goalCursor) : ""));
  if (ticket !== s.goalTicket) return;
  const known = new Set(s.goalRows.map(item => item.goal_id));
  s.goalRows.push(...data.goals.filter(item => !known.has(item.goal_id)));
  s.goalCursor = data.next_cursor;
  renderGoalRows(page);
}

/** Opens the goal dialog: the session's saved goal first, then the list to choose another from. */
export async function openGoals(page: Page) {
  const { L, lifetime, q } = page, { s } = page;
  if (!s.current) {
    status(page, L("coding.session.choose-first"));
    return;
  }
  const id = s.current, ticket = ++s.goalTicket;
  s.goalReading++;
  s.goalChoice = null;
  s.goalRows = [];
  s.goalCursor = null;
  q<HTMLDialogElement>("[data-coding-goal-dialog]").showModal();
  q<HTMLButtonElement>("[data-coding-goal-save]").disabled = true;
  q("[data-coding-goal-error]").textContent = "";
  q<HTMLInputElement>("[data-coding-goal-search]").value = "";
  q("[data-coding-goal-list]").textContent = L("coding.goal.loading");
  q("[data-coding-goal-preview]").textContent = L("coding.goal.loading-version");
  try {
    const saved = await api<{ selected: GoalChoice | null; goal_id?: string; error?: string }>(page, sessionPath(id) + "/goal");
    if (ticket !== s.goalTicket || s.current !== id) return;
    s.goalChoice = saved.selected;
    renderGoalPreview(page);
    if (saved.error || saved.goal_id && !saved.selected) q("[data-coding-goal-error]").textContent = saved.error || L("coding.goal.not-fixed");
    q<HTMLButtonElement>("[data-coding-goal-save]").disabled = Boolean(saved.goal_id && !saved.selected);
    await loadGoals(page, ticket);
  } catch (error) {
    if (!lifetime.alive) return;
    if (ticket === s.goalTicket) q("[data-coding-goal-error]").textContent = errorMessage(error);
  }
}

export function returnFromChange(page: Page) {
  const { host } = page, { s } = page;
  const fromArtifact = s.changeItem;
  s.changeItem = "";
  renderArtifacts(page);
  if (fromArtifact) host.openItem("coding", s.current, s.state.sessions.find(item => item.session_id === s.current)?.title);
}

/** The Goal face: the open session's Goal for the next round, with the way to change it and the way to it. */
export function renderGoalFace(page: Page) {
  const { L, directory } = page, { s } = page;
  const box = directory.querySelector<HTMLElement>("[data-coding-goal-face-current]"), open = directory.querySelector<HTMLButtonElement>("[data-coding-goal-face-open]");
  const visit = directory.querySelector<HTMLElement>("[data-coding-goal-face-visit]");
  if (!box || !open || !visit) return;
  // The session list may still be on its way when the open session has already been read; the read's own record serves.
  const session = s.current && onShow(page) ? s.state.sessions.find(item => item.session_id === s.current) || (s.lastData?.session?.session_id === s.current ? s.lastData.session : null) : null;
  box.replaceChildren();
  const line = (tag: "strong" | "span", text: string) => box.append(el(tag, text));
  const label = open.querySelector("[data-slot=button-label]");
  if (!session) {
    line("span", L("coding.goal-face.open-session-first"));
    open.disabled = true;
    visit.hidden = true;
    return;
  }
  open.disabled = false;
  if (session.goal_id) {
    line("strong", session.goal_title || L("coding.goal-face.unavailable"));
    line("span", L("coding.goal-face.next", { session: session.title }));
    if (label) label.textContent = L("coding.goal-face.change");
    visit.hidden = false;
    visit.dataset.goalId = session.goal_id;
    visit.dataset.goalTitle = session.goal_title || "";
  } else {
    line("strong", L("coding.goal-face.none"));
    line("span", L("coding.goal-face.session", { session: session.title }));
    if (label) label.textContent = L("coding.goal.link");
    visit.hidden = true;
  }
}
