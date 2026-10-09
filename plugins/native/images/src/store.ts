import { applySqliteBaseline, clearInExistingHomeSqlite, homeSqlitePath, openHomeSqliteDatabase, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import type { ImageConnection, ImageJob, ImageJobStatus, GeneratedImage } from "@molis-ai/molis-work-contracts/modules/images";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { ImagesError } from "./error.js";

export type StoredConnection = Omit<ImageConnection, "has_key">;
type Row = Record<string, unknown>;

/** Private data only: credentials are owned by the Host secret store. */
/**
 * The images store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version.
 */
export const IMAGES_STORE_BASELINE: SqliteBaseline = { version: 1, schema: `
  CREATE TABLE connections (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, api_format TEXT NOT NULL,
    base_url TEXT NOT NULL, model TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT NOT NULL,
    input_hash TEXT NOT NULL, connection_id TEXT NOT NULL, connection_name TEXT NOT NULL,
    api_format TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL,
    size TEXT NOT NULL, aspect_ratio TEXT NOT NULL, status TEXT NOT NULL,
    images_json TEXT NOT NULL, error TEXT NOT NULL,
    created_at TEXT NOT NULL, finished_at TEXT, runner_id TEXT,
    UNIQUE (project_id, request_id)
  );
  CREATE INDEX jobs_project_created ON jobs(project_id, created_at DESC);
` };

/** A runner's lock file is its id plus `.db`; a process killed with a transaction open also leaves the `-journal` beside it. */
const RUNNER_FILE = /^([a-f0-9-]{36})\.db(?:-journal)?$/u;
/** A runner file this young may belong to a runner that has created it but not yet locked it. It waits for the next start. */
const RUNNER_START_GRACE_MS = 30_000;

export class ImagesStore {
  private readonly db: DatabaseSync;
  private readonly runnerLock: DatabaseSync;
  private readonly runnerId = randomUUID();
  private readonly runnerDirectory: string;

  constructor(homeDirectory: string) {
    const directory = join(homeDirectory, "images");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.runnerDirectory = join(directory, "runners");
    let runnerLock: DatabaseSync | undefined;
    try {
      mkdirSync(this.runnerDirectory, { recursive: true, mode: 0o700 });
      this.runnerLock = runnerLock = new DatabaseSync(join(this.runnerDirectory, this.runnerId + ".db"));
      this.runnerLock.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
      this.db = openHomeSqliteDatabase(homeDirectory, "images");
    } catch (error) {
      runnerLock?.close();
      throw error;
    }
    try {
    this.db.exec("PRAGMA busy_timeout = 5000;");
    applySqliteBaseline(this.db, homeSqlitePath(homeDirectory, "images"), IMAGES_STORE_BASELINE);
    this.recoverInterrupted();
    this.reclaimRunnerFiles();
    } catch (error) {
      try { this.db.close(); } finally { this.releaseLocks(); }
      throw error;
    }
  }

  close(): void {
    try { this.db.close(); } finally { this.releaseLocks(); }
  }

  private releaseLocks(): void {
    this.runnerLock.close();
    // The ID is never reused. Closing the lock connection rolls its transaction back, which removes the journal; a crashed
    // runner's file and journal are removed at the next start (reclaimRunnerFiles).
    try { rmSync(join(this.runnerDirectory, this.runnerId + ".db"), { force: true }); } catch { /* Safe to retain an unlocked file. */ }
  }

  /**
   * Removes the files of every runner that is gone: each `<id>.db` whose exclusive lock this process can take, with its
   * `-journal`. recoverInterrupted names only the runners that still had a running job, so the others (and the journal
   * of any killed runner) stayed for good. A file another process holds is alive and stays; so does one too young to
   * tell from a runner that is still starting. A file that cannot be probed stays too, and the next start tries again.
   */
  private reclaimRunnerFiles(): void {
    const ids = new Set<string>();
    for (const name of readdirSync(this.runnerDirectory)) {
      const id = RUNNER_FILE.exec(name)?.[1];
      if (id && id !== this.runnerId) ids.add(id);
    }
    const now = Date.now();
    for (const id of ids) {
      const path = join(this.runnerDirectory, id + ".db");
      try {
        const changed = lastRunnerFileChange(path);
        if (changed === 0 || now - changed < RUNNER_START_GRACE_MS) continue;
        const probe = lockDeadRunner(path);
        if (!probe) continue;
        probe.close();
        removeRunnerFiles(path);
      } catch { /* Not provably dead, or not ours to delete: retained, and the next start tries again. */ }
    }
  }

  private recoverInterrupted(): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const owners = this.db.prepare("SELECT DISTINCT runner_id FROM jobs WHERE status = 'running'").all() as Row[];
      for (const { runner_id: owner } of owners) {
        if (owner === this.runnerId) continue;
        // Every job names the runner that holds it; that runner's exclusive lock proves it is still alive.
        if (!/^[a-f0-9-]{36}$/u.test(String(owner))) throw new Error("Invalid Images runner identity");
        const path = join(this.runnerDirectory, String(owner) + ".db");
        const probe = lockDeadRunner(path);
        if (!probe) continue;
        try {
          this.db.prepare("UPDATE jobs SET status = 'interrupted', error = ?, finished_at = ? WHERE status = 'running' AND runner_id = ?")
            .run("本机执行进程已停止，未自动重新生成。请先检查厂商用量，再决定是否重试。", new Date().toISOString(), String(owner));
        } finally { probe.close(); }
        removeRunnerFiles(path);
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

  /** The project is deleted: its jobs go. Returns the names of the image files they held; deleting those is the caller's. */
  deleteProject(projectId: string): string[] {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const files = deleteProjectJobs(this.db, projectId);
      this.db.exec("COMMIT");
      return files;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  finish(projectId: string, id: string, status: Exclude<ImageJobStatus, "running">, images: GeneratedImage[], error: string): boolean {
    const result = this.db.prepare(`UPDATE jobs SET status = ?, images_json = ?, error = ?, finished_at = ?
      WHERE project_id = ? AND id = ? AND status = 'running'`)
      .run(status, JSON.stringify(images), error, new Date().toISOString(), projectId, id);
    return Number(result.changes) === 1;
  }
}

/**
 * Takes the exclusive lock of a runner's file and returns the connection that holds it (the caller closes it), or null
 * when another process holds the lock: that runner is alive. Only SQLITE_BUSY proves that. Any other error, an I/O
 * error included, must not be mistaken for process death, so it is thrown.
 */
function lockDeadRunner(path: string): DatabaseSync | null {
  const probe = new DatabaseSync(path);
  try {
    probe.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
    return probe;
  } catch (error) {
    probe.close();
    if (error && typeof error === "object" && "errcode" in error && error.errcode === 5) return null;
    throw error;
  }
}

/** A runner's lock file and its journal, both: neither belongs to anyone once the runner is gone. */
function removeRunnerFiles(path: string): void {
  for (const file of [path, path + "-journal"]) {
    try { rmSync(file, { force: true }); } catch { /* No live owner; retaining it is harmless. */ }
  }
}

/** When the runner's file or its journal last changed, in epoch milliseconds; 0 when neither exists. */
function lastRunnerFileChange(path: string): number {
  return Math.max(0, ...[path, path + "-journal"].map(file => statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0));
}

/** Removes a project's jobs inside the caller's transaction; returns the names of the image files they held. */
function deleteProjectJobs(db: DatabaseSync, projectId: string): string[] {
  const files = (db.prepare("SELECT images_json FROM jobs WHERE project_id = ?").all(projectId) as Row[])
    .flatMap(row => (JSON.parse(String(row.images_json)) as GeneratedImage[]).map(image => image.filename));
  db.prepare("DELETE FROM jobs WHERE project_id = ?").run(projectId);
  return files;
}

/** Image files are named by a generated id; anything else in a stored record is not ours to delete. */
const ASSET_FILE = /^[a-f0-9-]+\.(png|jpg|webp)$/u;

/**
 * Clears a deleted project's jobs and pictures straight from the Home's files, for a process that runs no Images
 * service. A library that does not exist yet has nothing to clear and is not created. A job still running in another
 * process loses its record; its result is dropped when it finishes.
 */
export function purgeImagesProject(homeDirectory: string, projectId: string): void {
  const files = clearInExistingHomeSqlite(homeDirectory, "images", IMAGES_STORE_BASELINE, db => deleteProjectJobs(db, projectId));
  if (files) removeAssetFiles(join(homeDirectory, "images", "assets"), files);
}

export function removeAssetFiles(directory: string, filenames: readonly string[]): void {
  for (const name of filenames) if (ASSET_FILE.test(name)) rmSync(join(directory, name), { force: true });
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
