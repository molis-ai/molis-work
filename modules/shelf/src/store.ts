import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  ShelfAdmitInput,
  ShelfClipboardRecord,
  ShelfDeviceSettings,
  ShelfItemKind,
  ShelfSettingsPatch,
  ShelfItemRecord,
  ShelfJobRecord,
  ShelfRecipeAvailability,
  ShelfRunJobInput,
  ShelfSnapshot,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { ShelfError } from "./errors.js";
import { extractLocalText, markdownFromExtract, resultNameForExtract } from "./extract.js";
import { SAMPLE_PDF_TEXT, createExtractablePdf } from "./pdf.js";
import { defaultShelfDeviceSettings, mergeShelfSettings, normalizeShelfSettings } from "./hotkeys.js";

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
const RECIPE_TABLE: readonly ShelfRecipeAvailability[] = [
  { recipe: "extract_text", available: true, label: "提取文字", tone: "clay", reason: null },
  { recipe: "summarize", available: false, label: "总结文件", tone: "slate", reason: "没有可收口 Job 入口的终端 Agent" },
  { recipe: "extract_structure", available: false, label: "提取结构化信息", tone: "blue", reason: "没有可收口 Job 入口的终端 Agent" },
  { recipe: "translate", available: false, label: "翻译并保留格式", tone: "blue", reason: "没有可收口 Job 入口的终端 Agent" },
  { recipe: "to_markdown", available: false, label: "转换为 Markdown", tone: "plum", reason: "没有可收口 Job 入口的终端 Agent" },
  { recipe: "redact", available: false, label: "敏感信息脱敏", tone: "clay", reason: "没有可收口 Job 入口的终端 Agent" },
  { recipe: "combine", available: false, label: "整合多份材料", tone: "ochre", reason: "没有可收口 Job 入口的终端 Agent" },
];

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
    job.status === "running" && (job.item_id === itemId || job.result_item_id === itemId)
  ));
  if (busy) throw new ShelfError("shelf.busy", "运行中不能隐藏或删除");
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
  constructor(readonly root: string) {
    mkdirSync(path.join(root, "files"), { recursive: true });
    mkdirSync(path.join(root, "jobs"), { recursive: true });
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
    return {
      materials: visible("material"),
      results: visible("result"),
      clipboard: catalog.clipboard.slice(0, CLIPBOARD_LIMIT),
      recipes: RECIPE_TABLE,
      current_clip_id: catalog.current_clip_id,
    };
  }

  admit(input: ShelfAdmitInput): ShelfItemRecord {
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
      job_id: null,
      preview_text: preview,
      origin_realpath: originRealpath,
    };
    this.update((catalog) => {
      catalog.items.unshift(item);
      catalog.seeded_sample = true;
    });
    return publicItem(item);
  }

  admitText(body: string, title = "粘贴文字"): ShelfItemRecord {
    const text = body.trim();
    if (!text) throw new ShelfError("shelf.empty_file", "剪贴板是空的");
    if (isHttpUrl(text)) {
      return this.admit({
        filename: `${safeFilename(clipTitleFor("url", text))}.url`,
        bytes: Buffer.from(text, "utf8"),
        mime: "text/uri-list",
      });
    }
    const filename = `${safeFilename(title.slice(0, 40) || "paste")}.md`;
    return this.admit({ filename, bytes: Buffer.from(text, "utf8"), mime: "text/markdown" });
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
    const copyDir = safeInside(path.join(this.root, "files"), path.join(this.root, path.dirname(item.relative_path)));
    const jobDir = item.job_id
      ? safeInside(path.join(this.root, "jobs"), path.join(this.root, "jobs", item.job_id))
      : null;
    this.update((next) => {
      next.items = next.items.filter((entry) => entry.item_id !== itemId);
    });
    rmSync(copyDir, { recursive: true, force: true });
    if (jobDir && existsSync(jobDir)) rmSync(jobDir, { recursive: true, force: true });
  }

  runJob(input: ShelfRunJobInput): { job: ShelfJobRecord; result: ShelfItemRecord | null; origin_hash: string } {
    if (input.recipe !== "extract_text") {
      throw new ShelfError("shelf.recipe_unavailable", "这个动作需要终端 Agent，当前只能本机抽字");
    }
    const catalog = this.readCatalog();
    const item = this.requireItem(catalog, input.item_id);
    if (item.group !== "material" || item.hidden) throw new ShelfError("shelf.item_not_found", "请先选择一份材料");
    const sourceBytes = readFileSync(this.absolute(item));
    const copyHash = sha256(sourceBytes);
    this.assertOriginUntouched(item);
    const jobId = this.id("job");
    const jobRoot = path.join(this.root, "jobs", jobId);
    mkdirSync(path.join(jobRoot, "input"), { recursive: true });
    mkdirSync(path.join(jobRoot, "work"), { recursive: true });
    mkdirSync(path.join(jobRoot, "output"), { recursive: true });
    const inputPath = path.join(jobRoot, "input", item.name);
    const workPath = path.join(jobRoot, "work", item.name);
    copyFileSync(this.absolute(item), inputPath);
    copyFileSync(this.absolute(item), workPath);
    const createdAt = now();
    const running: ShelfJobRecord = {
      job_id: jobId,
      recipe: input.recipe,
      status: "running",
      item_id: item.item_id,
      result_item_id: null,
      isolation: "本机抽字，不调用 Agent",
      error: null,
      created_at: createdAt,
      finished_at: null,
    };
    this.update((next) => {
      next.jobs.unshift(running);
    });
    try {
      const text = extractLocalText(readFileSync(workPath), item.kind, item.mime);
      const outputName = resultNameForExtract(item.kind);
      const markdown = markdownFromExtract(item.name, text);
      const outputPath = path.join(jobRoot, "output", outputName);
      writeFileSync(outputPath, markdown);
      this.assertOriginUntouched(item);
      if (sha256(readFileSync(this.absolute(item))) !== copyHash) {
        throw new ShelfError("shelf.hash_changed", "架子上的副本 Hash 已变化，已停止写入");
      }
      const resultId = this.id("item");
      const relative = path.join("files", resultId, outputName);
      mkdirSync(path.dirname(path.join(this.root, relative)), { recursive: true });
      copyFileSync(outputPath, path.join(this.root, relative));
      const resultBytes = readFileSync(path.join(this.root, relative));
      const result: StoredItem = {
        item_id: resultId,
        group: "result",
        kind: "markdown",
        name: outputName,
        relative_path: relative,
        mime: "text/markdown",
        size_bytes: resultBytes.byteLength,
        origin_hash: sha256(resultBytes),
        hidden: false,
        created_at: now(),
        source_item_id: item.item_id,
        job_id: jobId,
        preview_text: markdown,
        origin_realpath: null,
      };
      const finished: ShelfJobRecord = {
        ...running,
        status: "succeeded",
        result_item_id: resultId,
        finished_at: now(),
      };
      this.update((next) => {
        next.items.unshift(result);
        next.jobs = next.jobs.map((job) => job.job_id === jobId ? finished : job);
      });
      return { job: finished, result: publicItem(result), origin_hash: item.origin_hash };
    } catch (error) {
      const failed: ShelfJobRecord = {
        ...running,
        status: "failed",
        error: error instanceof Error ? error.message : "抽字失败",
        finished_at: now(),
      };
      this.update((next) => {
        next.jobs = next.jobs.map((job) => job.job_id === jobId ? failed : job);
      });
      throw error instanceof ShelfError ? error : new ShelfError("shelf.extract_failed", failed.error ?? "抽字失败");
    }
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

  clipboardToMaterial(clipId: string): ShelfItemRecord {
    const clip = this.readCatalog().clipboard.find((entry) => entry.clip_id === clipId);
    if (!clip) throw new ShelfError("shelf.item_not_found", "这条剪贴板不存在");
    if (clip.kind === "url") {
      return this.admit({
        filename: `${safeFilename(clip.title || clipTitleFor("url", clip.body))}.url`,
        bytes: Buffer.from(clip.body, "utf8"),
        mime: "text/uri-list",
      });
    }
    return this.admitText(clip.body, clip.title);
  }

  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer } {
    const item = this.requireItem(this.readCatalog(), itemId);
    return { item: publicItem(item), bytes: readFileSync(this.absolute(item)) };
  }

  private ensureSample(catalog: CatalogFile): CatalogFile {
    if (catalog.seeded_sample || catalog.items.length > 0) {
      return catalog;
    }
    this.seedSample();
    return this.readCatalog();
  }

  private assertOriginUntouched(item: StoredItem): void {
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

export function openShelfStore(homeDirectory: string): ShelfStore {
  return new ShelfStore(path.join(path.resolve(homeDirectory), "shelf"));
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
    items: Array.isArray(raw.items) ? raw.items : [],
    jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
    clipboard,
    current_clip_id: current,
    settings: normalizeSettings(raw.settings),
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
