import type { ProjectDecisionHistory, ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { GoalEventAgreementChange, GoalEventTrustedDecisionRecord, RecordGoalUserDecisionInput } from "../contract/goals.js";
import type { GovernanceEventDecisionApi } from "../contract/governance-collaboration.js";
import { decisionErrors } from "./errors.js";
import { GovernanceProvenance } from "./provenance.js";

export class GovernanceEventDecisions implements GovernanceEventDecisionApi {
  private readonly provenance = new GovernanceProvenance();

  constructor(private readonly current: (input: RecordGoalUserDecisionInput) => ProjectTrustedDecision,
    private readonly readOriginal: (projectId: string, decisionId: string) => ProjectDecisionHistory | null) {}

  record(input: RecordGoalUserDecisionInput): GoalEventTrustedDecisionRecord {
    const authority = this.provenance.validateEventDecisionAuthority(input.authority);
    const conclusion = input.conclusion?.trim();
    if (!conclusion) throw decisionErrors.conclusion_required("用户决定需要结论");
    const decision = this.current(input);
    if (decision.reference.owner.project_id !== input.project_id || decision.review.target.subject.kind !== "goal"
      || decision.review.target.subject.id !== input.goal_id || decision.actor_id !== authority.actor_id
      || decision.source.entry.source !== authority.authority_source) throw decisionErrors.untrusted_actor("本人决定不对应当前目标");
    return { decision_id: decision.decision_id, project_id: input.project_id, goal_id: input.goal_id,
      ...authority, request_id: input.request_id ?? null, selected_option_id: input.selected_option_id ?? null, conclusion,
      accepts_requirements: input.accepts_requirements === true, scope: {
        requirement_ids: unique(input.scope?.requirement_ids), event_ids: unique(input.scope?.event_ids),
        concern_ids: unique(input.scope?.concern_ids), action: input.scope?.action?.trim() || null,
      }, authorized_change: input.authorized_change ?? null, recorded_at: decision.decided_at };
  }

  read(projectId: string, decisionId: string): GoalEventTrustedDecisionRecord | null {
    const stored = this.readOriginal(projectId, decisionId);
    if (stored?.subject !== "event") return null;
    const row = stored.original;
    return {
      decision_id: stored.decision_id, project_id: stored.project_id, goal_id: String(row.goal_id),
      actor_id: String(row.actor_id), actor_kind: "user",
      authority_source: row.authority_source as GoalEventTrustedDecisionRecord["authority_source"],
      conversation_ref: String(row.conversation_ref), message_ref: String(row.message_ref),
      request_id: row.request_id === null ? null : String(row.request_id),
      selected_option_id: row.selected_option_id === null ? null : String(row.selected_option_id),
      conclusion: String(row.conclusion), accepts_requirements: row.accepts_requirements === 1,
      scope: JSON.parse(String(row.scope_json)) as GoalEventTrustedDecisionRecord["scope"],
      authorized_change: row.change_json === null ? null : JSON.parse(String(row.change_json)) as GoalEventAgreementChange,
      recorded_at: stored.recorded_at,
    };
  }
}

function unique(values?: string[]): string[] {
  return [...new Set((values ?? []).map(value => value.trim()).filter(Boolean))];
}
