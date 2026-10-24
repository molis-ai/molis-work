import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { type MemoryAdoptionCleanupItem, type MemoryAdoptionCleanupPage, type MemoryAdoptionPage, type MemoryAdoptionVerification } from "@prologue/sdk";
import { openNodeRecoveryMaintenance, openNodeRecoveryInspection, type NodeRecoveryMaintenance, type NodeRecoveryInspectionInput } from "@prologue/sdk/node";
import { agentErrors } from "../errors.js";
import type { PrologueMemoryOptions } from "./prologue-memory-authority.js";
import { acquirePrologueStorageOwner } from "./prologue-storage-owner.js";

export interface PrologueMemoryAdoptionScope { readonly scope: "user" | "project" | "character"; readonly owner: string }
export interface PrologueMemoryAdoptionInput {
  readonly storageRoot: string;
  readonly appVersion: string;
  readonly scopes: readonly PrologueMemoryAdoptionScope[];
  readonly policy: PrologueMemoryOptions["policy"];
  readonly signal?: AbortSignal;
  readonly assertCurrent?: () => void;
  /** Synchronous barrier after exclusive ownership and before SDK opening; called once. */
  readonly onOwned?: () => void;
}
export interface PrologueMemoryAdoptionBridge {
  adopt(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionPage>;
  verify(input: { scopes: readonly PrologueMemoryAdoptionScope[]; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionVerification>;
  previewCleanup(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionCleanupPage>;
  purgeCleanupTarget(input: { target: MemoryAdoptionCleanupItem; operation_id: string; signal?: AbortSignal }): Promise<void>;
  /** Publish synchronously after SDK close, while this same owner is still held. Supplied on the first close only. */
  close(afterSDKClosed?: () => void): Promise<void>;
}

export type PrologueMemoryAdoptionInspection = Pick<PrologueMemoryAdoptionBridge, "previewCleanup"> & { close(): Promise<void> };

function prepare(input: Omit<PrologueMemoryAdoptionInput, "onOwned">) {
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
    const checked: unknown = input.assertCurrent?.();
    if (checked !== undefined) {
      if (checked !== null && (typeof checked === "object" || typeof checked === "function") && "then" in checked)
        void Promise.resolve(checked).catch(() => undefined);
      throw agentErrors.capability_unavailable("维护权限必须同步确认");
    }
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
  const { input: fixed, app, memory, current, allowed, stop, pending, perform } = prepare(input);
  const release = acquirePrologueStorageOwner(fixed.storageRoot);
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
      sessionPurges: [], assertCurrent: current, ...(fixed.signal ? { signal: fixed.signal } : {}) });
  } catch (error) { release(); throw error; }
  let closing: Promise<void> | undefined;
  const close = (afterSDKClosed?: () => void): Promise<void> => {
    if (closing) return afterSDKClosed === undefined ? closing
      : Promise.reject(agentErrors.capability_unavailable("维护关闭已经开始，不能追加完成发布"));
    closing = (async () => {
      stop.abort();
      await Promise.allSettled([...pending]);
      // Failed SDK close retains the owner and must never publish completion.
      await maintenance.close();
      try {
        const checked: unknown = afterSDKClosed?.();
        if (checked !== undefined) {
          void Promise.resolve(checked).catch(() => undefined);
          throw agentErrors.capability_unavailable("维护完成必须同步发布");
        }
      } finally { release(); }
    })();
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
    close,
  };
}

/** Existing-only inspection: no writer owner, directory creation or SDK recovery. */
export async function openPrologueMemoryAdoptionInspection(input: Omit<PrologueMemoryAdoptionInput, "onOwned">): Promise<PrologueMemoryAdoptionInspection> {
  const { input: fixed, app, memory, current, stop, pending, perform } = prepare(input);
  const inspection = await openNodeRecoveryInspection({ storageRoot: fixed.storageRoot, app, memory, assertCurrent: current });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    stop.abort(); await Promise.allSettled([...pending]); await inspection.close();
  })();
  if (fixed.signal?.aborted) { await close(); fixed.signal.throwIfAborted(); }
  return { previewCleanup: request => perform(request.signal, signal => inspection.previewAdoptionCleanup({ ...request, signal })), close };
}
