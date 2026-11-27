import {
  attentionErrors,
  isAttentionName,
  type AttentionEntryRecord,
  type AttentionSubjectType,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";

export const ATTENTION_ID_MAX_LENGTH = 500;
export const ATTENTION_DETAIL_MAX_BYTES = 4096;

const DETAIL_MAX_KEYS = 32;
const DETAIL_MAX_ARRAY_LENGTH = 32;
const DETAIL_MAX_STRING_LENGTH = 500;
const DETAIL_MAX_DEPTH = 3;
const DETAIL_MAX_NODES = 128;
const DETAIL_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u;
const DANGEROUS_DETAIL_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FORBIDDEN_DETAIL_TOKENS = [
  "title",
  "summary",
  "body",
  "message",
  "content",
  "credential",
  "cursor",
] as const;

export function isAttentionId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= ATTENTION_ID_MAX_LENGTH;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDetailValue(value: unknown, depth: number, budget: { nodes: number }): void {
  budget.nodes += 1;
  if (budget.nodes > DETAIL_MAX_NODES) {
    throw attentionErrors.invalid_reference("Inbox Entry detail 结构过大");
  }
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw attentionErrors.invalid_reference("Inbox Entry detail 数值无效");
    }
    return;
  }
  if (typeof value === "string") {
    if (value.length > DETAIL_MAX_STRING_LENGTH) {
      throw attentionErrors.invalid_reference("Inbox Entry detail 字段过长");
    }
    return;
  }
  if (Array.isArray(value)) {
    if (depth >= DETAIL_MAX_DEPTH) {
      throw attentionErrors.invalid_reference("Inbox Entry detail 嵌套过深");
    }
    if (value.length > DETAIL_MAX_ARRAY_LENGTH) {
      throw attentionErrors.invalid_reference("Inbox Entry detail 数组过长");
    }
    for (const item of value) {
      assertDetailValue(item, depth + 1, budget);
    }
    return;
  }
  if (isPlainRecord(value)) {
    if (depth >= DETAIL_MAX_DEPTH) {
      throw attentionErrors.invalid_reference("Inbox Entry detail 嵌套过深");
    }
    const keys = Object.keys(value);
    if (keys.length > DETAIL_MAX_KEYS) {
      throw attentionErrors.invalid_reference("Inbox Entry detail 字段过多");
    }
    for (const key of keys) {
      if (DANGEROUS_DETAIL_KEYS.has(key) || !DETAIL_KEY_PATTERN.test(key)) {
        throw attentionErrors.invalid_reference(`Inbox Entry detail 键名无效: ${key}`);
      }
      const lowered = key.toLowerCase();
      if (FORBIDDEN_DETAIL_TOKENS.some((token) => lowered.includes(token))) {
        throw attentionErrors.invalid_reference(`Inbox Entry detail 不能复制 ${key}`);
      }
      assertDetailValue(value[key], depth + 1, budget);
    }
    return;
  }
  throw attentionErrors.invalid_reference("Inbox Entry detail 包含不支持的值类型");
}

export function assertAttentionDetail(detail: unknown): asserts detail is Record<string, unknown> {
  if (!isPlainRecord(detail)) {
    throw attentionErrors.invalid_reference("Inbox Entry detail 必须是结构化对象");
  }
  assertDetailValue(detail, 0, { nodes: 0 });
  let serialized: string;
  try {
    serialized = JSON.stringify(detail);
  } catch {
    throw attentionErrors.invalid_reference("Inbox Entry detail 无法序列化");
  }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > ATTENTION_DETAIL_MAX_BYTES) {
    throw attentionErrors.invalid_reference("Inbox Entry detail 超过大小上限");
  }
}

export function assertAttentionReference(subjectType: AttentionSubjectType, subjectId: string): void {
  if (!isAttentionId(subjectId) || !isAttentionName(subjectType)) {
    throw attentionErrors.invalid_reference("Inbox Entry 必须引用一个有效对象");
  }
}

export function assertAttentionEntryShape(entry: AttentionEntryRecord): void {
  if (!isAttentionId(entry.entry_id)) {
    throw attentionErrors.invalid_reference("Inbox Entry 标识无效");
  }
  if (entry.owner_plugin_id !== null && !isAttentionId(entry.owner_plugin_id)) {
    throw attentionErrors.invalid_reference("Attention 对象必须有明确的主人或 null");
  }
  assertAttentionReference(entry.subject_type, entry.subject_id);
  if (!isAttentionName(entry.reason)) {
    throw attentionErrors.invalid_reference("Inbox Entry 原因无效");
  }
  for (const key of FORBIDDEN_DETAIL_TOKENS) {
    if (Object.hasOwn(entry, key)) {
      throw attentionErrors.invalid_reference(`Inbox Entry 不能复制 ${key}`);
    }
  }
  assertAttentionDetail(entry.detail);
}
