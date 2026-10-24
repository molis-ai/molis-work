import { realpathSync } from "node:fs";
import path from "node:path";
import { acquireStorageOwner, assertStorageOwner, type StorageOwner } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { hostErrors } from "./host-errors.js";

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
export function closeHomeStorageLifetime(host: object, state: { started?: boolean; completed: Set<string>; attempt?: Promise<void> },
  steps: ReadonlyArray<readonly [string, () => unknown]>, closeCatalog: () => unknown,
  earlySteps: ReadonlyArray<readonly [string, () => unknown]> = []): Promise<void> {
  state.started = true;
  return state.attempt ??= (async () => {
    const results = await Promise.allSettled([
      ...earlySteps.map(step => closeHostResourceSteps(state.completed, [step])),
      (async () => { await closeHomeStorageResources(host); await closeHostResourceSteps(state.completed, steps); })(),
    ]);
    const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Home 的关闭尚未完成，仍保留存储所有权");
    await closeCatalog();
    releaseHomeStorageOwner(host);
  })().catch(error => { state.attempt = undefined; throw error; });
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
    try { await close(); completed.add(name); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "Home 的部分资源尚未关闭，仍保留原存储所有权；可再次明确关闭");
}
