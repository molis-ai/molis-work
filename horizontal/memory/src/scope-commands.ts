import type { AgentMemoryScopePreview } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryClearResult, MemoryExportPackage, MemoryLedgerPort, MemoryMetaRecord, MemoryItem, MemoryPrefs, MemoryScope, MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendEntry, MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryOperations } from "./operations.js";
import { MemoryPreferences } from "./preferences.js";
import { memoryErrors } from "./errors.js";
import { fromEntryMeta } from "./facts.js";
import { isExpired, personOnly, placeOf, visibleTo } from "./places.js";
import { packageFingerprint, readPackage } from "./shapes.js";

export interface Located { scope: MemoryScope; owner: string; entry: MemoryBackendEntry; meta: MemoryMetaRecord; project?: string | null }
interface ScopePorts {
  backend: MemoryBackendPort;
  ledger: MemoryLedgerPort;
  preferences: MemoryPreferences;
  operations: MemoryOperations;
  now: () => Date;
  newId: () => string;
  timeZone?: string;
  importEntry(caller: MemoryCaller, scope: MemoryScope, entry: MemoryExportPackage["entries"][number], origin: string): Promise<MemoryWriteResult>;
  beforeForget(caller: MemoryCaller, scope: MemoryScope, owner: string, ids: readonly string[]): Promise<void>;
  recordClear(caller: MemoryCaller, scope: MemoryScope, owner: string, removed: number, complete: boolean): void;
}

/** Scope-level management shares the same authorized backend and canonical projection as individual commands. */
export class MemoryScopeCommands {
  constructor(private readonly ports: ScopePorts) {}
  /** A scope's switches: the person's own, or the project's (a Character's memories follow its project's). */
  prefsAt(actorId: string, where: { scope: MemoryScope; owner: string; project?: string | null }): MemoryPrefs {
    return where.scope === "personal" ? this.ports.preferences.prefsFor(actorId, "personal", null) : this.ports.preferences.prefsFor(actorId, "project", where.scope === "project" ? where.owner : where.project ?? null);
  }

  /** Personal always; the caller's project when it has one. A person's scopes for listings include the project too. */
  scopesFor(caller: MemoryCaller, requested?: readonly MemoryScope[], lenient = false): Array<{ scope: MemoryScope; owner: string; project: string | null }> {
    const wanted = requested?.length ? requested : (["personal", "project", "character"] as MemoryScope[]);
    const out: Array<{ scope: MemoryScope; owner: string; project: string | null }> = [];
    for (const scope of new Set(wanted)) {
      if (scope === "project" && !caller.project_id) { if (lenient || !requested?.length) continue; throw memoryErrors.scope("这里没有项目，只能用个人记忆"); }
      if (scope === "character" && !caller.character) {
        // The person in a project's settings sees every Character's memories there; a work sees only its own Character's.
        if (caller.person && caller.project_id) { for (const owner of this.ports.ledger.owners(caller.project_id).filter(item => item.scope === "character")) out.push({ scope: "character", owner: owner.owner, project: caller.project_id }); continue; }
        if (lenient || !requested?.length) continue;
        throw memoryErrors.scope("这一轮不是由某个角色承担的，没有角色记忆");
      }
      out.push(placeOf(caller, scope));
    }
    return out;
  }

  async located(caller: MemoryCaller, scope: MemoryScope, owner: string): Promise<Located[]> {
    const entries = await this.ports.backend.withCaller(caller).list(scope, owner);
    const project = scope === "project" ? owner : scope === "character" ? caller.project_id : null;
    // Every entry this service writes carries its facts; one without them is not the platform's and stays out of sight.
    return entries.flatMap(entry => {
      const meta = fromEntryMeta({ memory_id: entry.memory_id, scope, owner, meta: entry.meta, ...(entry.paused ? { paused: entry.paused } : {}), ...(entry.disabled ? { disabled: entry.disabled } : {}),
        created_at_ms: entry.created_at_ms, updated_at_ms: entry.updated_at_ms });
      return meta ? [{ scope, owner, entry, project, meta }] : [];
    });
  }

  async find(caller: MemoryCaller, memoryId: string): Promise<Located> {
    for (const where of this.scopesFor(caller, undefined, true)) {
      const found = (await this.located(caller, where.scope, where.owner)).find(located => located.entry.memory_id === memoryId);
      if (found && visibleTo(caller, found.meta)) return found;
    }
    throw memoryErrors.not_found("这条记忆不在这里（可能已删除，或属于别的项目）");
  }

  characterEntry(located: Located): { title: string; subject: string | null } | undefined {
    return this.ports.ledger.owners(located.project ?? "").find(owner => owner.scope === "character" && owner.owner === located.owner);
  }

  item(located: Located): MemoryItem {
    const meta = located.meta, use = this.ports.ledger.lastUse(located.entry.memory_id);
    const expired = meta.state === "active" && isExpired(meta, this.ports.now());
    return { memory_id: located.entry.memory_id, version: located.entry.version, scope: located.scope,
      project_id: located.scope === "project" ? located.owner : located.scope === "character" ? located.project ?? null : null, character_id: located.scope === "character" ? this.characterEntry(located)?.subject ?? null : null,
      character_title: located.scope === "character" ? this.characterEntry(located)?.title ?? null : null,
      kind: meta.kind, text: located.entry.text, source: meta.source, basis: meta.basis, origin: located.entry.origin, evidence: meta.evidence, applies: meta.applies,
      state: expired ? "disabled" : meta.state, state_reason: expired ? `已于 ${meta.expires_at!.slice(0, 10)} 到期` : meta.state_reason, expires_at: meta.expires_at,
      approved_by: meta.approved_by, plugin_id: meta.plugin_id, created_at: meta.created_at, updated_at: meta.updated_at,
      last_used: use ? { at: use.at, consumer: use.consumer, title: use.title, ...(use.work_id ? { work_id: use.work_id } : {}) } : null };
  }

  /* ---- clearing, export and import (spec §6, §8.1, §10.1 数据) ---- */

  /** The existing marker holds only the fixed SDK decision, never memory contents. */
  async previewScope(caller: MemoryCaller, scope: MemoryScope): Promise<{ scope: MemoryScope; project_id: string | null; count: number; fingerprint: string }> {
    personOnly(caller, "只有本人能清空记忆");
    const where = placeOf(caller, scope), parts = await this.clearPreviews(caller, scope);
    const fingerprint = `clear-${this.ports.newId()}`;
    this.ports.ledger.setMarker(caller.actor_id, `memory-clear:${fingerprint}`, { scope, owner: where.owner, parts, started: false }, this.ports.now().toISOString());
    return { scope, project_id: scope === "project" ? where.owner : null, count: parts.reduce((sum, part) => sum + part.count, 0), fingerprint };
  }

  /** Retry exactly the confirmed versions; an unknown or conflicting item never becomes a successful whole clear. */
  async clearScope(caller: MemoryCaller, scope: MemoryScope, fingerprint: string): Promise<MemoryClearResult> {
    caller = this.ports.operations.caller(caller);
    personOnly(caller, "只有本人能清空记忆");
    const where = placeOf(caller, scope), key = `memory-clear:${fingerprint}`;
    const marker = this.ports.ledger.marker(caller.actor_id, key);
    const preview = marker?.body as { scope: MemoryScope; owner: string; parts: Array<{ scope: MemoryScope; owner: string } & AgentMemoryScopePreview>; started: boolean } | undefined;
    if (!marker || !preview || preview.scope !== scope || preview.owner !== where.owner) throw memoryErrors.conflict("没有这次清空预览，请重新预览后确认");
    const backend = this.ports.backend.withCaller(caller);
    if (!preview.started) {
      // Preserve the pre-confirmation changed-scope refusal, but never rebuild the SDK decisions after a partial attempt.
      const targetKeys = (targets: readonly { scope: MemoryScope; owner: string }[]) => targets.map(target => `${target.scope}:${target.owner}`).sort();
      if (JSON.stringify(targetKeys(this.clearTargets(caller, scope))) !== JSON.stringify(targetKeys(preview.parts)))
        throw memoryErrors.conflict("预览之后范围内又有记忆变动，没有删除任何一条；请重新预览后再确认");
      for (const part of preview.parts) {
        const current = (await backend.list(part.scope, part.owner)).map(item => [item.memory_id, item.version]).sort();
        const original = part.items.map(item => [item.memory_id, item.version]).sort();
        if (JSON.stringify(current) !== JSON.stringify(original)) throw memoryErrors.conflict("预览之后又有记忆变动，没有删除任何一条；请重新预览后再确认");
      }
      this.ports.ledger.setMarker(caller.actor_id, key, { ...preview, started: true }, marker.at);
    }
    const items: MemoryClearResult["items"] = [];
    for (const [index, part] of preview.parts.entries()) {
      await this.ports.beforeForget({ ...caller, operation_id: part.operation_id }, part.scope, part.owner, part.items.map(item => item.memory_id));
      const result = await backend.clearScope({ scope: part.scope, owner: part.owner, preview: part,
        operation_id: part.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
      items.push(...result.items.map(item => ({ memory_id: item.memory_id, outcome: item.outcome })));
      this.ports.ledger.transaction(() => {
        for (const item of result.items) if (item.outcome === "completed" || item.outcome === "already-absent") this.ports.ledger.forget(item.memory_id);
      });
      if (result.items.some(item => item.outcome === "unknown")) {
        for (const remaining of preview.parts.slice(index + 1))
          items.push(...remaining.items.map(item => ({ memory_id: item.memory_id, outcome: "not-executed" as const })));
        break;
      }
    }
    const removed = items.filter(item => item.outcome === "completed" || item.outcome === "already-absent").length;
    const complete = removed === items.length;
    this.ports.recordClear(caller, scope, where.owner, removed, complete);
    return { removed, complete, items };
  }

  private clearTargets(caller: MemoryCaller, scope: MemoryScope): Array<{ scope: MemoryScope; owner: string }> {
    const where = placeOf(caller, scope);
    return [{ scope, owner: where.owner }, ...(scope === "project"
      ? this.ports.ledger.owners(where.owner).filter(owner => owner.scope === "character").map(owner => ({ scope: "character" as const, owner: owner.owner })) : [])];
  }

  private async clearPreviews(caller: MemoryCaller, scope: MemoryScope): Promise<Array<{ scope: MemoryScope; owner: string } & AgentMemoryScopePreview>> {
    const parts = [];
    for (const target of this.clearTargets(caller, scope)) parts.push({ ...target, ...await this.ports.backend.withCaller(caller).previewScope(target.scope, target.owner) });
    return parts;
  }

  /**
   * One scope's memories as a versioned package: text, provenance and `applies.task` with credentials and absolute paths
   * taken out (Prologue's `redactText`; unscreened, nothing is exported), what makes them usable elsewhere, and what was
   * taken out by kind and count. The person's quoted words (evidence) stay behind.
   */
  async exportScope(caller: MemoryCaller, scope: MemoryScope): Promise<MemoryExportPackage> {
    personOnly(caller, "只有本人能导出记忆");
    const where = placeOf(caller, scope);
    const redactions = new Map<string, number>();
    const clean = async (text: string) => {
      const redacted = (await (this.ports.backend.withCaller(caller).screen?.(text) ?? Promise.reject(new Error("no screen"))).catch(() => { throw memoryErrors.unavailable("去掉密钥与本机路径这一步没有完成，所以没有导出；请稍后再试"); })).redacted;
      for (const [kind, token] of [["credential", "[redacted]"], ["absolute-path", "[path]"]] as const) {
        const hits = redacted.split(token).length - 1 - (text.split(token).length - 1);
        if (hits > 0) redactions.set(kind, (redactions.get(kind) ?? 0) + hits);
      }
      return redacted;
    };
    const entries: MemoryExportPackage["entries"] = [];
    for (const located of await this.located(caller, scope, where.owner)) {
      const { applies } = located.meta, task = applies.task === undefined ? {} : { task: await clean(applies.task) };
      const constraints = {
        ...(located.entry.meta.classification ? { classification: structuredClone(located.entry.meta.classification) } : {}),
        ...(located.entry.meta.session_ref ? { session_ref: { ...located.entry.meta.session_ref } } : {}),
        ...(located.entry.meta.namespace ? { namespace: located.entry.meta.namespace } : {}),
      };
      // Redacting an identifier would change its meaning; an unsafe constraint makes this export unavailable.
      const encoded = JSON.stringify(constraints);
      if (await clean(encoded) !== encoded) throw memoryErrors.unavailable("分类或会话约束包含不能导出的内容，没有生成记忆包");
      entries.push({ text: await clean(located.entry.text), kind: located.meta.kind, source: located.meta.source, basis: located.meta.basis, applies: { ...applies, ...task }, origin: await clean(located.entry.origin), expires_at: located.meta.expires_at, ...constraints });
    }
    return { format: "molis.memory", version: 2, exported_at: this.ports.now().toISOString(), scope, entries, redactions: [...redactions].map(([kind, count]) => ({ kind, count })) };
  }

  /**
   * Bring a package in. Unknown format or version, or any malformed entry, and nothing is written; the same text is
   * skipped (importing twice adds nothing); each entry goes through the gate; a failure leaves committed items intact for same-operation reconciliation.
   */
  async importScope(caller: MemoryCaller, scope: MemoryScope, pack: unknown): Promise<{ written: number; skipped: number; refused: number }> {
    const { signal, ...identity } = this.ports.operations.caller(caller);
    caller = Object.freeze({ ...structuredClone(identity), ...(signal ? { signal } : {}) });
    personOnly(caller, "只有本人能导入记忆");
    const where = placeOf(caller, scope);
    this.ports.preferences.assertEnabled(caller.actor_id, where);
    const entries = readPackage(pack);
    this.ports.operations.importPackage(caller, scope, where.owner, packageFingerprint(entries));
    const written: string[] = [];
    let skipped = 0, refused = 0;
    for (const [index, item] of entries.entries()) {
      const child = { ...caller, operation_id: `${caller.operation_id}:import:${index}` };
      const stamp = this.ports.operations.begin(child, "import", { kind: "import", scope, owner: where.owner });
      const date = new Intl.DateTimeFormat("zh-CN", { timeZone: this.ports.timeZone, dateStyle: "medium" }).format(new Date(stamp.at));
      const origin = `${date} · 导入 · 原出处：${item.origin.slice(0, 120)}`;
      const result = await this.ports.importEntry(child, scope, item, origin).catch(() => {
          throw memoryErrors.conflict("导入没有全部完成；已提交条目保留，请携原操作号和原文件重试或核对", {
            operation_id: caller.operation_id, completed_memory_ids: [...written], skipped, refused, failed_index: index,
            failed_operation_id: child.operation_id, failed_outcome: "unknown", not_started: entries.length - index - 1,
          });
        });
      if (result.outcome === "written" && result.memory) written.push(result.memory.memory_id);
      else if (result.outcome === "duplicate") skipped += 1;
      else refused += 1;
    }
    return { written: written.length, skipped, refused };
  }

}
