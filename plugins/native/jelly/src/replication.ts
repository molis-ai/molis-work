import { syncError } from './sync-errors.js';
import type { PluginSyncCollectionDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { JellyWorkspace } from "./contract.js";
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { emptyJellyWorkspace, validateJellyWorkspace } from "./calendar.js";
import { jellyHash, validateJellyContent } from "./content.js";



const KEY = JSON.stringify(["jelly", "workspace"]);
const LIMIT = 100000000;
type Row = { revision: number; body: string; checksum: string };

/** Only editable content travels; platform-owned tracking observes owner writes. */
export const jellyCollection: PluginSyncCollectionDefinition = {
  tracking: [{ table: "jelly_workspace", key: [{literal:"jelly"},{literal:"workspace"}], where:[{column:"revision",op:"gt",value:0}] }],
  create(db,context) {
  const key = (value: string) => {
    if (value !== KEY) invalid();
  };
  const localWorkspace = (): JellyWorkspace => {
    const row = db.prepare("SELECT revision,body,checksum FROM jelly_workspace WHERE singleton=1").get() as Row | undefined;
    if (!row) {
      if (db.prepare("SELECT command FROM jelly_history LIMIT 1").get()) invalid("Jelly 工作区记录缺失，历史数据已保留");
      return emptyJellyWorkspace();
    }
    if (jellyHash(row.body) !== row.checksum) invalid("Jelly 本地数据校验失败");
    const workspace = JSON.parse(row.body) as JellyWorkspace;validate(workspace);
    if (workspace.revision !== row.revision) invalid("Jelly 本地版本记录不一致");
    return workspace;
  };
  return {
    authorizeKey(id){key(id);context.authorize();},
    belongsToProject(id) { key(id); return false; },
    read(id) {
      key(id);
      const workspace = localWorkspace();
      // The import receipt may contain a machine-specific source and is not needed to use the resulting notes.
      const { imported_sources: _localImportReceipts, ...portable } = workspace;
      const value = { format: 1, spaceId: context.spaceId, workspace: portable };
      size(value);
      return value;
    },
    apply(id, value) {
      key(id);
      if (value === null) invalid("Jelly 工作区不能由远端删除");
      size(value);
      const envelope = object(value);
      exact(envelope, ["format", "spaceId", "workspace"]);
      if (envelope.format !== 1 || envelope.spaceId !== context.spaceId) invalid("同步空间不匹配", "scope");
      const wire = object(envelope.workspace);
      const allowed = ["schema_version", "revision", "categories", "items", "series", "notes", "relations", "relation_overrides", "task_links", "applied_plan_ids"];
      if (Object.keys(wire).some(field => !allowed.includes(field)) || Object.hasOwn(wire, "imported_sources")) invalid();
      const incoming: JellyWorkspace = JSON.parse(JSON.stringify(wire));
      validate(incoming);
      const previous = localWorkspace();
      const next = { ...incoming, revision: Math.max(previous.revision, incoming.revision) + 1,
        imported_sources: previous.imported_sources };
      for (const note of next.notes) {
        const high = db.prepare("SELECT revision FROM jelly_note_versions WHERE id=?").get(note.id) as { revision: number } | undefined;
        note.revision = Math.max(note.revision, high?.revision ?? -1) + 1;
      }
      validate(next);
      const body = JSON.stringify(next);
      db.prepare("INSERT INTO jelly_workspace(singleton,revision,body,checksum) VALUES (1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision,body=excluded.body,checksum=excluded.checksum").run(next.revision, body, jellyHash(body));
      for (const note of next.notes) db.prepare("INSERT INTO jelly_note_versions(id,revision) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET revision=MAX(revision,excluded.revision)")
        .run(note.id, note.revision);
      db.exec("DELETE FROM jelly_history");
      db.exec("DELETE FROM jelly_previews");
    },
  };
  }
};

function validate(workspace: JellyWorkspace): void {
  try { validateJellyWorkspace(workspace); validateJellyContent(workspace); }
  catch { invalid("Jelly 工作区数据无效"); }
}
function size(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid("Jelly 工作区超过账号容量上限（100 MB），原数据仍保留在本机", "limit");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(row: Record<string, unknown>, columns: readonly string[]): void {
  if (Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row, column))) invalid();
}
function invalid(message = "Jelly 同步数据不合法", code: Parameters<typeof syncError>[0] = "invalid"): never {
  throw syncError(code, message);
}

export const jellySync: PluginSyncDeclaration = {
  protocol_version: 1,
  collections: [{ id: "jelly_workspace", title: "Jelly 日历与笔记", schema_version: 1, requires: [], tracking: jellyCollection.tracking }],
};
