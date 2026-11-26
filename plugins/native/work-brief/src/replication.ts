import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginStartContext, PluginSyncBinding, PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSyncCollectionDefinition, SyncPortableRow, SyncTrackedTable } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { workBriefErrors } from "./error.js";
import { WORK_BRIEF_PROJECT_PLUGIN_ID } from "./identity.js";
import { BRIEF_LIMITS } from "./model.js";
import { checkProducer, id, list, object, parse, portableBody, requireBriefSync, stamp, text, version } from "./replication-content.js";

const collection = "briefs";
const root = ["id", "project_id", "actor_id", "scope", "title", "current_version", "fixed_json", "created_at", "updated_at", "artifact_id", "artifact_version"];
const children = {
  brief_versions: ["version", "base_version", "as_of", "created_at", "produced_by_json", "body_json"],
  brief_edits: ["id", "claim_id", "text", "base_version", "actor_id", "at"],
  brief_proposals: ["id", "base_version", "created_at", "produced_by_json", "body_json", "conflicts_json"],
  brief_next_marks: ["option_id", "state", "actor_id", "at"],
} as const;
const childTables = Object.keys(children) as (keyof typeof children)[];
const key: SyncTrackedTable["key"] = [{ column: "project_id" }, { literal: "brief" }, { column: "id" }];
const tracking: SyncTrackedTable[] = [{ table: "briefs", key,
  revision: { table: "brief_editor_versions", key: [{ column: "id", rowColumn: "id" }, { column: "project_id", rowColumn: "project_id" }], column: "version", rowColumn: "version" } },
...childTables.map(table => ({ table, key, lookup: { table: "briefs", match: [{ column: "id", rowColumn: "brief_id" }] } }))];

export const workBriefSync: PluginSyncDeclaration = { protocol_version: /* @version sync.protocol */ 1, collections: [
  { id: collection, title: "个人与项目简报", schema_version: /* @version sync.collection.work-brief.briefs */ 1, requires: [], tracking },
] };

type BriefKey = { projectId: string; briefId: string };
function decode(key: string): BriefKey {
  const value = parse(key);
  requireBriefSync(Array.isArray(value) && value.length === 3 && (value[0] === "" || id(value[0])) && value[1] === "brief" && id(value[2]));
  return { projectId: value[0], briefId: value[2] };
}

function inScope(row: Record<string, unknown>, projectId: string, actorId: string): boolean {
  return row.project_id === projectId && (projectId
    ? (row.scope === "topic" || row.scope === "home") && row.actor_id === ""
    : row.scope === "personal" && !!actorId && row.actor_id === actorId);
}

function portableRoot(value: unknown, key: BriefKey, actorId: string) {
  const row = object(value, root, []);
  requireBriefSync(row.id === key.briefId && inScope(row, key.projectId, actorId) && text(row.title, BRIEF_LIMITS.title)
    && version(row.current_version, 0) && stamp(row.created_at) && stamp(row.updated_at)
    && (row.artifact_id === "" || id(row.artifact_id)) && version(row.artifact_version, 0)
    && (row.artifact_id === "") === (row.artifact_version === 0));
  const fixed = Object.entries(object(parse(row.fixed_json))).map(([fixedVersion, mark]) => {
    const entry = object(mark, ["artifact_id", "artifact_version", "at"], []);
    requireBriefSync(/^[1-9]\d*$/u.test(fixedVersion) && version(Number(fixedVersion)) && id(entry.artifact_id) && version(entry.artifact_version) && stamp(entry.at));
    return { version: Number(fixedVersion), id: String(entry.artifact_id), artifactVersion: Number(entry.artifact_version) };
  });
  requireBriefSync(key.projectId || (!fixed.length && row.artifact_id === ""));
  return { row: row as SyncPortableRow, fixed };
}

function portableChildren(value: unknown, fromLocal: boolean, personal: boolean) {
  const data = object(value, childTables, []);
  const versions = list(data.brief_versions, 10_000).map(value => {
    const row = object(value, children.brief_versions, []);
    requireBriefSync(version(row.version) && (row.base_version === null || (version(row.base_version) && Number(row.base_version) < Number(row.version)))
      && stamp(row.created_at) && stamp(row.as_of));
    checkProducer(parse(row.produced_by_json));
    return { ...row, body_json: portableBody(row.body_json, fromLocal, personal) } as SyncPortableRow;
  });
  const edits = list(data.brief_edits, 10_000).map(value => {
    const row = object(value, children.brief_edits, []);
    requireBriefSync(id(row.id) && id(row.claim_id) && id(row.actor_id) && stamp(row.at) && version(row.base_version)
      && (row.text === null || text(row.text, BRIEF_LIMITS.claim_text)));
    return row as SyncPortableRow;
  });
  const proposals = list(data.brief_proposals, 1).map(value => {
    const row = object(value, children.brief_proposals, []);
    requireBriefSync(id(row.id) && version(row.base_version) && stamp(row.created_at));
    checkProducer(parse(row.produced_by_json));
    for (const value of list(parse(row.conflicts_json), 10_000)) {
      const { claim_id, mine, theirs } = object(value, ["claim_id", "mine", "theirs"], []);
      requireBriefSync(id(claim_id) && (mine === null || text(mine, BRIEF_LIMITS.claim_text)) && (theirs === null || text(theirs, BRIEF_LIMITS.claim_text)));
    }
    return { ...row, body_json: portableBody(row.body_json, fromLocal, personal) } as SyncPortableRow;
  });
  const marks = list(data.brief_next_marks, 10_000).map(value => {
    const row = object(value, children.brief_next_marks, []);
    requireBriefSync(id(row.option_id) && id(row.actor_id) && stamp(row.at) && ["later", "handed", "done", "failed", "stale"].includes(String(row.state)));
    return row as SyncPortableRow;
  });
  return { brief_versions: versions, brief_edits: edits, brief_proposals: proposals, brief_next_marks: marks };
}

function portable(value: unknown, key: BriefKey, spaceId: string, actorId: string, fromLocal = false) {
  const wire = object(value, ["spaceId", "brief", "children"], []);
  requireBriefSync(wire.spaceId === spaceId);
  const record = portableRoot(wire.brief, key, actorId);
  const rows = portableChildren(wire.children, fromLocal, key.projectId === "");
  const kept = new Set(rows.brief_versions.map(row => row.version));
  requireBriefSync(kept.size === rows.brief_versions.length && (record.row.current_version === 0 ? !kept.size : kept.has(record.row.current_version!))
    && record.fixed.every(entry => kept.has(entry.version)));
  return { record, rows };
}

export const briefCollection: PluginSyncCollectionDefinition = { tracking, create(db, context) {
  const owner = (key: BriefKey) => {
    const row = db.prepare(`SELECT ${root.join(", ")}, version, publication_pending_json FROM briefs WHERE id = ?`).get(key.briefId);
    const high = db.prepare("SELECT project_id, version FROM brief_editor_versions WHERE id = ?").get(key.briefId);
    requireBriefSync((!row || inScope(row, key.projectId, context.actorId)) && (!high || high.project_id === key.projectId));
    return { row, high };
  };
  return {
    authorizeKey(key) {
      const selected = decode(key);
      if (selected.projectId) context.project(selected.projectId);
      else requireBriefSync(context.actorId);
      owner(selected);
    },
    canUpload(key) {
      const { projectId } = decode(key);
      return projectId ? context.canUploadProject(projectId) : !!context.actorId;
    },
    belongsToProject: (key, projectId) => decode(key).projectId === projectId,
    read(key) {
      const selected = decode(key), { row } = owner(selected);
      if (!row) return null;
      const brief = Object.fromEntries(root.map(column => [column, row[column]]));
      const data = Object.fromEntries(childTables.map(table => {
        const columns = children[table];
        const filter = table === "brief_next_marks" ? " AND state <> 'running'" : "";
        return [table, db.prepare(`SELECT ${columns.join(", ")} FROM ${table} WHERE brief_id = ?${filter} ORDER BY ${columns[0]}`).all(selected.briefId)];
      }));
      const value = portable({ spaceId: context.spaceId, brief, children: data }, selected, context.spaceId, context.actorId, true);
      return { spaceId: context.spaceId, brief: value.record.row, children: value.rows };
    },
    apply(key, value) {
      const selected = decode(key), { row, high } = owner(selected), { briefId, projectId } = selected;
      if (row?.publication_pending_json || db.prepare("SELECT 1 FROM brief_next_marks WHERE brief_id = ? AND state = 'running'").get(briefId))
        throw workBriefErrors.conflict("简报仍有本机操作，原内容已保留");
      if (value === null) {
        for (const table of childTables) db.prepare(`DELETE FROM ${table} WHERE brief_id = ?`).run(briefId);
        db.prepare("DELETE FROM briefs WHERE id = ? AND project_id = ?").run(briefId, projectId);
        return;
      }
      const { record, rows } = portable(value, selected, context.spaceId, context.actorId);
      requireBriefSync(!row || row.scope === record.row.scope);
      const artifact = record.row.artifact_id;
      const references = artifact ? [...record.fixed, { id: String(artifact), artifactVersion: Number(record.row.artifact_version) }] : record.fixed;
      if (references.some(entry => !context.hasArtifact(projectId, entry.id, entry.artifactVersion)))
        throw workBriefErrors.conflict("等待简报关联的成果版本", { sync_waiting: true });
      if (record.row.scope === "home") {
        const duplicate = db.prepare("SELECT id FROM briefs WHERE project_id = ? AND scope = 'home' AND id <> ?").get(projectId, briefId);
        if (duplicate) throw workBriefErrors.conflict("另一个设备已创建本项目的主简报，原内容已保留", { brief_id: briefId });
      } else if (record.row.scope === "personal") {
        const duplicate = db.prepare("SELECT id FROM briefs WHERE actor_id = ? AND scope = 'personal' AND id <> ?").get(context.actorId, briefId);
        if (duplicate) throw workBriefErrors.conflict("另一个设备已创建个人简报，原内容已保留", { brief_id: briefId });
      }
      const revision = Math.max(Number(row?.version ?? 0), Number(high?.version ?? 0)) + 1;
      db.prepare(`INSERT INTO briefs (${root.join(", ")}, version) VALUES (${[...root.map(() => "?"), "?"].join(", ")})
        ON CONFLICT(id) DO UPDATE SET ${root.slice(4).map(column => `${column} = excluded.${column}`).join(", ")}, version = excluded.version`)
        .run(...root.map(column => record.row[column] ?? null), revision);
      for (const table of childTables) {
        const columns = children[table];
        db.prepare(`DELETE FROM ${table} WHERE brief_id = ?`).run(briefId);
        const insert = db.prepare(`INSERT INTO ${table} (brief_id, ${columns.join(", ")}) VALUES (${["?", ...columns.map(() => "?")].join(", ")})`);
        for (const child of rows[table]) insert.run(briefId, ...columns.map(column => child[column] ?? null));
      }
    },
  };
} };

/** The Home activation owns the one journal, including rows from every reachable project. */
export function workBriefSyncBindings(context: PluginStartContext): PluginSyncBinding[] {
  const scope = context.sync, service = context.services?.sync;
  if (!scope || !service) return [];
  const projectLocation = syncTupleLocation(WORK_BRIEF_PROJECT_PLUGIN_ID, true, 2);
  return [{ collection_id: collection, replica: service.collection(collection, briefCollection),
    content: createSyncJsonContent({ spaceId: scope.spaceId, authorize: scope.assertActive }),
    locate: key => decode(key).projectId ? projectLocation(key) : null }];
}
