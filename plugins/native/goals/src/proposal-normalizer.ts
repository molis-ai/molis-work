import { randomUUID } from "node:crypto";
import type {
  GoalTreeProposalItemRecord,
  GoalTreeProposalItemInput,
  GoalTreeGoalCreatePayload,
  GoalTreeRelationCreatePayload,
  GoalTreeRelationDeactivatePayload,
  GoalTreeProposalItemExplanation,
  GoalTreeProposalNarrative,
  ProposalAffectedObject,
  GovernanceProvenanceApi,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

const GOAL_TREE_ITEM_KEYS = new Set([
  "item_id",
  "kind",
  "operation",
  "payload",
  "source_refs",
  "reason",
  "explanation",
  "confidence",
  "affected_objects",
  "requires_user_confirmation",
  "supersedes_item_id",
]);
const GOAL_TREE_GOAL_KEYS = new Set([
  "title", "outcome", "why", "business_logic", "priority", "goal_id", "requirements",
]);
const GOAL_TREE_RELATION_CREATE_KEYS = new Set([
  "from_goal_id", "to_goal_id", "type", "reason",
]);
const GOAL_TREE_RELATION_DEACTIVATE_KEYS = new Set([
  "from_goal_id", "to_goal_id", "type", "reason", "relation_id",
]);
const GOAL_TREE_REQUIREMENT_KEYS = new Set(["requirement_id", "statement", "human_decision_required"]);
const GOAL_TREE_WRITE_AFFECTED_OBJECT_TYPES = new Set<ProposalAffectedObject["object_type"]>([
  "goal",
  "relation",
]);

export interface NormalizedGoalTreeProposalItem {
  item_id: string;
  kind: GoalTreeProposalItemRecord["kind"];
  operation: GoalTreeProposalItemRecord["operation"];
  payload: Record<string, unknown>;
  source_refs: string[];
  reason: string;
  explanation: GoalTreeProposalItemExplanation | null;
  confidence: number;
  affected_objects: ProposalAffectedObject[];
  requires_user_confirmation: true;
  supersedes_item_id: string | null;
}

const LARGE_GOAL_TREE_PROPOSAL_ITEM_COUNT = 5;

/** Existing proposal wire normalization; no owner facts or user decisions are written here. */
export class GoalTreeProposalNormalizer {
  constructor(private readonly provenance: Pick<GovernanceProvenanceApi, "normalizeProposalSource">,
    private readonly errorFactory: (code: string, message: string, details?: Record<string, unknown>) => Error) {}

  private semanticText(value: unknown, code: string, message: string): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) throw this.errorFactory(code, message);
    return normalized;
  }
  
  private semanticTextList(value: unknown, code: string, message: string): string[] {
    if (!Array.isArray(value)) throw this.errorFactory(code, message);
    return unique(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean));
  }
  
  normalizeGoalTreeProposalNarrative(
    narrative: GoalTreeProposalNarrative | null | undefined,
    itemCount: number,
  ): GoalTreeProposalNarrative | null {
    if (narrative == null) {
      if (itemCount >= LARGE_GOAL_TREE_PROPOSAL_ITEM_COUNT) {
        throw this.errorFactory(
          "goal_tree_proposal.narrative_required",
          `包含 ${itemCount} 项变化的大型 Goal Tree 提案必须说明 why_now、problem、main_path、expected_effect 和 non_goals，让用户能在确认前理解“原问题 → 新链路 → 预期效果”；单纯 summary 不足以审批整份变更`,
        );
      }
      return null;
    }
    if (typeof narrative !== "object" || Array.isArray(narrative)) {
      throw this.errorFactory("goal_tree_proposal.narrative_invalid", "Goal Tree 提案的 narrative 必须是结构化对象");
    }
    const mainPath = this.semanticTextList(
      narrative.main_path,
      "goal_tree_proposal.narrative_main_path_invalid",
      "Goal Tree 提案的 narrative.main_path 必须是按依赖顺序排列的非空文字数组",
    );
    if (mainPath.length === 0) {
      throw this.errorFactory(
        "goal_tree_proposal.narrative_main_path_required",
        "Goal Tree 提案必须至少说明一段变更后的主链路",
      );
    }
    return {
      why_now: this.semanticText(
        narrative.why_now,
        "goal_tree_proposal.narrative_why_now_required",
        "Goal Tree 提案必须说明为什么现在需要改变",
      ),
      problem: this.semanticText(
        narrative.problem,
        "goal_tree_proposal.narrative_problem_required",
        "Goal Tree 提案必须说明原目标或流程的具体问题",
      ),
      main_path: mainPath,
      expected_effect: this.semanticText(
        narrative.expected_effect,
        "goal_tree_proposal.narrative_effect_required",
        "Goal Tree 提案必须说明采用后的预期效果",
      ),
      non_goals: this.semanticTextList(
        narrative.non_goals,
        "goal_tree_proposal.narrative_non_goals_invalid",
        "Goal Tree 提案的 narrative.non_goals 必须是文字数组；没有非目标时传空数组",
      ),
    };
  }
  
  private normalizeGoalTreeProposalItemExplanation(
    explanation: GoalTreeProposalItemExplanation | null | undefined,
    index: number,
  ): GoalTreeProposalItemExplanation | null {
    if (explanation == null) return null;
    if (typeof explanation !== "object" || Array.isArray(explanation)) {
      throw this.errorFactory(
        "goal_tree_proposal.item_explanation_invalid",
        `第 ${index + 1} 个条目的 explanation 必须是结构化对象`,
      );
    }
    return {
      problem: this.semanticText(
        explanation.problem,
        "goal_tree_proposal.item_problem_required",
        `第 ${index + 1} 个条目必须说明主要解决什么问题`,
      ),
      expected_effect: this.semanticText(
        explanation.expected_effect,
        "goal_tree_proposal.item_effect_required",
        `第 ${index + 1} 个条目必须说明会改变什么`,
      ),
      non_goals: this.semanticTextList(
        explanation.non_goals,
        "goal_tree_proposal.item_non_goals_invalid",
        `第 ${index + 1} 个条目的 explanation.non_goals 必须是文字数组；没有非目标时传空数组`,
      ),
      depends_on_item_ids: this.semanticTextList(
        explanation.depends_on_item_ids,
        "goal_tree_proposal.item_dependencies_invalid",
        `第 ${index + 1} 个条目的 explanation.depends_on_item_ids 必须是 item_id 数组`,
      ),
    };
  }
  
  private rejectUnknownKeys(
    value: Record<string, unknown>,
    allowed: Set<string>,
    code: string,
    label: string,
  ): void {
    const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
    if (unexpected.length) {
      throw this.errorFactory(code, `${label}不能使用未许可字段：${unexpected.join("、")}`);
    }
  }

  private parseGoalTreeWriteItem(item: unknown, itemIndex: number): {
    item_id?: string;
    kind: "goal" | "relation";
    operation: "create" | "deactivate";
    payload: GoalTreeGoalCreatePayload | GoalTreeRelationCreatePayload | GoalTreeRelationDeactivatePayload;
    explanation?: GoalTreeProposalItemExplanation | null;
    affected_objects?: ProposalAffectedObject[];
    supersedes_item_id?: string | null;
  } {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw this.errorFactory(
        "goal_tree_proposal.kind_retired",
        `第 ${itemIndex + 1} 个条目只能是 goal（create）或 relation（part_of/depends_on 的 create/deactivate）`,
      );
    }
    const raw = item as Record<string, unknown>;
    this.rejectUnknownKeys(raw, GOAL_TREE_ITEM_KEYS, "goal_tree_proposal.payload_unknown", `第 ${itemIndex + 1} 个条目`);
    if (raw.kind !== "goal" && raw.kind !== "relation") {
      throw this.errorFactory(
        "goal_tree_proposal.kind_retired",
        `第 ${itemIndex + 1} 个条目只能是 goal（create）或 relation（part_of/depends_on 的 create/deactivate）`,
      );
    }
    if (!raw.payload || typeof raw.payload !== "object" || Array.isArray(raw.payload)) {
      throw this.errorFactory("goal_tree_proposal.item_payload_invalid", `第 ${itemIndex + 1} 个条目必须带结构化内容`);
    }
    const payload = { ...raw.payload } as Record<string, unknown>;
    const envelope = this.writeItemEnvelope(raw, itemIndex);
    if (raw.kind === "goal") {
      if (raw.operation !== "create") {
        throw this.errorFactory("goal_tree_proposal.use_event_agree", "已有结果与要求请用事件约定修改，结构提案只创建新 Goal");
      }
      return {
        ...envelope,
        kind: "goal",
        operation: "create",
        payload: this.goalCreatePayload(payload, itemIndex),
      };
    }
    if (raw.operation !== "create" && raw.operation !== "deactivate") {
      throw this.errorFactory("goal_tree_proposal.item_operation_invalid", `第 ${itemIndex + 1} 个关系条目的操作无效`);
    }
    if (raw.operation === "create") {
      return {
        ...envelope,
        kind: "relation",
        operation: "create",
        payload: this.relationCreatePayload(payload, itemIndex),
      };
    }
    return {
      ...envelope,
      kind: "relation",
      operation: "deactivate",
      payload: this.relationDeactivatePayload(payload, itemIndex),
    };
  }

  private writeItemEnvelope(raw: Record<string, unknown>, itemIndex: number): {
    item_id?: string;
    explanation?: GoalTreeProposalItemExplanation | null;
    affected_objects?: ProposalAffectedObject[];
    supersedes_item_id?: string | null;
  } {
    if (Object.prototype.hasOwnProperty.call(raw, "item_id") && raw.item_id != null && typeof raw.item_id !== "string") {
      throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `第 ${itemIndex + 1} 个条目的 item_id 必须是字符串`);
    }
    if (
      Object.prototype.hasOwnProperty.call(raw, "supersedes_item_id")
      && raw.supersedes_item_id != null
      && typeof raw.supersedes_item_id !== "string"
    ) {
      throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `第 ${itemIndex + 1} 个条目的 supersedes_item_id 必须是字符串或 null`);
    }
    return {
      ...(typeof raw.item_id === "string" ? { item_id: raw.item_id } : {}),
      ...(raw.explanation === undefined ? {} : { explanation: raw.explanation as GoalTreeProposalItemExplanation | null }),
      ...(raw.affected_objects === undefined ? {} : { affected_objects: raw.affected_objects as ProposalAffectedObject[] }),
      ...(raw.supersedes_item_id === undefined
        ? {}
        : { supersedes_item_id: raw.supersedes_item_id as string | null }),
    };
  }

  private goalCreatePayload(payload: Record<string, unknown>, itemIndex: number): GoalTreeGoalCreatePayload {
    this.rejectUnknownKeys(payload, GOAL_TREE_GOAL_KEYS, "goal_tree_proposal.payload_unknown", `第 ${itemIndex + 1} 个 Goal 条目`);
    const location = `第 ${itemIndex + 1} 个 Goal 条目`;
    if (!Object.prototype.hasOwnProperty.call(payload, "title")) {
      throw this.errorFactory("goal_tree_proposal.goal_title_required", `${location}需要标题`);
    }
    if (typeof payload.title !== "string") {
      throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 title 必须是字符串`);
    }
    if (!payload.title.trim()) {
      throw this.errorFactory("goal_tree_proposal.goal_title_required", `${location}需要标题`);
    }
    const result: GoalTreeGoalCreatePayload = { title: payload.title };
    for (const field of ["outcome", "why", "business_logic"] as const) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
      if (typeof payload[field] !== "string") {
        throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 ${field} 必须是字符串`);
      }
      result[field] = payload[field];
    }
    if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
      if (typeof payload.priority !== "number" || !Number.isFinite(payload.priority)) {
        throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 priority 必须是数字`);
      }
      result.priority = payload.priority;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "goal_id")) {
      if (typeof payload.goal_id !== "string") {
        throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 goal_id 必须是字符串`);
      }
      result.goal_id = payload.goal_id.trim() || `goal-${randomUUID()}`;
    } else {
      result.goal_id = `goal-${randomUUID()}`;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, "requirements") || payload.requirements == null) {
      return result;
    }
    if (!Array.isArray(payload.requirements)) {
      throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 requirements 必须是数组`);
    }
    result.requirements = payload.requirements.map((requirement, requirementIndex) => {
      if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
        throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的要求必须是对象`);
      }
      const row = requirement as Record<string, unknown>;
      this.rejectUnknownKeys(row, GOAL_TREE_REQUIREMENT_KEYS, "goal_tree_proposal.payload_unknown", `第 ${itemIndex + 1} 个 Goal 要求`);
      if (typeof row.statement !== "string" || !row.statement.trim()) {
        throw this.errorFactory(
          "goal_tree_proposal.payload_shape_invalid",
          `${location}的第 ${requirementIndex + 1} 条要求 statement 必须是非空字符串`,
        );
      }
      const parsed: NonNullable<GoalTreeGoalCreatePayload["requirements"]>[number] = { statement: row.statement };
      if (Object.prototype.hasOwnProperty.call(row, "requirement_id")) {
        if (typeof row.requirement_id !== "string") {
          throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 requirement_id 必须是字符串`);
        }
        parsed.requirement_id = row.requirement_id;
      }
      if (Object.prototype.hasOwnProperty.call(row, "human_decision_required")) {
        if (typeof row.human_decision_required !== "boolean") {
          throw this.errorFactory(
            "goal_tree_proposal.payload_shape_invalid",
            `${location}的 human_decision_required 必须是布尔值 true 或 false`,
          );
        }
        parsed.human_decision_required = row.human_decision_required;
      }
      return parsed;
    });
    return result;
  }

  private relationReason(payload: Record<string, unknown>, location: string): string {
    if (typeof payload.reason !== "string" || !payload.reason.trim()) {
      throw this.errorFactory("goal_tree_proposal.relation_required", `${location}的 reason 必须是非空字符串`);
    }
    return payload.reason;
  }

  private relationType(value: unknown, location: string): "part_of" | "depends_on" {
    if (value !== "part_of" && value !== "depends_on") {
      throw this.errorFactory("goal_tree_proposal.relation_type_invalid", `${location}的 type 只能是 part_of 或 depends_on`);
    }
    return value;
  }

  private relationCreatePayload(payload: Record<string, unknown>, itemIndex: number): GoalTreeRelationCreatePayload {
    this.rejectUnknownKeys(payload, GOAL_TREE_RELATION_CREATE_KEYS, "goal_tree_proposal.payload_unknown", `第 ${itemIndex + 1} 个关系条目`);
    const location = `第 ${itemIndex + 1} 个关系条目`;
    const missing = [
      ...(typeof payload.from_goal_id !== "string" || !payload.from_goal_id.trim() ? ["from_goal_id"] : []),
      ...(typeof payload.to_goal_id !== "string" || !payload.to_goal_id.trim() ? ["to_goal_id"] : []),
      ...(!Object.prototype.hasOwnProperty.call(payload, "type") ? ["type"] : []),
      ...(typeof payload.reason !== "string" || !payload.reason.trim() ? ["reason"] : []),
    ];
    if (missing.length) {
      throw this.errorFactory(
        "goal_tree_proposal.relation_required",
        `${location}缺少字段：${missing.join("、")}。规范格式示例：{"from_goal_id":"child-goal","to_goal_id":"parent-goal","type":"part_of","reason":"组成父结果"}；part_of 方向是子 Goal → 父 Goal。`,
      );
    }
    if (typeof payload.from_goal_id !== "string" || typeof payload.to_goal_id !== "string") {
      throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 from_goal_id 和 to_goal_id 必须是字符串`);
    }
    return {
      from_goal_id: payload.from_goal_id,
      to_goal_id: payload.to_goal_id,
      type: this.relationType(payload.type, location),
      reason: this.relationReason(payload, location),
    };
  }

  private relationDeactivatePayload(payload: Record<string, unknown>, itemIndex: number): GoalTreeRelationDeactivatePayload {
    this.rejectUnknownKeys(payload, GOAL_TREE_RELATION_DEACTIVATE_KEYS, "goal_tree_proposal.payload_unknown", `第 ${itemIndex + 1} 个关系条目`);
    const location = `第 ${itemIndex + 1} 个关系条目`;
    const reason = this.relationReason(payload, location);
    const hasRelationId = Object.prototype.hasOwnProperty.call(payload, "relation_id");
    const hasFrom = Object.prototype.hasOwnProperty.call(payload, "from_goal_id");
    const hasTo = Object.prototype.hasOwnProperty.call(payload, "to_goal_id");
    const hasType = Object.prototype.hasOwnProperty.call(payload, "type");
    const hasEndpoints = hasFrom || hasTo || hasType;
    if (hasRelationId) {
      if (typeof payload.relation_id !== "string" || !payload.relation_id.trim()) {
        throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 relation_id 必须是非空字符串`);
      }
      if (!hasEndpoints) {
        return { relation_id: payload.relation_id, reason };
      }
    }
    const missing = [
      ...(typeof payload.from_goal_id !== "string" || !payload.from_goal_id.trim() ? ["from_goal_id"] : []),
      ...(typeof payload.to_goal_id !== "string" || !payload.to_goal_id.trim() ? ["to_goal_id"] : []),
      ...(!hasType ? ["type"] : []),
    ];
    if (missing.length) {
      throw this.errorFactory(
        "goal_tree_proposal.relation_required",
        `${location}停用关系需要 relation_id 和 reason，或完整的 from_goal_id、to_goal_id、type 和 reason`,
      );
    }
    if (typeof payload.from_goal_id !== "string" || typeof payload.to_goal_id !== "string") {
      throw this.errorFactory("goal_tree_proposal.payload_shape_invalid", `${location}的 from_goal_id 和 to_goal_id 必须是字符串`);
    }
    return {
      from_goal_id: payload.from_goal_id,
      to_goal_id: payload.to_goal_id,
      type: this.relationType(payload.type, location),
      reason,
      ...(hasRelationId ? { relation_id: payload.relation_id as string } : {}),
    };
  }

  normalizeGoalTreeProposalItems(
    items: GoalTreeProposalItemInput[],
  ): NormalizedGoalTreeProposalItem[] {
    if (!Array.isArray(items) || items.length === 0) {
      throw this.errorFactory("goal_tree_proposal.items_required", "一份 Goal Tree 提案至少需要一个变更条目");
    }
    const ids = new Set<string>();
    const normalized = items.map((rawItem, index) => {
      const item = this.parseGoalTreeWriteItem(rawItem, index);
      const payload: Record<string, unknown> = { ...item.payload };
      const itemId = item.item_id?.trim() || `goal-tree-proposal-item-${randomUUID()}`;
      if (ids.has(itemId)) {
        throw this.errorFactory("goal_tree_proposal.item_id_duplicate", "同一份提案中的 item_id 不能重复");
      }
      ids.add(itemId);
      const issues: Array<{ code: string; path: string; message: string; expected?: string }> = [];
      let source: ReturnType<GovernanceProvenanceApi["normalizeProposalSource"]> | undefined;
      try { source = this.provenance.normalizeProposalSource(rawItem, index); }
      catch (error) {
        const details = (error as { details?: { issues?: typeof issues } }).details;
        if (!details?.issues) throw error;
        issues.push(...details.issues);
      }
      const seenObjects = new Set<string>();
      const affectedObjects: ProposalAffectedObject[] = [];
      const addAffectedObject = (object: ProposalAffectedObject, objectIndex: number): void => {
        const path = `items[${index}].affected_objects[${objectIndex}]`;
        if (!object || typeof object !== "object" || !GOAL_TREE_WRITE_AFFECTED_OBJECT_TYPES.has(object.object_type)) {
          issues.push({ code: "goal_tree_proposal.affected_object_type_invalid", path: `${path}.object_type`,
            message: `${path}.object_type 必须是 goal 或 relation；使用 object_type/object_id，不能使用 kind/id` });
        }
        const objectId = typeof object?.object_id === "string" ? object.object_id.trim() : "";
        if (!objectId) issues.push({ code: "goal_tree_proposal.affected_object_required", path: `${path}.object_id`,
          message: `${path}.object_id 必须是非空对象 ID` });
        if (!objectId || !object || !GOAL_TREE_WRITE_AFFECTED_OBJECT_TYPES.has(object.object_type)) return;
        const key = `${object.object_type}:${objectId}`;
        if (seenObjects.has(key)) return;
        seenObjects.add(key);
        affectedObjects.push({ object_type: object.object_type, object_id: objectId });
      };
      if (item.affected_objects !== undefined && !Array.isArray(item.affected_objects)) {
        issues.push({ code: "goal_tree_proposal.affected_objects_required", path: `items[${index}].affected_objects`,
          message: `items[${index}].affected_objects 必须是对象数组；Goal 和关系条目可省略，让系统从 payload 推导` });
      } else item.affected_objects?.forEach(addAffectedObject);
      if (item.kind === "goal") {
        const goalId = String(payload.goal_id ?? "").trim();
        if (goalId) addAffectedObject({ object_type: "goal", object_id: goalId }, affectedObjects.length);
      }
      if (item.kind === "relation") {
        const relationId = String(payload.relation_id ?? "").trim();
        const fromGoalId = String(payload.from_goal_id ?? "").trim();
        const toGoalId = String(payload.to_goal_id ?? "").trim();
        if (relationId) addAffectedObject({ object_type: "relation", object_id: relationId }, affectedObjects.length);
        if (fromGoalId) addAffectedObject({ object_type: "goal", object_id: fromGoalId }, affectedObjects.length);
        if (toGoalId) addAffectedObject({ object_type: "goal", object_id: toGoalId }, affectedObjects.length);
      }
      if (affectedObjects.length === 0 && issues.length === 0) {
        issues.push({ code: "goal_tree_proposal.affected_objects_required", path: `items[${index}].affected_objects`,
          message: `第 ${index + 1} 个条目必须标出受影响对象；无法从 payload 推导时提供 object_type/object_id` });
      }
      if (issues.length) {
        throw this.errorFactory(issues[0]!.code, issues.map(issue => `${issue.path}: ${issue.message}`).join("\n"), {
          path: issues[0]!.path, issues,
          recovery: "修正列出的字段后重试 molis_work_v1_goal_tree_propose；失败调用不会创建提案，无需切换接口。",
        });
      }
      return {
        item_id: itemId,
        kind: item.kind,
        operation: item.operation,
        payload: canonicalize(payload) as Record<string, unknown>,
        ...source!,
        explanation: this.normalizeGoalTreeProposalItemExplanation(item.explanation, index),
        affected_objects: affectedObjects,
        supersedes_item_id: item.supersedes_item_id?.trim() || null,
      };
    });
    for (const [index, item] of normalized.entries()) {
      if (items.length >= LARGE_GOAL_TREE_PROPOSAL_ITEM_COUNT && !item.explanation) {
        throw this.errorFactory(
          "goal_tree_proposal.item_explanation_required",
          `包含 ${items.length} 项变化的大型 Goal Tree 提案中，第 ${index + 1} 项必须用 explanation 说明主要问题、预期效果、非目标和与其他 change 的依赖`,
        );
      }
      for (const dependencyId of item.explanation?.depends_on_item_ids ?? []) {
        if (dependencyId === item.item_id) {
          throw this.errorFactory(
            "goal_tree_proposal.item_dependency_self",
            `第 ${index + 1} 个条目不能把自己列为语义依赖`,
          );
        }
        if (!ids.has(dependencyId)) {
          throw this.errorFactory(
            "goal_tree_proposal.item_dependency_unknown",
            `第 ${index + 1} 个条目引用了同一提案中不存在的依赖 item_id「${dependencyId}」`,
          );
        }
      }
    }
    return normalized;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
