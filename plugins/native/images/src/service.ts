import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import type { GeneratedImage, ImageConnection, ImageConnectionInput, ImageGenerateInput, ImageJob } from "@molis-ai/molis-work-contracts/modules/images";
import { ImagesError } from "./error.js";
import { generateProviderImages, isLocalImageEndpoint, normalizeImageBaseUrl, type ImageGeneration, type ImageProviderRequest } from "./providers.js";
import { ImagesStore, removeAssetFiles, type StoredConnection } from "./store.js";

/** Keys live in the Home's service connections; an image service only names the connection it uses. */
export interface ImagesServiceOptions {
  homeDirectory: string;
  generate?: ImageGeneration;
  /** The chosen connection's key: undefined when none is chosen, null when the chosen one is unusable for this address. */
  resolveConnectionKey: (imageConnectionId: string, baseUrl: string) => string | null | undefined;
  selectConnection: (imageConnectionId: string, authConnectionId: string) => void;
  selectedConnectionId: (imageConnectionId: string) => string | null;
  clearConnection: (imageConnectionId: string) => void;
  /** Metadata only; no credential plaintext or provider requests during discovery. */
  connectionStatus?: (connection: StoredConnection) => { available: boolean; has_key: boolean; revision: string; reason?: string };

}
const activeHomes = new Set<string>();
const REQUEST_TIMEOUT_MS = 180_000;

export class ImagesService {
  private readonly home: string;
  private readonly assets: string;
  private readonly store: ImagesStore;
  private readonly active = new Map<string, { controller: AbortController; promise: Promise<void>; projectId: string }>();
  private closed = false;
  private closing?: Promise<void>;

  constructor(private readonly options: ImagesServiceOptions) {
    this.home = resolve(options.homeDirectory);
    if (activeHomes.has(this.home)) throw new ImagesError("images.already_open", "本机图片服务已经启动。", 409);
    this.assets = join(this.home, "images", "assets");
    mkdirSync(this.assets, { recursive: true, mode: 0o700 });
    this.store = new ImagesStore(this.home);
    activeHomes.add(this.home);
  }

  listConnections(): ImageConnection[] {
    this.assertOpen();
    return this.store.listConnections().map((connection) => this.publicConnection(connection));
  }

  saveConnection(input: ImageConnectionInput): ImageConnection {
    this.assertOpen();
    if (!input || typeof input !== "object") throw new ImagesError("images.invalid", "请填写生图服务配置。");
    const id = input.id === undefined ? randomUUID() : textField(input.id, "服务 ID", 128);
    const previous = this.store.getConnection(id);
    if (input.id !== undefined && !previous) throw new ImagesError("images.not_found", "找不到要修改的生图服务。", 404);
    if (input.api_format !== "openai-images" && input.api_format !== "gemini") throw new ImagesError("images.invalid", "请选择受支持的图片 API 协议。");
    const base = normalizeImageBaseUrl(textField(input.base_url, "API 基址", 2048));
    const authConnectionId = input.auth_connection_id?.trim();
    const now = new Date().toISOString();
    const connection: StoredConnection = {
      id, name: textField(input.name, "服务名称", 100), api_format: input.api_format, base_url: base,
      model: textField(input.model, "模型名称", 200), created_at: previous?.created_at ?? now, updated_at: now,
    };
    try {
      this.store.saveConnection(connection);
      if (authConnectionId) this.options.selectConnection(id, authConnectionId);
    } catch {
      throw new ImagesError("images.save_failed", "无法保存生图服务，请检查服务连接和磁盘权限。", 500);
    }
    return this.publicConnection(connection);
  }

  deleteConnection(id: string): void {
    this.assertOpen();
    const connectionId = textField(id, "服务 ID", 128);
    if (!this.store.getConnection(connectionId)) throw new ImagesError("images.not_found", "找不到要删除的生图服务。", 404);
    this.store.deleteConnection(connectionId);
    this.options.clearConnection(connectionId);
  }

  listJobs(projectId: string): ImageJob[] {
    this.assertOpen();
    return this.store.listJobs(project(projectId));
  }

  getJob(projectId: string, id: string): ImageJob {
    this.assertOpen();
    return this.store.getJob(project(projectId), textField(id, "任务 ID", 128));
  }

  deleteJob(projectId: string, id: string): void {
    this.assertOpen();
    const job = this.store.deleteJob(project(projectId), textField(id, "任务 ID", 128));
    for (const image of job.images) {
      if (/^[a-f0-9-]+\.(png|jpg|webp)$/u.test(image.filename)) {
        try { rmSync(join(this.assets, image.filename), { force: true }); }
        catch { /* The record is already gone; a failed disk cleanup must not claim the delete failed. */ }
      }
    }
  }

  start(projectId: string, input: ImageGenerateInput): ImageJob {
    this.assertOpen();
    const projectIdValue = project(projectId);
    if (!input || typeof input !== "object") throw new ImagesError("images.invalid", "请填写生成内容。");
    const requestId = textField(input.request_id, "请求 ID", 128);
    const normalized = {
      connection_id: textField(input.connection_id, "生图服务", 128), prompt: textField(input.prompt, "图片描述", 32_000),
      size: optionalText(input.size, "尺寸", 64), aspect_ratio: optionalText(input.aspect_ratio, "宽高比", 32),
    };
    const inputHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    const existing = this.store.findRequest(projectIdValue, requestId, inputHash);
    if (existing) return existing;
    const connection = this.store.getConnection(normalized.connection_id);
    if (!connection) throw new ImagesError("images.not_found", "找不到所选生图服务，请重新选择。", 404);
    if ((connection.api_format === "gemini" && normalized.size) || (connection.api_format === "openai-images" && normalized.aspect_ratio)) {
      throw new ImagesError("images.invalid", "尺寸参数与当前 API 协议不匹配，请重新选择尺寸或宽高比。");
    }
    const authorization = this.options.connectionStatus?.(connection);
    if (authorization && !authorization.available) throw new ImagesError("images.key_required", authorization.reason || "所选图像连接不可用", 409);
    const selectedKey = this.options.resolveConnectionKey(connection.id, connection.base_url);
    if (selectedKey === null) throw new ImagesError("images.key_required", "所选图像连接不可用", 409);
    const key = selectedKey ?? "";
    if (!key && !isLocalImageEndpoint(connection.base_url)) throw new ImagesError("images.key_required", "请先为所选生图服务选择一条带 API Key 的服务连接。");
    const job: ImageJob = {
      id: randomUUID(), project_id: projectIdValue, request_id: requestId, connection_id: connection.id,
      connection_name: connection.name, api_format: connection.api_format, model: connection.model,
      prompt: normalized.prompt, size: normalized.size, aspect_ratio: normalized.aspect_ratio,
      status: "running", images: [], error: "", created_at: new Date().toISOString(), finished_at: null,
    };
    const concurrent = this.store.insertJob(job, inputHash);
    if (concurrent) return concurrent;
    const controller = new AbortController();
    const request: ImageProviderRequest = {
      api_format: connection.api_format, base_url: connection.base_url, model: connection.model, credential_ref: credentialRef(connection.id),
      resolveCredential: ref => { assertCurrent(); return ref === credentialRef(connection.id) ? key : null; },
      prompt: job.prompt, size: job.size, aspect_ratio: job.aspect_ratio,
    };
    const assertCurrent = () => {
      const current = this.store.getConnection(connection.id);
      if (!current || current.base_url !== connection.base_url || current.api_format !== connection.api_format || current.model !== connection.model) {
        throw new ImagesError("images.connection_changed", "图像连接已改变或撤销，本次结果未保存。请检查连接后重新生成。", 409);
      }
      const status = this.options.connectionStatus?.(current);
      if (authorization && (!status?.available || status.revision !== authorization.revision)) {
        throw new ImagesError("images.connection_changed", "图像连接已改变或撤销，本次结果未保存。请检查连接后重新生成。", 409);
      }
      const selected = this.options.resolveConnectionKey(current.id, current.base_url);
      const currentKey = selected === undefined ? "" : selected;
      if (currentKey === null || currentKey !== key) throw new ImagesError("images.connection_changed", "图像连接已改变或撤销，本次结果未保存。请检查连接后重新生成。", 409);
    };
    const promise = Promise.resolve().then(() => this.run(job, request, controller, assertCurrent)).finally(() => this.active.delete(job.id));
    this.active.set(job.id, { controller, promise, projectId: projectIdValue });
    return job;
  }

  cancel(projectId: string, id: string): ImageJob {
    const job = this.getJob(projectId, id);
    if (job.status === "running") {
      this.store.finish(job.project_id, job.id, "cancelled", [], "已停止本机等待；厂商可能仍在生成或计费。");
      this.active.get(job.id)?.controller.abort();
    }
    return this.store.getJob(job.project_id, job.id);
  }

  /**
   * The project is deleted: what is still being generated for it is stopped without a result, and its jobs and pictures
   * go. Running it again finds nothing.
   */
  deleteProject(projectId: string): void {
    this.assertOpen();
    for (const entry of this.active.values()) if (entry.projectId === projectId) entry.controller.abort();
    removeAssetFiles(this.assets, this.store.deleteProject(projectId));
  }

  readImage(projectId: string, jobId: string, imageId: string): { bytes: Buffer; mime: GeneratedImage["mime_type"]; filename: string } {
    const job = this.getJob(projectId, jobId);
    const image = job.images.find((item) => item.id === imageId);
    if (!image || !/^[a-f0-9-]+\.(png|jpg|webp)$/u.test(image.filename)) throw new ImagesError("images.not_found", "找不到这张图片。", 404);
    try { return { bytes: readFileSync(join(this.assets, image.filename)), mime: image.mime_type, filename: image.filename }; }
    catch { throw new ImagesError("images.not_found", "图片文件已丢失，请重新生成。", 404); }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    for (const [id, active] of this.active) {
      try {
        this.store.finish(active.projectId, id, "interrupted", [], "本机图片服务已停止，未自动重新生成。请先检查厂商用量，再决定是否重试。");
      } catch {
        // A locked or failing disk must not prevent shutdown. A replacement
        // runner will recover any record that could not be marked interrupted.
      } finally {
        active.controller.abort();
      }
    }
    this.closing = Promise.allSettled([...this.active.values()].map((entry) => entry.promise)).then(() => {
      try { this.store.close(); } finally { activeHomes.delete(this.home); }
    });
    return this.closing;
  }

  private async run(job: ImageJob, request: ImageProviderRequest, controller: AbortController, assertCurrent: () => void): Promise<void> {
    const files: string[] = [];
    const timeout = new ImagesError("images.timeout", "等待厂商响应已超过 180 秒。厂商可能仍在生成或计费，请检查用量后再手动重试。", 504);
    const lifetime = createExecutionLifetime({ signal: controller.signal,
      timeout: { milliseconds: REQUEST_TIMEOUT_MS, reason: timeout },
      monitor: { intervalMs: 200, check: () => {
        if (this.store.getJob(job.project_id, job.id).status !== "running") {
          throw new DOMException("Image job no longer running", "AbortError");
        }
      } },
    });
    try {
      lifetime.assertActive();
      assertCurrent();
      if (!this.options.generate) throw new ImagesError("images.runtime_unavailable", "Prologue 图片执行服务尚未接通，请稍后重试。", 503);
      const results = await generateProviderImages(request, lifetime.signal, this.options.generate);
      lifetime.assertActive();
      if (this.store.getJob(job.project_id, job.id).status !== "running") return;
      assertCurrent();
      const images = results.map((result): GeneratedImage => {
        const id = randomUUID();
        const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[result.mime];
        const filename = `${id}.${extension}`;
        const path = join(this.assets, filename);
        writeFileSync(path, result.bytes, { flag: "wx", mode: 0o600 });
        files.push(path);
        return { id, filename, mime_type: result.mime, byte_length: result.bytes.length };
      });
      if (this.store.finish(job.project_id, job.id, "succeeded", images, "")) files.length = 0;
    } catch (error) {
      // A native dispatch/result guard may reject first; preserve the current business reason.
      // Cancellation/shutdown/ownership loss cannot create a new business failure.
      // A deadline remains an explicit failure even if the provider ignored abort.
      if (controller.signal.aborted || (lifetime.signal.aborted && lifetime.signal.reason !== timeout)) return;
      if (lifetime.signal.aborted) error = lifetime.signal.reason;
      else {
        try { assertCurrent(); } catch (changed) { error = changed; }
      }
      this.store.finish(job.project_id, job.id, "failed", [], error instanceof ImagesError ? error.message : "生成失败：无法连接厂商、下载图片或保存结果。请检查网络、API 基址及磁盘空间，然后手动重试。");
    } finally {
      lifetime.dispose();
      for (const path of files) {
        try { rmSync(path, { force: true }); } catch { /* Only this failed generation's newly-created files are eligible for cleanup. */ }
      }
    }
  }

  private publicConnection(connection: StoredConnection): ImageConnection {
    const selected = this.options.selectedConnectionId(connection.id);
    const state = this.options.connectionStatus?.(connection);
    if (state) return { ...connection, has_key: state.has_key, available: state.available,
      ...(!state.available ? { unavailable_reason: state.reason || "所选图像连接不可用" } : {}),
      ...(selected ? { auth_connection_id: selected } : {}) };
    return { ...connection, has_key: Boolean(this.options.resolveConnectionKey(connection.id, connection.base_url)),
      ...(selected ? { auth_connection_id: selected } : {}) };
  }
  private assertOpen(): void { if (this.closed) throw new ImagesError("images.closed", "图片服务已停止。", 503); }
}

/** Names the key for one request to the Prologue runtime; nothing is stored under it. */
function credentialRef(id: string): string { return `images:${id}`; }
function textField(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new ImagesError("images.invalid", `${name}不能为空，且最多 ${maximum} 个字符。`);
  }
  return value.trim();
}
function optionalText(value: unknown, name: string, maximum: number): string {
  return value === undefined || value === "" ? "" : textField(value, name, maximum);
}
function project(value: unknown): string { return textField(value, "当前项目", 256); }
