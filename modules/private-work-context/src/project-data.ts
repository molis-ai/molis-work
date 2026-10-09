import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { createSessionContentStore } from "./content-store.js";
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
    const content = createSessionContentStore(path.join(sessionsDirectory, "content"));
    db.transaction(() => {
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

      // Content is addressed by its text: a blob that another row still names stays. Removing before the commit makes a
      // failure roll the rows back, so the retry finds the Sessions again and removes what is left.
      const named = db.prepare(`
        SELECT 1 FROM session_events WHERE content_ref = :ref
        UNION ALL SELECT 1 FROM session_handoffs WHERE content_ref = :ref
        UNION ALL SELECT 1 FROM session_messages WHERE content_ref = :ref LIMIT 1
      `);
      for (const ref of refs) if (named.get({ ref }) === undefined) content.remove(ref);
    }).immediate();
  } finally { db.close(); }
}

/**
 * What the Sessions registry keeps in the Home for a project and how the project's deletion clears it. Not a plugin, so the
 * Host lists it by hand, and it gives the Ledger factory the registry is opened with.
 */
export function sessionsProjectData(createLedger: SessionLedgerFactory): ProjectDataDeclaration {
  return { label: "这个项目里的会话记录与交接", order: 100, purge: (homeDirectory, projectId) => purgeSessionsProject(homeDirectory, projectId, createLedger) };
}
