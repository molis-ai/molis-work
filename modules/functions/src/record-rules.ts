import {
  AGENT_MCP_DESTINATION_ID,
  isFunctionDestinationId,
  functionOutputKeys,
  type ChoiceCriterion,
  type FunctionActionMap,
  type FunctionCriteria,
  type FunctionRecord,
  type FunctionSceneMap,
  type FunctionsPrimitive,
  type NoulCriteria,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { functionsErrors, assertOptionKey, isPinnedJevModel } from "./keys.js";

const DEFAULT_CHOICE: readonly ChoiceCriterion[] = [
  { key: "yes", description: "" },
  { key: "no", description: "" },
];
const DEFAULT_NOUL: NoulCriteria = { true_description: "", false_description: "" };
const DEFAULT_SCORE: readonly string[] = ["低", "高"];

export function assertReadyToPublish(record: FunctionRecord): void {
  normalizeInstructions(record.instructions);
  normalizeCriteria(record.primitive, record.criteria, true);
  if (!record.last_preview) {
    throw functionsErrors.preview_required("发布前需要用当前配置成功试跑一次");
  }
  if (record.last_preview.config_hash !== record.config_hash) {
    throw functionsErrors.stale_preview("配置改过了，请用当前说明再试跑一次");
  }
}

export function assertReadyToEvaluate(record: FunctionRecord): void {
  normalizeInstructions(record.instructions);
  normalizeCriteria(record.primitive, record.criteria, true);
}

export function pinModel(record: FunctionRecord): string {
  const resolved = record.last_preview?.model?.trim() ?? "";
  if (isPinnedJevModel(resolved)) return resolved;
  return record.model;
}

export function defaultName(primitive: FunctionsPrimitive): string {
  if (primitive === "noul") return "未命名判断";
  if (primitive === "score") return "未命名评分";
  return "未命名函数";
}

export function defaultCriteria(primitive: FunctionsPrimitive): FunctionCriteria {
  if (primitive === "noul") return DEFAULT_NOUL;
  if (primitive === "score") return [...DEFAULT_SCORE];
  return [...DEFAULT_CHOICE];
}

export function assertPrimitive(value: string): FunctionsPrimitive {
  if (value === "noul" || value === "choice" || value === "score") return value;
  throw functionsErrors.invalid("判断类型须为 Noul、Choice 或 Score");
}

export function assertSceneReference(sceneId: string | null, version: number | null, providerId: string | null): void {
  if (version === null && providerId === null) return;
  if (!sceneId || sceneId === AGENT_MCP_DESTINATION_ID || !Number.isSafeInteger(version) || (version ?? 0) < 1 || typeof providerId !== "string" || !providerId.trim() || providerId !== providerId.trim()) {
    throw functionsErrors.invalid("用途必须同时指定有效场景版本和提供方");
  }
}

export function normalizeSceneId(value: string | null, primitive: FunctionsPrimitive): string | null {
  if (value == null || value === "") return null;
  if (!isFunctionDestinationId(value)) {
    throw functionsErrors.invalid("这个用法不在可选范围里");
  }
  if (primitive === "score" && value !== AGENT_MCP_DESTINATION_ID) {
    throw functionsErrors.invalid("Score 不能绑 Inbox、首页、Feed。");
  }
  return value;
}

export function normalizeSubjectKinds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const kinds: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const kind = item.trim();
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    kinds.push(kind);
  }
  return kinds;
}

export function normalizeActionMap(value: FunctionActionMap, sceneId: string | null, primitive: FunctionsPrimitive, criteria: FunctionCriteria): FunctionActionMap {
  if (sceneId !== AGENT_MCP_DESTINATION_ID) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw functionsErrors.invalid("推荐能力映射格式无效");
  const keys = new Set(functionOutputKeys({ primitive, criteria }));
  const result: Record<string, FunctionActionMap[string]> = {};
  for (const [key, reference] of Object.entries(value)) {
    if (!keys.has(key)) continue;
    if (!reference || typeof reference !== "object" || typeof reference.capability_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(reference.capability_id)
      || !Number.isSafeInteger(reference.version) || reference.version < 1 || typeof reference.provider_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(reference.provider_id)) {
      throw functionsErrors.invalid("推荐能力必须包含准确身份、版本和提供方");
    }
    result[key] = { capability_id: reference.capability_id, version: reference.version, provider_id: reference.provider_id };
  }
  return result;
}

export function normalizeSceneMap(
  value: unknown,
  primitive?: FunctionsPrimitive,
  criteria?: FunctionCriteria,
  sceneId?: string | null,
): FunctionSceneMap {
  if (value == null) return {};
  if (!isRecord(value) || Array.isArray(value)) {
    throw functionsErrors.invalid("映射格式不对");
  }
  const allowed = primitive && criteria
    ? new Set(functionOutputKeys({ primitive, criteria }))
    : null;
  const mapped: Record<string, string> = {};
  for (const [rawKey, rawTarget] of Object.entries(value)) {
    const key = rawKey.trim();
    const target = typeof rawTarget === "string" ? rawTarget.trim() : "";
    if (!key || !target) continue;
    if (allowed && !allowed.has(key)) continue;
    mapped[key] = target;
  }
  return pruneSceneMap(mapped, primitive, criteria, sceneId);
}

export function pruneSceneMap(
  value: FunctionSceneMap,
  primitive?: FunctionsPrimitive,
  criteria?: FunctionCriteria,
  sceneId?: string | null,
): FunctionSceneMap {
  if (sceneId === AGENT_MCP_DESTINATION_ID || sceneId === "") return {};
  if (sceneId === null) return {};
  if (sceneId === undefined) return { ...value };
  if (!primitive || !criteria) return { ...value };
  const allowed = new Set(functionOutputKeys({ primitive, criteria }));
  const mapped: Record<string, string> = {};
  for (const [key, target] of Object.entries(value)) {
    if (!allowed.has(key) || !target) continue;
    mapped[key] = target;
  }
  return mapped;
}

export function normalizeName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 80) throw functionsErrors.invalid("名称须为 1 到 80 个字");
  return name;
}

export function normalizeDraftInstructions(value: string): string {
  const instructions = value.trim();
  if (instructions.length > 8000) throw functionsErrors.invalid("说明须为 1 到 8000 个字");
  return instructions;
}

function normalizeInstructions(value: string): string {
  const instructions = normalizeDraftInstructions(value);
  if (!instructions) throw functionsErrors.invalid("说明须为 1 到 8000 个字");
  return instructions;
}

export function normalizeSampleLabel(value: string | undefined, index: number): string {
  const label = (value ?? "").trim() || `样例 ${index + 1}`;
  if (label.length > 40) throw functionsErrors.invalid("样例名称须为 1 到 40 个字");
  return label;
}

export function normalizeSampleInput(value: string): string {
  const input = value.trim();
  if (!input || input.length > 8000) throw functionsErrors.invalid("样例输入须为 1 到 8000 个字");
  return input;
}

export function normalizeCriteria(primitive: FunctionsPrimitive, value: FunctionCriteria, requireComplete: boolean): FunctionCriteria {
  if (primitive === "noul") return normalizeNoul(value, requireComplete);
  if (primitive === "score") return normalizeScore(value, requireComplete);
  return normalizeChoice(value, requireComplete);
}

function normalizeChoice(value: FunctionCriteria, requireDescriptions: boolean): ChoiceCriterion[] {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item) || !("key" in item))) {
    throw functionsErrors.invalid("选项须是列表");
  }
  const seen = new Set<string>();
  const criteria = (value as readonly ChoiceCriterion[]).map((item) => {
    const key = assertOptionKey(String(item.key ?? "").trim());
    if (seen.has(key)) throw functionsErrors.invalid(`选项 key 重复：${key}`);
    seen.add(key);
    const description = String(item.description ?? "").trim();
    if (description.length > 500) {
      throw functionsErrors.invalid("每个选项需要 1 到 500 字的说明");
    }
    if (requireDescriptions && !description) {
      throw functionsErrors.invalid("每个选项需要 1 到 500 字的说明");
    }
    return { key, description };
  });
  if (criteria.length < 2) throw functionsErrors.invalid("Choice 至少需要两个选项");
  if (criteria.length > 32) throw functionsErrors.invalid("Choice 最多 32 个选项");
  return criteria;
}

function normalizeNoul(value: FunctionCriteria, requireComplete: boolean): NoulCriteria {
  const row = !Array.isArray(value) && value && typeof value === "object"
    ? value as { true_description?: unknown; false_description?: unknown }
    : {};
  const true_description = String(row.true_description ?? "").trim();
  const false_description = String(row.false_description ?? "").trim();
  if (true_description.length > 500 || false_description.length > 500) {
    throw functionsErrors.invalid("判断标准须为 1 到 500 个字");
  }
  if (requireComplete && !true_description && !false_description) {
    // Noul criteria are optional at TypeSafe; instructions already required.
  }
  return { true_description, false_description };
}

function normalizeScore(value: FunctionCriteria, requireComplete: boolean): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw functionsErrors.invalid("Score 档位须是文字列表");
  }
  const levels = (value as readonly string[]).map((item) => item.trim());
  if (levels.some((item) => item.length > 500)) {
    throw functionsErrors.invalid("每个档位需要 1 到 500 字的说明");
  }
  if (requireComplete && (levels.length < 2 || levels.some((item) => !item))) {
    throw functionsErrors.invalid("Score 至少需要两个写了说明的档位");
  }
  if (!requireComplete && levels.length < 2) {
    throw functionsErrors.invalid("Score 至少需要两个档位");
  }
  if (levels.length > 32) throw functionsErrors.invalid("Score 最多 32 个档位");
  return levels;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A function key not yet taken: `key`, or `key_2`, `key_3`… when it is. */
export function uniqueKey(lookup: (key: string) => { id: string } | null, key: string, exceptId?: string): string {
  let candidate = key;
  let n = 2;
  while (keyTaken(lookup, candidate, exceptId)) {
    const suffix = `_${n}`;
    candidate = `${key.slice(0, Math.max(2, 64 - suffix.length))}${suffix}`;
    n += 1;
    if (n > 99) throw functionsErrors.key_conflict("函数 key 已被占用");
  }
  return candidate;
}

export function assertAvailableKey(lookup: (key: string) => { id: string } | null, key: string, exceptId?: string): string {
  if (keyTaken(lookup, key, exceptId)) throw functionsErrors.key_conflict("函数 key 已被占用");
  return key;
}

function keyTaken(lookup: (key: string) => { id: string } | null, key: string, exceptId?: string): boolean {
  const row = lookup(key);
  return Boolean(row && row.id !== exceptId);
}
