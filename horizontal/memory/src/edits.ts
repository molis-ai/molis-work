import { MEMORY_FORMAL_KINDS, type MemoryChangeRequest, type MemoryChangeResult, type MemoryChangeRecord, type MemoryLedgerPort, type MemoryMetaRecord } from "@molis-ai/molis-work-contracts/services/memory";
import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryOperations } from "./operations.js";
import { MemoryScopeCommands, type Located } from "./scope-commands.js";
import { correctedMemoryMeta, completeRevisionSnapshot } from "./classification.js";
import { fromEntryMeta, toEntryMeta } from "./facts.js";
import { disownAutomatic } from "./places.js";
import { changeView, MAX_TEXT } from "./shapes.js";
import { looksLikeSecret } from "./text.js";
import { memoryErrors } from "./errors.js";

interface EditPorts {
  backend: MemoryBackendPort; ledger: MemoryLedgerPort; operations: MemoryOperations; scopes: MemoryScopeCommands; now: () => Date;
  beforeEffect?(): void | Promise<void>;
  record(caller: MemoryCaller, input: Omit<MemoryChangeRecord, "change_id" | "actor_id" | "at" | "state" | "undoable" | "project_id" | "work">): MemoryChangeRecord;
}

/** Formal content/classification edits and history restores share one conditional commit and projection. */
export class MemoryEdits {
  constructor(private readonly ports: EditPorts) {}

  async apply(caller: MemoryCaller, located: Located, request: MemoryChangeRequest, at: string, undoing: boolean): Promise<MemoryChangeResult> {
    const restoring = request.action === "restore", correcting = request.action === "reclassify", renewing = request.action === "renew";
    const expiry = renewing ? this.ports.operations.find(caller, "change-request")!.formal_expires_at! : undefined;
    if (request.classification !== undefined && !correcting) throw memoryErrors.invalid("分类变更需要明确的分类纠正操作");
    let text = located.entry.text, meta: AgentMemoryMeta, origin: string | undefined;
    if (renewing) {
      if (located.entry.meta.session_ref || located.entry.meta.classification?.lifecycle === "session")
        throw memoryErrors.invalid("会话记忆需要可信会话管理入口，本次没有续期");
      if (Date.parse(expiry!) <= this.ports.now().getTime()) throw memoryErrors.invalid("续期截止时间必须晚于现在");
      // SDK checks first-time expiry; a committed original operation may already have a live deadline.
      meta = located.entry.meta;
    } else if (restoring) {
      const revision = this.ports.ledger.revisions(located.entry.memory_id).find(one => one.version === request.version);
      if (!revision) throw memoryErrors.not_found("没有这个历史版本");
      if (!completeRevisionSnapshot(revision)) throw memoryErrors.invalid("这个历史版本缺少完整分类快照，不能完整恢复");
      text = revision.text; meta = revision.snapshot!.meta; origin = revision.snapshot!.origin;
    } else {
      if (request.text !== undefined) {
        if (typeof request.text !== "string" || !request.text.trim() || request.text.trim().length > MAX_TEXT) throw memoryErrors.invalid(`记忆内容要在 1–${MAX_TEXT} 字之间`);
        text = request.text.trim();
        if (looksLikeSecret(text)) throw memoryErrors.invalid("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
      }
      if (correcting) {
        if (request.to !== undefined || request.version !== undefined) throw memoryErrors.invalid("分类纠正不能同时改变范围或历史版本");
        meta = correctedMemoryMeta(located.entry.meta, request, this.ports.now());
        if (request.applies !== undefined) {
          const { applies_when: _oldWhen, ...retained } = meta;
          const applies_when = toEntryMeta({ ...located.meta, applies: request.applies }, located.entry.meta).applies_when;
          meta = { ...retained, ...(applies_when ? { applies_when } : {}) };
        }
      } else {
        if (request.kind && !MEMORY_FORMAL_KINDS.includes(request.kind)) throw memoryErrors.invalid("记忆类别不在已声明清单中");
        const facts: MemoryMetaRecord = { ...located.meta, ...(request.kind ? { kind: request.kind } : {}), ...(request.applies ? { applies: request.applies } : {}),
          ...(request.expires_at !== undefined ? { expires_at: request.expires_at } : {}), updated_at: at };
        meta = toEntryMeta(facts, located.entry.meta);
      }
    }
    const operation = renewing ? "renew" : restoring ? "restore" : correcting ? "reclassify" : "update";
    const where = { scope: located.scope, owner: located.owner, memory_id: located.entry.memory_id,
      ...this.ports.operations.condition(caller, `${operation}:${located.entry.memory_id}`, { kind: operation, scope: located.scope, owner: located.owner,
        memory_id: located.entry.memory_id, expected_version: this.ports.operations.find(caller, `change:${located.entry.memory_id}`)!.expected_version!,
        ...(renewing ? { formal_expires_at: expiry } : {}) }) };
    const backend = this.ports.backend.withCaller(caller);
    const entry = renewing ? await backend.renew({ ...where, expires_at_ms: Date.parse(expiry!) })
      : correcting && request.text === undefined && request.applies === undefined ? await backend.setMeta({ ...where, meta })
      : await backend.update({ ...where, change: { text, meta, ...(origin === undefined ? {} : { origin }) } });
    if (renewing && (entry.memory_id !== located.entry.memory_id || entry.version !== where.expected_version + 1))
      throw memoryErrors.conflict("原续期结果不可确认，不能用后来版本补历史");
    const mark = this.ports.operations.find(caller, `${operation}:${entry.memory_id}`)!;
    const facts = fromEntryMeta({ ...entry, scope: located.scope, owner: located.owner })!;
    await this.ports.beforeEffect?.();
    caller.signal?.throwIfAborted();
    const change = this.ports.ledger.transaction(() => {
      this.ports.operations.committed(caller, mark, { memory_id: entry.memory_id, version: entry.version });
      this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: facts.kind, applies: facts.applies,
        snapshot: { origin: entry.origin, meta: entry.meta }, change: restoring ? "restored" : "edited", by: "person", at });
      if (!undoing) disownAutomatic(this.ports.ledger, entry.memory_id);
      return this.ports.record(caller, { kind: restoring ? "restored" : "edited", scope: located.scope, owner: located.owner, memory_id: entry.memory_id,
        text: entry.text, by: "person", rule: null, reason: renewing ? `续期至 ${expiry}` : restoring ? `回到第 ${request.version} 版` : null, undo: null });
    });
    return { memory: this.ports.scopes.item({ ...located, entry, meta: facts }), change: changeView(change) };
  }
}
