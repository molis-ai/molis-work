import { el, errorMessage } from "./dom.js";
import type { PlanEntry, StepNode } from "./shapes.js";
import type { PagePorts, Translate } from "./types.js";

/** The round the progress belongs to, as far as the card reads it. */
export interface ProgressRun {
  readonly ref: { readonly run_id: string };
  readonly phase: string;
  readonly frozen?: { readonly role_id?: string; readonly character?: { readonly title?: string } };
  readonly turns?: readonly { readonly text: string; readonly steer?: { readonly id: string; readonly model_claim?: { readonly treatment?: string } } }[];
}

export interface ProgressPorts extends Pick<PagePorts, "lifetime" | "translate" | "api" | "current" | "status" | "refresh"> {
  /** Opens the reports of a step. */
  readonly openStep: (runId: string, stepId: string) => void;
  /** The receipt link of a step the person's words started, when there is one. */
  readonly from: (node: StepNode) => Node | null;
  readonly stepOf: (plan: PlanEntry["plan"], node: StepNode) => { readonly title: string; readonly acceptance?: string };
  readonly skipped: (node: StepNode) => boolean;
  readonly settled: (node: StepNode) => boolean;
  /** A step state in the page's word. */
  readonly word: (state: string) => string;
  /** The name of a round's role, when the page knows the role. */
  readonly roleLabel: (roleId: string) => string | undefined;
}

export interface PlanProgress {
  /** The card of a round's plan graph, or null when the round has none. */
  render(run: ProgressRun, entry: PlanEntry | undefined, live: boolean, latest?: boolean): HTMLElement | null;
}

/** What a person may change on the graph; the Host checks each against the graph's version. */
type Amendment =
  | { kind: "insert"; after: string; title: string; acceptance: string; origin?: string }
  | { kind: "move"; node: string; direction: "up" | "down" }
  | { kind: "unblock"; node: string; note: string }
  | { kind: "skip"; node: string; reason: string }
  | { kind: "assign"; node: string; to: "me" | "session" }
  | { kind: "resolve"; node: string; state: "succeeded" | "failed"; note: string };

/** An input of the inline form: its name, placeholder, longest text and starting text. */
type FormField = readonly [name: string, placeholder: string, max: number, value?: string];

type Board = NonNullable<PlanEntry["board"]>;

/** Everything one drawing of the card shares. */
interface Drawing {
  readonly ports: ProgressPorts;
  readonly card: HTMLElement;
  readonly run: ProgressRun;
  readonly entry: PlanEntry;
  readonly board: Board;
  readonly editable: boolean;
  /** Who runs the plan's steps by default: the Character, the role, or "Agent". */
  readonly who: string;
  readonly change: (amendment: Amendment) => Promise<void>;
  readonly insert: (row: HTMLElement, after: string, label: string, value?: string, origin?: string) => void;
}

const MARK: Readonly<Record<string, string>> = { succeeded: "done", running: "running", failed: "failed", blocked: "blocked", cancelled: "cancelled", ready: "ready", "not-started": "waiting" };
const TONE: Readonly<Record<string, string>> = { succeeded: "done", running: "progress", failed: "blocked", blocked: "blocked", cancelled: "quiet", ready: "ready", "not-started": "idle" };
const WAITING = ["not-started", "ready"];

const svg = (name: string) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const date = new Date(ms);
  return pad(date.getHours()) + ":" + pad(date.getMinutes());
};
const hueOf = (text: string) => {
  let hue = 0;
  for (const char of text) hue = (hue * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hue;
};

/** Sends one change of the graph, then reads the session again. */
async function amend(ports: ProgressPorts, card: HTMLElement, runId: string, version: number, amendment: Amendment) {
  const { translate: L, lifetime, api, current, status, refresh } = ports;
  const id = current();
  card.dataset.busy = "true";
  try {
    const result = await api<{ board?: { terminal?: boolean }; steered?: boolean; steer_error?: string }>("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(runId) + "/plan-amendments", "POST", { amendment, expected_version: version });
    // A round that has ended hears of the change when the plan continues; only a live round is told right away.
    if (card.dataset.live !== "true") status(result?.board?.terminal ? L("coding.board.saved-done") : L("coding.board.saved-continue"));
    else status(result.steered ? L("coding.board.steered") : L("coding.board.steer-failed", { reason: result.steer_error || L("coding.common.unknown-reason") }), !result.steered);
    delete card.dataset.editing;
  } catch (error) {
    if (!lifetime.alive) return;
    status(errorMessage(error), true);
  } finally {
    delete card.dataset.busy;
    card.dataset.signature = "";
    if (id === current()) await refresh();
  }
}

/** One inline form at a time, placed under the step it acts on. */
function openForm(ports: ProgressPorts, card: HTMLElement, row: HTMLElement, fields: readonly FormField[], submit: (values: string[]) => Promise<void>, label: string) {
  const { translate: L, lifetime } = ports;
  card.querySelector(".coding-plan-form")?.remove();
  card.dataset.editing = "true";
  const box = el("form", "", "coding-plan-form");
  const inputs = fields.map(([name, placeholder, max, value]) => {
    const input = el("input", "", "mw-input");
    input.name = name;
    input.placeholder = placeholder;
    input.maxLength = max;
    input.required = true;
    input.value = value || "";
    box.append(input);
    return input;
  });
  const actions = el("div", "", "coding-plan-form-actions"), cancel = el("button", L("coding.board.cancel"), "mw-btn mw-btn--ghost"), ok = el("button", label, "mw-btn mw-btn--primary");
  cancel.type = "button";
  ok.type = "submit";
  actions.append(cancel, ok);
  box.append(actions);
  const close = () => {
    box.remove();
    delete card.dataset.editing;
  };
  lifetime.listen(cancel, "click", close);
  lifetime.listen(box, "keydown", event => {
    if (event instanceof KeyboardEvent && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  lifetime.listen(box, "submit", event => {
    event.preventDefault();
    if (inputs.some(input => !input.value.trim())) return;
    ok.disabled = true;
    void submit(inputs.map(input => input.value.trim()));
  });
  row.after(box);
  inputs[0]?.focus();
}

/** Who holds a step, in the page's words; a subtask keeps its title (the person's own words, quoted in 「」). */
function holderText(L: Translate, value: NonNullable<StepNode["owner"]>) {
  if (value.kind === "subtask") {
    const title = /[「“"](.+?)[」”"]/.exec(value.label || "")?.[1];
    return title ? L("coding.board.holder-subtask", { title }) : L("coding.board.subtask");
  }
  return value.kind === "session" ? L("coding.board.this-session") : value.kind === "person" ? L("coding.board.you") : value.kind === "none" ? L("coding.board.unclaimed") : L("coding.board.holder-other");
}

/** The step's state: the verdict when the person has given one, else what the graph says. */
function stateMark(d: Drawing, node: StepNode, decided: string | null) {
  const { ports, run } = d, { translate: L, skipped, word } = ports;
  const state = el("span", "", "coding-board-state coding-plan-state");
  state.dataset.tone = decided === "accepted" ? "accepted" : decided === "needs-work" ? "attention" : skipped(node) ? "quiet" : TONE[node.state] || "idle";
  const running = node.owner?.kind === "person" ? "doing" : ["starting", "running", "compacting"].includes(run.phase) ? "running" : ({ paused: "paused", pausing: "paused", "awaiting-input": "answer", "awaiting-review": "approval" } as Readonly<Record<string, string>>)[run.phase] || "doing";
  state.dataset.mwState = decided === "accepted" ? "done" : decided === "needs-work" ? "blocked" : skipped(node) ? "cancelled" : node.state === "running" ? running : MARK[node.state] || "idle";
  const yours = node.owner?.kind === "person" && ["succeeded", "failed"].includes(node.state);
  state.append(el("span", decided === "accepted" ? L("coding.board.state.accepted") : decided === "needs-work" ? L("coding.board.state.needs-work") : skipped(node) ? L("coding.plan.you-skipped") : yours ? (node.state === "succeeded" ? L("coding.board.state.you-done") : L("coding.board.state.you-failed")) : word(node.state)));
  if (decided) state.dataset.verdict = decided;
  return state;
}

/** What the step waits for, as a chip. */
function depsChip(d: Drawing, node: StepNode) {
  const { translate: L, settled, stepOf } = d.ports;
  const deps = (node.depends_on || []).map(id => d.board.nodes.find(other => other.id === id)).filter((dep): dep is StepNode => Boolean(dep));
  const waiting = deps.filter(dep => !settled(dep)), stuck = waiting.filter(dep => ["failed", "blocked"].includes(dep.state));
  const chip = el("span", "", "coding-board-deps " + (!deps.length ? "is-empty" : stuck.length ? "is-blocked" : waiting.length ? "is-waiting" : "is-ready"));
  if (deps.length) {
    chip.textContent = L("coding.board.deps", { count: deps.length }) + " · " + (stuck.length ? L("coding.board.deps-blocked", { count: stuck.length }) : waiting.length ? L("coding.board.deps-waiting", { count: waiting.length }) : L("coding.board.deps-ready"));
    chip.title = deps.map(dep => stepOf(d.entry.plan, dep).title).join("\n");
  }
  return chip;
}

/** When the step last moved, and who holds it: this session (its executor), a subtask, you, or no one. */
function stepMeta(d: Drawing, node: StepNode) {
  const L = d.ports.translate, holder = node.owner;
  const name = !holder || holder.kind === "session" ? d.who : holderText(L, holder);
  const last = node.reports.at(-1);
  const meta = el("span", "", "coding-board-meta"), time = el("time", last?.at_ms !== undefined ? clock(last.at_ms) : "", "coding-board-time" + (node.reports.length ? "" : " is-empty"));
  const avatar = el("span", holder?.kind === "none" ? "" : Array.from(name)[0] ?? "", "coding-board-avatar" + (holder?.kind === "none" ? " is-unknown" : ""));
  if (holder?.kind === "none") avatar.innerHTML = svg("user");
  else avatar.style.setProperty("--board-avatar-hue", String(holder && holder.kind !== "session" ? hueOf(name) : hueOf(d.who)));
  avatar.title = L("coding.board.holder", { holder: holder ? (holder.kind === "session" ? L("coding.board.this-session") + " · " + d.who : holderText(L, holder)) : d.who }) + (holder?.expired ? " · " + L("coding.board.expired") : "");
  avatar.setAttribute("aria-label", avatar.title);
  meta.append(time, avatar);
  return meta;
}

/** The step's title as a button that opens its reports, with where it came from. */
function stepLead(d: Drawing, node: StepNode, index: number, step: { readonly title: string; readonly acceptance?: string }) {
  const { translate: L, lifetime, openStep, from } = d.ports;
  const lead = el("span", "", "coding-board-lead"), main = el("button", "", "coding-board-node coding-plan-title");
  main.type = "button";
  const note = node.reports.at(-1)?.note;
  main.title = (step.acceptance ? L("coding.board.acceptance", { acceptance: step.acceptance }) : "") + (note ? "\n" + L("coding.board.last-report", { report: note }) : "") || L("coding.plan.open-step");
  const name = el("strong", step.title);
  name.dataset.insertedLabel = L("coding.plan.you-inserted");
  main.append(el("span", node.inserted ? L("coding.board.inserted") : "S" + (index + 1), "coding-board-key"), name);
  lifetime.listen(main, "click", () => openStep(d.run.ref.run_id, node.id));
  lead.append(el("span", "", "coding-board-guide"), main);
  const source = from(node);
  if (source) lead.append(source);
  return lead;
}

/** The controls a person has on a step in its state. */
function stepTools(d: Drawing, row: HTMLElement, node: StepNode, index: number, title: string) {
  const { ports, board, card, change } = d, { translate: L, lifetime } = ports;
  const tools = el("span", "", "coding-board-tools coding-plan-tools");
  const tool = (label: string, icon: string, action: () => void) => {
    const button = el("button", "", "mw-btn mw-btn--ghost mw-btn--icon-only");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label + "：" + title);
    button.innerHTML = svg(icon);
    lifetime.listen(button, "click", action);
    tools.append(button);
  };
  const form = (fields: readonly FormField[], submit: (values: string[]) => Promise<void>, label: string) => openForm(ports, card, row, fields, submit, label);
  const waiting = WAITING.includes(node.state);
  const before = board.nodes[index - 1], after = board.nodes[index + 1];
  if (waiting && before && WAITING.includes(before.state)) tool(L("coding.board.move-up"), "chevron-up", () => void change({ kind: "move", node: node.id, direction: "up" }));
  if (waiting && after && WAITING.includes(after.state)) tool(L("coding.board.move-down"), "chevron-down", () => void change({ kind: "move", node: node.id, direction: "down" }));
  if (node.state === "blocked") tool(L("coding.board.decide"), "edit", () => form([["note", L("coding.plan.decide-note"), 500]], ([note]) => change({ kind: "unblock", node: node.id, note: note ?? "" }), L("coding.board.decide-ok")));
  if (waiting || node.state === "blocked" || node.state === "failed") tool(node.state === "failed" ? L("coding.board.pass-over") : L("coding.board.skip"), "minus", () => form([["reason", L("coding.board.skip-reason"), 300]], ([reason]) => change({ kind: "skip", node: node.id, reason: reason ?? "" }), L("coding.board.skip")));
  if (node.state !== "cancelled") tool(L("coding.board.insert"), "plus", () => d.insert(row, node.id, L("coding.board.insert-ok")));
  const open = !["succeeded", "failed", "cancelled"].includes(node.state), kind = node.owner?.kind;
  if (open && kind !== "person") tool(L("coding.board.mine"), "user", () => void change({ kind: "assign", node: node.id, to: "me" }));
  if (open && kind && kind !== "session") tool(kind === "none" ? L("coding.board.give-session") : L("coding.board.return-session"), "undo", () => void change({ kind: "assign", node: node.id, to: "session" }));
  if (open && kind === "person" && node.state !== "not-started") {
    tool(L("coding.board.mark-done"), "check", () => form([["note", L("coding.board.mark-done-note"), 500]], ([note]) => change({ kind: "resolve", node: node.id, state: "succeeded", note: note ?? "" }), L("coding.board.mark-done-ok")));
    tool(L("coding.board.mark-failed"), "x", () => form([["note", L("coding.board.mark-failed-note"), 500]], ([note]) => change({ kind: "resolve", node: node.id, state: "failed", note: note ?? "" }), L("coding.board.mark-failed")));
  }
  return tools;
}

/** A row in the TaskBoard's grammar: state, prerequisites, when it last moved and who is doing it. */
function stepRow(d: Drawing, node: StepNode, index: number) {
  const { ports, entry, board } = d, step = ports.stepOf(entry.plan, node), row = el("li", "", "coding-board-item coding-plan-step");
  row.dataset.state = ports.skipped(node) ? "skipped" : node.state;
  row.dataset.step = node.id;
  if (node.inserted) row.dataset.inserted = "true";
  const verdict = entry.verdicts?.[node.id], decided = verdict && verdict.board_version === board.version ? verdict.status : null;
  const line = el("div", "", "coding-board-entry");
  line.append(stepLead(d, node, index, step), stateMark(d, node, decided), depsChip(d, node), stepMeta(d, node));
  row.append(line);
  if (d.editable) line.append(stepTools(d, row, node, index, step.title));
  return row;
}

/** What the AI says should be a new task, while no step points at it yet. */
const offersOf = (run: ProgressRun, board: Board) => {
  const taken = board.nodes.flatMap(node => (node.origins || []).map(one => one.input_id));
  return (run.turns || []).filter(turn => turn.steer?.model_claim?.treatment === "new-task" && !taken.includes(turn.steer.id));
};

function drawHead(L: Translate, card: HTMLElement, entry: PlanEntry, board: Board, skipped: ProgressPorts["skipped"]) {
  const total = board.nodes.filter(node => !skipped(node)).length, done = board.nodes.filter(node => node.state === "succeeded").length;
  const head = el("header", "", "coding-plan-head");
  head.innerHTML = svg("list");
  head.append(el("strong", entry.plan?.content.title || L("coding.plan.this-turn")), el("span", L("coding.board.steps-done", { done, total }), "coding-plan-count"), el("span", entry.revision ? L("coding.board.plan-revision", { revision: entry.revision }) : "", "coding-plan-revision"));
  card.append(head);
}

function drawOffers(d: Drawing, list: HTMLElement, offers: ReturnType<typeof offersOf>) {
  const { translate: L, lifetime } = d.ports, last = d.board.nodes.at(-1);
  for (const turn of offers) {
    const row = el("li", "", "coding-plan-offer"), add = el("button", L("coding.plan.add-to-plan"), "mw-btn mw-btn--ghost");
    row.append(el("small", L("coding.plan.offer")), el("q", turn.text), add);
    list.append(row);
    lifetime.listen(add, "click", () => { if (last) d.insert(row, last.id, L("coding.plan.add-to-plan"), turn.text.slice(0, 120), turn.steer?.id); });
  }
}

/** The card of the running plan, in the conversation. */
function drawCard(ports: ProgressPorts, card: HTMLElement, run: ProgressRun, entry: PlanEntry, board: Board, live: boolean, latest: boolean) {
  const L = ports.translate;
  card.replaceChildren();
  drawHead(L, card, entry, board, ports.skipped);
  // The latest round's unfinished graph stays open to change after the round ends: a blocked step is decided, a
  // step skipped or added, and "继续计划" carries on from the graph as changed.
  const editable = (live || latest) && !board.terminal, list = el("ul", "", "coding-board-tree coding-board--compact coding-plan-steps");
  card.dataset.live = String(Boolean(live));
  const role = run.frozen?.role_id ? ports.roleLabel(run.frozen.role_id) : undefined, who = run.frozen?.character?.title || role || "Agent";
  const d: Drawing = {
    ports, card, run, entry, board, editable, who,
    change: amendment => amend(ports, card, run.ref.run_id, board.version, amendment),
    // A new step, after a step or for a supplement the AI says is a new task (its words as the title to start from).
    insert: (row, after, label, value, origin) => openForm(ports, card, row, [["title", L("coding.board.insert-title"), 120, value], ["acceptance", L("coding.board.insert-acceptance"), 300]],
      ([title, acceptance]) => amend(ports, card, run.ref.run_id, board.version, { kind: "insert", after, title: title ?? "", acceptance: acceptance ?? "", origin }), label),
  };
  board.nodes.forEach((node, index) => list.append(stepRow(d, node, index)));
  if (editable) drawOffers(d, list, offersOf(run, board));
  card.append(list, el("p", editable ? (live ? L("coding.plan.foot.live") : L("coding.plan.foot.ended")) : L("coding.plan.foot.fixed"), "coding-plan-foot"));
}

/**
 * The running plan, in the conversation: every step of the round's own graph with its reported state, and — while
 * the round is live — the person's controls to skip, insert, reorder or unblock. Each control is one SDK graph
 * operation through the Host; the card never infers a step's state from the model's prose.
 */
export function planProgress(ports: ProgressPorts): PlanProgress {
  const L = ports.translate;
  return {
    render(run, entry, live, latest = false) {
      const board = entry?.board;
      if (!entry || !board) return null;
      let card = document.querySelector<HTMLElement>('[data-coding-plan-progress="' + CSS.escape(run.ref.run_id) + '"]');
      if (!card) {
        card = el("section", "", "coding-plan-progress");
        card.dataset.codingPlanProgress = run.ref.run_id;
        card.setAttribute("aria-label", L("coding.plan.progress"));
      }
      const signature = JSON.stringify([board.version, board.terminal, live, latest, run.phase, entry.verdicts, offersOf(run, board).map(turn => turn.steer?.id)]);
      // Never rebuild under the person's hands: an open form keeps the card as it is until they finish.
      if (card.dataset.editing === "true" || card.dataset.busy === "true" || card.dataset.signature === signature) return card;
      card.dataset.signature = signature;
      drawCard(ports, card, run, entry, board, live, latest);
      return card;
    },
  };
}
