import { MEMORY_KINDS, type MemoryCandidate, type MemoryCandidateRecord, type MemoryChange, type MemoryChangeRecord, type MemoryExportPackage, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryError } from "./errors.js";
import { CONSUMER_LABELS } from "./prefs.js";
import type { MemoryCaller } from "./service.js";

/** The longest memory text, in characters. */
export const MAX_TEXT = 400;

/** What a work's memory use is called in 最近用于: the work, the caller's own label, or the consumer. */
export function useTitle(caller: MemoryCaller, usedFor?: string): string {
  const label = typeof usedFor === "string" ? usedFor.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (caller.work) return `工作「${caller.work.title.slice(0, 40)}」`;
  if (label) return label;
  return caller.consumer === "plugin" && caller.plugin_id ? `插件 ${caller.plugin_id}` : CONSUMER_LABELS[caller.consumer];
}

/** One fingerprint for what a clear will remove across its Prologue scopes (a single scope keeps Prologue's own). */
export function joinedFingerprint(parts: ReadonlyArray<{ scope: MemoryScope; owner: string; count: number; fingerprint: string }>): string {
  const counted = parts.filter((part, index) => index === 0 || part.count > 0);
  return counted.length === 1 ? counted[0]!.fingerprint : counted.map(part => `${part.scope}:${part.owner}=${part.fingerprint}`).join("|");
}

export function candidateView(record: MemoryCandidateRecord): MemoryCandidate {
  const { actor_id: _actor, owner: _owner, ...view } = record;
  return view;
}

export function changeView(record: MemoryChangeRecord): MemoryChange {
  const { actor_id: _actor, owner: _owner, undo: _undo, ...view } = record;
  return view;
}

/** A package is read whole before anything is written: one malformed entry and the whole import is refused. */
export function readPackage(pack: unknown): MemoryExportPackage["entries"] {
  const refuse = (why: string): never => { throw new MemoryError("memory.invalid", `记忆包无法导入：${why}；没有写入任何一条`); };
  if (!pack || typeof pack !== "object") refuse("不是记忆包");
  const value = pack as Partial<MemoryExportPackage>;
  if (value.format !== "molis.memory") refuse("格式不认识");
  if (value.version !== 1) refuse(`版本 ${String(value.version)} 不认识`);
  if (!Array.isArray(value.entries) || value.entries.length > 2000) refuse("条目缺失或太多");
  return value.entries!.map((item, index) => {
    const at = `第 ${index + 1} 条`;
    if (!item || typeof item !== "object") refuse(`${at}损坏`);
    if (typeof item.text !== "string" || !item.text.trim() || item.text.length > MAX_TEXT) refuse(`${at}的内容不合格`);
    if (!MEMORY_KINDS.includes(item.kind)) refuse(`${at}的类别不认识`);
    if (typeof item.origin !== "string") refuse(`${at}缺少出处`);
    if (item.applies !== undefined && (typeof item.applies !== "object" || item.applies === null || Array.isArray(item.applies))) refuse(`${at}的适用情境损坏`);
    if (item.expires_at !== null && item.expires_at !== undefined && (typeof item.expires_at !== "string" || !Number.isFinite(Date.parse(item.expires_at)))) refuse(`${at}的有效期损坏`);
    return { text: item.text.trim(), kind: item.kind, source: "imported", basis: item.basis === "inferred" ? "inferred" : "explicit", applies: item.applies ?? {}, origin: item.origin, expires_at: item.expires_at ?? null };
  });
}

export function pairKey(a: string, b: string, kind: string): string {
  return [kind, ...[a, b].sort()].join("|");
}
