import type { ContextEdge, ContextEdgeQuery, ContextScope } from "@molis-ai/molis-work-contracts/modules/context-ledger";

interface Statement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

export interface ContextLedgerDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): Statement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export function createContextLedgerSchema(db: ContextLedgerDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_edges (
      scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'team_project')),
      scope_id TEXT NOT NULL,
      edge_key TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      relation_type TEXT NOT NULL,
      source_json TEXT NOT NULL,
      target_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      cause TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
      PRIMARY KEY (scope_kind, scope_id, edge_key, revision)
    );
    CREATE INDEX IF NOT EXISTS context_edges_source_idx ON context_edges
      (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
  `);
}

type Row = Record<string, unknown>;

function edge(row: Row): ContextEdge {
  return {
    key: String(row.edge_key), revision: Number(row.revision), type: String(row.relation_type),
    source: JSON.parse(String(row.source_json)), target: JSON.parse(String(row.target_json)),
    actor_id: String(row.actor_id), cause: String(row.cause), recorded_at: String(row.recorded_at),
    state: row.state as ContextEdge["state"],
  };
}

export class ContextLedgerRepository {
  constructor(private readonly db: ContextLedgerDatabase) { createContextLedgerSchema(db); }

  transaction<T>(operation: () => T): T { return this.db.transaction(operation).immediate(); }

  latest(scope: ContextScope, key: string): ContextEdge | null {
    const row = this.db.prepare(`SELECT * FROM context_edges
      WHERE scope_kind = ? AND scope_id = ? AND edge_key = ? ORDER BY revision DESC LIMIT 1
    `).get(scope.kind, scope.id, key) as Row | undefined;
    return row ? edge(row) : null;
  }

  list(scope: ContextScope, query: ContextEdgeQuery = {}): ContextEdge[] {
    const conditions: string[] = [];
    const values: unknown[] = [scope.kind, scope.id];
    if (query.type) { conditions.push("relation_type = ?"); values.push(query.type); }
    for (const [column, ref] of [["source_json", query.source], ["target_json", query.target]] as const) {
      if (!ref) continue;
      conditions.push(`json_extract(${column}, '$.module') = ? AND json_extract(${column}, '$.id') = ?`);
      values.push(ref.module, ref.id);
    }
    return (this.db.prepare(`SELECT e.* FROM context_edges e
      WHERE scope_kind = ? AND scope_id = ? ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""} AND revision = (
        SELECT MAX(h.revision) FROM context_edges h
        WHERE h.scope_kind = e.scope_kind AND h.scope_id = e.scope_id AND h.edge_key = e.edge_key
      ) AND (? = 1 OR state = 'active') ORDER BY edge_key
    `).all(...values, query.include_removed ? 1 : 0) as Row[]).map(edge);
  }

  history(scope: ContextScope, key: string): ContextEdge[] {
    return (this.db.prepare(`SELECT * FROM context_edges
      WHERE scope_kind = ? AND scope_id = ? AND edge_key = ? ORDER BY revision
    `).all(scope.kind, scope.id, key) as Row[]).map(edge);
  }

  insert(scope: ContextScope, value: ContextEdge): void {
    this.db.prepare(`INSERT INTO context_edges (
      scope_kind, scope_id, edge_key, revision, relation_type, source_json,
      target_json, actor_id, cause, recorded_at, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(scope.kind, scope.id, value.key, value.revision, value.type,
        JSON.stringify(value.source), JSON.stringify(value.target), value.actor_id,
        value.cause, value.recorded_at, value.state);
  }
}
