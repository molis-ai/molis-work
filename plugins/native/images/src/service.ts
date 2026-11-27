import type {PluginSyncContext, PluginSyncClient} from "@molis-ai/molis-work-contracts/platform/plugin";
import {validatePortableImage} from "./sync-files.js";
import { createHash, randomUUID } from "node:crypto";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginExecutionControl, PluginOwnerFilesClient, PluginImageGenerationClient, PluginBackgroundClient, PluginDueClient, PluginDueOutcome } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { GeneratedImage, ImageConnection, ImageConnectionInput, ImageGenerateInput, ImageJob } from "./contract.js";
import { imagesErrors } from "./error.js";
import { normalizeImageBaseUrl } from "./providers.js";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { exceedsCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { ImagesStore, INTERRUPTED } from "./store.js";
import type { ImagesConnectionChanges, ImagesConnections, StoredConnection } from "./connections.js";
import { runImageJob } from "./service-job.js";
import { IMAGES_ASSETS } from "./owner-files.js";
import { IMAGES_INPUT_LIMITS } from "./limits.js";

export type ImagesControl = Omit<PluginExecutionControl, "project_id">;

/**
 * How long a generation may be under way before the platform wakes Images in its partition to settle it (batch 108): a job whose process
 * stopped, or whose partition went to sleep, is marked interrupted then, and the person is told, without any other plugin or partition waking.
 */
export const IMAGES_JOB_DEADLINE_MS = 30 * 60_000;
const dueKey = (id: string) => `job:${id}`;

export interface ImagesServiceOptions {
  /** The partition this instance serves: its library holds only that partition's jobs. */
  projectId: string;
  sync?:PluginSyncContext;
  syncClient?:PluginSyncClient;
  database: PluginDatabase;
  /** The person's image services (`person_settings`), shared by every partition. */
  connections: ImagesConnections;
  /** This partition's due entries: one per generation under way. */
  due?: PluginDueClient;
  files: PluginOwnerFilesClient;
  imageGeneration: PluginImageGenerationClient;
  background: PluginBackgroundClient;
}

export class ImagesService {
  private readonly store: ImagesStore;
  private readonly active = new Map<string, AbortController>();
  private readonly interruptions = new Map<string, { projectId: string; at: string }>();
  private readonly changingConnections = new Set<string>();
  private closed = false;

  constructor(private readonly options: ImagesServiceOptions) {
    this.store = new ImagesStore({ get: (sql, values) => options.database.get(sql, values), all: (sql, values) => options.database.all(sql, values),
      run: () => { throw imagesErrors.invalid("读取图片记录时不能写入。"); },
      savepoint: () => { throw imagesErrors.invalid("读取图片记录时不能写入。"); } }, options.projectId);
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
    return this.options.connections.list().map(connection => this.publicConnection(connection));
  }

  canStartOrReplay(projectId: string | null | undefined): boolean {
    this.assertOpen();
    return this.options.connections.tryList().some(connection => !connection.change && this.publicConnection(connection).available)
      || (projectId === this.options.projectId && this.store.hasJobs());
  }

  authConnections() { return [...this.options.imageGeneration.connections()]; }

  async saveConnection(input: ImageConnectionInput, control: ImagesControl): Promise<ImageConnection> {
    this.assertOpen();
    if (input.id && input.create_id) throw imagesErrors.invalid("请选择新建或编辑服务");
    const id = textField(input.id ?? input.create_id ?? randomUUID(), "服务 ID", 128);
    return this.changeConnection(id, async () => {
      const previous = this.options.connections.get(id, true);
      if (input.id !== undefined && !previous) throw imagesErrors.not_found("找不到要修改的生图服务。");
      if (previous?.change?.authId === null) throw imagesErrors.connection_pending(uiText.text("images.service.delete-pending"));
      if (input.api_format !== "openai-images" && input.api_format !== "gemini") throw imagesErrors.invalid("请选择受支持的图片 API 协议。");
      const now = new Date().toISOString();
      const connection: StoredConnection = { id, name: textField(input.name, "服务名称", IMAGES_INPUT_LIMITS.connection_name), api_format: input.api_format,
        base_url: normalizeImageBaseUrl(textField(input.base_url, "API 基址", 2048)), model: textField(input.model, "模型名称", IMAGES_INPUT_LIMITS.model),
        created_at: previous?.created_at ?? now, updated_at: now };
      const selected = input.auth_connection_id?.trim() || previous?.change?.authId;
      if (input.create_id && previous) {
        const saved = this.publicConnection(previous);
        if (previous.name !== connection.name || previous.model !== connection.model || previous.base_url !== connection.base_url
          || previous.api_format !== connection.api_format || (selected || undefined) !== saved.auth_connection_id) {
          throw imagesErrors.request_conflict("同一个新建请求已用于其他服务设置。");
        }
        if (!previous.change) return saved;
      }
      const target = { slot_id: id, base_url: connection.base_url };
      const pendingBinding = await this.settle(control, connections => {
        connections.save(connection);
        if (!selected) return;
        if (previous && !previous.change && previous.base_url === connection.base_url && previous.api_format === connection.api_format) {
          const bound = this.options.imageGeneration.inspect(target);
          if (bound.available && bound.connection_id === selected) return;
        }
        connections.planChange(id, selected);
        return selected;
      });
      if (pendingBinding) {
        try {
          const actual = previous?.change ? this.options.imageGeneration.inspect(target) : undefined;
          if (!actual?.available || actual.connection_id !== pendingBinding) await this.options.imageGeneration.bind(target, pendingBinding);
          await this.settle(control, connections => connections.finishChange(id));
        } catch {
          control.signal?.throwIfAborted();
          requireSynchronous(control.assert_authority_current?.());
          throw imagesErrors.connection_pending(uiText.text("images.service.binding-pending"), { service_id: id });
        }
      }
      return this.publicConnection(connection);
    });
  }

  async deleteConnection(id: string, control: ImagesControl): Promise<void> {
    const key = textField(id, "服务 ID", 128);
    return this.changeConnection(key, async () => {
      const existing = this.options.connections.get(key, true);
      if (!existing) throw imagesErrors.not_found("找不到要删除的生图服务。");
      await this.settle(control, connections => connections.planChange(key, null));
      try {
        const bound = this.options.imageGeneration.inspect({ slot_id: key, base_url: existing.base_url });
        if (bound.connection_id) await this.options.imageGeneration.unbind(key);
        await this.settle(control, connections => connections.delete(key));
      } catch {
        control.signal?.throwIfAborted();
        requireSynchronous(control.assert_authority_current?.());
        throw imagesErrors.connection_pending(uiText.text("images.service.delete-pending"), { service_id: key });
      }
    });
  }

  private async changeConnection<T>(id: string, change: () => Promise<T>): Promise<T> {
    if (this.changingConnections.has(id)) throw imagesErrors.connection_changed("另一项服务更改正在进行，请稍后重试。");
    this.changingConnections.add(id);
    try { return await change(); } finally { this.changingConnections.delete(id); }
  }

  private executionState(job: ImageJob): ImageJob {
    const stopped = this.interruptions.get(job.id);
    return job.status === "running" && stopped ? { ...job, status: "interrupted", error: INTERRUPTED, finished_at: stopped.at } : job;
  }

  listJobs(projectId: string): ImageJob[] { this.assertOpen(); this.partition(projectId); return this.store.listJobs().map(job => this.executionState(job)); }
  getJob(projectId: string, id: string): ImageJob { this.assertOpen(); this.partition(projectId); return this.executionState(this.store.getJob(textField(id, "任务 ID", 128))); }

  async deleteJob(projectId: string, id: string, control: ImagesControl): Promise<void> {
    this.partition(projectId);
    const stored = this.store.getJob(textField(id, "任务 ID", 128));
    if (stored.status === "running" && this.interruptions.has(stored.id)) {
      await this.writeWithRecovery(stored.project_id, control, () => undefined);
    }
    const snapshot=this.getJob(projectId,id),sync=this.options.sync;
    const retained=sync?{spaceId:sync.spaceId,job:snapshot,authorize:()=>sync.assertActive(),images:snapshot.images.map(image=>{
      const bytes=this.options.files.read(`${IMAGES_ASSETS}/${image.filename}`);if(!bytes||bytes.byteLength!==image.byte_length)throw imagesErrors.invalid("原图片缺失，删除未执行。");
      const portable={id:image.id,mime_type:image.mime_type,byte_length:image.byte_length,data_base64:Buffer.from(bytes).toString('base64')};validatePortableImage(portable);return portable;
    })}:undefined;
    const job = await this.write(control, store => store.deleteJob(snapshot.id,retained));
    if (job.images.length) {
      await this.options.files.write(writer => {
        requireSynchronous(control.assert_authority_current?.());
        const referenced = this.store.referencedFiles();
        for (const image of job.images) if (!referenced.has(image.filename)) writer.removeTree(`${IMAGES_ASSETS}/${image.filename}`);
      });
    }

  }

  async start(projectId: string, input: ImageGenerateInput, control: ImagesControl): Promise<ImageJob> {
    this.assertOpen();
    const projectIdValue = this.partition(projectId), requestId = textField(input.request_id, "请求 ID", 128);
    const normalized = { connection_id: textField(input.connection_id, "生图服务", 128), prompt: textField(input.prompt, "图片描述", IMAGES_INPUT_LIMITS.prompt),
      size: optionalText(input.size, "尺寸", IMAGES_INPUT_LIMITS.size), aspect_ratio: optionalText(input.aspect_ratio, "宽高比", IMAGES_INPUT_LIMITS.aspect_ratio) };
    const inputHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    const existing = this.store.findRequest(requestId, inputHash);
    if (existing) return this.executionState(existing);
    // An Agent or a workflow may not read the person's services: it starts with the one this instance last read for the person (connections.ts).
    const connection = this.options.connections.tryList().find(item => item.id === normalized.connection_id);
    if (!connection) throw imagesErrors.not_found("找不到所选生图服务，请重新选择。");
    if (connection.change) throw imagesErrors.connection_pending(uiText.text("images.service.change-pending"));
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
      const latest = this.options.connections.tryList().find(item => item.id === connection.id);
      if (!latest || latest.change || latest.base_url !== connection.base_url || latest.api_format !== connection.api_format || latest.model !== connection.model) {
        throw imagesErrors.connection_changed("图像连接已改变，本次结果未保存。");
      }
    };
    let recorded = false;
    try {
      const execution = await this.options.background.start(async background => {
        if (!await admitted) return;
        const outcome = await runImageJob({ ...this.options, job, connection, revision: state.revision, control: background, current,
          read: () => this.store.getJob(job.id), write: (check, apply) => this.write(check, apply) });
        recorded = outcome === "recorded";
      }, { signal: controller.signal });
      void execution.result.catch(() => { controller.abort(); }).finally(async () => {
        if (await admitted && !recorded && !this.closed) this.interruptions.set(job.id, { projectId: job.project_id, at: new Date().toISOString() });
        this.active.delete(job.id);
      });
      const duplicate = await this.writeWithRecovery(projectIdValue, control, store => { current();
        const latest = this.options.imageGeneration.inspect({ slot_id: connection.id, base_url: connection.base_url });
        if (!latest.available || latest.revision !== state.revision) throw imagesErrors.connection_changed("图像连接已改变，请重新生成。");
        return store.insertJob(job, inputHash, [...this.active.keys()]); });
      admit(!duplicate);
      if (duplicate) { execution.cancel(); return this.executionState(duplicate); }
      this.options.due?.register({ entry_key: dueKey(job.id), due_at: new Date(Date.parse(job.created_at) + IMAGES_JOB_DEADLINE_MS).toISOString() });
      void execution.result.finally(() => { if (recorded && !this.closed) try { this.options.due?.cancel(dueKey(job.id)); } catch { /* The deadline settles it instead. */ } }).catch(() => {});
      return job;
    } catch (error) {
      admit(false); controller.abort(); this.active.delete(job.id); throw error;
    }
  }

  async cancel(projectId: string, id: string, control: ImagesControl): Promise<ImageJob> {
    const job = this.getJob(projectId, id);
    if (job.status === "running") {
      await this.write(control, store => store.finish(job.id, "cancelled", [], "已停止本机等待；厂商可能仍在生成或计费。"));
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

  /**
   * A generation's deadline fell due (`onDue`): one this process still runs gets another; one no process runs any more (the Host stopped, or
   * this partition slept) is marked interrupted, and the person is told once. Anything else is already settled: nothing to say.
   */
  async due(entryKey: string, control: ImagesControl): Promise<PluginDueOutcome> {
    if (!entryKey.startsWith("job:")) return {};
    const id = entryKey.slice("job:".length), row = this.store.findJob(id);
    if (!row || (row.status !== "running" && row.status !== "interrupted")) return {};
    if (this.active.has(id)) {
      this.options.due?.register({ entry_key: entryKey, due_at: new Date(Date.now() + IMAGES_JOB_DEADLINE_MS).toISOString() });
      return {};
    }
    if (row.status === "running") await this.write(control, store => store.finish(id, "interrupted", [], INTERRUPTED));
    return { reminder: { title: uiText.text("images.background.interrupted", { prompt: [...row.prompt].slice(0, 120).join("") }), open: { surface: "images", id } } };
  }

  close(): void { this.closed = true; for (const controller of this.active.values()) controller.abort(); this.active.clear(); }

  /** Only a new authorized write in this project can persist the executor's observed end time. Keep it across rollbacks. */
  private async writeWithRecovery<T>(projectId: string, control: ImagesControl, apply: (store: ImagesStore) => T): Promise<T> {
    const stopped = [...this.interruptions].filter(([, entry]) => entry.projectId === projectId);
    const result = await this.write(control, store => {
      for (const [id, entry] of stopped) store.finish(id, "interrupted", [], INTERRUPTED, entry.at);
      return apply(store);
    });
    for (const [id] of stopped) this.interruptions.delete(id);
    return result;
  }

  /** One change to the person's services, written once after the call's own checks (`ImagesConnections.batch`). */
  private async settle<T>(control: ImagesControl, apply: (connections: ImagesConnectionChanges) => T): Promise<T> {
    this.assertOpen();
    await control.beforeEffect();
    this.assertOpen();
    control.signal?.throwIfAborted();
    requireSynchronous(control.assert_authority_current?.());
    return this.options.connections.batch(apply);
  }

  private write<T>(control: ImagesControl, apply: (store: ImagesStore) => T): Promise<T> {
    return this.options.database.transaction(() => control.beforeEffect(), transaction => {
      this.assertOpen();
      control.signal?.throwIfAborted();
      requireSynchronous(control.assert_authority_current?.());
      return apply(new ImagesStore(transaction,this.options.projectId,this.options.syncClient));
    });
  }

  private publicConnection(connection: StoredConnection): ImageConnection {
    const { change, ...settings } = connection;
    if (change) return { ...settings, has_key: false, available: false,
      ...(change.authId ? { auth_connection_id: change.authId } : {}),
      unavailable_reason: change.authId ? uiText.text("images.service.binding-pending") : uiText.text("images.service.delete-pending") };
    const state = this.options.imageGeneration.inspect({ slot_id: connection.id, base_url: connection.base_url });
    return { ...settings, has_key: state.has_key, available: state.available,
      ...(!state.available ? { unavailable_reason: state.reason || "所选图像连接不可用" } : {}),
      ...(state.connection_id ? { auth_connection_id: state.connection_id } : {}) };
  }
  /** The caller's project, which is this partition: another partition's jobs are in another library, so none is found here. */
  private partition(value: unknown): string {
    const projectId = project(value);
    if (projectId !== this.options.projectId) throw imagesErrors.not_found("找不到这次图片生成记录。");
    return projectId;
  }

  private assertOpen(): void { if (this.closed) throw imagesErrors.closed("图片服务已停止。"); }
}

function textField(value: unknown, name: string, maximum: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || exceedsCharacters(text, maximum)) throw imagesErrors.invalid(`${name}不能为空，且最多 ${maximum} 个字符。`);
  return text;
}
function optionalText(value: unknown, name: string, maximum: number): string { return value === undefined || value === "" ? "" : textField(value, name, maximum); }
function project(value: unknown): string { return textField(value, "当前项目", 256); }
