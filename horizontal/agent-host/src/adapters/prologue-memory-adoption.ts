import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createRuntime, type MemoryAdoptionCleanupItem, type MemoryAdoptionCleanupPage, type MemoryAdoptionPage, type MemoryAdoptionVerification, type Runtime } from "@prologue/sdk";
import { createNodeHost } from "@prologue/sdk/node";
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
}
export interface PrologueMemoryAdoptionBridge {
  adopt(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionPage>;
  verify(input: { scopes: readonly PrologueMemoryAdoptionScope[]; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionVerification>;
  previewCleanup(input: PrologueMemoryAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<MemoryAdoptionCleanupPage>;
  purgeCleanupTarget(input: { target: MemoryAdoptionCleanupItem; operation_id: string; signal?: AbortSignal }): Promise<void>;
  close(): Promise<void>;
}

/** Offline only: shares the normal adapter's exclusive owner, but exposes no Agent, model or ordinary memory writer. */
export async function openPrologueMemoryAdoption(input: PrologueMemoryAdoptionInput): Promise<PrologueMemoryAdoptionBridge> {
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
  const release = acquirePrologueStorageOwner(input.storageRoot);
  let runtime: Runtime;
  try {
    runtime = await createRuntime({ app, host: createNodeHost({ storageRoot: input.storageRoot, exclusiveOwner: true }),
      config: { memory: policy }, memoryAuthority: {
        authorize: async requests => requests.every(request => bound(request) && ["manage-read", "delete"].includes(request.action) && allowed(request.target)),
        assertCurrent: requests => {
          current();
          if (!requests.every(request => bound(request) && ["manage-read", "delete"].includes(request.action) && allowed(request.target)))
            throw agentErrors.capability_unavailable("当前维护授权不允许此清理目标");
        },
        authorizeManagement: async request => ({ allowed: bound(request) && allowed(request) }),
        authorizeAdoption: async request => bound(request) && request.scopes.length === scopes.length
          && request.scopes.every(allowed) && scopes.every(scope => request.scopes.some(item => item.scope === scope.scope && item.owner === scope.owner)),
      },
    });
  } catch (error) { release(); throw error; }
  const maintenance = runtime.bindMemory(context);
  const perform = <T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const current = AbortSignal.any([stop.signal, ...(input.signal ? [input.signal] : []), ...(signal ? [signal] : [])]);
    const operation = (async () => { current.throwIfAborted(); return work(current); })();
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  };
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    stop.abort();
    await Promise.allSettled([...pending]);
    await runtime.shutdown();
    // Failed shutdown retains the owner, as the normal Node adapter does. Ledger completion must not run.
    release();
  })();
  if (input.signal?.aborted) { await close(); input.signal.throwIfAborted(); }
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
        const options = { expectedVersion: target.expectedVersion, operationId, identity: target.identity, signal };
        if (target.ref.kind === "memory") await maintenance.memory.purge(target.ref, options);
        else await maintenance.candidates.purge(target.ref, options);
        current(); signal.throwIfAborted();
      });
    },
    close,
  };
}
