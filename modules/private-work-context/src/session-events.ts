import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { SessionContentStore } from "./content-store.js";
import { MolisWorkSessionError } from "./errors.js";
import {
  SESSION_EVENT_SOURCES,
  SESSION_TIMELINE_KINDS,
  type AppendMolisWorkSessionEventInput,
  type MolisWorkSessionEventRecord,
} from "./contract-aliases.js";
import { parseMetadata, requiredText, safeEventMetadata, validIsoTimestamp } from "./session-schema.js";

export interface WorkSessionLookup {
  get(sessionId: string): unknown;
}

export class SessionEventRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date,
    private readonly contentStore: SessionContentStore,
    private readonly sessions: WorkSessionLookup,
  ) {}

  append(input: AppendMolisWorkSessionEventInput): MolisWorkSessionEventRecord {
    const sessionId = requiredText(input.session_id, "Molis Work Session ID 不能为空");
    this.sessions.get(sessionId);
    if (!SESSION_EVENT_SOURCES.includes(input.source)) {
      throw new MolisWorkSessionError("session.invalid_input", "Session 事件来源无效");
    }
    if (!SESSION_TIMELINE_KINDS.includes(input.kind)) {
      throw new MolisWorkSessionError("session.invalid_input", "Session 事件类型无效");
    }
    const sourceId = requiredText(input.source_id, "Session 事件 source_id 不能为空");
    const content = typeof input.content === "string" ? input.content : "";
    const sourceOrder = Number.isSafeInteger(input.source_order) && (input.source_order ?? 0) >= 0
      ? input.source_order!
      : 0;
    const occurredAt = validIsoTimestamp(input.occurred_at) ?? this.now().toISOString();
    const createdAt = this.now().toISOString();
    const { content_ref: contentRef } = this.contentStore.write(content);
    const metadata = safeEventMetadata(input.metadata);
    return this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT event_id FROM session_events
        WHERE session_id = ? AND source = ? AND source_id = ?
      `).get(sessionId, input.source, sourceId) as { event_id?: unknown } | undefined;
      const eventId = existing?.event_id ? String(existing.event_id) : `session-event-${randomUUID()}`;
      this.db.prepare(`
        INSERT INTO session_events (
          event_id, session_id, source, kind, source_id, source_order,
          occurred_at, content_ref, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, source, source_id) DO UPDATE SET
          kind = excluded.kind,
          source_order = excluded.source_order,
          occurred_at = excluded.occurred_at,
          content_ref = excluded.content_ref,
          metadata_json = excluded.metadata_json
      `).run(
        eventId,
        sessionId,
        input.source,
        input.kind,
        sourceId,
        sourceOrder,
        occurredAt,
        contentRef,
        JSON.stringify(metadata),
        createdAt,
      );
      return this.get(eventId);
    })();
  }

  list(sessionId: string): MolisWorkSessionEventRecord[] {
    this.sessions.get(sessionId);
    const rows = this.db.prepare(`
      SELECT * FROM session_events WHERE session_id = ?
      ORDER BY occurred_at, source_order, event_id
    `).all(sessionId.trim()) as Array<Record<string, unknown>>;
    return rows.map((row) => this.map(row));
  }

  count(sessionId: string): number {
    this.sessions.get(sessionId);
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM session_events WHERE session_id = ?")
      .get(sessionId.trim()) as { count?: unknown } | undefined;
    return Number(row?.count ?? 0);
  }

  private get(eventId: string): MolisWorkSessionEventRecord {
    const row = this.db.prepare("SELECT * FROM session_events WHERE event_id = ?").get(eventId) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new MolisWorkSessionError("session.not_found", "找不到这条 Session 事件");
    return this.map(row);
  }

  private map(row: Record<string, unknown>): MolisWorkSessionEventRecord {
    let content: string | null = null;
    try {
      content = this.contentStore.read(String(row.content_ref));
    } catch {
      content = null;
    }
    return {
      event_id: String(row.event_id),
      session_id: String(row.session_id),
      source: String(row.source) as MolisWorkSessionEventRecord["source"],
      kind: String(row.kind) as MolisWorkSessionEventRecord["kind"],
      source_id: String(row.source_id),
      source_order: Number(row.source_order),
      occurred_at: String(row.occurred_at),
      content,
      content_available: content !== null,
      metadata: parseMetadata(row.metadata_json),
      created_at: String(row.created_at),
    };
  }
}
