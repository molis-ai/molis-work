import { stepActorText } from "./step-actor.js";
import type { PlanEntry, StepNode } from "./shapes.js";
import { clip, firstLine, oneLine, when } from "./taskboard-format.js";
import { settled, skipped, stepOf } from "./taskboard-steps.js";
import type { Board, BoardChild, BoardGroup, BoardRow, BoardRun, BoardSubagents, Executor, StateMark, TreeInput } from "./taskboard-types.js";
import type { Translate } from "./types.js";

/** A subagent with the round that ran it. */
interface ChildItem { readonly child: BoardChild; readonly run_id: string }

/** Everything the rows of one round's steps share. */
interface StepScope {
  readonly input: TreeInput;
  readonly run: BoardRun;
  readonly entry: PlanEntry;
  readonly board: Board;
  readonly executor: Executor;
  readonly children: readonly ChildItem[];
  readonly placed: ReadonlyMap<string, readonly ChildItem[]>;
  readonly live: boolean;
  readonly editable: boolean;
}

const OPEN_PHASES = ["running", "starting", "paused", "pausing", "awaiting-review", "awaiting-input"];
const ENDED_PHASES = ["completed", "failed", "stopped", "cancelled"];
const LIVE_PHASES = ["starting", "running", "compacting"];
const HELD_PHASES = ["paused", "pausing", "awaiting-input", "awaiting-review"];


const unknown = (L: Translate): StateMark => [L("coding.board.state.unknown"), "verify", "idle"];

/** The Agent that does the work: the round's own Character when one was chosen, otherwise its role; a subagent is its role. */
function executorOf({ translate: L, ports }: TreeInput, run: BoardRun): Executor {
  const character = run.frozen?.character?.title, role = ports.roleName(run.frozen?.role_id);
  if (character) return { name: character, detail: L("coding.board.by-character", { character, role }) };
  return { name: role, detail: L("coding.board.by-role", { role }) + (run.frozen?.model_id ? " · " + L("coding.board.model", { model: run.frozen.model_id }) : "") };
}

const startedAt = (child: BoardChild) => {
  const at = child.activity?.find(item => item.at)?.at;
  return at ? Date.parse(at) : NaN;
};

/** A subagent holding a step belongs under it; one holding none, under the step reported just before it started. */
function stepFor(nodes: readonly StepNode[], child: BoardChild): StepNode | null {
  const held = nodes.find(node => node.owner?.subagent_id === child.subagent_id);
  if (held) return held;
  const at = startedAt(child);
  if (!Number.isFinite(at)) return null;
  let best: StepNode | null = null, bestAt = -Infinity;
  for (const node of nodes) {
    for (const report of node.reports) {
      if (report.at_ms !== undefined && report.at_ms <= at && report.at_ms > bestAt) {
        best = node;
        bestAt = report.at_ms;
      }
    }
  }
  return best;
}

function childRow({ translate: L, words, ports }: TreeInput, run: BoardRun, { child, run_id }: ChildItem): BoardRow {
  const verdict = child.verdict?.status, role = ports.roleName(child.role_id) || child.role_name || "", at = startedAt(child);
  const here = run.frozen?.directory?.canonical_path;
  const own = child.workspace_path && here && child.workspace_path !== here ? child.workspace_path.split("/").filter(Boolean).at(-1) : "";
  const state = verdict === "accepted" ? words.state.accepted! : verdict === "needs-work" ? words.state["needs-work"]! : words.child[child.state] || unknown(L);
  return {
    key: "child-" + child.subagent_id, label: L("coding.board.subtask"), title: oneLine(child.task), hint: child.task, state, progress: null,
    note: own ? L("coding.board.own-directory", { path: own }) : "",
    executor: { name: role, detail: L("coding.board.subagent", { role }) + (child.error ? " · " + child.error : "") },
    time: Number.isFinite(at) ? when(at) : null, target: { kind: "child", run_id, child_id: child.subagent_id }, children: [],
  };
}

/**
 * Who does a step: its holder on the graph, not whoever runs the round. A claim held quiet too long by a session with no round
 * running reads as expired, for you to reassign.
 */
function doerOf({ input: { translate: L, ports }, executor }: StepScope, holder: StepNode["owner"], held: BoardChild | undefined): Executor {
  if (!holder) return executor;
  const label = stepActorText(L, holder), expired = holder.expired ? { expired: true } : {};
  if (holder.kind === "session") return { name: executor.name, detail: L("coding.board.holder", { holder: label }) + " · " + executor.detail, ...expired };
  if (holder.kind === "subtask") return { name: label, detail: L("coding.board.holder", { holder: label }) + (held ? " · " + L("coding.board.held-subagent", { role: ports.roleName(held.role_id) || held.role_name || "" }) : "") };
  if (holder.kind === "person") return { name: L("coding.board.you"), detail: L("coding.board.holder-you"), person: true };
  if (holder.kind === "none") return { name: L("coding.board.unclaimed"), detail: L("coding.board.no-holder"), none: true };
  return { name: label, detail: L("coding.board.holder", { holder: label }), ...expired };
}

/** A step's state: the person's verdict, their skip, their own mark, else the graph's; a running step draws as its round is. */
function stepState({ input: { translate: L, words }, run, entry, board }: StepScope, node: StepNode): { state: StateMark; decided: string | null } {
  const verdict = entry.verdicts?.[node.id], decided = verdict && verdict.board_version === board.version ? verdict.status : null;
  // A step you hold ends by your own mark, not by a model's report.
  const yours: StateMark | null = node.owner?.kind === "person" && (node.state === "succeeded" || node.state === "failed")
    ? (node.state === "succeeded" ? [L("coding.board.state.you-done"), "done", "done"] : [L("coding.board.state.you-failed"), "failed", "blocked"]) : null;
  const state = decided === "accepted" ? words.state.accepted! : decided === "needs-work" ? words.state["needs-work"]! : skipped(node) ? words.state.skipped! : yours || words.state[node.state] || words.state.pending!;
  if (node.state !== "running" || decided) return { state, decided };
  const mark = node.owner?.kind === "person" ? "doing" : LIVE_PHASES.includes(run.phase) ? "running" : HELD_PHASES.includes(run.phase) ? words.phase[run.phase]![1] : "doing";
  return { state: [state[0], mark, state[2]], decided };
}

function stepHint(L: Translate, acceptance: string, holderLabel: string, last: StepNode["reports"][number] | undefined): string {
  return (acceptance ? L("coding.board.acceptance", { acceptance }) : "") + (holderLabel ? "\n" + L("coding.board.holder", { holder: holderLabel }) : "")
    + (last ? "\n" + L("coding.board.last-report", { report: (last.by ? stepActorText(L, last.by) + L("coding.timeline.colon") : "") + last.note }) : "");
}

function stepRow(scope: StepScope, node: StepNode, position: number): BoardRow {
  const { input, entry, board, run, placed, children, live, editable } = scope, L = input.translate, id = run.ref.run_id;
  const step = stepOf(entry.plan, node), { state, decided } = stepState(scope, node);
  const deps = (node.depends_on || []).map(dep => board.nodes.find(other => other.id === dep)).filter((dep): dep is StepNode => Boolean(dep))
    .map(dep => ({ title: stepOf(entry.plan, dep).title, ready: settled(dep), blocked: ["failed", "blocked"].includes(dep.state) }));
  const mine = (placed.get(node.id) || []).map(item => childRow(input, run, item)), last = node.reports.at(-1), holder = node.owner;
  const held = holder?.kind === "subtask" ? children.find(item => item.child.subagent_id === holder.subagent_id)?.child : undefined;
  const done = mine.length ? mine.filter(row => ["done", "accepted"].includes(row.state[2])).length : settled(node) || decided === "accepted" ? 1 : 0;
  return {
    key: "step-" + id + "-" + node.id, label: node.inserted ? L("coding.board.inserted") : "S" + (Number(node.id.replace("step-", "")) || position + 1), title: step.title,
    hint: stepHint(L, step.acceptance, holder ? stepActorText(L, holder) : "", last), state, progress: { done, total: mine.length || 1 }, deps,
    executor: doerOf(scope, holder, held), time: last ? when(last.at_ms) : null, target: { kind: "step", run_id: id, step_id: node.id }, children: mine, node,
    ...(editable ? { edit: { board, runId: id, position, live } } : {}),
  };
}

/** Sorts a round's subagents under the steps they belong to; the rest stay on the round. */
function placeChildren(nodes: readonly StepNode[], children: readonly ChildItem[]) {
  const placed = new Map<string, ChildItem[]>(), loose: ChildItem[] = [];
  for (const item of children) {
    const node = stepFor(nodes, item.child);
    if (node) placed.set(node.id, [...(placed.get(node.id) || []), item]);
    else loose.push(item);
  }
  return { placed, loose };
}

/**
 * The latest round's unfinished graph can still be changed once the round ends; "继续计划" carries on from it. A plan round is
 * also the latest one to change when only ended conversation rounds came after it.
 */
function canChange({ data }: TreeInput, span: readonly number[], board: Board | undefined, live: boolean): boolean {
  if (!board || board.terminal) return false;
  const runs = data.runs || [], plans = data.taskboard_plans || [];
  const lastPlan = runs.reduce((found, other, at) => plans.some(item => item.run_id === other.ref.run_id && item.board) ? at : found, -1);
  const quietAfter = runs.slice(lastPlan + 1).every(other => ENDED_PHASES.includes(other.phase));
  return live || span.includes(runs.length - 1) || span.includes(lastPlan) && quietAfter;
}

/** One round that ran a plan or dispatched subagents; null when it did neither. */
function roundRow(input: TreeInput, index: number, entry: PlanEntry | undefined, span: readonly number[]): BoardRow | null {
  const { data, translate: L, ports } = input, runs = data.runs || [], plans = data.taskboard_plans || [], run = runs[index]!, id = run.ref.run_id;
  const here = span.map(at => (data.subagents || []).find(item => item.run_id === runs[at]!.ref.run_id)).filter((item): item is BoardSubagents => Boolean(item));
  const group = here.find(item => item.error), children = here.flatMap(item => item.children.map(child => ({ child, run_id: item.run_id })));
  if (!entry && !children.length && !plans.some(item => item.run_id === id)) return null;
  const board = entry?.board, nodes = board?.nodes || [], executor = executorOf(input, run), { placed, loose } = placeChildren(nodes, children);
  const live = Boolean(board && !board.terminal && OPEN_PHASES.includes(run.phase));
  const steps = entry && board ? nodes.map((node, position) => stepRow({ input, run, entry, board, executor, children, placed, live, editable: canChange(input, span, board, live) }, node, position)) : [];
  // A skipped step leaves the count altogether: it is neither done nor still to do.
  const doneSteps = nodes.filter(node => settled(node) && !skipped(node)).length, counted = nodes.filter(node => !skipped(node)).length;
  const asked = ports.ownTask(run.turns?.find(turn => turn.kind === "user" && !turn.steer)?.text || "");
  const name = entry?.plan?.content.title || clip(firstLine(run.task ?? asked), 90) || L("coding.turn.number", { number: index + 1 });
  const first = runs[span[0]!]!, turns = span.map(at => "#" + (at + 1));
  return {
    key: "run-" + id, label: span.length > 1 ? "#" + (span[0]! + 1) + "–" + (index + 1) : "#" + (index + 1), title: name,
    hint: [entry ? L("coding.board.plan-revision", { revision: entry.revision ?? "?" }) : "", span.length > 1 ? L("coding.board.continued-turns", { turns: turns.join(L("coding.list.joiner")) }) : ""].filter(Boolean).join("\n"),
    state: input.words.phase[run.phase] || unknown(L),
    progress: nodes.length ? { done: doneSteps, total: counted || nodes.length } : children.length ? { done: children.filter(item => item.child.state === "completed").length, total: children.length } : null,
    executor, time: when(first.started_at), target: { kind: "run", run_id: id }, children: [...steps, ...loose.map(item => childRow(input, run, item))], note: entry?.error || group?.error || "",
  };
}

/** Each round that ran a plan or dispatched subagents, newest first. Rounds that continued one step graph are one task: the graph shows once, under its latest round, with every round that worked on it named on that row. */
function roundRows(input: TreeInput): BoardRow[] {
  const runs = input.data.runs || [], plans = input.data.taskboard_plans || [], spans = new Map<string, number[]>(), rows: BoardRow[] = [];
  const entryOf = (run: BoardRun) => plans.find(item => item.run_id === run.ref.run_id && item.board);
  runs.forEach((run, index) => {
    const project = entryOf(run)?.board?.project_id;
    if (project) spans.set(project, [...(spans.get(project) || []), index]);
  });
  runs.forEach((run, index) => {
    const entry = entryOf(run), span = (entry?.board && spans.get(entry.board.project_id)) || [index];
    if (span.at(-1) !== index) return;
    const row = roundRow(input, index, entry, span);
    if (row) rows.unshift(row);
  });
  return rows;
}

/** What needs a decision before the session goes on. */
function attentionGroup({ data, translate: L, words }: TreeInput): BoardGroup | null {
  if (!data.recovery_required && !data.checkpoint_busy) return null;
  const items: BoardRow[] = [];
  if (data.recovery_required) items.push({ key: "recovery", title: L("coding.recovery.title"), state: words.phase["reconcile-required"]!, progress: null, target: { kind: "recovery" }, executor: null, children: [] });
  if (data.checkpoint_busy) items.push({ key: "rewind", title: L("coding.board.rewind"), state: words.phase["awaiting-review"]!, progress: null, target: { kind: "reviews" }, executor: null, children: [] });
  return { id: "attention", label: L("coding.board.group.attention"), mark: "circle-alert", items };
}

/** The plan not yet run: its steps as they would be run. */
function planGroup({ data, translate: L, words }: TreeInput): BoardGroup | null {
  const plan = data.plan, plans = data.taskboard_plans || [];
  if (!plan || plans.some(entry => entry.revision === plan.revision && entry.board)) return null;
  const steps: BoardRow[] = plan.content.steps.map((step, index) => ({
    key: "plan-" + index, label: "S" + (index + 1), title: step.title, hint: L("coding.board.acceptance", { acceptance: step.acceptance }), state: words.state.pending!,
    progress: { done: 0, total: 1 }, executor: null, target: { kind: "plan" }, children: [],
  }));
  const state: StateMark = plan.content.blockers ? [L("coding.board.plan.blocked"), "blocked", "blocked"] : plan.confirmed ? [L("coding.board.plan.confirmed"), "ready", "ready"] : [L("coding.board.plan.unconfirmed"), "approval", "attention"];
  const row: BoardRow = { key: "plan", label: L("coding.board.plan"), title: plan.content.title, hint: plan.content.change_reason || "", state, progress: { done: 0, total: steps.length }, executor: null, target: { kind: "plan" }, children: steps };
  return { id: "plan", label: L("coding.board.group.plan"), mark: "list", count: L("coding.board.revision", { revision: plan.revision }), items: [row] };
}

/** The session's work as groups of rows: what needs deciding, the plan not yet run, and the rounds. */
export function buildTree(input: TreeInput): BoardGroup[] {
  const groups: BoardGroup[] = [], rounds = roundRows(input), L = input.translate;
  const attention = attentionGroup(input), plan = planGroup(input);
  if (attention) groups.push(attention);
  if (plan) groups.push(plan);
  if (rounds.length) groups.push({ id: "rounds", label: L("coding.board.group.run"), mark: "play", count: L("coding.board.turns", { count: rounds.length }), items: rounds });
  return groups;
}
