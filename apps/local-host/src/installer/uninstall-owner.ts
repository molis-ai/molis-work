import { acquireStorageOwner, type StorageOwner } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { ensureHomeStorageOwner, retainHomeStorageResources } from "../home-storage-lifetime.js";
import { hostErrors } from "../host-errors.js";
import type { MolisWorkLocalHost } from "../project-host.js";

/** Admission and retention are synchronous; the existing Host close waits for the operation's final settlement. */
export async function withUninstallOwner<T>(home: string, host: MolisWorkLocalHost | undefined, operation: (owner: StorageOwner) => Promise<T>, purge = false): Promise<T> {
  if (!host || purge) {
    let owner: StorageOwner;
    try { owner = acquireStorageOwner(agentRuntimeDirectory(home)); }
    catch (error) {
      if (purge && error instanceof ActionError && error.code === "storage.owner.busy") {
        throw new ActionError(error.code, "此 Home 仍由 App 或离线操作使用；请先关闭 App 并等待操作结束，再重试永久清除，尚未清除业务数据", { kind: error.kind, cause: error });
      }
      throw error;
    }
    try { return await operation(owner); }
    finally { owner.release(); }
  }
  if (host.lifecycle() !== "running") throw hostErrors.closed("Local Host 正在关闭或已关闭，不能再接纳卸载");
  const owner = ensureHomeStorageOwner(host, home);
  let settled!: () => void;
  const pending = new Promise<void>(resolve => { settled = resolve; });
  const forget = retainHomeStorageResources(host, () => pending);
  try { return await operation(owner); }
  finally { settled(); forget(); }
}
