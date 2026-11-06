import type { MemoryChangeRequest, MemoryOperationsQuery, MemoryOperationsPage, MemoryPendingOperation, MemoryCandidateRecord, MemoryForgettingSelection, MemoryForgettingDecision, MemoryLedgerPort, MemoryScope, MemorySource } from "@molis-ai/molis-work-contracts/services/memory";
import { isDeepStrictEqual } from "node:util";
import type { MemoryCaller } from "./service.js";
import { memoryErrors } from "./errors.js";
import { isMemorySessionClearPlan, MEMORY_SESSION_CLEAR_PREFIX, type MemorySessionClearPlan } from "./session-clear.js";
import { isMemoryClearPlan } from "./scope-commands.js";

interface OperationIdentity {
  kind: string;
  scope: MemoryScope;
  owner: string;
  memory_id?: string;
  candidate_id?: string;
  expected_version?: number;
  original_state?: "active" | "paused" | "disabled";
  candidate_expected_version?: number;
  /** Number of evidence additions in a fixed duplicate adoption; never their contents. */
  evidence_count?: number;
  /** An absolute retention decision, not content or a reconstructed command. */
  formal_expires_at?: string | null;
  /** Selected historical revision for a restore decision; never its text or metadata. */
  restore_version?: number;
  /** Identity of an entire normalized import, including items not yet dispatched. */
  input_digest?: string;
  /** Original fixed, body-free selection; pending here never means the independent decision was accepted. */
  session_binding?: NonNullable<MemoryCaller["memory_session"]>;
  forgetting?: Pick<MemoryForgettingSelection, "selection_mode" | "memories" | "candidates" | "source_event_ids">;
}
interface OperationMark extends OperationIdentity {
  operation_id: string;
  at: string;
  phase: "pending" | "committed" | "closed";
  result?: { memory_id?: string; candidate_id?: string; version?: number; outcome?: "duplicate" | "candidate" };
}
const PREFIX = "memory-operation:";
function renewalDeadline(request: MemoryChangeRequest): string {
  if (!Number.isSafeInteger(request.expected_version) || request.expected_version! < 1)
    throw memoryErrors.invalid("续期需要页面所见的版本");
  if ([request.text, request.kind, request.classification, request.applies, request.to, request.version].some(value => value !== undefined))
    throw memoryErrors.invalid("续期只能修改截止时间，请单独提交其它修改");
  const value = request.expires_at, millis = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(millis) || millis < 0 || new Date(millis).toISOString() !== value)
    throw memoryErrors.invalid("续期需要明确且有效的 UTC ISO 截止时间");
  return new Date(millis).toISOString();
}

export interface MemoryPurgeTarget {
  scope: MemoryScope;
  owner: string;
  entry: { memory_id: string; version: number };
  condition?: { expected_version: number; operation_id: string; signal?: AbortSignal };
}

/** A global person may continue only an already accepted original removal, never adopt its Session write binding. */
function globalRemovalContinuation(caller: MemoryCaller, request: MemoryChangeRequest, mark: OperationMark, decisions: readonly MemoryForgettingDecision[]): boolean {
  return caller.person === true && caller.consumer === "ui" && (caller.purpose === undefined || caller.purpose === "management")
    && caller.memory_session === undefined && mark.session_binding !== undefined && request.action === "remove" && mark.kind === "remove"
    && request.expected_version === mark.expected_version && mark.operation_id === `${caller.operation_id}:change-request`
    && decisions.some(one => one.selection_mode === "related" && one.actor_id === caller.actor_id && one.operation_id === caller.operation_id
      && one.scope === mark.scope && one.owner === mark.owner && one.memories.length === 1
      && one.memories[0]!.memory_id === mark.memory_id && one.memories[0]!.version === mark.expected_version);
}

/** The existing ledger keeps operation identity and receipts, never a proposed body or encoded command. */
export class MemoryOperations {
  constructor(private readonly ledger: MemoryLedgerPort, private readonly newId: () => string, private readonly now: () => Date) {}

  caller(caller: MemoryCaller): MemoryCaller {
    caller.signal?.throwIfAborted();
    return caller.operation_id ? caller : { ...caller, operation_id: this.newId() };
  }

  /** A multi-step command retains short identities without sending its parent or step key to the SDK. */
  child(caller: MemoryCaller, step: string): MemoryCaller {
    const parent = this.caller(caller);
    const key = `${PREFIX}${parent.operation_id}:step:${step}`;
    const operation_id = this.ledger.transaction(() => {
      const saved = this.ledger.marker(parent.actor_id, key)?.body as { operation_id: string } | undefined;
      if (saved) return saved.operation_id;
      const operation_id = this.newId();
      this.ledger.setMarker(parent.actor_id, key, { parent_operation_id: parent.operation_id, step, operation_id }, this.now().toISOString());
      return operation_id;
    });
    return { ...parent, operation_id };
  }

  /** Recreating a merged item belongs to the original change, even when the person's retry is a new request. */
  recreate(caller: MemoryCaller, change: { change_id: string; scope: MemoryScope; owner: string }): MemoryCaller {
    const operation = this.child({ ...caller, operation_id: change.change_id }, "undo-recreate");
    // This fixed creation must use its own SDK receipt rather than attach to an unrelated equal text.
    this.begin(operation, "commit", { kind: "commit", scope: change.scope, owner: change.owner });
    this.begin(operation, "append", { kind: "append", scope: change.scope, owner: change.owner });
    return operation;
  }

  find(caller: MemoryCaller, key: string): OperationMark | undefined {
    if (!caller.operation_id) return undefined;
    return this.ledger.marker(caller.actor_id, `${PREFIX}${caller.operation_id}:${key}`)?.body as OperationMark | undefined;
  }

  /** Only fixed batch/clear plans and accepted decisions are discovery sources, not ordinary past writes. */
  list(caller: MemoryCaller, query: MemoryOperationsQuery, scopes: readonly { scope: MemoryScope; owner: string }[]): MemoryOperationsPage {
    const limit = query.limit ?? 40;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw memoryErrors.invalid("操作列表大小超出限额");
    const binding = JSON.stringify([caller.actor_id, caller.project_id, query.scope, scopes, caller.memory_session]);
    let position: { binding: string; source: "batch" | "clear" | "session" | "facts"; after: string } = { binding, source: "batch", after: "" };
    if (query.cursor) {
      if (typeof query.cursor !== "string" || query.cursor.length > 70000) throw memoryErrors.invalid("操作列表游标无效");
      try { position = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as typeof position; }
      catch { throw memoryErrors.invalid("操作列表游标无效"); }
      if (position?.binding !== binding || typeof position?.after !== "string" || !["batch", "clear", "session", "facts"].includes(position?.source))
        throw memoryErrors.conflict("操作列表范围已改变，请重新读取");
    }
    const decisions = this.ledger.forgetting.read().decisions;
    const allowed = (scope: MemoryScope, owner: string) => scopes.some(one => one.scope === scope && one.owner === owner);
    const visibleSessionPlan = (value: unknown): value is MemorySessionClearPlan => isMemorySessionClearPlan(value)
      && value.actor_id === caller.actor_id && value.started && value.groups.some(group => allowed(group.scope, group.owner))
      && (!caller.memory_session || isDeepStrictEqual(caller.memory_session, value.binding));
    const matchesSessionDecision = (group: MemorySessionClearPlan["groups"][number], decision: MemoryForgettingDecision) =>
      decision.selection_mode === "exact-identities" && decision.scope === group.scope && decision.owner === group.owner
      && isDeepStrictEqual(decision.memories, group.memories) && isDeepStrictEqual(decision.candidates, group.candidates) && !decision.source_event_ids.length;
    const items: MemoryPendingOperation[] = [];
    const next = (source: typeof position.source, after: string): MemoryOperationsPage => ({ items, exhausted: false,
      cursor: Buffer.from(JSON.stringify({ binding, source, after })).toString("base64url") });
    for (const source of ["batch", "clear", "session"] as const) {
      if (["batch", "clear", "session", "facts"].indexOf(source) < ["batch", "clear", "session", "facts"].indexOf(position.source)) continue;
      if (caller.memory_session && source !== "session") { position = { binding, source: "session", after: "" }; continue; }
      const prefix = source === "batch" ? "memory-batch:" : source === "clear" ? "memory-clear:" : MEMORY_SESSION_CLEAR_PREFIX, remaining = limit - items.length;
      if (!remaining) return next(source, position.after);
      const rows = this.ledger.listMarkers(caller.actor_id, { prefix, after: position.after, limit: remaining + 1 });
      for (const row of rows.slice(0, remaining)) {
        if (source === "session") {
          const plan = row.body;
          if (!visibleSessionPlan(plan)) continue;
          const claims = plan.groups.map(group => ({ group, decision: decisions.find(one => one.actor_id === caller.actor_id && one.operation_id === group.operation_id) }));
          if (claims.some(({ group, decision }) => decision && !matchesSessionDecision(group, decision))) {
            items.push({ kind: "session-clear", operation_id: plan.operation_id, at: row.at, forgetting: "unknown", cleanup: "needs-reconcile" });
            continue;
          }
          if (plan.complete) continue;
          const accepted = claims.filter(({ decision }) => decision !== undefined).length;
          items.push({ kind: "session-clear", operation_id: plan.operation_id, at: row.at, preview_id: plan.operation_id, target: plan.binding.target,
            forgetting: accepted === plan.groups.length ? "accepted" : accepted ? "unknown" : "not-accepted", cleanup: "pending" });
          continue;
        }
        const plan = row.body as { scope: MemoryScope; owner: string; started?: boolean; complete?: boolean; action?: "disable" | "remove";
          groups?: Array<{ preview?: { operation_id?: string } }>; parts?: Array<{ operation_id?: string; items?: readonly unknown[] }> };
        if (!plan || !allowed(plan.scope, plan.owner) || !plan.started || plan.complete) continue;
        const groups = source === "batch" ? Array.isArray(plan.groups) ? plan.groups.map(group => group?.preview) : undefined : plan.parts;
        const valid = source === "clear" ? isMemoryClearPlan(plan, scopes)
          : typeof plan.complete === "boolean" && Array.isArray(groups) && groups.length > 0 && groups.every(group => typeof group?.operation_id === "string");
        const accepted = valid && Array.isArray(groups) ? groups.filter(group => decisions.some(one => one.actor_id === caller.actor_id && one.operation_id === group?.operation_id)).length : 0;
        items.push({ kind: source === "batch" ? "batch" : "scope-clear", operation_id: row.key, scope: plan.scope, at: row.at,
          ...(source === "batch" ? { preview_id: row.key.slice(prefix.length), action: plan.action } : { fingerprint: row.key.slice(prefix.length) }),
          forgetting: !valid ? "unknown" : accepted === groups?.length ? "accepted" : accepted ? "unknown" : "not-accepted", cleanup: valid ? "pending" : "needs-reconcile" });
      }
      if (rows.length > remaining) return next(source, rows[remaining - 1]!.key);
      position = { binding, source: source === "batch" ? "clear" : source === "clear" ? "session" : "facts", after: "" };
    }
    const remaining = limit - items.length;
    if (!remaining) return next("facts", "");
    const facts = decisions.filter(one => one.actor_id === caller.actor_id && allowed(one.scope, one.owner)
      && JSON.stringify([one.actor_id, one.operation_id]) > position.after).slice(0, remaining + 1);
    // Missing coverage requires exhausting retained plans, not merely their first marker page.
    // Keep only this bounded facts page's associations; completed Session plans still own their accepted groups.
    const wanted = new Map(facts.slice(0, remaining).map(one => [one.operation_id, one]));
    const exactCovered = new Set<string>(), relatedCovered = new Set<string>();
    for (const prefix of wanted.size ? ["memory-clear:", "memory-batch:", MEMORY_SESSION_CLEAR_PREFIX] : []) {
      let after = "";
      for (;;) {
        const rows = this.ledger.listMarkers(caller.actor_id, { prefix, after, limit: 101 });
        for (const row of rows) {
          if (visibleSessionPlan(row.body)) for (const group of row.body.groups) {
            const decision = wanted.get(group.operation_id);
            if (decision && group.scope === decision.scope && group.owner === decision.owner) exactCovered.add(group.operation_id);
          }
          const plan = row.body as { started?: boolean; complete?: boolean; parts?: Array<{ operation_id?: string }>; groups?: Array<{ preview?: { operation_id?: string } }> };
          if (plan?.started && !plan.complete) for (const operation of [
            ...(Array.isArray(plan.parts) ? plan.parts.map(one => one?.operation_id) : []),
            ...(Array.isArray(plan.groups) ? plan.groups.map(one => one?.preview?.operation_id) : []),
          ]) if (operation && wanted.has(operation)) relatedCovered.add(operation);
        }
        if (rows.length < 101) break;
        after = rows.at(-1)!.key;
      }
    }
    for (const decision of facts.slice(0, remaining)) {
      if (decision.selection_mode === "exact-identities") {
        const covered = exactCovered.has(decision.operation_id);
        if (!covered && !caller.memory_session) items.push({ kind: "session-clear", operation_id: decision.operation_id, at: decision.accepted_at,
          forgetting: "accepted", cleanup: "needs-reconcile" });
        continue;
      }
      if (caller.memory_session && !isDeepStrictEqual(this.find({ ...caller, operation_id: decision.operation_id }, "change-request")?.session_binding,
        caller.memory_session)) continue;
      if (!decision.memories.some(one => !this.ledger.marker("", `memory-forgotten:${one.memory_id}`))) continue;
      if (relatedCovered.has(decision.operation_id)) continue;
      const holder = { ...caller, operation_id: decision.operation_id }, request = this.find(holder, "change-request");
      const one = decision.memories[0];
      let original: Extract<MemoryPendingOperation, { kind: "remove" | "scope-clear" | "batch" }>["request"];
      if (decision.memories.length === 1 && request?.kind === "remove" && request.memory_id === one?.memory_id
        && request.expected_version === one.version && request.scope === decision.scope && request.owner === decision.owner) {
        try {
          this.purgeRecovery(holder, one.memory_id, `change:${one.memory_id}`, "remove", scopes, one.version);
          original = { action: "remove", memory_id: one.memory_id, expected_version: one.version };
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "memory.conflict") throw error;
        }
      }
      items.push({ kind: "remove", operation_id: decision.operation_id, scope: decision.scope, at: decision.accepted_at,
        forgetting: "accepted", cleanup: original ? "pending" : "needs-reconcile", ...(original ? { request: original } : {}) });
    }
    return facts.length > remaining ? next("facts", JSON.stringify([facts[remaining - 1]!.actor_id, facts[remaining - 1]!.operation_id])) : { items, exhausted: true };
  }

  /** Claim a whole change before its first SDK step; an existing claim only checks identity, including after deletion. */
  changeRequest(caller: MemoryCaller, request: MemoryChangeRequest,
    located?: { scope: MemoryScope; owner: string; version: number }): void {
    const expiry = request.action === "renew" ? renewalDeadline(request) : undefined;
    const restore_version = request.action === "restore" ? request.version : undefined;
    if (request.action === "restore" && (!Number.isSafeInteger(restore_version) || restore_version! < 1))
      throw memoryErrors.invalid("恢复需要明确的历史版本");
    const session_binding = request.action === "remove" ? caller.memory_session : undefined;
    const existing = this.find(caller, "change-request");
    if (existing) {
      const sameBinding = isDeepStrictEqual(existing.session_binding, session_binding);
      const globalRemoval = !sameBinding && globalRemovalContinuation(caller, request, existing, this.ledger.forgetting.read().decisions);
      if (existing.kind !== request.action || existing.memory_id !== request.memory_id || existing.formal_expires_at !== expiry || existing.restore_version !== restore_version || !sameBinding && !globalRemoval
        || request.expected_version !== undefined && existing.expected_version !== request.expected_version
        || located && (existing.scope !== located.scope || existing.owner !== located.owner))
        throw memoryErrors.conflict("同一记忆操作号不能改变目标、动作、确认版本");
      // Closed child operations still refuse writes; the original purge receipt may finish its deletion projection.
      return;
    }
    if (!located) return;
    const original = this.find(caller, `change:${request.memory_id}`);
    if (request.action === "restore" && original) throw memoryErrors.conflict("原恢复操作缺少所选历史版本，不能用本次选择继续");
    this.begin(caller, "change-request", { kind: request.action, scope: located.scope, owner: located.owner,
      memory_id: request.memory_id, expected_version: request.expected_version ?? original?.expected_version ?? located.version,
      ...(session_binding ? { session_binding: structuredClone(session_binding) } : {}), ...(expiry === undefined ? {} : { formal_expires_at: expiry }),
      ...(restore_version === undefined ? {} : { restore_version }) });
  }

  begin(caller: MemoryCaller, key: string, identity: OperationIdentity): OperationMark {
    if (!caller.operation_id) throw memoryErrors.invalid("记忆变更需要稳定操作号");
    const operation_id = `${caller.operation_id}:${key}`;
    return this.ledger.transaction(() => {
      const existing = this.ledger.marker(caller.actor_id, `${PREFIX}${operation_id}`)?.body as OperationMark | undefined;
      if (existing) {
        if (existing.phase === "closed") throw memoryErrors.conflict("这次记忆操作已随删除关闭，不能重放");
        for (const name of ["kind", "scope", "owner", "memory_id", "candidate_id", "formal_expires_at", "restore_version", "evidence_count", "input_digest"] as const) {
          if (existing[name] !== identity[name]) throw memoryErrors.conflict("同一个记忆操作号不能改为另一个目标或动作");
        }
        if (!isDeepStrictEqual(existing.session_binding, identity.session_binding)) throw memoryErrors.conflict("同一个记忆操作号不能改变原业务会话绑定");
        if (!isDeepStrictEqual(existing.forgetting, identity.forgetting)) throw memoryErrors.conflict("同一个遗忘操作号不能改选后来来源或候选");
        return existing;
      }
      const mark: OperationMark = { ...identity, operation_id, at: this.now().toISOString(), phase: "pending" };
      this.ledger.setMarker(caller.actor_id, `${PREFIX}${operation_id}`, mark, mark.at);
      return mark;
    });
  }

  /** Bind before the first child. A pre-existing child cannot prove which unstarted items belonged to its package. */
  importPackage(caller: MemoryCaller, scope: MemoryScope, owner: string, input_digest: string): void {
    this.ledger.transaction(() => {
      if (!this.find(caller, "import-package") && this.find({ ...caller, operation_id: `${caller.operation_id}:import:0` }, "import"))
        throw memoryErrors.conflict("原导入缺少整包身份，不能用本次文件继续未完成条目，请核对已提交结果");
      this.begin(caller, "import-package", { kind: "import-package", scope, owner, input_digest });
    });
  }

  condition(caller: MemoryCaller, key: string, identity: OperationIdentity & { expected_version: number }) {
    const mark = this.begin(caller, key, identity);
    if (!Number.isSafeInteger(mark.expected_version) || mark.expected_version! < 1) throw memoryErrors.invalid("记忆变更需要读取时的版本");
    return { expected_version: mark.expected_version!, operation_id: mark.operation_id,
      ...(caller.signal ? { signal: caller.signal } : {}) };
  }

  formal(caller: MemoryCaller, located: { scope: MemoryScope; owner: string; entry: { memory_id: string; version: number } }, kind: string, expectedVersion?: number) {
    const condition = this.condition(caller, `${kind}:${located.entry.memory_id}`, { kind, scope: located.scope, owner: located.owner,
      memory_id: located.entry.memory_id, expected_version: expectedVersion ?? located.entry.version });
    if (expectedVersion !== undefined && condition.expected_version !== expectedVersion)
      throw memoryErrors.conflict("原操作条件与确认版本不一致，不能把重试改到后来版本");
    return condition;
  }

  /** Missing bodies can converge only under the original decision and the caller's current scopes. */
  purgeRecovery(caller: MemoryCaller, memoryId: string, decisionKey: string, kind: string,
    scopes: readonly { scope: MemoryScope; owner: string }[], expectedVersion?: number): MemoryPurgeTarget {
    caller.signal?.throwIfAborted();
    const decision = this.find(caller, decisionKey), purge = this.find(caller, `purge:${memoryId}`);
    if (!decision || !purge || decision.kind !== kind || purge.kind !== "purge"
      || decision.memory_id !== memoryId || purge.memory_id !== memoryId
      || decision.scope !== purge.scope || decision.owner !== purge.owner
      || !["pending", "committed", "closed"].includes(purge.phase)
      || !["pending", "committed", "closed"].includes(decision.phase)
      || !Number.isSafeInteger(decision.expected_version) || decision.expected_version! < 1
      || purge.expected_version !== decision.expected_version
      || expectedVersion !== undefined && expectedVersion !== decision.expected_version)
      throw memoryErrors.conflict("没有一致的原删除决定，不能按当前缺失推断清理完成");
    if (!scopes.some(scope => scope.scope === purge.scope && scope.owner === purge.owner))
      throw memoryErrors.scope("原删除目标不在本次调用的记忆范围内");
    return { scope: purge.scope, owner: purge.owner, entry: { memory_id: memoryId, version: purge.expected_version! },
      condition: { expected_version: purge.expected_version!, operation_id: purge.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) } };
  }

  candidate(caller: MemoryCaller, record: { scope: MemoryScope; owner: string; candidate_id: string; version: number }, kind: string) {
    return this.condition(caller, `${kind}:${record.candidate_id}`, { kind, scope: record.scope, owner: record.owner,
      candidate_id: record.candidate_id, expected_version: record.version });
  }

  /** Retain original cleanup conditions when the SDK candidate is gone but its ledger projection remains. */
  candidatePurges(caller: MemoryCaller, where: { scope: MemoryScope; owner: string },
    current: readonly { candidate_id: string; version: number }[], projected: readonly { candidate_id: string }[]) {
    const selected = new Map(current.map(item => [item.candidate_id, item.version]));
    for (const note of projected) {
      const old = this.find(caller, `candidate-purge:${note.candidate_id}`);
      if (old?.scope === where.scope && old.owner === where.owner && old.candidate_id === note.candidate_id && !selected.has(note.candidate_id))
        selected.set(note.candidate_id, old.expected_version!);
    }
    return [...selected].map(([candidate_id, version]) => ({ candidate_id,
      ...this.condition(caller, `candidate-purge:${candidate_id}`, { kind: "purge", ...where, candidate_id, expected_version: version }) }));
  }

  /** A formed candidate kept waiting is a fixed decision, not a new creation on the next offer. */
  holdCandidate(caller: MemoryCaller, record: MemoryCandidateRecord | undefined,
    input: { candidate_id?: string; candidate_version?: number; source: MemorySource; why?: string }, reason: string): MemoryCandidateRecord {
    caller.signal?.throwIfAborted();
    const commit = this.find(caller, "commit");
    if (!record || !commit || record.candidate_id !== input.candidate_id || record.scope !== commit.scope || record.owner !== commit.owner
      || record.state !== "pending" || input.candidate_version !== undefined && record.version !== input.candidate_version)
      throw memoryErrors.conflict("原等待候选已变化或不在当前范围，不能继续原决定");
    const mark = this.begin(caller, "candidate-hold", { kind: `candidate-hold:${input.source}`, scope: record.scope, owner: record.owner,
      candidate_id: record.candidate_id, expected_version: record.version });
    if (mark.expected_version !== record.version) throw memoryErrors.conflict("原等待候选已有后继版本，不能追随更新");
    if (mark.phase === "committed") {
      if (mark.result?.outcome !== "candidate" || mark.result.candidate_id !== record.candidate_id || mark.result.version !== record.version)
        throw memoryErrors.conflict("原等待候选回执不可确认");
      return record;
    }
    const held = { ...record, hold_reason: reason, ...(input.why ? { why: input.why.slice(0, 300) } : {}) };
    this.ledger.transaction(() => {
      this.ledger.saveCandidate(held);
      const result = { outcome: "candidate" as const, candidate_id: record.candidate_id, version: record.version };
      this.committed(caller, mark, result);
      this.committed(caller, commit, result);
    });
    return held;
  }

  committed(caller: MemoryCaller, mark: OperationMark, result: OperationMark["result"]): void {
    // Called in the same ledger transaction as the corresponding history/change projections.
    const current = this.ledger.marker(caller.actor_id, `${PREFIX}${mark.operation_id}`)?.body as OperationMark | undefined;
    if (current?.phase === "closed") throw memoryErrors.conflict("这次记忆操作已随删除关闭，不能补回旧正文");
    this.ledger.setMarker(caller.actor_id, `${PREFIX}${mark.operation_id}`, { ...mark, phase: "committed", result }, mark.at);
  }
}
