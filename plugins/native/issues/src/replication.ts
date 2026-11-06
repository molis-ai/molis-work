import { syncError } from './sync-errors.js';
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSyncCollectionDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { validateIssueImages, type IssueImage } from "./images.js";


const columns = [
  "id", "title", "type", "description", "context_json", "images_json",
  "submitter_id", "entered_via", "created_at", "updated_at", "version",
] as const;
const LIMIT = 100000000;
type Row = Record<string, string | number | null>;

export const issuesCollection: PluginSyncCollectionDefinition = {
  tracking: [{table:"issues", key:[{literal:"issue"},{column:"id"}],
    where:[{column:"submitter_id",op:"eq",value:{actorId:true}}],
    revision:{table:"issue_editor_versions",key:[{column:"id",rowColumn:"id"}],column:"version",rowColumn:"version"}}],
  create(db, context) {
  const owner=context.actorId;
  const decode = (key: string): string => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { return invalid(); }
    if (!Array.isArray(parts) || parts.length !== 2 || parts[0] !== "issue" ||
      typeof parts[1] !== "string" || !parts[1] || parts[1].length > 100) invalid();
    return parts[1] as string;
  };
  return {
    authorizeKey(key){decode(key);context.authorize();},
    belongsToProject(key) { decode(key); return false; },
    read(key) {
      const id = decode(key);
      const row = db.prepare("SELECT * FROM issues WHERE id=? AND submitter_id=?").get(id, owner) as Row | undefined;
      if (!row) return null;
      const value = { format: /* @version format.issues.portable */ 1, spaceId: context.spaceId, record: row };
      validate(value, id, owner, context.spaceId);
      size(value);
      return value;
    },
    apply(key, value) {
      const id = decode(key);
      if (value === null) {
        db.prepare("DELETE FROM issues WHERE id=? AND submitter_id=?").run(id, owner);
        return;
      }
      size(value);
      const row = validate(value, id, owner, context.spaceId);
      const current = db.prepare("SELECT submitter_id,version FROM issues WHERE id=?").get(id) as { submitter_id: string; version: number } | undefined;
      if (current && current.submitter_id !== owner) invalid("Issue 标识属于其他用户", "scope");
      const high = db.prepare("SELECT version FROM issue_editor_versions WHERE id=?").get(id) as { version: number } | undefined;
      row.version = Math.max(Number(row.version), current?.version ?? 0, high?.version ?? 0) + 1;
      db.prepare("INSERT INTO issues (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") +
        ") ON CONFLICT(id) DO UPDATE SET " + columns.filter(column => column !== "id").map(column => column + "=excluded." + column).join(","))
        .run(...columns.map(column => row[column] as string | number | null));
    },
  };
} };

function validate(value: unknown, id: string, owner: string, spaceId: string): Row {
  const envelope = object(value);
  exact(envelope, ["format", "spaceId", "record"]);
  if (envelope.format !== /* @version format.issues.portable */ 1 || envelope.spaceId !== spaceId) invalid("Issue 同步空间不匹配", "scope");
  const row = object(envelope.record) as Row;
  exact(row, columns);
  if (row.id !== id || row.submitter_id !== owner || typeof row.title !== "string" ||
    !row.title.trim() || row.title.length > 200 || typeof row.description !== "string" ||
    row.description.length > 100_000 || !["bug", "experience", "feature"].includes(String(row.type)) ||
    !["manual", "assistant", "mcp"].includes(String(row.entered_via)) ||
    !Number.isSafeInteger(row.version) || Number(row.version) < 1 ||
    !stamp(row.created_at) || !stamp(row.updated_at)) invalid();
  const context = object(parse(row.context_json));
  exact(context, ["recorded_at", "page", "caller"]);
  if (!stamp(context.recorded_at)) invalid();
  const actor = object(context.caller);
  exact(actor, ["actor_id", "audience"]);
  if (typeof actor.actor_id !== "string" || !actor.actor_id || actor.actor_id.length > 200 ||
    typeof actor.audience !== "string" || actor.audience.length > 40) invalid();
  if (context.page !== null) {
    const page = object(context.page);
    exact(page, ["url", "title", "provenance"]);
    if ((page.url !== null && (typeof page.url !== "string" || page.url.length > 2048)) ||
      (page.title !== null && (typeof page.title !== "string" || page.title.length > 500)) ||
      !["host_snapshot", "client_reported"].includes(String(page.provenance))) invalid();
  }
  const images = parse(row.images_json);
  try { validateIssueImages(images as IssueImage[]); } catch { invalid("Issue 图片内容不合法"); }
  return row;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(row: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) invalid();
}
function parse(value: unknown): unknown {
  if (typeof value !== "string") invalid();
  try { return JSON.parse(value); } catch { return invalid(); }
}
function stamp(value: unknown): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function size(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid("Issue 记录超过账号容量上限（100 MB），原数据仍保留在本机", "limit");
}
function invalid(message = "Issue 同步数据不合法", code: Parameters<typeof syncError>[0] = "invalid"): never {
  throw syncError(code, message);
}

export const issuesSync: PluginSyncDeclaration = {
  protocol_version: /* @version sync.protocol */ 1,
  collections: [{ id: "issues", title: "Issue 记录", schema_version: /* @version sync.collection.issues.issues */ 1, requires: [], tracking: issuesCollection.tracking }],
};
