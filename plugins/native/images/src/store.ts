import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ImageConnection, ImageJob, ImageJobStatus, GeneratedImage } from "@molis-ai/molis-work-contracts/modules/images";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ImagesError } from "./error.js";

export type StoredConnection = Omit<ImageConnection, "has_key">;
type Row = Record<string, unknown>;

/** Private data only: credentials are owned by the Host secret store. */
export class ImagesStore {
  private readonly db: DatabaseSync;
  private readonly runnerLock: DatabaseSync;
  private readonly compatibilityLock: DatabaseSync;
  private readonly runnerId = randomUUID();
  private readonly runnerDirectory: string;

  constructor(homeDirectory: string) {
    const directory = join(homeDirectory, "images");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const lockPath = join(directory, ".runner-lock.db");
    this.compatibilityLock = new DatabaseSync(lockPath);
    try { chmodSync(lockPath, 0o600); } catch { /* Some volumes do not support Unix modes. */ }
    try {
      // New runners share a read lock. An old binary's lifetime EXCLUSIVE lock
      // cannot overlap: it would incorrectly interrupt every running job.
      this.compatibilityLock.exec("PRAGMA busy_timeout = 0; BEGIN; SELECT COUNT(*) FROM sqlite_schema");
    } catch {
      this.compatibilityLock.close();
      throw new ImagesError("images.already_open", "旧版图片服务仍在运行，请关闭旧版进程后重试。", 409);
    }
    this.runnerDirectory = join(directory, "runners");
    let runnerLock: DatabaseSync | undefined;
    try {
      mkdirSync(this.runnerDirectory, { recursive: true, mode: 0o700 });
      this.runnerLock = runnerLock = new DatabaseSync(join(this.runnerDirectory, this.runnerId + ".db"));
      this.runnerLock.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
      this.db = openHomeSqliteDatabase(homeDirectory, "images");
    } catch (error) {
      try { runnerLock?.close(); } finally { this.compatibilityLock.close(); }
      throw error;
    }
    try {
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, api_format TEXT NOT NULL,
        base_url TEXT NOT NULL, model TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT NOT NULL,
        input_hash TEXT NOT NULL, connection_id TEXT NOT NULL, connection_name TEXT NOT NULL,
        api_format TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL,
        size TEXT NOT NULL, aspect_ratio TEXT NOT NULL, status TEXT NOT NULL,
        images_json TEXT NOT NULL, error TEXT NOT NULL,
        created_at TEXT NOT NULL, finished_at TEXT,
        UNIQUE (project_id, request_id)
      );
      CREATE INDEX IF NOT EXISTS jobs_project_created ON jobs(project_id, created_at DESC);
    `);
    if (!(this.db.prepare("PRAGMA table_info(jobs)").all() as Row[]).some(row => row.name === "runner_id")) {
      this.db.exec("ALTER TABLE jobs ADD COLUMN runner_id TEXT");
    }
    this.db.exec("COMMIT");
    this.recoverInterrupted();
    } catch (error) {
      try { this.db.close(); } finally { this.releaseLocks(); }
      throw error;
    }
  }

  close(): void {
    try { this.db.close(); } finally { this.releaseLocks(); }
  }

  private releaseLocks(): void {
    try { this.runnerLock.close(); } finally { this.compatibilityLock.close(); }
    // The ID is never reused. A crashed runner's file is removed during recovery.
    try { rmSync(join(this.runnerDirectory, this.runnerId + ".db"), { force: true }); } catch { /* Safe to retain an unlocked file. */ }
  }

  private recoverInterrupted(): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const owners = this.db.prepare("SELECT DISTINCT runner_id FROM jobs WHERE status = 'running'").all() as Row[];
      for (const { runner_id: owner } of owners) {
        if (owner === this.runnerId) continue;
        // Legacy jobs had no owner. The shared compatibility lock excludes an
        // old live runner before those records can be recovered.
        let probe: DatabaseSync | undefined;
        const path = owner === null ? null : join(this.runnerDirectory, String(owner) + ".db");
        if (owner !== null && !/^[a-f0-9-]{36}$/u.test(String(owner))) throw new Error("Invalid Images runner identity");
        try {
          if (path) {
            probe = new DatabaseSync(path);
            probe.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
          }
          this.db.prepare("UPDATE jobs SET status = 'interrupted', error = ?, finished_at = ? WHERE status = 'running' AND runner_id IS ?")
            .run("本机执行进程已停止，未自动重新生成。请先检查厂商用量，再决定是否重试。", new Date().toISOString(), owner as string | null);
        } catch (error) {
          // Only SQLITE_BUSY proves another runner holds this lock. I/O errors
          // must not be mistaken for process death.
          if (!(error && typeof error === "object" && "errcode" in error && error.errcode === 5)) throw error;
          continue;
        } finally { probe?.close(); }
        if (path) { try { rmSync(path, { force: true }); } catch { /* No live owner; retaining it is harmless. */ } }
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  listConnections(): StoredConnection[] {
    return this.db.prepare("SELECT * FROM connections ORDER BY created_at, id").all() as unknown as StoredConnection[];
  }

  getConnection(id: string): StoredConnection | null {
    return this.db.prepare("SELECT * FROM connections WHERE id = ?").get(id) as unknown as StoredConnection | undefined ?? null;
  }

  saveConnection(connection: StoredConnection): void {
    this.db.prepare(`INSERT INTO connections (id,name,api_format,base_url,model,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,api_format=excluded.api_format,
      base_url=excluded.base_url,model=excluded.model,updated_at=excluded.updated_at`)
      .run(connection.id, connection.name, connection.api_format, connection.base_url, connection.model,
        connection.created_at, connection.updated_at);
  }

  deleteConnection(id: string): void {
    const result = this.db.prepare("DELETE FROM connections WHERE id = ?").run(id);
    if (Number(result.changes) !== 1) throw new ImagesError("images.not_found", "找不到要删除的生图服务。", 404);
  }

  listJobs(projectId: string): ImageJob[] {
    this.recoverInterrupted();
    return (this.db.prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(projectId) as Row[]).map(jobFromRow);
  }

  getJob(projectId: string, id: string): ImageJob {
    this.recoverInterrupted();
    const row = this.db.prepare("SELECT * FROM jobs WHERE project_id = ? AND id = ?").get(projectId, id) as Row | undefined;
    if (!row) throw new ImagesError("images.not_found", "找不到这次图片生成记录。", 404);
    return jobFromRow(row);
  }

  deleteJob(projectId: string, id: string): ImageJob {
    const job = this.getJob(projectId, id);
    if (job.status === "running") throw new ImagesError("images.running", "请先停止生成，再删除记录。", 409);
    const result = this.db.prepare("DELETE FROM jobs WHERE project_id = ? AND id = ? AND status != 'running'").run(projectId, id);
    if (Number(result.changes) !== 1) throw new ImagesError("images.running", "请先停止生成，再删除记录。", 409);
    return job;
  }

  findRequest(projectId: string, requestId: string, inputHash: string): ImageJob | null {
    this.recoverInterrupted();
    return this.requestInTransaction(projectId, requestId, inputHash);
  }

  private requestInTransaction(projectId: string, requestId: string, inputHash: string): ImageJob | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE project_id = ? AND request_id = ?").get(projectId, requestId) as Row | undefined;
    if (!row) return null;
    if (row.input_hash !== inputHash) throw new ImagesError("images.request_conflict", "该请求 ID 已用于其他生成内容，请创建新的请求。", 409);
    return jobFromRow(row);
  }

  insertJob(job: ImageJob, inputHash: string): ImageJob | null {
    this.recoverInterrupted();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.requestInTransaction(job.project_id, job.request_id, inputHash);
      if (existing) { this.db.exec("COMMIT"); return existing; }
      const count = this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'running'").get() as { count: number };
      if (count.count >= 2) throw new ImagesError("images.busy", "本机已有 2 个生成任务，请等待完成或停止等待后再生成。", 429);
      this.db.prepare(`INSERT INTO jobs
        (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(job.id, job.project_id, job.request_id, inputHash, job.connection_id, job.connection_name,
          job.api_format, job.model, job.prompt, job.size, job.aspect_ratio, job.status, "[]", "", job.created_at, null, this.runnerId);
      this.db.exec("COMMIT");
      return null;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  finish(projectId: string, id: string, status: Exclude<ImageJobStatus, "running">, images: GeneratedImage[], error: string): boolean {
    const result = this.db.prepare(`UPDATE jobs SET status = ?, images_json = ?, error = ?, finished_at = ?
      WHERE project_id = ? AND id = ? AND status = 'running'`)
      .run(status, JSON.stringify(images), error, new Date().toISOString(), projectId, id);
    return Number(result.changes) === 1;
  }
}

function jobFromRow(row: Row): ImageJob {
  return {
    id: String(row.id), project_id: String(row.project_id), request_id: String(row.request_id),
    connection_id: String(row.connection_id), connection_name: String(row.connection_name),
    api_format: row.api_format as ImageJob["api_format"], model: String(row.model), prompt: String(row.prompt),
    size: String(row.size), aspect_ratio: String(row.aspect_ratio), status: row.status as ImageJob["status"],
    images: JSON.parse(String(row.images_json)) as GeneratedImage[], error: String(row.error),
    created_at: String(row.created_at), finished_at: row.finished_at === null ? null : String(row.finished_at),
  };
}
