import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentDelegationMode, AgentDelegationScope, AgentDelegationSelection, AgentDelegationState, AgentDelegationSubject } from "@molis-ai/molis-work-contracts/services/agent-host";
import { reviewProposalVersion, type ReviewDecisionControl } from "./review-decisions.js";
import { currentDelegation, delegationDate, delegationModeRank, delegationSnapshot, readDelegationState, validDelegationMode, validDelegationSubject, type StoredDelegationState } from "./delegation-state.js";
import { delegationScopesNarrow, validDelegationScope } from "./delegation-scopes.js";
import { agentErrors } from "./errors.js";
import { ongoingDelegationSubject, workDelegationPermission, type WorkDelegationPermission } from "./delegation-permissions.js";
import { DelegationCancellations, type WorkDelegationCancellation } from "./delegation-cancellations.js";
import { prepareActionDelegation, type WorkActionProposal } from "./delegation-actions.js";

export interface WorkDelegationStorage {
  read(id: string): Promise<unknown | undefined>;
  compareAndSet(id: string, expectedVersion: number, value: unknown, control: ReviewDecisionControl): Promise<void>;
  list(): Promise<readonly string[]>;
}
export interface WorkDelegationGrant {
  readonly expected_version: number;
  readonly mode: AgentDelegationMode;
  readonly scopes: readonly AgentDelegationScope[];
  readonly expires_at: string | null;
}
export interface WorkDelegationChange {
  readonly expected_version: number;
  readonly id: string;
  readonly revision: number;
}
export interface WorkDelegationInvalidation {
  readonly subject: AgentDelegationSubject;
  readonly previous: AgentDelegationState | undefined;
  readonly reason: "selection" | "ending";
}

export function workDelegationKey(subject: AgentDelegationSubject): string {
  if (!validDelegationSubject(subject)) throw agentErrors.delegation_invalid("工作授权缺少可信主体");
  return reviewProposalVersion(subject);
}
const selectionKey = (key: string, row: Pick<AgentDelegationSelection, "id" | "revision">) => `${key}:${row.id}:${row.revision}`;
const assertControl = (control: ReviewDecisionControl) => requireSynchronous(control.assertCurrent(), "授权最终检查必须同步完成");
function assertStorageVersion(state: StoredDelegationState | undefined, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || (state?.storage_version ?? 0) !== expected) throw agentErrors.delegation_changed("授权已变化，请按当前范围重新决定");
}
function newDelegationState(subject: AgentDelegationSubject): StoredDelegationState {
  return { schema: 1, submission_id: randomUUID(), subject, storage_version: 0, epoch: randomUUID(), lifecycle: "open", ended_at: null, ended_reason: null, selection_id: null, selections: [] };
}

/** One live owner per Home. It serializes each subject, keeps tombstones, and invalidates before an asynchronous shrink. */
export class WorkDelegationStore {
  readonly #states = new Map<string, StoredDelegationState | undefined>();
  readonly #queues = new Map<string, Promise<unknown>>();
  readonly #blocked = new Set<string>();
  readonly #unreadable = new Set<string>();
  readonly #uncertain = new Map<string, { next: StoredDelegationState; reopens: boolean; receipts: WorkDelegationCancellation[] }>();
  readonly #changing = new Set<string>();
  readonly #invalid = new Map<string, string>();
  readonly #endAttempts = new Map<string, number>();
  readonly #fences = new Map<string, number>();
  readonly #listeners = new Set<(change: WorkDelegationInvalidation) => WorkDelegationCancellation | void>();
  readonly #cancellations = new DelegationCancellations();
  readonly #lists = new Set<Promise<readonly AgentDelegationState[]>>();
  #closed = false;
  constructor(readonly storage: WorkDelegationStorage, readonly now: () => number = Date.now) {}

  subscribe(listener: (change: WorkDelegationInvalidation) => WorkDelegationCancellation | void): () => void {
    if (this.#closed) throw agentErrors.delegation_ended("授权服务已关闭");
    this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
  }
  #serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(agentErrors.delegation_ended("授权服务已关闭"));
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const run = () => { if (this.#closed) throw agentErrors.delegation_ended("授权服务已关闭"); return operation(); };
    const next = previous.then(run, run); this.#queues.set(key, next);
    void next.finally(() => { if (this.#queues.get(key) === next) this.#queues.delete(key); }).catch(() => undefined);
    return next;
  }
  async #load(key: string, subject?: AgentDelegationSubject, fresh = false): Promise<StoredDelegationState | undefined> {
    if (!fresh && !this.#unreadable.has(key) && this.#states.has(key)) return this.#states.get(key);
    try {
      const value = await this.storage.read(key), state = value === undefined ? undefined : readDelegationState(value, subject);
      if (state && workDelegationKey(state.subject) !== key) throw agentErrors.delegation_unreadable("授权存储键与主体不一致");
      if (this.#states.has(key) && this.#states.get(key)?.storage_version !== state?.storage_version) this.#fences.set(key, (this.#fences.get(key) ?? 0) + 1);
      const uncertain = this.#uncertain.get(key);
      if (uncertain && isDeepStrictEqual(uncertain.next, state)) {
        if (uncertain.reopens) this.#blocked.delete(key);
        for (const receipt of uncertain.receipts) this.#cancellations.add(key, receipt);
      }
      this.#uncertain.delete(key); this.#unreadable.delete(key);
      this.#states.set(key, state); return state;
    } catch (error) {
      if (!this.#unreadable.has(key)) this.#fences.set(key, (this.#fences.get(key) ?? 0) + 1);
      this.#unreadable.add(key); throw error;
    }
  }
  async read(subject: AgentDelegationSubject): Promise<AgentDelegationState | undefined> {
    const fixed = structuredClone(subject), key = workDelegationKey(fixed);
    return this.#serial(key, async () => { const state = await this.#load(key, fixed); return state && delegationSnapshot(state); });
  }
  list(): Promise<readonly AgentDelegationState[]> {
    if (this.#closed) return Promise.reject(agentErrors.delegation_ended("授权服务已关闭"));
    const read = async () => {
      const ids = await this.storage.list();
      return Promise.all(ids.map(key => this.#serial(key, async () => {
        const state = await this.#load(key, undefined, true);
        if (this.#closed || !state) throw agentErrors.delegation_unreadable("授权目录已关闭或记录消失");
        return delegationSnapshot(state);
      })));
    };
    const task = read(); this.#lists.add(task);
    void task.finally(() => this.#lists.delete(task)).catch(() => undefined); return task;
  }
  async permission(subject: AgentDelegationSubject): Promise<WorkDelegationPermission> {
    if (subject.kind !== "work") throw agentErrors.delegation_invalid("执行权限必须绑定实际工作");
    const work = await this.read(subject);
    if (!work) throw agentErrors.delegation_unreadable("工作授权尚未加载");
    const ongoingSubject = ongoingDelegationSubject(subject); await this.read(ongoingSubject);
    this.assertCurrent(subject, work.epoch);
    const current = this.#states.get(workDelegationKey(subject))!, ongoing = this.#states.get(workDelegationKey(ongoingSubject));
    this.#executing(workDelegationKey(ongoingSubject), ongoing);
    const permission = workDelegationPermission(delegationSnapshot(current), ongoing && delegationSnapshot(ongoing), this.now());
    if (permission.automatic) this.assertCurrent(permission.automatic.state.subject, permission.automatic.state.epoch, permission.automatic.selection);
    const key = workDelegationKey(subject), ongoingKey = workDelegationKey(ongoingSubject);
    const fence = this.#fences.get(key) ?? 0, ongoingFence = this.#fences.get(ongoingKey) ?? 0;
    return { ...permission, work_epoch: work.epoch, assertCurrent: () => {
      this.assertCurrent(subject, work.epoch); this.#executing(ongoingKey, this.#states.get(ongoingKey));
      const live = workDelegationPermission(this.#states.get(key)!, this.#states.get(ongoingKey), this.now());
      if ((this.#fences.get(key) ?? 0) !== fence || (this.#fences.get(ongoingKey) ?? 0) !== ongoingFence
        || live.mode !== permission.mode || live.automatic?.selection.id !== permission.automatic?.selection.id
        || live.automatic?.selection.revision !== permission.automatic?.selection.revision) throw agentErrors.delegation_changed("工作或持续权限选择已变化");
      if (permission.automatic) this.assertCurrent(permission.automatic.state.subject, permission.automatic.state.epoch, permission.automatic.selection);
    } };
  }
  /** Host-only: the original action control validates schema and captures current provider/target identities. */
  async actionDecision(subject: AgentDelegationSubject, proposal: WorkActionProposal, control: ReviewDecisionControl) {
    const fixed = structuredClone(subject), prepared = prepareActionDelegation(proposal, control);
    await prepared.beforeEffect();
    const permission = await this.permission(fixed);
    return prepared.decide(permission);
  }
  #open(key: string, state: StoredDelegationState | undefined): void {
    if (this.#closed || this.#blocked.has(key) || this.#unreadable.has(key) || state && state.lifecycle !== "open") throw agentErrors.delegation_ended("这项工作的授权已经结束或尚未核清");
  }
  #executing(key: string, state: StoredDelegationState | undefined): void {
    this.#open(key, state);
    if (this.#changing.has(key)) throw agentErrors.delegation_changed("权限变更尚未落定，不能签发或沿用执行许可");
  }
  #invalidate(key: string, subject: AgentDelegationSubject, state: StoredDelegationState | undefined, reason: WorkDelegationInvalidation["reason"]): WorkDelegationCancellation[] {
    if (this.#closed) throw agentErrors.delegation_ended("授权服务已关闭");
    this.#changing.add(key);
    const current = currentDelegation(state);
    if (current) this.#invalid.set(key, selectionKey(key, current));
    this.#fences.set(key, (this.#fences.get(key) ?? 0) + 1);
    // Capture original Runs synchronously. Settlement is outside the storage queue and remains retryable.
    const receipts: WorkDelegationCancellation[] = [];
    for (const listener of this.#listeners) {
      const receipt = listener({ subject: structuredClone(subject), previous: state && delegationSnapshot(state), reason });
      requireSynchronous(receipt, "原轮失效必须同步完成");
      if (receipt) receipts.push(receipt);
    }
    return receipts;
  }
  #mutating<T>(key: string, operation: (receipts: WorkDelegationCancellation[]) => Promise<T>, receipts: WorkDelegationCancellation[] = []): Promise<T> {
    return this.#serial(key, async () => {
      try {
        const value = await operation(receipts);
        for (const receipt of receipts) this.#cancellations.add(key, receipt);
        return value;
      } finally { this.#changing.delete(key); }
    }).then(async value => {
      if (this.#closed) throw agentErrors.delegation_ended("授权服务已关闭");
      if (receipts.length) await this.#cancellations.settle(key); return value;
    });
  }
  cancellationPending(subject: AgentDelegationSubject): boolean { return this.#cancellations.pending(workDelegationKey(subject)); }
  async settle(subject: AgentDelegationSubject): Promise<AgentDelegationState | undefined> {
    if (this.#closed) throw agentErrors.delegation_ended("授权服务已关闭");
    await this.read(subject);
    if (this.#closed) throw agentErrors.delegation_ended("授权服务已关闭");
    await this.#cancellations.settle(workDelegationKey(subject)); return this.read(subject);
  }
  async #save(key: string, next: StoredDelegationState, control: ReviewDecisionControl, assertAllowed: () => void = () => {}, receipts: readonly WorkDelegationCancellation[] = []): Promise<AgentDelegationState> {
    const fixed = readDelegationState({ ...next, submission_id: randomUUID(), storage_version: next.storage_version + 1 }, next.subject);
    this.#uncertain.set(key, { next: fixed, reopens: this.#states.get(key)?.lifecycle === "ended" && fixed.lifecycle === "open", receipts: [...receipts] });
    try { await this.storage.compareAndSet(key, next.storage_version, fixed, {
      beforeEffect: control.beforeEffect, assertCurrent: () => { assertControl(control); if (this.#closed) throw agentErrors.delegation_ended("授权服务已关闭"); assertAllowed(); },
    }); }
    catch (error) {
      const current = await this.#load(key, next.subject, true);
      if (!current || !isDeepStrictEqual(current, fixed)) throw error;
      // A failed acknowledgement may follow a committed CAS. Only this exact submission proves success.
    }
    this.#states.set(key, fixed); this.#uncertain.delete(key); this.#invalid.delete(key); return delegationSnapshot(fixed);
  }
  async ensureWork(subject: AgentDelegationSubject, control: ReviewDecisionControl): Promise<AgentDelegationState> {
    const fixed = structuredClone(subject), key = workDelegationKey(fixed);
    if (fixed.kind !== "work") throw agentErrors.delegation_invalid("只有实际工作需要授权 epoch");
    return this.#serial(key, async () => {
      const current = await this.#load(key, fixed); this.#open(key, current);
      return current ? delegationSnapshot(current) : this.#save(key, newDelegationState(fixed), control, () => this.#open(key, current));
    });
  }
  grant(subject: AgentDelegationSubject, input: WorkDelegationGrant, control: ReviewDecisionControl): Promise<AgentDelegationState> {
    return this.#grant(subject, input, control, false);
  }
  /** Only the actual work owner may call after verifying that stop/archive has closed and the person explicitly grants anew. */
  reopen(subject: AgentDelegationSubject, input: WorkDelegationGrant, control: ReviewDecisionControl): Promise<AgentDelegationState> {
    return this.#grant(subject, input, control, true);
  }
  #grant(subject: AgentDelegationSubject, input: WorkDelegationGrant, control: ReviewDecisionControl, reopen: boolean): Promise<AgentDelegationState> {
    const fixed = structuredClone(subject), grant = structuredClone(input), key = workDelegationKey(fixed);
    const endAttempt = this.#endAttempts.get(key) ?? 0;
    if (!validDelegationMode(grant.mode) || !Array.isArray(grant.scopes) || !grant.scopes.every(validDelegationScope)
      || grant.expires_at !== null && (!delegationDate(grant.expires_at) || Date.parse(grant.expires_at) <= this.now())) return Promise.reject(agentErrors.delegation_invalid("权限方式、范围或到期时间无效"));
    return this.#mutating(key, async receipts => {
      const current = await this.#load(key, fixed); assertStorageVersion(current, grant.expected_version);
      await control.beforeEffect(); assertControl(control);
      if (reopen) {
        if (fixed.kind !== "work" || current?.lifecycle !== "ended") throw agentErrors.delegation_ended("工作尚未完成停止，不能重新授予");
      } else this.#open(key, current);
      const at = new Date(this.now()).toISOString(), previous = currentDelegation(current);
      const row: AgentDelegationSelection = { id: randomUUID(), revision: 1, mode: grant.mode === "automatic" && !grant.scopes.length ? "confirm" : grant.mode,
        scopes: grant.scopes, expires_at: grant.expires_at, granted_by: fixed.actor_id, granted_at: at, revoked_at: null, supersedes: previous?.id ?? null };
      receipts.push(...this.#invalidate(key, fixed, current, "selection"));
      const next: StoredDelegationState = { ...(current ?? newDelegationState(fixed)), ...(reopen ? { epoch: randomUUID() } : {}), lifecycle: "open", ended_at: null, ended_reason: null,
        selection_id: row.id, selections: [...(current?.selections ?? []).map(old => old.revoked_at ? old : { ...old, revoked_at: at }), row] };
      const saved = await this.#save(key, next, control, () => {
        if ((this.#endAttempts.get(key) ?? 0) !== endAttempt) throw agentErrors.delegation_ended("工作正在结束，不能保存新的授权");
        if (!reopen) this.#open(key, current);
      }, receipts);
      if (reopen) this.#blocked.delete(key);
      return saved;
    });
  }
  narrow(subject: AgentDelegationSubject, expected: WorkDelegationChange, input: { scopes: readonly AgentDelegationScope[]; expires_at: string | null; mode: AgentDelegationMode }, control: ReviewDecisionControl): Promise<AgentDelegationState> {
    const change = structuredClone(input);
    return this.#change(subject, expected, control, row => {
      if (!validDelegationMode(change.mode) || delegationModeRank(change.mode) < delegationModeRank(row.mode)
        || !Array.isArray(change.scopes) || !delegationScopesNarrow(row.scopes, change.scopes)
        || change.expires_at !== null && !delegationDate(change.expires_at)
        || row.expires_at !== null && (change.expires_at === null || Date.parse(change.expires_at) > Date.parse(row.expires_at))) throw agentErrors.delegation_invalid("只能收窄现有范围、缩短有效期或选择更严格方式");
      return { ...row, scopes: change.scopes, expires_at: change.expires_at, mode: change.mode === "automatic" && !change.scopes.length ? "confirm" : change.mode };
    });
  }
  revoke(subject: AgentDelegationSubject, expected: WorkDelegationChange, control: ReviewDecisionControl): Promise<AgentDelegationState> {
    return this.#change(subject, expected, control, row => ({ ...row, mode: row.mode === "read-only" ? "read-only" : "confirm", scopes: [], revoked_at: new Date(this.now()).toISOString() }));
  }
  #change(subject: AgentDelegationSubject, expected: WorkDelegationChange, control: ReviewDecisionControl, update: (row: AgentDelegationSelection) => AgentDelegationSelection): Promise<AgentDelegationState> {
    const fixed = structuredClone(subject), token = structuredClone(expected), key = workDelegationKey(fixed);
    return this.#mutating(key, async receipts => {
      const current = await this.#load(key, fixed); this.#open(key, current); assertStorageVersion(current, token.expected_version);
      const row = currentDelegation(current);
      if (!current || !row || row.id !== token.id || row.revision !== token.revision) throw agentErrors.delegation_changed("当前授权已变化");
      const next = { ...update(row), revision: row.revision + 1 };
      await control.beforeEffect(); assertControl(control); this.#open(key, current);
      receipts.push(...this.#invalidate(key, fixed, current, "selection"));
      const saved = await this.#save(key, { ...current, selections: current.selections.map(item => item.id === row.id ? next : item) }, control, () => this.#open(key, current), receipts);
      return saved;
    });
  }
  /** Synchronous refusal begins before the storage queue. A stale stop names its original epoch, never the new work. */
  beginEnd(subject: AgentDelegationSubject, epoch: string | null, reason: string, control: ReviewDecisionControl): Promise<AgentDelegationState> {
    if (this.#closed) return Promise.reject(agentErrors.delegation_ended("授权服务已关闭"));
    const fixed = structuredClone(subject), key = workDelegationKey(fixed), known = this.#states.get(key);
    const endedReason = reason.trim();
    if (fixed.kind !== "work" || !endedReason || !this.#states.has(key) || (known?.epoch ?? null) !== epoch) return Promise.reject(agentErrors.delegation_changed("先读取原工作授权 epoch，变化后不能结束新工作"));
    assertControl(control);
    if (known?.lifecycle === "ended") return Promise.resolve(delegationSnapshot(known));
    this.#endAttempts.set(key, (this.#endAttempts.get(key) ?? 0) + 1);
    this.#blocked.add(key);
    const receipts = known?.lifecycle !== "ending" ? this.#invalidate(key, fixed, known, "ending") : [];
    return this.#mutating(key, async () => {
      await control.beforeEffect(); assertControl(control);
      const current = await this.#load(key, fixed, true);
      if ((current?.epoch ?? null) !== epoch && !(epoch === null && !known)) throw agentErrors.delegation_changed("工作授权 epoch 已变化");
      if (current && current.lifecycle !== "open") return delegationSnapshot(current);
      const at = new Date(this.now()).toISOString(), next = { ...(current ?? newDelegationState(fixed)), lifecycle: "ending" as const, ended_at: at, ended_reason: endedReason,
        selections: (current?.selections ?? []).map(row => ({ ...row, mode: row.mode === "read-only" ? "read-only" as const : "confirm" as const, revoked_at: row.revoked_at ?? at })) };
      return this.#save(key, next, control, () => {}, receipts);
    }, receipts);
  }
  async finishEnd(subject: AgentDelegationSubject, epoch: string, control: ReviewDecisionControl): Promise<AgentDelegationState> {
    const fixed = structuredClone(subject), key = workDelegationKey(fixed);
    await this.read(fixed); await control.beforeEffect(); assertControl(control);
    const seen = this.#states.get(key);
    if (this.#closed || !seen || seen.epoch !== epoch || seen.lifecycle === "open") throw agentErrors.delegation_changed("原工作尚未进入结束流程");
    await this.#cancellations.settle(key);
    return this.#serial(key, async () => {
      const current = await this.#load(key, fixed, true);
      if (!current || current.epoch !== epoch || current.lifecycle === "open") throw agentErrors.delegation_changed("原工作尚未进入结束流程");
      return current.lifecycle === "ended" ? delegationSnapshot(current) : this.#save(key, { ...current, lifecycle: "ended" }, control);
    });
  }
  /** Requires a successful load before exposing any Run. Invalidation never trusts a later replacement selection. */
  assertCurrent(subject: AgentDelegationSubject, epoch: string, selection?: Pick<AgentDelegationSelection, "id" | "revision">): void {
    const key = workDelegationKey(subject), state = this.#states.get(key);
    this.#executing(key, state);
    if (!state || state.epoch !== epoch) throw agentErrors.delegation_changed("原工作许可不再有效");
    if (selection) {
      const current = currentDelegation(state);
      if (!current || current.id !== selection.id || current.revision !== selection.revision || current.revoked_at !== null
        || current.expires_at !== null && Date.parse(current.expires_at) <= this.now() || this.#invalid.get(key) === selectionKey(key, selection)) throw agentErrors.delegation_changed("原授权已收窄、撤销或到期");
    }
  }
  async close(): Promise<void> {
    this.#closed = true;
    await Promise.allSettled([...this.#queues.values(), ...this.#lists]); await this.#cancellations.close();
    this.#listeners.clear(); this.#states.clear(); this.#invalid.clear(); this.#blocked.clear(); this.#endAttempts.clear(); this.#fences.clear(); this.#unreadable.clear(); this.#uncertain.clear(); this.#changing.clear();
  }
}
