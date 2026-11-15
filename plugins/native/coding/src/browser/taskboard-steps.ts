import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { insertedAcceptance } from "../inserted-step.js";
import type { BoardProgressSummary, PlanEntry, StepNode } from "./shapes.js";

/** How the note of a step the person skipped starts (horizontal/agent-host words it when the skip is applied). */
const SKIPPED_NOTE_HEAD = "用户跳过";

/** A step the person skipped: cancelled, with their note on it. */
export function skipped(node: StepNode): boolean {
  return node.state === "cancelled" && !node.scope_removed && node.reports.some(report => report.note.startsWith(SKIPPED_NOTE_HEAD));
}

/** A step explicitly removed from scope: kept in history, excluded from story-point denominator. */
export function scopeRemoved(node: StepNode): boolean {
  return Boolean(node.scope_removed);
}

/** A step that is over for the plan's purposes: it succeeded without an unknown command outcome, was skipped, or was removed from scope. */
export function settled(node: StepNode): boolean {
  return (node.state === "succeeded" && !node.unknown_outcome) || skipped(node) || scopeRemoved(node);
}

/** How a step reads, the same on the board and on the plan card in the conversation: its title, what finishes it, and its plan estimate. */
export function stepOf(plan: PlanEntry["plan"], node: StepNode): {
  readonly title: string;
  readonly acceptance: string;
  readonly story_points?: number;
  readonly estimate_source?: "agent" | "human";
  readonly estimate_reason?: string;
} {
  if (node.inserted) return { title: node.title || node.id, acceptance: insertedAcceptance(node.reports) || "", ...(typeof node.story_points === "number" ? { story_points: node.story_points } : {}), ...(node.estimate_source ? { estimate_source: node.estimate_source } : {}), ...(node.estimate_reason ? { estimate_reason: node.estimate_reason } : {}) };
  return plan?.content.steps[Number(node.id.replace("step-", "")) - 1] || { title: node.title || node.id, acceptance: "" };
}

/** Story-point badge text & tooltip for one step (supports parent rollup over active leaves). */
export function stepPointsBadge(nodes: readonly StepNode[], node: StepNode, plan?: PlanEntry["plan"]): { readonly text: string; readonly title: string; readonly pending: boolean } {
  const children = nodes.filter(other => other.parent_id === node.id);
  const effectivePoints = (entry: StepNode): number | undefined => entry.story_points === null ? undefined : (entry.story_points ?? stepOf(plan, entry).story_points);
  if (children.length > 0) {
    const activeChildren = children.filter(other => !skipped(other) && !scopeRemoved(other));
    const estimated = activeChildren.filter(other => effectivePoints(other) !== undefined);
    const sum = estimated.reduce((acc, other) => acc + (effectivePoints(other) ?? 0), 0);
    if (sum > 0) {
      return { text: uiText.text("coding.board.points", { points: sum }), title: uiText.text("coding.board.points-rollup", { points: sum, count: activeChildren.length }), pending: false };
    }
    return { text: uiText.text("coding.board.points-pending"), title: uiText.text("coding.board.points-pending-hint"), pending: true };
  }
  const planStep = stepOf(plan, node);
  const pts = effectivePoints(node);
  if (pts === undefined) {
    return { text: uiText.text("coding.board.points-pending"), title: uiText.text("coding.board.points-pending-hint"), pending: true };
  }
  const src = (node.estimate_source ?? planStep.estimate_source) === "human" ? uiText.text("coding.board.points-by-user") : uiText.text("coding.board.points-by-agent");
  const reason = node.estimate_reason ?? planStep.estimate_reason;
  const parts = [src];
  if (reason) parts.push(reason);
  if (pts >= 13) parts.push(uiText.text("coding.board.split-hint"));
  if (node.progress !== undefined && node.progress > 0 && node.state !== "succeeded") {
    const pct = node.progress <= 1 ? Math.round(node.progress * 100) : Math.round(node.progress);
    parts.push(uiText.text("coding.board.progress-basis", { percent: pct, basis: node.progress_basis || "" }));
  }
  return { text: uiText.text("coding.board.points", { points: pts }), title: parts.join(" · "), pending: false };
}

/** Formats the weighted story-point progress summary of a board. */
export function formatBoardProgressSummary(summary: BoardProgressSummary | undefined, nodes?: readonly StepNode[]): string {
  if (!summary) return "";
  const activeLeaves = summary.estimated_leaves + summary.unestimated_leaves;
  if (activeLeaves === 0) {
    return [uiText.text("coding.board.summary.empty"), summary.removed_scope_points > 0 ? uiText.text("coding.board.summary.removed", { points: summary.removed_scope_points }) : ""].filter(Boolean).join(" · ");
  }
  if (summary.total_points === 0 || summary.weighted_percent === null) {
    return [uiText.text("coding.board.summary.unestimated"), summary.unestimated_leaves > 0 ? uiText.text("coding.board.summary.unestimated-more", { count: summary.unestimated_leaves }) : "", summary.removed_scope_points > 0 ? uiText.text("coding.board.summary.removed", { points: summary.removed_scope_points }) : ""].filter(Boolean).join(" · ");
  }
  const completed = Math.round(summary.completed_points * 10) / 10;
  const hasDiscounted = nodes
    ? nodes.some(node => !scopeRemoved(node) && !skipped(node) && node.progress !== undefined && node.progress > 0 && node.progress < 1 && node.state !== "succeeded")
    : !Number.isInteger(summary.completed_points);
  return [
    uiText.text("coding.board.summary.weighted", { percent: summary.weighted_percent, completed, total: summary.total_points }),
    hasDiscounted ? uiText.text("coding.board.summary.discounted") : "",
    summary.unestimated_leaves > 0 ? uiText.text("coding.board.summary.unestimated-more", { count: summary.unestimated_leaves }) : "",
    summary.removed_scope_points > 0 ? uiText.text("coding.board.summary.removed", { points: summary.removed_scope_points }) : "",
  ].filter(Boolean).join(" · ");
}
