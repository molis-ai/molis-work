import type { PagesBody, PagesRecord, PagesGenerationRecord } from "./contract.js";
import { pagesErrors } from "./error.js";
import type { PagesSql } from "./store.js";

/** What a generation attempt is remembered by: one request, in the state it was last written. */
const attemptKey = (record: Pick<PagesGenerationRecord, "project_id" | "request_id" | "updated_at">) =>
  `${record.project_id}\u0000${record.request_id}\u0000${record.updated_at}`;

/**
 * The generation receipts of a Pages store: one row per request, a lease while it runs, and the memory of which attempts this
 * instance started. `PagesStore` extends it, so the receipts and the documents they produce share one connection and one unit of work.
 */
export abstract class PagesGenerationStore {
  /** `attempts` is the memory of the generation calls one plugin instance (or one own-connection store family) started. */
  constructor(protected readonly db: PagesSql, protected readonly attempts: Map<string, boolean>, protected readonly atomically: <T>(run: () => T) => T) {}

  abstract get(id: string, projectId?: string): PagesRecord;
  abstract create(input: { project_id: string; title?: string; body?: PagesBody }): PagesRecord;

  /** Memory only: a refused call releases only this instance's attempt, including after reopening its Store. */
  releaseGenerationAttempt(record: Pick<PagesGenerationRecord, "project_id" | "request_id" | "updated_at">): void {
    const key = attemptKey(record);
    if (this.attempts.has(key)) this.attempts.set(key, false);
  }

  generation(projectId: string, requestId: string): PagesGenerationRecord | null {
    const row = this.db.get("SELECT record_json FROM page_generations WHERE project_id = ? AND request_id = ?", [projectId, requestId]);
    return row ? JSON.parse(String(row.record_json)) as PagesGenerationRecord : null;
  }

  generations(projectId: string): PagesGenerationRecord[] {
    return this.db.all("SELECT record_json FROM page_generations WHERE project_id = ? ORDER BY updated_at DESC", [projectId])
      .map((row) => JSON.parse(String(row.record_json)) as PagesGenerationRecord);
  }

  beginGeneration(record: PagesGenerationRecord): PagesGenerationRecord {
    const started = this.atomically((): { replayed: PagesGenerationRecord } | { prior: PagesGenerationRecord | null; next: PagesGenerationRecord } => {
      const prior = this.generation(record.project_id, record.request_id);
      if (prior?.request_hash && prior.request_hash !== record.request_hash) throw pagesErrors.invalid("同一个请求的材料或要求已改变，请重新生成");
      if (prior?.status === "completed") return { replayed: prior };
      // A fresh running record keeps its lease, unless this process started that attempt and it has already ended.
      if (prior?.status === "running" && Date.now() - Date.parse(prior.updated_at) < 180_000
        && this.attempts.get(attemptKey(prior)) !== false) throw pagesErrors.unavailable("这份文稿仍在生成，请稍后查看结果");
      const next = { ...(prior ?? record), status: "running" as const, error: null, updated_at: new Date(Math.max(Date.now(), prior ? Date.parse(prior.updated_at) + 1 : 0)).toISOString() };
      this.saveGeneration(next);
      return { prior, next };
    });
    if ("replayed" in started) return started.replayed;
    if (started.prior) this.attempts.delete(attemptKey(started.prior));
    this.attempts.set(attemptKey(started.next), true);
    return started.next;
  }

  completeGeneration(record: PagesGenerationRecord, body: PagesBody): PagesRecord {
    const document = this.atomically(() => {
      const prior = this.generation(record.project_id, record.request_id);
      if (prior?.status === "completed" && prior.document_id) return this.get(prior.document_id, record.project_id);
      if (!prior || prior.status !== "running" || prior.updated_at !== record.updated_at) throw pagesErrors.unavailable("此请求已由另一次处理接续，请查看最新结果");
      const created = this.create({ project_id: record.project_id, title: record.title, body });
      this.saveGeneration({ ...record, status: "completed", document_id: created.id, error: null, updated_at: new Date().toISOString() });
      return created;
    });
    this.attempts.delete(attemptKey(record));
    return document;
  }

  failGeneration(record: PagesGenerationRecord, message: string): void {
    const next = { ...record, status: "failed", error: message.slice(0, 500), updated_at: new Date(Math.max(Date.now(), Date.parse(record.updated_at) + 1)).toISOString() };
    this.db.run("UPDATE page_generations SET updated_at = ?, record_json = ? WHERE project_id = ? AND request_id = ? AND updated_at = ? AND json_extract(record_json, '$.status') = 'running'",
      [next.updated_at, JSON.stringify(next), record.project_id, record.request_id, record.updated_at]);
    this.attempts.delete(attemptKey(record));
  }

  private saveGeneration(record: PagesGenerationRecord): void {
    this.db.run("INSERT INTO page_generations (project_id, request_id, updated_at, record_json) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, request_id) DO UPDATE SET updated_at = excluded.updated_at, record_json = excluded.record_json",
      [record.project_id, record.request_id, record.updated_at, JSON.stringify(record)]);
  }
}
