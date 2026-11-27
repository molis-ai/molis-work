import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.generated.js";
import { LocalCatalogMetadata, type SqliteDatabase } from "@molis-ai/molis-work-storage";

/**
 * An unmarked Home keeps the six members originally preserved in batch 107. Existing member choices are retained.
 * New Homes are marked at creation. Batch 108's five plugins are enabled by the person in each partition.
 * Remove this one-time repair with batch 111 or the first release (CONTRACT-CHANGES).
 */
export function formerPersonalPlugins(): string[] {
  // The already agreed historical cohort. Adding a partition declaration in a future release cannot enroll an old Home in it.
  return PLATFORM_PLUGIN_REGISTRATIONS.filter(plugin => plugin.preservedMembershipBatch === 107).map(plugin => plugin.project_plugin_id);
}
export const FORMER_PERSONAL_PLUGINS_MARK = "mark.former-personal-plugins";
/** Rows this writes are the platform's upgrade, never the person's own choice. */
export const FORMER_PERSONAL_PLUGINS_ACTOR_ID = "upgrade:former-personal-plugins";

export function markFormerPersonalPluginsDone(db: SqliteDatabase, at: string): void {
  new LocalCatalogMetadata(db).setMark(FORMER_PERSONAL_PLUGINS_MARK, at);
}

/** Read without a write lock, so an open that has nothing to do never waits for another writer. */
export function formerPersonalPluginsKept(db: SqliteDatabase): boolean {
  return new LocalCatalogMetadata(db).mark(FORMER_PERSONAL_PLUGINS_MARK) !== null;
}

/** Runs inside the caller's write transaction; a second run, or one after an interrupted run rolled back, writes the same or nothing. */
export function keepFormerPersonalPlugins(db: SqliteDatabase, add: (pluginIds: readonly string[], actorId: string) => number, at: string): number {
  if (formerPersonalPluginsKept(db)) return 0;
  const added = add(formerPersonalPlugins(), FORMER_PERSONAL_PLUGINS_ACTOR_ID);
  markFormerPersonalPluginsDone(db, at);
  return added;
}
