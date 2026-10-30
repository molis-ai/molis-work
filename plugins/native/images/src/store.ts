import type { HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import type { ImageConnection, ImageJob, ImageJobStatus, GeneratedImage } from "./contract.js";
import type { PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { imagesErrors } from "./error.js";
import { IMAGES_DATABASE } from "./database.js";
export { IMAGES_DATABASE };

export type StoredConnection = Omit<ImageConnection, "has_key">;
type Row = Record<string, unknown>;


/** Queries are side-effect free; the Runtime owns transaction and authority checks. */
export class ImagesStore {
  constructor(private readonly db: PluginDatabaseTransaction) {}

  recoverInterrupted(): void {
    this.db.run("UPDATE jobs SET status = 'interrupted', error = ?, finished_at = ? WHERE status = 'running'",
      ["本机执行进程已停止，未自动重新生成。请先检查厂商用量，再决定是否重试。", new Date().toISOString()]);
  }

  referencedFiles(): Set<string> {
    return new Set(this.db.all("SELECT images_json FROM jobs").flatMap(row =>
      (JSON.parse(String(row.images_json)) as GeneratedImage[]).map(image => image.filename)));
  }

  listConnections(): StoredConnection[] {
    return this.db.all("SELECT * FROM connections ORDER BY created_at, id").map(connectionFromRow);
  }

  getConnection(id: string): StoredConnection | null {
    const row = this.db.get("SELECT * FROM connections WHERE id = ?", [id]);
    return row ? connectionFromRow(row) : null;
  }

  saveConnection(connection: StoredConnection): void {
    this.db.run(`INSERT INTO connections (id,name,api_format,base_url,model,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,api_format=excluded.api_format,
      base_url=excluded.base_url,model=excluded.model,updated_at=excluded.updated_at`, [connection.id, connection.name, connection.api_format, connection.base_url, connection.model,
        connection.created_at, connection.updated_at]);
  }

  deleteConnection(id: string): void {
    const result = this.db.run("DELETE FROM connections WHERE id = ?", [id]);
    if (Number(result.changes) !== 1) throw imagesErrors.not_found("找不到要删除的生图服务。");
  }

  listJobs(projectId: string): ImageJob[] {
    return (this.db.all("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC", [projectId]) as Row[]).map(jobFromRow);
  }

  getJob(projectId: string, id: string): ImageJob {
    const row = this.db.get("SELECT * FROM jobs WHERE project_id = ? AND id = ?", [projectId, id]) as Row | undefined;
    if (!row) throw imagesErrors.not_found("找不到这次图片生成记录。");
    return jobFromRow(row);
  }

  deleteJob(projectId: string, id: string): ImageJob {
    const job = this.getJob(projectId, id);
    if (job.status === "running") throw imagesErrors.running("请先停止生成，再删除记录。");
    const result = this.db.run("DELETE FROM jobs WHERE project_id = ? AND id = ? AND status != 'running'", [projectId, id]);
    if (Number(result.changes) !== 1) throw imagesErrors.running("请先停止生成，再删除记录。");
    return job;
  }

  findRequest(projectId: string, requestId: string, inputHash: string): ImageJob | null {
    return this.requestInTransaction(projectId, requestId, inputHash);
  }

  private requestInTransaction(projectId: string, requestId: string, inputHash: string): ImageJob | null {
    const row = this.db.get("SELECT * FROM jobs WHERE project_id = ? AND request_id = ?", [projectId, requestId]) as Row | undefined;
    if (!row) return null;
    if (row.input_hash !== inputHash) throw imagesErrors.request_conflict("该请求 ID 已用于其他生成内容，请创建新的请求。");
    return jobFromRow(row);
  }

  insertJob(job: ImageJob, inputHash: string): ImageJob | null {
    const existing = this.requestInTransaction(job.project_id, job.request_id, inputHash);
    if (existing) return existing;
    const count = this.db.get("SELECT COUNT(*) AS count FROM jobs WHERE status = 'running'");
    if (Number(count?.count) >= 2) throw imagesErrors.busy("本机已有 2 个生成任务，请等待完成或停止等待后再生成。");
    this.db.run(`INSERT INTO jobs
      (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [job.id, job.project_id, job.request_id, inputHash, job.connection_id, job.connection_name,
        job.api_format, job.model, job.prompt, job.size, job.aspect_ratio, job.status, "[]", "", job.created_at, null, null]);
    return null;
  }

  finish(projectId: string, id: string, status: Exclude<ImageJobStatus, "running">, images: GeneratedImage[], error: string): boolean {
    const result = this.db.run(`UPDATE jobs SET status = ?, images_json = ?, error = ?, finished_at = ?
      WHERE project_id = ? AND id = ? AND status = 'running'`, [status, JSON.stringify(images), error, new Date().toISOString(), projectId, id]);
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

/** This plugin's store in the Home's store registry (W4-11): `images/images.db` at its one baseline. */
export const IMAGES_HOME_STORE: HomeStoreDeclaration = { path: "images", library: { baseline: IMAGES_DATABASE } };

function connectionFromRow(row: Row): StoredConnection {
  return { id: String(row.id), name: String(row.name), api_format: row.api_format as StoredConnection["api_format"],
    base_url: String(row.base_url), model: String(row.model), created_at: String(row.created_at), updated_at: String(row.updated_at) };
}
