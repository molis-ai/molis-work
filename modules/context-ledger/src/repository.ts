import type { ContextEdge, ContextEdgeQuery, ContextScope, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";

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

/** One stored revision of an edge, as a library's upgrade step reads it. */
export interface StoredContextEdge {
  readonly scope_kind: string;
  readonly scope_id: string;
  readonly edge_key: string;
  readonly relation_type: string;
  readonly source_json: string;
  readonly target_json: string;
}
export type StoredContextEdgeChange = Partial<Pick<StoredContextEdge, "edge_key" | "relation_type" | "source_json" | "target_json">>;

/**
 * For a library's upgrade step (batch 44 D1, D2): every stored revision of every edge, or of the edges of `relationType`, in the order
 * they were written, goes to `rewrite`, which returns what changes or null. Every revision is rewritten alike, in place, in the caller's
 * transaction; the table's key refuses a rewritten key that would meet another edge's. Delete with the last step that calls it.
 */
export function rewriteStoredContextEdges(db: Pick<ContextLedgerDatabase, "prepare">, rewrite: (edge: StoredContextEdge) => StoredContextEdgeChange | null,
  relationType?: string): void {
  const columns = "rowid AS row, scope_kind, scope_id, edge_key, relation_type, source_json, target_json";
  const rows = (relationType === undefined
    ? db.prepare(`SELECT ${columns} FROM context_edges ORDER BY rowid`).all()
    : db.prepare(`SELECT ${columns} FROM context_edges WHERE relation_type = ? ORDER BY rowid`).all(relationType)) as Array<StoredContextEdge & { row: number }>;
  const update = db.prepare("UPDATE context_edges SET edge_key = ?, relation_type = ?, source_json = ?, target_json = ? WHERE rowid = ?");
  for (const { row, ...edge } of rows) {
    const change = rewrite(edge);
    if (!change) continue;
    const next = { ...edge, ...change };
    update.run(next.edge_key, next.relation_type, next.source_json, next.target_json, row);
  }
}

/** The context ledger's tables, for a database's baseline to include (repository-anti-corruption §4.1). */
export const CONTEXT_LEDGER_SCHEMA = `
  CREATE TABLE context_edges (
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
  CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
`;

/** For databases that do not have a baseline yet (project databases): creates the ledger's tables when missing. */
export function createContextLedgerSchema(db: ContextLedgerDatabase): void {
  db.exec(CONTEXT_LEDGER_SCHEMA.replace(/CREATE (TABLE|INDEX) /g, "CREATE $1 IF NOT EXISTS "));
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
  constructor(private readonly db: ContextLedgerDatabase, initializeSchema = true) {
    if (initializeSchema) createContextLedgerSchema(db);
    else db.prepare('SELECT scope_kind,scope_id,edge_key,revision,relation_type,source_json,target_json,actor_id,cause,recorded_at,state FROM context_edges LIMIT 0').all();
  }

  transaction<T>(operation: () => T): T { return this.db.transaction(operation).immediate(); }

  latest(scope: ContextScope, key: string): ContextEdge | null {
    const row = this.db.prepare(`SELECT * FROM context_edges
      WHERE scope_kind = ? AND scope_id = ? AND edge_key = ? ORDER BY revision DESC LIMIT 1
    `).get(scope.kind, scope.id, key) as Row | undefined;
    return row ? edge(row) : null;
  }

  list(scope: ContextScope, query: ContextEdgeQuery = {}): ContextEdge[] {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.type) { conditions.push("relation_type = ?"); values.push(query.type); }
    if (query.keys !== undefined) { conditions.push("edge_key IN (SELECT value FROM json_each(?))"); values.push(JSON.stringify(query.keys)); }
    for (const [column, ref] of [["source_json", query.source], ["target_json", query.target]] as const) {
      if (!ref) continue;
      conditions.push(`json_extract(${column}, '$.module') = ? AND json_extract(${column}, '$.id') = ?`);
      values.push(ref.module, ref.id);
      // A plugin's object is one kind of one plugin's: ids of two kinds, or of two plugins, may be the same.
      if (ref.object_type !== undefined) { conditions.push(`json_extract(${column}, '$.object_type') = ?`); values.push(ref.object_type); }
      if (ref.plugin_id !== undefined) { conditions.push(`json_extract(${column}, '$.plugin_id') = ?`); values.push(ref.plugin_id); }
    }
    return this.selectLatest(scope, conditions, values, query.include_removed === true);
  }

  between(scope: ContextScope, candidates: readonly ObjectRef[], types: readonly string[]): ContextEdge[] {
    const keys = JSON.stringify(candidates.map(ref => [ref.module, ref.id]));
    const inCandidates = (column: "source_json" | "target_json") =>
      `json_array(json_extract(${column}, '$.module'), json_extract(${column}, '$.id')) IN (SELECT value FROM json_each(?))`;
    return this.selectLatest(scope, ["relation_type IN (SELECT value FROM json_each(?))", inCandidates("source_json"), inCandidates("target_json")],
      [JSON.stringify(types), keys, keys], false);
  }

  private selectLatest(scope: ContextScope, conditions: readonly string[], values: readonly unknown[], includeRemoved: boolean): ContextEdge[] {
    return (this.db.prepare(`SELECT e.* FROM context_edges e
      WHERE scope_kind = ? AND scope_id = ? ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""} AND revision = (
        SELECT MAX(h.revision) FROM context_edges h
        WHERE h.scope_kind = e.scope_kind AND h.scope_id = e.scope_id AND h.edge_key = e.edge_key
      ) AND (? = 1 OR state = 'active') ORDER BY edge_key
    `).all(scope.kind, scope.id, ...values, includeRemoved ? 1 : 0) as Row[]).map(edge);
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
