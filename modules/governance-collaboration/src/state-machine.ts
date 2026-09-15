import type {
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

import { GovernanceError } from "./errors.js";

type GovernanceState =
  | GoalTreeProposalRecord["state"]
  | GoalTreeProposalItemRecord["state"];

const transitions: Record<string, Record<string, readonly string[]>> = {
  goal_tree_proposal: {
    pending: ["pending", "partially_applied", "approved", "rejected", "superseded", "closed"],
    partially_applied: ["partially_applied", "approved", "rejected", "superseded", "closed"],
    approved: ["approved", "closed"],
    rejected: ["rejected", "closed"],
    superseded: ["superseded"],
    dismissed: ["dismissed", "closed"],
    closed: ["closed"],
  },
  goal_tree_item: {
    pending: ["pending", "conflict", "approved", "applied", "rejected", "dismissed", "superseded"],
    conflict: ["conflict", "pending", "approved", "applied", "rejected", "dismissed", "superseded"],
    approved: ["approved", "applied", "rejected", "superseded"],
    applied: ["applied"],
    rejected: ["rejected"],
    dismissed: ["dismissed"],
    superseded: ["superseded"],
  },
};

export function assertGovernanceTransition(
  kind: keyof typeof transitions,
  from: GovernanceState,
  to: GovernanceState,
): void {
  if (transitions[kind][from]?.includes(to)) return;
  throw new GovernanceError(
    "governance.transition_invalid",
    `不允许把 ${kind} 从 ${from} 改成 ${to}`,
    { kind, from, to },
  );
}

export function deriveGoalTreeProposalState(
  items: Pick<GoalTreeProposalItemRecord, "state">[],
): GoalTreeProposalRecord["state"] {
  const states = items.map((item) => item.state);
  const hasOpen = states.some((state) => state === "pending" || state === "conflict");
  const hasApplied = states.includes("applied");
  const hasRejected = states.includes("rejected");
  const hasSuperseded = states.includes("superseded");
  if (hasOpen) return hasApplied || hasRejected || hasSuperseded ? "partially_applied" : "pending";
  if (states.length > 0 && states.every((state) => state === "applied")) return "approved";
  if (states.length > 0 && states.every((state) => state === "rejected")) return "rejected";
  if (states.length > 0 && states.every((state) => state === "superseded")) return "superseded";
  return "closed";
}
