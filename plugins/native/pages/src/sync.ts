import { syncError } from './sync-errors.js';
import { compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import { exceedsCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import type { PagesBody } from "./contract.js";
import { parsePagesBody } from "./document.js";
interface Folder { id: string; title: string; created_at: string; updated_at: string }
interface Document extends Folder {
  body: PagesBody; folder_id: string; starred: boolean; goal_id: string;
  artifact_id: string; artifact_version: number;
}
interface Payload { folders: Folder[]; documents: Document[] }
const MAX_RECORDS = 1000;
const MAX_BYTES = 16 * 1024 * 1024;
const PORTABLE_URL = /^(https?:\/\/|mailto:|#|data:image\/(png|jpeg|gif|webp);base64,)/i;
const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s\\]/u;

export function parsePayload(input: unknown, projectId?: string): Payload {
  let encoded: string;
  try { encoded = JSON.stringify(input); } catch { invalid("快照不是 JSON 数据"); }
  if (!encoded) invalid("缺少快照内容");
  if (Buffer.byteLength(encoded, "utf8") > MAX_BYTES) throw syncError("limit", "快照过大");
  const object = record(JSON.parse(encoded), ["folders", "documents"]);
  if (!Array.isArray(object.folders) || !Array.isArray(object.documents)
    || object.folders.length > MAX_RECORDS || object.documents.length > MAX_RECORDS) invalid("快照集合不合法");
  const base = (row: Record<string, unknown>, titleLimit: number): Folder => ({ id: text(row.id, 80), title: text(row.title, titleLimit),
    created_at: date(row.created_at), updated_at: date(row.updated_at) });
  const folders = object.folders.map(value => base(record(value, ["id", "title", "created_at", "updated_at"]), 40));
  unique(folders);
  const folderIds = new Set(folders.map(row => row.id));
  const documents = object.documents.map((value): Document => {
    const row = record(value, ["id", "title", "created_at", "updated_at", "body", "folder_id", "starred", "goal_id", "artifact_id", "artifact_version"]);
    const folder_id = text(row.folder_id, 80, true);
    if (folder_id && !folderIds.has(folder_id)) missing("快照缺少文档所属文件夹");
    const artifact_id = text(row.artifact_id, 80, true);
    if (typeof row.starred !== "boolean" || !Number.isSafeInteger(row.artifact_version)
      || Number(row.artifact_version) < 0 || (artifact_id ? Number(row.artifact_version) < 1 : row.artifact_version !== 0)) invalid("文档元数据不合法");
    if (!row.body) invalid("快照缺少文档正文");
    portable(row.body, 0, projectId);
    let body: PagesBody;
    try { body = parsePagesBody(row.body); } catch { invalid("文档正文不合法"); }
    return { ...base(row, 80), body, folder_id, starred: row.starred, goal_id: text(row.goal_id, 80, true), artifact_id, artifact_version: Number(row.artifact_version) };
  });
  unique(documents);
  const sort = (a: Folder, b: Folder) => compareCodeUnits(a.id, b.id);
  return { folders: folders.sort(sort), documents: documents.sort(sort) };
}

function isSameProjectObjectLink(value: string, projectId?: string): boolean {
  if (!projectId || projectId === "." || projectId === ".." || CONTROL_OR_SPACE.test(value)) return false;
  const path = `/projects/${encodeURIComponent(projectId)}/`;
  const prefix = `${path}?`;
  if (!value.startsWith(prefix)) return false;
  const rest = value.slice(prefix.length);
  if (!/^(?:openPlugin|openObject)=/u.test(rest)) return false;
  let parsed: URL;
  try { parsed = new URL(value, "https://molis.invalid"); } catch { return false; }
  if (parsed.origin !== "https://molis.invalid" || parsed.pathname !== path) return false;
  const openPlugin = parsed.searchParams.get("openPlugin");
  const openObject = parsed.searchParams.get("openObject");
  const openItem = parsed.searchParams.get("openItem");
  if (openPlugin !== null) return Boolean(openPlugin.trim()) && !/[/\\]|\.\./u.test(openPlugin);
  return Boolean(openObject?.trim() && openItem?.trim());
}

function portable(value: unknown, depth: number, projectId?: string): void {
  if (depth > 64) invalid("文档嵌套过深");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "src" || key === "href") && typeof child === "string" && child
      && !PORTABLE_URL.test(child)
      && !(key === "href" && isSameProjectObjectLink(child, projectId))) {
      throw syncError("dependencies", "文档包含本机或相对链接，需先转换为可同步资源引用");
    }
    portable(child, depth + 1, projectId);
  }
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("快照字段须是对象");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !(key in row))) invalid("快照字段不匹配");
  return row;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim()) || exceedsCharacters(value, max) || value !== value.trim()) invalid("快照文字字段不合法");
  return value;
}
function date(value: unknown): string {
  const result = text(value, 40);
  if (!Number.isFinite(Date.parse(result)) || !/(Z|[+-]\d{2}:\d{2})$/.test(result)) invalid("快照时间不合法");
  return result;
}
function unique(rows: Folder[]): void { if (new Set(rows.map(row => row.id)).size !== rows.length) invalid("快照包含重复资产"); }
function invalid(message: string): never { throw syncError("invalid", message); }
function missing(message: string): never { throw syncError("dependencies", message); }
