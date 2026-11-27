import type { PluginSyncClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { portableColumns } from "./portable-record.js";
import type { PortableImage } from "./sync-files.js";
import type { ImageJob, ImageJobStatus, GeneratedImage } from "./contract.js";
import type { PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { imagesErrors } from "./error.js";
import { IMAGES_DATABASE } from "./database.js";
import { removeImagesOverview, writeImagesOverview } from "./overview.js";
export { IMAGES_DATABASE };

export type { StoredConnection } from "./connections.js";
export const INTERRUPTED = "本机执行已中断，未自动重新生成。请先检查厂商用量，再决定是否重试。";
type Row = Record<string, unknown>;


/**
 * Queries are side-effect free; the Runtime owns transaction and authority checks. The library is one partition's (batch 108): every job in it
 * is that partition's, so no query filters by project, and a job's `project_id` is the partition it is read in.
 */
export class ImagesStore {
  constructor(private readonly db: PluginDatabaseTransaction, private readonly partition: string, private readonly sync?: PluginSyncClient) {}

  recoverInterrupted(): void {
    const running = (this.db.all("SELECT id FROM jobs WHERE status = 'running'") as Row[]).map(row => String(row.id));
    this.db.run("UPDATE jobs SET status = 'interrupted', error = ?, finished_at = ? WHERE status = 'running'",
      [INTERRUPTED, new Date().toISOString()]);
    for (const id of running) {
      const job = this.findJob(id);
      if (job) writeImagesOverview(this.db, job);
    }
  }

  referencedFiles(): Set<string> {
    return new Set(this.db.all("SELECT images_json FROM jobs").flatMap(row =>
      (JSON.parse(String(row.images_json)) as GeneratedImage[]).map(image => image.filename)));
  }

  hasJobs(): boolean {
    return !!this.db.get("SELECT 1 FROM jobs LIMIT 1");
  }

  listJobs(): ImageJob[] {
    return (this.db.all("SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC") as Row[]).map(row => this.jobFromRow(row));
  }

  /** A job by id alone: a partition's library holds only that partition's jobs. */
  findJob(id: string): ImageJob | null {
    const row = this.db.get("SELECT * FROM jobs WHERE id = ?", [id]) as Row | undefined;
    return row ? this.jobFromRow(row) : null;
  }

  getJob(id: string): ImageJob {
    const job = this.findJob(id);
    if (!job) throw imagesErrors.not_found("找不到这次图片生成记录。");
    return job;
  }

  deleteJob(id: string, retained?:{spaceId:string;job:ImageJob;images:PortableImage[];authorize():void}): ImageJob {
    const job = this.getJob(id);
    if (job.status === "running") throw imagesErrors.running("请先停止生成，再删除记录。");
    if(retained){
      if(JSON.stringify(job)!==JSON.stringify(retained.job))throw imagesErrors.request_conflict("图片记录已更新，原件已保留。");

      if (!this.sync) throw imagesErrors.invalid("个人空间同步服务未提供");
      this.sync.retain("saved_images",this.db,JSON.stringify([job.project_id,'image',job.id]),{format:/* @version format.images.portable */ 1,spaceId:retained.spaceId,project:{id:job.project_id,title:job.project_id},record:Object.fromEntries(portableColumns.map(key=>[key,job[key]])),images:retained.images});
    }
    const result = this.db.run("DELETE FROM jobs WHERE id = ? AND status != 'running'", [id]);
    if (Number(result.changes) !== 1) throw imagesErrors.running("请先停止生成，再删除记录。");
    removeImagesOverview(this.db, id);
    return job;
  }

  findRequest(requestId: string, inputHash: string): ImageJob | null {
    const row = this.db.get("SELECT * FROM jobs WHERE request_id = ?", [requestId]) as Row | undefined;
    if (!row) return null;
    if (row.input_hash !== inputHash) throw imagesErrors.request_conflict("该请求 ID 已用于其他生成内容，请创建新的请求。");
    return this.jobFromRow(row);
  }

  insertJob(job: ImageJob, inputHash: string, live: readonly string[]): ImageJob | null {
    const existing = this.findRequest(job.request_id, inputHash);
    if (existing) return existing;
    const count = this.db.get("SELECT COUNT(*) AS count FROM jobs WHERE status = 'running' AND id IN (SELECT value FROM json_each(?))", [JSON.stringify(live)]);
    if (Number(count?.count) >= 2) throw imagesErrors.busy("已有 2 个生成任务在进行，请等待完成或停止等待后再生成。");
    this.db.run(`INSERT INTO jobs
      (id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [job.id, job.request_id, inputHash, job.connection_id, job.connection_name,
        job.api_format, job.model, job.prompt, job.size, job.aspect_ratio, job.status, "[]", "", job.created_at, null]);
    writeImagesOverview(this.db, { ...job, images: [], error: "", finished_at: null });
    return null;
  }

  finish(id: string, status: Exclude<ImageJobStatus, "running">, images: GeneratedImage[], error: string, finishedAt = new Date().toISOString()): void {
    const result = this.db.run(`UPDATE jobs SET status = ?, images_json = ?, error = ?, finished_at = ?
      WHERE id = ? AND status = 'running'`, [status, JSON.stringify(images), error, finishedAt, id]);
    const job = Number(result.changes) === 1 ? this.findJob(id) : null;
    if (job) writeImagesOverview(this.db, job);
  }

  private jobFromRow(row: Row): ImageJob {
  return {
    id: String(row.id), project_id: this.partition, request_id: String(row.request_id),
    connection_id: String(row.connection_id), connection_name: String(row.connection_name),
    api_format: row.api_format as ImageJob["api_format"], model: String(row.model), prompt: String(row.prompt),
    size: String(row.size), aspect_ratio: String(row.aspect_ratio), status: row.status as ImageJob["status"],
    images: JSON.parse(String(row.images_json)) as GeneratedImage[], error: String(row.error),
    created_at: String(row.created_at), finished_at: row.finished_at === null ? null : String(row.finished_at),
  };
  }
}

