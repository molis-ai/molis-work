import type { ExactRef, Runtime } from "@prologue/sdk";
import type {
  AgentEstimateSource,
  AgentExecutionPlan,
  AgentRunRef,
  AgentStepAmendment,
  AgentStepBoard,
  AgentStepOwner,
  AgentStoryPoints,
  AgentTurnView,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputRef } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AgentCollaborationPort } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { isValidFibonacciStoryPoints } from "../execution-plan.js";
import { checkOrigin } from "../input-origin.js";
import {
  applyUnknownCommandOutcomes,
  computeWeightedStepBoardProgress,
  mergeReconciledSteps,
  type ReconciledStepEntry,
  type ReconciledStepMap,
} from "./prologue-plan-progress.js";

export { applyUnknownCommandOutcomes, computeWeightedStepBoardProgress, mergeReconciledSteps, type ReconciledStepEntry, type ReconciledStepMap };

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

const RERUN_LOCAL_RE = /^rerun--(.+)--(\d+)$/;
function parseRerunLocal(local: string | undefined): { stepKey: string; seq: number } | undefined {
  if (!local) return undefined;
  const match = RERUN_LOCAL_RE.exec(local);
  return match ? { stepKey: match[1]!, seq: Number(match[2]!) } : undefined;
}
function canonicalLocalId(place: PlanPlace, id: string): string | undefined {
  const local = localId(place, id);
  return parseRerunLocal(local)?.stepKey ?? local;
}
function isBasePlanLocal(local: string | undefined, place: PlanPlace): local is string {
  return local !== undefined && (place.plan.steps.some(step => step.id === local) || local.startsWith("user-"));
}

/** A plan step: one of the confirmed plan's, one a person inserted, or its rerun replacement, under this plan's prefix. */
function planStep(node: TaskNode, place: PlanPlace): boolean {
  return isBasePlanLocal(canonicalLocalId(place, node.id), place);
}
function stepChain(board: SdkBoard, place: PlanPlace, stepKey: string): TaskNode[] {
  const orig = board.nodes.find(node => node.id === fullId(place, stepKey));
  const reruns = board.nodes
    .flatMap(node => { const parsed = parseRerunLocal(localId(place, node.id)); return parsed?.stepKey === stepKey ? [{ node, seq: parsed.seq }] : []; })
    .sort((a, b) => a.seq - b.seq)
    .map(item => item.node);
  return orig ? [orig, ...reruns] : reruns;
}
function activePlanNodes(board: SdkBoard, place: PlanPlace): TaskNode[] {
  return board.nodes
    .filter(node => isBasePlanLocal(localId(place, node.id), place))
    .map(node => stepChain(board, place, localId(place, node.id)!).at(-1)!);
}
export function activeNodeId(board: SdkBoard, place: PlanPlace, stepKey: string): string {
  return stepChain(board, place, stepKey).at(-1)?.id ?? fullId(place, stepKey);
}
const planNodes = (board: SdkBoard, place: PlanPlace) => board.nodes.filter(node => planStep(node, place));

/** Every plan step has ended (epic containers without direct work settle when all their children settle). */
export function finished(
  board: SdkBoard,
  place: PlanPlace,
  reconciledSteps?: ReconciledStepMap,
  unknownStepIds?: ReadonlySet<string>,
): boolean {
  if (board.terminal) return true;
  const nodes = activePlanNodes(board, place);
  const byParent = new Map<string, TaskNode[]>();
  for (const node of nodes) {
    const pKey = node.parent && node.parent !== place.prefix ? canonicalLocalId(place, node.parent) : undefined;
    if (pKey) {
      const list = byParent.get(pKey) ?? [];
      list.push(node);
      byParent.set(pKey, list);
    }
  }
  const nodeDone = (node: TaskNode): boolean => {
    const stepKey = canonicalLocalId(place, node.id)!;
    if (unknownStepIds?.has(stepKey)) return false;
    const chain = stepChain(board, place, stepKey);
    const metrics = parseNodeMetrics(chain, place, reconciledSteps);
    if (metrics.unknown_outcome) return false;
    if (node.state === "succeeded" || node.state === "cancelled") return true;
    const children = byParent.get(stepKey);
    return Boolean(children?.length) && chain.every(item => item.reports.length === 0) && children!.every(nodeDone);
  };
  return nodes.every(nodeDone);
}

/** The plan's version: when one of its own steps last changed. What other sessions do on the board does not move it. */
function planVersion(board: SdkBoard, place: PlanPlace, reconciledSteps?: ReconciledStepMap): number {
  const reconciledMax = reconciledSteps ? Math.max(0, ...Object.values(reconciledSteps).map(entry => entry.at_ms)) : 0;
  return Math.max(reconciledMax, ...planNodes(board, place).map(node => node.changedAt ?? board.version));
}

/** The plan's own step title for a confirmed step, the person's title for an inserted one. */
function title(node: TaskNode, place: PlanPlace): string {
  return place.plan.steps.find(step => step.id === canonicalLocalId(place, node.id))?.title ?? node.title;
}

/** Dependencies first, the confirmed plan order (then insertion order) breaking ties. */
function executionOrder(board: SdkBoard, place: PlanPlace): TaskNode[] {
  const rank = (id: string) => {
    const canonical = canonicalLocalId(place, id);
    const index = place.plan.steps.findIndex(step => step.id === canonical);
    const baseFull = canonical ? fullId(place, canonical) : id;
    return index < 0 ? place.plan.steps.length + board.nodes.findIndex(node => node.id === baseFull) : index;
  };
  const active = activePlanNodes(board, place);
  const activeByCanonical = new Map(active.map(node => [canonicalLocalId(place, node.id)!, node.id]));
  const pending = new Map(active.map(node => [node.id, node])), ordered: TaskNode[] = [];
  while (pending.size) {
    // Among steps that are equally available, the live chain reads first and skipped steps trail it.
    const key = (node: TaskNode) => (node.state === "cancelled" ? 1_000_000 : 0) + rank(node.id);
    const depsReady = (node: TaskNode) => node.dependsOn.every(dep => {
      const depKey = canonicalLocalId(place, dep);
      if (!depKey || depKey === canonicalLocalId(place, node.id)) return true;
      return !pending.has(activeByCanonical.get(depKey) ?? dep);
    });
    const next = [...pending.values()].filter(depsReady).sort((a, b) => key(a) - key(b))[0]
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
export function stepLine(runtime: Runtime, node: TaskNode, place: PlanPlace, session: string, alive?: (session: string) => boolean, unknownStepIds?: ReadonlySet<string>): string {
  const last = node.reports.at(-1), owner = claimOf(runtime, node, session, alive);
  const by = last && reportBy(runtime, last, session)?.label;
  const latest = last ? `；最近：${by ? by + "：" : ""}${reportNote(runtime, last, session).slice(0, 120)}` : "";
  const canonical = canonicalLocalId(place, node.id);
  const unknown = Boolean(canonical && unknownStepIds?.has(canonical));
  const stateText = unknown ? `${STATE_WORDS["needs-reconciliation"]}（needs-reconciliation，命令结果未知待核对）` : `${STATE_WORDS[node.state]}（${node.state}）`;
  return `- ${node.id}「${title(node, place).slice(0, 60)}」${stateText}，负责：${owner.label}${latest}`;
}

/** The plan at a glance, as a round starts: every step with its holder, and the ones no one holds. */
export function summary(runtime: Runtime, board: SdkBoard, place: PlanPlace, session: string, alive?: (session: string) => boolean, unknownStepIds?: ReadonlySet<string>): string {
  const nodes = executionOrder(board, place);
  const open = nodes.filter(node => !node.assignee && (!ENDED.includes(node.state) || Boolean(unknownStepIds?.has(canonicalLocalId(place, node.id) ?? ""))));
  // Read by the Host as the round starts, so it is newer than anything said earlier in the conversation: a person may
  // have reassigned, skipped or finished steps in between.
  return [`任务图现状（第 ${board.version} 版，宿主在这一轮开始时读取）。它比之前对话里提到的任务图状态更新：用户可能在两轮之间改派、跳过或完成了步骤。被问到谁在做哪一步、哪一步是什么状态时，以这里为准：`,
    ...nodes.map(node => stepLine(runtime, node, place, session, alive, unknownStepIds)),
    ...(open.length ? [`没人认领：${open.map(node => node.id).join("、")}`] : [])].join("\n");
}

const HUMAN_ESTIMATE_RE = /^用户重估点数：(\d+) 点(?:（理由：(.+)）)?$/;
const HUMAN_CLEAR_ESTIMATE_RE = /^用户清除点数估算(?:（理由：(.+)）)?$/;
const INSERT_ESTIMATE_RE = /^用户插入：.+?（估算 (\d+) 点(?:，理由：([^）]+))?）/;
const AGENT_ESTIMATE_RE = /(?:^|[；;\n])\s*点数估算：(\d+)\s*点(?:（理由：([^）]+)）)?/;
const PROGRESS_UPDATE_RE = /(?:^|[；;\n])\s*进度(?:更新)?[（(](\d{1,3})%[)）]：(.+)$/;

interface ParsedNodeMetrics {
  parent_id?: string;
  story_points?: AgentStoryPoints | null;
  estimate_source?: AgentEstimateSource;
  estimate_reason?: string;
  progress?: number;
  progress_basis?: string;
  skipped?: true;
  scope_removed?: true;
  unknown_outcome?: true;
}

function isUnreplacedPreRerunSuccess(chain: readonly TaskNode[], saved: ReconciledStepEntry | undefined): boolean {
  if (saved?.action !== "rerun" || chain.length !== 1) return false;
  const activeNode = chain[0]!;
  if (activeNode.state !== "succeeded") return false;
  let lastRerunIdx = -1;
  for (let i = activeNode.reports.length - 1; i >= 0; i--) {
    if (activeNode.reports[i]!.note.trim().startsWith("用户决定重新执行：")) {
      lastRerunIdx = i;
      break;
    }
  }
  if (lastRerunIdx >= 0) return lastRerunIdx >= activeNode.reports.length - 1;
  return !activeNode.reports.some(r => r.atMs > saved.at_ms);
}

function parseNodeMetrics(
  chain: readonly TaskNode[],
  place: PlanPlace,
  reconciledSteps?: ReconciledStepMap,
  unknownStepIds?: ReadonlySet<string>,
): ParsedNodeMetrics {
  const origNode = chain[0]!, activeNode = chain.at(-1)!;
  const local = canonicalLocalId(place, origNode.id);
  const confirmed = local ? place.plan.steps.find(step => step.id === local) : undefined;
  const parentLocal = origNode.parent && origNode.parent !== place.prefix ? canonicalLocalId(place, origNode.parent) : undefined;
  const parentId = confirmed?.parent_id ?? parentLocal;
  let storyPoints: AgentStoryPoints | null | undefined = confirmed?.story_points;
  let estimateSource: AgentEstimateSource | undefined = confirmed?.estimate_source ?? (confirmed?.story_points != null ? "agent" : undefined);
  let estimateReason: string | undefined = confirmed?.estimate_reason;
  let reportedProgress: number | undefined;
  let progressBasis: string | undefined;
  let skipped = false;
  let scopeRemoved = false;
  let unknownOutcome = false;

  for (const chainNode of chain) {
    for (const entry of chainNode.reports) {
      const note = entry.note.trim();
      if (note.startsWith("用户跳过：")) skipped = true;
      if (note.startsWith("用户移出本轮范围：")) scopeRemoved = true;
      if (note.startsWith("命令结果未知：") || note.startsWith("结果未知，待核对")) unknownOutcome = true;
      if (note.startsWith("用户核对完成：")) unknownOutcome = false;
      if (note.startsWith("用户决定重新执行：")) { unknownOutcome = false; reportedProgress = undefined; progressBasis = undefined; }
      const humanEst = HUMAN_ESTIMATE_RE.exec(note);
      if (humanEst) {
        const candidate = Number(humanEst[1]);
        if (isValidFibonacciStoryPoints(candidate)) {
          storyPoints = candidate;
          estimateSource = "human";
          estimateReason = humanEst[2]?.trim() || undefined;
        }
        continue;
      }
      const humanClear = HUMAN_CLEAR_ESTIMATE_RE.exec(note);
      if (humanClear) {
        storyPoints = null;
        estimateSource = "human";
        estimateReason = humanClear[1]?.trim() || undefined;
        continue;
      }
      const insertedEst = INSERT_ESTIMATE_RE.exec(note);
      if (insertedEst) {
        const candidate = Number(insertedEst[1]);
        if (isValidFibonacciStoryPoints(candidate)) {
          storyPoints = candidate;
          estimateSource = "human";
          estimateReason = insertedEst[2]?.trim() || estimateReason;
        }
      }
      if (estimateSource !== "human") {
        const agentEst = AGENT_ESTIMATE_RE.exec(note);
        if (agentEst) {
          const candidate = Number(agentEst[1]);
          if (isValidFibonacciStoryPoints(candidate)) {
            storyPoints = candidate;
            estimateSource = "agent";
            estimateReason = agentEst[2]?.trim() || estimateReason;
          }
        }
      }
      const progressMatch = PROGRESS_UPDATE_RE.exec(note);
      if (progressMatch) {
        const pct = Number(progressMatch[1]);
        if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
          reportedProgress = Math.min(0.99, Math.max(0, pct / 100));
          progressBasis = progressMatch[2]?.trim() || undefined;
        }
      }
    }
  }

  const saved = local ? reconciledSteps?.[local] : undefined;
  if (saved?.action === "confirm-done") unknownOutcome = false;
  else if (isUnreplacedPreRerunSuccess(chain, saved)) unknownOutcome = true;
  if (local && unknownStepIds?.has(local)) unknownOutcome = true;
  if (activeNode.state === "needs-reconciliation") unknownOutcome = true;
  const effectiveProgress = activeNode.state === "succeeded" && !unknownOutcome ? 1 : reportedProgress;
  return {
    ...(parentId ? { parent_id: parentId } : {}),
    ...(storyPoints !== undefined ? { story_points: storyPoints } : {}),
    ...(estimateSource ? { estimate_source: estimateSource } : {}),
    ...(estimateReason ? { estimate_reason: estimateReason } : {}),
    ...(effectiveProgress !== undefined ? { progress: effectiveProgress } : {}),
    ...(progressBasis ? { progress_basis: progressBasis } : {}),
    ...(skipped ? { skipped: true as const } : {}),
    ...(scopeRemoved ? { scope_removed: true as const } : {}),
    ...(unknownOutcome ? { unknown_outcome: true as const } : {}),
  };
}

/** The plan as the person and the Coding page see it: the plan's own ids, the plan's own version. */
export function shape(
  runtime: Runtime,
  board: SdkBoard,
  place: PlanPlace,
  session: string,
  alive?: (session: string) => boolean,
  reconciledSteps?: ReconciledStepMap,
  unknownStepIds?: ReadonlySet<string>,
): AgentStepBoard {
  const missing = place.plan.steps.find(step => !board.nodes.some(node => node.id === fullId(place, step.id)));
  if (missing) throw new Error("原步骤图与确认计划不一致");
  const shapedNodes = executionOrder(board, place).map(activeNode => {
    const id = canonicalLocalId(place, activeNode.id) ?? activeNode.id;
    const chain = stepChain(board, place, id);
    const origNode = chain[0] ?? activeNode;
    const metrics = parseNodeMetrics(chain, place, reconciledSteps, unknownStepIds);
    const baseReports = chain.flatMap(entry => entry.reports).map(report => {
      const by = reportBy(runtime, report, session);
      return {
        note: reportNote(runtime, report, session),
        at_ms: report.atMs,
        ...(by ? { by } : {}),
        ...(report.handover ? { handover: true as const } : {}),
        ...(report.inputs?.length ? { inputs: inputRefs(report.inputs) } : {}),
      };
    });
    const savedRec = reconciledSteps?.[id];
    const unreplacedSucceededRerun = isUnreplacedPreRerunSuccess(chain, savedRec);
    const hasRecReport = baseReports.some(r =>
      (r.note.trim().startsWith("用户核对完成：") || r.note.trim().startsWith("用户决定重新执行："))
      && (!savedRec || r.at_ms >= savedRec.at_ms - 1000));
    const reports = savedRec && !hasRecReport && !unreplacedSucceededRerun
      ? [
        ...baseReports,
        {
          note: savedRec.action === "confirm-done" ? `用户核对完成：${savedRec.note}` : `用户决定重新执行：${savedRec.note}`,
          at_ms: savedRec.at_ms,
          by: { kind: "person" as const, label: "用户" },
        },
      ]
      : baseReports;
    return {
      id,
      state: activeNode.state,
      reports,
      owner: claimOf(runtime, activeNode, session, alive),
      title: title(activeNode, place),
      depends_on: [...new Set(activeNode.dependsOn.flatMap(dep => { const c = canonicalLocalId(place, dep); return c && c !== id ? [c] : []; }))],
      ...(id.startsWith("user-") ? { inserted: true } : {}),
      ...(origNode.origins?.length ? { origins: inputRefs(origNode.origins) } : {}),
      ...metrics,
    };
  });
  return {
    project_id: board.ref.id,
    version: planVersion(board, place, reconciledSteps),
    terminal: finished(board, place, reconciledSteps, unknownStepIds),
    progress_summary: computeWeightedStepBoardProgress(shapedNodes),
    nodes: shapedNodes,
  };
}

/** The inputs a report is about, as the runtime recorded them (pointers only; the session owns the inputs). */
function inputRefs(refs: readonly { session: string; input: string }[]): AgentInputRef[] {
  return refs.map(ref => ({ session_id: ref.session, input_id: ref.input }));
}

async function reconcileAmendedStep(options: {
  runtime: Runtime;
  place: PlanPlace;
  target: TaskNode;
  action: "confirm-done" | "rerun";
  note: string;
  expectedVersion: number;
  person: { kind: "human"; id: string };
  roundSession?: ExactRef<"session">;
  dependents: (id: string) => string[];
  exactNode: (id: string) => TaskNode;
  replaced: (deps: readonly string[], from: string, to: readonly string[]) => string[];
  report: (nodeId: string, note: string, to?: TaskNode["state"]) => Promise<void>;
  rewire: (nodeId: string, dependsOn: string[]) => Promise<void>;
  setBoard: (next: SdkBoard) => void;
  onReconcile?: (stepId: string, entry: { action: "confirm-done" | "rerun"; note: string; at_ms: number }) => Promise<void>;
}): Promise<void> {
  const { runtime, place, target, action, note, expectedVersion, person, roundSession, dependents, exactNode, replaced, report, rewire, setBoard, onReconcile } = options;
  const ref = place.ref;
  const stepKey = canonicalLocalId(place, target.id) ?? target.id;
  const nowMs = Math.max(Date.now(), expectedVersion + 1);
  if (action === "confirm-done") {
    if (target.state === "cancelled" || target.state === "not-started") {
      throw new Error("这一步还未执行或已跳过，不能核对为已完成");
    }
    if (target.state === "failed") {
      setBoard(await runtime.boards.retry({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: target.id, note: "用户开始核对", atMs: nowMs, human: person }));
    } else if (target.state === "needs-reconciliation" || target.state === "blocked" || target.state === "waiting") {
      await report(target.id, "用户开始核对", "ready");
    }
    if (exactNode(target.id).state === "ready") await report(target.id, "用户核对中", "running");
    if (exactNode(target.id).state === "running") await report(target.id, `用户核对完成：${note}`, "succeeded");
    await onReconcile?.(stepKey, { action: "confirm-done", note, at_ms: nowMs });
    return;
  }
  if (target.state === "cancelled") throw new Error("已跳过的步骤不能直接重新执行");
  if (target.state === "succeeded") {
    const seq = stepChain(runtime.boards.get(ref), place, stepKey).length;
    const rerunId = fullId(place, `rerun--${stepKey}--${seq}`);
    const after = dependents(target.id);
    const holder = target.assignee?.kind === "human" ? target.assignee : (roundSession ?? target.assignee);
    setBoard(await runtime.boards.addNode({
      ref,
      expectedVersion: runtime.boards.get(ref).version,
      node: {
        id: rerunId,
        title: title(target, place),
        parent: target.parent ?? place.prefix,
        dependsOn: [target.id],
        onFailure: "block-for-human",
        ...(holder ? { assignee: holder } : {}),
      },
    }));
    await report(rerunId, `用户决定重新执行：${note}`);
    for (const nextId of after) await rewire(nextId, replaced(exactNode(nextId).dependsOn, target.id, [rerunId]));
  } else if (target.state === "failed") {
    setBoard(await runtime.boards.retry({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: target.id, note: `用户决定重新执行：${note}`, atMs: nowMs, human: person }));
  } else if (target.state === "running") {
    await report(target.id, "标记待重新执行", "needs-reconciliation");
    await report(target.id, `用户决定重新执行：${note}`, "ready");
  } else if (target.state === "needs-reconciliation" || target.state === "blocked" || target.state === "waiting") {
    await report(target.id, `用户决定重新执行：${note}`, "ready");
  } else {
    await report(target.id, `用户决定重新执行：${note}`);
  }
  await onReconcile?.(stepKey, { action: "rerun", note, at_ms: nowMs });
}

async function removeStepFromScope(options: {
  runtime: Runtime;
  ref: ExactRef<"task-board">;
  target: TaskNode;
  reason: string;
  person: { kind: "human"; id: string };
  dependents: (id: string) => string[];
  node: (id: string) => TaskNode;
  replaced: (deps: readonly string[], from: string, to: readonly string[]) => string[];
  report: (nodeId: string, note: string, to?: TaskNode["state"]) => Promise<void>;
  rewire: (nodeId: string, dependsOn: string[]) => Promise<void>;
  setBoard: (next: SdkBoard) => void;
}): Promise<void> {
  const { runtime, ref, target, reason, person, dependents, node, replaced, report, rewire, setBoard } = options;
  if (["running", "succeeded", "cancelled"].includes(target.state)) {
    throw new Error(target.state === "running" ? "这一步正在执行，先暂停或等它回报后再移出范围" : "这一步已经结束，不需要移出范围");
  }
  const after = dependents(target.id);
  if (target.state === "failed") {
    setBoard(await runtime.boards.retry({
      ref,
      expectedVersion: runtime.boards.get(ref).version,
      nodeId: target.id,
      note: `用户移出本轮范围（原为失败步骤）：${reason}`,
      atMs: Date.now(),
      human: person,
    }));
  }
  await report(target.id, `用户移出本轮范围：${reason}`, "cancelled");
  for (const id of after) await rewire(id, replaced(node(id).dependsOn, target.id, target.dependsOn));
}

/**
 * A person's change to the running plan, made only with SDK board operations: skipped and inserted steps, decisions and
 * moves are recorded as reports on the board, so the graph itself is the record. The person's version is the plan's
 * (what changed in other sessions' blocks does not stop them); each write gives the board's version as it is then, and
 * the SDK compares only the steps it touches (P2k).
 */
export async function amendPlan(
  runtime: Runtime,
  place: PlanPlace,
  amendment: AgentStepAmendment,
  expectedVersion: number,
  actor: string,
  roundSession: ExactRef<"session"> | undefined,
  ledger: RoundLedger,
  reconciledSteps?: ReconciledStepMap,
  onReconcile?: (stepId: string, entry: { action: "confirm-done" | "rerun"; note: string; at_ms: number }) => Promise<void>,
  unknownStepIds?: ReadonlySet<string>,
): Promise<SdkBoard> {
  const ref = place.ref;
  let board = runtime.boards.get(ref);
  if (amendment.kind !== "reconcile" && finished(board, place, reconciledSteps, unknownStepIds)) {
    throw new Error("任务图已经结束，不能再调整；请调整计划后开始新一轮");
  }
  if (planVersion(board, place, reconciledSteps) !== expectedVersion) throw new Error("任务图刚刚有更新，请刷新后再调整");
  const text = (value: string, label: string, max: number) => { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label}不能为空，且不超过 ${max} 字`); return trimmed; };
  const exactNode = (id: string) => { const found = board.nodes.find(entry => entry.id === id); if (!found || !planStep(found, place)) throw new Error("找不到这个步骤"); return found; };
  const node = (id: string) => {
    const exact = board.nodes.find(entry => entry.id === id);
    if (exact && planStep(exact, place)) return stepChain(board, place, canonicalLocalId(place, exact.id)!).at(-1)!;
    const canonical = isBasePlanLocal(id, place) ? id : canonicalLocalId(place, id);
    const active = canonical ? stepChain(board, place, canonical).at(-1) : undefined;
    if (!active) throw new Error("找不到这个步骤");
    return active;
  };
  const person = { kind: "human" as const, id: actor };
  // A person's decision stands over whoever holds the step, and is recorded as theirs.
  const report = async (nodeId: string, note: string, to?: TaskNode["state"]) => {
    board = await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId, by: undefined, human: person, override: true, note, atMs: Date.now(), ...(to ? { to } : {}) });
  };
  // Each change rewires only the steps it touches: a step still waiting behind a failure stays waiting until a
  // person decides about that failure, whatever else is changed around it.
  const rewire = async (nodeId: string, dependsOn: string[]) => {
    if (JSON.stringify(exactNode(nodeId).dependsOn) === JSON.stringify(dependsOn)) return;
    board = await runtime.boards.rewire({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId, dependsOn });
  };
  // Only steps that have not started can be rewired; a finished or skipped step keeps the edges it ran with.
  const dependents = (id: string) => activePlanNodes(board, place).filter(entry => entry.dependsOn.includes(id) && (entry.state === "not-started" || entry.state === "ready")).map(entry => entry.id);
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
      if (amendment.story_points !== undefined && !isValidFibonacciStoryPoints(amendment.story_points)) {
        throw new Error("故事点只能选择正整数斐波那契档位（1、2、3、5、8、13、21、34……）");
      }
      const parentNode = amendment.parent_id ? node(amendment.parent_id).id : (anchor.parent ?? place.prefix);
      const id = fullId(place, `user-${activePlanNodes(board, place).filter(entry => canonicalLocalId(place, entry.id)!.startsWith("user-")).length + 1}`), after = dependents(anchor.id);
      const holder = amendment.mine ? person : roundSession;
      if (amendment.origin !== undefined && !roundSession) throw new Error("这一轮没有会话记录，新步骤不能指向补充");
      const origins = amendment.origin === undefined ? {} : { origins: [{ session: roundSession!.id, input: amendment.origin }] };
      if (amendment.origin !== undefined) checkOrigin(amendment.origin, ledger());
      board = await runtime.boards.addNode({ ref, expectedVersion: runtime.boards.get(ref).version, node: { id, title: heading, parent: parentNode, dependsOn: [anchor.id], onFailure: "block-for-human", ...(holder ? { assignee: holder } : {}), ...origins } });
      const estReason = amendment.estimate_reason?.trim() ? `，理由：${text(amendment.estimate_reason, "估算依据", 300)}` : "";
      const pointsSuffix = amendment.story_points !== undefined ? `（估算 ${amendment.story_points} 点${estReason}）` : "";
      await report(id, `用户插入：${heading}${pointsSuffix}；完成条件：${acceptance}${amendment.mine ? "；由用户处理" : ""}`);
      for (const next of after) await rewire(next, replaced(node(next).dependsOn, anchor.id, [id]));
      break;
    }
    case "estimate": {
      if (amendment.story_points !== null && !isValidFibonacciStoryPoints(amendment.story_points)) {
        throw new Error("故事点只能选择正整数斐波那契档位（1、2、3、5、8、13、21、34……）或清空未估点");
      }
      const reason = amendment.reason?.trim() ? `（理由：${text(amendment.reason, "调整理由", 300)}）` : "";
      await report(target!.id, amendment.story_points === null ? `用户清除点数估算${reason}` : `用户重估点数：${amendment.story_points} 点${reason}`);
      break;
    }
    case "progress": {
      if (typeof amendment.progress !== "number" || !Number.isFinite(amendment.progress) || amendment.progress < 0 || amendment.progress > 1) {
        throw new Error("步骤进度必须在 0 到 1 之间");
      }
      if (ENDED.includes(target!.state)) throw new Error("这一步已经结束，不能再更新中间进度");
      const basis = text(amendment.basis, "进度依据", 300);
      const pct = Math.min(99, Math.max(0, Math.round(amendment.progress * 100)));
      await report(target!.id, `进度更新（${pct}%）：${basis}`);
      break;
    }
    case "remove-scope": {
      await removeStepFromScope({ runtime, ref, target: target!, reason: text(amendment.reason, "移出范围原因", 300), person, dependents, node: exactNode, replaced, report, rewire, setBoard: next => { board = next; } });
      break;
    }
    case "reconcile": {
      await reconcileAmendedStep({ runtime, place, target: target!, action: amendment.action, note: text(amendment.note, "核对说明", 500), expectedVersion, person, roundSession, dependents, exactNode, replaced, report, rewire, setBoard: next => { board = next; }, onReconcile });
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
