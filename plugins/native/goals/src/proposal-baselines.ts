import { createHash } from "node:crypto";
import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalItemRecord, ProposalAffectedObject, ProposalObjectVersion } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

/** A proposal's baselines: the facts of the Goals and relations it touches, compared by what matters to the proposal. */
export class GoalTreeBaselineQuery {
  constructor(private readonly goals: Pick<GoalsQueryApi, "snapshot">) {}

  objectVersion(boardId: string, object: ProposalAffectedObject): ProposalObjectVersion {
    const goalFacts = this.goals.snapshot(boardId);
    const current = object.object_type === "goal"
      ? goalFacts.goals.find(goal => goal.goal_id === object.object_id) ?? null
      : goalFacts.relations.find(relation => relation.relation_id === object.object_id) ?? null;
    return { object_type: object.object_type, object_id: object.object_id, exists: current != null,
      version: current == null ? "absent" : `semantic-v1:${requestHash(semanticObject(current, object))}` };
  }

  itemConflicts(boardId: string, item: GoalTreeProposalItemRecord) {
    return item.baseline_versions.flatMap(baseline => {
      const current = this.objectVersion(boardId, baseline);
      return baseline.exists === current.exists && baseline.version === current.version ? [] : [{
        object: { object_type: baseline.object_type, object_id: baseline.object_id }, baseline, current,
      }];
    });
  }
}

function semanticObject(current: unknown, object: ProposalAffectedObject): unknown {
  if (!current || typeof current !== "object" || Array.isArray(current)) return current;
  const record = current as Record<string, unknown>;
  if (object.object_type === "goal") {
    return {
      goal_id: record.goal_id,
      board_id: record.board_id,
      trashed_at: record.trashed_at,
      archived_at: record.archived_at,
    };
  }
  return {
    relation_id: record.relation_id,
    from_goal_id: record.from_goal_id,
    to_goal_id: record.to_goal_id,
    type: record.type,
    state: record.state,
  };
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}
