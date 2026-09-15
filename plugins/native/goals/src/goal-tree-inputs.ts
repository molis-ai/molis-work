import { goalRelationTypes, type CreateGoalInput, type GoalRecord, type GoalRelationRecord, type GoalsCommandApi, type GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalItemRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

type GoalTreeProposalItemShape = Pick<GoalTreeProposalItemRecord, "item_id" | "kind" | "operation" | "payload">;
const GOAL_RELATION_TYPES = new Set<GoalRelationRecord["type"]>(goalRelationTypes);

/** Parse existing Proposal payloads and compose the owner's input validation. */
type NormalizedProposedRelation = Record<string, unknown> & {
  from_goal_id: string;
  to_goal_id: string;
  type: string;
  reason: string;
};

export class GoalTreeInputReader {
  normalizeProposedRelations(
    relations: Array<Record<string, unknown>>,
    allowNewGoalDefault = false,
  ): NormalizedProposedRelation[] {
    const validBases = new Set([
      "contract_output",
      "code_reference",
      "test_dependency",
      "business_sequence",
      "impact_conflict",
      "risk_policy",
    ]);
    return relations.map((relation) => {
      const type = String(relation.type ?? "").trim();
      const normalized: NormalizedProposedRelation = {
        ...relation,
        from_goal_id: String(
          relation.from_goal_id ?? (allowNewGoalDefault ? "$new_goal" : ""),
        ).trim(),
        to_goal_id: String(relation.to_goal_id ?? "").trim(),
        type,
        reason: String(relation.reason ?? "").trim(),
      };
      if (type !== "depends_on") return normalized;

      const action = String(relation.action ?? "add");
      const basis = String(relation.basis ?? "");
      const evidenceRefs = Array.isArray(relation.evidence_refs)
        ? relation.evidence_refs.map(String).map((value) => value.trim()).filter(Boolean)
        : [];
      const impactIfRejected = String(relation.impact_if_rejected ?? "").trim();
      const directionReason = String(relation.direction_reason ?? "").trim();
      const confidence = relation.confidence;
      if (
        !normalized.from_goal_id ||
        !normalized.to_goal_id ||
        !normalized.reason ||
        !impactIfRejected ||
        !directionReason
      ) {
        throw this.ports.errorFactory(
          "dependency_proposal.field_missing",
          "Dependency Proposal 必须说明起点、前置 Goal、原因、拒绝影响和方向依据",
        );
      }
      if (action !== "add" && action !== "deactivate") {
        throw this.ports.errorFactory(
          "dependency_proposal.action_invalid",
          "依赖调整 action 必须是 add 或 deactivate",
        );
      }
      if (!validBases.has(basis)) {
        throw this.ports.errorFactory(
          "dependency_proposal.basis_invalid",
          "Dependency Proposal 的 basis 不在允许范围内",
        );
      }
      if (evidenceRefs.length === 0) {
        throw this.ports.errorFactory(
          "dependency_proposal.evidence_required",
          "Dependency Proposal 至少需要一个可查找的代码、文档、测试或 Contract 引用",
        );
      }
      if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw this.ports.errorFactory(
          "dependency_proposal.confidence_invalid",
          "Dependency Proposal 的 confidence 必须是 0 到 1 之间的数字",
        );
      }
      return {
        ...normalized,
        action,
        basis,
        evidence_refs: evidenceRefs,
        impact_if_rejected: impactIfRejected,
        confidence,
        direction_reason: directionReason,
      };
    });
  }

  constructor(private readonly ports: {
    query: Pick<GoalsQueryApi, "getRisk">;
    commands: Pick<GoalsCommandApi, "validateGoalInput">;
    errorFactory: (code: string, message: string) => Error;
  }) {}

  goalTreeCandidatePromotionRelations(
    payload: Record<string, unknown>,
    goalId: string,
  ): Record<string, unknown>[] {
    if (payload.proposed_relations == null) return [];
    if (!Array.isArray(payload.proposed_relations)) {
      throw this.ports.errorFactory(
        "goal_tree_proposal.candidate_relations_invalid",
        "Candidate proposed_relations 必须是关系列表",
      );
    }
    return payload.proposed_relations.map((value) => {
      const relation = this.goalTreePayloadRecord(value, "Candidate 关系");
      return {
        ...relation,
        from_goal_id: String(relation.from_goal_id ?? "$new_goal").trim() === "$new_goal"
          ? goalId
          : String(relation.from_goal_id ?? "").trim(),
        to_goal_id: String(relation.to_goal_id ?? "").trim() === "$new_goal"
          ? goalId
          : String(relation.to_goal_id ?? "").trim(),
      };
    });
  }

  goalTreePayloadRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw this.ports.errorFactory(
        "goal_tree_proposal.payload_shape_invalid",
        `${label} 必须是结构化对象`,
      );
    }
    return value as Record<string, unknown>;
  }

  goalTreeStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))]
      : [];
  }

  goalTreeGoalInput(
    item: Pick<GoalTreeProposalItemRecord, "kind" | "payload">,
  ): CreateGoalInput {
    const payload = this.goalTreePayloadRecord(item.payload, "Goal Tree 条目 payload");
    const raw = this.goalTreePayloadRecord(payload.goal ?? payload.proposed_goal ?? payload, "Goal Contract");
    const definitionState = raw.definition_state == null ? undefined : String(raw.definition_state);
    const decompositionState = raw.decomposition_state == null ? undefined : String(raw.decomposition_state);
    if (definitionState != null && definitionState !== "draft" && definitionState !== "accepted") {
      throw this.ports.errorFactory("goal_tree_proposal.goal_definition_invalid", "Goal definition_state 无效");
    }
    if (
      decompositionState != null &&
      !["abstract", "frontier_open", "closed_leaf", "closed_compound"].includes(decompositionState)
    ) {
      throw this.ports.errorFactory("goal_tree_proposal.goal_decomposition_invalid", "Goal decomposition_state 无效");
    }
    const acceptance = Array.isArray(raw.acceptance_criteria)
      ? raw.acceptance_criteria.map((criterion) => {
          const value = this.goalTreePayloadRecord(criterion, "验收条件");
          return {
            ...(value.criterion_id == null ? {} : { criterion_id: String(value.criterion_id) }),
            statement: String(value.statement ?? ""),
            decision_method: String(value.decision_method ?? "inspection") as CreateGoalInput["acceptance_criteria"][number]["decision_method"],
            pass_condition: String(value.pass_condition ?? ""),
            target:
              value.target == null || typeof value.target !== "object" || Array.isArray(value.target)
                ? null
                : value.target as Record<string, unknown>,
            required_evidence: this.goalTreeStringArray(value.required_evidence),
          };
        })
      : [];
    const goal: CreateGoalInput = {
      ...(raw.goal_id == null ? {} : { goal_id: String(raw.goal_id) }),
      title: String(raw.title ?? ""),
      outcome: String(raw.outcome ?? ""),
      why: String(raw.why ?? ""),
      business_logic: String(raw.business_logic ?? ""),
      in_scope: this.goalTreeStringArray(raw.in_scope),
      out_of_scope: this.goalTreeStringArray(raw.out_of_scope),
      constraints: this.goalTreeStringArray(raw.constraints),
      required_inputs: this.goalTreeStringArray(raw.required_inputs),
      promised_outputs: this.goalTreeStringArray(raw.promised_outputs),
      ...(definitionState == null ? {} : { definition_state: definitionState as CreateGoalInput["definition_state"] }),
      ...(decompositionState == null
        ? {}
        : { decomposition_state: decompositionState as CreateGoalInput["decomposition_state"] }),
      ...(typeof raw.priority === "number" ? { priority: raw.priority } : {}),
      acceptance_criteria: acceptance,
    };
    this.ports.commands.validateGoalInput(goal);
    return goal;
  }

  goalTreeTargetGoalId(
    item: Pick<GoalTreeProposalItemRecord, "payload">,
    goal: CreateGoalInput,
  ): string {
    const payload = this.goalTreePayloadRecord(item.payload, "Goal Tree 条目 payload");
    const target = String(payload.goal_id ?? goal.goal_id ?? "").trim();
    if (!target) {
      throw this.ports.errorFactory(
        "goal_tree_proposal.goal_id_required",
        "物化或更新 Goal 时需要稳定的 goal_id",
      );
    }
    return target;
  }

  isRiskLifecycleChange(boardId: string, item: GoalTreeProposalItemShape): boolean {
    if (item.kind !== "risk" || item.operation === "create") return false;
    const payload = this.goalTreePayloadRecord(item.payload, "Risk 条目");
    const riskId = String(payload.risk_id ?? "").trim();
    const current = riskId
      ? this.ports.query.getRisk(boardId, riskId)
      : undefined;
    const currentState = current ? current.state : null;
    if (item.operation === "deactivate") return currentState !== "expired";
    const requestedState = String(payload.state ?? "").trim();
    return requestedState.length > 0 && requestedState !== currentState;
  }

  requireDraftRiskLifecycleContract<T extends GoalTreeProposalItemShape>(
    boardId: string,
    rootGoal: GoalRecord,
    items: T[],
  ): T | null {
    if (
      rootGoal.definition_state !== "draft" ||
      !items.some((item) => this.isRiskLifecycleChange(boardId, item))
    ) {
      return null;
    }
    const companion = items.find((item) => {
      if (!(["goal", "contract"] as GoalTreeProposalItemRecord["kind"][]).includes(item.kind)) return false;
      if (item.operation !== "update") return false;
      const payload = this.goalTreePayloadRecord(item.payload, "Goal Tree 条目 payload");
      const raw = this.goalTreePayloadRecord(payload.goal ?? payload.proposed_goal ?? payload, "Goal Contract");
      const targetGoalId = String(payload.goal_id ?? raw.goal_id ?? "").trim();
      if (targetGoalId !== rootGoal.goal_id) return false;
      const goal = this.goalTreeGoalInput(item);
      return (
        goal.definition_state === "accepted" &&
        goal.decomposition_state === "closed_leaf" &&
        goal.acceptance_criteria.length > 0
      );
    });
    if (!companion) {
      throw this.ports.errorFactory(
        "goal_tree_proposal.risk_goal_contract_required",
        "处理 Risk 本身就是一条正式 Goal。当前 root Goal 仍是 Draft，提案必须同时补全并接受这条 Goal 的 Contract，不能只改 Risk 后留下空 Draft",
      );
    }
    return companion;
  }

  goalTreeRelationEntries(item: GoalTreeProposalItemRecord): Record<string, unknown>[] {
    const payload = this.goalTreePayloadRecord(item.payload, "关系条目 payload");
    const nested = payload.rewire && typeof payload.rewire === "object" && !Array.isArray(payload.rewire)
      ? payload.rewire as Record<string, unknown>
      : payload.proposal && typeof payload.proposal === "object" && !Array.isArray(payload.proposal)
        ? payload.proposal as Record<string, unknown>
        : payload;
    const source = nested.relations ?? nested.relation ?? payload.relations ?? payload.relation ?? nested;
    const values = Array.isArray(source) ? source : [source];
    if (values.length === 0) {
      throw this.ports.errorFactory("goal_tree_proposal.relations_required", "关系条目至少需要一条关系");
    }
    return values.map((value) => this.goalTreePayloadRecord(value, "关系"));
  }

  normalizeGoalTreeRelation(
    item: GoalTreeProposalItemRecord,
    relation: Record<string, unknown>,
  ): {
    action: "add" | "deactivate";
    relation_id: string | null;
    from_goal_id: string;
    to_goal_id: string;
    type: GoalRelationRecord["type"] | null;
    reason: string;
  } {
    const action = String(relation.action ?? (item.operation === "deactivate" ? "deactivate" : "add"));
    if (action !== "add" && action !== "deactivate") {
      throw this.ports.errorFactory("goal_tree_proposal.relation_action_invalid", "关系条目的 action 必须是 add 或 deactivate");
    }
    const relationId = String(relation.relation_id ?? "").trim() || null;
    const fromGoalId = String(relation.from_goal_id ?? "").trim();
    const toGoalId = String(relation.to_goal_id ?? "").trim();
    const rawType = item.kind === "dependency" ? "depends_on" : String(relation.type ?? "").trim();
    const type = rawType
      ? rawType as GoalRelationRecord["type"]
      : null;
    if (type && !GOAL_RELATION_TYPES.has(type)) {
      throw this.ports.errorFactory("goal_tree_proposal.relation_type_invalid", "关系条目的 type 无效");
    }
    if (action === "add" && (!fromGoalId || !toGoalId || !type)) {
      throw this.ports.errorFactory("goal_tree_proposal.relation_required", "新增关系需要起点、终点和类型");
    }
    if (action === "deactivate" && !relationId && (!fromGoalId || !toGoalId || !type)) {
      throw this.ports.errorFactory(
        "goal_tree_proposal.relation_required",
        "停用关系需要 relation_id，或完整的起点、终点和类型",
      );
    }
    if (fromGoalId && toGoalId && fromGoalId === toGoalId) {
      throw this.ports.errorFactory("goal_tree_proposal.relation_self_reference", "Goal 不能关联到自身");
    }
    return {
      action,
      relation_id: relationId,
      from_goal_id: fromGoalId,
      to_goal_id: toGoalId,
      type,
      reason: String(relation.reason ?? "").trim(),
    };
  }
}
