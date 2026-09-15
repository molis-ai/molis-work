import path from "node:path";
import type Database from "better-sqlite3";
import type {
  MolisWorkSessionGoalLink,
  MolisWorkSessionRecord,
} from "./contract-aliases.js";
import { MolisWorkSessionError } from "./errors.js";

export const SESSION_REGISTRY_OWNER = "molis-work-session-registry-v1";
export const LEGACY_SESSION_REGISTRY_OWNER = "goalboard-session-registry-v1";
export const SESSION_REGISTRY_SCHEMA_VERSION = 5;

function isOwnedSessionRegistry(owner: unknown): boolean {
  return owner === SESSION_REGISTRY_OWNER || owner === LEGACY_SESSION_REGISTRY_OWNER;
}

export const DEFAULT_CORRELATION_TTL_SECONDS = 15 * 60;

export function initializeOrValidateSessionSchema(db: Database.Database): void {
  const meta = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_meta'").get();
  if (!meta) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          runtime_id TEXT NOT NULL,
          native_runtime_session_id TEXT,
          correlation_token TEXT,
          correlation_expires_at TEXT,
          surface_id TEXT,
          project_id TEXT,
          current_goal_id TEXT,
          workspace_id TEXT,
          workspace_path TEXT,
          title TEXT,
          status TEXT NOT NULL CHECK (status IN ('discovered', 'active', 'closed')),
          provenance TEXT NOT NULL CHECK (provenance IN (
            'molis_work_created', 'runtime_discovered', 'explicitly_linked', 'legacy_migrated'
          )),
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX sessions_native_identity_idx
          ON sessions(runtime_id, native_runtime_session_id)
          WHERE native_runtime_session_id IS NOT NULL;
        CREATE UNIQUE INDEX sessions_surface_idx
          ON sessions(surface_id) WHERE surface_id IS NOT NULL;
        CREATE UNIQUE INDEX sessions_correlation_idx
          ON sessions(correlation_token) WHERE correlation_token IS NOT NULL;
        CREATE INDEX sessions_project_idx ON sessions(project_id, updated_at, session_id);
        CREATE INDEX sessions_workspace_idx ON sessions(workspace_id, updated_at, session_id);
        CREATE TABLE session_goal_links (
          link_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL,
          relation TEXT NOT NULL CHECK (relation IN ('current', 'history')),
          linked_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          ended_at TEXT
        );
        CREATE UNIQUE INDEX session_goal_current_idx
          ON session_goal_links(session_id) WHERE relation = 'current';
        CREATE INDEX session_goal_history_idx
          ON session_goal_links(session_id, created_at, link_id);
        CREATE TABLE session_migration_receipts (
          source_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          source_fingerprint TEXT NOT NULL,
          migrated_at TEXT NOT NULL
        );
        ${sessionEventsSchema()}
        ${sessionHandoffsSchema()}
      `);
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("owner", SESSION_REGISTRY_OWNER);
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run(
        "schema_version",
        "3",
      );
    })();
    return;
  }
  const owner = (db.prepare("SELECT value FROM session_meta WHERE key = 'owner'").get() as
    | { value?: unknown }
    | undefined)?.value;
  if (!isOwnedSessionRegistry(owner)) {
    throw new MolisWorkSessionError("session.registry_unknown", "不会复用未知 Session Registry 数据库");
  }
  if (owner === LEGACY_SESSION_REGISTRY_OWNER) {
    db.prepare("UPDATE session_meta SET value = ? WHERE key = 'owner'").run(SESSION_REGISTRY_OWNER);
  }
  const version = Number((db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get() as
    | { value?: unknown }
    | undefined)?.value);
  if (version === 1 || version === 2) {
    db.transaction(() => {
      if (version === 1) db.exec(sessionEventsSchema());
      db.exec(sessionHandoffsSchema());
      db.prepare("UPDATE session_meta SET value = ? WHERE key = 'schema_version'")
        .run("3");
    })();
    return;
  }
  if (version !== 3 && version !== 4 && version !== SESSION_REGISTRY_SCHEMA_VERSION) {
    throw new MolisWorkSessionError(
      "session.registry_reader_too_old",
      `Session Registry schema=${version}，当前 reader 支持 ${SESSION_REGISTRY_SCHEMA_VERSION}`,
    );
  }
}

function sessionEventsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS session_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('goalboard_tui', 'goalboard')),
      kind TEXT NOT NULL CHECK (kind IN (
        'user_message', 'runtime_message', 'tool', 'approval',
        'status', 'artifact', 'terminal_output'
      )),
      source_id TEXT NOT NULL,
      source_order INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      content_ref TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, source, source_id)
    );
    CREATE INDEX IF NOT EXISTS session_events_timeline_idx
      ON session_events(session_id, occurred_at, source_order, event_id);
  `;
}

function sessionHandoffsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS session_handoffs (
      package_id TEXT PRIMARY KEY,
      source_session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      source_project_id TEXT NOT NULL,
      source_goal_id TEXT NOT NULL,
      target_runtime_id TEXT NOT NULL,
      target_project_id TEXT NOT NULL,
      target_workspace_id TEXT,
      target_workspace_path TEXT,
      destination_session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
      state TEXT NOT NULL CHECK (state IN ('draft', 'sending', 'failed', 'sent', 'cancelled')),
      delivery_mode TEXT CHECK (delivery_mode IS NULL OR delivery_mode IN ('native', 'molis_work_fallback')),
      content_ref TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      error_code TEXT,
      error_message TEXT,
      retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS session_handoffs_source_idx
      ON session_handoffs(source_session_id, updated_at, package_id);
    CREATE INDEX IF NOT EXISTS session_handoffs_destination_idx
      ON session_handoffs(destination_session_id, updated_at, package_id);
  `;
}

export function mapSession(row: Record<string, unknown>): MolisWorkSessionRecord {
  return {
    session_id: String(row.session_id),
    runtime_id: String(row.runtime_id),
    native_runtime_session_id: row.native_runtime_session_id == null ? null : String(row.native_runtime_session_id),
    correlation_token: row.correlation_token == null ? null : String(row.correlation_token),
    correlation_expires_at: row.correlation_expires_at == null ? null : String(row.correlation_expires_at),
    surface_id: row.surface_id == null ? null : String(row.surface_id),
    project_id: row.project_id == null ? null : String(row.project_id),
    current_goal_id: row.current_goal_id == null ? null : String(row.current_goal_id),
    workspace_id: row.workspace_id == null ? null : String(row.workspace_id),
    workspace_path: row.workspace_path == null ? null : String(row.workspace_path),
    title: row.title == null ? null : String(row.title),
    status: String(row.status) as MolisWorkSessionRecord["status"],
    provenance: String(row.provenance) as MolisWorkSessionRecord["provenance"],
    metadata: parseMetadata(row.metadata_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapGoalLink(row: Record<string, unknown>): MolisWorkSessionGoalLink {
  return {
    link_id: String(row.link_id),
    session_id: String(row.session_id),
    goal_id: String(row.goal_id),
    relation: String(row.relation) as MolisWorkSessionGoalLink["relation"],
    linked_by: String(row.linked_by),
    created_at: String(row.created_at),
    ended_at: row.ended_at == null ? null : String(row.ended_at),
  };
}

export function parseMetadata(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

export function requiredText(value: unknown, message: string): string {
  const text = optionalText(value);
  if (!text) throw new MolisWorkSessionError("session.invalid_input", message);
  return text;
}

export function optionalAbsolutePath(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  if (!path.isAbsolute(text)) {
    throw new MolisWorkSessionError("session.invalid_input", "Session 工作目录必须是绝对路径");
  }
  return path.resolve(text);
}

export function requireConfirmation(value: boolean): void {
  if (value !== true) {
    throw new MolisWorkSessionError(
      "session.confirmation_required",
      "创建或改变 Session 关联前必须获得用户明确确认",
    );
  }
}

export function correlationTtl(value: number | undefined): number {
  if (value == null) return DEFAULT_CORRELATION_TTL_SECONDS;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 24 * 60 * 60) {
    throw new MolisWorkSessionError("session.invalid_input", "correlation TTL 必须是 1 秒到 24 小时之间的整数");
  }
  return value;
}

export function validIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function safeEventMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const blocked = /authorization|cookie|credential|password|secret|token|body|content|env/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.test(key)) continue;
    if (typeof item === "string") output[key] = item.slice(0, 500);
    else if (typeof item === "number" && Number.isFinite(item)) output[key] = item;
    else if (typeof item === "boolean" || item === null) output[key] = item;
  }
  return output;
}
