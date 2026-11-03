import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { acquireStorageOwner, borrowStorageOwner, type StorageOwner } from "@molis-ai/molis-work-storage";
import { agentErrors } from "../errors.js";

/** The SDK borrows a real Home owner, or owns this same storage lock itself for an independent runtime. */
export function acquirePrologueStorageOwner(directory: string, parent?: StorageOwner): () => void {
  let owned: StorageOwner | undefined;
  try {
    const owner = parent === undefined ? (owned = acquireStorageOwner(directory)) : parent;
    const child = borrowStorageOwner(directory, owner);
    return () => { child.release(); owned?.release(); };
  }
  catch (error) {
    owned?.release();
    if (error instanceof ActionError && error.code === "storage.owner.busy") {
      throw agentErrors.storage_busy("Agent 执行服务正由另一个进程使用；请在原入口处理，原任务不会被撤回。");
    }
    throw error;
  }
}
