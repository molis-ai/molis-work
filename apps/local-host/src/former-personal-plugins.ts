import { LocalCatalogMetadata, type SqliteDatabase } from "@molis-ai/molis-work-storage";

/**
 * One-time fix kept under docs/system/CONTRACT-CHANGES.md「当前保留机制」(user confirmed 2026-11-25, batch 107).
 * These six stopped being personal plugins in batch 107. A Home made before that saw them in every partition that
 * did not hide them; on its first open with this version each such partition gets a member row, written once.
 * A Home made with this version is marked at creation and never runs it. Removed with batch 111 or the first release.
 */
export const FORMER_PERSONAL_PLUGINS = ["dataset", "form", "lingguang", "pages", "ppt", "workflows"] as const;
export const FORMER_PERSONAL_PLUGINS_MARK = "mark.former-personal-plugins";
/** Rows this writes are the platform's upgrade, never the person's own choice. */
export const FORMER_PERSONAL_PLUGINS_ACTOR_ID = "upgrade:former-personal-plugins";

export function markFormerPersonalPluginsDone(db: SqliteDatabase, at: string): void {
  new LocalCatalogMetadata(db).setMark(FORMER_PERSONAL_PLUGINS_MARK, at);
}

/** Runs inside the caller's write transaction; a second run, or one after an interrupted run rolled back, writes the same or nothing. */
export function keepFormerPersonalPlugins(db: SqliteDatabase, add: (pluginIds: readonly string[], actorId: string) => number, at: string): number {
  if (new LocalCatalogMetadata(db).mark(FORMER_PERSONAL_PLUGINS_MARK) !== null) return 0;
  const added = add(FORMER_PERSONAL_PLUGINS, FORMER_PERSONAL_PLUGINS_ACTOR_ID);
  markFormerPersonalPluginsDone(db, at);
  return added;
}
