import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { createSessionContentStore, type SessionContentStore } from "./content-store.js";
import { HandoffAssociationRepository } from "./handoff-associations.js";
import { SessionAssociationRepository } from "./session-associations.js";
import { validateSessionRegistryMeta } from "./session-schema.js";

/** The Host gives the Ledger over the registry's own connection, the way it does when it opens the registry. */
export type SessionLedgerFactory = (db: Database.Database) => ContextLedgerApi;

const idsIn = "(SELECT value FROM json_each(?))";
const ACTOR = "system:project-deleted";

/**
 * The project is deleted: its Sessions go, with the events, handoff packages and message requests that hang off them and
 * the stored contents nothing names any more. A Session belongs to a project by the Ledger edge it last has, which the
 * Ledger answers (`sessionsOfProject`); their project, Goal and workspace edges and their handoffs' edges are unlinked
 * through the Ledger too, whose append-only history keeps the removed edges (ids only, no content). A handoff another
 * project's Session sent to this project stays with its source; the Session it was sent to is gone, so its destination is
 * emptied by the registry's own foreign key. Works on the registry's file, so any process on the Home can run it: it does
 * not create the file, refuses a file that is not this registry's or has another version, and running it again finds
 * nothing to delete.
 *
 * The rows go in one transaction and are committed first. The content blocks no row names are removed after that, in a
 * second write transaction (see `removeUnnamedContent`), which looks at every block on disk and not only at the ones this
 * project's rows named: a block whose removal failed, or that the process died before removing, has no row left to be found
 * by, and the run that retries must still collect it. A failed commit therefore leaves the blocks in place, and a failure
 * while removing blocks leaves the rows deleted and throws, so the retry removes what is left.
 */
export function purgeSessionsProject(homeDirectory: string, projectId: string, createLedger: SessionLedgerFactory): void {
  const sessionsDirectory = path.join(path.resolve(homeDirectory), "sessions");
  const file = path.join(sessionsDirectory, "sessions.db");
  if (!existsSync(file)) return;
  const db = new Database(file, { timeout: 5000 });
  try {
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_meta'").get() === undefined) return;
    validateSessionRegistryMeta(db);
    const ledger = createLedger(db);
    db.transaction(() => deleteSessionRows(db, ledger, projectId)).immediate();
    removeUnnamedContent(db, createSessionContentStore(path.join(sessionsDirectory, "content")));
  } finally { db.close(); }
}

/** Unlinks and deletes the project's Sessions and what hangs off them. */
function deleteSessionRows(db: Database.Database, ledger: ContextLedgerApi, projectId: string): void {
  const at = new Date().toISOString();
  const associations = new SessionAssociationRepository(ledger);
  const sessionIds = associations.sessionsOfProject(projectId);
  const sessions = JSON.stringify(sessionIds);
  const handoffIds = (db.prepare(`SELECT package_id FROM session_handoffs WHERE source_session_id IN ${idsIn}`).all(sessions) as Array<{ package_id: string }>).map(row => row.package_id);

  const handoffAssociations = new HandoffAssociationRepository(ledger);
  for (const packageId of handoffIds) handoffAssociations.release(packageId, ACTOR, at);
  for (const sessionId of sessionIds) associations.release(sessionId, ACTOR, at);
  db.prepare(`DELETE FROM session_messages WHERE session_id IN ${idsIn} OR project_id = ?`).run(sessions, projectId);
  db.prepare(`DELETE FROM session_events WHERE session_id IN ${idsIn}`).run(sessions);
  db.prepare(`DELETE FROM session_handoffs WHERE source_session_id IN ${idsIn}`).run(sessions);
  db.prepare(`DELETE FROM sessions WHERE session_id IN ${idsIn}`).run(sessions);
}

/**
 * Removes every block no row names, after the rows that named them have been committed. Content is addressed by its text, so
 * a block another row still names stays. Every writer stores its block inside the registry's write lock, in the same
 * transaction that inserts the row naming it, so this runs in a write transaction of its own: holding that lock, the rows it
 * reads and the blocks it lists are one moment, and nobody can name a block between the check and the removal. A block no row
 * names is garbage by construction (a writer whose transaction was rolled back, a block whose removal failed, one the process
 * died before removing), whichever project it came from, and the next run collects it, so a retry converges even though the
 * rows that named it are gone. The rows are already gone, so removing a block cannot bring them back: a block that fails to
 * go is only an unreferenced file, the other blocks are still tried, and the failure is thrown after them.
 */
function removeUnnamedContent(db: Database.Database, content: SessionContentStore): void {
  const failures = db.transaction(() => {
    const named = namedContent(db);
    const failed: unknown[] = [];
    for (const ref of content.list()) {
      if (named.has(ref)) continue;
      try { content.remove(ref); } catch (error) { failed.push(error); }
    }
    return failed;
  }).immediate();
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, `${failures.length} session content blocks could not be removed`);
}

/** The content references the registry's rows name: every table with a `content_ref` column, so a table added later keeps its blocks. */
function namedContent(db: Database.Database): Set<string> {
  const tables = (db.prepare("SELECT m.name AS name FROM sqlite_master m JOIN pragma_table_info(m.name) p ON p.name = 'content_ref' WHERE m.type = 'table'").all() as Array<{ name: string }>).map(row => row.name);
  const named = new Set<string>();
  for (const table of tables) {
    for (const ref of db.prepare(`SELECT DISTINCT content_ref FROM "${table.replaceAll('"', '""')}"`).pluck().all() as string[]) named.add(ref);
  }
  return named;
}

/**
 * What the Sessions registry keeps in the Home for a project and how the project's deletion clears it. Not a plugin, so the
 * Host lists it by hand, and it gives the Ledger factory the registry is opened with.
 */
export function sessionsProjectData(createLedger: SessionLedgerFactory): ProjectDataDeclaration {
  return { label: "这个项目里的会话记录与交接", order: 100, purge: (homeDirectory, projectId) => purgeSessionsProject(homeDirectory, projectId, createLedger) };
}
