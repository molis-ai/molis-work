import { parseCodingPlanAnswer, type CodingPlanContent } from "../plan-content.js";
import { el, errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

/** A session's plan, as `GET /sessions/<id>/plan` answers it. */
export interface PlanDraft {
  readonly revision: number;
  readonly content: CodingPlanContent;
  readonly source: { readonly run_id: string; readonly task: string; readonly workspace_path: string };
  readonly confirmed: { readonly artifact_id: string; readonly version: number } | null;
}

/** A round, as far as the plan reads it. */
export interface PlanRun {
  readonly ref: { readonly run_id: string };
  readonly phase: string;
  readonly frozen: { readonly role_id: string; readonly text_materials: readonly { readonly source_artifact_id: string; readonly source_version: number }[] };
  readonly turns?: readonly { readonly kind: string; readonly text: string }[];
}

export interface PlanPorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "api" | "current" | "status"> {
  /** Starts a round that carries out the plan's revision. */
  readonly execute: (revision: number) => Promise<unknown>;
}

export interface PlansClient {
  /** Opens the editor on the plan with the reason for reworking a step added. */
  prepareStepRework(reason: string): void;
  /** Shows a revision as it was fixed. */
  openFixed(revision: number): Promise<void>;
  update(id: string, value: PlanDraft | null, runs: readonly PlanRun[]): void;
  /** Draws a planner's answer as the plan it proposes; false when the turn is not one. */
  renderTurn(node: HTMLElement, run: PlanRun, turn: { readonly kind: string; readonly text: string }): boolean;
}

type PlanField<Kind extends "input" | "textarea"> = { node: HTMLLabelElement; input: HTMLElementTagNameMap[Kind] };
type StepFields = { title: HTMLInputElement; acceptance: HTMLTextAreaElement; after: HTMLInputElement };

/** The plan being edited: its inputs, and what it was opened from. */
interface Editor {
  readonly id: string;
  readonly revision: number;
  readonly base: string;
  readonly title: HTMLInputElement;
  readonly blockers: HTMLTextAreaElement;
  readonly reason: HTMLTextAreaElement;
  steps: StepFields[];
}

interface Plans {
  readonly ports: PlanPorts;
  readonly region: HTMLElement;
  readonly dialog: HTMLDialogElement;
  plan: PlanDraft | null;
  runs: readonly PlanRun[];
  owner: string;
  busy: boolean;
  editor: Editor | null;
  renderKey: string;
}

type EditedStep = { title: string; acceptance: string; after?: number[] };

const ENDED = ["completed", "failed", "stopped", "cancelled"];

const button = (state: Plans, text: string, action: () => unknown, disabled = false) => {
  const node = el("button", text, "mw-btn");
  node.type = "button";
  node.disabled = disabled;
  state.ports.lifetime.listen(node, "click", () => void action());
  return node;
};

function field<Kind extends "input" | "textarea">(label: string, value: string, tag: Kind): PlanField<Kind> {
  const node = el("label", "", "mw-field"), input = el(tag, "", "mw-input");
  node.append(el("span", label), input);
  input.value = value;
  if (input instanceof HTMLTextAreaElement) input.rows = 3;
  return { node, input };
}

const path = (state: Plans) => "/sessions/" + encodeURIComponent(state.owner) + "/plan";
const storedKey = (id: string) => "molis-coding-plan-editor:" + location.pathname + ":" + id;

/** A plan's title, steps with their acceptance, and what it waits on. */
function describe(L: PlanPorts["translate"], parent: HTMLElement, content: CodingPlanContent) {
  parent.append(el("h3", content.title));
  const list = el("ol");
  for (const [index, step] of content.steps.entries()) {
    const item = el("li");
    item.append(el("p", step.title), el("p", L("coding.board.acceptance", { acceptance: step.acceptance })));
    if (index && step.after) item.append(el("p", step.after.length ? L("coding.plan.after", { steps: step.after.join(L("coding.list.joiner")) }) : L("coding.plan.after-none-long"), "coding-plan-after"));
    list.append(item);
  }
  parent.append(list);
  if (content.blockers) parent.append(el("p", L("coding.plan.blockers", { blockers: content.blockers })));
  if (content.change_reason) parent.append(el("p", L("coding.plan.change-reason", { reason: content.change_reason })));
}

/** The plan as the editor compares it with what it was opened from. */
const shape = (content: Partial<CodingPlanContent> | undefined) => JSON.stringify({ title: content?.title || "", steps: (content?.steps || []).map(step => ({ title: step.title || "", acceptance: step.acceptance || "", ...(step.after ? { after: step.after } : {}) })), blockers: content?.blockers || "", change_reason: content?.change_reason || "" });

// A step's waits are typed as earlier step numbers: empty keeps the default (the step before), 无 means none.
const afterOf = (text: string): number[] | undefined => {
  const value = text.trim();
  if (!value) return undefined;
  if (/^(无|没有|不等|none|0)$/i.test(value)) return [];
  return value.split(/[\s,，、]+/).filter(Boolean).map(Number);
};
const afterText = (L: PlanPorts["translate"], after: readonly number[] | undefined) => after === undefined ? "" : after.length ? after.join(L("coding.list.joiner")) : L("coding.plan.none");

function values(editor: Editor): CodingPlanContent {
  const steps: EditedStep[] = editor.steps.map(step => {
    const after = afterOf(step.after.value);
    return { title: step.title.value, acceptance: step.acceptance.value, ...(after === undefined ? {} : { after }) };
  });
  return { title: editor.title.value, steps, blockers: editor.blockers.value, change_reason: editor.reason.value };
}

// Only real edits are kept for later: an editor opened and left as it was must not outlive the revision it showed,
// or a newer revision would open under a stale copy presented as the person's own unsaved changes.
function remember(state: Plans) {
  const { editor } = state;
  if (!editor) return;
  try {
    const now = values(editor);
    if (shape(now) === editor.base) sessionStorage.removeItem(storedKey(editor.id));
    else sessionStorage.setItem(storedKey(editor.id), JSON.stringify({ revision: editor.revision, content: now }));
  } catch { /* storage closed: the edits stay in the dialog */ }
}

// Reordering or removing steps renumbers them; every typed wait follows its step, and a wait on a removed step is dropped.
function renumber(state: Plans, editor: Editor, map: (n: number) => number | null) {
  for (const step of editor.steps) {
    const after = afterOf(step.after.value);
    if (!after?.length) continue;
    const next = after.map(map).filter((n): n is number => n !== null);
    step.after.value = next.length ? afterText(state.ports.translate, next) : "";
  }
}

/** What an editor left in the window for this session, when it holds a plan. */
function savedEditor(id: string): { revision: number; content: CodingPlanContent } | null {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storedKey(id)) || "null");
    if (saved && typeof saved === "object" && "revision" in saved && "content" in saved && typeof saved.revision === "number" && saved.content && typeof saved.content === "object" && "steps" in saved.content) {
      return { revision: saved.revision, content: saved.content as CodingPlanContent };
    }
  } catch { /* nothing kept, or storage closed */ }
  return null;
}

/** One step of the editor: its title, acceptance and waits, and the buttons that move or remove it. */
function addStep(state: Plans, editor: Editor, steps: HTMLElement, value: EditedStep) {
  const { translate: L } = state.ports;
  const row = el("section", "", "coding-material"), title = field(L("coding.plan.step"), value.title, "input"), acceptance = field(L("coding.board.insert-acceptance"), value.acceptance, "textarea");
  const after = field(L("coding.plan.after-field"), afterText(L, value.after), "input");
  after.input.inputMode = "numeric";
  after.node.dataset.codingPlanAfter = "";
  const entry: StepFields = { title: title.input, acceptance: acceptance.input, after: after.input };
  editor.steps.push(entry);
  row.append(title.node, acceptance.node, after.node);
  row.append(button(state, L("coding.plan.move-up"), () => {
    const index = editor.steps.indexOf(entry), above = editor.steps[index - 1];
    if (index > 0 && above) {
      editor.steps[index - 1] = entry;
      editor.steps[index] = above;
      steps.insertBefore(row, row.previousElementSibling);
      renumber(state, editor, n => n === index ? index + 1 : n === index + 1 ? index : n);
      remember(state);
    }
  }));
  row.append(button(state, L("coding.plan.remove-step"), () => {
    const gone = editor.steps.indexOf(entry) + 1;
    editor.steps = editor.steps.filter(one => one !== entry);
    row.remove();
    renumber(state, editor, n => n === gone ? null : n > gone ? n - 1 : n);
    remember(state);
  }));
  steps.append(row);
}

/** Opens the editor on the session's plan, over what was typed and not saved when that is for the same revision. */
function edit(state: Plans) {
  const { ports, plan, dialog } = state, { translate: L, q } = ports;
  if (!plan) return;
  const content = structuredClone(plan.content), saved = savedEditor(state.owner);
  const heading = dialog.querySelector("h2");
  if (heading) heading.textContent = L("coding.plan.title");
  dialog.setAttribute("aria-label", L("coding.plan.title"));
  q("[data-coding-plan-save]").hidden = false;
  q("[data-coding-plan-help]").textContent = L("coding.plan.edit-help");
  const draft = saved?.content ?? content;
  const title = field(L("coding.plan.title-field"), draft.title, "input"), blockers = field(L("coding.plan.blockers-field"), draft.blockers, "textarea"), reason = field(L("coding.plan.reason-field"), draft.change_reason, "textarea");
  const editor: Editor = { id: state.owner, revision: plan.revision, base: shape(plan.content), title: title.input, blockers: blockers.input, reason: reason.input, steps: [] };
  state.editor = editor;
  const body = q("[data-coding-plan-fields]");
  body.replaceChildren();
  if (saved && saved.revision !== plan.revision) {
    const comparison = el("details");
    comparison.append(el("summary", L("coding.plan.saved-version", { revision: plan.revision })));
    describe(L, comparison, content);
    body.append(comparison, button(state, L("coding.plan.discard", { revision: plan.revision }), () => {
      try { sessionStorage.removeItem(storedKey(state.owner)); } catch { /* storage closed: nothing was kept */ }
      edit(state);
    }));
  }
  body.append(title.node);
  const steps = el("div");
  body.append(steps);
  for (const step of draft.steps) addStep(state, editor, steps, step);
  body.append(button(state, L("coding.plan.add-step"), () => {
    if (editor.steps.length < 20) {
      addStep(state, editor, steps, { title: "", acceptance: "" });
      remember(state);
    } else {
      q("[data-coding-plan-error]").textContent = L("coding.plan.max-steps");
    }
  }));
  body.append(blockers.node, reason.node);
  q("[data-coding-plan-error]").textContent = saved && saved.revision !== plan.revision ? L("coding.plan.newer") : "";
  if (!dialog.open) dialog.showModal();
}

/** Shows a revision as it was fixed, read-only. */
async function fixed(state: Plans, revision: number) {
  const { ports, dialog } = state, { translate: L, q, api, current } = ports;
  const id = state.owner, data = await api<{ plan: PlanDraft }>(path(state) + "?revision=" + revision);
  if (id !== current()) return;
  state.editor = null;
  const heading = dialog.querySelector("h2");
  if (heading) heading.textContent = L("coding.plan.fixed-title", { revision });
  q("[data-coding-plan-save]").hidden = true;
  dialog.setAttribute("aria-label", L("coding.plan.fixed"));
  q("[data-coding-plan-help]").textContent = L("coding.plan.fixed-help");
  const body = q("[data-coding-plan-fields]");
  body.replaceChildren();
  describe(L, body, data.plan.content);
  q("[data-coding-plan-error]").textContent = L("coding.plan.fixed-note");
  dialog.showModal();
}

/** Runs one request of the panel with the buttons off, then draws it again. */
async function action(state: Plans, job: (id: string) => Promise<unknown>) {
  const { lifetime, current, status } = state.ports;
  if (state.busy) return;
  const id = state.owner;
  state.busy = true;
  state.renderKey = "";
  render(state);
  try {
    await job(id);
  } catch (error) {
    if (!lifetime.alive) return;
    if (id === current()) status(errorMessage(error), true);
  } finally {
    state.busy = false;
    state.renderKey = "";
    if (id === current()) render(state);
  }
}

/** Whether a finished planner round's answer reads as a plan; an unreadable one keeps its note in the conversation. */
function readable(run: PlanRun) {
  if (!run.turns) return true;
  try {
    parseCodingPlanAnswer((run.turns.filter(turn => turn.kind === "assistant").at(-1)?.text || "").trim());
    return true;
  } catch {
    return false;
  }
}

/** The confirm or execute button of the plan, or what carrying it out has come to. */
function drawProgress(state: Plans, plan: PlanDraft, active: boolean) {
  const { ports, region, runs } = state, { translate: L, q, api, current, status, execute } = ports;
  const confirmed = plan.confirmed;
  const execution = confirmed ? runs.find(run => run.frozen.text_materials.some(item => item.source_artifact_id === confirmed.artifact_id && item.source_version === confirmed.version)) : null;
  if (execution) {
    const names: Readonly<Record<string, string>> = { completed: L("coding.plan.run.completed"), failed: L("coding.plan.run.failed"), stopped: L("coding.plan.run.stopped"), cancelled: L("coding.state.cancelled"), "awaiting-review": L("coding.plan.run.awaiting-review"), "awaiting-input": L("coding.phase.awaiting-input"), "reconcile-required": L("coding.plan.run.reconcile") };
    region.append(el("p", names[execution.phase] || L("coding.plan.run.running")));
    region.append(button(state, L("coding.plan.view-run"), () => {
      const block = [...q("[data-coding-turns]").children].find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.run === execution.ref.run_id);
      if (block) {
        block.scrollIntoView({ block: "start" });
        block.tabIndex = -1;
        block.focus({ preventScroll: true });
      }
    }));
  } else if (confirmed) {
    region.append(button(state, L("coding.plan.execute"), () => action(state, () => execute(plan.revision)), state.busy || active));
  } else {
    region.append(button(state, L("coding.plan.confirm"), () => action(state, async id => {
      const data = await api<{ plan: PlanDraft }>(path(state) + "/confirm", "POST", { expected_revision: plan.revision });
      if (id === current()) {
        state.plan = data.plan;
        status(L("coding.plan.confirmed", { revision: data.plan.revision }));
      }
    }), state.busy || Boolean(plan.content.blockers)));
    if (plan.content.blockers) region.append(el("p", L("coding.plan.blocked-note")));
  }
}

/** The plan, its source and how far it has got. */
function drawPlan(state: Plans, plan: PlanDraft, active: boolean) {
  const { translate: L } = state.ports, { region } = state;
  region.append(el("p", L("coding.board.revision", { revision: plan.revision }) + " · " + (plan.confirmed ? L("coding.board.plan.confirmed") : L("coding.board.plan.unconfirmed"))));
  describe(L, region, plan.content);
  const origin = el("details");
  origin.append(el("summary", L("coding.plan.source")), el("p", plan.source.task), el("p", plan.source.workspace_path));
  region.append(origin, button(state, L("coding.plan.view-adjust"), () => edit(state), state.busy));
  drawProgress(state, plan, active);
  region.append(el("p", L("coding.plan.confirm-note")));
}

/** A button to each revision a round was started from, and a note when it is not the latest. */
function drawRevisions(state: Plans) {
  const { translate: L } = state.ports, { region, plan, runs, owner } = state;
  for (const [index, run] of runs.entries()) {
    for (const material of run.frozen.text_materials) {
      const prefix = "coding-plan:" + owner + ":";
      if (!material.source_artifact_id.startsWith(prefix)) continue;
      const revision = Number(material.source_artifact_id.slice(prefix.length));
      if (!Number.isSafeInteger(revision) || revision < 1) continue;
      region.append(button(state, L("coding.plan.turn-plan", { number: index + 1, revision }), () => action(state, () => fixed(state, revision)), state.busy));
      if (plan && revision !== plan.revision) region.append(el("p", L("coding.plan.turn-uses", { number: index + 1, revision })));
    }
  }
}

/** Draws the panel, unless nothing it shows changed. */
function render(state: Plans) {
  const { ports, region, runs } = state, { translate: L, api, current } = ports, plan = state.plan;
  const active = runs.some(run => !ENDED.includes(run.phase));
  const planners = runs.filter(run => run.frozen.role_id === "planner" && run.phase === "completed" && readable(run));
  const key = JSON.stringify([state.owner, plan, planners.map(run => run.ref.run_id), runs.map(run => [run.ref.run_id, run.phase]), state.busy]);
  if (key === state.renderKey) return;
  state.renderKey = key;
  region.replaceChildren();
  region.hidden = !plan && !planners.length;
  region.append(el("h3", L("coding.board.plan")));
  if (plan) drawPlan(state, plan, active);
  drawRevisions(state);
  for (const run of planners.filter(one => one.ref.run_id !== plan?.source.run_id)) {
    region.append(button(state, L("coding.plan.turn-proposal", { number: runs.indexOf(run) + 1 }), () => action(state, async id => {
      const data = await api<{ plan: PlanDraft }>(path(state), "POST", { run_id: run.ref.run_id, expected_revision: plan?.revision ?? 0 });
      if (id === current()) {
        state.plan = data.plan;
        edit(state);
      }
    }), state.busy));
  }
}

/** Saves the plan the editor holds as the session's next revision. */
async function save(state: Plans, event: Event) {
  const { ports, dialog } = state, { translate: L, q, api, current, status, lifetime } = ports;
  event.preventDefault();
  const draft = state.editor;
  if (!draft || state.busy) return;
  remember(state);
  state.busy = true;
  const submit = q<HTMLButtonElement>("[data-coding-plan-save]");
  submit.disabled = true;
  try {
    const data = await api<{ plan: PlanDraft }>("/sessions/" + encodeURIComponent(draft.id) + "/plan", "POST", { expected_revision: draft.revision, content: values(draft) });
    try { sessionStorage.removeItem(storedKey(draft.id)); } catch { /* storage closed: nothing was kept */ }
    if (draft.id === current()) {
      state.plan = data.plan;
      dialog.close();
      state.editor = null;
      status(L("coding.plan.saved"));
    }
  } catch (error) {
    if (!lifetime.alive) return;
    q("[data-coding-plan-error]").textContent = errorMessage(error);
  } finally {
    state.busy = false;
    submit.disabled = false;
    state.renderKey = "";
    render(state);
  }
}

function proposalOf(L: PlanPorts["translate"], node: HTMLElement, run: PlanRun, text: string) {
  node.replaceChildren();
  try {
    const content = parseCodingPlanAnswer(text);
    node.append(el("p", L("coding.plan.proposal")));
    describe(L, node, content);
    const detail = el("details");
    detail.append(el("summary", L("coding.plan.planner-answer")), el("pre", text));
    node.append(detail);
  } catch {
    node.append(el("p", run.phase === "completed" ? L("coding.plan.proposal-incomplete") : L("coding.plan.forming")));
    const detail = el("details");
    detail.append(el("summary", L("coding.plan.answer")), el("pre", text));
    node.append(detail);
  }
}

/** The plan panel, the plan editor and the planner's proposals in the conversation. Plan drafts are UI inputs; execution state is always projected from Run records. */
export function plansClient(ports: PlanPorts): PlansClient {
  const { lifetime, q } = ports, L = ports.translate;
  const state: Plans = { ports, region: q("[data-coding-plan]"), dialog: q<HTMLDialogElement>("[data-coding-plan-dialog]"), plan: null, runs: [], owner: "", busy: false, editor: null, renderKey: "" };
  lifetime.listen(q("[data-coding-plan-form]"), "input", () => remember(state));
  lifetime.listen(q("[data-coding-plan-close]"), "click", () => {
    remember(state);
    state.dialog.close();
  });
  lifetime.listen(state.dialog, "cancel", () => remember(state));
  lifetime.listen(q("[data-coding-plan-form]"), "submit", event => save(state, event));
  return {
    prepareStepRework(reason) {
      if (!state.plan) throw new Error(L("coding.plan.unreadable"));
      edit(state);
      const editor = state.editor;
      if (editor) editor.reason.value = [editor.reason.value, reason].filter(Boolean).join("\n");
      remember(state);
      q("[data-coding-plan-error]").textContent = L("coding.plan.rework");
    },
    openFixed: revision => fixed(state, revision),
    update(id, value, nextRuns) {
      if (state.owner !== id) {
        remember(state);
        state.dialog.close();
        state.editor = null;
        state.renderKey = "";
        state.plan = null;
      }
      state.owner = id;
      const held = state.plan;
      if (value && (!held || value.revision > held.revision || (value.revision === held.revision && (!held.confirmed || value.confirmed)))) state.plan = value;
      else if (!value && !held) state.plan = null;
      state.runs = nextRuns;
      render(state);
    },
    renderTurn(node, run, turn) {
      if (run.frozen.role_id !== "planner" || turn.kind !== "assistant" || !(/^\s*\{/.test(turn.text) || turn.text.includes("\n{") || turn.text.includes("```"))) return false;
      proposalOf(L, node, run, turn.text);
      return true;
    },
  };
}
