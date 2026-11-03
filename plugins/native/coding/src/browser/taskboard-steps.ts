import { insertedAcceptance } from "../inserted-step.js";
import type { PlanEntry, StepNode } from "./shapes.js";

/** How the note of a step the person skipped starts (horizontal/agent-host words it when the skip is applied). */
const SKIPPED_NOTE_HEAD = "用户跳过";

/** A step the person skipped: cancelled, with their note on it. */
export function skipped(node: StepNode): boolean {
  return node.state === "cancelled" && node.reports.some(report => report.note.startsWith(SKIPPED_NOTE_HEAD));
}

/** A step that is over for the plan's purposes: it succeeded, or the person skipped it. */
export function settled(node: StepNode): boolean {
  return node.state === "succeeded" || skipped(node);
}

/** How a step reads, the same on the board and on the plan card in the conversation: its title and what finishes it. */
export function stepOf(plan: PlanEntry["plan"], node: StepNode): { readonly title: string; readonly acceptance: string } {
  if (node.inserted) return { title: node.title || node.id, acceptance: insertedAcceptance(node.reports) || "" };
  return plan?.content.steps[Number(node.id.replace("step-", "")) - 1] || { title: node.title || node.id, acceptance: "" };
}
