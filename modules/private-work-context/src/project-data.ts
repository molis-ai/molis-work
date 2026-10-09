import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { createSessionContentStore } from "./content-store.js";
import { SESSION_LEDGER_SCOPE, SESSION_PROJECT_RELATION } from "./session-associations.js";
import { validateSessionRegistryMeta } from "./session-schema.js";

const doomed = "(SELECT value FROM json_each(?))";

/**
 * The project is deleted: its Sessions go, with the events, handoff packages and message requests that hang off them, the
 * Ledger edges that say whose they are (project, goal, workspace; a handoff's source and target) and the stored contents
 * nothing else names. A Session belongs to a project by the Ledger edge `work.project` it last has, so that is how they
 * are found. A handoff another project's Session sent to this project stays with its source; the Session it was sent to
 * is gone, so its destination is emptied by the registry's own foreign key. Works on the registry's file, so any process
 * on the Home can run it: it does not create the file, refuses a file that is not this registry's or has another version,
 * and running it again finds nothing.
 */
export function purgeSessionsProject(homeDirectory: string, projectId: string): void {
  const sessionsDirectory = path.join(path.resolve(homeDirectory), "sessions");
  const file = path.join(sessionsDirectory, "sessions.db");
  if (!existsSync(file)) return;
  const db = new Database(file, { timeout: 5000 });
  try {
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    const hasTable = (name: string) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
    if (!hasTable("session_meta")) return;
    validateSessionRegistryMeta(db);
    if (!hasTable("context_edges")) return;
    const content = createSessionContentStore(path.join(sessionsDirectory, "content"));
    db.transaction(() => {
      const sessionIds = (db.prepare(`
        SELECT DISTINCT json_extract(e.source_json, '$.id') AS session_id FROM context_edges e
        WHERE e.scope_kind = ? AND e.scope_id = ? AND e.relation_type = ? AND e.state = 'active'
          AND json_extract(e.target_json, '$.id') = ?
          AND e.revision = (SELECT MAX(h.revision) FROM context_edges h
            WHERE h.scope_kind = e.scope_kind AND h.scope_id = e.scope_id AND h.edge_key = e.edge_key)
      `).all(SESSION_LEDGER_SCOPE.kind, SESSION_LEDGER_SCOPE.id, SESSION_PROJECT_RELATION, projectId) as Array<{ session_id: string }>).map(row => row.session_id);
      const sessions = JSON.stringify(sessionIds);
      const handoffIds = (db.prepare(`SELECT package_id FROM session_handoffs WHERE source_session_id IN ${doomed}`).all(sessions) as Array<{ package_id: string }>).map(row => row.package_id);
      const edgeSources = JSON.stringify([...sessionIds, ...handoffIds]);
      const refs = (db.prepare(`
        SELECT content_ref FROM session_events WHERE session_id IN ${doomed}
        UNION SELECT content_ref FROM session_handoffs WHERE source_session_id IN ${doomed}
        UNION SELECT content_ref FROM session_messages WHERE session_id IN ${doomed} OR project_id = ?
      `).all(sessions, sessions, sessions, projectId) as Array<{ content_ref: string }>).map(row => row.content_ref);

      db.prepare(`DELETE FROM session_messages WHERE session_id IN ${doomed} OR project_id = ?`).run(sessions, projectId);
      db.prepare(`DELETE FROM context_edges WHERE scope_kind = ? AND scope_id = ? AND json_extract(source_json, '$.id') IN ${doomed}`)
        .run(SESSION_LEDGER_SCOPE.kind, SESSION_LEDGER_SCOPE.id, edgeSources);
      // Events and handoffs go with their Session (the registry's cascade); the Sessions are what is deleted.
      db.prepare(`DELETE FROM session_events WHERE session_id IN ${doomed}`).run(sessions);
      db.prepare(`DELETE FROM session_handoffs WHERE source_session_id IN ${doomed}`).run(sessions);
      db.prepare(`DELETE FROM sessions WHERE session_id IN ${doomed}`).run(sessions);

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

/** What the Sessions registry keeps in the Home for a project and how the project's deletion clears it. Not a plugin, so the Host lists it by hand. */
export const sessionsProjectData: ProjectDataDeclaration = { label: "这个项目里的会话记录与交接", order: 100, purge: purgeSessionsProject };
