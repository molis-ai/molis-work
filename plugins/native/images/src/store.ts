import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ImageConnection, ImageJob, ImageJobStatus, GeneratedImage } from "@molis-ai/molis-work-contracts/modules/images";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ImagesError } from "./error.js";

export type StoredConnection = Omit<ImageConnection, "has_key">;
type Row = Record<string, unknown>;

/** Private data only: credentials are owned by the Host secret store. */
export class ImagesStore {
  private readonly db: DatabaseSync;
  private readonly runnerLock: DatabaseSync;

  constructor(homeDirectory: string) {
    const directory = join(homeDirectory, "images");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const lockPath = join(directory, ".runner-lock.db");
    this.runnerLock = new DatabaseSync(lockPath);
    try { chmodSync(lockPath, 0o600); } catch { /* Some volumes do not support Unix modes. */ }
    try {
      // Hold a separate SQLite lock for this runner's lifetime. OS process exit
      // releases it, so only a real replacement process performs recovery.
      this.runnerLock.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
    } catch {
      this.runnerLock.close();
      throw new ImagesError("images.already_open", "另一个本机进程正在运行图片服务，请在原窗口继续使用，或关闭它后重试。", 409);
    }
    try {
      this.db = openHomeSqliteDatabase(homeDirectory, "images");
    } catch (error) {
      this.runnerLock.close();
      throw error;
    }
    try {
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
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
    this.db.prepare("UPDATE jobs SET status = 'interrupted', error = ?, finished_at = ? WHERE status = 'running'")
      .run("本机服务已重启，未自动重新生成。请先检查厂商用量，再决定是否重试。", new Date().toISOString());
    } catch (error) {
      try { this.db.close(); } finally { this.runnerLock.close(); }
      throw error;
    }
  }

  close(): void {
    try { this.db.close(); } finally { this.runnerLock.close(); }
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

  listJobs(projectId: string): ImageJob[] {
    return (this.db.prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(projectId) as Row[]).map(jobFromRow);
  }

  getJob(projectId: string, id: string): ImageJob {
    const row = this.db.prepare("SELECT * FROM jobs WHERE project_id = ? AND id = ?").get(projectId, id) as Row | undefined;
    if (!row) throw new ImagesError("images.not_found", "找不到这次图片生成记录。", 404);
    return jobFromRow(row);
  }

  findRequest(projectId: string, requestId: string, inputHash: string): ImageJob | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE project_id = ? AND request_id = ?").get(projectId, requestId) as Row | undefined;
    if (!row) return null;
    if (row.input_hash !== inputHash) throw new ImagesError("images.request_conflict", "该请求 ID 已用于其他生成内容，请创建新的请求。", 409);
    return jobFromRow(row);
  }

  insertJob(job: ImageJob, inputHash: string): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const count = this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'running'").get() as { count: number };
      if (count.count >= 2) throw new ImagesError("images.busy", "本机已有 2 个生成任务，请等待完成或停止等待后再生成。", 429);
      this.db.prepare(`INSERT INTO jobs
        (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(job.id, job.project_id, job.request_id, inputHash, job.connection_id, job.connection_name,
          job.api_format, job.model, job.prompt, job.size, job.aspect_ratio, job.status, "[]", "", job.created_at, null);
      this.db.exec("COMMIT");
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
