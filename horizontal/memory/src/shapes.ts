import { createHash } from "node:crypto";
import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_FORMAL_KINDS, type MemoryCandidate, type MemoryCandidateRecord, type MemoryChange, type MemoryChangeRecord, type MemoryExportPackage, type MemoryFormalKind, type MemoryRevision, type MemoryRevisionView, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { completeRevisionSnapshot } from "./classification.js";
import { memoryErrors } from "./errors.js";
import { fromAppliesWhen } from "./facts.js";
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
  const { actor_id: _actor, owner: _owner, formal_expires_at: _formalExpiry, source_refs: _sourceRefs, ...view } = record;
  return view;
}

export function changeView(record: MemoryChangeRecord): MemoryChange {
  const { actor_id: _actor, owner: _owner, undo: _undo, operation_id: _operation, applied_version: _version, ...view } = record;
  return view;
}

/** Restore's canonical snapshot stays in Prologue Memory; history joins SDK revision contents with ledger attribution. */
export function revisionView(sdkRev: { version: number; text: string; origin: string; meta: AgentMemoryMeta; created_at_ms: number; updated_at_ms: number }, ledgerRev?: MemoryRevision): MemoryRevisionView {
  const expiry = sdkRev.meta.expires_at_ms;
  const fallbackBy = sdkRev.meta.approved_by?.by ?? "person";
  return {
    version: sdkRev.version,
    text: sdkRev.text,
    kind: (sdkRev.meta.kind ?? "fact") as MemoryFormalKind,
    applies: fromAppliesWhen(sdkRev.meta.applies_when),
    change: ledgerRev?.change ?? (sdkRev.version <= 1 ? "created" : "edited"),
    by: ledgerRev?.by ?? fallbackBy,
    at: ledgerRev?.at ?? new Date(sdkRev.updated_at_ms || sdkRev.created_at_ms || 0).toISOString(),
    classification: sdkRev.meta.classification ?? null,
    expires_at: expiry === undefined || !Number.isFinite(new Date(expiry).getTime()) ? null : new Date(expiry).toISOString(),
    snapshot_available: completeRevisionSnapshot(sdkRev),
  };
}

/** A package is read whole before anything is written: one malformed entry and the whole import is refused. */
export function readPackage(pack: unknown): MemoryExportPackage["entries"] {
  const refuse = (why: string): never => { throw memoryErrors.invalid(`记忆包无法导入：${why}；没有写入任何一条`); };
  if (!pack || typeof pack !== "object") refuse("不是记忆包");
  const value = pack as Partial<MemoryExportPackage>;
  if (value.format !== "molis.memory") refuse("格式不认识");
  if (value.version !== /* @version format.memory.export */ 1) refuse(`版本 ${String(value.version)} 不认识`);
  if (!Array.isArray(value.entries) || value.entries.length > 2000) refuse("条目缺失或太多");
  return value.entries!.map((item, index) => {
    const at = `第 ${index + 1} 条`;
    if (!item || typeof item !== "object") refuse(`${at}损坏`);
    if (typeof item.text !== "string" || !item.text.trim() || item.text.length > MAX_TEXT) refuse(`${at}的内容不合格`);
    if (!MEMORY_FORMAL_KINDS.includes(item.kind)) refuse(`${at}的类别不认识`);
    if (typeof item.origin !== "string") refuse(`${at}缺少出处`);
    if (item.applies !== undefined) {
      if (typeof item.applies !== "object" || item.applies === null || Array.isArray(item.applies) || "goal_ids" in item.applies) refuse(`${at}的适用情境损坏`);
      if (item.applies.objects !== undefined && (!Array.isArray(item.applies.objects) || item.applies.objects.length > 20
        || item.applies.objects.some(obj => !obj || typeof obj !== "object" || Array.isArray(obj)
          || typeof obj.plugin_id !== "string" || !obj.plugin_id.trim()
          || typeof obj.kind !== "string" || !obj.kind.trim()
          || typeof obj.id !== "string" || !obj.id.trim()))) refuse(`${at}的适用情境损坏`);
    }
    if (item.expires_at !== null && item.expires_at !== undefined && (typeof item.expires_at !== "string" || !Number.isFinite(Date.parse(item.expires_at)))) refuse(`${at}的有效期损坏`);
    const classification = item.classification;
    if (!classification || typeof classification !== "object" || Array.isArray(classification)
      || !Array.isArray(classification.scenes) || !classification.scenes.length || !classification.scenes.every(scene => typeof scene === "string" && scene.trim())
      || typeof classification.lifecycle !== "string" || !classification.lifecycle.trim()) refuse(`${at}缺少明确分类，请先决定分类后导入`);
    if (classification!.extra !== undefined && (!classification!.extra || typeof classification!.extra !== "object" || Array.isArray(classification!.extra)
      || Object.values(classification!.extra).some(values => !Array.isArray(values) || !values.length || values.some(value => typeof value !== "string" || !value.trim())))) refuse(`${at}的分类扩展损坏`);
    const session = item.session_ref;
    if (session !== undefined && (!session || session.kind !== "session" || typeof session.id !== "string" || !session.id.trim()
      || !Number.isSafeInteger(session.revision) || session.revision < 1)) refuse(`${at}的会话关联损坏`);
    if (item.namespace !== undefined && (typeof item.namespace !== "string" || !item.namespace.trim())) refuse(`${at}的命名空间损坏`);
    if (item.basis !== null && !["explicit", "repeated", "inferred"].includes(item.basis)) refuse(`${at}的依据类别损坏`);
    if (item.state !== undefined) {
      if (!item.state || typeof item.state !== "object" || Array.isArray(item.state)) refuse(`${at}的状态损坏`);
      for (const mark of [item.state.disabled, item.state.paused]) {
        if (mark !== undefined && (!mark || typeof mark !== "object" || Array.isArray(mark)
          || (mark.reason !== undefined && typeof mark.reason !== "string")
          || (mark.at !== null && (typeof mark.at !== "string" || !Number.isFinite(Date.parse(mark.at)))))) refuse(`${at}的状态损坏`);
      }
    }
    return { text: item.text.trim(), kind: item.kind, source: "imported", basis: item.basis, applies: structuredClone(item.applies ?? {}), origin: item.origin, expires_at: item.expires_at ?? null,
      classification: structuredClone(classification!), ...(session ? { session_ref: { ...session } } : {}), ...(item.namespace ? { namespace: item.namespace } : {}),
      ...(item.state ? { state: structuredClone(item.state) } : {}) };
  });
}

/**
 * Business retry identity of the normalized package; no body copy is persisted. Array order remains meaningful.
 * Not `canonicalJsonText`: this digest is stored, and `applies` and `classification.extra` take any key, so integer-shaped keys would hash differently.
 */
export function packageFingerprint(entries: MemoryExportPackage["entries"]): string {
  const encoded = JSON.stringify(entries, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  return createHash("sha256").update(encoded).digest("hex");
}

export function pairKey(a: string, b: string, kind: string): string {
  return [kind, ...[a, b].sort()].join("|");
}
