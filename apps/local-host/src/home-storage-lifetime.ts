import { realpathSync } from "node:fs";
import path from "node:path";
import { acquireStorageOwner, assertStorageOwner, type StorageOwner } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { hostErrors } from "./host-errors.js";
import { hostLog } from "./host-log.js";

/** A synchronous failed initializer still hands its caller the actual resource cleanup attempt. */
export interface HomeInitializationFailure extends Error { close(): Promise<void> }

interface CleanupAttempt { attempt?: Promise<void>; work?: Promise<void> }
const CLOSE_WAIT_MS = 10_000;

/** A caller stops waiting at its deadline; the actual close remains owned, observed and shared until it settles. */
function closeHomeAttempt(state: CleanupAttempt, dispose: () => Promise<void>): Promise<void> {
  if (state.attempt) return state.attempt;
  const work = state.work ??= (async () => { await dispose(); })().catch(error => {
    state.work = undefined; hostLog.warn("host", "home_close_failed", error); throw error;
  });
  let timer: ReturnType<typeof setTimeout>;
  const waiting = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => {
      const error = hostErrors.close_timeout("Home 关闭尚未完成，仍保留所有权；可再次明确关闭以等待或重试");
      hostLog.warn("host", "home_close_timeout", error, { timeout_ms: CLOSE_WAIT_MS, pending: true }); reject(error);
    }, CLOSE_WAIT_MS);
    void work.then(resolve, reject);
  });
  return state.attempt = waiting.finally(() => { clearTimeout(timer); }).catch(error => { state.attempt = undefined; throw error; });
}

export function retainInitializationCleanup(reason: unknown, dispose: () => Promise<void>,
  event: "initialization_cleanup_failed" | "web_initialization_cleanup_failed"): HomeInitializationFailure {
  const state: CleanupAttempt = {}, close = () => closeHomeAttempt(state, dispose);
  let failure: Error;
  if (reason instanceof Error && Object.isExtensible(reason) && !("close" in reason)) failure = reason;
  else {
    failure = reason instanceof ActionError
      ? new ActionError(reason.code, reason.message, { ...(reason.kind ? { kind: reason.kind } : {}), ...(reason.details ? { details: reason.details } : {}), cause: reason })
      : new AggregateError([reason], reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Home 初始化失败", { cause: reason });
    const code = reason instanceof Error ? Object.getOwnPropertyDescriptor(reason, "code") : undefined;
    if (!(failure instanceof ActionError) && typeof code?.value === "string") Object.defineProperty(failure, "code", { value: code.value });
  }
  Object.defineProperty(failure, "close", { value: close });
  void close().catch(error => { hostLog.warn("host", event, error); });
  return failure as HomeInitializationFailure;
}

const owners = new WeakMap<object, { home: string; owner: StorageOwner; released: boolean; resources: Set<() => Promise<void>> }>();

/** A Host acquires strictly once. Later transports and its one Agent can only use that same physical Home. */
export function ensureHomeStorageOwner(host: object, homeDirectory: string): StorageOwner {
  const requested = path.resolve(homeDirectory), held = owners.get(host);
  if (held) {
    if (held.released) throw hostErrors.closed("Local Host 的存储所有权已释放");
    let canonical: string;
    try { canonical = realpathSync(requested); }
    catch { throw new ActionError("actions.home_mismatch", "Host 的原 Home 不再可用"); }
    if (canonical !== held.home) throw new ActionError("actions.home_mismatch", "Host 不能绑定到另一个 Home");
    assertStorageOwner(agentRuntimeDirectory(held.home), held.owner);
    return held.owner;
  }
  const owner = acquireStorageOwner(agentRuntimeDirectory(requested));
  try {
    const home = realpathSync(requested);
    owners.set(host, { home, owner, released: false, resources: new Set() });
    return owner;
  } catch (error) { owner.release(); throw error; }
}

/** A transport's storage resources belong to the same Host lifetime, including when the Web entry borrows that Host. */
export function retainHomeStorageResources(host: object, close: () => Promise<void>): () => void {
  const held = owners.get(host);
  if (!held || held.released) throw hostErrors.closed("Local Host 未持有 Home 存储所有权");
  held.resources.add(close);
  return () => { held.resources.delete(close); };
}

export async function closeHomeStorageResources(host: object): Promise<void> {
  const resources = owners.get(host)?.resources;
  if (!resources) return;
  const failures: unknown[] = [];
  for (const close of resources) {
    try { await close(); resources.delete(close); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "Web 存储资源尚未全部关闭，仍保留 Home 所有权");
}

/** The Home's release boundary: an explicit attempt shares pending work and never turns a failed close into success. */
export function closeHomeStorageLifetime(host: object, state: CleanupAttempt & { started?: boolean; completed: Set<string> },
  steps: ReadonlyArray<readonly [string, () => unknown]>, closeCatalog: () => unknown,
  earlySteps: ReadonlyArray<readonly [string, () => unknown]> = []): Promise<void> {
  state.started = true;
  return closeHomeAttempt(state, async () => {
    const results = await Promise.allSettled([
      ...earlySteps.map(step => closeHostResourceSteps(state.completed, [step])),
      (async () => { await closeHomeStorageResources(host); await closeHostResourceSteps(state.completed, steps); })(),
    ]);
    const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Home 的关闭尚未完成，仍保留存储所有权");
    await closeCatalog();
    releaseHomeStorageOwner(host);
  });
}

/** Called only after every actual business resource has closed. Failed or still-borrowed releases remain retryable. */
export function releaseHomeStorageOwner(host: object): void {
  const held = owners.get(host);
  if (!held || held.released) return;
  held.owner.release();
  held.released = true;
}

/** Try every independent close step, remember successes, and retry failures only on the next explicit close. */
export async function closeHostResourceSteps(completed: Set<string>, steps: ReadonlyArray<readonly [string, () => unknown]>): Promise<void> {
  const failures: unknown[] = [];
  for (const [name, close] of steps) {
    if (completed.has(name)) continue;
    try { await close(); completed.add(name); } catch (error) { hostLog.warn("host", "resource_close_failed", error, { resource: name }); failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "Home 的部分资源尚未关闭，仍保留原存储所有权；可再次明确关闭");
}
