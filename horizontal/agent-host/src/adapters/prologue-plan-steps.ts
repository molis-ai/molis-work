import type { ExactRef, Runtime } from "@prologue/sdk";
import type { AgentExecutionPlan, AgentRunRef, AgentStepAmendment, AgentStepBoard, AgentStepOwner, AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputRef } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AgentCollaborationPort } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { checkOrigin } from "../input-origin.js";

type SdkBoard = ReturnType<Runtime["boards"]["get"]>;
type TaskNode = SdkBoard["nodes"][number];
type Assignee = TaskNode["assignee"];
type Report = TaskNode["reports"][number];
type ReportAuthor = NonNullable<AgentStepBoard["nodes"][number]["reports"][number]["by"]>;
/** The round's inputs as its record has them right now. */
export type RoundLedger = () => readonly AgentTurnView[];

/**
 * The collaboration port as the runtime gives it to the adapter: a change to the plan also gets the round's own input
 * ledger, so a new step's supplement is checked again right before the board takes the step (specs/ai-input-receipts 3d-5).
 */
export type PlanCollaborationPort = Omit<AgentCollaborationPort, "revise"> & {
  revise(run: AgentRunRef, amendment: AgentStepAmendment, expectedVersion: number, actorId: string, ledger: RoundLedger): Promise<AgentStepBoard>;
};

/**
 * Where a confirmed plan's steps are (specs/prologue-adoption §4.6.10, the user's B): on the project's work board, in
 * the block of the session that runs the plan. Their ids carry the plan's prefix (`<block>.p<n>.step-1`), so plans of
 * several sessions, and several plans of one session, share the board without colliding. The views give the plan's own
 * ids back (`step-1`, `user-1`): what the person and the Coding page know.
 */
export interface PlanPlace {
  readonly ref: ExactRef<"task-board">;
  /** The session's block: the plan's steps hang under it, and its rounds stand on it. */
  readonly block: string;
  readonly prefix: string;
  readonly plan: AgentExecutionPlan;
}

const ENDED = ["succeeded", "failed", "cancelled"];
export const fullId = (place: PlanPlace, id: string) => `${place.prefix}.${id}`;
/** A node's id within the plan, or undefined when it is not one of this plan's. */
export const localId = (place: PlanPlace, id: string) => id.startsWith(`${place.prefix}.`) ? id.slice(place.prefix.length + 1) : undefined;

/** A plan step: one of the confirmed plan's, or one a person inserted, under this plan's prefix. */
function planStep(node: TaskNode, place: PlanPlace): boolean {
  const local = localId(place, node.id);
  return local !== undefined && (place.plan.steps.some(step => step.id === local) || local.startsWith("user-"));
}
const planNodes = (board: SdkBoard, place: PlanPlace) => board.nodes.filter(node => planStep(node, place));

/** Every plan step has ended. */
export function finished(board: SdkBoard, place: PlanPlace): boolean {
  return board.terminal || planNodes(board, place).every(node => ENDED.includes(node.state));
}

/** The plan's version: when one of its own steps last changed. What other sessions do on the board does not move it. */
function planVersion(board: SdkBoard, place: PlanPlace): number {
  return Math.max(0, ...planNodes(board, place).map(node => node.changedAt ?? board.version));
}

/** The plan's own step title for a confirmed step, the person's title for an inserted one. */
function title(node: TaskNode, place: PlanPlace): string {
  return place.plan.steps.find(step => step.id === localId(place, node.id))?.title ?? node.title;
}

/** Dependencies first, the confirmed plan order (then insertion order) breaking ties. */
function executionOrder(board: SdkBoard, place: PlanPlace): TaskNode[] {
  const rank = (id: string) => { const index = place.plan.steps.findIndex(step => step.id === localId(place, id)); return index < 0 ? place.plan.steps.length + board.nodes.findIndex(node => node.id === id) : index; };
  const pending = new Map(planNodes(board, place).map(node => [node.id, node])), ordered: TaskNode[] = [];
  while (pending.size) {
    // Among steps that are equally available, the live chain reads first and skipped steps trail it.
    const key = (node: TaskNode) => (node.state === "cancelled" ? 1_000_000 : 0) + rank(node.id);
    const next = [...pending.values()].filter(node => node.dependsOn.every(dep => !pending.has(dep))).sort((a, b) => key(a) - key(b))[0]
      ?? [...pending.values()].sort((a, b) => key(a) - key(b))[0]!;
    ordered.push(next); pending.delete(next.id);
  }
  return ordered;
}

function same(a: Assignee, b: Assignee): boolean {
  return a === undefined || b === undefined ? a === b : a.kind === b.kind && a.id === b.id;
}

/** Who holds a step, as the round's people and model read it. */
function ownerOf(runtime: Runtime, assignee: Assignee, session: string): AgentStepOwner {
  if (!assignee) return { kind: "none", label: "没人认领" };
  if (assignee.kind === "human") return { kind: "person", label: "用户", actor_id: assignee.id };
  if (assignee.kind === "session") {
    if (assignee.id === session) return { kind: "session", label: "本会话" };
    const child = runtime.subagents.list().find(one => one.session.id === assignee.id);
    // The key the coordinator chose when dispatching it, after the round's own part.
    if (child) { const title = child.key.slice(child.key.indexOf(".") + 1); return { kind: "subtask", label: `子任务「${title}」`, title, subagent_id: child.ref.id }; }
    return { kind: "other", label: "另一个会话" };
  }
  return { kind: "other", label: "另一个角色" };
}

/** A claim held this long without a word, by a session with no round running, has expired (the person's decision). */
const CLAIM_EXPIRES_MS = 2 * 60 * 60 * 1000;

/**
 * The holder, marked expired when it is a session with no round running that has not moved the step for a while.
 * Nothing is taken back: the person, or the session that handed it out, reassigns it.
 */
function claimOf(runtime: Runtime, node: TaskNode, session: string, alive?: (session: string) => boolean, nowMs = Date.now()): AgentStepOwner {
  const owner = ownerOf(runtime, node.assignee, session);
  if (!alive || node.assignee?.kind !== "session" || !["session", "other"].includes(owner.kind) || ENDED.includes(node.state)) return owner;
  const last = node.reports.at(-1)?.atMs;
  if (last === undefined || alive(node.assignee.id) || nowMs - last < CLAIM_EXPIRES_MS) return owner;
  const hours = Math.floor((nowMs - last) / 3_600_000);
  return { ...owner, label: `${owner.label}（认领已过期，${hours} 小时没有动静）`, expired: true };
}

const STATE_WORDS: Record<TaskNode["state"], string> = { "not-started": "等前置", ready: "可开始", running: "进行中", waiting: "在等", succeeded: "已完成", failed: "失败", cancelled: "已跳过", blocked: "受阻", "needs-reconciliation": "需核对" };

function reportBy(runtime: Runtime, report: Report, session: string): ReportAuthor | undefined {
  if (report.handover) return { kind: "handover", label: "改派" };
  if (report.human) return { kind: "person", label: "用户" };
  if (!report.session) return undefined;
  // A session's report: this session, a subtask, or another session (never a person or no one).
  const { kind, label, title } = ownerOf(runtime, report.session, session);
  return { kind: kind === "session" || kind === "subtask" ? kind : "other", label, ...(title ? { title } : {}) };
}

/** A report's text; a handover says who it passed between, in the product's words rather than the SDK's. */
function reportNote(runtime: Runtime, report: Report, session: string): string {
  if (!report.handover) return report.note;
  const name = (one: Assignee) => ownerOf(runtime, one, session).label;
  const why = /^taken on by subagent /.test(report.note) ? "派出子任务时交给它"
    : /ended \((\w+)\) without finishing/.test(report.note) ? "子任务结束时没做完，交回" : report.note;
  return `${name(report.handover.from)} → ${name(report.handover.to)}（${why}）`;
}

/** One step in a line, by its id on the board (what the round's tools take): what it is, where it stands, who holds it, the latest word. */
export function stepLine(runtime: Runtime, node: TaskNode, place: PlanPlace, session: string, alive?: (session: string) => boolean): string {
  const last = node.reports.at(-1), owner = claimOf(runtime, node, session, alive);
  const by = last && reportBy(runtime, last, session)?.label;
  const latest = last ? `；最近：${by ? by + "：" : ""}${reportNote(runtime, last, session).slice(0, 120)}` : "";
  return `- ${node.id}「${title(node, place).slice(0, 60)}」${STATE_WORDS[node.state]}（${node.state}），负责：${owner.label}${latest}`;
}

/** The plan at a glance, as a round starts: every step with its holder, and the ones no one holds. */
export function summary(runtime: Runtime, board: SdkBoard, place: PlanPlace, session: string, alive?: (session: string) => boolean): string {
  const nodes = executionOrder(board, place), open = nodes.filter(node => !node.assignee && !ENDED.includes(node.state));
  // Read by the Host as the round starts, so it is newer than anything said earlier in the conversation: a person may
  // have reassigned, skipped or finished steps in between.
  return [`任务图现状（第 ${board.version} 版，宿主在这一轮开始时读取）。它比之前对话里提到的任务图状态更新：用户可能在两轮之间改派、跳过或完成了步骤。被问到谁在做哪一步、哪一步是什么状态时，以这里为准：`,
    ...nodes.map(node => stepLine(runtime, node, place, session, alive)),
    ...(open.length ? [`没人认领：${open.map(node => node.id).join("、")}`] : [])].join("\n");
}

/** The plan as the person and the Coding page see it: the plan's own ids, the plan's own version. */
export function shape(runtime: Runtime, board: SdkBoard, place: PlanPlace, session: string, alive?: (session: string) => boolean): AgentStepBoard {
  const missing = place.plan.steps.find(step => !board.nodes.some(node => node.id === fullId(place, step.id)));
  if (missing) throw new Error("原步骤图与确认计划不一致");
  const local = (id: string) => localId(place, id) ?? id;
  return { project_id: board.ref.id, version: planVersion(board, place), terminal: finished(board, place),
    nodes: executionOrder(board, place).map(node => ({ id: local(node.id), state: node.state,
      reports: node.reports.map(report => { const by = reportBy(runtime, report, session);
        return { note: reportNote(runtime, report, session), at_ms: report.atMs, ...(by ? { by } : {}), ...(report.handover ? { handover: true as const } : {}),
          ...(report.inputs?.length ? { inputs: inputRefs(report.inputs) } : {}) }; }),
      owner: claimOf(runtime, node, session, alive),
      title: title(node, place), depends_on: node.dependsOn.flatMap(dep => localId(place, dep) ?? []), ...(local(node.id).startsWith("user-") ? { inserted: true } : {}),
      ...(node.origins?.length ? { origins: inputRefs(node.origins) } : {}) })) };
}

/** The inputs a report is about, as the runtime recorded them (pointers only; the session owns the inputs). */
function inputRefs(refs: readonly { session: string; input: string }[]): AgentInputRef[] {
  return refs.map(ref => ({ session_id: ref.session, input_id: ref.input }));
}

/**
 * A person's change to the running plan, made only with SDK board operations: skipped and inserted steps, decisions and
 * moves are recorded as reports on the board, so the graph itself is the record. The person's version is the plan's
 * (what changed in other sessions' blocks does not stop them); each write gives the board's version as it is then, and
 * the SDK compares only the steps it touches (P2k).
 */
export async function amendPlan(runtime: Runtime, place: PlanPlace, amendment: AgentStepAmendment, expectedVersion: number, actor: string, roundSession: ExactRef<"session"> | undefined, ledger: RoundLedger): Promise<SdkBoard> {
  const ref = place.ref;
  let board = runtime.boards.get(ref);
  if (finished(board, place)) throw new Error("任务图已经结束，不能再调整；请调整计划后开始新一轮");
  if (planVersion(board, place) !== expectedVersion) throw new Error("任务图刚刚有更新，请刷新后再调整");
  const text = (value: string, label: string, max: number) => { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label}不能为空，且不超过 ${max} 字`); return trimmed; };
  const node = (id: string) => { const found = board.nodes.find(entry => entry.id === id) ?? board.nodes.find(entry => entry.id === fullId(place, id)); if (!found || !planStep(found, place)) throw new Error("找不到这个步骤"); return found; };
  const person = { kind: "human" as const, id: actor };
  // A person's decision stands over whoever holds the step, and is recorded as theirs.
  const report = async (nodeId: string, note: string, to?: TaskNode["state"]) => {
    board = await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId, by: undefined, human: person, override: true, note, atMs: Date.now(), ...(to ? { to } : {}) });
  };
  // Each change rewires only the steps it touches: a step still waiting behind a failure stays waiting until a
  // person decides about that failure, whatever else is changed around it.
  const rewire = async (nodeId: string, dependsOn: string[]) => {
    if (JSON.stringify(node(nodeId).dependsOn) === JSON.stringify(dependsOn)) return;
    board = await runtime.boards.rewire({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId, dependsOn });
  };
  // Only steps that have not started can be rewired; a finished or skipped step keeps the edges it ran with.
  const dependents = (id: string) => planNodes(board, place).filter(entry => entry.dependsOn.includes(id) && (entry.state === "not-started" || entry.state === "ready")).map(entry => entry.id);
  const replaced = (deps: readonly string[], from: string, to: readonly string[]) => [...new Set(deps.flatMap(dep => dep === from ? to : [dep]))];
  const order = executionOrder(board, place).map(entry => entry.id);
  const target = "node" in amendment ? node(amendment.node) : undefined;
  switch (amendment.kind) {
    case "skip": {
      const reason = text(amendment.reason, "跳过原因", 300);
      if (["running", "succeeded", "cancelled"].includes(target!.state)) throw new Error(target!.state === "running" ? "这一步正在执行，先暂停或等它回报后再跳过" : "这一步已经结束，不需要跳过");
      const after = dependents(target!.id);
      // A failed step is terminal and takes no further report; the decision is recorded on the step that now follows.
      if (target!.state === "failed") { if (after[0]) await report(after[0], `用户决定越过失败的「${title(target!, place)}」：${reason}`); else throw new Error("后面没有步骤，不需要越过"); }
      else await report(target!.id, `用户跳过：${reason}`, "cancelled");
      for (const id of after) await rewire(id, replaced(node(id).dependsOn, target!.id, target!.dependsOn));
      break;
    }
    case "insert": {
      const anchor = node(amendment.after);
      const heading = text(amendment.title, "步骤", 120), acceptance = text(amendment.acceptance, "完成条件", 300);
      const id = fullId(place, `user-${planNodes(board, place).filter(entry => localId(place, entry.id)!.startsWith("user-")).length + 1}`), after = dependents(anchor.id);
      // An inserted step is the round's to do, or the person's own when they take it on. One added for a supplement points
      // at it: the board records the pointer, the session keeps the input. The round's own ledger is read once more right
      // before the board takes the step, with no wait between, so one taken back in the meantime is refused and nothing
      // is written. The SDK queues the write behind any earlier one on the same board; taken back while it waits there
      // counts as taken back after: the step stays, and the receipt shows the input withdrawn.
      const holder = amendment.mine ? person : roundSession;
      if (amendment.origin !== undefined && !roundSession) throw new Error("这一轮没有会话记录，新步骤不能指向补充");
      const origins = amendment.origin === undefined ? {} : { origins: [{ session: roundSession!.id, input: amendment.origin }] };
      if (amendment.origin !== undefined) checkOrigin(amendment.origin, ledger());
      board = await runtime.boards.addNode({ ref, expectedVersion: runtime.boards.get(ref).version, node: { id, title: heading, parent: place.prefix, dependsOn: [anchor.id], onFailure: "block-for-human", ...(holder ? { assignee: holder } : {}), ...origins } });
      await report(id, `用户插入：${heading}；完成条件：${acceptance}${amendment.mine ? "；由用户处理" : ""}`);
      for (const next of after) await rewire(next, replaced(node(next).dependsOn, anchor.id, [id]));
      break;
    }
    case "unblock": {
      if (target!.state !== "blocked") throw new Error("这一步没有受阻");
      await report(target!.id, `用户决定：${text(amendment.note, "决定", 500)}`, "ready");
      break;
    }
    case "move": {
      // Moving a step down is moving the step after it up; both must not have started.
      const at = order.indexOf(target!.id), upper = amendment.direction === "up" ? order[at - 1] : target!.id, lower = amendment.direction === "up" ? target!.id : order[at + 1];
      if (!upper || !lower) throw new Error(amendment.direction === "up" ? "已经是第一步" : "已经是最后一步");
      const first = node(upper), second = node(lower);
      if (![first, second].every(entry => entry.state === "not-started" || entry.state === "ready")) throw new Error("只能调换还没开始的步骤");
      if (!second.dependsOn.includes(first.id)) throw new Error("这两步之间还有其他依赖，不能直接对调");
      const tail = dependents(second.id), base = [...first.dependsOn];
      await rewire(second.id, replaced(second.dependsOn, first.id, base));
      await rewire(first.id, [second.id]);
      for (const id of tail) await rewire(id, replaced(node(id).dependsOn, second.id, [first.id]));
      await report(target!.id, `用户把这一步${amendment.direction === "up" ? "提前" : "推后"}，与「${title(amendment.direction === "up" ? first : second, place)}」对调`);
      break;
    }
    case "assign": {
      if (ENDED.includes(target!.state)) throw new Error("这一步已经结束，不能改派");
      const to = amendment.to === "me" ? person : roundSession;
      if (!to) throw new Error("找不到这一轮的会话，不能交回");
      if (same(target!.assignee, to)) throw new Error(amendment.to === "me" ? "这一步已经由你处理" : "这一步已经在本会话名下");
      board = await runtime.boards.handOver({ ref, nodeId: target!.id, from: target!.assignee, to, note: amendment.to === "me" ? "用户改派给自己处理" : "用户交回本会话", atMs: Date.now(), human: person });
      break;
    }
    case "resolve": {
      const note = text(amendment.note, "结果说明", 500);
      if (!same(target!.assignee, person)) throw new Error("只有你认领的步骤才能由你标记结果");
      if (target!.state === "not-started") throw new Error("这一步的前置步骤还没完成");
      if (ENDED.includes(target!.state)) throw new Error("这一步已经结束");
      // The graph moves one state at a time: a blocked step becomes ready, a ready one running, then the result.
      if (target!.state === "blocked") await report(target!.id, "用户开始处理", "ready");
      if (node(target!.id).state === "ready") await report(target!.id, "用户开始处理", "running");
      await report(target!.id, `用户${amendment.state === "succeeded" ? "完成" : "标记失败"}：${note}`, amendment.state);
      break;
    }
  }
  return board;
}
