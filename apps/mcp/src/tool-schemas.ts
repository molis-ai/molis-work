export const V1_COMMON = {
  database_path: { type: "string", description: "管理入口使用的共享 SQLite 文件路径" },
  board_id: { type: "string" },
};

export const V1_CLAIM_ROLE = {
  type: "string",
  enum: ["clarifier", "executor", "self_verifier", "cross_reviewer", "adversarial_reviewer", "revalidator"],
};

export const V1_STRING = { type: "string" };
export const V1_STRING_ARRAY = { type: "array", items: V1_STRING };
export const V1_LEASE_SECONDS = {
  type: "integer",
  minimum: 1,
  description:
    "可选；通常省略以采用当前动态策略（由项目与 Goal 共同解析）。显式值只用于缩短租约，必须是正整数且不能超过当前 resolved policy 的 max_lease_seconds；不要通过失败调用探测上限。",
};
export const V1_RENEW_LEASE_SECONDS = {
  type: "integer",
  minimum: 1,
  description:
    "可选；省略时采用领取时确认的策略上限。显式值必须是正整数且不能超过该 Claim 领取时 resolved policy 的 max_lease_seconds。",
};
export const DRAFT_DIALOGUE_FACT = {
  type: "object",
  properties: {
    statement: V1_STRING,
    source_kind: { type: "string", enum: ["user_answer", "repository_fact", "document_fact"] },
    source_refs: V1_STRING_ARRAY,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    confirmed_by_user: { type: "boolean" },
  },
  required: ["statement", "source_kind"],
};
export const DRAFT_DIALOGUE_ASSUMPTION = {
  type: "object",
  properties: {
    statement: V1_STRING,
    source_refs: V1_STRING_ARRAY,
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["statement"],
};
const GOAL_TREE_AFFECTED_OBJECT = {
  type: "object",
  additionalProperties: false,
  properties: {
    object_type: { type: "string", enum: ["goal", "relation"] },
    object_id: V1_STRING,
  },
  required: ["object_type", "object_id"],
};
const GOAL_TREE_ACCEPTANCE_CRITERION = {
  type: "object",
  properties: {
    criterion_id: V1_STRING,
    statement: V1_STRING,
    decision_method: {
      type: "string",
      enum: ["automated_check", "inspection", "measurement", "human_decision"],
    },
    pass_condition: V1_STRING,
    target: { type: ["object", "null"] },
    required_evidence: V1_STRING_ARRAY,
  },
  required: ["statement", "decision_method", "pass_condition", "required_evidence"],
};
const GOAL_TREE_CONTRACT_COVERAGE_STATUS = {
  type: "string",
  enum: ["complete", "partial", "integration_required", "uncovered"],
};
const GOAL_TREE_CONTRACT_COVERAGE = {
  type: "object",
  description:
    "逐项把父 Goal Contract 的 promised_outputs 与 acceptance_criteria 映射到后代 Goal 的真实 Contract 字段。closed_compound 只接受 complete；partial、integration_required 或 uncovered 必须保持父 Goal 开放。",
  properties: {
    promised_outputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parent_promised_output: V1_STRING,
          status: GOAL_TREE_CONTRACT_COVERAGE_STATUS,
          child_outputs: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: { goal_id: V1_STRING, promised_output: V1_STRING },
              required: ["goal_id", "promised_output"],
            },
          },
          reason: V1_STRING,
        },
        required: ["parent_promised_output", "status", "child_outputs", "reason"],
      },
    },
    acceptance_criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parent_criterion_id: V1_STRING,
          status: GOAL_TREE_CONTRACT_COVERAGE_STATUS,
          child_criteria: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: { goal_id: V1_STRING, criterion_id: V1_STRING },
              required: ["goal_id", "criterion_id"],
            },
          },
          reason: V1_STRING,
        },
        required: ["parent_criterion_id", "status", "child_criteria", "reason"],
      },
    },
  },
  required: ["promised_outputs", "acceptance_criteria"],
};
const GOAL_TREE_DECOMPOSITION_REVIEW = {
  type: "object",
  description:
    "拆分检查。complete + closed_compound 必须提供 contract_coverage，并逐项覆盖父 Contract；Molis Work 只验证明确引用，不猜测自然语言语义等价。",
  properties: {
    status: { type: "string", enum: ["complete", "paused"] },
    method_pack_ids: V1_STRING_ARRAY,
    task_context: { type: "string", enum: ["game", "app", "ai_data", "content_research", "operations", "other"] },
    product_context: { type: "string", enum: ["game", "app", "other"] },
    coverage: { type: "array", items: { type: "object" } },
    open_goal_ids: V1_STRING_ARRAY,
    next_step: V1_STRING,
    contract_coverage: GOAL_TREE_CONTRACT_COVERAGE,
  },
  required: ["status", "coverage", "open_goal_ids", "next_step"],
};
const GOAL_TREE_GOAL_PROPERTIES = {
  goal_id: {
    type: "string",
    description: "稳定 Goal ID。新建 Goal 必填；更新 Contract 时用于定位目标 Goal。",
  },
  title: V1_STRING,
  outcome: V1_STRING,
  why: V1_STRING,
  business_logic: V1_STRING,
  in_scope: V1_STRING_ARRAY,
  out_of_scope: V1_STRING_ARRAY,
  constraints: V1_STRING_ARRAY,
  required_inputs: V1_STRING_ARRAY,
  promised_outputs: V1_STRING_ARRAY,
  definition_state: { type: "string", enum: ["draft", "accepted"] },
  decomposition_state: {
    type: "string",
    enum: ["abstract", "frontier_open", "closed_leaf", "closed_compound"],
  },
  decomposition_review: GOAL_TREE_DECOMPOSITION_REVIEW,
  leaf_readiness: {
    type: "object",
    description:
      "叶子粒度判断。规范路径是 items[].payload.leaf_readiness；不要放在 item 顶层。accepted + closed_leaf 必须完整提供全部字段。",
    properties: {
      verdict: { type: "string", enum: ["ready", "split_required"] },
      primary_deliverable: V1_STRING,
      output_coverage: {
        type: "array",
        items: {
          type: "object",
          properties: {
            promised_output: V1_STRING,
            role: { type: "string", enum: ["primary", "supporting", "independent"] },
            reason: V1_STRING,
          },
          required: ["promised_output", "role", "reason"],
        },
      },
      split_candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            work_item: V1_STRING,
            separately_deliverable: { type: "boolean" },
            separately_acceptable: { type: "boolean" },
            independently_reworkable: { type: "boolean" },
            decision: {
              type: "string",
              enum: ["keep", "split"],
              description:
                "只允许 keep 或 split。明确延期且本轮不做的工作不要放进 split_candidates；写入 out_of_scope/提案 non_goals。可独立交付的工作选择 split 并新建 Goal。",
            },
            reason: V1_STRING,
          },
          required: [
            "work_item",
            "separately_deliverable",
            "separately_acceptable",
            "independently_reworkable",
            "decision",
            "reason",
          ],
        },
      },
      rationale: V1_STRING,
      unresolved_decisions: V1_STRING_ARRAY,
      independent_deliverables: V1_STRING_ARRAY,
      acceptance_criterion_ids: V1_STRING_ARRAY,
    },
    required: [
      "verdict",
      "primary_deliverable",
      "output_coverage",
      "split_candidates",
      "rationale",
      "unresolved_decisions",
      "independent_deliverables",
      "acceptance_criterion_ids",
    ],
  },
  priority: { type: "number" },
  acceptance_criteria: { type: "array", items: GOAL_TREE_ACCEPTANCE_CRITERION },
};
const GOAL_TREE_GOAL_PAYLOAD = {
  type: "object",
  additionalProperties: false,
  description:
    "kind=goal 且 operation=create。只创建新 Goal：title 必填，可选 outcome/why/business_logic/priority/goal_id/requirements。父子与依赖另用 relation 条目。",
  properties: {
    title: V1_STRING,
    outcome: V1_STRING,
    why: V1_STRING,
    business_logic: V1_STRING,
    priority: { type: "number", minimum: 0, maximum: 100 },
    goal_id: V1_STRING,
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement_id: V1_STRING,
          statement: V1_STRING,
          human_decision_required: { type: "boolean" },
        },
        required: ["statement"],
      },
    },
  },
  required: ["title"],
  examples: [{ title: "交付可验收的子结果", outcome: "用户能完成付款" }],
};
const CONTRACT_PROPOSAL_ACCEPTANCE_CRITERION = {
  ...GOAL_TREE_ACCEPTANCE_CRITERION,
  description:
    "完整 Contract Proposal 的验收条件必须是对象，不能写成字符串。criterion_id 还必须与 leaf_readiness.acceptance_criterion_ids 一一对应。",
  required: ["criterion_id", "statement", "decision_method", "pass_condition"],
};
export const CONTRACT_PROPOSAL_GOAL_PAYLOAD = {
  type: "object",
  description:
    "同一 Draft 的完整 accepted / closed_leaf Contract。goal_id 必须是原 Draft ID；acceptance_criteria 是对象数组；leaf_readiness 位于 proposed_goal.leaf_readiness。",
  properties: {
    ...GOAL_TREE_GOAL_PROPERTIES,
    acceptance_criteria: { type: "array", minItems: 1, items: CONTRACT_PROPOSAL_ACCEPTANCE_CRITERION },
  },
  required: [
    "goal_id",
    "title",
    "outcome",
    "why",
    "business_logic",
    "in_scope",
    "out_of_scope",
    "required_inputs",
    "promised_outputs",
    "leaf_readiness",
    "definition_state",
    "decomposition_state",
    "priority",
    "acceptance_criteria",
  ],
};
const GOAL_TREE_RELATION_CREATE_PAYLOAD = {
  type: "object",
  additionalProperties: false,
  description:
    "kind=relation 且 operation=create。需要 from_goal_id、to_goal_id、type=part_of|depends_on 和 reason。part_of 为子 Goal → 父 Goal；depends_on 为消费方 Goal → 前置 Goal。",
  properties: {
    from_goal_id: V1_STRING,
    to_goal_id: V1_STRING,
    type: { type: "string", enum: ["part_of", "depends_on"] },
    reason: V1_STRING,
  },
  required: ["from_goal_id", "to_goal_id", "type", "reason"],
  examples: [{ from_goal_id: "child-goal", to_goal_id: "parent-goal", type: "part_of", reason: "组成父结果" }],
};
const GOAL_TREE_RELATION_DEACTIVATE_PAYLOAD = {
  type: "object",
  additionalProperties: false,
  description:
    "kind=relation 且 operation=deactivate。可按已有 relation_id 和 reason 定位，或按 from_goal_id、to_goal_id、type 和 reason 定位。",
  properties: {
    from_goal_id: V1_STRING,
    to_goal_id: V1_STRING,
    type: { type: "string", enum: ["part_of", "depends_on"] },
    reason: V1_STRING,
    relation_id: {
      type: "string",
      description: "停用已有关系时可用具体关系 ID；不必再重复两端。",
    },
  },
  anyOf: [
    { required: ["relation_id", "reason"] },
    { required: ["from_goal_id", "to_goal_id", "type", "reason"] },
  ],
  examples: [
    { relation_id: "rel-1", reason: "解除这条已有关系" },
    { from_goal_id: "child-goal", to_goal_id: "parent-goal", type: "part_of", reason: "解除父子关系" },
  ],
};
export const GOAL_TREE_POLICY_FIELDS = {
  goal_mode: { type: "string", enum: ["disabled", "preferred", "required"] },
  required_capabilities: V1_STRING_ARRAY,
  self_verification: { type: "boolean" },
  cross_reviewers: { type: "integer", minimum: 0 },
  adversarial_reviewers: { type: "integer", minimum: 0 },
  human_approval: { type: "boolean" },
  max_lease_seconds: { type: "integer", minimum: 1 },
};
const GOAL_TREE_ITEM_EXPLANATION = {
  type: "object",
  description:
    "面向审批人的逐项语义解释：problem 是主要解决的问题；expected_effect 是确认后会改变什么；non_goals 明确不改变什么；depends_on_item_ids 指向同一 Proposal 内先行或共同构成主链路的 item_id。包含 5 项及以上变化时每项必填。",
  properties: {
    problem: V1_STRING,
    expected_effect: V1_STRING,
    non_goals: V1_STRING_ARRAY,
    depends_on_item_ids: V1_STRING_ARRAY,
  },
  required: ["problem", "expected_effect", "non_goals", "depends_on_item_ids"],
};
export const GOAL_TREE_PROPOSAL_NARRATIVE = {
  type: "object",
  description:
    "整份变更的用户语义摘要。包含 5 项及以上变化时必填，用原问题 → 修改后的主链路 → 预期效果解释整份方案，而不是复述字段 diff。",
  properties: {
    why_now: V1_STRING,
    problem: V1_STRING,
    main_path: { type: "array", minItems: 1, items: V1_STRING },
    expected_effect: V1_STRING,
    non_goals: V1_STRING_ARRAY,
  },
  required: ["why_now", "problem", "main_path", "expected_effect", "non_goals"],
};
const GOAL_TREE_ITEM_PROPERTIES = {
    item_id: V1_STRING,
    source_refs: V1_STRING_ARRAY,
    reason: V1_STRING,
    explanation: GOAL_TREE_ITEM_EXPLANATION,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    affected_objects: { type: "array", items: GOAL_TREE_AFFECTED_OBJECT, description: "Goal 和关系条目可省略，由 payload 中的目标 ID/关系端点推导并记录版本基线。" },
    requires_user_confirmation: { type: "boolean" },
    supersedes_item_id: { type: ["string", "null"] },
};
export const GOAL_TREE_ITEM = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        ...GOAL_TREE_ITEM_PROPERTIES,
        kind: { type: "string", const: "goal" },
        operation: { type: "string", const: "create" },
        payload: GOAL_TREE_GOAL_PAYLOAD,
      },
      required: ["kind", "operation", "payload", "source_refs", "reason", "confidence"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        ...GOAL_TREE_ITEM_PROPERTIES,
        kind: { type: "string", const: "relation" },
        operation: { type: "string", const: "create" },
        payload: GOAL_TREE_RELATION_CREATE_PAYLOAD,
      },
      required: ["kind", "operation", "payload", "source_refs", "reason", "confidence"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        ...GOAL_TREE_ITEM_PROPERTIES,
        kind: { type: "string", const: "relation" },
        operation: { type: "string", const: "deactivate" },
        payload: GOAL_TREE_RELATION_DEACTIVATE_PAYLOAD,
      },
      required: ["kind", "operation", "payload", "source_refs", "reason", "confidence"],
    },
  ],
};
export const GOAL_TREE_ITEM_DECISION = {
  type: "object",
  properties: {
    item_id: V1_STRING,
    decision: { type: "string", enum: ["confirm", "reject", "revise"] },
    reason: V1_STRING,
    revised_item: GOAL_TREE_ITEM,
  },
  required: ["item_id", "decision"],
};
export const GOAL_EVENT_FIELD_DEFINITION = {
  type: "object",
  additionalProperties: false,
  properties: {
    field_id: V1_STRING,
    name: V1_STRING,
    purpose: V1_STRING,
    format: { type: "string", enum: ["text", "longtext"] },
    required: { type: "boolean" },
    source: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["local", "planning"] },
        method_id: V1_STRING,
        label: V1_STRING,
      },
      required: ["kind"],
    },
  },
  required: ["field_id", "name", "purpose", "format", "required"],
};

export const GOAL_EVENT_TYPE_DEFINITION = {
  type: "object",
  additionalProperties: false,
  properties: {
    type_id: V1_STRING,
    version: { type: "integer", minimum: 1 },
    name: V1_STRING,
    purpose: V1_STRING,
    semantic_family: {
      type: "string",
      enum: ["progress", "delivery", "verification", "concern", "observation", "decision", "closure", "custom"],
    },
    source: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["local", "planning", "runtime"] },
        method_id: V1_STRING,
        method_version: { type: "integer", minimum: 1 },
        label: V1_STRING,
      },
      required: ["kind"],
    },
    fields: { type: "array", minItems: 1, items: GOAL_EVENT_FIELD_DEFINITION },
  },
  required: ["type_id", "version", "name", "purpose", "fields"],
};

export const GOAL_EVENT_DEFAULT_REQUIREMENT = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirement_id: V1_STRING,
    statement: V1_STRING,
    bound_type_id: V1_STRING,
    applies_when: V1_STRING,
  },
  required: ["requirement_id", "statement"],
};

export const GOAL_EVENT_ADOPTED_PLANNING = {
  type: "object",
  additionalProperties: false,
  properties: {
    method_id: V1_STRING,
    version: { type: "integer", minimum: 1 },
    source: { type: "string", enum: ["built_in", "personal", "project"] },
  },
  required: ["method_id"],
};

export const GOAL_EVENT_NEW_REQUIREMENT = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirement_id: V1_STRING,
    statement: V1_STRING,
    bound_type_id: V1_STRING,
    human_decision_required: { type: "boolean" },
  },
  required: ["requirement_id", "statement"],
};

export const GOAL_EVENT_REQUIREMENT_REVISION = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirement_id: V1_STRING,
    statement: V1_STRING,
    human_decision_required: { type: "boolean" },
  },
  required: ["requirement_id"],
};

export const GOAL_EVENT_AGREEMENT_CHANGE = {
  type: "object",
  additionalProperties: false,
  properties: {
    outcome: V1_STRING,
    new_requirements: { type: "array", items: GOAL_EVENT_NEW_REQUIREMENT },
    revise_requirements: { type: "array", items: GOAL_EVENT_REQUIREMENT_REVISION },
    retire_requirement_ids: V1_STRING_ARRAY,
  },
};

export const GOAL_EVENT_REQUIREMENT_BINDING = {
  type: "object",
  additionalProperties: false,
  properties: {
    type_id: V1_STRING,
    requirement_id: V1_STRING,
  },
  required: ["type_id", "requirement_id"],
};

export const GOAL_EVENT_REPORT_PROGRESS = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", minLength: 1, description: "当前进展原文" },
    next_step: V1_STRING,
    next_actor: V1_STRING,
  },
  required: ["summary"],
};

export const GOAL_EVENT_REPORT_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    type_id: V1_STRING,
    type_version: { type: "integer", minimum: 1 },
    title: V1_STRING,
    fields: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "已登记字段 ID 到文本值的映射；领域模块校验允许字段。",
    },
    judgments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement_id: V1_STRING,
          verdict: { type: "string", enum: ["supports", "contradicts", "unknown"] },
        },
        required: ["requirement_id", "verdict"],
      },
    },
  },
  required: ["type_id", "type_version", "title", "fields"],
};

export const GOAL_EVENT_SCOPE = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirement_ids: V1_STRING_ARRAY,
    event_ids: V1_STRING_ARRAY,
    concern_ids: V1_STRING_ARRAY,
    action: V1_STRING,
  },
};

export const GOAL_EVENT_DECISION_OPTION = {
  type: "object",
  additionalProperties: false,
  properties: {
    option_id: V1_STRING,
    label: V1_STRING,
    impact: V1_STRING,
  },
  required: ["option_id", "label", "impact"],
};

export const PLANNING_METHOD_PACK = {
  type: "object",
  properties: {
    method_id: V1_STRING,
    kind: { type: "string", enum: ["meta", "work_type", "domain", "industry", "overlay", "custom"] },
    name: V1_STRING,
    summary: V1_STRING,
    instructions: V1_STRING,
    applies_to: V1_STRING_ARRAY,
    domain_tags: V1_STRING_ARRAY,
    steps: V1_STRING_ARRAY,
    required_coverage: {
      type: "array",
      items: {
        type: "object",
        properties: { area: V1_STRING, label: V1_STRING, question: V1_STRING },
        required: ["area", "label", "question"],
      },
    },
    dependency_rules: {
      type: "array",
      items: {
        type: "object",
        properties: { rule_id: V1_STRING, statement: V1_STRING, direction_hint: V1_STRING },
        required: ["rule_id", "statement", "direction_hint"],
      },
    },
    evidence_requirements: V1_STRING_ARRAY,
    completion_checks: V1_STRING_ARRAY,
    failure_modes: V1_STRING_ARRAY,
    source_refs: V1_STRING_ARRAY,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    enabled: { type: "boolean" },
    event_types: {
      type: "array",
      items: GOAL_EVENT_TYPE_DEFINITION,
      description: "可选；该方法提供的事件类型定义。保存时不自动成为某个 Goal 的当前完成要求。",
    },
    default_requirements: {
      type: "array",
      items: GOAL_EVENT_DEFAULT_REQUIREMENT,
      description: "可选；采用该方法后仍需明确选择才会成为当前完成要求。",
    },
  },
  required: [
    "method_id", "kind", "name", "summary", "applies_to", "domain_tags", "steps",
    "required_coverage", "dependency_rules", "evidence_requirements", "completion_checks",
    "failure_modes", "source_refs", "confidence", "enabled",
  ],
};

export function v1PayloadTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        payload: { type: "object", properties, required },
      },
      required: ["board_id", "payload"],
    },
  };
}
