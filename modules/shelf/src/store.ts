import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
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
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { ShelfError } from "./errors.js";
import { extractLocalText, markdownFromExtract, resultNameForExtract } from "./extract.js";
import {
  cancelAgentProcess,
  collectRecipeOutput,
  hasDeliverable,
  runAgentProcess,
  SHELF_JOB_TIMEOUT_MS,
} from "./job-runner.js";
import { imageTextAvailable, ocrLanguages, ocrMarkdown, recognizeImageText } from "./ocr.js";
import { SAMPLE_PDF_TEXT, createExtractablePdf } from "./pdf.js";
import { captureWebsite, websiteFilename, WEBSITE_MIME } from "./website.js";
import {
  fileGuardrail,
  recipeAvailability,
  recipePrompt,
  resolvedChoiceId,
  shelfRecipeSpec,
  SHELF_RECIPES,
} from "./recipes.js";
import {
  detectShelfRuntime,
  emptyShelfRuntime,
  headlessArguments,
  missingJobReason,
  NO_AGENT_REASON,
  readCliHelp,
  type ShelfRuntimeProbe,
} from "./runtimes.js";
import {
  defaultShelfDeviceSettings,
  mergeShelfSettings,
  normalizeShelfSettings,
  shortcutOutputName,
} from "./settings.js";

const CATALOG_VERSION = 1;
const SAMPLE_NAME = "试用示例.pdf";
export const CLIPBOARD_LIMIT = 10;
const MAX_CLIP_TEXT_BYTES = 256 * 1024;
export const MAX_EDIT_BYTES = 512 * 1024;
export const TEXT_EDIT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json",
  "swift", "py", "js", "ts", "mjs", "css",
  "yaml", "yml", "xml", "toml", "ini",
  "rs", "go", "rb", "sh", "zsh",
  "c", "h", "cc", "cpp", "m", "mm",
  "csv", "log",
]);
/** A CLI recipe runs only when the picked Agent has a headless job entry. */
function recipeTable(runtime: ShelfRuntimeStatus): readonly ShelfRecipeAvailability[] {
  const reason = runtime.runtime_key ? missingJobReason(runtime.title) : NO_AGENT_REASON;
  const available = runtime.can_run_job || runtime.capability_pending === true;
  return SHELF_RECIPES.map((spec) => recipeAvailability(spec.recipe, {
    available: spec.requires_agent ? available : true,
    reason: spec.requires_agent && !available ? reason : null,
  }));
}

interface StoredItem extends Omit<ShelfItemRecord, "hidden" | "size_bytes" | "preview_text"> {
  hidden: boolean;
  size_bytes: number;
  preview_text: string | null;
  origin_realpath: string | null;
}

interface CatalogFile {
  version: number;
  seeded_sample: boolean;
  items: StoredItem[];
  jobs: ShelfJobRecord[];
  clipboard: ShelfClipboardRecord[];
  current_clip_id: string | null;
  settings: ShelfDeviceSettings;
}

function assertNotBusy(catalog: CatalogFile, itemId: string): void {
  const busy = catalog.jobs.some((job) => (
    job.status === "running"
    && !isStaleJob(job)
    && (job.item_ids.includes(itemId) || job.item_id === itemId || job.result_item_id === itemId)
  ));
  if (busy) throw new ShelfError("shelf.busy", "运行中不能隐藏或删除");
}

/** A job the process never finished stops blocking once it cannot still be alive. */
function isStaleJob(job: ShelfJobRecord): boolean {
  const started = Date.parse(job.created_at);
  if (Number.isNaN(started)) return true;
  return Date.now() - started > SHELF_JOB_TIMEOUT_MS * 2;
}

function safeInside(root: string, target: string): string {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new ShelfError("shelf.path_invalid", "删除路径不在架子内");
  }
  return resolved;
}

export class ShelfStore {
  private readonly probe: ShelfRuntimeProbe;

  constructor(readonly root: string, probe: ShelfRuntimeProbe = {}) {
    this.probe = probe;
    mkdirSync(path.join(root, "files"), { recursive: true });
    mkdirSync(path.join(root, "jobs"), { recursive: true });
  }

  /** The terminal Agent a recipe would run in. Never throws at the caller. */
  runtime(settings: ShelfDeviceSettings = this.settings(), probeCapabilities = false): ShelfRuntimeStatus {
    const image_text = imageTextAvailable();
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
    return normalizeSettings(this.readCatalog().settings);
  }

  saveSettings(patch: ShelfSettingsPatch): ShelfDeviceSettings {
    this.update((catalog) => {
      catalog.settings = normalizeSettings(mergeShelfSettings(normalizeSettings(catalog.settings), patch));
    });
    return this.settings();
  }

  snapshot(): ShelfSnapshot {
    const catalog = this.ensureSample(this.readCatalog());
    const visible = (group: StoredItem["group"]) =>
      catalog.items.filter((item) => item.group === group && !item.hidden).map(publicItem);
    const settings = normalizeSettings(catalog.settings);
    const runtime = this.runtime(settings);
    return {
      materials: visible("material"),
      results: visible("result"),
      clipboard: catalog.clipboard.slice(0, CLIPBOARD_LIMIT),
      recipes: recipeTable(runtime),
      current_clip_id: catalog.current_clip_id,
      runtime,
      running_jobs: catalog.jobs.filter((job) => job.status === "running" && !isStaleJob(job)),
      settings,
      root: this.root,
    };
  }

  admit(input: ShelfAdmitInput): ShelfItemRecord {
    // A retry returns the existing copy, preserving any user edits. Hidden copies
    // can be explicitly received again; deleted copies are new admissions.
    if (input.artifact_source) {
      const source = input.artifact_source;
      const original = this.readCatalog().items.find(item => item.artifact_source?.board_id === source.board_id
        && item.artifact_source.project_path === source.project_path
        && item.artifact_source.reference.artifact_id === source.reference.artifact_id
        && item.artifact_source.reference.version === source.reference.version);
      if (original) {
        if (original.artifact_source!.content_hash !== source.content_hash) throw new ShelfError("shelf.source_conflict", "同一成果版本的内容不一致，未覆盖已有副本");
        if (!existsSync(this.absolute(original))) throw new ShelfError("shelf.missing_output", "原接收副本已不可读，请先在 Shelf 核对处理");
        if (original.hidden) this.update(catalog => { this.requireItem(catalog, original.item_id).hidden = false; });
        return publicItem({ ...original, hidden: false });
      }
    }
    const filename = safeFilename(input.filename);
    const bytes = Buffer.from(input.bytes);
    if (!bytes.byteLength) throw new ShelfError("shelf.empty_file", "没有可加入的文件内容");
    if (bytes.byteLength > 32 * 1024 * 1024) throw new ShelfError("shelf.too_large", "文件超过 32 MB");
    const kind = classify(filename, input.mime ?? "");
    const itemId = this.id("item");
    const relative = path.join("files", itemId, filename);
    const abs = path.join(this.root, relative);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    const originHash = sha256(bytes);
    const originRealpath = input.origin_realpath ? path.resolve(input.origin_realpath) : null;
    const preview = previewFor(kind, bytes);
    const item: StoredItem = {
      item_id: itemId,
      ...(input.artifact_source ? { artifact_source: structuredClone(input.artifact_source) } : {}),
      group: "material",
      kind,
      name: filename,
      relative_path: relative,
      mime: input.mime || mimeFor(kind, filename),
      size_bytes: bytes.byteLength,
      origin_hash: originHash,
      hidden: false,
      created_at: now(),
      source_item_id: null,
      source_item_ids: [],
      job_id: null,
      preview_text: preview,
      status: "done",
      failure_reason: null,
      children: [],
      origin_realpath: originRealpath,
    };
    this.update((catalog) => {
      catalog.items.unshift(item);
      catalog.seeded_sample = true;
    });
    return publicItem(item);
  }

  /**
   * A folder comes in whole: every file keeps its place under one shelf item.
   * The directory shows the children inline, never a second file browser.
   */
  admitFolder(input: ShelfAdmitFolderInput): ShelfItemRecord {
    const folderName = safeFilename(input.name);
    const entries = input.entries
      .map((entry) => ({ ...entry, relative: safeRelative(entry.relative) }))
      .filter((entry) => entry.relative && entry.bytes.byteLength > 0);
    if (!entries.length) throw new ShelfError("shelf.empty_file", "这个文件夹里没有可以加入的文件");
    const total = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
    if (total > 64 * 1024 * 1024) throw new ShelfError("shelf.too_large", "这个文件夹超过 64 MB");
    const itemId = this.id("item");
    const relative = path.join("files", itemId, folderName);
    const root = path.join(this.root, relative);
    const children: ShelfFolderChild[] = [];
    const digest = createHash("sha256");
    for (const entry of entries) {
      const target = path.join(root, entry.relative);
      if (!target.startsWith(`${root}${path.sep}`)) throw new ShelfError("shelf.path_invalid", "文件夹里有越界的路径");
      mkdirSync(path.dirname(target), { recursive: true });
      const bytes = Buffer.from(entry.bytes);
      writeFileSync(target, bytes);
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
    this.update((catalog) => {
      catalog.items.unshift(item);
      catalog.seeded_sample = true;
    });
    return publicItem(item);
  }

  /** Read one file inside a staged folder. */
  readChild(itemId: string, relative: string): { name: string; mime: string; bytes: Buffer } {
    const item = this.requireItem(this.readCatalog(), itemId);
    if (item.kind !== "folder") throw new ShelfError("shelf.item_not_found", "这不是一个文件夹");
    const child = item.children.find((entry) => entry.relative === relative);
    if (!child) throw new ShelfError("shelf.item_not_found", "这个文件不在这个文件夹里");
    const root = path.join(this.root, item.relative_path);
    const file = safeInside(root, path.join(root, child.relative));
    return { name: child.name, mime: mimeFor(child.kind, child.name), bytes: readFileSync(file) };
  }

  /**
   * A link is captured as a page; everything else lands as text. The wheel's
   * 发给终端 asks for `capture: false`, the way DropAgent sends the link itself.
   */
  async admitText(body: string, title = "粘贴文字", capture = true): Promise<ShelfItemRecord> {
    const text = body.trim();
    if (!text) throw new ShelfError("shelf.empty_file", "剪贴板是空的");
    if (isHttpUrl(text) && !capture) {
      return this.admit({
        filename: `${safeFilename(clipTitleFor("url", text))}.url`,
        bytes: Buffer.from(text, "utf8"),
        mime: "text/uri-list",
      });
    }
    if (isHttpUrl(text)) return this.admitUrl(text);
    const filename = `${safeFilename(title.slice(0, 40) || "paste")}.md`;
    return this.admit({ filename, bytes: Buffer.from(text, "utf8"), mime: "text/markdown" });
  }

  /** DropAgent fetches the page itself; a failed fetch still shelves the link. */
  async admitUrl(url: string): Promise<ShelfItemRecord> {
    const page = await captureWebsite(url);
    return this.admit({
      filename: safeFilename(websiteFilename(page.title, page.url)),
      bytes: Buffer.from(page.markdown, "utf8"),
      mime: WEBSITE_MIME,
    });
  }

  seedSample(): ShelfItemRecord {
    const catalog = this.readCatalog();
    const existing = catalog.items.find((item) => item.name === SAMPLE_NAME && item.group === "material" && !item.hidden);
    if (existing) return publicItem(existing);
    const item = this.admit({
      filename: SAMPLE_NAME,
      bytes: createExtractablePdf(SAMPLE_PDF_TEXT),
      mime: "application/pdf",
    });
    this.update((next) => {
      next.seeded_sample = true;
    });
    return item;
  }

  hide(itemId: string): void {
    this.update((catalog) => {
      const item = this.requireItem(catalog, itemId);
      assertNotBusy(catalog, itemId);
      item.hidden = true;
    });
  }

  deleteCopy(itemId: string): void {
    const catalog = this.readCatalog();
    const item = this.requireItem(catalog, itemId);
    assertNotBusy(catalog, item.item_id);
    const copyDir = item.relative_path
      ? safeInside(path.join(this.root, "files"), path.join(this.root, path.dirname(item.relative_path)))
      : null;
    const jobDir = item.job_id
      ? safeInside(path.join(this.root, "jobs"), path.join(this.root, "jobs", item.job_id))
      : null;
    this.update((next) => {
      next.items = next.items.filter((entry) => entry.item_id !== itemId);
    });
    if (copyDir) rmSync(copyDir, { recursive: true, force: true });
    if (jobDir && existsSync(jobDir)) {
      thawTree(jobDir);
      rmSync(jobDir, { recursive: true, force: true });
    }
  }

  /**
   * DropAgent `JobService.start`: copy the materials into `input/` and `work/`,
   * run the picked Agent (or the on-device extractor) on the copy, collect one
   * deliverable, then check the original is still byte for byte what it was.
   */
  async runJob(input: ShelfRunJobInput): Promise<ShelfJobOutcome> {
    const spec = this.requireRecipe(input.recipe);
    const settings = this.settings();
    const shortcut = input.recipe === "shortcut"
      ? settings.shortcuts.find((action) => action.id === (input.shortcut_id ?? ""))
      : undefined;
    if (input.recipe === "shortcut" && !shortcut) {
      throw new ShelfError("shelf.recipe_unavailable", "这个快捷动作已经不在了");
    }
    const accepts = shortcut ? shortcut.kinds : spec.accepts;
    const actionName = shortcut ? shortcut.name : spec.label;
    const itemIds = input.item_ids?.length ? [...input.item_ids] : input.item_id ? [input.item_id] : [];
    if (!itemIds.length) throw new ShelfError("shelf.empty_selection", "请先选择一份材料");
    const catalog = this.readCatalog();
    const items = itemIds.map((id) => this.requireItem(catalog, id));
    for (const item of items) {
      if (item.group !== "material" || item.hidden) throw new ShelfError("shelf.item_not_found", "请先选择一份材料");
      if (!accepts.includes(item.kind)) {
        throw new ShelfError("shelf.recipe_unavailable", `选中的材料不能用「${shortcut ? shortcut.name : spec.short_title}」`);
      }
    }
    if (items.length < spec.minimum_count) {
      throw new ShelfError("shelf.recipe_unavailable", `「${spec.short_title}」至少要两份材料`);
    }
    const runtime = this.runtime(settings, spec.requires_agent);
    if (spec.requires_agent && !runtime.can_run_job) {
      throw new ShelfError("shelf.no_agent", runtime.runtime_key ? missingJobReason(runtime.title) : NO_AGENT_REASON);
    }
    const optionId = spec.choices.length ? resolvedChoiceId(spec.recipe, input.option_id) : null;
    const copyHashes = new Map<string, string>();
    for (const item of items) {
      this.assertOriginUntouched(item);
      copyHashes.set(item.item_id, this.contentHash(item));
    }

    const jobId = this.id("job");
    const jobRoot = path.join(this.root, "jobs", jobId);
    const inputDir = path.join(jobRoot, "input");
    const workDir = path.join(jobRoot, "work");
    const outputDir = path.join(jobRoot, "output");
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    const workNames: string[] = [];
    for (const item of items) {
      const source = this.absolute(item);
      const name = uniqueName(workDir, item.name);
      if (item.kind === "folder") {
        copyTree(source, path.join(inputDir, name));
        copyTree(source, path.join(workDir, name));
      } else {
        copyFileSync(source, path.join(inputDir, name));
        copyFileSync(source, path.join(workDir, name));
      }
      workNames.push(name);
    }
    freezeReadOnly(inputDir);
    appendEvent(jobRoot, "复制到 input/ 与 work/");
    writeFileSync(path.join(jobRoot, "manifest.json"), `${JSON.stringify({
      id: jobId,
      recipe: spec.recipe,
      action: actionName,
      agent: spec.requires_agent ? runtime.runtime_key : localActor(items[0].kind),
      isolation: spec.requires_agent ? runtime.isolation : "none",
      items: items.map((item) => ({ id: item.item_id, title: item.name, checksum: item.origin_hash })),
    }, null, 2)}\n`);

    const outputName = shortcut
      ? shortcutOutputName(items[0].name, shortcut.name)
      : this.outputNameFor(spec.recipe, items[0].kind);
    const outputFile = path.join(outputDir, outputName);
    const createdAt = now();
    const running: ShelfJobRecord = {
      job_id: jobId,
      recipe: spec.recipe,
      status: "running",
      item_id: items[0].item_id,
      item_ids: items.map((item) => item.item_id),
      option_id: optionId,
      runtime: spec.requires_agent ? runtime.runtime_key : localActor(items[0].kind),
      result_item_id: null,
      isolation: spec.requires_agent ? runtime.isolation_fact : "本机抽字，不调用 Agent",
      error: null,
      created_at: createdAt,
      finished_at: null,
    };
    this.update((next) => {
      next.jobs.unshift(running);
    });

    try {
      if (spec.requires_agent) {
        const promptFile = path.join(jobRoot, "prompt.txt");
        const listed = workNames.map((name) => `- ${name}`).join("\n");
        const body = shortcut
          ? `${fileGuardrail(outputName)}\n${shortcut.prompt}\n`
          : recipePrompt(spec.recipe, optionId);
        const prompt = `${body}\n材料：\n${listed}\n`;
        writeFileSync(promptFile, prompt);
        const help = readCliHelp(runtime.executable);
        const args = headlessArguments(runtime.runtime_key, help, {
          kind: runtime.kind,
          workdir: workDir,
          promptFile,
          outputFile,
          prompt,
          isolation: runtime.isolation,
          network: spec.needs_network,
        });
        const result = await runAgentProcess({
          executable: runtime.executable,
          args,
          workdir: workDir,
          outputFile,
          jobId,
        });
        appendEvent(jobRoot, "收尾");
        collectRecipeOutput({
          outputFile,
          work: workDir,
          input: inputDir,
          inputNames: workNames,
          lastMessage: result.last_message,
        });
      } else if (items[0].kind === "image") {
        const languages = ocrLanguages(optionId);
        const pages = items.map((item, index) => ({
          name: item.name,
          lines: recognizeImageText(path.join(workDir, workNames[index]), languages),
        }));
        writeFileSync(outputFile, ocrMarkdown(pages));
      } else {
        const item = items[0];
        const text = extractLocalText(readFileSync(path.join(workDir, workNames[0])), item.kind, item.mime);
        writeFileSync(outputFile, markdownFromExtract(item.name, text));
      }
      appendEvent(jobRoot, "写入 output/");

      for (const item of items) {
        this.assertOriginUntouched(item);
        if (this.contentHash(item) !== copyHashes.get(item.item_id)) {
          throw new ShelfError("shelf.hash_changed", "架子上的副本 Hash 已变化，已停止写入");
        }
      }

      unlockDirectories(inputDir);
      const result = this.storeResult({
        outputFile,
        outputName,
        jobId,
        sourceItemIds: items.map((item) => item.item_id),
        status: "done",
      });
      const finished: ShelfJobRecord = {
        ...running,
        status: "succeeded",
        result_item_id: result.item_id,
        finished_at: now(),
      };
      this.update((next) => {
        next.jobs = next.jobs.map((job) => job.job_id === jobId ? finished : job);
      });
      return { job: finished, result, origin_hash: items[0].origin_hash };
    } catch (error) {
      unlockDirectories(inputDir);
      const cancelled = error instanceof ShelfError && error.code === "shelf.cancelled";
      const reason = failureCopy(error);
      const closed: ShelfJobRecord = {
        ...running,
        status: cancelled ? "cancelled" : "failed",
        error: cancelled ? null : reason,
        finished_at: now(),
      };
      this.update((next) => {
        next.jobs = next.jobs.map((job) => job.job_id === jobId ? closed : job);
      });
      // A cancel leaves the shelf as it was; a failure leaves a row saying why.
      if (!cancelled) {
        this.storeResult({
          outputFile: hasDeliverable(outputFile) ? outputFile : null,
          outputName,
          jobId,
          sourceItemIds: items.map((item) => item.item_id),
          status: "failed",
          failureReason: reason,
        });
      }
      throw error instanceof ShelfError ? error : new ShelfError("shelf.job_failed", reason);
    }
  }

  private requireRecipe(recipe: ShelfRecipeId) {
    try {
      return shelfRecipeSpec(recipe);
    } catch {
      throw new ShelfError("shelf.recipe_unavailable", "这个动作不存在");
    }
  }

  private outputNameFor(recipe: ShelfRecipeId, kind: ShelfItemKind): string {
    if (recipe !== "extract_text") return shelfRecipeSpec(recipe).output_file;
    return resultNameForExtract(kind);
  }

  /**
   * The deliverable becomes a shelf copy of its own, so results survive job
   * cleanup. A failed run still files a row: with its partial file when there
   * is one, otherwise with the reason alone and nothing to take away.
   */
  private storeResult(options: {
    outputFile: string | null;
    outputName: string;
    jobId: string;
    sourceItemIds: readonly string[];
    status: "done" | "failed";
    failureReason?: string | null;
  }): ShelfItemRecord {
    const taken = this.readCatalog().items.filter((item) => item.group === "result").map((item) => item.name);
    const name = uniqueTitle(options.outputName, taken);
    const resultId = this.id("item");
    const kind = resultKind(name);
    let relative = "";
    let bytes: Buffer | null = null;
    if (options.outputFile && existsSync(options.outputFile)) {
      relative = path.join("files", resultId, name);
      const absolute = path.join(this.root, relative);
      mkdirSync(path.dirname(absolute), { recursive: true });
      copyFileSync(options.outputFile, absolute);
      bytes = readFileSync(absolute);
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
      hidden: false,
      created_at: now(),
      source_item_id: options.sourceItemIds[0] ?? null,
      source_item_ids: [...options.sourceItemIds],
      job_id: options.jobId,
      preview_text: bytes ? previewFor(kind, bytes) : null,
      children: [],
      status: options.status,
      failure_reason: options.failureReason ?? null,
      origin_realpath: null,
    };
    this.update((next) => {
      next.items.unshift(result);
    });
    return publicItem(result);
  }

  /** Stop a run from another request; the materials stay, no result is filed. */
  cancelJob(jobId: string): ShelfJobRecord {
    const catalog = this.readCatalog();
    const job = catalog.jobs.find((entry) => entry.job_id === jobId);
    if (!job) throw new ShelfError("shelf.item_not_found", "这个任务不存在");
    if (job.status !== "running") return job;
    cancelAgentProcess(jobId);
    const cancelled: ShelfJobRecord = { ...job, status: "cancelled", finished_at: now() };
    this.update((next) => {
      next.jobs = next.jobs.map((entry) => entry.job_id === jobId ? cancelled : entry);
    });
    return cancelled;
  }

  writeCopy(itemId: string, text: string): ShelfItemRecord {
    const catalog = this.readCatalog();
    const item = this.requireItem(catalog, itemId);
    if (item.hidden) throw new ShelfError("shelf.item_not_found", "这份材料不在架子上");
    if (!isEditableShelfItem(item)) throw new ShelfError("shelf.not_text", "这份材料不能编辑");
    if (text.includes("\0")) throw new ShelfError("shelf.not_text", "这份材料不能编辑");
    const bytes = Buffer.from(text, "utf8");
    if (bytes.byteLength > MAX_EDIT_BYTES) throw new ShelfError("shelf.too_large", "文件超过 512 KB");
    const abs = this.absolute(item);
    writeFileSync(abs, bytes);
    if (item.job_id) {
      const output = path.join(this.root, "jobs", item.job_id, "output", item.name);
      if (existsSync(output)) writeFileSync(output, bytes);
    }
    this.update((next) => {
      const live = this.requireItem(next, itemId);
      live.size_bytes = bytes.byteLength;
      live.preview_text = previewFor(live.kind, bytes);
    });
    return publicItem(this.requireItem(this.readCatalog(), itemId));
  }

  useAsMaterial(itemId: string): ShelfItemRecord {
    const catalog = this.readCatalog();
    const item = this.requireItem(catalog, itemId);
    if (item.group !== "result") throw new ShelfError("shelf.not_result", "只有生成结果可以再用作材料");
    if (!item.relative_path) throw new ShelfError("shelf.missing_output", "这次没有生成文件");
    const bytes = readFileSync(this.absolute(item));
    return this.admit({ filename: item.name, bytes, mime: item.mime });
  }

  addClipboard(
    body: string,
    options: { concealed?: boolean; types?: readonly string[] } = {},
  ): ShelfClipboardRecord | null {
    if (options.concealed || isConcealedClipboard(options.types ?? [])) {
      this.update((catalog) => {
        catalog.current_clip_id = null;
      });
      return null;
    }
    const text = clipText(body);
    if (!text || isFileUrl(text)) {
      this.update((catalog) => {
        catalog.current_clip_id = null;
      });
      return null;
    }
    const kind = isHttpUrl(text) ? "url" : "text";
    const fingerprint = clipFingerprint(kind, text);
    const title = clipTitleFor(kind, text);
    let recorded: ShelfClipboardRecord | null = null;
    this.update((catalog) => {
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
        clip_id: this.id("clip"),
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
    if (!recorded) throw new ShelfError("shelf.empty_file", "剪贴板是空的");
    return recorded;
  }

  deleteClipboard(clipId: string): void {
    this.update((catalog) => {
      const exists = catalog.clipboard.some((entry) => entry.clip_id === clipId);
      if (!exists) throw new ShelfError("shelf.item_not_found", "这条剪贴板不存在");
      catalog.clipboard = catalog.clipboard.filter((entry) => entry.clip_id !== clipId);
      if (catalog.current_clip_id === clipId) catalog.current_clip_id = null;
    });
  }

  async clipboardToMaterial(clipId: string): Promise<ShelfItemRecord> {
    const clip = this.readCatalog().clipboard.find((entry) => entry.clip_id === clipId);
    if (!clip) throw new ShelfError("shelf.item_not_found", "这条剪贴板不存在");
    if (clip.kind === "url") return this.admitUrl(clip.body);
    return this.admitText(clip.body, clip.title);
  }

  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer } {
    const item = this.requireItem(this.readCatalog(), itemId);
    if (!item.relative_path) throw new ShelfError("shelf.missing_output", "这次没有生成文件");
    return { item: publicItem(item), bytes: readFileSync(this.absolute(item)) };
  }

  private ensureSample(catalog: CatalogFile): CatalogFile {
    if (catalog.seeded_sample || catalog.items.length > 0) {
      return catalog;
    }
    this.seedSample();
    return this.readCatalog();
  }

  /** A file hashes its bytes; a folder hashes every path and file under it. */
  private contentHash(item: StoredItem): string {
    const absolute = this.absolute(item);
    if (item.kind !== "folder") return sha256(readFileSync(absolute));
    const digest = createHash("sha256");
    const walk = (directory: string, prefix: string): void => {
      for (const entry of readdirSync(directory).sort()) {
        const full = path.join(directory, entry);
        const relative = prefix ? `${prefix}/${entry}` : entry;
        if (statSync(full).isDirectory()) walk(full, relative);
        else digest.update(`${relative}:${sha256(readFileSync(full))}\n`);
      }
    };
    walk(absolute, "");
    return digest.digest("hex");
  }

  private assertOriginUntouched(item: StoredItem): void {
    if (item.kind === "folder") return;
    if (!item.origin_realpath || !existsSync(item.origin_realpath)) return;
    if (sha256(readFileSync(item.origin_realpath)) !== item.origin_hash) {
      throw new ShelfError("shelf.origin_changed", "原件 Hash 已变化，已停止这次任务");
    }
  }

  private requireItem(catalog: CatalogFile, itemId: string): StoredItem {
    const item = catalog.items.find((entry) => entry.item_id === itemId);
    if (!item) throw new ShelfError("shelf.item_not_found", "这份材料不在架子上");
    return item;
  }

  private absolute(item: StoredItem): string {
    return path.join(this.root, item.relative_path);
  }

  private catalogPath(): string {
    return path.join(this.root, "catalog.json");
  }

  private readCatalog(): CatalogFile {
    if (!existsSync(this.catalogPath())) {
      return emptyCatalog();
    }
    return normalizeCatalog(JSON.parse(readFileSync(this.catalogPath(), "utf8")) as CatalogFile);
  }

  private update(mutate: (catalog: CatalogFile) => void): void {
    const catalog = this.readCatalog();
    mutate(catalog);
    this.writeCatalog(catalog);
  }

  private writeCatalog(catalog: CatalogFile): void {
    mkdirSync(this.root, { recursive: true });
    const temp = `${this.catalogPath()}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(catalog, null, 2)}\n`);
    renameSync(temp, this.catalogPath());
  }

  private id(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  }
}

export function openShelfStore(homeDirectory: string, probe: ShelfRuntimeProbe = {}): ShelfStore {
  return new ShelfStore(path.join(path.resolve(homeDirectory), "shelf"), probe);
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
  const { origin_realpath: _origin, ...visible } = item;
  return visible;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function now(): string {
  return new Date().toISOString();
}

function safeFilename(value: string): string {
  const base = path.basename(value).replaceAll("\0", "").trim() || "untitled";
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
  if (kind === "pdf") {
    try {
      return extractLocalText(bytes, "pdf", "application/pdf");
    } catch {
      return null;
    }
  }
  if (kind === "text" || kind === "markdown" || kind === "url" || kind === "website") return bytes.toString("utf8").slice(0, 20_000);
  return null;
}

function emptyCatalog(): CatalogFile {
  return {
    version: CATALOG_VERSION,
    seeded_sample: false,
    items: [],
    jobs: [],
    clipboard: [],
    current_clip_id: null,
    settings: defaultSettings(),
  };
}

function defaultSettings(): ShelfDeviceSettings {
  return defaultShelfDeviceSettings();
}

function normalizeSettings(raw: unknown): ShelfDeviceSettings {
  return normalizeShelfSettings(raw);
}

function normalizeCatalog(raw: CatalogFile): CatalogFile {
  const clipboard = Array.isArray(raw.clipboard) ? raw.clipboard.map(normalizeClip) : [];
  const current = typeof raw.current_clip_id === "string" && clipboard.some((clip) => clip.clip_id === raw.current_clip_id)
    ? raw.current_clip_id
    : null;
  return {
    version: CATALOG_VERSION,
    seeded_sample: Boolean(raw.seeded_sample),
    items: Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [],
    jobs: Array.isArray(raw.jobs) ? raw.jobs.map(normalizeJob) : [],
    clipboard,
    current_clip_id: current,
    settings: normalizeSettings(raw.settings),
  };
}

/** Catalogs written before a job listed every material still load. */
function normalizeJob(raw: ShelfJobRecord): ShelfJobRecord {
  return {
    ...raw,
    item_ids: Array.isArray(raw.item_ids) ? raw.item_ids : raw.item_id ? [raw.item_id] : [],
    option_id: typeof raw.option_id === "string" ? raw.option_id : null,
    runtime: typeof raw.runtime === "string" ? raw.runtime : "",
  };
}

/** Catalogs written before results carried a verdict still load. */
function normalizeItem(raw: StoredItem): StoredItem {
  return {
    ...raw,
    source_item_ids: Array.isArray(raw.source_item_ids)
      ? raw.source_item_ids
      : raw.source_item_id ? [raw.source_item_id] : [],
    status: raw.status === "failed" ? "failed" : "done",
    failure_reason: typeof raw.failure_reason === "string" ? raw.failure_reason : null,
    children: Array.isArray(raw.children) ? raw.children : [],
  };
}

function normalizeClip(raw: ShelfClipboardRecord): ShelfClipboardRecord {
  const body = clipText(String(raw.body ?? ""));
  const kind = raw.kind === "url" || isHttpUrl(body) ? "url" : "text";
  return {
    clip_id: String(raw.clip_id ?? ""),
    kind,
    title: String(raw.title || clipTitleFor(kind, body)),
    body,
    created_at: String(raw.created_at ?? now()),
    fingerprint: String(raw.fingerprint || clipFingerprint(kind, body)),
  };
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
function uniqueName(directory: string, preferred: string): string {
  const base = preferred.replace(/\.[^.]+$/u, "");
  const extension = path.extname(preferred);
  let candidate = preferred;
  let index = 2;
  while (existsSync(path.join(directory, candidate))) {
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
 * `input/` is the evidence copy: the Agent reads `work/`, never this one. The
 * folder itself is locked only while the job runs, so ordinary cleanup later
 * still works; the files stay read-only.
 */
function freezeReadOnly(target: string): void {
  const stats = statSync(target);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target)) freezeReadOnly(path.join(target, entry));
    chmodSync(target, 0o555);
    return;
  }
  chmodSync(target, 0o444);
}

function unlockDirectories(target: string): void {
  if (!existsSync(target)) return;
  if (!statSync(target).isDirectory()) return;
  chmodSync(target, 0o755);
  for (const entry of readdirSync(target)) unlockDirectories(path.join(target, entry));
}

function thawTree(target: string): void {
  if (!existsSync(target)) return;
  const stats = statSync(target);
  chmodSync(target, stats.isDirectory() ? 0o755 : 0o644);
  if (!stats.isDirectory()) return;
  for (const entry of readdirSync(target)) thawTree(path.join(target, entry));
}

function appendEvent(jobRoot: string, message: string): void {
  appendFileSync(path.join(jobRoot, "events.jsonl"), `${JSON.stringify({ message })}\n`);
}

/** Folder entries stay inside the folder: no absolute paths, no `..`. */
function safeRelative(value: string): string {
  const parts = String(value ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.map((part) => part.replaceAll("\0", "")).join("/");
}

function copyTree(source: string, target: string): void {
  const stats = statSync(source);
  if (!stats.isDirectory()) {
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) copyTree(path.join(source, entry), path.join(target, entry));
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
  if (error instanceof ShelfError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "任务失败";
}
