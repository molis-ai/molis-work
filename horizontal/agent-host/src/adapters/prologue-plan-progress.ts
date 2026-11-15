import type {
  AgentStepBoard,
  AgentStepProgressSummary,
  AgentStoryPoints,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { isValidFibonacciStoryPoints } from "../execution-plan.js";

export interface ReconciledStepEntry {
  action: "confirm-done" | "rerun";
  note: string;
  at_ms: number;
}

export type ReconciledStepMap = Record<string, ReconciledStepEntry>;

/**
 * Leaf-only Fibonacci story-point weighted progress (`Σ(sᵢ × pᵢ) / Σsᵢ`, CHO-29..33):
 * - Parent nodes (`id` referenced by any child's `parent_id`) never double-count on top of their children (CHO-31).
 * - Scope-removed leaves (`scope_removed`) leave the active denominator while keeping history (CHO-32),
 *   whereas unfinished or skipped steps stay in the denominator.
 * - Unestimated leaves are counted separately without inventing default story points, and `weighted_percent` is capped
 *   at `99` whenever any active leaf (estimated or unestimated) is not `succeeded` or still has `unknown_outcome` (CHO-33, BL-222).
 */
export function computeWeightedStepBoardProgress(
  nodes: ReadonlyArray<{
    readonly id: string;
    readonly state: AgentStepBoard["nodes"][number]["state"];
    readonly parent_id?: string;
    readonly story_points?: AgentStoryPoints | null;
    readonly progress?: number;
    readonly scope_removed?: boolean;
    readonly unknown_outcome?: boolean;
  }>,
): AgentStepProgressSummary {
  const parentIds = new Set<string>();
  for (const node of nodes) {
    if (node.parent_id) parentIds.add(node.parent_id);
  }
  let completedPointsRaw = 0;
  let totalPoints = 0;
  let estimatedLeaves = 0;
  let unestimatedLeaves = 0;
  let completedUnestimatedLeaves = 0;
  let removedScopeLeaves = 0;
  let removedScopePoints = 0;
  let anyActiveUnsucceeded = false;

  for (const node of nodes) {
    if (parentIds.has(node.id)) continue;
    if (node.scope_removed) {
      removedScopeLeaves += 1;
      if (isValidFibonacciStoryPoints(node.story_points)) removedScopePoints += node.story_points;
      continue;
    }
    const done = node.state === "succeeded" && !node.unknown_outcome;
    if (!done) anyActiveUnsucceeded = true;
    const leafProgress = done
      ? 1
      : typeof node.progress === "number" && Number.isFinite(node.progress)
        ? Math.min(0.99, Math.max(0, node.progress))
        : 0;
    if (isValidFibonacciStoryPoints(node.story_points)) {
      estimatedLeaves += 1;
      totalPoints += node.story_points;
      completedPointsRaw += node.story_points * leafProgress;
    } else {
      unestimatedLeaves += 1;
      if (done) completedUnestimatedLeaves += 1;
    }
  }

  const completedPoints = Math.round(completedPointsRaw * 100) / 100;
  const rawPercent = totalPoints === 0 ? null : Math.round((completedPointsRaw / totalPoints) * 1000) / 10;
  const weightedPercent = rawPercent === null
    ? null
    : anyActiveUnsucceeded
      ? (rawPercent >= 100 ? 99 : Math.max(0, rawPercent))
      : Math.min(100, Math.max(0, rawPercent));

  return {
    weighted_percent: weightedPercent,
    completed_points: completedPoints,
    total_points: totalPoints,
    estimated_leaves: estimatedLeaves,
    unestimated_leaves: unestimatedLeaves,
    completed_unestimated_leaves: completedUnestimatedLeaves,
    removed_scope_leaves: removedScopeLeaves,
    removed_scope_points: removedScopePoints,
  };
}

function isCommandWithUnknownOutcome(
  item: { readonly name: string; readonly state: string; readonly output?: string },
  runEnded: boolean,
): boolean {
  if (item.name !== "run-command" && item.name !== "start-command") return false;
  if (item.state === "unknown") return true;
  if (runEnded && item.state === "started") return true;
  if (item.state !== "completed") return false;
  return !/^exit (-?\d+|cancelled|timed-out)\b/.test(item.output ?? "");
}

/**
 * Project command receipts with unknown outcomes onto the step board (BL-222):
 * any step during which a command ended without a known exit code (`exit N`, `cancelled`, `timed-out`)
 * is marked `unknown_outcome: true` (unless reconciled afterward by `confirm-done`, or reset/rerun after `rerun`)
 * and excluded from step/point completion.
 */
export function applyUnknownCommandOutcomes(
  view: {
    readonly phase: string;
    readonly activity: ReadonlyArray<{ readonly name: string; readonly state: string; readonly output?: string; readonly at?: string | null }>;
  },
  stepBoard: AgentStepBoard,
  reconciledSteps?: ReconciledStepMap,
): AgentStepBoard {
  const runEnded = ["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes(view.phase);
  const unknownCmds = view.activity.filter(item => isCommandWithUnknownOutcome(item, runEnded));
  if (!unknownCmds.length && !stepBoard.nodes.some(node => node.unknown_outcome)) return stepBoard;

  const parentIds = new Set(stepBoard.nodes.flatMap(node => node.parent_id ? [node.parent_id] : []));
  const candidates = stepBoard.nodes.filter(node =>
    !parentIds.has(node.id)
    && !node.scope_removed
    && node.state !== "cancelled"
    && (!["not-started", "ready"].includes(node.state) || node.reports.length > 0));

  const flaggedIds = new Set<string>(stepBoard.nodes.filter(node => node.unknown_outcome).map(node => node.id));
  for (const cmd of unknownCmds) {
    if (!candidates.length) break;
    const cmdMs = cmd.at ? Date.parse(cmd.at) : Number.NaN;
    let target = candidates.find(node => node.state === "needs-reconciliation" || node.state === "running");
    if (Number.isFinite(cmdMs)) {
      const spanning = candidates.filter(node => {
        const times = node.reports.map(r => r.at_ms).filter(t => Number.isFinite(t));
        if (!times.length) return false;
        const first = Math.min(...times);
        const last = Math.max(...times);
        return cmdMs >= first - 50 && cmdMs <= last + 5_000;
      });
      if (spanning.length) target = spanning.at(-1);
      else {
        const startedBefore = candidates.filter(node => node.reports.some(r => r.at_ms <= cmdMs + 50));
        if (startedBefore.length) target = startedBefore.at(-1);
      }
    }
    target ??= candidates.filter(node => !["not-started", "ready", "cancelled"].includes(node.state)).at(-1) ?? candidates.at(-1);
    if (!target) continue;
    const confirmInReports = target.reports.some(r =>
      r.note.trim().startsWith("用户核对完成：") && (!Number.isFinite(cmdMs) || r.at_ms >= cmdMs));
    const confirmSaved = reconciledSteps?.[target.id]?.action === "confirm-done"
      && (!Number.isFinite(cmdMs) || reconciledSteps[target.id]!.at_ms >= cmdMs);
    const rerunTimes = target.reports
      .filter(r => r.note.trim().startsWith("用户决定重新执行：") && (!Number.isFinite(cmdMs) || r.at_ms >= cmdMs))
      .map(r => r.at_ms);
    const savedRerunAt = reconciledSteps?.[target.id]?.action === "rerun"
      && (!Number.isFinite(cmdMs) || reconciledSteps[target.id]!.at_ms >= cmdMs)
      ? reconciledSteps[target.id]!.at_ms
      : undefined;
    const latestRerunAt = Math.max(-Infinity, ...rerunTimes, ...(savedRerunAt !== undefined ? [savedRerunAt] : []));
    const rerunAccounted = Number.isFinite(latestRerunAt) && (
      target.state !== "succeeded"
      || target.reports.some(r => !r.note.trim().startsWith("用户决定重新执行：") && r.at_ms > latestRerunAt)
    );
    if (!confirmInReports && !confirmSaved && !rerunAccounted) {
      flaggedIds.add(target.id);
    }
  }

  if (!flaggedIds.size) return stepBoard;
  const nextNodes = stepBoard.nodes.map(node => flaggedIds.has(node.id)
    ? {
      ...node,
      unknown_outcome: true as const,
      ...(node.progress === 1 ? { progress: undefined } : {}),
    }
    : node);
  return {
    ...stepBoard,
    terminal: false,
    progress_summary: computeWeightedStepBoardProgress(nextNodes),
    nodes: nextNodes,
  };
}
