import { canonicalJsonValue as canonicalize } from "@molis-ai/molis-work-plugin-sdk";
import { goalErrors, type GoalErrorCode } from "./errors.js";
import {
  goalDecisionMethods,
  goalEventFieldFormats,
  goalEventJudgmentVerdicts,
  goalEventSemanticFamilies,
  goalEventTypeSourceKinds,
  type GoalEventAdoptedPlanningRef,
  type GoalEventExtraRequirementInput,
  type GoalEventFieldDefinition,
  type GoalEventRequirementSource,
  type GoalEventJudgmentInput,
  type GoalEventRequirementBinding,
  type GoalEventTypeDefinition,
  type GoalEventTypeDefinitionInput,
  type GoalEventTypeSource,
} from "@molis-ai/molis-work-contracts/modules/goals";

const EXECUTABLE_CONFIG = /<\s*script\b|javascript\s*:|data\s*:\s*text\/html|<\s*iframe\b|\bon[a-z]+\s*=/iu;
const RESERVED_FIELD_IDS = new Set([
  "user_approved",
  "user_approval",
  "approved_by",
  "host_connected",
  "host_connection",
  "independently_verified",
  "independent_verification",
  "fulfillment_state",
  "human_decision",
  "actor_id",
  "actor_kind",
]);
const TYPE_KEYS = new Set(["type_id", "version", "name", "purpose", "semantic_family", "source", "fields"]);
const FIELD_KEYS = new Set(["field_id", "name", "purpose", "format", "required", "source"]);
const REQUIREMENT_KEYS = new Set(["requirement_id", "statement", "bound_type_id", "human_decision_required", "source"]);
const REQUIREMENT_SOURCE_KEYS = new Set([
  "kind", "template_requirement_id", "methods", "decision_method", "pass_condition", "policy_binding_ids",
]);

const REPORT_PROGRESS_KEYS = new Set(["summary", "next_step", "next_actor"]);

export function parseOptionalReportProgress(
  raw: unknown,
): { summary: string; next_step: string | null; next_actor: string | null } | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw goalErrors["goals.event_report.invalid_progress"]("进展必须是含原文的对象，不能是数组或其它类型");
  }
  const record = raw as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((key) => !REPORT_PROGRESS_KEYS.has(key));
  if (unexpected.length) {
    throw goalErrors["goals.event_report.unknown_progress_field"](`不能使用未许可的进展字段：${unexpected.join("、")}`, {
      fields: unexpected,
    });
  }
  if (typeof record.summary !== "string") {
    throw goalErrors["goals.event_progress.summary_required"]("进展摘要需要原文");
  }
  const summary = record.summary.trim();
  if (!summary) {
    throw goalErrors["goals.event_progress.summary_required"]("进展摘要需要原文");
  }
  if (record.next_step != null && typeof record.next_step !== "string") {
    throw goalErrors["goals.event_report.invalid_progress"]("next_step 必须是字符串");
  }
  if (record.next_actor != null && typeof record.next_actor !== "string") {
    throw goalErrors["goals.event_report.invalid_progress"]("next_actor 必须是字符串");
  }
  return {
    summary,
    next_step: record.next_step?.trim() || null,
    next_actor: record.next_actor?.trim() || null,
  };
}

export function assertConfigText(value: string, label: string): string {
  if (typeof value !== "string") {
    throw goalErrors["goals.event_config.invalid_text"](`${label}必须是文本`);
  }
  if (EXECUTABLE_CONFIG.test(value)) {
    throw goalErrors["goals.event_config.executable_content"](`${label}不能包含可执行内容`);
  }
  return value;
}

export function requiredText(value: string | undefined, code: GoalErrorCode, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw goalErrors[code](message);
  return value;
}

function normalizeTypeSource(source: GoalEventTypeSource | undefined, actorId: string): GoalEventTypeSource {
  const kind = source?.kind ?? "local";
  if (!goalEventTypeSourceKinds.includes(kind)) {
    throw goalErrors["goals.event_config.invalid_source"]("事件类型来源无效");
  }
  const normalized: GoalEventTypeSource = { kind };
  if (source?.method_id != null) {
    normalized.method_id = assertConfigText(requiredText(source.method_id, "goals.event_config.invalid_source", "规划方法 ID 不能为空"), "规划方法 ID");
  }
  if (source?.method_version != null) {
    if (!Number.isInteger(source.method_version) || source.method_version < 1) {
      throw goalErrors["goals.event_config.invalid_source"]("规划方法版本必须是正整数");
    }
    normalized.method_version = source.method_version;
  }
  if (source?.label != null) {
    normalized.label = assertConfigText(source.label, "类型来源说明");
  }
  if (source?.contributing_methods?.length) {
    normalized.contributing_methods = source.contributing_methods.map((method) => ({
      method_id: assertConfigText(requiredText(method.method_id, "goals.event_config.invalid_source", "规划方法 ID 不能为空"), "规划方法 ID"),
      version: method.version,
      source: method.source,
      ...(method.name ? { name: assertConfigText(method.name, "规划方法名称") } : {}),
    }));
  }
  if (!normalized.label) normalized.label = kind === "runtime" ? `Runtime · ${actorId}` : kind === "planning" ? "工作规划" : "当前 Goal 局部定义";
  return normalized;
}

export function normalizeTypeDefinition(
  input: GoalEventTypeDefinitionInput,
  actorId: string,
): GoalEventTypeDefinition {
  assertAllowedKeys(input, TYPE_KEYS, "事件类型");
  const typeId = requiredText(input.type_id, "goals.event_config.type_id_required", "事件类型 ID 不能为空").trim();
  if (typeId.includes("/") || /\s/u.test(typeId)) {
    throw goalErrors["goals.event_config.invalid_type_id"]("事件类型 ID 不能包含空白或路径分隔符");
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw goalErrors["goals.event_config.invalid_type_version"]("事件类型版本必须从 1 开始");
  }
  const name = assertConfigText(requiredText(input.name, "goals.event_config.type_name_required", "事件类型名称不能为空").trim(), "事件类型名称");
  const purpose = assertConfigText(requiredText(input.purpose, "goals.event_config.type_purpose_required", "事件类型用途不能为空").trim(), "事件类型用途");
  let semanticFamily = input.semantic_family;
  if (semanticFamily != null && !goalEventSemanticFamilies.includes(semanticFamily)) {
    throw goalErrors["goals.event_config.unsupported_semantic_family"]("不支持的事件语义分类");
  }
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    throw goalErrors["goals.event_config.fields_required"]("事件类型至少需要一个字段");
  }
  const fields = input.fields.map((field, index) => normalizeField(field, index));
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.field_id)) {
      throw goalErrors["goals.event_config.duplicate_field_id"](`字段 ID 重复: ${field.field_id}`, { field_id: field.field_id });
    }
    seen.add(field.field_id);
  }
  return {
    type_id: typeId,
    version: input.version,
    name,
    purpose,
    semantic_family: semanticFamily,
    source: normalizeTypeSource(input.source, actorId),
    fields,
  };
}

function normalizeField(field: GoalEventFieldDefinition, index: number): GoalEventFieldDefinition {
  assertAllowedKeys(field, FIELD_KEYS, `字段 ${index + 1}`);
  const fieldId = requiredText(field.field_id, "goals.event_config.field_id_required", `字段 ${index + 1} 缺少稳定 ID`).trim();
  if (RESERVED_FIELD_IDS.has(fieldId)) {
    throw goalErrors["goals.event_config.reserved_field"](`字段 ID ${fieldId} 不能用来伪造批准或连接状态`, { field_id: fieldId });
  }
  if (!goalEventFieldFormats.includes(field.format)) {
    throw goalErrors["goals.event_config.unsupported_field_format"](`不支持的字段格式: ${String(field.format)}`, { field_id: fieldId });
  }
  if (typeof field.required !== "boolean") {
    throw goalErrors["goals.event_config.invalid_field"](`字段 ${fieldId} 必须声明是否必填`);
  }
  const source = field.source
    ? {
        kind: field.source.kind,
        ...(field.source.method_id ? { method_id: assertConfigText(field.source.method_id, "字段来源") } : {}),
        ...(field.source.label ? { label: assertConfigText(field.source.label, "字段来源说明") } : {}),
      }
    : { kind: "local" as const };
  if (source.kind !== "local" && source.kind !== "planning") {
    throw goalErrors["goals.event_config.invalid_field_source"](`字段 ${fieldId} 的来源无效`);
  }
  return {
    field_id: fieldId,
    name: assertConfigText(requiredText(field.name, "goals.event_config.field_name_required", `字段 ${fieldId} 缺少名称`).trim(), "字段名称"),
    purpose: assertConfigText(requiredText(field.purpose, "goals.event_config.field_purpose_required", `字段 ${fieldId} 缺少用途`).trim(), "字段用途"),
    format: field.format,
    required: field.required,
    source,
  };
}

export function assertNextTypeVersion(previous: GoalEventTypeDefinition, next: GoalEventTypeDefinition): void {
  if (next.type_id !== previous.type_id) {
    throw goalErrors["goals.event_config.invalid_type_id"]("新类型版本必须使用原来的类型 ID");
  }
}

function typeShape(type: Pick<GoalEventTypeDefinition, "type_id" | "version" | "name" | "purpose" | "semantic_family" | "fields">): unknown {
  return canonicalize({
    type_id: type.type_id,
    version: type.version,
    name: type.name,
    purpose: type.purpose,
    semantic_family: type.semantic_family ?? null,
    fields: type.fields.map((field) => ({
      field_id: field.field_id,
      name: field.name,
      purpose: field.purpose,
      format: field.format,
      required: field.required,
    })),
  });
}

export function sameTypeShape(
  left: Pick<GoalEventTypeDefinition, "type_id" | "version" | "name" | "purpose" | "semantic_family" | "fields">,
  right: Pick<GoalEventTypeDefinition, "type_id" | "version" | "name" | "purpose" | "semantic_family" | "fields">,
): boolean {
  return JSON.stringify(typeShape(left)) === JSON.stringify(typeShape(right));
}

export function normalizeAdoptedPlanning(
  input: GoalEventAdoptedPlanningRef[] | undefined,
  previous: GoalEventAdoptedPlanningRef[],
): GoalEventAdoptedPlanningRef[] {
  const incoming = input ?? previous;
  const seen = new Set<string>();
  const normalized: GoalEventAdoptedPlanningRef[] = [];
  for (const item of incoming) {
    const methodId = requiredText(item.method_id, "goals.event_config.invalid_planning", "采用的规划方法 ID 不能为空").trim();
    if (!Number.isInteger(item.version) || item.version < 1) {
      throw goalErrors["goals.event_config.invalid_planning"]("采用的规划版本必须是正整数");
    }
    if (!["built_in", "personal", "project"].includes(item.source)) {
      throw goalErrors["goals.event_config.invalid_planning"]("采用的规划来源无效");
    }
    const key = `${item.source}:${methodId}:${item.version}`;
    if (seen.has(key)) throw goalErrors["goals.event_config.duplicate_planning"](`重复采用规划: ${methodId}`);
    seen.add(key);
    normalized.push({ method_id: methodId, version: item.version, source: item.source });
  }
  return normalized;
}

export function normalizeNewRequirement(input: GoalEventExtraRequirementInput): GoalEventExtraRequirementInput {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw goalErrors["goals.event_config.invalid_requirement"]("新增要求必须是对象");
  }
  assertAllowedKeys(input, REQUIREMENT_KEYS, "新增要求");
  if (input.human_decision_required != null && typeof input.human_decision_required !== "boolean") {
    throw goalErrors["goals.event_config.invalid_human_decision_required"]("human_decision_required 必须是布尔值");
  }
  return {
    requirement_id: requiredText(input.requirement_id, "goals.event_config.requirement_id_required", "新增要求必须有稳定 ID").trim(),
    statement: assertConfigText(requiredText(input.statement, "goals.event_config.requirement_statement_required", "新增要求必须说明具体结果").trim(), "新增要求"),
    bound_type_id: input.bound_type_id?.trim() || undefined,
    human_decision_required: input.human_decision_required === true,
    source: input.source ? normalizeRequirementSource(input.source) : undefined,
  };
}

function normalizeRequirementSource(source: GoalEventRequirementSource): GoalEventRequirementSource {
  assertAllowedKeys(source, REQUIREMENT_SOURCE_KEYS, "局部要求来源");
  if (source.kind === "create_input") return { kind: "create_input" };
  if (source.kind === "imported_acceptance_criterion") {
    if (!(goalDecisionMethods as readonly string[]).includes(String(source.decision_method))) {
      throw goalErrors["goals.event_config.invalid_requirement_source"](`导入的验收条件判断方式只能是 ${goalDecisionMethods.join("、")} 之一`);
    }
    return {
      kind: "imported_acceptance_criterion",
      decision_method: source.decision_method,
      pass_condition: String(source.pass_condition ?? ""),
    };
  }
  if (source.kind === "imported_human_approval") {
    return {
      kind: "imported_human_approval",
      policy_binding_ids: Array.isArray(source.policy_binding_ids) ? source.policy_binding_ids.map(String) : [],
    };
  }
  if (source.kind !== "planning") throw goalErrors["goals.event_config.invalid_requirement_source"]("局部要求来源无效");
  const templateId = requiredText(source.template_requirement_id, "goals.event_config.invalid_requirement_source", "规划要求必须保留模板 ID").trim();
  if (!Array.isArray(source.methods) || source.methods.length === 0) {
    throw goalErrors["goals.event_config.invalid_requirement_source"]("规划要求必须保留来源方法");
  }
  return {
    kind: "planning",
    template_requirement_id: templateId,
    methods: source.methods.map((method) => ({
      method_id: requiredText(method.method_id, "goals.event_config.invalid_requirement_source", "规划方法 ID 不能为空").trim(),
      version: method.version,
      source: method.source,
      ...(method.name ? { name: method.name } : {}),
    })),
  };
}

export function normalizeBinding(input: GoalEventRequirementBinding): GoalEventRequirementBinding {
  return {
    type_id: requiredText(input.type_id, "goals.event_config.binding_type_required", "要求绑定必须包含类型 ID").trim(),
    requirement_id: requiredText(input.requirement_id, "goals.event_config.binding_requirement_required", "要求绑定必须包含要求 ID").trim(),
  };
}

export function normalizeJudgments(judgments: GoalEventJudgmentInput[] | undefined): GoalEventJudgmentInput[] {
  if (judgments == null) return [];
  if (!Array.isArray(judgments)) throw goalErrors["goals.event_report.invalid_judgments"]("要求判断必须是列表");
  const seen = new Set<string>();
  return judgments.map((item) => {
    const requirementId = requiredText(item.requirement_id, "goals.event_report.requirement_id_required", "要求判断缺少要求 ID").trim();
    if (seen.has(requirementId)) {
      throw goalErrors["goals.event_report.duplicate_requirement"](`同一事件不能对同一要求重复判断: ${requirementId}`);
    }
    seen.add(requirementId);
    if (!goalEventJudgmentVerdicts.includes(item.verdict)) {
      throw goalErrors["goals.event_report.invalid_verdict"](`要求判断无效: ${String(item.verdict)}`, { requirement_id: requirementId });
    }
    return { requirement_id: requirementId, verdict: item.verdict };
  });
}

export function ownStringRecord(value: unknown): Record<string, string> {
  const record = Object.create(null) as Record<string, string>;
  if (value == null || typeof value !== "object" || Array.isArray(value)) return record;
  for (const key of Object.keys(value)) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === "string") setOwn(record, key, item);
  }
  return record;
}

export function normalizePayload(
  fields: GoalEventFieldDefinition[],
  payload: Record<string, string>,
): Record<string, string> {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    throw goalErrors["goals.event_report.invalid_payload"]("领域字段必须是对象");
  }
  const allowed = new Map(fields.map((field) => [field.field_id, field]));
  const normalized = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(payload)) {
    if (RESERVED_FIELD_IDS.has(key)) {
      throw goalErrors["goals.event_report.forged_authority"](`领域 payload 不能伪造 ${key}`, { field_id: key });
    }
    const field = allowed.get(key);
    if (!field) throw goalErrors["goals.event_report.unknown_field"](`未登记的字段: ${key}`, { field_id: key });
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value !== "string") {
      throw goalErrors["goals.event_report.invalid_field_value"](`字段 ${key} 必须是文本`, { field_id: key });
    }
    setOwn(normalized, key, value);
  }
  for (const field of fields) {
    const value = Object.hasOwn(normalized, field.field_id) ? normalized[field.field_id] : undefined;
    if (field.required && (value == null || !value.trim())) {
      throw goalErrors["goals.event_report.missing_required_field"](`缺少必填字段: ${field.field_id}`, { field_id: field.field_id });
    }
    if (!Object.hasOwn(normalized, field.field_id)) setOwn(normalized, field.field_id, "");
  }
  return normalized;
}

function setOwn(target: Record<string, string>, key: string, value: string): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export function assertAllowedKeys(
  value: object,
  allowed: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw goalErrors["goals.event_config.unsupported_property"](`${label}不支持配置 ${key}；本项只接受已声明的文本字段定义`);
    }
  }
}
