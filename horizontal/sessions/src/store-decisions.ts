import type { DatabaseSync } from "node:sqlite";
import type { ProjectSelection } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  sessionsErrors,
  type ExternalSessionDirectoryScope,
  type ExternalSessionReadScope,
  type ExternalSessionSuggestion,
} from "@molis-ai/molis-work-contracts/services/sessions";
import type { StoredAttributionDecision } from "./attribution.js";

export interface StoredProjectAiReadRow {
  project_id: string;
  allowed: boolean;
  revision: number;
  decided_by: string;
  decided_at: string;
}

export interface StoredSuggestionRow {
  session_key: string;
  status: "ready" | "no_match" | "failed";
  project_id: string | null;
  alternatives: string[];
  reason: string;
  evidence: Array<{ kind: "directory" | "title" | "message"; text: string }>;
  input_digest: string;
  prompt_version: number;
  created_at: string;
}

export interface AggregatedProjectSessionGroup {
  entry_id: ExternalToolId;
  location_key: string;
  directory_key: string | null;
  decision: string | null;
  decision_project_id: string | null;
  derived_state: string | null;
  derived_project_id: string | null;
  reported_project_id: string | null;
  count: number;
}

function parseScopeRow(raw: Record<string, unknown>): ExternalSessionReadScope {
  let directories: ExternalSessionDirectoryScope = { mode: "linked_projects" };
  try {
    const parsed = JSON.parse(String(raw.directories)) as { mode?: string };
    if (parsed?.mode === "all" || parsed?.mode === "linked_projects") {
      directories = { mode: parsed.mode };
    }
  } catch { /* ignore */ }
  return {
    entry_id: String(raw.entry_id) as ExternalToolId,
    location_key: String(raw.location_key),
    allowed: Number(raw.allowed) === 1,
    directories,
    connection_id: typeof raw.connection_id === "string" ? raw.connection_id : null,
    revision: Number(raw.revision),
    decided_at: String(raw.decided_at),
  };
}

function parseSuggestionRow(raw: Record<string, unknown>): StoredSuggestionRow {
  let alternatives: string[] = [];
  let evidence: Array<{ kind: "directory" | "title" | "message"; text: string }> = [];
  try {
    const parsed = JSON.parse(String(raw.alternatives ?? "[]")) as unknown;
    if (Array.isArray(parsed)) alternatives = parsed.filter((v): v is string => typeof v === "string");
  } catch { /* ignore */ }
  try {
    const parsed = JSON.parse(String(raw.evidence ?? "[]")) as unknown;
    if (Array.isArray(parsed)) {
      evidence = parsed.filter((item): item is { kind: "directory" | "title" | "message"; text: string } =>
        Boolean(
          item
          && typeof item === "object"
          && ("kind" in item)
          && (item.kind === "directory" || item.kind === "title" || item.kind === "message")
          && typeof (item as { text?: unknown }).text === "string",
        ),
      );
    }
  } catch { /* ignore */ }
  const status = raw.status === "ready" || raw.status === "no_match" ? raw.status : "failed";
  return {
    session_key: String(raw.session_key),
    status,
    project_id: typeof raw.project_id === "string" ? raw.project_id : null,
    alternatives,
    reason: String(raw.reason ?? ""),
    evidence,
    input_digest: String(raw.input_digest ?? ""),
    prompt_version: Number(raw.prompt_version ?? 0),
    created_at: String(raw.created_at),
  };
}

export function materializeSuggestion(
  row: StoredSuggestionRow | undefined,
  projectMap: ReadonlyMap<string, ProjectSelection>,
): ExternalSessionSuggestion | null {
  if (!row) return null;
  const project = row.project_id ? projectMap.get(row.project_id) ?? null : null;
  const alternatives = row.alternatives
    .map(id => projectMap.get(id))
    .filter((item): item is ProjectSelection => item !== undefined);
  const status = row.status === "ready" && !project ? "no_match" : row.status;
  return {
    status,
    project: status === "ready" ? project : null,
    alternatives,
    reason: row.reason,
    evidence: row.evidence,
    created_at: row.created_at,
  };
}

/**
 * Owns person-controlled scope permits, project AI read switches, attribution decisions, and suggestion cache rows.
 */
export class SessionsDecisionStore {
  constructor(private readonly db: DatabaseSync) {}

  readScopes(): ExternalSessionReadScope[] {
    const rows = this.db.prepare("SELECT * FROM session_read_scopes ORDER BY entry_id ASC, location_key ASC").all() as Record<string, unknown>[];
    return rows.map(parseScopeRow);
  }

  getReadScope(entryId: ExternalToolId, locationKey: string): ExternalSessionReadScope | null {
    const row = this.db.prepare("SELECT * FROM session_read_scopes WHERE entry_id = ? AND location_key = ?").get(entryId, locationKey) as Record<string, unknown> | undefined;
    return row ? parseScopeRow(row) : null;
  }

  upsertReadScope(row: {
    entry_id: ExternalToolId;
    location_key: string;
    allowed: boolean;
    directories: ExternalSessionDirectoryScope;
    connection_id: string | null;
    decided_at: string;
  }): ExternalSessionReadScope {
    const existing = this.getReadScope(row.entry_id, row.location_key);
    const revision = (existing?.revision ?? 0) + 1;
    this.db.prepare(`
      INSERT INTO session_read_scopes (entry_id, location_key, allowed, directories, connection_id, revision, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entry_id, location_key) DO UPDATE SET
        allowed = excluded.allowed,
        directories = excluded.directories,
        connection_id = excluded.connection_id,
        revision = excluded.revision,
        decided_at = excluded.decided_at
    `).run(
      row.entry_id,
      row.location_key,
      row.allowed ? 1 : 0,
      JSON.stringify(row.directories),
      row.connection_id,
      revision,
      row.decided_at,
    );
    return { ...row, revision };
  }

  projectAiReads(): Map<string, StoredProjectAiReadRow> {
    const rows = this.db.prepare("SELECT * FROM session_project_ai_reads").all() as Record<string, unknown>[];
    const map = new Map<string, StoredProjectAiReadRow>();
    for (const raw of rows) {
      const item: StoredProjectAiReadRow = {
        project_id: String(raw.project_id),
        allowed: Number(raw.allowed) === 1,
        revision: Number(raw.revision),
        decided_by: String(raw.decided_by),
        decided_at: String(raw.decided_at),
      };
      map.set(item.project_id, item);
    }
    return map;
  }

  getProjectAiRead(projectId: string): StoredProjectAiReadRow | null {
    const raw = this.db.prepare("SELECT * FROM session_project_ai_reads WHERE project_id = ?").get(projectId) as Record<string, unknown> | undefined;
    if (!raw) return null;
    return {
      project_id: String(raw.project_id),
      allowed: Number(raw.allowed) === 1,
      revision: Number(raw.revision),
      decided_by: String(raw.decided_by),
      decided_at: String(raw.decided_at),
    };
  }

  setProjectAiRead(projectId: string, allowed: boolean, expectedRevision: number, actorId: string, now: string): StoredProjectAiReadRow {
    const existing = this.getProjectAiRead(projectId);
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== expectedRevision) {
      throw sessionsErrors.scope_conflict("这个项目的 AI 读取许可刚刚变动过，请刷新后再试");
    }
    const revision = currentRevision + 1;
    this.db.prepare(`
      INSERT INTO session_project_ai_reads (project_id, allowed, revision, decided_by, decided_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        allowed = excluded.allowed,
        revision = excluded.revision,
        decided_by = excluded.decided_by,
        decided_at = excluded.decided_at
    `).run(projectId, allowed ? 1 : 0, revision, actorId, now);
    return { project_id: projectId, allowed, revision, decided_by: actorId, decided_at: now };
  }

  getAttributionDecision(sessionKey: string): StoredAttributionDecision | null {
    const raw = this.db.prepare("SELECT * FROM session_attributions WHERE session_key = ?").get(sessionKey) as Record<string, unknown> | undefined;
    if (!raw) return null;
    return {
      decision: raw.decision === "project" || raw.decision === "leave_unfiled" ? raw.decision : "clear",
      project_id: typeof raw.project_id === "string" ? raw.project_id : null,
      basis: raw.basis === "suggestion_accepted" ? "suggestion_accepted" : raw.basis === "user_chose" ? "user_chose" : null,
      revision: Number(raw.revision),
      decided_at: String(raw.decided_at),
    };
  }

  allAttributionDecisions(): Map<string, StoredAttributionDecision> {
    const rows = this.db.prepare("SELECT * FROM session_attributions").all() as Record<string, unknown>[];
    const map = new Map<string, StoredAttributionDecision>();
    for (const raw of rows) {
      map.set(String(raw.session_key), {
        decision: raw.decision === "project" || raw.decision === "leave_unfiled" ? raw.decision : "clear",
        project_id: typeof raw.project_id === "string" ? raw.project_id : null,
        basis: raw.basis === "suggestion_accepted" ? "suggestion_accepted" : raw.basis === "user_chose" ? "user_chose" : null,
        revision: Number(raw.revision),
        decided_at: String(raw.decided_at),
      });
    }
    return map;
  }

  setAttributionDecision(input: {
    session_key: string;
    decision: "project" | "leave_unfiled" | "clear";
    project_id: string | null;
    basis: "user_chose" | "suggestion_accepted" | null;
    expected_revision: number;
    actor_id: string;
    decided_at: string;
  }): StoredAttributionDecision {
    const existing = this.getAttributionDecision(input.session_key);
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== input.expected_revision) {
      throw sessionsErrors.attribution_conflict("这条会话的归属决定刚刚变动过，请刷新后再试");
    }
    const revision = currentRevision + 1;
    this.db.prepare(`
      INSERT INTO session_attributions (session_key, decision, project_id, basis, revision, decided_by, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        decision = excluded.decision,
        project_id = excluded.project_id,
        basis = excluded.basis,
        revision = excluded.revision,
        decided_by = excluded.decided_by,
        decided_at = excluded.decided_at
    `).run(
      input.session_key,
      input.decision,
      input.project_id,
      input.basis,
      revision,
      input.actor_id,
      input.decided_at,
    );
    return {
      decision: input.decision,
      project_id: input.project_id,
      basis: input.basis,
      revision,
      decided_at: input.decided_at,
    };
  }

  getSuggestion(sessionKey: string): StoredSuggestionRow | undefined {
    const raw = this.db.prepare("SELECT * FROM session_suggestions WHERE session_key = ?").get(sessionKey) as Record<string, unknown> | undefined;
    return raw ? parseSuggestionRow(raw) : undefined;
  }

  allSuggestions(): Map<string, StoredSuggestionRow> {
    const rows = this.db.prepare("SELECT * FROM session_suggestions").all() as Record<string, unknown>[];
    const map = new Map<string, StoredSuggestionRow>();
    for (const raw of rows) {
      const parsed = parseSuggestionRow(raw);
      map.set(parsed.session_key, parsed);
    }
    return map;
  }

  upsertSuggestion(row: StoredSuggestionRow): void {
    this.db.prepare(`
      INSERT INTO session_suggestions (
        session_key, status, project_id, alternatives, reason, evidence, input_digest, prompt_version, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        status = excluded.status,
        project_id = excluded.project_id,
        alternatives = excluded.alternatives,
        reason = excluded.reason,
        evidence = excluded.evidence,
        input_digest = excluded.input_digest,
        prompt_version = excluded.prompt_version,
        created_at = excluded.created_at
    `).run(
      row.session_key,
      row.status,
      row.project_id,
      JSON.stringify(row.alternatives),
      row.reason,
      JSON.stringify(row.evidence),
      row.input_digest,
      row.prompt_version,
      row.created_at,
    );
  }

  aggregateProjectSessionGroups(): AggregatedProjectSessionGroup[] {
    const rows = this.db.prepare(`
      SELECT
        s.entry_id AS entry_id,
        s.location_key AS location_key,
        s.directory_key AS directory_key,
        a.decision AS decision,
        a.project_id AS decision_project_id,
        d.derived_state AS derived_state,
        d.derived_project_id AS derived_project_id,
        s.reported_project_id AS reported_project_id,
        COUNT(*) AS count
      FROM external_sessions AS s
      LEFT JOIN session_attributions AS a ON a.session_key = s.session_key
      LEFT JOIN session_directories AS d ON d.directory_key = s.directory_key
      WHERE s.gone_at IS NULL
      GROUP BY
        s.entry_id,
        s.location_key,
        s.directory_key,
        a.decision,
        a.project_id,
        d.derived_state,
        d.derived_project_id,
        s.reported_project_id
    `).all() as Record<string, unknown>[];
    return rows.map(raw => ({
      entry_id: String(raw.entry_id) as ExternalToolId,
      location_key: String(raw.location_key),
      directory_key: typeof raw.directory_key === "string" ? raw.directory_key : null,
      decision: typeof raw.decision === "string" ? raw.decision : null,
      decision_project_id: typeof raw.decision_project_id === "string" ? raw.decision_project_id : null,
      derived_state: typeof raw.derived_state === "string" ? raw.derived_state : null,
      derived_project_id: typeof raw.derived_project_id === "string" ? raw.derived_project_id : null,
      reported_project_id: typeof raw.reported_project_id === "string" ? raw.reported_project_id : null,
      count: Number(raw.count),
    }));
  }
}
