import { createHash, randomUUID } from "node:crypto";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginExecutionControl, PluginOwnerFilesClient, PluginImageGenerationClient, PluginBackgroundClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { GeneratedImage, ImageConnection, ImageConnectionInput, ImageGenerateInput, ImageJob } from "./contract.js";
import { imagesErrors } from "./error.js";
import { normalizeImageBaseUrl } from "./providers.js";
import { ImagesStore, type StoredConnection } from "./store.js";
import { runImageJob } from "./service-job.js";
import { IMAGES_ASSETS } from "./owner-files.js";

export type ImagesControl = Omit<PluginExecutionControl, "project_id">;

export interface ImagesServiceOptions {
  database: PluginDatabase;
  files: PluginOwnerFilesClient;
  imageGeneration: PluginImageGenerationClient;
  background: PluginBackgroundClient;
}

export class ImagesService {
  private readonly store: ImagesStore;
  private readonly active = new Map<string, AbortController>();
  private closed = false;

  constructor(private readonly options: ImagesServiceOptions) {
    this.store = new ImagesStore({ get: (sql, values) => options.database.get(sql, values), all: (sql, values) => options.database.all(sql, values),
      run: () => { throw imagesErrors.invalid("读取图片记录时不能写入。"); },
      savepoint: () => { throw imagesErrors.invalid("读取图片记录时不能写入。"); } });
  }

  /** Jobs a stopped process left running are interrupted; this is the plugin's own database and needs no file grant. */
  async recover(control: ImagesControl): Promise<void> {
    await this.write(control, store => store.recoverInterrupted());
  }

  /** Tidying, not recovery: files no job refers to. A start whose installation cannot read and write the files skips it (the next one that can does it). */
  async reclaimAssets(control: ImagesControl): Promise<void> {
    const referenced = this.store.referencedFiles();
    const unreferenced = this.options.files.list(IMAGES_ASSETS).filter(entry => entry.kind === "file" && !referenced.has(entry.name)).map(entry => entry.name);
    if (unreferenced.length) {
      await this.options.files.write(writer => {
        requireSynchronous(control.assert_authority_current?.());
        for (const name of unreferenced) writer.removeTree(`${IMAGES_ASSETS}/${name}`);
      });
    }
  }

  listConnections(): ImageConnection[] {
    this.assertOpen();
    return this.store.listConnections().map(connection => this.publicConnection(connection));
  }

  authConnections() { return [...this.options.imageGeneration.connections()]; }

  async saveConnection(input: ImageConnectionInput, control: ImagesControl): Promise<ImageConnection> {
    this.assertOpen();
    const id = input.id === undefined ? randomUUID() : textField(input.id, "服务 ID", 128);
    const previous = this.store.getConnection(id);
    if (input.id !== undefined && !previous) throw imagesErrors.not_found("找不到要修改的生图服务。");
    if (input.api_format !== "openai-images" && input.api_format !== "gemini") throw imagesErrors.invalid("请选择受支持的图片 API 协议。");
    const now = new Date().toISOString();
    const connection: StoredConnection = { id, name: textField(input.name, "服务名称", 100), api_format: input.api_format,
      base_url: normalizeImageBaseUrl(textField(input.base_url, "API 基址", 2048)), model: textField(input.model, "模型名称", 200),
      created_at: previous?.created_at ?? now, updated_at: now };
    const selected = input.auth_connection_id?.trim();
    if (selected) await this.options.imageGeneration.bind({ slot_id: id, base_url: connection.base_url }, selected);
    await this.write(control, store => store.saveConnection(connection));
    return this.publicConnection(connection);
  }

  async deleteConnection(id: string, control: ImagesControl): Promise<void> {
    const key = textField(id, "服务 ID", 128);
    if (!this.store.getConnection(key)) throw imagesErrors.not_found("找不到要删除的生图服务。");
    await this.options.imageGeneration.unbind(key);
    await this.write(control, store => store.deleteConnection(key));
  }

  listJobs(projectId: string): ImageJob[] { this.assertOpen(); return this.store.listJobs(project(projectId)); }
  getJob(projectId: string, id: string): ImageJob { this.assertOpen(); return this.store.getJob(project(projectId), textField(id, "任务 ID", 128)); }

  async deleteJob(projectId: string, id: string, control: ImagesControl): Promise<void> {
    const job = await this.write(control, store => store.deleteJob(project(projectId), textField(id, "任务 ID", 128)));
    if (job.images.length) {
      await this.options.files.write(writer => {
        requireSynchronous(control.assert_authority_current?.());
        for (const image of job.images) writer.removeTree(`${IMAGES_ASSETS}/${image.filename}`);
      });
    }
  }

  async start(projectId: string, input: ImageGenerateInput, control: ImagesControl): Promise<ImageJob> {
    this.assertOpen();
    const projectIdValue = project(projectId), requestId = textField(input.request_id, "请求 ID", 128);
    const normalized = { connection_id: textField(input.connection_id, "生图服务", 128), prompt: textField(input.prompt, "图片描述", 32_000),
      size: optionalText(input.size, "尺寸", 64), aspect_ratio: optionalText(input.aspect_ratio, "宽高比", 32) };
    const inputHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    const existing = this.store.findRequest(projectIdValue, requestId, inputHash);
    if (existing) return existing;
    const connection = this.store.getConnection(normalized.connection_id);
    if (!connection) throw imagesErrors.not_found("找不到所选生图服务，请重新选择。");
    if (connection.api_format === "gemini" && normalized.size || connection.api_format === "openai-images" && normalized.aspect_ratio) {
      throw imagesErrors.invalid("尺寸参数与当前 API 协议不匹配，请重新选择尺寸或宽高比。");
    }
    const state = this.options.imageGeneration.inspect({ slot_id: connection.id, base_url: connection.base_url });
    if (!state.available) throw imagesErrors.key_required(state.reason || "所选图像连接不可用");
    const job: ImageJob = { id: randomUUID(), project_id: projectIdValue, request_id: requestId, connection_id: connection.id,
      connection_name: connection.name, api_format: connection.api_format, model: connection.model, prompt: normalized.prompt,
      size: normalized.size, aspect_ratio: normalized.aspect_ratio, status: "running", images: [], error: "", created_at: new Date().toISOString(), finished_at: null };
    const controller = new AbortController();
    // Registered before the first await: closing the service also cancels jobs still being admitted.
    this.active.set(job.id, controller);
    let admit!: (accepted: boolean) => void;
    const admitted = new Promise<boolean>(resolve => { admit = resolve; });
    const current = () => {
      controller.signal.throwIfAborted(); this.assertOpen();
      const latest = this.store.getConnection(connection.id);
      if (!latest || latest.base_url !== connection.base_url || latest.api_format !== connection.api_format || latest.model !== connection.model) {
        throw imagesErrors.connection_changed("图像连接已改变，本次结果未保存。");
      }
    };
    try {
      const execution = await this.options.background.start(async background => {
        if (!await admitted) return;
        await runImageJob({ ...this.options, job, connection, revision: state.revision, control: background, current,
          read: () => this.store.getJob(job.project_id, job.id), write: (check, apply) => this.write(check, apply) });
      }, { signal: controller.signal });
      void execution.result.catch(() => { controller.abort(); }).finally(() => this.active.delete(job.id));
      const duplicate = await this.write(control, store => { current();
        const latest = this.options.imageGeneration.inspect({ slot_id: connection.id, base_url: connection.base_url });
        if (!latest.available || latest.revision !== state.revision) throw imagesErrors.connection_changed("图像连接已改变，请重新生成。");
        return store.insertJob(job, inputHash); });
      admit(!duplicate);
      if (duplicate) { execution.cancel(); return duplicate; }
      return job;
    } catch (error) {
      admit(false); controller.abort(); this.active.delete(job.id); throw error;
    }
  }

  async cancel(projectId: string, id: string, control: ImagesControl): Promise<ImageJob> {
    const job = this.getJob(projectId, id);
    if (job.status === "running") {
      await this.write(control, store => store.finish(job.project_id, job.id, "cancelled", [], "已停止本机等待；厂商可能仍在生成或计费。"));
      this.active.get(job.id)?.abort();
    }
    return this.getJob(job.project_id, job.id);
  }

  readImage(projectId: string, jobId: string, imageId: string): { bytes: Buffer; mime: GeneratedImage["mime_type"]; filename: string } {
    const image = this.getJob(projectId, jobId).images.find(item => item.id === imageId);
    if (!image) throw imagesErrors.not_found("找不到这张图片。");
    const bytes = this.options.files.read(`${IMAGES_ASSETS}/${image.filename}`);
    if (!bytes) throw imagesErrors.not_found("图片文件已丢失，请重新生成。");
    return { bytes: Buffer.from(bytes), mime: image.mime_type, filename: image.filename };
  }

  close(): void { this.closed = true; for (const controller of this.active.values()) controller.abort(); this.active.clear(); }

  private write<T>(control: ImagesControl, apply: (store: ImagesStore) => T): Promise<T> {
    return this.options.database.transaction(() => control.beforeEffect(), transaction => {
      this.assertOpen(); control.signal?.throwIfAborted(); requireSynchronous(control.assert_authority_current?.());
      return apply(new ImagesStore(transaction));
    });
  }

  private publicConnection(connection: StoredConnection): ImageConnection {
    const state = this.options.imageGeneration.inspect({ slot_id: connection.id, base_url: connection.base_url });
    return { ...connection, has_key: state.has_key, available: state.available,
      ...(!state.available ? { unavailable_reason: state.reason || "所选图像连接不可用" } : {}),
      ...(state.connection_id ? { auth_connection_id: state.connection_id } : {}) };
  }
  private assertOpen(): void { if (this.closed) throw imagesErrors.closed("图片服务已停止。"); }
}

function textField(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw imagesErrors.invalid(`${name}不能为空，且最多 ${maximum} 个字符。`);
  return value.trim();
}
function optionalText(value: unknown, name: string, maximum: number): string { return value === undefined || value === "" ? "" : textField(value, name, maximum); }
function project(value: unknown): string { return textField(value, "当前项目", 256); }
