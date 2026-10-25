import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { type MemoryAdoptionCleanupItem, type MemoryAdoptionCleanupPage, type MemoryAdoptionPage, type MemoryAdoptionVerification } from "@prologue/sdk";
import { openNodeRecoveryMaintenance, openNodeRecoveryInspection, type NodeRecoveryMaintenance, type NodeRecoveryInspectionInput, type NodeRecoveryInspection } from "@prologue/sdk/node";
import type { AgentSessionLifecycleReceipt, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assertStorageOwner, type StorageOwner } from "@molis-ai/molis-work-storage";
import { createColdSessionPurge } from "./prologue-session-cold-purge.js";
import { sessionPurgePreview, sessionConflict, type PrologueSessionPurgeTarget } from "./prologue-session-purge.js";
import { agentErrors } from "../errors.js";
import type { PrologueMemoryOptions } from "./prologue-memory-authority.js";
import { acquirePrologueStorageOwner } from "./prologue-storage-owner.js";
import { inspectSessionIndexPage, sessionIndexKind, type PrologueSessionIndexPage } from "./prologue-session-index-reader.js";

export interface PrologueMemoryAdoptionScope { readonly scope: "user" | "project" | "character"; readonly owner: string }
export interface PrologueMemoryAdoptionInput {
  readonly storageRoot: string;
  /** Borrow the Home parent's sole execution child; closing never releases this parent. */
  readonly storageOwner?: StorageOwner;
  readonly appVersion: string;
  readonly scopes: readonly PrologueMemoryAdoptionScope[];
  readonly policy: PrologueMemoryOptions["policy"];
  readonly signal?: AbortSignal;
  readonly assertCurrent?: () => void;
  /** Synchronous barrier after exclusive ownership and before SDK opening; called once. */
  readonly onOwned?: () => void;
  /** Fixed target decisions; execution cannot replace their owner, operation or preview. */
  readonly sessionPurges?: readonly PrologueSessionPurgeTarget[];
}
export interface PrologueMemoryAdoptionBridge {
  adopt(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionPage>;
  verify(input: { scopes: readonly PrologueMemoryAdoptionScope[]; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionVerification>;
  previewCleanup(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionCleanupPage>;
  purgeCleanupTarget(input: { target: MemoryAdoptionCleanupItem; operation_id: string; signal?: AbortSignal }): Promise<void>;
  purgeSessionTarget(input: { session: AgentSessionRef }): Promise<AgentSessionLifecycleReceipt>;
  /** First close fixes one synchronous publication. Retry failed cleanup without replaying publication or releasing a supplied parent. */
  close(afterSDKClosed?: () => void): Promise<void>;
}

export type PrologueMemoryAdoptionInspection = Pick<PrologueMemoryAdoptionBridge, "previewCleanup"> & {
  /** One bounded source page; empty/exhausted does not certify SDK/Catalog Session coverage. */
  inspectSessionIndexes(input: { limit?: number; cursor?: string; signal?: AbortSignal }): Promise<PrologueSessionIndexPage>;
  inspectSession: NodeRecoveryInspection["inspectSession"];
  sessionTerminations: NodeRecoveryInspection["sessionTerminations"];
  inspectMemory: NodeRecoveryInspection["inspectMemory"];
  previewMemoryPurge: NodeRecoveryInspection["previewMemoryPurge"];
  close(): Promise<void>;
};

function prepare(input: Omit<PrologueMemoryAdoptionInput, "onOwned" | "sessionPurges">) {
  input = { ...input };
  input.signal?.throwIfAborted();
  if (!isAbsolute(input.storageRoot) || !input.appVersion || input.scopes.some(scope => !scope.owner
    || !["user", "project", "character"].includes(scope.scope))) {
    throw agentErrors.capability_unavailable("离线记忆采用需要明确的存储目录和既有归属");
  }
  const scopes = input.scopes.map(scope => Object.freeze({ scope: scope.scope, owner: scope.owner }));
  // Offline adoption needs the App taxonomy and limits, not its live extractor/recaller/promotion instances.
  // The bridge exposes adoption/verification and fixed-target cleanup; every scope stays explicitly bound.
  const policy: PrologueMemoryOptions["policy"] = { ...structuredClone(input.policy), preset: "manual",
    matrix: { default: { actions: ["manage-read", "delete"], formation: [] } } };
  const app = { appId: "io.molis.work", appVersion: input.appVersion };
  const context = Object.freeze({ consumer: "memory-maintenance", currentScene: "common", purpose: "management" as const });
  const stop = new AbortController(), pending = new Set<Promise<unknown>>();
  const allowed = (target: { scope: string; owner: string }) => scopes.some(scope => scope.scope === target.scope && scope.owner === target.owner);
  const current = () => {
    input.signal?.throwIfAborted(); stop.signal.throwIfAborted();
    if (input.storageOwner !== undefined) assertStorageOwner(input.storageRoot, input.storageOwner);
    const checked: unknown = input.assertCurrent?.();
    if (checked !== undefined) {
      if (checked !== null && (typeof checked === "object" || typeof checked === "function") && "then" in checked)
        void Promise.resolve(checked).catch(() => undefined);
      throw agentErrors.capability_unavailable("维护权限必须同步确认");
    }
    input.signal?.throwIfAborted(); stop.signal.throwIfAborted();
    if (input.storageOwner !== undefined) assertStorageOwner(input.storageRoot, input.storageOwner);
  };
  const bound = (request: { appId: string; context: unknown }) => { current(); return request.appId === app.appId && isDeepStrictEqual(request.context, context); };
  const memory: NodeRecoveryInspectionInput["memory"] = { policy, context, scopes, authority: {
    authorize: async requests => requests.every(request => bound(request) && ["manage-read", "delete"].includes(request.action) && allowed(request.target)),
    assertCurrent: requests => {
      current();
      if (!requests.every(request => bound(request) && ["manage-read", "delete"].includes(request.action) && allowed(request.target)))
        throw agentErrors.capability_unavailable("当前维护授权不允许此清理目标");
    },
    authorizeManagement: async request => ({ allowed: bound(request) && allowed(request) }),
    authorizeAdoption: async request => bound(request) && request.scopes.length === scopes.length
      && request.scopes.every(allowed) && scopes.every(scope => request.scopes.some(item => item.scope === scope.scope && item.owner === scope.owner)),
  } };
  const perform = <T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const current = AbortSignal.any([stop.signal, ...(input.signal ? [input.signal] : []), ...(signal ? [signal] : [])]);
    const operation = (async () => { current.throwIfAborted(); return work(current); })();
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  };
  current();
  return { input, app, memory, current, allowed, stop, pending, perform };
}

/** Offline writer: same exclusive owner, with no Runtime startup or shutdown. */
export async function openPrologueMemoryAdoption(input: PrologueMemoryAdoptionInput): Promise<PrologueMemoryAdoptionBridge> {
  const onOwned = input.onOwned;
  const targets = structuredClone(input.sessionPurges ?? []);
  const previews = targets.map(sessionPurgePreview);
  if (new Set(targets.map(target => target.session.session_id)).size !== targets.length) throw sessionConflict();
  const { input: fixed, app, memory, current, allowed, stop, pending, perform } = prepare(input);
  const release = acquirePrologueStorageOwner(fixed.storageRoot, fixed.storageOwner);
  let maintenance: NodeRecoveryMaintenance;
  try {
    current();
    const checked: unknown = onOwned?.();
    if (checked !== undefined) {
      void Promise.resolve(checked).catch(() => undefined);
      throw agentErrors.capability_unavailable("维护阻断必须同步建立");
    }
    current();
    maintenance = await openNodeRecoveryMaintenance({ storageRoot: fixed.storageRoot, app, memory,
      sessionPurges: previews, appStorageKind: sessionIndexKind(app.appId), assertCurrent: current, ...(fixed.signal ? { signal: fixed.signal } : {}) });
  } catch (error) { release(); throw error; }
  const purgeSession = createColdSessionPurge(maintenance, { storageRoot: fixed.storageRoot, app, memory,
    appStorageKind: sessionIndexKind(app.appId), assertCurrent: current }, targets, current);
  let closing: Promise<void> | undefined, publish: (() => void) | undefined;
  let started = false, sdkClosed = false, publicationAttempted = false, released = false;
  let publicationFailure: { error: unknown } | undefined;
  const close = (afterSDKClosed?: () => void): Promise<void> => {
    if (started && afterSDKClosed !== undefined) return Promise.reject(agentErrors.capability_unavailable("维护关闭已经开始，不能追加完成发布"));
    if (!started) { started = true; publish = afterSDKClosed; stop.abort(); }
    if (closing) return closing;
    closing = (async () => {
      await Promise.allSettled([...pending]);
      // Failed SDK close retains the owner and must never publish completion.
      if (!sdkClosed) { await maintenance.close(); sdkClosed = true; }
      if (!publicationAttempted) {
        publicationAttempted = true;
        try {
          const checked: unknown = publish?.();
          if (checked !== undefined) {
            void Promise.resolve(checked).catch(() => undefined);
            throw agentErrors.capability_unavailable("维护完成必须同步发布");
          }
        } catch (error) { publicationFailure = { error }; }
      }
      try { if (!released) { release(); released = true; } }
      catch (error) {
        if (publicationFailure) throw new AggregateError([publicationFailure.error, error], "维护发布及资源释放失败");
        throw error;
      }
      if (publicationFailure) throw publicationFailure.error;
    })().catch(error => { closing = undefined; throw error; });
    return closing;
  };
  if (fixed.signal?.aborted) { await close(); fixed.signal.throwIfAborted(); }
  return {
    adopt: request => perform(request.signal, signal => maintenance.adoptStorage({ ...request, signal,
      // Old kind/namespace/origin do not prove a natural scene. Keep absent classification absent.
      classify: () => undefined,
    })),
    verify: request => perform(request.signal, signal => maintenance.verifyAdoption({ ...request, signal })),
    previewCleanup: request => perform(request.signal, signal => maintenance.previewAdoptionCleanup({ ...request, signal })),
    purgeCleanupTarget: request => {
      const target = structuredClone(request.target), operationId = request.operation_id;
      return perform(request.signal, async signal => {
        current();
        if (!allowed(target.identity)) throw agentErrors.capability_unavailable("清理目标已不在当前维护范围");
        await maintenance.purgeMemory({ ref: target.ref, expectedVersion: target.expectedVersion, operationId, identity: target.identity, signal });
        current(); signal.throwIfAborted();
      });
    },
    purgeSessionTarget: request => perform(undefined, () => purgeSession(request.session)),
    close,
  };
}

/** Existing-only inspection: no writer owner, directory creation or SDK recovery. */
export async function openPrologueMemoryAdoptionInspection(input: Omit<PrologueMemoryAdoptionInput, "onOwned" | "sessionPurges">): Promise<PrologueMemoryAdoptionInspection> {
  const { input: fixed, app, memory, current, stop, pending, perform } = prepare(input);
  const kind = sessionIndexKind(app.appId);
  const inspection = await openNodeRecoveryInspection({ storageRoot: fixed.storageRoot, app, memory, appStorageKind: kind, assertCurrent: current });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    stop.abort(); await Promise.allSettled([...pending]); await inspection.close();
  })().catch(error => { closing = undefined; throw error; });
  if (fixed.signal?.aborted) { await close(); fixed.signal.throwIfAborted(); }
  return {
    previewCleanup: request => perform(request.signal, signal => inspection.previewAdoptionCleanup({ ...request, signal })),
    inspectSession: request => perform(request.signal, signal => inspection.inspectSession({ ...request, signal })),
    sessionTerminations: request => perform(request.signal, signal => inspection.sessionTerminations({ ...request, signal })),
    inspectMemory: request => perform(request.signal, signal => inspection.inspectMemory({ ...request, signal })),
    previewMemoryPurge: request => perform(request.signal, signal => inspection.previewMemoryPurge({ ...request, signal })),
    inspectSessionIndexes: request => {
      const { limit, cursor } = request;
      return perform(request.signal, async signal => {
        const check = () => { current(); signal.throwIfAborted(); };
        const page = await inspectSessionIndexPage(inspection.storage, kind, { limit, cursor }, check);
        check(); return page;
      });
    },
    close,
  };
}
