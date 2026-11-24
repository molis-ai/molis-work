import { isRecord } from "./json-value.js";
import { ATTENTION_CATEGORIES, isAttentionName } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { PLUGIN_ATTENTION_WRITE_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-attention";

// The shape of a Manifest's `attention` (PG-087, S9-0b): the kinds of subject the plugin's own objects are, which is what lets it add
// an Inbox entry about one. Only the shape and the permission are checked here; what an entry may say, and when it may be written, is
// for the platform while it runs (apps/local-host `pluginAttentionFor`). `parsePluginManifest` is the one caller.

export function attentionDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["attention 必须为对象"];
  const extra = Object.keys(value).filter(field => field !== "subjects" && field !== "waiting");
  if (extra.length > 0) return [`attention 不认这些字段：${extra.join("、")}`];
  const problems: string[] = permissions.has(PLUGIN_ATTENTION_WRITE_PERMISSION) ? [] : [`声明 attention.subjects 要同时声明权限 ${PLUGIN_ATTENTION_WRITE_PERMISSION}`];
  if (!Array.isArray(value.subjects) || value.subjects.length === 0) return [...problems, "attention.subjects 至少要声明一种对象"];
  const seen = new Set<string>(), kinds = new Set<string>();
  for (const subject of value.subjects) {
    if (!isRecord(subject) || Object.keys(subject).some(field => field !== "type" && field !== "object_kind" && field !== "reasons")
      || !isAttentionName(subject.type) || !isAttentionName(subject.object_kind)) {
      problems.push("attention.subjects 的每一项要有 type、object_kind（小写字母开头，小写字母、数字或下划线，最长 64）与 reasons");
      continue;
    }
    if (seen.has(subject.type)) problems.push(`attention.subjects 重复：${subject.type}`);
    if (kinds.has(subject.object_kind)) problems.push(`attention.subjects 里两种对象指向同一个 object_kind：${subject.object_kind}`);
    seen.add(subject.type);
    kinds.add(subject.object_kind);
    problems.push(...reasonProblems(subject.type, subject.reasons));
  }
  if (value.waiting !== undefined) problems.push(...waitingProblems(value.waiting, seen));
  return problems;
}

/** A type's reasons: at least one, each named once, with at most the one thing it asks of the person. */
function reasonProblems(type: string, reasons: unknown): string[] {
  if (!Array.isArray(reasons) || reasons.length === 0) return [`attention.subjects 的 ${type} 至少要声明一个 reason`];
  const problems: string[] = [], seen = new Set<string>();
  for (const reason of reasons) {
    if (!isRecord(reason) || Object.keys(reason).some(field => field !== "id" && field !== "attention") || !isAttentionName(reason.id)
      || (reason.attention !== undefined && !(ATTENTION_CATEGORIES as readonly unknown[]).includes(reason.attention))) {
      problems.push(`attention.subjects 的 ${type} 的 reason 要有 id，attention 只能是 ${ATTENTION_CATEGORIES.join("、")}`);
    } else if (seen.has(reason.id)) problems.push(`attention.subjects 的 ${type} 的 reason 重复：${reason.id}`);
    else seen.add(reason.id);
  }
  return problems;
}

/** `attention.waiting` lists some of `attention.subjects`, each once: a kind the plugin cannot write is not one it can put on the person's waiting list. */
function waitingProblems(waiting: unknown, subjects: ReadonlySet<string>): string[] {
  if (!Array.isArray(waiting) || waiting.length === 0) return ["attention.waiting 至少要列一种对象，不需要进「等你」就不要写这一项"];
  const problems: string[] = [], seen = new Set<string>();
  for (const subject of waiting) {
    if (typeof subject !== "string" || !subjects.has(subject)) problems.push("attention.waiting 只能列 attention.subjects 里声明过的对象种类");
    else if (seen.has(subject)) problems.push(`attention.waiting 重复：${subject}`);
    else seen.add(subject);
  }
  return problems;
}
