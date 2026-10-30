import type { FeedSql } from "./sql.js";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHash, randomUUID } from "node:crypto";

import type {
  SignalDraft,
  SignalEvent,
  SignalRecord,
  SignalReceipt,
  SignalsApi,
} from "../contract/signals.js";

type Row = Record<string, unknown>;
const signalErrors = defineErrorCodes("signals", { not_found: "invalid", invalid_draft: "invalid" });

/** The signal tables, as one current schema; the host composes them into the project database baseline. */
export const SIGNALS_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS signals (
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      provider_dedupe_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      content_refs_json TEXT NOT NULL DEFAULT '[]',
      raw_event_id TEXT NOT NULL,
      adapter_plugin_id TEXT NOT NULL,
      adapter_version TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      validation TEXT NOT NULL CHECK (validation = 'accepted'),
      superseded_by TEXT,
      withdrawn_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, signal_id),
      UNIQUE (project_id, source_id, provider_dedupe_id)
    );
    CREATE INDEX IF NOT EXISTS signals_project_source_observed_idx
      ON signals(project_id, source_id, observed_at DESC, signal_id);

    CREATE TABLE IF NOT EXISTS signal_revisions (
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      PRIMARY KEY (project_id, signal_id, revision)
    );

    CREATE TABLE IF NOT EXISTS signal_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('signal.accepted', 'signal.changed')),
      revision INTEGER NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS signal_events_project_source_idx
      ON signal_events(project_id, source_id, at, event_id);
`;

export class SignalsModule implements SignalsApi {
  readonly query = {
    get: (projectId: string, signalId: string) => this.get(projectId, signalId),
    list: (projectId: string, sourceId?: string) => this.list(projectId, sourceId),
  };

  readonly commands = {
    submitDraft: (draft: SignalDraft) => this.submitDraft(draft),
  };

  readonly events = {
    list: (projectId: string, sourceId?: string) => this.listEvents(projectId, sourceId),
  };

  constructor(
    private readonly db: FeedSql,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get(projectId: string, signalId: string): SignalRecord {
    const row = this.db.get("SELECT * FROM signals WHERE project_id = ? AND signal_id = ?", projectId, signalId) as Row | undefined;
    if (!row) throw signalErrors.not_found("找不到这个 Signal");
    return mapSignal(row);
  }

  private list(projectId: string, sourceId?: string): SignalRecord[] {
    const rows = sourceId == null
      ? this.db.all("SELECT * FROM signals WHERE project_id = ? ORDER BY observed_at DESC, signal_id", projectId)
      : this.db.all("SELECT * FROM signals WHERE project_id = ? AND source_id = ? ORDER BY observed_at DESC, signal_id", projectId, sourceId);
    return (rows as Row[]).map(mapSignal);
  }

  private submitDraft(draft: SignalDraft): SignalReceipt {
    assertDraft(draft);
    const normalized = structuredClone(draft);
    const contentHash = sha256(stableJson({
      kind: normalized.kind,
      occurred_at: normalized.occurred_at,
      payload: normalized.payload,
      content_refs: normalized.content_refs ?? [],
      adapter: normalized.adapter,
      provenance: normalized.provenance,
    }));
    return this.db.transaction(() => {
      const existingRow = this.db.get(`
        SELECT * FROM signals
        WHERE project_id = ? AND source_id = ? AND provider_dedupe_id = ?
      `, normalized.project_id, normalized.source_id, normalized.provider_dedupe_id) as Row | undefined;
      const acceptedAt = this.now().toISOString();
      if (existingRow) {
        const existing = mapSignal(existingRow);
        if (existing.content_hash === contentHash) {
          return { signal: existing, created: false, changed: false, deduped: true };
        }
        const revision = existing.revision + 1;
        this.db.run(`
          UPDATE signals SET
            kind = ?, occurred_at = ?, observed_at = ?, payload_json = ?,
            content_refs_json = ?, raw_event_id = ?, adapter_plugin_id = ?,
            adapter_version = ?, provenance_json = ?, revision = ?,
            content_hash = ?, updated_at = ?
          WHERE project_id = ? AND signal_id = ?
        `, normalized.kind, normalized.occurred_at, normalized.observed_at, JSON.stringify(normalized.payload), JSON.stringify(normalized.content_refs ?? []), normalized.raw_event_id, normalized.adapter.plugin_id, normalized.adapter.version, JSON.stringify(normalized.provenance), revision, contentHash, acceptedAt, normalized.project_id, existing.signal_id);
        this.insertRevision(existing.signal_id, revision, contentHash, normalized, acceptedAt);
        this.insertEvent(existing.signal_id, normalized.source_id, revision, "signal.changed", acceptedAt, normalized.project_id);
        return {
          signal: this.get(normalized.project_id, existing.signal_id),
          created: false,
          changed: true,
          deduped: false,
        };
      }

      const signalId = `signal-${sha256(`${normalized.project_id}\u0000${normalized.source_id}\u0000${normalized.provider_dedupe_id}`).slice(0, 32)}`;
      this.db.run(`
        INSERT INTO signals (
          project_id, signal_id, source_id, provider_dedupe_id, kind,
          occurred_at, observed_at, payload_json, content_refs_json,
          raw_event_id, adapter_plugin_id, adapter_version, provenance_json,
          revision, content_hash, validation, superseded_by, withdrawn_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'accepted', NULL, NULL, ?, ?)
      `, normalized.project_id, signalId, normalized.source_id, normalized.provider_dedupe_id, normalized.kind, normalized.occurred_at, normalized.observed_at, JSON.stringify(normalized.payload), JSON.stringify(normalized.content_refs ?? []), normalized.raw_event_id, normalized.adapter.plugin_id, normalized.adapter.version, JSON.stringify(normalized.provenance), contentHash, acceptedAt, acceptedAt);
      this.insertRevision(signalId, 1, contentHash, normalized, acceptedAt);
      this.insertEvent(signalId, normalized.source_id, 1, "signal.accepted", acceptedAt, normalized.project_id);
      return {
        signal: this.get(normalized.project_id, signalId),
        created: true,
        changed: false,
        deduped: false,
      };
    });
  }

  private insertRevision(
    signalId: string,
    revision: number,
    contentHash: string,
    draft: SignalDraft,
    acceptedAt: string,
  ): void {
    this.db.run(`
      INSERT INTO signal_revisions (
        project_id, signal_id, revision, content_hash, draft_json, accepted_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, draft.project_id, signalId, revision, contentHash, JSON.stringify(draft), acceptedAt);
  }

  private listEvents(projectId: string, sourceId?: string): SignalEvent[] {
    const rows = sourceId == null
      ? this.db.all("SELECT * FROM signal_events WHERE project_id = ? ORDER BY at, event_id", projectId)
      : this.db.all("SELECT * FROM signal_events WHERE project_id = ? AND source_id = ? ORDER BY at, event_id", projectId, sourceId);
    return (rows as Row[]).map((row) => ({
      event_id: text(row.event_id),
      project_id: text(row.project_id),
      signal_id: text(row.signal_id),
      source_id: text(row.source_id),
      type: text(row.type) as SignalEvent["type"],
      revision: Number(row.revision),
      at: text(row.at),
    }));
  }

  private insertEvent(
    signalId: string,
    sourceId: string,
    revision: number,
    type: SignalEvent["type"],
    at: string,
    projectId: string,
  ): void {
    this.db.run(`
      INSERT INTO signal_events (
        event_id, project_id, signal_id, source_id, type, revision, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, `signal-event-${randomUUID()}`, projectId, signalId, sourceId, type, revision, at);
  }
}

function assertDraft(draft: SignalDraft): void {
  const required = [
    draft.project_id,
    draft.source_id,
    draft.provider_dedupe_id,
    draft.kind,
    draft.occurred_at,
    draft.observed_at,
    draft.raw_event_id,
    draft.adapter.plugin_id,
    draft.adapter.version,
  ];
  if (
    required.some((value) => typeof value !== "string" || value.trim().length === 0)
    || !Number.isFinite(Date.parse(draft.occurred_at))
    || !Number.isFinite(Date.parse(draft.observed_at))
    || !isObject(draft.payload)
    || !isObject(draft.provenance)
  ) {
    throw signalErrors.invalid_draft("Signal Draft 缺少可信身份、时间或结构化内容");
  }
}

function mapSignal(row: Row): SignalRecord {
  return {
    project_id: text(row.project_id),
    signal_id: text(row.signal_id),
    source_id: text(row.source_id),
    provider_dedupe_id: text(row.provider_dedupe_id),
    kind: text(row.kind),
    occurred_at: text(row.occurred_at),
    observed_at: text(row.observed_at),
    payload: json<Record<string, unknown>>(row.payload_json, {}),
    content_refs: json<string[]>(row.content_refs_json, []),
    raw_event_id: text(row.raw_event_id),
    adapter: {
      plugin_id: text(row.adapter_plugin_id),
      version: text(row.adapter_version),
    },
    provenance: json<Record<string, unknown>>(row.provenance_json, {}),
    revision: Number(row.revision),
    content_hash: text(row.content_hash),
    validation: "accepted",
    superseded_by: optionalText(row.superseded_by),
    withdrawn_at: optionalText(row.withdrawn_at),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
