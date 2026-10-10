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
 * the stored contents nothing else names. A Session belongs to a project by the Ledger edge it last has, which the
 * Ledger answers (`sessionsOfProject`); their project, Goal and workspace edges and their handoffs' edges are unlinked
 * through the Ledger too, whose append-only history keeps the removed edges (ids only, no content). A handoff another
 * project's Session sent to this project stays with its source; the Session it was sent to is gone, so its destination is
 * emptied by the registry's own foreign key. Works on the registry's file, so any process on the Home can run it: it does
 * not create the file, refuses a file that is not this registry's or has another version, and running it again finds
 * nothing.
 *
 * The rows go in one transaction and are committed first; the content blocks no row names any more are removed after
 * that, in a second write transaction (see `removeUnnamedContent`). A failure while removing blocks therefore leaves the
 * rows deleted and throws, and a failed commit leaves the blocks in place.
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
    const refs = db.transaction(() => deleteSessionRows(db, ledger, projectId)).immediate();
    removeUnnamedContent(db, createSessionContentStore(path.join(sessionsDirectory, "content")), refs);
  } finally { db.close(); }
}

/** Unlinks and deletes the project's Sessions and what hangs off them; returns the content references those rows had. */
function deleteSessionRows(db: Database.Database, ledger: ContextLedgerApi, projectId: string): string[] {
  const at = new Date().toISOString();
  const associations = new SessionAssociationRepository(ledger);
  const sessionIds = associations.sessionsOfProject(projectId);
  const sessions = JSON.stringify(sessionIds);
  const handoffIds = (db.prepare(`SELECT package_id FROM session_handoffs WHERE source_session_id IN ${idsIn}`).all(sessions) as Array<{ package_id: string }>).map(row => row.package_id);
  const refs = (db.prepare(`
    SELECT content_ref FROM session_events WHERE session_id IN ${idsIn}
    UNION SELECT content_ref FROM session_handoffs WHERE source_session_id IN ${idsIn}
    UNION SELECT content_ref FROM session_messages WHERE session_id IN ${idsIn} OR project_id = ?
  `).all(sessions, sessions, sessions, projectId) as Array<{ content_ref: string }>).map(row => row.content_ref);

  const handoffAssociations = new HandoffAssociationRepository(ledger);
  for (const packageId of handoffIds) handoffAssociations.release(packageId, ACTOR, at);
  for (const sessionId of sessionIds) associations.release(sessionId, ACTOR, at);
  db.prepare(`DELETE FROM session_messages WHERE session_id IN ${idsIn} OR project_id = ?`).run(sessions, projectId);
  db.prepare(`DELETE FROM session_events WHERE session_id IN ${idsIn}`).run(sessions);
  db.prepare(`DELETE FROM session_handoffs WHERE source_session_id IN ${idsIn}`).run(sessions);
  db.prepare(`DELETE FROM sessions WHERE session_id IN ${idsIn}`).run(sessions);
  return refs;
}

/**
 * Removes the blocks no row names, after the rows that named them have been committed. Content is addressed by its text, so
 * a block another row still names stays; and every writer stores its block inside the registry's write lock, so this runs in
 * a write transaction of its own and checks each block there, where nobody can name it between the check and the removal. The
 * rows are already gone, so removing a block cannot bring them back and a block that fails to go is only an unreferenced
 * file: the other blocks are still tried, and the failure is thrown after them. The retry that follows finds no rows to
 * name that block again, so it stays until its file can be removed some other way.
 */
function removeUnnamedContent(db: Database.Database, content: SessionContentStore, refs: string[]): void {
  if (refs.length === 0) return;
  const named = db.prepare(`
    SELECT 1 FROM session_events WHERE content_ref = :ref
    UNION ALL SELECT 1 FROM session_handoffs WHERE content_ref = :ref
    UNION ALL SELECT 1 FROM session_messages WHERE content_ref = :ref LIMIT 1
  `);
  const failures = db.transaction(() => {
    const failed: unknown[] = [];
    for (const ref of refs) {
      if (named.get({ ref }) !== undefined) continue;
      try { content.remove(ref); } catch (error) { failed.push(error); }
    }
    return failed;
  }).immediate();
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, `${failures.length} session content blocks could not be removed`);
}

/**
 * What the Sessions registry keeps in the Home for a project and how the project's deletion clears it. Not a plugin, so the
 * Host lists it by hand, and it gives the Ledger factory the registry is opened with.
 */
export function sessionsProjectData(createLedger: SessionLedgerFactory): ProjectDataDeclaration {
  return { label: "这个项目里的会话记录与交接", order: 100, purge: (homeDirectory, projectId) => purgeSessionsProject(homeDirectory, projectId, createLedger) };
}
