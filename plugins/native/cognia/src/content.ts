import { createHash } from "node:crypto";
import { posix } from "node:path";
import { COGNIA_LIMITS, requireCognia, type ImportFile, type Link, type Material, type Metadata } from "./types.js";
export const contentHash = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const textExtensions = new Set([".md", ".markdown", ".txt"]);
const attachmentTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm" };
export function safeRelativePath(value: unknown): string {
  requireCognia(typeof value === "string" && value.length > 0 && value.length <= 1000 && !/[\x00-\x1f\\]/u.test(value), "资料路径无效");
  requireCognia(!posix.isAbsolute(value) && !/^[a-z]:/iu.test(value) && value.split("/").every(p => p && p !== "." && p !== ".."), "资料路径不能越过来源目录"); return value;
}
export function ignoredPath(path: string): boolean { return path.split("/").some(p => p.startsWith(".") || ["node_modules", "__pycache__", "cache"].includes(p)); }
export function fileType(path: string): { text: boolean; mime: string; limit: number } | null {
  const ext = posix.extname(path).toLowerCase();
  if (textExtensions.has(ext)) return { text: true, mime: "text/plain; charset=utf-8", limit: COGNIA_LIMITS.text_bytes };
  if (attachmentTypes[ext]) return { text: false, mime: attachmentTypes[ext], limit: COGNIA_LIMITS.attachment_bytes }; return null;
}
export function decodeFile(file: ImportFile): { bytes: Buffer; body: string; mime: string; text: boolean } {
  const type = fileType(file.path); requireCognia(type, "暂不支持此文件类型");
  requireCognia(typeof file.data === "string" && file.data.length <= Math.ceil(type.limit / 3) * 4 && file.data.length % 4 === 0 && !/[^A-Za-z0-9+/=]/u.test(file.data), "文件编码无效或超过大小限制");
  const bytes = Buffer.from(file.data, "base64"); requireCognia(bytes.toString("base64") === file.data, "文件编码无效"); requireCognia(bytes.length <= type.limit, "文件超过大小限制");
  let body = ""; if (type.text) { try { body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new Error("正文不是有效 UTF-8"); } }
  return { bytes, body, ...type };
}
export function metadata(body: string, path: string): Metadata {
  const frontmatter = body.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[0] ?? "";
  const data: Record<string, string[]> = {}; let field = "";
  for (const line of frontmatter.split(/\r?\n/u)) {
    const match = /^(title|tags|aliases):\s*(.*)$/u.exec(line);
    const clean = (s: string) => s.trim().replace(/^["']|["']$/gu, "");
    if (match) { field = match[1]!; const raw = match[2]!.trim(); data[field] = raw ? (raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1).split(",") : [raw]).map(clean).filter(Boolean) : []; }
    else if (field && /^\s+-\s+/u.test(line)) data[field]!.push(clean(line.replace(/^\s+-\s+/u, "")));
    else field = "";
  }
  return { title: data.title?.[0] || body.slice(frontmatter.length).match(/^#\s+(.+)$/mu)?.[1]?.trim() || posix.basename(path).replace(/\.[^.]+$/u, ""), tags: data.tags ?? [], aliases: data.aliases ?? [], frontmatter };
}
export function materialRole(path: string, text: boolean, kind: string): Material["role"] {
  if (!text) return "attachment";
  if (kind === "llm-wiki") { const filename = posix.basename(path).toLowerCase(); if (filename === "index.md") return "index"; if (filename === "log.md") return "log"; if (path.split("/").includes("wiki")) return "wiki"; } return "material";
}
export function linksFor(material: Material, all: Material[]): Link[] {
  const links: Link[] = []; const seen = new Set<string>();
  const candidates = all.filter(m => m.source_id === material.source_id);
  const add = (raw: string, label: string) => {
    let target = raw; try { target = decodeURIComponent(raw); } catch { /* literal path */ }
    if (seen.has(target)) return; seen.add(target);
    if (/^(https?:|mailto:)/iu.test(target)) { links.push({ target, label, status: "external" }); return; }
    if (/^[a-z][\w+.-]*:|^\/\/|\\/iu.test(target)) { links.push({ target, label, status: "unsafe" }); return; }
    target = target.split("#")[0] ?? "";
    const path = posix.normalize(posix.join(posix.dirname(material.path), target));
    if (target.startsWith("/") || path === ".." || path.startsWith("../")) { links.push({ target, label, status: "unsafe" }); return; }
    const variants = (p: string) => [p, p + ".md", p + ".markdown", p + ".txt"];
    let found = target ? candidates.filter(m => variants(path).includes(m.path)) : [material];
    if (!found.length) found = candidates.filter(m => variants(target).includes(m.path));
    if (!found.length && !target.includes("/")) found = candidates.filter(m => variants(target).includes(posix.basename(m.path)) || m.aliases.includes(target) || m.title === target);
    links.push({ target: raw, label, status: found.length === 1 ? "resolved" : found.length ? "ambiguous" : "missing", ...(found.length === 1 ? { material_id: found[0]!.id } : {}) });
  };
  const linkBody = material.body.replace(/^\s*(```+|~~~+)[^\n]*\n[\s\S]*?^\s*\1\s*$/gmu, "").replace(/`[^`\n]*`/gu, "");
  for (const m of linkBody.matchAll(/!?\[\[([^\]\n]+)\]\]/gu)) { const [target, label] = m[1]!.split("|"); add(target!, label || target!); }
  for (const m of linkBody.matchAll(/!?\[([^\]\n]*)\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/gu)) add(m[2]!, m[1] || m[2]!);
  return links;
}
