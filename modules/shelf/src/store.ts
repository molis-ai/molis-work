import { createShelfCatalog } from './catalog.js';
import {shelfHomeReplica} from './sync-owner.js';
import { createHash, randomBytes } from "node:crypto";
// The one remaining direct read: the person's own original file, hashed again before a job (Shelf migration S2 moves it to `materials:original`).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MaterialExtraction } from "@molis-ai/molis-work-contracts/services/materials";
import type {
  ShelfAdmitFolderInput,
  ShelfAdmitInput,
  ShelfFolderChild,
  ShelfClipboardRecord,
  ShelfDeviceSettings,
  ShelfItemKind,
  ShelfJobOutcome,
  ShelfSettingsPatch,
  ShelfItemRecord,
  ShelfJobRecord,
  ShelfRecipeAvailability,
  ShelfRecipeId,
  ShelfRunJobInput,
  ShelfRuntimeStatus,
  ShelfSnapshot,
  ShelfExecutionControl,
  ShelfMaterialPorts,
  ShelfAiPorts,
  ShelfAiStatus,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { isShelfFailure, readShelfCopy, shelfErrors } from "./errors.js";

import { type CatalogFile, type StoredItem, type ShelfSyncOptions } from "./catalog.js";
import { createShelfFilesCatalog } from "./files-catalog.js";
import { shelfFileDigest as sha256 } from './file-hash.js';
import { shelfPortableHash } from './sync-files.js';
import { shelfSyncKey } from './sync-shape.js';
import { markdownFromExtract } from "./extract.js";
import { OCR_MISSING, ocrLanguages, ocrMarkdown } from "./ocr.js";
import { SAMPLE_PDF_TEXT, createExtractablePdf } from "./pdf.js";
import { captureWebsite, websiteFilename, WEBSITE_MIME } from "./website.js";
import {
  recipeAvailability,
  resolvedChoiceId,
  shelfRecipeSpec,
  shelfRecipeOutputName,
  SHELF_RECIPES,
} from "./recipes.js";
import {
  detectShelfRuntime,
  emptyShelfRuntime,
  type ShelfRuntimeProbe,
} from "./runtimes.js";
import {
  mergeShelfSettings,
  normalizeShelfSettings,
  shortcutOutputName,
} from "./settings.js";

export const SHELF_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const SAMPLE_NAME = "试用示例.pdf";
export const CLIPBOARD_LIMIT = 10;
const MAX_CLIP_TEXT_BYTES = 256 * 1024;
const MAX_EDIT_BYTES = 512 * 1024;
const TEXT_EDIT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json",
  "swift", "py", "js", "ts", "mjs", "css",
  "yaml", "yml", "xml", "toml", "ini",
  "rs", "go", "rb", "sh", "zsh",
  "c", "h", "cc", "cpp", "m", "mm",
  "csv", "log",
]);
const noAi: ShelfAiStatus = { available: false, selected: null, choices: [], reason: "请在设置中配置 AI 模型，再为置物架选择可用模型" };
function recipeTable(ai: ShelfAiStatus): readonly ShelfRecipeAvailability[] {
  return SHELF_RECIPES.map((spec) => recipeAvailability(spec.recipe, {
    available: spec.requires_agent ? ai.available : true,
    reason: spec.requires_agent && !ai.available ? ai.reason : null,
  }));
}

const activeJobs = new Map<string, AbortController>();
const jobKey = (root: string, jobId: string) => JSON.stringify([path.resolve(root), jobId]);
function assertNotBusy(catalog: CatalogFile, itemId: string, root: string): void {
  const busy = catalog.jobs.some((job) => (
    job.status === "running"
    && !isStaleJob(job, root)
    && (job.item_ids.includes(itemId) || job.item_id === itemId || job.result_item_id === itemId)
  ));
  if (busy) throw shelfErrors.busy("运行中不能隐藏或删除");
}

/** A job the process never finished stops blocking once it cannot still be alive. */
function isStaleJob(job: ShelfJobRecord, root: string): boolean {
  return !activeJobs.has(jobKey(root, job.job_id));
}

/** A stored relative path (`/`-separated) stays under one top-level folder of the shelf and has no empty, `.` or `..` segment. */
function safeInside(top: "files" | "jobs", relative: string): string {
  const parts = relative.split("/");
  if (parts[0] !== top || parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) {
    throw shelfErrors.path_invalid("删除路径不在架子内");
  }
  return relative;
}

/** `base/relative` for a relative path kept in the catalog, refusing any segment that could leave `base`. */
function within(base: string, relative: string): string {
  if (relative.split("/").some((part) => !part || part === "." || part === "..")) throw shelfErrors.path_invalid("路径不在架子内");
  return `${base}/${relative}`;
}

function assertSyncIdle(catalog: CatalogFile, key: string, root: string): void {
      const identity=shelfSyncKey(key);
      if(catalog.jobs.some(job=>job.status==='running'&&!isStaleJob(job,root)&&(identity.kind==='job'?job.job_id===identity.id:job.item_ids.includes(identity.id)||job.item_id===identity.id||job.result_item_id===identity.id)))throw shelfErrors.conflict('材料或任务正在使用中，稍后再同步',{sync_waiting:true});
}

/** Trusted sync binding: no file client or runtime probing is needed to inspect the owner's portable document. */
export function openShelfReplica(root: string, sync: ShelfSyncOptions) {
  const catalog = createShelfCatalog(root, sync, (value, key) => assertSyncIdle(value, key, root));
  if (!catalog.replica) throw shelfErrors.invalid('本地空间未启用置物架同步');
  return shelfHomeReplica(catalog.replica, catalog.collect);
}

function shelfId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function requireShelfItem(catalog: CatalogFile, itemId: string): StoredItem {
    const item = catalog.items.find((entry) => entry.item_id === itemId);
    if (!item) throw shelfErrors.item_not_found("这份材料不在架子上");
    return item;
  }


export class ShelfStore {
  private readonly probe: ShelfRuntimeProbe;
  private readonly catalog: ReturnType<typeof createShelfFilesCatalog>;

  /**
   * Shelf's own data is read and written only through `files`; `root` is the real folder behind it, kept for the snapshot and the one place
   * an outside tool is handed a path (the frozen job input). The folders are created by the first write that needs them.
   */
  constructor(readonly root: string, private readonly files: PluginOwnerFilesClient, probe: ShelfRuntimeProbe = {}, private readonly materials: ShelfMaterialPorts = {}, private readonly ai?: ShelfAiPorts, sync?: ShelfSyncOptions) {
    this.probe = probe;
    this.catalog = createShelfFilesCatalog(root, files, sync, (catalog, key) => assertSyncIdle(catalog, key, root));
  }

  replica() {
    if(!this.catalog.replica)throw shelfErrors.invalid('本地空间未启用置物架同步');
    return shelfHomeReplica(this.catalog.replica,this.catalog.collect);
  }

  /** Manual terminal discovery. Automatic recipes use the independent AI port. */
  runtime(settings: ShelfDeviceSettings = this.settings(), probeCapabilities = false): ShelfRuntimeStatus {
    const image_text = this.materials.imageTextAvailable?.() ?? false;
    try {
      return {
        ...detectShelfRuntime({
          ...this.probe,
          skipHelp: !probeCapabilities,
          preferred: this.probe.preferred ?? settings.engine,
          customRuntimes: settings.custom_runtimes,
        }),
        image_text,
      };
    } catch {
      return { ...emptyShelfRuntime(), image_text };
    }
  }

  settings(): ShelfDeviceSettings {
    return normalizeSettings(this.catalog.read().settings);
  }

  async saveSettings(patch: ShelfSettingsPatch): Promise<ShelfDeviceSettings> {
    await this.update((catalog) => {
      catalog.settings = normalizeSettings(mergeShelfSettings(normalizeSettings(catalog.settings), patch));
    });
    return this.settings();
  }

  async snapshot(): Promise<ShelfSnapshot> {
    const catalog = await this.ensureSample(this.catalog.read(this.files));
    const visible = (group: StoredItem["group"]) =>
      catalog.items.filter((item) => item.group === group && !item.hidden).map(publicItem);
    const settings = normalizeSettings(catalog.settings);
    const runtime = this.runtime(settings);
    const ai = this.ai?.status(settings.model_selection) ?? noAi;
    return {
      ai,
      materials: visible("material"),
      results: visible("result"),
      clipboard: catalog.clipboard.slice(0, CLIPBOARD_LIMIT),
      recipes: recipeTable(ai),
      current_clip_id: catalog.current_clip_id,
      runtime,
      running_jobs: catalog.jobs.filter((job) => job.status === "running" && !isStaleJob(job, this.root)),
      settings,
      root: this.root,
    };
  }

  /** Parses only through the Host, then admits the authorized copy without an asynchronous commit gap. */
  async admitFile(input: ShelfAdmitInput, control?: ShelfExecutionControl): Promise<ShelfItemRecord> {
    if (!input.bytes.byteLength) throw shelfErrors.empty_file("没有可加入的文件内容");
    if (input.bytes.byteLength > 32 * 1024 * 1024) throw shelfErrors.too_large("文件超过 32 MB");
    await beforeShelfEffect(control);
    let preview: string | undefined;
    if (classify(input.filename, input.mime ?? "") === "pdf" && this.materials.extract) {
      try {
        const extracted = await this.materials.extract({ file_name: "preview.pdf", bytes: input.bytes },
          { signal: control?.signal, pdfMode: "text", timeoutMs: 12_000, limits: { maxBytes: 32 * 1024 * 1024, maxCharacters: 20_000 } });
        preview = extracted.text ? extractionText(extracted) : undefined;
      } catch { control?.signal?.throwIfAborted(); /* A preview failure does not reject the person's original copy. */ }
    }
    await beforeShelfEffect(control);
    return this.admit(input, preview);
  }

  /** Stores a copy whose derived preview has already been prepared. The check, the file and the catalog row land in one write. */
  async admit(input: ShelfAdmitInput, preparedPreview?: string | null): Promise<ShelfItemRecord> {
    return this.files.write((writer) => {
      const catalog = this.catalog.read(writer);
      // A retry returns the existing copy, preserving any user edits. Hidden copies
      // can be explicitly received again; deleted copies are new admissions.
      if (input.artifact_source) {
        const source = input.artifact_source;
        const original = catalog.items.find(item => item.artifact_source?.project_id === source.project_id
          && item.artifact_source.project_path === source.project_path
          && item.artifact_source.reference.artifact_id === source.reference.artifact_id
          && item.artifact_source.reference.version === source.reference.version);
        if (original) {
          if (original.artifact_source!.content_hash !== source.content_hash) throw shelfErrors.source_conflict("同一成果版本的内容不一致，未覆盖已有副本");
          if (!writer.stat(original.relative_path)) throw shelfErrors.missing_output("原接收副本已不可读，请先在 Shelf 核对处理");
          if (original.hidden) {
            original.hidden = false;
            this.catalog.save(writer, catalog);
          }
          return publicItem({ ...original, hidden: false });
        }
      }
      const bytes = Buffer.from(input.bytes);
      if (!bytes.byteLength) throw shelfErrors.empty_file("没有可加入的文件内容");
      if (bytes.byteLength > 32 * 1024 * 1024) throw shelfErrors.too_large("文件超过 32 MB");
      return publicItem(this.shelve(writer, catalog, input, safeFilename(input.filename), bytes, preparedPreview));
    });
  }

  /** Writes the copy and puts its row first in the catalog, saved by the same write. */
  private shelve(writer: PluginOwnerFilesWriter, catalog: CatalogFile, input: ShelfAdmitInput, filename: string, bytes: Buffer, preparedPreview?: string | null): StoredItem {
    const kind = classify(filename, input.mime ?? "");
    const itemId = shelfId("item");
    const relative = `files/${itemId}/${filename}`;
    writer.writeFile(relative, bytes, "create");
    const item: StoredItem = {
      item_id: itemId,
      ...(input.artifact_source ? { artifact_source: structuredClone(input.artifact_source) } : {}),
      group: "material",
      kind,
      name: filename,
      relative_path: relative,
      mime: input.mime || mimeFor(kind, filename),
      size_bytes: bytes.byteLength,
      origin_hash: sha256(bytes),
      copy_hash: sha256(bytes),
      hidden: false,
      created_at: now(),
      source_item_id: null,
      source_item_ids: [],
      job_id: null,
      preview_text: preparedPreview ?? previewFor(kind, bytes),
      status: "done",
      failure_reason: null,
      children: [],
      origin_realpath: input.origin_realpath ? path.resolve(input.origin_realpath) : null,
    };
    catalog.items.unshift(item);
    catalog.seeded_sample = true;
    this.catalog.save(writer, catalog);
    return item;
  }

  /**
   * A folder comes in whole: every file keeps its place under one shelf item.
   * The directory shows the children inline, never a second file browser.
   */
  async admitFolder(input: ShelfAdmitFolderInput): Promise<ShelfItemRecord> {
    const folderName = safeFilename(input.name);
    const entries = input.entries
      .map((entry) => ({ ...entry, relative: safeRelative(entry.relative) }))
      .filter((entry) => entry.relative && entry.bytes.byteLength > 0);
    if (!entries.length) throw shelfErrors.empty_file("这个文件夹里没有可以加入的文件");
    const total = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
    if (total > 64 * 1024 * 1024) throw shelfErrors.too_large("这个文件夹超过 64 MB");
    const itemId = shelfId("item");
    const relative = `files/${itemId}/${folderName}`;
    return this.files.write((writer) => {
      const children: ShelfFolderChild[] = [];
      const digest = createHash("sha256");
      for (const entry of entries) {
        const bytes = Buffer.from(entry.bytes);
        writer.replaceFileAtomic(within(relative, entry.relative), bytes);
        digest.update(`${entry.relative}:${sha256(bytes)}\n`);
        children.push({
          relative: entry.relative,
          name: path.basename(entry.relative),
          kind: classify(entry.relative, entry.mime ?? ""),
          size_bytes: bytes.byteLength,
        });
      }
      const item: StoredItem = {
        item_id: itemId,
        group: "material",
        kind: "folder",
        name: folderName,
        relative_path: relative,
        mime: "inode/directory",
        size_bytes: total,
        origin_hash: digest.digest("hex"),
        copy_hash: shelfPortableHash({kind:'folder'},entries.map(entry=>({relative:entry.relative,digest:sha256(entry.bytes),size:entry.bytes.byteLength,data:''}))),
        hidden: false,
        created_at: now(),
        source_item_id: null,
        source_item_ids: [],
        job_id: null,
        preview_text: null,
        status: "done",
        failure_reason: null,
        children,
        origin_realpath: input.origin_realpath ? path.resolve(input.origin_realpath) : null,
      };
      const catalog = this.catalog.read(writer);
      catalog.items.unshift(item);
      catalog.seeded_sample = true;
      this.catalog.save(writer, catalog);
      return publicItem(item);
    });
  }

  /** Read one file inside a staged folder. */
  readChild(itemId: string, relative: string): { name: string; mime: string; bytes: Buffer } {
    const item = requireShelfItem(this.catalog.read(), itemId);
    if (item.kind !== "folder") throw shelfErrors.item_not_found("这不是一个文件夹");
    const child = item.children.find((entry) => entry.relative === relative);
    if (!child) throw shelfErrors.item_not_found("这个文件不在这个文件夹里");
    return { name: child.name, mime: mimeFor(child.kind, child.name), bytes: readShelfCopy(this.files, within(item.relative_path, child.relative)) };
  }

  /**
   * A link is captured as a page; everything else lands as text. The wheel's
   * 发给终端 asks for `capture: false`, the way DropAgent sends the link itself.
   */
  admitText(body: string, title = "粘贴文字", capture = true, control?: ShelfExecutionControl): Promise<ShelfItemRecord> {
    return this.admitCapturedText(body, title, capture, control);
  }

  private async admitCapturedText(body: string, title: string, capture: boolean, control?: ShelfExecutionControl, assertCurrent?: () => void): Promise<ShelfItemRecord> {
    const text = body.trim();
    if (!text) throw shelfErrors.empty_file("剪贴板是空的");
    if (isHttpUrl(text) && capture) return this.captureUrl(text, control, assertCurrent);
    await beforeShelfEffect(control);
    assertCurrent?.();
    if (isHttpUrl(text) && !capture) {
      return this.admit({
        filename: `${safeFilename(clipTitleFor("url", text))}.url`,
        bytes: Buffer.from(text, "utf8"),
        mime: "text/uri-list",
      });
    }
    const filename = `${safeFilename(title.slice(0, 40) || "paste")}.md`;
    return this.admit({ filename, bytes: Buffer.from(text, "utf8"), mime: "text/markdown" });
  }

  /** DropAgent fetches the page itself; a failed fetch still shelves the link. */
  admitUrl(url: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord> {
    return this.captureUrl(url, control);
  }

  private async captureUrl(url: string, control?: ShelfExecutionControl, assertCurrent?: () => void): Promise<ShelfItemRecord> {
    await beforeShelfEffect(control);
    assertCurrent?.();
    const page = await captureWebsite(url, this.materials.readWebsite, { signal: control?.signal, beforeDispatch: async () => { await beforeShelfEffect(control); assertCurrent?.(); } });
    await beforeShelfEffect(control);
    assertCurrent?.();
    return this.admit({
      filename: safeFilename(websiteFilename(page.title, page.url)),
      bytes: Buffer.from(page.markdown, "utf8"),
      mime: WEBSITE_MIME,
    });
  }

  async seedSample(): Promise<ShelfItemRecord> {
    const bytes = Buffer.from(createExtractablePdf(SAMPLE_PDF_TEXT));
    return this.files.write((writer) => {
      const catalog = this.catalog.read(writer);
      const existing = catalog.items.find((item) => item.name === SAMPLE_NAME && item.group === "material" && !item.hidden);
      if (existing) return publicItem(existing);
      return publicItem(this.shelve(writer, catalog, { filename: SAMPLE_NAME, bytes, mime: "application/pdf" }, SAMPLE_NAME, bytes, SAMPLE_PDF_TEXT));
    });
  }

  async hide(itemId: string): Promise<void> {
    await this.update((catalog) => {
      const item = requireShelfItem(catalog, itemId);
      assertNotBusy(catalog, itemId, this.root);
      item.hidden = true;
    });
  }

  async deleteCopy(itemId: string): Promise<void> {
    await this.files.write((writer) => {
      const catalog = this.catalog.read(writer);
      const item = requireShelfItem(catalog, itemId);
      assertNotBusy(catalog, item.item_id, this.root);
      const copyDir = item.relative_path ? safeInside("files", path.posix.dirname(item.relative_path)) : null;
      const jobDir = item.job_id ? safeInside("jobs", `jobs/${item.job_id}`) : null;
      catalog.items = catalog.items.filter((entry) => entry.item_id !== itemId);
      this.catalog.save(writer, catalog);
      if (this.catalog.replica) {
        try { this.catalog.collect?.(); } catch { /* Retry bounded cleanup later; the deletion CAS retained original bytes. */ }
        return;
      }
      if (copyDir) writer.removeTree(copyDir);
      if (jobDir && writer.stat(jobDir)) {
        thawTree(writer, jobDir);
        writer.removeTree(jobDir);
      }
    });
  }

  /**
   * DropAgent `JobService.start`: copy the selected materials into read-only `input/`,
   * call the shared AI port (or on-device extractor) on the copy, collect one
   * deliverable, then check the original is still byte for byte what it was.
   */
  async runJob(input: ShelfRunJobInput, control?: ShelfExecutionControl): Promise<ShelfJobOutcome> {
    await beforeShelfEffect(control);
    const spec = this.requireRecipe(input.recipe);
    const settings = this.settings();
    const shortcut = input.recipe === "shortcut"
      ? settings.shortcuts.find((action) => action.id === (input.shortcut_id ?? ""))
      : undefined;
    if (input.recipe === "shortcut" && !shortcut) {
      throw shelfErrors.recipe_unavailable("这个快捷动作已经不在了");
    }
    const accepts = shortcut ? shortcut.kinds : spec.accepts;
    const actionName = shortcut ? shortcut.name : spec.label;
    const itemIds = input.item_ids?.length ? [...input.item_ids] : input.item_id ? [input.item_id] : [];
    if (!itemIds.length) throw shelfErrors.empty_selection("请先选择一份材料");
    const catalog = this.catalog.read();
    const items = itemIds.map((id) => requireShelfItem(catalog, id));
    for (const item of items) {
      if (item.group !== "material" || item.hidden) throw shelfErrors.item_not_found("请先选择一份材料");
      if (!accepts.includes(item.kind)) {
        throw shelfErrors.recipe_unavailable(`选中的材料不能用「${shortcut ? shortcut.name : spec.short_title}」`);
      }
    }
    if (items.length < spec.minimum_count) {
      throw shelfErrors.recipe_unavailable(`「${spec.short_title}」至少要两份材料`);
    }
    const runtime = this.runtime(settings);
    const ai = spec.requires_agent ? this.ai?.status(settings.model_selection) ?? noAi : noAi;
    if (spec.requires_agent && (!ai.available || !ai.selected)) throw shelfErrors.no_model(ai.reason ?? noAi.reason!);
    if (!spec.requires_agent && !this.materials.extract) throw shelfErrors.extraction_unavailable("材料提取服务不可用，请从 Molis Work 打开置物架后重试");
    if (!spec.requires_agent && items.some(item => item.kind === "image") && !runtime.image_text) throw shelfErrors.no_ocr(OCR_MISSING);
    const optionId = spec.choices.length ? resolvedChoiceId(spec.recipe, input.option_id) : null;
    const copyHashes = new Map<string, string>();
    for (const item of items) {
      this.assertOriginUntouched(item);
      copyHashes.set(item.item_id, this.contentHash(item));
    }

    const jobId = shelfId("job");
    const jobRoot = `jobs/${jobId}`;
    const inputRoot = `${jobRoot}/input`;
    const outputRoot = `${jobRoot}/output`;
    // The one real path an outside tool is handed: the model reads the frozen copies in this folder.
    const inputDir = path.join(this.root, "jobs", jobId, "input");
    const outputName = shortcut
      ? shortcutOutputName(items[0].name, shortcut.name)
      : shelfRecipeOutputName(spec.recipe, items[0].kind, optionId);
    const outputFile = `${outputRoot}/${outputName}`;
    const createdAt = now();
    const running: ShelfJobRecord = {
      job_id: jobId,
      recipe: spec.recipe,
      status: "running",
      item_id: items[0].item_id,
      item_ids: items.map((item) => item.item_id),
      option_id: optionId,
      runtime: spec.requires_agent ? "prologue" : localActor(items[0].kind),
      result_item_id: null,
      isolation: spec.requires_agent ? "仅发送所选材料，无终端或文件写入工具" : "本机抽字，不调用模型",
      error: null,
      created_at: createdAt,
      finished_at: null,
    };
    const workNames: string[] = [];
    await this.files.write((writer) => {
      writer.mkdir(inputRoot);
      writer.mkdir(outputRoot);
      for (const item of items) {
        const name = uniqueName(item.name, (candidate) => writer.stat(`${inputRoot}/${candidate}`) !== null);
        if (item.kind === "folder") copyTree(writer, item.relative_path, `${inputRoot}/${name}`);
        else writer.copyFile(item.relative_path, `${inputRoot}/${name}`);
        workNames.push(name);
      }
      freezeReadOnly(writer, inputRoot);
      appendEvent(writer, jobRoot, "复制到只读 input/");
      writer.replaceFileAtomic(`${jobRoot}/manifest.json`, Buffer.from(`${JSON.stringify({
        id: jobId,
        recipe: spec.recipe,
        action: actionName,
        agent: spec.requires_agent ? "prologue" : localActor(items[0].kind),
        isolation: spec.requires_agent ? "model-input-only" : "none",
        items: items.map((item) => ({ id: item.item_id, title: item.name, checksum: item.origin_hash })),
      }, null, 2)}\n`));
      const catalog = this.catalog.read(writer);
      catalog.jobs.unshift(running);
      this.catalog.save(writer, catalog);
    });

    const controller = new AbortController(), key = jobKey(this.root, jobId);
    const lifetime = createExecutionLifetime({ signal: control?.signal ? AbortSignal.any([control.signal, controller.signal]) : controller.signal,
      timeout: { milliseconds: SHELF_JOB_TIMEOUT_MS, reason: shelfErrors.job_timeout("任务超时，未继续保存结果") } });
    activeJobs.set(key, controller);
    const assertCurrent = () => {
      const current = this.catalog.read();
      if (spec.requires_agent && (JSON.stringify(normalizeSettings(current.settings).model_selection) !== JSON.stringify(settings.model_selection)
        || (shortcut && JSON.stringify(normalizeSettings(current.settings).shortcuts.find(row => row.id === shortcut.id)) !== JSON.stringify(shortcut)))) {
        throw shelfErrors.configuration_changed("生成期间模型选择或快捷动作已变化，结果未保存");
      }
      if (current.jobs.find(job => job.job_id === jobId)?.status !== "running") throw shelfErrors.cancelled("任务已取消");
      for (const [index, item] of items.entries()) {
        const latest = requireShelfItem(current, item.item_id);
        if (latest.hidden || latest.relative_path !== item.relative_path) throw shelfErrors.item_not_found("材料已收起或改变，未保存结果");
        this.assertOriginUntouched(latest);
        if (this.contentHash(latest) !== copyHashes.get(item.item_id)
          || this.contentHash(item, `${inputRoot}/${workNames[index]}`) !== copyHashes.get(item.item_id)) throw shelfErrors.hash_changed("架子上的副本 Hash 已变化，已停止写入");
      }
    };
    let validateResult: (() => void) | undefined;
    const beforeCommit = async () => {
      await lifetime.wait(Promise.resolve(control?.beforeEffect?.()));
      lifetime.assertActive(); assertCurrent(); validateResult?.();
    };

    let execution: ShelfJobRecord["execution"];
    let materialCoverage: readonly string[] | undefined;
    try {
      await beforeCommit();
      let output: string;
      if (spec.requires_agent) {
        const result = await lifetime.wait(this.ai!.generate({ recipe: spec.recipe as Exclude<ShelfRecipeId, "extract_text">,
          option_id: optionId, ...(shortcut ? { shortcut_prompt: shortcut.prompt } : {}), selection: ai.selected!, root: inputDir,
          sources: items.map((item, index) => ({ relative_path: workNames[index], name: item.name, kind: item.kind, mime: item.mime })),
        }, { signal: lifetime.signal, beforeEffect: beforeCommit }));
        validateResult = result.validateResult;
        execution = result.execution;
        materialCoverage = result.coverage;
        await beforeCommit();
        output = result.text;
      } else {
        const parts: string[] = [];
        for (const [index, item] of items.entries()) {
          const sourceName = item.kind === "pdf" ? "source.pdf" : path.extname(item.name) ? item.name : `source.${item.mime.slice("image/".length)}`;
          const extracted = await this.materials.extract!({ file_name: sourceName, bytes: readShelfCopy(this.files, `${inputRoot}/${workNames[index]}`) },
            { signal: lifetime.signal, pdfMode: "text", ...(item.kind === "image" ? { ocrLanguages: ocrLanguages(optionId) } : {}),
              timeoutMs: 60_000, limits: { maxBytes: 32 * 1024 * 1024 } });
          await beforeCommit();
          if (item.kind !== "image" && !extracted.text.trim()) throw shelfErrors.no_text("这份 PDF 没有可抽取的文字");
          const body = item.kind === "image" ? ocrMarkdown([{ name: item.name,
            lines: extracted.pages.flatMap(page => page.lines ?? (page.text ? [{ text: page.text, confidence: null }] : [])) }]) + extractionNote(extracted) : extractionText(extracted);
          parts.push(items.length > 1 ? `## ${item.name}\n\n${body}` : item.kind === "image" ? body : markdownFromExtract(item.name, body));
        }
        output = parts.join("\n\n");
      }
      await this.files.write((writer) => {
        writer.replaceFileAtomic(outputFile, Buffer.from(output));
        appendEvent(writer, jobRoot, "写入 output/");
        unlockDirectories(writer, inputRoot);
      });
      const result = await this.storeResult({
        outputFile,
        outputName,
        jobId,
        sourceItemIds: items.map((item) => item.item_id),
        status: "done",
        coverage: materialCoverage,
      });
      const finished: ShelfJobRecord = {
        ...running,
        ...(execution ? { execution } : {}),
        ...(materialCoverage?.length ? { material_coverage: materialCoverage } : {}),
        status: "succeeded",
        result_item_id: result.item_id,
        finished_at: now(),
      };
      await this.update((next) => { next.jobs = next.jobs.map((job) => job.job_id === jobId ? finished : job); });
      return { job: finished, result, origin_hash: items[0].origin_hash };
    } catch (error) {
      await this.unlock(inputRoot);
      await beforeCommit();
      if (isShelfFailure(error) && error.code === "shelf.configuration_changed") throw error;
      const cancelled = isShelfFailure(error) && error.code === "shelf.cancelled";
      const reason = failureCopy(error);
      const closed: ShelfJobRecord = {
        ...running,
        ...((isShelfFailure(error) ? error.execution : execution) ? { execution: isShelfFailure(error) ? error.execution : execution } : {}),
        status: cancelled ? "cancelled" : "failed",
        error: cancelled ? null : reason,
        finished_at: now(),
      };
      await this.update((next) => { next.jobs = next.jobs.map((job) => job.job_id === jobId ? closed : job); });
      // A cancel leaves the shelf as it was; a failure leaves a row saying why.
      if (!cancelled) {
        await this.storeResult({
          outputFile: null,
          outputName,
          jobId,
          sourceItemIds: items.map((item) => item.item_id),
          status: "failed",
          failureReason: reason,
        });
      }
      throw isShelfFailure(error) ? error : shelfErrors.job_failed(reason);
    } finally {
      activeJobs.delete(key);
      lifetime.dispose();
      await this.unlock(inputRoot);
    }
  }

  /** Puts the job's copied inputs back to writable folders, so cleanup later can remove them. */
  private unlock(inputRoot: string): Promise<void> {
    return this.files.write((writer) => { unlockDirectories(writer, inputRoot); });
  }

  private requireRecipe(recipe: ShelfRecipeId) {
    try {
      return shelfRecipeSpec(recipe);
    } catch {
      throw shelfErrors.recipe_unavailable("这个动作不存在");
    }
  }

  /**
   * The deliverable becomes a shelf copy of its own, so results survive job
   * cleanup. An authorized failure files its reason, without exposing an invalid partial result.
   */
  private storeResult(options: {
    outputFile: string | null;
    outputName: string;
    jobId: string;
    sourceItemIds: readonly string[];
    status: "done" | "failed";
    failureReason?: string | null;
    coverage?: readonly string[];
  }): Promise<ShelfItemRecord> {
    return this.files.write((writer) => {
      const catalog = this.catalog.read(writer);
      const taken = catalog.items.filter((item) => item.group === "result").map((item) => item.name);
      const name = uniqueTitle(options.outputName, taken);
      const resultId = shelfId("item");
      const kind = resultKind(name);
      let relative = "";
      let bytes: Buffer | null = null;
      if (options.outputFile && writer.stat(options.outputFile)) {
        relative = `files/${resultId}/${name}`;
        writer.copyFile(options.outputFile, relative);
        bytes = readShelfCopy(writer, relative);
      }
      const result: StoredItem = {
        item_id: resultId,
        group: "result",
        kind,
        name,
        relative_path: relative,
        mime: resultMime(name),
        size_bytes: bytes?.byteLength ?? 0,
        origin_hash: bytes ? sha256(bytes) : "",
        copy_hash: bytes ? sha256(bytes) : "",
        hidden: false,
        created_at: now(),
        source_item_id: options.sourceItemIds[0] ?? null,
        source_item_ids: [...options.sourceItemIds],
        job_id: options.jobId,
        preview_text: bytes ? previewFor(kind, bytes) : null,
        children: [],
        status: options.status,
        failure_reason: options.failureReason ?? null,
        ...(options.coverage?.length ? { material_coverage: options.coverage } : {}),
        origin_realpath: null,
      };
      catalog.items.unshift(result);
      this.catalog.save(writer, catalog);
      return publicItem(result);
    });
  }

  /** Stop a run from another request; the materials stay, no result is filed. */
  async cancelJob(jobId: string): Promise<ShelfJobRecord> {
    const job = this.catalog.read(this.files).jobs.find((entry) => entry.job_id === jobId);
    if (!job) throw shelfErrors.item_not_found("这个任务不存在");
    if (job.status !== "running") return job;
    activeJobs.get(jobKey(this.root, jobId))?.abort(shelfErrors.cancelled("任务已取消"));
    // Decided on the row the write finds: a run that finished in the meantime keeps its own record.
    return this.files.write((writer) => {
      const catalog = this.catalog.read(writer);
      const live = catalog.jobs.find((entry) => entry.job_id === jobId);
      if (!live) throw shelfErrors.item_not_found("这个任务不存在");
      if (live.status !== "running") return live;
      const cancelled: ShelfJobRecord = { ...live, status: "cancelled", finished_at: now() };
      catalog.jobs = catalog.jobs.map((entry) => entry.job_id === jobId ? cancelled : entry);
      this.catalog.save(writer, catalog);
      return cancelled;
    });
  }

  async writeCopy(itemId: string, text: string, expectedContentHash: string): Promise<ShelfItemRecord> {
    return this.files.write((writer) => {
      const catalog = this.catalog.read(writer);
      const item = requireShelfItem(catalog, itemId);
      if (item.hidden) throw shelfErrors.item_not_found("这份材料不在架子上");
      if (!isEditableShelfItem(item)) throw shelfErrors.not_text("这份材料不能编辑");
      if (text.includes("\0")) throw shelfErrors.not_text("这份材料不能编辑");
      const bytes = Buffer.from(text, "utf8");
      if (bytes.byteLength > MAX_EDIT_BYTES) throw shelfErrors.too_large("文件超过 512 KB");
      if (!item.relative_path) throw shelfErrors.missing_output("这次没有生成文件");
      if (!/^[a-f0-9]{64}$/.test(expectedContentHash) || sha256(readShelfCopy(writer,item.relative_path))!==expectedContentHash)throw shelfErrors.conflict('副本已变化，请保留输入并重新读取后编辑');
      const digest=sha256(bytes),relative=`files/${item.item_id}/versions/${digest}/${item.name}`;
      if(writer.stat(relative)){if(sha256(readShelfCopy(writer,relative))!==digest)throw shelfErrors.invalid_file('已有副本字节不符');}
      else {writer.mkdir(path.posix.dirname(relative));writer.writeFile(relative,bytes,'create');}
      item.relative_path=relative;item.copy_hash=digest;
      item.size_bytes = bytes.byteLength;
      item.preview_text = previewFor(item.kind, bytes);
      this.catalog.save(writer, catalog);
      return publicItem(item);
    });
  }

  async useAsMaterial(itemId: string): Promise<ShelfItemRecord> {
    const item = requireShelfItem(this.catalog.read(this.files), itemId);
    if (item.group !== "result") throw shelfErrors.not_result("只有生成结果可以再用作材料");
    if (!item.relative_path) throw shelfErrors.missing_output("这次没有生成文件");
    const bytes = readShelfCopy(this.files, item.relative_path);
    return this.admit({ filename: item.name, bytes, mime: item.mime }, item.preview_text);
  }

  async addClipboard(
    body: string,
    options: { concealed?: boolean; types?: readonly string[] } = {},
  ): Promise<ShelfClipboardRecord | null> {
    if (options.concealed || isConcealedClipboard(options.types ?? [])) {
      await this.update((catalog) => {
        catalog.current_clip_id = null;
      });
      return null;
    }
    const text = clipText(body);
    if (!text || isFileUrl(text)) {
      await this.update((catalog) => {
        catalog.current_clip_id = null;
      });
      return null;
    }
    const kind = isHttpUrl(text) ? "url" : "text";
    const fingerprint = clipFingerprint(kind, text);
    const title = clipTitleFor(kind, text);
    let recorded: ShelfClipboardRecord | null = null;
    await this.update((catalog) => {
      const existing = catalog.clipboard.find((entry) => entry.fingerprint === fingerprint);
      if (existing) {
        const moved: ShelfClipboardRecord = {
          ...existing,
          kind,
          title,
          body: text,
          created_at: now(),
          fingerprint,
        };
        catalog.clipboard = [moved, ...catalog.clipboard.filter((entry) => entry.clip_id !== existing.clip_id)];
        catalog.current_clip_id = moved.clip_id;
        recorded = moved;
        return;
      }
      const clip: ShelfClipboardRecord = {
        clip_id: shelfId("clip"),
        kind,
        title,
        body: text,
        created_at: now(),
        fingerprint,
      };
      catalog.clipboard = [clip, ...catalog.clipboard].slice(0, CLIPBOARD_LIMIT);
      catalog.current_clip_id = clip.clip_id;
      recorded = clip;
    });
    if (!recorded) throw shelfErrors.empty_file("剪贴板是空的");
    return recorded;
  }

  async deleteClipboard(clipId: string): Promise<void> {
    await this.update((catalog) => {
      const exists = catalog.clipboard.some((entry) => entry.clip_id === clipId);
      if (!exists) throw shelfErrors.item_not_found("这条剪贴板不存在");
      catalog.clipboard = catalog.clipboard.filter((entry) => entry.clip_id !== clipId);
      if (catalog.current_clip_id === clipId) catalog.current_clip_id = null;
    });
  }

  async clipboardToMaterial(clipId: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord> {
    const clip = this.catalog.read().clipboard.find((entry) => entry.clip_id === clipId);
    if (!clip) throw shelfErrors.item_not_found("这条剪贴板不存在");
    const assertCurrent = () => {
      const latest = this.catalog.read().clipboard.find(entry => entry.clip_id === clipId);
      if (!latest || latest.fingerprint !== clip.fingerprint) throw shelfErrors.item_not_found("这条剪贴板已删除或改变，未保存材料");
    };
    return this.admitCapturedText(clip.body, clip.title, true, control, assertCurrent);
  }

  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer } {
    const item = requireShelfItem(this.catalog.read(), itemId);
    if (!item.relative_path) throw shelfErrors.missing_output("这次没有生成文件");
    return { item: publicItem(item), bytes: readShelfCopy(this.files, item.relative_path) };
  }

  private async ensureSample(catalog: CatalogFile): Promise<CatalogFile> {
    if (catalog.seeded_sample || catalog.items.length > 0) {
      return catalog;
    }
    await this.seedSample();
    return this.catalog.read(this.files);
  }

  /** A file hashes its bytes; a folder hashes every path and file under it. */
  private contentHash(item: StoredItem, relative = item.relative_path): string {
    if (item.kind !== "folder") return sha256(readShelfCopy(this.files, relative));
    const digest = createHash("sha256");
    const walk = (directory: string, prefix: string): void => {
      for (const entry of this.files.list(directory)) {
        const full = `${directory}/${entry.name}`;
        const nested = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === "directory") walk(full, nested);
        else digest.update(`${nested}:${sha256(readShelfCopy(this.files, full))}\n`);
      }
    };
    walk(relative, "");
    return digest.digest("hex");
  }

  private assertOriginUntouched(item: StoredItem): void {
    if (item.kind === "folder") return;
    if (!item.origin_realpath || !existsSync(item.origin_realpath)) return;
    if (sha256(readFileSync(item.origin_realpath)) !== item.origin_hash) {
      throw shelfErrors.origin_changed("原件 Hash 已变化，已停止这次任务");
    }
  }


  /** Reads the catalog inside the write, changes it, and saves it: the change is made on what is there now. */
  private async update(mutate: (catalog: CatalogFile) => void): Promise<void> {
    await this.files.write((writer) => {
      const catalog = this.catalog.read(writer);
      mutate(catalog);
      this.catalog.save(writer, catalog);
    });
  }

}

/** `root` is the real folder behind `files`; the Host that supplies both keeps them the same place. */
export function openShelfStore(root: string, files: PluginOwnerFilesClient, probe: ShelfRuntimeProbe = {}, materials: ShelfMaterialPorts = {}, ai?: ShelfAiPorts, sync?: ShelfSyncOptions): ShelfStore {
  return new ShelfStore(root, files, probe, materials, ai,sync);
}

async function beforeShelfEffect(control?: ShelfExecutionControl): Promise<void> {
  await control?.beforeEffect?.();
  control?.signal?.throwIfAborted();
}

export function hashBytes(bytes: Uint8Array): string {
  return sha256(Buffer.from(bytes));
}

export function isConcealedClipboard(types: readonly string[] = []): boolean {
  return types.some((type) => /org\.nspasteboard\.(concealedtype|autogeneratedtype|transienttype)/iu.test(type));
}

export function isHttpUrl(text: string): boolean {
  try {
    const protocol = new URL(text.trim()).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function clipFingerprint(kind: "text" | "url", body: string): string {
  return kind === "url" ? `u:${body}` : `t:${sha256(Buffer.from(body, "utf8"))}`;
}

export function isEditableShelfItem(item: { kind: ShelfItemKind; name: string; size_bytes: number }): boolean {
  if (item.size_bytes > MAX_EDIT_BYTES) return false;
  if (item.kind === "pdf" || item.kind === "image" || item.kind === "folder" || item.kind === "url" || item.kind === "website") {
    return false;
  }
  const ext = path.extname(item.name).slice(1).toLowerCase();
  if (ext === "html" || ext === "htm") return false;
  if (item.kind === "markdown" || item.kind === "text") return true;
  return TEXT_EDIT_EXTENSIONS.has(ext);
}

export function clipTitleFor(kind: "text" | "url", body: string): string {
  if (kind === "url") {
    try {
      const host = new URL(body).hostname;
      if (host) return host;
    } catch {
      /* fall through to text title */
    }
  }
  const line = body.replace(/\s+/gu, " ").trim();
  if (!line) return "文本";
  if (line.length <= 40) return line;
  return `${line.slice(0, 40).trim()}…`;
}

function publicItem(item: StoredItem): ShelfItemRecord {
  const { origin_realpath: _origin,copy_hash:_copyHash, ...visible } = item;
  return visible;
}

function now(): string {
  return new Date().toISOString();
}

function safeFilename(value: string): string {
  const base = path.basename(value).replaceAll("\0", "").replaceAll("\\", "_").trim() || "untitled";
  if (base === "." || base === "..") return "untitled";
  return base.slice(0, 180);
}

function classify(filename: string, mime: string): ShelfItemKind {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/u.test(lower)) return "image";
  if (mime === "text/x-shelf-website") return "website";
  if (mime === "text/uri-list" || mime === "text/x-uri" || lower.endsWith(".url")) return "url";
  if (lower.endsWith(".md") || mime === "text/markdown") return "markdown";
  if (mime.startsWith("text/") || lower.endsWith(".txt")) return "text";
  return "file";
}

function mimeFor(kind: ShelfItemKind, filename: string): string {
  if (kind === "pdf") return "application/pdf";
  if (kind === "markdown") return "text/markdown";
  if (kind === "text") return "text/plain";
  if (kind === "url") return "text/uri-list";
  if (kind === "website") return "text/x-shelf-website";
  if (kind === "image") return filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return "application/octet-stream";
}

function previewFor(kind: ShelfItemKind, bytes: Buffer): string | null {
  if (kind === "text" || kind === "markdown" || kind === "url" || kind === "website") return bytes.toString("utf8").slice(0, 20_000);
  return null;
}

function extractionText(extracted: MaterialExtraction): string {
  return extracted.text + extractionNote(extracted);
}
function extractionNote(extracted: MaterialExtraction): string {
  const incomplete = extracted.coverage.status !== "sufficient" || extracted.coverage.truncated;
  return incomplete ? `\n\n提取说明：${extracted.coverage.issues.join("；") || "仅提取了部分内容，请核对原件"}` : "";
}

function normalizeSettings(raw: unknown): ShelfDeviceSettings {
  return normalizeShelfSettings(raw);
}

function clipText(body: string): string {
  const trimmed = body.trim();
  const bytes = Buffer.from(trimmed, "utf8");
  if (bytes.byteLength <= MAX_CLIP_TEXT_BYTES) return trimmed;
  return bytes.subarray(0, MAX_CLIP_TEXT_BYTES).toString("utf8");
}

function isFileUrl(text: string): boolean {
  return /^file:/iu.test(text);
}

/** DropAgent `JobWorkspace.uniqueURL`: never overwrite a name already in the folder. */
function uniqueName(preferred: string, taken: (candidate: string) => boolean): string {
  const base = preferred.replace(/\.[^.]+$/u, "");
  const extension = path.extname(preferred);
  let candidate = preferred;
  let index = 2;
  while (taken(candidate)) {
    candidate = `${base}-${index}${extension}`;
    index += 1;
  }
  return candidate;
}

/** DropAgent `ResultRecord.uniqueTitle`: summary.md, then summary-2.md. */
function uniqueTitle(preferred: string, taken: readonly string[]): string {
  const base = preferred.replace(/\.[^.]+$/u, "");
  const extension = path.extname(preferred);
  let candidate = preferred;
  let index = 2;
  while (taken.includes(candidate)) {
    candidate = `${base}-${index}${extension}`;
    index += 1;
  }
  return candidate;
}

/**
 * `input/` is the frozen source copy consumed by the Host. The
 * folder itself is locked only while the job runs, so ordinary cleanup later
 * still works; the files stay read-only.
 */
function freezeReadOnly(writer: PluginOwnerFilesWriter, target: string): void {
  const stat = writer.stat(target);
  if (!stat) return;
  if (stat.kind === "directory") {
    for (const entry of writer.list(target)) freezeReadOnly(writer, `${target}/${entry.name}`);
  }
  writer.setAccess(target, "readonly");
}

function unlockDirectories(writer: PluginOwnerFilesWriter, target: string): void {
  if (writer.stat(target)?.kind !== "directory") return;
  writer.setAccess(target, "readwrite");
  for (const entry of writer.list(target)) unlockDirectories(writer, `${target}/${entry.name}`);
}

function thawTree(writer: PluginOwnerFilesWriter, target: string): void {
  const stat = writer.stat(target);
  if (!stat) return;
  writer.setAccess(target, "readwrite");
  if (stat.kind !== "directory") return;
  for (const entry of writer.list(target)) thawTree(writer, `${target}/${entry.name}`);
}



/** The event log grows by whole-file replacement: read what is there now, add one line, swap the file in. */
function appendEvent(writer: PluginOwnerFilesWriter, jobRoot: string, message: string): void {
  const file = `${jobRoot}/events.jsonl`;
  const before = writer.read(file);
  const line = Buffer.from(`${JSON.stringify({ message })}\n`);
  writer.replaceFileAtomic(file, before ? Buffer.concat([Buffer.from(before), line]) : line);
}

/** Folder entries stay inside the folder: no absolute paths, no `..`. */
function safeRelative(value: string): string {
  const parts = String(value ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.map((part) => part.replaceAll("\0", "").replaceAll("\\", "_")).join("/");
}

function copyTree(writer: PluginOwnerFilesWriter, source: string, target: string): void {
  const stat = writer.stat(source);
  if (!stat) throw shelfErrors.missing_output("这份副本的文件已不在架子上，请重新放入");
  if (stat.kind === "file") {
    writer.copyFile(source, target);
    return;
  }
  writer.mkdir(target);
  for (const entry of writer.list(source)) copyTree(writer, `${source}/${entry.name}`, `${target}/${entry.name}`);
}

function localActor(kind: ShelfItemKind): string {
  if (kind === "pdf") return "pdfkit";
  return kind === "image" ? "vision" : "local";
}

function resultKind(name: string): ShelfItemKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".json") || lower.endsWith(".txt")) return "text";
  if (/\.(png|jpe?g|gif|webp|heic)$/u.test(lower)) return "image";
  if (lower.endsWith(".pdf")) return "pdf";
  return "file";
}

function resultMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain";
  return mimeFor(resultKind(name), name);
}

/** DropAgent `JobService.failureCopy`: one plain reason, never a stack. */
function failureCopy(error: unknown): string {
  if (isShelfFailure(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "任务失败";
}
