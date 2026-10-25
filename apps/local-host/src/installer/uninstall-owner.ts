import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { ensureHomeStorageOwner, retainHomeStorageResources } from "../home-storage-lifetime.js";
import { hostErrors } from "../host-errors.js";
import type { MolisWorkLocalHost } from "../project-host.js";

/** Admission and retention are synchronous; the existing Host close waits for the operation's final settlement. */
export async function withUninstallOwner<T>(home: string, host: MolisWorkLocalHost | undefined, operation: () => Promise<T>): Promise<T> {
  if (!host) {
    const owner = acquireStorageOwner(agentRuntimeDirectory(home));
    try { return await operation(); }
    finally { owner.release(); }
  }
  if (host.lifecycle() !== "running") throw hostErrors.closed("Local Host 正在关闭或已关闭，不能再接纳卸载");
  ensureHomeStorageOwner(host, home);
  let settled!: () => void;
  const pending = new Promise<void>(resolve => { settled = resolve; });
  const forget = retainHomeStorageResources(host, () => pending);
  try { return await operation(); }
  finally { settled(); forget(); }
}
