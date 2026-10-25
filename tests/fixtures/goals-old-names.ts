import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";

const AT = "2026-10-01T00:00:00.000Z";
const EDGE_COLUMNS = "scope_kind, scope_id, edge_key, revision, relation_type, source_json, target_json, actor_id, cause, recorded_at, state";

/**
 * A project library as a build from before Goals ran as a Runtime plugin left it (PG-094 S9-2): Goals' events, idempotency records and
 * ledger edges under bare names, beside rows of other writers that must stay as they are. Returns the path of `molis-work.db`.
 */
export function writeOldNamedLibrary(home: string, projectId: string): string {
  const directory = join(home, "projects", projectId);
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "molis-work.db");
  const store = new LocalProjectDatabase(file);
  try {
    writeProjectRoot(store.db, projectId, AT);
    const event = (n: number, type: string, objectType: string) =>
      store.appendEvent({ eventId: `${projectId}-event-${n}`, projectId, actorId: "owner", type, objectType, objectId: `object-${n}`, reason: "test", payload: { n }, at: AT });
    event(1, "board.created", "board");
    event(2, "goal.created", "goal");
    event(3, "relation.added", "relation");
    event(4, "goal_tree_proposal.decided", "goal_tree_proposal");
    event(5, "feed_source.registered", "feed_source");
    const idempotency = (operation: string, key: string) =>
      store.putIdempotency({ projectId, actorId: "owner", operation, key, requestHash: "hash", outcome: { operation }, at: AT });
    idempotency("create", "key-1");
    idempotency("submit_goal_tree_proposal", "key-2");
    idempotency("io.molis.work.other:thing", "key-3");
    const scope = { kind: "personal", id: projectId };
    const edge = (key: string, revision: number, relation: string, sourceModule: string, state: string) =>
      store.db.prepare(`INSERT INTO context_edges (${EDGE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run("personal", projectId, key, revision, relation,
        JSON.stringify({ module: sourceModule, id: "goal-1", version: null, scope }), JSON.stringify({ module: "artifacts", id: "artifact-1", version: 1, scope }), "owner", "test", AT, state);
    edge("goal.output:goal-1:artifact-1:1", 1, "goal.output", "goals", "active");
    edge("goal.output:goal-1:artifact-1:1", 2, "goal.output", "goals", "removed");
    edge("goal.input.proposal:goal-1:artifact-1:1", 1, "goal.input.proposal", "goals", "active");
    edge("feed.promote:item-1", 1, "feed.promote", "feed", "active");
  } finally { store.close(); }
  return file;
}

/** The three tables of a library as one comparable text, read without writing. */
export function journalRows(file: string): string {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = (sql: string) => db.prepare(sql).all().map(row => ({ ...row }));
    return JSON.stringify({
      events: rows("SELECT seq, type, object_type, object_id FROM events ORDER BY seq"),
      idempotency: rows("SELECT actor_id, operation, idempotency_key FROM idempotency_records ORDER BY operation, idempotency_key"),
      edges: rows("SELECT edge_key, revision, relation_type FROM context_edges ORDER BY edge_key, revision"),
    });
  } finally { db.close(); }
}
