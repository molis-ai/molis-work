import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { type MemoryAdoptionCleanupItem, type MemoryAdoptionCleanupPage, type MemoryAdoptionPage, type MemoryAdoptionVerification, type MemoryPurgeInspectionAuthorizationRequest, type MemorySessionPurgeSelection } from "@prologue/sdk";
import { openNodeRecoveryMaintenance, openNodeRecoveryInspection, type NodeRecoveryMaintenance, type NodeRecoveryInspectionInput, type NodeRecoveryInspection } from "@prologue/sdk/node";
import type { AgentSessionLifecycleReceipt, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assertStorageOwner, type StorageOwner } from "@molis-ai/molis-work-storage";
import { createColdSessionPurge } from "./prologue-session-cold-purge.js";
import { sessionPurgePreview, type PrologueSessionPurgeTarget } from "./prologue-session-purge.js";
import { agentErrors } from "../errors.js";
import type { PrologueMemoryOptions } from "./prologue-memory-authority.js";
import { acquirePrologueStorageOwner } from "./prologue-storage-owner.js";
import { inspectSessionIndexPage, sessionIndexKind, type PrologueSessionIndexPage } from "./prologue-session-index-reader.js";
import type { ProjectSessionDeletionPlan } from "./prologue-project-deletion.js";
import { fixedColdSessionTargets, prepareProjectSessionPurge, prepareSessionPurge, verifyProjectSessionPurge, verifySessionPurge,
  type ProjectSessionPurgePreparationInput, type ProjectSessionPurgeVerificationInput, type SessionPurgePreparationInput, type SessionPurgeVerificationInput } from "./prologue-project-session-cold.js";

export interface PrologueMemoryAdoptionScope { readonly scope: "user" | "project" | "character"; readonly owner: string }
type MemoryPurgeTarget = Omit<Parameters<NodeRecoveryMaintenance["purgeMemory"]>[0], "signal">;
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
  /** Complete original Catalog relationships; raw children cannot be authorized as standalone targets. */
  readonly projectSessionPurges?: readonly ProjectSessionDeletionPlan[];
  /** Metadata coverage and Session preview permissions; never entry mutation permission. */
  readonly purgeInspection?: {
    readonly operationId: string;
    readonly knownScopes: readonly PrologueMemoryAdoptionScope[];
    readonly selections: readonly MemorySessionPurgeSelection[];
  };
  /** Original durable Memory decisions; execution selects by ref and cannot replace their tuple. */
  readonly memoryPurges?: readonly MemoryPurgeTarget[];
}
export interface PrologueMemoryAdoptionBridge {
  adopt(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionPage>;
  verify(input: { scopes: readonly PrologueMemoryAdoptionScope[]; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionVerification>;
  previewCleanup(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionCleanupPage>;
  purgeCleanupTarget(input: { target: MemoryAdoptionCleanupItem; operation_id: string; signal?: AbortSignal }): Promise<void>;
  purgeSessionTarget(input: { session: AgentSessionRef }): Promise<AgentSessionLifecycleReceipt>;
  verifySessionPurge(input: SessionPurgeVerificationInput): Promise<void>;
  verifyProjectSessionPurge(input: ProjectSessionPurgeVerificationInput): Promise<void>;
  purgeMemoryTarget(input: { ref: MemoryPurgeTarget["ref"]; signal?: AbortSignal }): Promise<void>;
  verifyPurgeCoverage: NodeRecoveryInspection["verifyPurgeCoverage"];
  inspectMemory: NodeRecoveryInspection["inspectMemory"];
  previewMemoryPurge: NodeRecoveryInspection["previewMemoryPurge"];
  /** First close fixes one synchronous publication. Retry failed cleanup without replaying publication or releasing a supplied parent. */
  close(afterSDKClosed?: () => void): Promise<void>;
}

export type PrologueMemoryAdoptionInspection = Pick<PrologueMemoryAdoptionBridge, "previewCleanup"> & {
  prepareSessionPurge(input: SessionPurgePreparationInput): Promise<PrologueSessionPurgeTarget>;
  verifySessionPurge(input: SessionPurgeVerificationInput): Promise<void>;
  prepareProjectSessionPurge(input: ProjectSessionPurgePreparationInput): Promise<ProjectSessionDeletionPlan>;
  verifyProjectSessionPurge(input: ProjectSessionPurgeVerificationInput): Promise<void>;
  /** One bounded source page; empty/exhausted does not certify SDK/Catalog Session coverage. */
  inspectSessionIndexes(input: { limit?: number; cursor?: string; signal?: AbortSignal }): Promise<PrologueSessionIndexPage>;
  inspectSession: NodeRecoveryInspection["inspectSession"];
  sessionTerminations: NodeRecoveryInspection["sessionTerminations"];
  inspectMemory: NodeRecoveryInspection["inspectMemory"];
  previewMemoryPurge: NodeRecoveryInspection["previewMemoryPurge"];
  verifyPurgeCoverage: NodeRecoveryInspection["verifyPurgeCoverage"];
  close(): Promise<void>;
};

function fixedPurgePermissions(input: PrologueMemoryAdoptionInput, allowed: (scope: { scope: string; owner: string }) => boolean,
  bound: (request: { appId: string; context: unknown }) => boolean) {
  const inspection = structuredClone(input.purgeInspection), targets = structuredClone(input.memoryPurges ?? []);
  const refuse = () => { throw agentErrors.capability_unavailable("原记忆清除决定或检查范围不一致"); };
  if (inspection && (!inspection.operationId.trim() || inspection.knownScopes.some(scope => !scope.owner.trim()
    || !["user", "project", "character"].includes(scope.scope))
    || inspection.selections.some(selection => selection.operationId !== inspection.operationId))) refuse();
  const ids = new Set<string>();
  for (const target of targets) {
    const id = `${target.ref.kind}:${target.ref.id}`;
    if (ids.has(id) || !["memory", "memory-candidate"].includes(target.ref.kind) || !target.ref.id || target.ref.revision !== 1
      || !allowed(target.identity) || !Number.isSafeInteger(target.expectedVersion) || target.expectedVersion < 1 || !target.operationId.trim()
      || Object.keys(target).some(key => !["ref", "identity", "expectedVersion", "operationId", "selection"].includes(key))) refuse();
    ids.add(id);
  }
  const selections = [...inspection?.selections ?? [], ...targets.flatMap(target => target.selection ? [target.selection] : [])]
    .filter((selection, index, all) => !all.slice(0, index).some(other => isDeepStrictEqual(other, selection)));
  const permits = (request: MemoryPurgeInspectionAuthorizationRequest, coverageOnly = false) => {
    if (!bound(request)) return false;
    if (request.purpose === "owner-coverage") return coverageOnly && inspection !== undefined
      && request.operationId === inspection.operationId && isDeepStrictEqual(request.knownScopes, inspection.knownScopes);
    if (coverageOnly) return false;
    if (request.purpose === "session-preview") return inspection?.selections.some(selection => isDeepStrictEqual(request.selection, selection)) === true;
    return targets.some(target => isDeepStrictEqual(target, { ref: request.ref, identity: request.identity,
      expectedVersion: request.expectedVersion, operationId: request.operationId, selection: request.selection }));
  };
  return { inspection, targets, selections, permits, refuse };
}

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
  const purge = fixedPurgePermissions(input, allowed, bound);
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
    authorizePurgeInspection: async request => purge.permits(request),
    assertPurgeInspectionCurrent: request => { if (!purge.permits(request)) purge.refuse(); },
  }, purgeSelections: purge.selections };
  const perform = <T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const combined = AbortSignal.any([stop.signal, ...(input.signal ? [input.signal] : []), ...(signal ? [signal] : [])]);
    const operation = (async () => {
      current(); combined.throwIfAborted(); const result = await work(combined);
      current(); combined.throwIfAborted(); return result;
    })();
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  };
  current();
  return { input, app, memory, current, allowed, stop, pending, perform, purge };
}

/** Temporary real readers do not outlive a write; failed cleanup stays owned until close retries. */
function recoveryReaders(prepared: ReturnType<typeof prepare>) {
  const { input, app, memory, current, perform, purge, stop } = prepared;
  const readers = new Set<NodeRecoveryInspection>();
  const closeReader = async (reader: NodeRecoveryInspection) => {
    try { await reader.close(); readers.delete(reader); }
    catch (error) { stop.abort(); throw error; }
  };
  const read = async <T>(config: NodeRecoveryInspectionInput["memory"], signal: AbortSignal,
    work: (reader: NodeRecoveryInspection) => Promise<T>, withIndex = false): Promise<T> => {
    current(); signal.throwIfAborted();
    const reader = await openNodeRecoveryInspection({ storageRoot: input.storageRoot, app, memory: config,
      ...(withIndex ? { appStorageKind: sessionIndexKind(app.appId) } : {}),
      assertCurrent: () => { current(); signal.throwIfAborted(); } });
    readers.add(reader);
    try { current(); signal.throwIfAborted(); const value = await work(reader); current(); signal.throwIfAborted(); return value; }
    finally { await closeReader(reader); }
  };
  const verifyPurgeCoverage: NodeRecoveryInspection["verifyPurgeCoverage"] = request => {
    const { signal: requestedSignal, ...data } = request, requested = structuredClone(data);
    return perform(requestedSignal, signal => {
      const fixed = purge.inspection;
      if (!fixed || requested.operationId !== fixed.operationId || !isDeepStrictEqual(requested.knownScopes, fixed.knownScopes)) return purge.refuse();
      const coverage: NodeRecoveryInspectionInput["memory"] = { ...memory, scopes: fixed.knownScopes, purgeSelections: [], authority: {
        authorize: async () => false,
        assertCurrent: () => purge.refuse(),
        authorizeAdoption: async request => { current(); return request.appId === app.appId && isDeepStrictEqual(request.context, memory.context)
          && isDeepStrictEqual(request.scopes, fixed.knownScopes); },
        authorizeManagement: async request => { current(); return { allowed: request.appId === app.appId && isDeepStrictEqual(request.context, memory.context)
          && fixed.knownScopes.some(scope => scope.scope === request.scope && scope.owner === request.owner) }; },
        authorizePurgeInspection: async request => purge.permits(request, true),
        assertPurgeInspectionCurrent: request => { if (!purge.permits(request, true)) purge.refuse(); },
      } };
      return read(coverage, signal, reader => reader.verifyPurgeCoverage({ ...requested, signal }));
    });
  };
  const inspectMemory: NodeRecoveryInspection["inspectMemory"] = request => {
    const { signal: requestedSignal, ...data } = request, fixed = structuredClone(data);
    return perform(requestedSignal, signal => read(memory, signal, reader => reader.inspectMemory({ ...fixed, signal })));
  };
  const previewMemoryPurge: NodeRecoveryInspection["previewMemoryPurge"] = request => {
    const { signal: requestedSignal, ...data } = request, fixed = structuredClone(data);
    return perform(requestedSignal, signal => read(memory, signal, reader => reader.previewMemoryPurge({ ...fixed, signal })));
  };
  return {
    verifyPurgeCoverage, inspectMemory, previewMemoryPurge,
    inspectSession: (request: Parameters<NodeRecoveryInspection["inspectSession"]>[0]) => {
      const { signal: requestedSignal, ...data } = request, fixed = structuredClone(data);
      return perform(requestedSignal, signal => read(memory, signal, reader => reader.inspectSession({ ...fixed, signal })));
    },
    prepareProjectSessionPurge: (request: ProjectSessionPurgePreparationInput) => {
      const { signal: requestedSignal, ...data } = request, fixed = structuredClone(data);
      return perform(requestedSignal, signal => read(memory, signal,
        reader => prepareProjectSessionPurge(reader, app.appId, { ...fixed, signal }, () => { current(); signal.throwIfAborted(); }), true));
    },
    prepareSessionPurge: (request: SessionPurgePreparationInput) => {
      const { signal: requestedSignal, ...data } = request, fixed = structuredClone(data);
      return perform(requestedSignal, signal => read(memory, signal,
        reader => prepareSessionPurge(reader, app.appId, { ...fixed, signal }, () => { current(); signal.throwIfAborted(); }), true));
    },
    verifySessionPurge: (request: SessionPurgeVerificationInput) => {
      const { signal: requestedSignal, ...data } = request, fixed = structuredClone(data);
      return perform(requestedSignal, signal => read(memory, signal,
        reader => verifySessionPurge(reader, app.appId, { ...fixed, signal }, () => { current(); signal.throwIfAborted(); }), true));
    },
    verifyProjectSessionPurge: (request: ProjectSessionPurgeVerificationInput) => {
      const { signal: requestedSignal, ...data } = request, fixed = structuredClone(data);
      return perform(requestedSignal, signal => read(memory, signal,
        reader => verifyProjectSessionPurge(reader, app.appId, { ...fixed, signal }, () => { current(); signal.throwIfAborted(); }), true));
    },
    close: async () => { for (const reader of readers) await closeReader(reader); },
  };
}

/** Offline writer: same exclusive owner, with no Runtime startup or shutdown. */
export async function openPrologueMemoryAdoption(input: PrologueMemoryAdoptionInput): Promise<PrologueMemoryAdoptionBridge> {
  const onOwned = input.onOwned;
  const sessionTargets = fixedColdSessionTargets(input.sessionPurges ?? [], input.projectSessionPurges ?? []);
  const previews = sessionTargets.targets.map(sessionPurgePreview);
  const prepared = prepare(input);
  const { input: fixed, app, memory, current, allowed, stop, pending, perform, purge } = prepared;
  const readers = recoveryReaders(prepared);
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
  const purgeSession = createColdSessionPurge(maintenance, app.appId, sessionTargets, readers.inspectSession, current);
  let closing: Promise<void> | undefined, publish: (() => void) | undefined;
  let started = false, sdkClosed = false, publicationAttempted = false, released = false;
  let publicationFailure: { error: unknown } | undefined;
  const close = (afterSDKClosed?: () => void): Promise<void> => {
    if (started && afterSDKClosed !== undefined) return Promise.reject(agentErrors.capability_unavailable("维护关闭已经开始，不能追加完成发布"));
    if (!started) { started = true; publish = afterSDKClosed; stop.abort(); }
    if (closing) return closing;
    closing = (async () => {
      await Promise.allSettled([...pending]);
      await readers.close();
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
  try { current(); } catch (error) { await close(); throw error; }
  return {
    verifySessionPurge: readers.verifySessionPurge,
    verifyProjectSessionPurge: readers.verifyProjectSessionPurge,
    verifyPurgeCoverage: readers.verifyPurgeCoverage,
    inspectMemory: readers.inspectMemory,
    previewMemoryPurge: readers.previewMemoryPurge,
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
    purgeMemoryTarget: request => {
      const target = purge.targets.find(target => isDeepStrictEqual(target.ref, request.ref));
      return perform(request.signal, async signal => {
        current(); if (!target) return purge.refuse();
        await maintenance.purgeMemory({ ...target, signal }); current(); signal.throwIfAborted();
      });
    },
    close,
  };
}

/** Existing-only inspection: no writer owner, directory creation or SDK recovery. */
export async function openPrologueMemoryAdoptionInspection(input: Omit<PrologueMemoryAdoptionInput, "onOwned" | "sessionPurges" | "projectSessionPurges" | "memoryPurges">): Promise<PrologueMemoryAdoptionInspection> {
  const prepared = prepare(input);
  const { input: fixed, app, memory, current, stop, pending, perform } = prepared;
  const readers = recoveryReaders(prepared);
  const kind = sessionIndexKind(app.appId);
  const inspection = await openNodeRecoveryInspection({ storageRoot: fixed.storageRoot, app, memory, appStorageKind: kind, assertCurrent: current });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    stop.abort(); await Promise.allSettled([...pending]); await readers.close(); await inspection.close();
  })().catch(error => { closing = undefined; throw error; });
  try { current(); } catch (error) { await close(); throw error; }
  return {
    prepareSessionPurge: readers.prepareSessionPurge,
    verifySessionPurge: readers.verifySessionPurge,
    prepareProjectSessionPurge: readers.prepareProjectSessionPurge,
    verifyProjectSessionPurge: readers.verifyProjectSessionPurge,
    verifyPurgeCoverage: readers.verifyPurgeCoverage,
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
