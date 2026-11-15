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

/** A step that is over for the plan's purposes: it succeeded, was skipped, or was removed from scope. */
export function settled(node: StepNode): boolean {
  return node.state === "succeeded" || skipped(node) || scopeRemoved(node);
}

/** How a step reads, the same on the board and on the plan card in the conversation: its title, what finishes it, and its plan estimate. */
export function stepOf(plan: PlanEntry["plan"], node: StepNode): {
  readonly title: string;
  readonly acceptance: string;
  readonly story_points?: number;
  readonly estimate_source?: "agent" | "human";
  readonly estimate_reason?: string;
} {
  if (node.inserted) return { title: node.title || node.id, acceptance: insertedAcceptance(node.reports) || "", ...(node.story_points !== undefined ? { story_points: node.story_points } : {}), ...(node.estimate_source ? { estimate_source: node.estimate_source } : {}), ...(node.estimate_reason ? { estimate_reason: node.estimate_reason } : {}) };
  return plan?.content.steps[Number(node.id.replace("step-", "")) - 1] || { title: node.title || node.id, acceptance: "" };
}

/** Story-point badge text & tooltip for one step (supports parent rollup over active leaves). */
export function stepPointsBadge(nodes: readonly StepNode[], node: StepNode, plan?: PlanEntry["plan"]): { readonly text: string; readonly title: string; readonly pending: boolean } {
  const children = nodes.filter(other => other.parent_id === node.id);
  if (children.length > 0) {
    const activeChildren = children.filter(other => !skipped(other) && !scopeRemoved(other));
    const estimated = activeChildren.filter(other => (other.story_points ?? stepOf(plan, other).story_points) !== undefined);
    const sum = estimated.reduce((acc, other) => acc + (other.story_points ?? stepOf(plan, other).story_points ?? 0), 0);
    if (sum > 0) {
      return { text: uiText.text("coding.board.points", { points: sum }), title: uiText.text("coding.board.points-rollup", { points: sum, count: activeChildren.length }), pending: false };
    }
    return { text: uiText.text("coding.board.points-pending"), title: uiText.text("coding.board.points-pending-hint"), pending: true };
  }
  const planStep = stepOf(plan, node);
  const pts = node.story_points ?? planStep.story_points;
  if (pts === undefined) {
    return { text: uiText.text("coding.board.points-pending"), title: uiText.text("coding.board.points-pending-hint"), pending: true };
  }
  const src = (node.estimate_source ?? planStep.estimate_source) === "human" ? uiText.text("coding.board.points-by-user") : uiText.text("coding.board.points-by-agent");
  const reason = node.estimate_reason ?? planStep.estimate_reason;
  const parts = [src];
  if (reason) parts.push(reason);
  if (pts >= 13) parts.push(uiText.text("coding.board.split-hint"));
  if (node.progress !== undefined && node.progress > 0 && node.state !== "succeeded") {
    parts.push(uiText.text("coding.board.progress-basis", { percent: node.progress, basis: node.progress_basis || "" }));
  }
  return { text: uiText.text("coding.board.points", { points: pts }), title: parts.join(" · "), pending: false };
}

/** Formats the weighted story-point progress summary of a board. */
export function formatBoardProgressSummary(summary: BoardProgressSummary | undefined): string {
  if (!summary) return "";
  if (summary.active_count === 0) {
    return [uiText.text("coding.board.summary.empty"), summary.removed_points > 0 ? uiText.text("coding.board.summary.removed", { points: summary.removed_points }) : ""].filter(Boolean).join(" · ");
  }
  if (summary.total_points === 0) {
    return [uiText.text("coding.board.summary.unestimated"), summary.unestimated_count > 0 ? uiText.text("coding.board.summary.unestimated-more", { count: summary.unestimated_count }) : "", summary.removed_points > 0 ? uiText.text("coding.board.summary.removed", { points: summary.removed_points }) : ""].filter(Boolean).join(" · ");
  }
  const completed = Math.round(summary.discounted_points * 10) / 10;
  return [
    uiText.text("coding.board.summary.weighted", { percent: summary.weighted_percent ?? 0, completed, total: summary.total_points }),
    summary.has_discounted_progress ? uiText.text("coding.board.summary.discounted") : "",
    summary.unestimated_count > 0 ? uiText.text("coding.board.summary.unestimated-more", { count: summary.unestimated_count }) : "",
    summary.removed_points > 0 ? uiText.text("coding.board.summary.removed", { points: summary.removed_points }) : "",
  ].filter(Boolean).join(" · ");
}
