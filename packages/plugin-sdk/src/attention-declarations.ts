import { ATTENTION_SUBJECT_TYPES } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { PLUGIN_ATTENTION_WRITE_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-attention";

// The shape of a Manifest's `attention` (PG-087, S9-0b): the kinds of subject the plugin's own objects are, which is what lets it add
// an Inbox entry about one. Only the shape and the permission are checked here; what an entry may say, and when it may be written, is
// for the platform while it runs (apps/local-host `pluginAttentionFor`). `parsePluginManifest` is the one caller.

export function attentionDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["attention 必须为对象"];
  const extra = Object.keys(value).filter(field => field !== "subjects" && field !== "inbox");
  if (extra.length > 0) return [`attention 不认这些字段：${extra.join("、")}`];
  const problems: string[] = permissions.has(PLUGIN_ATTENTION_WRITE_PERMISSION) ? [] : [`声明 attention.subjects 要同时声明权限 ${PLUGIN_ATTENTION_WRITE_PERMISSION}`];
  if (!Array.isArray(value.subjects) || value.subjects.length === 0) return [...problems, "attention.subjects 至少要声明一种对象"];
  const seen = new Set<string>();
  for (const subject of value.subjects) {
    if (typeof subject !== "string" || !(ATTENTION_SUBJECT_TYPES as readonly string[]).includes(subject)) {
      problems.push(`attention.subjects 只能是平台登记的对象种类：${ATTENTION_SUBJECT_TYPES.join("、")}`);
    } else if (seen.has(subject)) problems.push(`attention.subjects 重复：${subject}`);
    else seen.add(subject);
  }
  if (value.inbox !== undefined) problems.push(...inboxProblems(value.inbox, seen));
  return problems;
}

/** `attention.inbox` lists some of `attention.subjects`, each once: a kind the plugin cannot write is not one it can put in the Inbox. */
function inboxProblems(inbox: unknown, subjects: ReadonlySet<string>): string[] {
  if (!Array.isArray(inbox) || inbox.length === 0) return ["attention.inbox 至少要列一种对象，不需要进收件箱就不要写这一项"];
  const problems: string[] = [], seen = new Set<string>();
  for (const subject of inbox) {
    if (typeof subject !== "string" || !subjects.has(subject)) problems.push("attention.inbox 只能列 attention.subjects 里声明过的对象种类");
    else if (seen.has(subject)) problems.push(`attention.inbox 重复：${subject}`);
    else seen.add(subject);
  }
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
