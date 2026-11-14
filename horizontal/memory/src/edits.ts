import { MEMORY_FORMAL_KINDS, type MemoryChangeRequest, type MemoryChangeResult, type MemoryChangeRecord, type MemoryLedgerPort, type MemoryMetaRecord } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryOperations } from "./operations.js";
import { MemoryScopeCommands, type Located } from "./scope-commands.js";
import { completeRevisionSnapshot, correctedMemoryMeta } from "./classification.js";
import { MAX_TEXT, changeView } from "./shapes.js";
import { fromEntryMeta, toEntryMeta } from "./facts.js";
import { disownAutomatic } from "./places.js";
import { looksLikeSecret } from "./text.js";
import { memoryErrors } from "./errors.js";

interface EditPorts {
  backend: MemoryBackendPort; ledger: MemoryLedgerPort; operations: MemoryOperations; scopes: MemoryScopeCommands;
  now(): Date; beforeEffect?(): void | Promise<void>;
  record(caller: MemoryCaller, input: Omit<MemoryChangeRecord, "actor_id" | "change_id" | "project_id" | "work" | "at" | "state" | "undoable">): MemoryChangeRecord;
}

/** Explicit formal classification correction uses one canonical CAS and the existing history owner. */
export class MemoryEdits {
  constructor(private readonly ports: EditPorts) {}
  async apply(caller: MemoryCaller, located: Located, request: MemoryChangeRequest, at: string, undoing: boolean): Promise<MemoryChangeResult> {
    const { scope, owner, project } = located, by = "person" as const;
    const editing = request.action === "update" || request.action === "restore";
    const original = editing ? this.ports.operations.find(caller, `change:${located.entry.memory_id}`) : undefined;
    if (editing && (!original || !Number.isSafeInteger(original.expected_version) || original.expected_version! < 1))
      throw memoryErrors.conflict("原编辑缺少确认版本，不能采用后来版本继续");
    switch (request.action) {
      case "renew": return this.renew(caller, located, request, at);
      case "reclassify": return this.reclassify(caller, located, request, at);
      case "update": {
        let entry = located.entry;
        const text = typeof request.text === "string" ? request.text.trim() : null;
        if (text !== null && (!text || text.length > MAX_TEXT)) throw memoryErrors.invalid(`记忆内容要在 1–${MAX_TEXT} 字之间`);
        if (text && looksLikeSecret(text)) throw memoryErrors.invalid("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
        if (request.kind && !MEMORY_FORMAL_KINDS.includes(request.kind)) throw memoryErrors.invalid("记忆类别只能是偏好、约定、背景事实或经验");
        const meta: MemoryMetaRecord = { ...located.meta, ...(request.kind ? { kind: request.kind } : {}), ...(request.applies ? { applies: request.applies } : {}),
          ...(request.expires_at !== undefined ? { expires_at: request.expires_at } : {}), updated_at: at };
        entry = await this.ports.backend.withCaller(caller).update({ scope, owner, memory_id: entry.memory_id,
          ...this.ports.operations.formal(caller, located, "update", original!.expected_version!), change: { text: text ?? entry.text, meta: toEntryMeta(meta, entry.meta) } });
        const mark = this.ports.operations.find(caller, `update:${entry.memory_id}`)!;
        const change = this.ports.ledger.transaction(() => {
          this.ports.operations.committed(caller, mark, { memory_id: entry.memory_id, version: entry.version });
          this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: meta.kind, applies: meta.applies,
            snapshot: { origin: entry.origin, meta: entry.meta }, change: "edited", by, at });
          if (!undoing) disownAutomatic(this.ports.ledger, entry.memory_id);
          return this.ports.record(caller, { kind: "edited", scope, owner, memory_id: entry.memory_id, text: entry.text, by, rule: null, reason: null, undo: null });
        });
        return { memory: this.ports.scopes.item({ scope, owner, project, entry, meta: fromEntryMeta({ ...entry, scope, owner })! }), change: changeView(change) };
      }
      case "restore": {
        const revision = this.ports.ledger.revisions(located.entry.memory_id).find(one => one.version === request.version);
        if (!revision) throw memoryErrors.not_found("没有这个历史版本");
        if (!completeRevisionSnapshot(revision)) throw memoryErrors.invalid("这版没有完整的可恢复快照；如需采用旧正文，请明确使用这段旧文字");
        const retained = revision.snapshot!.meta;
        const restored = caller.memory_session ? { ...retained, classification: located.entry.meta.classification,
          session_ref: located.entry.meta.session_ref, expires_at_ms: located.entry.meta.expires_at_ms } : retained;
        const entry = await this.ports.backend.withCaller(caller).update({ scope, owner, memory_id: located.entry.memory_id,
          ...this.ports.operations.formal(caller, located, "restore", original!.expected_version!), change: { text: revision.text,
            origin: revision.snapshot!.origin, meta: restored } });
        const mark = this.ports.operations.find(caller, `restore:${entry.memory_id}`)!;
        const change = this.ports.ledger.transaction(() => {
          this.ports.operations.committed(caller, mark, { memory_id: entry.memory_id, version: entry.version });
          this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: revision.kind, applies: revision.applies,
            snapshot: { origin: entry.origin, meta: entry.meta }, change: "restored", by, at });
          if (!undoing) disownAutomatic(this.ports.ledger, entry.memory_id);
          return this.ports.record(caller, { kind: "restored", scope, owner, memory_id: entry.memory_id, text: entry.text, by, rule: null, reason: `回到第 ${revision.version} 版`, undo: null });
        });
        return { memory: this.ports.scopes.item({ scope, owner, project, entry, meta: fromEntryMeta({ ...entry, scope, owner })! }), change: changeView(change) };
      }
      default: throw memoryErrors.invalid("不支持的编辑操作");
    }
  }

  private async renew(caller: MemoryCaller, located: Located, request: MemoryChangeRequest, at: string): Promise<MemoryChangeResult> {
    if (!caller.memory_session && (located.entry.meta.session_ref || located.entry.meta.classification?.lifecycle === "session"))
      throw memoryErrors.invalid("会话记忆需要可信会话管理入口，本次没有续期");
    const expiry = this.ports.operations.find(caller, "change-request")!.formal_expires_at!;
    if (Date.parse(expiry) <= this.ports.now().getTime()) throw memoryErrors.invalid("续期截止时间必须晚于现在");
    const where = { scope: located.scope, owner: located.owner, memory_id: located.entry.memory_id,
      ...this.ports.operations.condition(caller, `renew:${located.entry.memory_id}`, { kind: "renew", scope: located.scope, owner: located.owner,
        memory_id: located.entry.memory_id, expected_version: request.expected_version!, formal_expires_at: expiry }) };
    const entry = await this.ports.backend.withCaller(caller).renew({ ...where, expires_at_ms: Date.parse(expiry) });
    if (entry.memory_id !== located.entry.memory_id || entry.version !== where.expected_version + 1)
      throw memoryErrors.conflict("原续期结果不可确认，不能用后来版本补历史");
    const facts = fromEntryMeta({ ...entry, scope: located.scope, owner: located.owner })!;
    const mark = this.ports.operations.find(caller, `renew:${entry.memory_id}`)!;
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    const change = this.ports.ledger.transaction(() => {
      this.ports.operations.committed(caller, mark, { memory_id: entry.memory_id, version: entry.version });
      this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: facts.kind, applies: facts.applies,
        snapshot: { origin: entry.origin, meta: entry.meta }, change: "edited", by: "person", at });
      disownAutomatic(this.ports.ledger, entry.memory_id);
      return this.ports.record(caller, { kind: "edited", scope: located.scope, owner: located.owner, memory_id: entry.memory_id,
        text: entry.text, by: "person", rule: null, reason: `续期至 ${expiry}`, undo: null });
    });
    return { memory: this.ports.scopes.item({ ...located, entry, meta: facts }), change: changeView(change) };
  }

  /** Only the original Session's accepted classification CAS can recover its ledger projection after detaching. */
  async recoverClassification(caller: MemoryCaller, request: MemoryChangeRequest): Promise<Located | undefined> {
    const priorRequest = this.ports.operations.find(caller, "change-request"), classification = this.ports.operations.find(caller, `reclassify:${request.memory_id}`);
    const priorMeta = request.action === "reclassify" && caller.memory_session ? this.ports.ledger.revisions(request.memory_id)
      .find(one => one.version === request.expected_version)?.snapshot?.meta : undefined;
    const recoverClassification = caller.person && caller.memory_session && request.action === "reclassify" && request.classification?.lifecycle !== "session"
      && priorRequest?.kind === "reclassify" && classification?.kind === "reclassify" && classification.phase !== "closed" && priorRequest.phase !== "closed"
      && priorRequest.memory_id === request.memory_id && classification.memory_id === request.memory_id && priorRequest.expected_version === request.expected_version
      && classification.expected_version === request.expected_version && priorRequest.scope === classification.scope && priorRequest.owner === classification.owner
      && priorMeta?.classification?.lifecycle === "session" && priorMeta.session_ref?.id === caller.memory_session.session.session_id
      && priorMeta.session_ref.revision === 1;
      if (recoverClassification
        && this.ports.scopes.scopesFor(caller, undefined, true).some(one => one.scope === classification!.scope && one.owner === classification!.owner)) {
        const recovered = (await this.ports.scopes.located(caller, classification!.scope, classification!.owner, true)).find(one => one.entry.memory_id === request.memory_id
          && one.entry.version === request.expected_version! + 1 && !one.entry.meta.session_ref && one.entry.meta.classification?.lifecycle !== "session");
        if (recovered) return recovered; // The original SDK operation still verifies the complete command.
      }
    return undefined;
  }

  private async reclassify(caller: MemoryCaller, located: Located, request: MemoryChangeRequest, at: string): Promise<MemoryChangeResult> {
    if (!Number.isSafeInteger(request.expected_version) || request.expected_version! < 1)
      throw memoryErrors.invalid("分类纠正需要页面所见的版本");
    if (request.to !== undefined || request.version !== undefined) throw memoryErrors.invalid("分类纠正不能同时改变范围或历史版本");
    // A successor version is not proof of success. It only lets the original SDK operation verify
    // its complete input without treating elapsed wall time as a fresh retention decision.
    const replay = located.entry.version === request.expected_version! + 1
      && this.ports.operations.find(caller, `reclassify:${located.entry.memory_id}`) !== undefined;
    let meta = correctedMemoryMeta(located.entry.meta, request, replay ? new Date(at) : this.ports.now(), caller);
    let text = located.entry.text;
    if (request.text !== undefined) {
      if (typeof request.text !== "string" || !request.text.trim() || request.text.trim().length > MAX_TEXT)
        throw memoryErrors.invalid(`记忆内容要在 1–${MAX_TEXT} 字之间`);
      text = request.text.trim();
      if (looksLikeSecret(text)) throw memoryErrors.invalid("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    }
    if (request.applies !== undefined) {
      const { applies_when: _oldWhen, ...retained } = meta;
      const applies_when = toEntryMeta({ ...located.meta, applies: request.applies }, located.entry.meta).applies_when;
      meta = { ...retained, ...(applies_when ? { applies_when } : {}) };
    }
    const where = { scope: located.scope, owner: located.owner, memory_id: located.entry.memory_id,
      ...this.ports.operations.condition(caller, `reclassify:${located.entry.memory_id}`, { kind: "reclassify", scope: located.scope, owner: located.owner,
        memory_id: located.entry.memory_id, expected_version: request.expected_version! }) };
    const backend = this.ports.backend.withCaller(caller);
    const entry = request.text === undefined && request.applies === undefined ? await backend.setMeta({ ...where, meta })
      : await backend.update({ ...where, change: { text, meta } });
    if (entry.memory_id !== located.entry.memory_id || entry.version !== where.expected_version + 1)
      throw memoryErrors.conflict("原分类纠正结果不可确认，不能用后来版本补历史");
    const facts = fromEntryMeta({ ...entry, scope: located.scope, owner: located.owner })!;
    const mark = this.ports.operations.find(caller, `reclassify:${entry.memory_id}`)!;
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    const change = this.ports.ledger.transaction(() => {
      this.ports.operations.committed(caller, mark, { memory_id: entry.memory_id, version: entry.version });
      this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: facts.kind, applies: facts.applies,
        snapshot: { origin: entry.origin, meta: entry.meta }, change: "edited", by: "person", at });
      disownAutomatic(this.ports.ledger, entry.memory_id);
      return this.ports.record(caller, { kind: "edited", scope: located.scope, owner: located.owner, memory_id: entry.memory_id,
        text: entry.text, by: "person", rule: null, reason: null, undo: null });
    });
    return { memory: this.ports.scopes.item({ ...located, entry, meta: facts }), change: changeView(change) };
  }
}
