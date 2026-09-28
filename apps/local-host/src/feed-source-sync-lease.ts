import { realpathSync } from "node:fs";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";

// One executing Host owns the Home. Separate factory instances and SQLite connections
// must still share a source lease; in-memory databases have distinct identities.
const files = new Map<string, Set<string>>();
const memory = new WeakMap<SqliteDatabase, Set<string>>();
export function feedSourceSyncLease(db: SqliteDatabase): (boardId: string, sourceId: string) => () => void {
  const file = db.name && db.name !== ":memory:" ? realpathSync(db.name) : undefined;
  return (boardId, sourceId) => {
    const active = (file ? files.get(file) : memory.get(db)) ?? new Set<string>();
    const key = JSON.stringify([boardId, sourceId]);
    if (active.has(key)) throw new FeedDomainError("该来源正在拉取，请稍后重试", "feed_source_sync_interrupted");
    active.add(key);
    if (file) files.set(file, active); else memory.set(db, active);
    return () => { active.delete(key); if (file && active.size === 0) files.delete(file); };
  };
}
