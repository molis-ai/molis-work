import type {
  ArtifactIdentityRecord,
  ArtifactJsonValue,
  ArtifactListQuery,
  ArtifactMetadata,
  ArtifactVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

type Row = Record<string, unknown>;

export interface ArtifactsSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface ArtifactsSqliteDatabase {
  prepare(sql: string): ArtifactsSqliteStatement;
  exec(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export const ARTIFACTS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, board_id)
  );
  CREATE INDEX IF NOT EXISTS artifacts_board_idx
    ON artifacts(board_id, created_at DESC, artifact_id);

  CREATE TABLE IF NOT EXISTS artifact_versions (
    artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    artifact_type_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    producer_plugin_version TEXT NOT NULL,
    content_kind TEXT NOT NULL CHECK (content_kind IN ('inline', 'reference')),
    payload_json TEXT,
    content_ref TEXT,
    content_digest TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'team_project')),
    availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable')),
    unavailable_reason TEXT,
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'archived')),
    supersedes_version INTEGER,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    archived_at TEXT,
    archived_by TEXT,
    PRIMARY KEY (artifact_id, version),
    FOREIGN KEY (artifact_id, supersedes_version)
      REFERENCES artifact_versions(artifact_id, version),
    CHECK (
      (content_kind = 'inline' AND payload_json IS NOT NULL AND content_ref IS NULL)
      OR (content_kind = 'reference' AND payload_json IS NULL AND content_ref IS NOT NULL)
    )
  );
  CREATE INDEX IF NOT EXISTS artifact_versions_type_idx
    ON artifact_versions(artifact_type_id, schema_version, scope, lifecycle_state);
`;

export function createArtifactsSchema(db: ArtifactsSqliteDatabase): void {
  db.exec(ARTIFACTS_SCHEMA_SQL);
}

export class ArtifactsRepository {
  constructor(readonly db: ArtifactsSqliteDatabase) {}

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  eventCursor(boardId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE board_id = ?")
      .get(boardId) as Row | undefined;
    return Number(row?.cursor ?? 0);
  }

  getIdentityById(artifactId: string): ArtifactIdentityRecord | null {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id = ?").get(artifactId) as Row | undefined;
    return row ? mapArtifactIdentity(row) : null;
  }

  getIdentity(boardId: string, artifactId: string): ArtifactIdentityRecord | null {
    const row = this.db
      .prepare("SELECT * FROM artifacts WHERE board_id = ? AND artifact_id = ?")
      .get(boardId, artifactId) as Row | undefined;
    return row ? mapArtifactIdentity(row) : null;
  }

  insertIdentity(record: ArtifactIdentityRecord): void {
    this.db.prepare(`
      INSERT INTO artifacts (
        artifact_id, board_id, owner_actor_id, producer_plugin_id,
        producer_binding_signature, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.artifact_id,
      record.board_id,
      record.owner_actor_id,
      record.producer_plugin_id,
      record.producer_binding_signature,
      record.created_at,
    );
  }

  getVersion(boardId: string, artifactId: string, version: number): ArtifactVersionRecord | null {
    const row = this.db.prepare(`
      SELECT version.*, identity.board_id, identity.owner_actor_id,
             identity.producer_plugin_id, identity.producer_binding_signature
      FROM artifact_versions version
      JOIN artifacts identity ON identity.artifact_id = version.artifact_id
      WHERE identity.board_id = ? AND version.artifact_id = ? AND version.version = ?
    `).get(boardId, artifactId, version) as Row | undefined;
    return row ? mapArtifactVersion(row) : null;
  }

  listVersions(boardId: string, artifactId: string): ArtifactVersionRecord[] {
    return (this.db.prepare(`
      SELECT version.*, identity.board_id, identity.owner_actor_id,
             identity.producer_plugin_id, identity.producer_binding_signature
      FROM artifact_versions version
      JOIN artifacts identity ON identity.artifact_id = version.artifact_id
      WHERE identity.board_id = ? AND version.artifact_id = ?
      ORDER BY version.version ASC
    `).all(boardId, artifactId) as Row[]).map(mapArtifactVersion);
  }

  latestVersion(boardId: string, artifactId: string): ArtifactVersionRecord | null {
    const versions = this.listVersions(boardId, artifactId);
    return versions.at(-1) ?? null;
  }

  listArtifacts(boardId: string, query: ArtifactListQuery = {}): ArtifactVersionRecord[] {
    return (this.db.prepare(`
      SELECT version.*, identity.board_id, identity.owner_actor_id,
             identity.producer_plugin_id, identity.producer_binding_signature
      FROM artifact_versions version
      JOIN artifacts identity ON identity.artifact_id = version.artifact_id
      WHERE identity.board_id = ?
      ORDER BY version.created_at DESC, version.artifact_id, version.version DESC
    `).all(boardId) as Row[])
      .map(mapArtifactVersion)
      .filter((record) =>
        (!query.artifact_type_id || record.artifact_type_id === query.artifact_type_id)
        && (!query.schema_version || record.schema_version === query.schema_version)
        && (!query.scope || record.scope === query.scope)
        && (!query.lifecycle_state || record.lifecycle_state === query.lifecycle_state));
  }

  insertVersion(record: ArtifactVersionRecord): void {
    this.db.prepare(`
      INSERT INTO artifact_versions (
        artifact_id, version, artifact_type_id, schema_version, producer_plugin_version,
        content_kind, payload_json, content_ref, content_digest, size_bytes,
        metadata_json, scope, availability, unavailable_reason, lifecycle_state,
        supersedes_version, created_by, created_at, archived_at, archived_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.artifact_id,
      record.version,
      record.artifact_type_id,
      record.schema_version,
      record.producer_plugin_version,
      record.content_kind,
      record.content_kind === "inline" ? JSON.stringify(record.payload) : null,
      record.content_ref,
      record.content_digest,
      record.size_bytes,
      JSON.stringify(record.metadata),
      record.scope,
      record.availability,
      record.unavailable_reason,
      record.lifecycle_state,
      record.supersedes_version,
      record.created_by,
      record.created_at,
      record.archived_at,
      record.archived_by,
    );
  }

  markUnavailable(artifactId: string, version: number, reason: string): void {
    this.db.prepare(`
      UPDATE artifact_versions
      SET availability = 'unavailable', unavailable_reason = ?
      WHERE artifact_id = ? AND version = ?
    `).run(reason, artifactId, version);
  }

  archiveVersion(artifactId: string, version: number, actorId: string, at: string): void {
    this.db.prepare(`
      UPDATE artifact_versions
      SET lifecycle_state = 'archived', archived_at = ?, archived_by = ?
      WHERE artifact_id = ? AND version = ?
    `).run(at, actorId, artifactId, version);
  }
}

export function mapArtifactIdentity(row: Row): ArtifactIdentityRecord {
  return {
    board_id: String(row.board_id),
    artifact_id: String(row.artifact_id),
    owner_actor_id: String(row.owner_actor_id),
    producer_plugin_id: String(row.producer_plugin_id),
    producer_binding_signature: String(row.producer_binding_signature),
    created_at: String(row.created_at),
  };
}

export function mapArtifactVersion(row: Row): ArtifactVersionRecord {
  const contentKind = String(row.content_kind) as ArtifactVersionRecord["content_kind"];
  return {
    board_id: String(row.board_id),
    artifact_id: String(row.artifact_id),
    version: Number(row.version),
    artifact_type_id: String(row.artifact_type_id),
    schema_version: Number(row.schema_version),
    producer_plugin_id: String(row.producer_plugin_id),
    producer_plugin_version: String(row.producer_plugin_version),
    producer_binding_signature: String(row.producer_binding_signature),
    owner_actor_id: String(row.owner_actor_id),
    content_kind: contentKind,
    payload: contentKind === "inline"
      ? parseJson<ArtifactJsonValue>(row.payload_json, null)
      : null,
    content_ref: row.content_ref == null ? null : String(row.content_ref),
    content_digest: String(row.content_digest),
    size_bytes: Number(row.size_bytes),
    metadata: parseJson<ArtifactMetadata>(row.metadata_json, {}),
    scope: String(row.scope) as ArtifactVersionRecord["scope"],
    availability: String(row.availability) as ArtifactVersionRecord["availability"],
    unavailable_reason: row.unavailable_reason == null ? null : String(row.unavailable_reason),
    lifecycle_state: String(row.lifecycle_state) as ArtifactVersionRecord["lifecycle_state"],
    supersedes_version: row.supersedes_version == null ? null : Number(row.supersedes_version),
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    archived_at: row.archived_at == null ? null : String(row.archived_at),
    archived_by: row.archived_by == null ? null : String(row.archived_by),
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
