import path from "node:path";
import type { ShelfItemKind } from "./contract.js";

export const MAX_EDIT_BYTES = 512 * 1024;
const TEXT_EDIT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json",
  "swift", "py", "js", "ts", "mjs", "css",
  "yaml", "yml", "xml", "toml", "ini",
  "rs", "go", "rb", "sh", "zsh",
  "c", "h", "cc", "cpp", "m", "mm",
  "csv", "log",
]);

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

/** The name both stored names start from: a basename, no NUL, backslashes as "_", trimmed, never empty. */
const cleanedName = (value: string): string => {
  const base = path.basename(value).replaceAll("\0", "").replaceAll("\\", "_").trim() || "untitled";
  return base === "." || base === ".." ? "untitled" : base;
};

/** A file's stored name: at most 180 UTF-16 units, cut between whole characters, keeping its trailing extension. */
export function safeFilename(value: string): string {
  const base = cleanedName(value);
  if (base.length <= 180) return base;
  const extension = /\.([A-Za-z0-9]{1,10})$/u.exec(base)?.[0] ?? "";
  const room = 180 - extension.length;
  const stem = base.slice(0, base.length - extension.length);
  return stem.slice(0, room).replace(/[\uD800-\uDBFF]$/u, "") + extension;
}

/** A folder's stored name: at most 180 UTF-16 units, cut between whole characters; a dotted tail is no extension here. */
export function safeFolderName(value: string): string {
  const base = cleanedName(value);
  return base.length <= 180 ? base : base.slice(0, 180).replace(/[\uD800-\uDBFF]$/u, "");
}

/** Folder entries stay inside the folder: no absolute paths, no `..`. */
export function safeRelative(value: string): string {
  const parts = String(value ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.map((part) => part.replaceAll("\0", "").replaceAll("\\", "_")).join("/");
}

export function classify(filename: string, mime: string): ShelfItemKind {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/u.test(lower)) return "image";
  if (mime === "text/x-shelf-website") return "website";
  if (mime === "text/uri-list" || mime === "text/x-uri" || lower.endsWith(".url")) return "url";
  if (lower.endsWith(".md") || mime === "text/markdown") return "markdown";
  if (mime.startsWith("text/") || lower.endsWith(".txt")) return "text";
  return "file";
}

export function mimeFor(kind: ShelfItemKind, filename: string): string {
  if (kind === "pdf") return "application/pdf";
  if (kind === "markdown") return "text/markdown";
  if (kind === "text") return "text/plain";
  if (kind === "url") return "text/uri-list";
  if (kind === "website") return "text/x-shelf-website";
  if (kind === "image") return filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return "application/octet-stream";
}

export function previewFor(kind: ShelfItemKind, bytes: Buffer): string | null {
  if (kind === "text" || kind === "markdown" || kind === "url" || kind === "website") return bytes.toString("utf8").slice(0, 20_000);
  return null;
}

export function resultKind(name: string): ShelfItemKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".json") || lower.endsWith(".txt")) return "text";
  if (/\.(png|jpe?g|gif|webp|heic)$/u.test(lower)) return "image";
  if (lower.endsWith(".pdf")) return "pdf";
  return "file";
}

export function resultMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain";
  return mimeFor(resultKind(name), name);
}

/** DropAgent `JobWorkspace.uniqueURL`: never overwrite a name already in the folder. */
export function uniqueName(preferred: string, taken: (candidate: string) => boolean): string {
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
export function uniqueTitle(preferred: string, taken: readonly string[]): string {
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
