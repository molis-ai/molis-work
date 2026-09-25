import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** The SDK's recovery assumes a sole execution owner. Never recover another live owner's work. */
export function acquirePrologueStorageOwner(directory: string): () => void {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, ".molis-runtime-owner.db"));
  try { db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE"); }
  catch (error) {
    db.close();
    if ((error as { errcode?: number }).errcode === 5 || (error as { errcode?: number }).errcode === 6) {
      throw Object.assign(new Error("Agent 执行服务正由另一个进程使用；当前入口尚未接通该执行方，请在原入口处理。原任务不会被撤回。"), { code: "agent.storage_busy" });
    }
    throw error;
  }
  let released = false;
  return () => { if (!released) { released = true; db.close(); } };
}
