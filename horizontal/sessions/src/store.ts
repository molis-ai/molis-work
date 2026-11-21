import type { DatabaseSync } from "node:sqlite";
import type { ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  sessionsErrors,
  type ExternalSessionActivity,
  type ExternalSessionSourceReason,
  type ExternalSessionSourceState,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import type { DerivedDirectoryEvaluation } from "./attribution.js";
import type { SessionDirectoryIdentity } from "./git-files.js";
import { EXTERNAL_SESSIONS_BASELINE, EXTERNAL_SESSIONS_STORE, clearExternalSessionsProjectRows } from "./schema.js";
import { SessionsDecisionStore } from "./store-decisions.js";

export {
  SessionsDecisionStore,
  materializeSuggestion,
  type AggregatedProjectSessionGroup,
  type StoredProjectAiReadRow,
  type StoredSuggestionRow,
} from "./store-decisions.js";

export interface StoredExternalSessionRow {
  session_key: string;
  entry_id: ExternalToolId;
  location_key: string;
  native_id: string;
  seen_via: ExternalToolId[];
  title: string | null;
  directory_key: string | null;
  directory_path: string | null;
  activity: ExternalSessionActivity;
  return_target: { kind: "command" | "url"; label: string } | null;
  reported_project_id: string | null;
  last_activity_at: string;
  forked_from: string | null;
  /** A subagent's trajectory, kept with the session it belongs to (`forked_from`); the list and the search leave it out (batch 103-2). */
  subagent?: true;
  gone_at: string | null;
}

export interface StoredDirectoryRow {
  directory_key: string;
  path: string;
  kind: "session" | "workspace";
  realpath_verified: boolean;
  repository_key: string | null;
  worktree_relative: string | null;
  derived_state: DerivedDirectoryEvaluation["derived_state"];
  derived_project_id: string | null;
  evidence_kind: "directory" | "repository" | null;
  evidence_path: string | null;
  candidates: string[];
  directory_digest: string;
}

export interface StoredSourceRow {
  entry_id: ExternalToolId;
  location_key: string;
  state: ExternalSessionSourceState;
  reason: ExternalSessionSourceReason | null;
  progress_cursor: string | null;
  progress_read: number;
  progress_total: number | null;
  session_count: number;
  skipped_count: number;
  completed_at: string | null;
  checked_at: string;
}

export interface KeysetCursor {
  last_activity_at: string;
  session_key: string;
}

export function encodeSessionCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify([cursor.last_activity_at, cursor.session_key]), "utf8").toString("base64url");
}

export function decodeSessionCursor(raw: string): KeysetCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      Array.isArray(parsed)
      && parsed.length === 2
      && typeof parsed[0] === "string"
      && parsed[0].length > 0
      && typeof parsed[1] === "string"
      && /^xs_[0-9a-f]{32}$/u.test(parsed[1])
    ) {
      return { last_activity_at: parsed[0], session_key: parsed[1] };
    }
  } catch {
    // Fall through to structured error.
  }
  throw sessionsErrors.cursor_invalid("分页游标无效，请重新从头列出");
}

function parseSessionRow(raw: Record<string, unknown>): StoredExternalSessionRow {
  let seenVia: ExternalToolId[] = [];
  try {
    const parsed = JSON.parse(String(raw.seen_via ?? "[]")) as unknown;
    if (Array.isArray(parsed)) seenVia = parsed.filter((v): v is ExternalToolId => typeof v === "string");
  } catch { /* ignore */ }
  const rtKind = raw.return_target_kind;
  const rtLabel = raw.return_target_label;
  return {
    session_key: String(raw.session_key),
    entry_id: String(raw.entry_id) as ExternalToolId,
    location_key: String(raw.location_key),
    native_id: String(raw.native_id),
    seen_via: seenVia,
    title: typeof raw.title === "string" ? raw.title : null,
    directory_key: typeof raw.directory_key === "string" ? raw.directory_key : null,
    directory_path: typeof raw.directory_path === "string" ? raw.directory_path : null,
    activity: raw.activity === "running" || raw.activity === "idle" ? raw.activity : "unknown",
    return_target:
      (rtKind === "command" || rtKind === "url") && typeof rtLabel === "string"
        ? { kind: rtKind, label: rtLabel }
        : null,
    reported_project_id: typeof raw.reported_project_id === "string" ? raw.reported_project_id : null,
    last_activity_at: String(raw.last_activity_at),
    forked_from: typeof raw.forked_from === "string" ? raw.forked_from : null,
    ...(raw.subagent === 1 ? { subagent: true as const } : {}),
    gone_at: typeof raw.gone_at === "string" ? raw.gone_at : null,
  };
}

function parseDirectoryRow(raw: Record<string, unknown>): StoredDirectoryRow {
  let candidates: string[] = [];
  try {
    const parsed = JSON.parse(String(raw.candidates ?? "[]")) as unknown;
    if (Array.isArray(parsed)) candidates = parsed.filter((v): v is string => typeof v === "string");
  } catch { /* ignore */ }
  return {
    directory_key: String(raw.directory_key),
    path: String(raw.path),
    kind: raw.kind === "workspace" ? "workspace" : "session",
    realpath_verified: Number(raw.realpath_verified) === 1,
    repository_key: typeof raw.repository_key === "string" ? raw.repository_key : null,
    worktree_relative: typeof raw.worktree_relative === "string" ? raw.worktree_relative : null,
    derived_state: (raw.derived_state as StoredDirectoryRow["derived_state"]) ?? "no_relation",
    derived_project_id: typeof raw.derived_project_id === "string" ? raw.derived_project_id : null,
    evidence_kind: raw.evidence_kind === "directory" || raw.evidence_kind === "repository" ? raw.evidence_kind : null,
    evidence_path: typeof raw.evidence_path === "string" ? raw.evidence_path : null,
    candidates,
    directory_digest: String(raw.directory_digest ?? ""),
  };
}

/**
 * Internal SQLite repository over `external-sessions/external-sessions.db`. Not exported from the package root.
 */
export class SessionsStore {
  readonly homeDirectory: string;
  readonly db: DatabaseSync;
  readonly decisions: SessionsDecisionStore;
  private workspaceIdentities = new Map<string, SessionDirectoryIdentity | null>();
  private closed = false;

  constructor(homeDirectory: string) {
    this.homeDirectory = homeDirectory;
    this.db = openBaselineHomeSqlite(homeDirectory, EXTERNAL_SESSIONS_STORE, EXTERNAL_SESSIONS_BASELINE);
    this.decisions = new SessionsDecisionStore(this.db);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  inTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM session_meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare(
      "INSERT INTO session_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }

  scopeRevision(): number {
    const value = this.getMeta("scope_revision");
    return value === null ? 0 : Number(value);
  }

  bumpScopeRevision(): number {
    const next = this.scopeRevision() + 1;
    this.setMeta("scope_revision", String(next));
    return next;
  }

  sources(): Map<string, StoredSourceRow> {
    const rows = this.db.prepare("SELECT * FROM session_sources").all() as Record<string, unknown>[];
    const map = new Map<string, StoredSourceRow>();
    for (const raw of rows) {
      const item: StoredSourceRow = {
        entry_id: String(raw.entry_id) as ExternalToolId,
        location_key: String(raw.location_key),
        state: String(raw.state) as ExternalSessionSourceState,
        reason: typeof raw.reason === "string" ? (raw.reason as ExternalSessionSourceReason) : null,
        progress_cursor: typeof raw.progress_cursor === "string" ? raw.progress_cursor : null,
        progress_read: Number(raw.progress_read ?? 0),
        progress_total: typeof raw.progress_total === "number" ? raw.progress_total : null,
        session_count: Number(raw.session_count ?? 0),
        skipped_count: Number(raw.skipped_count ?? 0),
        completed_at: typeof raw.completed_at === "string" ? raw.completed_at : null,
        checked_at: String(raw.checked_at),
      };
      map.set(`${item.entry_id}\0${item.location_key}`, item);
    }
    return map;
  }

  getSource(entryId: ExternalToolId, locationKey: string): StoredSourceRow | null {
    return this.sources().get(`${entryId}\0${locationKey}`) ?? null;
  }

  upsertSource(row: StoredSourceRow): void {
    this.db.prepare(`
      INSERT INTO session_sources (
        entry_id, location_key, state, reason, progress_cursor, progress_read, progress_total,
        session_count, skipped_count, completed_at, checked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entry_id, location_key) DO UPDATE SET
        state = excluded.state,
        reason = excluded.reason,
        progress_cursor = excluded.progress_cursor,
        progress_read = excluded.progress_read,
        progress_total = excluded.progress_total,
        session_count = excluded.session_count,
        skipped_count = excluded.skipped_count,
        completed_at = excluded.completed_at,
        checked_at = excluded.checked_at
    `).run(
      row.entry_id, row.location_key, row.state, row.reason, row.progress_cursor,
      row.progress_read, row.progress_total, row.session_count, row.skipped_count,
      row.completed_at, row.checked_at,
    );
  }

  getDirectory(directoryKey: string): StoredDirectoryRow | null {
    const raw = this.db.prepare("SELECT * FROM session_directories WHERE directory_key = ?").get(directoryKey) as Record<string, unknown> | undefined;
    return raw ? parseDirectoryRow(raw) : null;
  }

  allDirectories(): Map<string, StoredDirectoryRow> {
    const rows = this.db.prepare("SELECT * FROM session_directories").all() as Record<string, unknown>[];
    const map = new Map<string, StoredDirectoryRow>();
    for (const raw of rows) {
      const parsed = parseDirectoryRow(raw);
      map.set(parsed.directory_key, parsed);
    }
    return map;
  }

  workspaceCache(): ReadonlyMap<string, SessionDirectoryIdentity | null> {
    return this.workspaceIdentities;
  }

  setWorkspaceCache(entries: ReadonlyMap<string, SessionDirectoryIdentity | null>): void {
    this.workspaceIdentities = new Map(entries);
  }

  upsertDirectory(input: {
    directory_key: string;
    path: string;
    kind: "session" | "workspace";
    identity: SessionDirectoryIdentity | null;
    derived: DerivedDirectoryEvaluation;
    directory_digest: string;
  }): void {
    this.db.prepare(`
      INSERT INTO session_directories (
        directory_key, path, kind, realpath_verified, repository_key, worktree_relative,
        derived_state, derived_project_id, evidence_kind, evidence_path, candidates, directory_digest
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(directory_key) DO UPDATE SET
        path = excluded.path,
        kind = excluded.kind,
        realpath_verified = excluded.realpath_verified,
        repository_key = excluded.repository_key,
        worktree_relative = excluded.worktree_relative,
        derived_state = excluded.derived_state,
        derived_project_id = excluded.derived_project_id,
        evidence_kind = excluded.evidence_kind,
        evidence_path = excluded.evidence_path,
        candidates = excluded.candidates,
        directory_digest = excluded.directory_digest
    `).run(
      input.directory_key, input.identity?.real_path ?? input.path, input.kind,
      input.identity ? 1 : 0, input.identity?.repository_key ?? null, input.identity?.worktree_relative ?? null,
      input.derived.derived_state, input.derived.derived_project_id, input.derived.evidence_kind,
      input.derived.evidence_path, JSON.stringify(input.derived.candidates), input.directory_digest,
    );
  }

  upsertSession(row: StoredExternalSessionRow): void {
    const existing = this.getSessionIncludeGone(row.session_key);
    const mergedSeen = existing ? [...new Set([...existing.seen_via, ...row.seen_via])] : [...new Set(row.seen_via)];
    this.db.prepare(`
      INSERT INTO external_sessions (
        session_key, entry_id, location_key, native_id, seen_via, title, directory_key, directory_path,
        activity, return_target_kind, return_target_label, reported_project_id, last_activity_at, forked_from, subagent, gone_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(session_key) DO UPDATE SET
        seen_via = excluded.seen_via, title = excluded.title,
        directory_key = excluded.directory_key, directory_path = excluded.directory_path,
        activity = excluded.activity, return_target_kind = excluded.return_target_kind,
        return_target_label = excluded.return_target_label, reported_project_id = excluded.reported_project_id,
        last_activity_at = excluded.last_activity_at,
        forked_from = COALESCE(excluded.forked_from, external_sessions.forked_from), subagent = excluded.subagent, gone_at = NULL
    `).run(
      row.session_key, row.entry_id, row.location_key, row.native_id, JSON.stringify(mergedSeen),
      row.title, row.directory_key, row.directory_path, row.activity,
      row.return_target?.kind ?? null, row.return_target?.label ?? null,
      row.reported_project_id, row.last_activity_at, row.forked_from, row.subagent ? 1 : 0,
    );
  }

  markMissingSourceSessionsGone(entryId: ExternalToolId, locationKey: string, seenKeys: ReadonlySet<string>, now: string): void {
    const rows = this.db.prepare(
      "SELECT session_key FROM external_sessions WHERE entry_id = ? AND location_key = ? AND gone_at IS NULL",
    ).all(entryId, locationKey) as Array<{ session_key: string }>;
    const mark = this.db.prepare("UPDATE external_sessions SET gone_at = ? WHERE session_key = ?");
    for (const row of rows) {
      if (!seenKeys.has(row.session_key)) mark.run(now, row.session_key);
    }
  }

  countActiveSessionsForSource(entryId: ExternalToolId, locationKey: string): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS count FROM external_sessions WHERE entry_id = ? AND location_key = ? AND gone_at IS NULL AND subagent = 0",
    ).get(entryId, locationKey) as { count: number };
    return Number(row.count);
  }

  getSession(sessionKey: string): StoredExternalSessionRow | null {
    const raw = this.db.prepare("SELECT * FROM external_sessions WHERE session_key = ? AND gone_at IS NULL").get(sessionKey) as Record<string, unknown> | undefined;
    return raw ? parseSessionRow(raw) : null;
  }

  getSessionIncludeGone(sessionKey: string): StoredExternalSessionRow | null {
    const raw = this.db.prepare("SELECT * FROM external_sessions WHERE session_key = ?").get(sessionKey) as Record<string, unknown> | undefined;
    return raw ? parseSessionRow(raw) : null;
  }

  findSessionByNativeId(entryId: ExternalToolId, locationKey: string, nativeId: string): StoredExternalSessionRow | null {
    const raw = this.db.prepare(
      "SELECT * FROM external_sessions WHERE entry_id = ? AND location_key = ? AND native_id = ? AND gone_at IS NULL",
    ).get(entryId, locationKey, nativeId) as Record<string, unknown> | undefined;
    return raw ? parseSessionRow(raw) : null;
  }

  /** The sessions still there, newest first; a subagent's trajectory only when `subagents` asks for it. */
  activeSessionsOrdered({ subagents = false }: { subagents?: boolean } = {}): StoredExternalSessionRow[] {
    const rows = this.db.prepare(subagents
      ? "SELECT * FROM external_sessions WHERE gone_at IS NULL ORDER BY last_activity_at DESC, session_key ASC"
      : "SELECT * FROM external_sessions WHERE gone_at IS NULL AND subagent = 0 ORDER BY last_activity_at DESC, session_key ASC",
    ).all() as Record<string, unknown>[];
    return rows.map(parseSessionRow);
  }

  duplicateLocalNativeKeys(): Set<string> {
    const rows = this.db.prepare(`
      SELECT entry_id, native_id FROM external_sessions
      WHERE gone_at IS NULL AND location_key LIKE 'local:%'
      GROUP BY entry_id, native_id HAVING COUNT(DISTINCT location_key) > 1
    `).all() as Array<{ entry_id: string; native_id: string }>;
    return new Set(rows.map(r => `${r.entry_id}\0${r.native_id}`));
  }

  updateReportedProjectId(sessionKey: string, reportedProjectId: string | null): void {
    this.db.prepare("UPDATE external_sessions SET reported_project_id = ? WHERE session_key = ?").run(reportedProjectId, sessionKey);
  }

  purgeProject(projectId: string): void {
    this.inTransaction(() => clearExternalSessionsProjectRows(this.db, projectId));
  }
}
