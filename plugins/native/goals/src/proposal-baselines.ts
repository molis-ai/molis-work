import type { GoalsQueryApi } from "./contract/goals.js";
import { requestHash } from "./module/command-support.js";
import type { GoalTreeProposalItemRecord, ProposalAffectedObject, ProposalObjectVersion } from "./contract/governance-collaboration.js";

/** A proposal's baselines: the facts of the Goals and relations it touches, compared by what matters to the proposal. */
export class GoalTreeBaselineQuery {
  constructor(private readonly goals: Pick<GoalsQueryApi, "snapshot">) {}

  objectVersion(projectId: string, object: ProposalAffectedObject): ProposalObjectVersion {
    const goalFacts = this.goals.snapshot(projectId);
    const current = object.object_type === "goal"
      ? goalFacts.goals.find(goal => goal.goal_id === object.object_id) ?? null
      : goalFacts.relations.find(relation => relation.relation_id === object.object_id) ?? null;
    return { object_type: object.object_type, object_id: object.object_id, exists: current != null,
      version: current == null ? "absent" : `semantic-v1:${requestHash(semanticObject(current, object))}` };
  }

  itemConflicts(projectId: string, item: GoalTreeProposalItemRecord) {
    return item.baseline_versions.flatMap(baseline => {
      const current = this.objectVersion(projectId, baseline);
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
      project_id: record.project_id,
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
