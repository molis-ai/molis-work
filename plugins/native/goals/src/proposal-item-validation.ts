import type { GoalTreeProposalItemRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

type GoalTreeProposalItemLike = Pick<
  GoalTreeProposalItemRecord,
  "item_id" | "kind" | "operation" | "payload"
>;

export interface GoalTreeProposalItemValidationIssue {
  code:
    | "goal_tree_proposal.risk_goal_required"
    | "goal_tree_proposal.risk_required_field_missing"
    | "goal_tree_proposal.risk_treatment_invalid"
    | "goal_tree_proposal.risk_blocking_mode_invalid"
    | "goal_tree_proposal.risk_state_invalid"
    | "goal_tree_proposal.risk_resolution_basis_required";
  field: "goal_ids" | "risk_facts" | "treatment" | "blocking_mode" | "state" | "resolution_basis";
  message: string;
  recovery: string;
  missing_fields?: string[];
}

const RISK_TREATMENTS = new Set(["accept", "mitigate", "avoid", "defer"]);
const RISK_BLOCKING_MODES = new Set(["none", "claim", "completion", "invalidate_on_trigger"]);
const RISK_STATES = new Set(["open", "triggered", "resolved", "accepted", "expired"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function goalTreeRiskDescription(item: GoalTreeProposalItemLike): string {
  return text(item.payload.description) || item.item_id;
}

export function goalTreeProposalItemValidationIssues(
  item: GoalTreeProposalItemLike,
): GoalTreeProposalItemValidationIssue[] {
  if (item.kind !== "risk" || item.operation === "deactivate") return [];
  const issues: GoalTreeProposalItemValidationIssue[] = [];
  const goalIds = Array.isArray(item.payload.goal_ids)
    ? item.payload.goal_ids.map(text).filter(Boolean)
    : [];
  if (!goalIds.length) {
    issues.push({
      code: "goal_tree_proposal.risk_goal_required",
      field: "goal_ids",
      message: "这条风险没有关联任何 Goal。",
      recovery: "请退回方案，让 Runtime 补充关联 Goal 后重新提交。",
    });
  }
  const requiredFacts: Array<[keyof typeof item.payload, string]> = [
    ["description", "风险说明"],
    ["probability", "发生概率"],
    ["impact", "影响"],
    ["trigger", "触发条件"],
    ["revisit_condition", "复查条件"],
    ["owner", "负责人"],
  ];
  const missing = requiredFacts.filter(([field]) => !text(item.payload[field])).map(([, label]) => label);
  if (missing.length) {
    issues.push({
      code: "goal_tree_proposal.risk_required_field_missing",
      field: "risk_facts",
      message: `这条风险缺少：${missing.join("、")}。`,
      recovery: "请退回方案，让 Runtime 补全后重新提交。",
      missing_fields: missing,
    });
  }
  if (!RISK_TREATMENTS.has(text(item.payload.treatment))) {
    issues.push({
      code: "goal_tree_proposal.risk_treatment_invalid",
      field: "treatment",
      message: "“处理方式”必须选择“接受风险、降低风险、避开风险、延后处理”之一，不能填写一整段处理措施。",
      recovery: "请退回方案，让 Runtime 修正处理方式后重新提交。",
    });
  }
  if (!RISK_BLOCKING_MODES.has(text(item.payload.blocking_mode))) {
    issues.push({
      code: "goal_tree_proposal.risk_blocking_mode_invalid",
      field: "blocking_mode",
      message: "“对 Goal 的影响”不是 Molis Work 支持的选项。",
      recovery: "请退回方案，让 Runtime 重新选择是否阻止开始、完成或在发生时让 Goal 失效。",
    });
  }
  const state = text(item.payload.state);
  if (state && !RISK_STATES.has(state)) {
    issues.push({
      code: "goal_tree_proposal.risk_state_invalid",
      field: "state",
      message: `Risk 生命周期状态“${state}”不受支持；支持 open、triggered、resolved、accepted、expired。mitigate 是 treatment，不是 state；降低措施完成后应使用 resolved。`,
      recovery: "请退回方案，让 Runtime 区分处理策略与生命周期状态后重新提交。",
    });
  } else if (item.operation === "create" && state && state !== "open") {
    issues.push({
      code: "goal_tree_proposal.risk_state_invalid",
      field: "state",
      message: `新建 Risk 必须从 open 开始，不能直接创建为“${state}”。`,
      recovery: "请先创建 open Risk；后续状态变化应通过 update 并记录用户确认。",
    });
  }
  if (state === "resolved") {
    const basis = item.payload.resolution_basis;
    const record = basis && typeof basis === "object" && !Array.isArray(basis)
      ? basis as Record<string, unknown>
      : null;
    const evidenceRefs = Array.isArray(record?.evidence_refs)
      ? record.evidence_refs.map(text).filter(Boolean)
      : [];
    if (!text(record?.summary) || evidenceRefs.length === 0 || !Array.isArray(record?.residual_gaps)) {
      issues.push({
        code: "goal_tree_proposal.risk_resolution_basis_required",
        field: "resolution_basis",
        message: "Risk 标记为已解决时，必须写清解决摘要、至少一条证据引用和 residual_gaps。",
        recovery: "请补充 resolution_basis；没有剩余缺口时 residual_gaps 传空数组。",
      });
    }
  }
  return issues;
}
