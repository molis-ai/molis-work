import { createHash } from "node:crypto";
import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceQueryApi, GoalTreeProposalItemRecord, ProposalAffectedObject, ProposalObjectVersion } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

type ItemChange = Pick<GoalTreeProposalItemRecord, "kind" | "operation">;

/** Existing proposal versions composed from owner facts, not copied persistence. */
export class GoalTreeBaselineQuery {
  constructor(private readonly goals: Pick<GoalsQueryApi, "snapshot" | "policyBindingVersion">,
    private readonly governance: Pick<GovernanceQueryApi, "snapshot">) {}

  objectVersion(boardId: string, object: ProposalAffectedObject, item?: ItemChange): ProposalObjectVersion {
    if (object.object_type === "policy") {
      return { ...object, ...this.goals.policyBindingVersion(boardId, object.object_id, item ? "semantic-v1" : "legacy") };
    }
    // The original non-Policy path requires an existing Board even for Governance objects.
    const goalFacts = this.goals.snapshot(boardId);
    let current: unknown = null;
    switch (object.object_type) {
      case "goal": current = goalFacts.goals.find(goal => goal.goal_id === object.object_id) ?? null; break;
      case "relation": current = goalFacts.relations.find(relation => relation.relation_id === object.object_id) ?? null; break;
      case "risk": current = goalFacts.risks.find(risk => risk.risk_id === object.object_id) ?? null; break;
      case "candidate": current = this.governance.snapshot(boardId).candidates.find(candidate => candidate.candidate_id === object.object_id) ?? null; break;
      case "rewire": current = this.governance.snapshot(boardId).rewires.find(rewire => rewire.rewire_id === object.object_id) ?? null; break;
    }
    return { object_type: object.object_type, object_id: object.object_id, exists: current != null,
      version: current == null ? "absent" : item ? `semantic-v1:${requestHash(semanticObject(current, object, item))}` : requestHash(current) };
  }

  forBaseline(boardId: string, baseline: ProposalObjectVersion, item: ItemChange): ProposalObjectVersion {
    return this.objectVersion(boardId, baseline, baseline.version === "absent" || baseline.version.startsWith("semantic-v1:") ? item : undefined);
  }

  itemConflicts(boardId: string, item: GoalTreeProposalItemRecord) {
    return item.baseline_versions.flatMap(baseline => {
      const current = this.forBaseline(boardId, baseline, item);
      return baseline.exists === current.exists && baseline.version === current.version ? [] : [{
        object: { object_type: baseline.object_type, object_id: baseline.object_id }, baseline, current,
      }];
    });
  }
}

function semanticObject(current: unknown, object: ProposalAffectedObject, _item: ItemChange): unknown {
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
  if (object.object_type === "relation") {
    return {
      relation_id: record.relation_id,
      from_goal_id: record.from_goal_id,
      to_goal_id: record.to_goal_id,
      type: record.type,
      state: record.state,
    };
  }
  return Object.fromEntries(Object.entries(record).filter(([field]) => !["created_at", "updated_at", "decided_at", "deactivated_at"].includes(field)));
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
