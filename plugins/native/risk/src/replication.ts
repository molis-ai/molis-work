import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginStartContext, PluginSyncBinding, PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSyncCollectionDefinition, SyncPortableRow } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { riskErrors } from "./error.js";
import { RISK_EDIT_FIELDS, RISK_EVENT_KINDS, RISK_LEVELS, RISK_LIMITS, RISK_REFERENCE_LIMITS, RISK_STATUSES } from "./model.js";

const collection = "risks";
const itemColumns = ["risk_id", "title", "statement", "impact", "likelihood", "treatment", "owner_name", "status",
  "created_by", "created_at", "updated_at", "closed_at"];
const linkColumns = ["subject_kind", "subject_id", "added_by", "added_at"];
const eventColumns = ["event_id", "kind", "detail_json", "actor_id", "at"];
const tracking: PluginSyncCollectionDefinition["tracking"] = [{ table: "risk_items",
  key: [{ scope: "projectId" }, { literal: "risk" }, { column: "risk_id" }],
  revision: { table: "risk_editor_versions", key: [{ column: "risk_id", rowColumn: "risk_id" }], column: "revision", rowColumn: "revision" } }];

export const riskSync: PluginSyncDeclaration = { protocol_version: /* @version sync.protocol */ 1, collections: [
  { id: collection, title: "项目风险", schema_version: /* @version sync.collection.risk.risks */ 1, requires: [], tracking },
] };

function requireValue(value: unknown): asserts value {
  if (!value) throw riskErrors.invalid("风险同步内容不合法");
}
function shape(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  requireValue(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
  return value as Record<string, unknown>;
}
const text = (value: unknown, limit: number) => typeof value === "string" && [...value].length <= limit;
const identity = (value: unknown, limit = 200) => typeof value === "string" && text(value, limit) && /\S/u.test(value) && !/^(?:[\\/]|[a-z]:[\\/]|file:)/iu.test(value);
const stamp = (value: unknown) => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

function json(value: unknown): unknown {
  requireValue(typeof value === "string");
  try { return JSON.parse(value); } catch { throw riskErrors.invalid("风险同步 JSON 不合法"); }
}

function eventDetail(kind: unknown, value: unknown, riskId: string): void {
  if (kind === "created") {
    shape(value, []);
    return;
  }
  if (kind === "note") {
    requireValue(text(shape(value, ["text"]).text, RISK_LIMITS.note));
    return;
  }
  if (kind === "updated") {
    const { fields } = shape(value, ["fields"]);
    requireValue(Array.isArray(fields) && fields.length > 0 && fields.length <= RISK_EDIT_FIELDS.length && fields.every(field => RISK_EDIT_FIELDS.some(key => key === field)));
    return;
  }
  if (kind === "status") {
    const keys = value && typeof value === "object" && Object.hasOwn(value, "text") ? ["status", "previous_status", "text"] : ["status", "previous_status"];
    const detail = shape(value, keys);
    requireValue(RISK_STATUSES.some(status => status === detail.status) && RISK_STATUSES.some(status => status === detail.previous_status)
      && (detail.text === undefined || text(detail.text, RISK_LIMITS.note)));
    return;
  }
  const { kind: subjectKind, id } = shape(shape(value, ["subject"]).subject, ["kind", "id"]);
  checkSubject(subjectKind, id, riskId);
}

function checkSubject(kind: unknown, id: unknown, riskId: string): void {
  requireValue(identity(kind, RISK_REFERENCE_LIMITS.kind) && identity(id, RISK_REFERENCE_LIMITS.id) && !(kind === "risk" && id === riskId));
}

function portable(value: unknown, riskId: string, spaceId: string) {
  const wire = shape(value, ["spaceId", "item", "links", "events"]);
  const item = shape(wire.item, itemColumns);
  requireValue(wire.spaceId === spaceId && item.risk_id === riskId);
  requireValue(typeof item.title === "string" && item.title.trim() && text(item.title, RISK_LIMITS.title)
    && text(item.statement, RISK_LIMITS.statement) && text(item.treatment, RISK_LIMITS.treatment)
    && (item.owner_name === null || text(item.owner_name, RISK_LIMITS.owner_name)));
  requireValue(RISK_LEVELS.some(level => level === item.impact) && RISK_LEVELS.some(level => level === item.likelihood)
    && RISK_STATUSES.some(status => status === item.status) && identity(item.created_by) && stamp(item.created_at) && stamp(item.updated_at)
    && (item.status === "closed" ? stamp(item.closed_at) : item.closed_at === null));
  requireValue(Array.isArray(wire.links) && wire.links.length <= RISK_LIMITS.links && Array.isArray(wire.events));
  const links = wire.links.map(value => {
    const row = shape(value, linkColumns);
    checkSubject(row.subject_kind, row.subject_id, riskId);
    requireValue(identity(row.added_by) && stamp(row.added_at));
    return row as SyncPortableRow;
  });
  const events = wire.events.map(value => {
    const row = shape(value, eventColumns);
    requireValue(identity(row.event_id) && identity(row.actor_id) && stamp(row.at) && RISK_EVENT_KINDS.some(kind => kind === row.kind));
    eventDetail(row.kind, json(row.detail_json), riskId);
    return row as SyncPortableRow;
  });
  return { item: item as SyncPortableRow, links, events };
}

export function riskCollection(projectId: string): PluginSyncCollectionDefinition {
  return { tracking, create(db, context) {
    const keyId = (key: string) => {
      const tuple = json(key);
      requireValue(Array.isArray(tuple) && tuple.length === 3 && tuple[0] === projectId && tuple[1] === "risk"
        && typeof tuple[2] === "string" && identity(tuple[2]));
      return tuple[2];
    };
    const ownerRow = (id: string) => {
      return db.prepare(`SELECT ${itemColumns.join(", ")}, revision FROM risk_items WHERE risk_id = ?`).get(id);
    };
    const addRows = (table: string, columns: readonly string[], id: string, rows: readonly SyncPortableRow[]) => {
      const insert = db.prepare(`INSERT INTO ${table} (risk_id, ${columns.join(", ")}) VALUES (${["?", ...columns.map(() => "?")].join(", ")})`);
      for (const row of rows) insert.run(id, ...columns.map(column => row[column] ?? null));
    };
    return {
      authorizeKey(key) {
        keyId(key);
        context.project(projectId);
      },
      belongsToProject: (_key, candidate) => candidate === projectId,
      canUpload: () => context.canUploadProject(projectId),
      read(key) {
        const id = keyId(key), row = ownerRow(id);
        if (!row) return null;
        const item = Object.fromEntries(itemColumns.map(column => [column, row[column]]));
        const links = db.prepare(`SELECT ${linkColumns.join(", ")} FROM risk_links WHERE risk_id = ? ORDER BY subject_kind, subject_id`).all(id);
        const events = db.prepare(`SELECT ${eventColumns.join(", ")} FROM risk_events WHERE risk_id = ? ORDER BY at, event_id`).all(id);
        const value = { spaceId: context.spaceId, item, links, events };
        portable(value, id, context.spaceId);
        return value;
      },
      apply(key, value) {
        const id = keyId(key), current = ownerRow(id);
        if (value === null) {
          db.prepare("DELETE FROM risk_items WHERE risk_id = ?").run(id);
          return;
        }
        const { item, links, events } = portable(value, id, context.spaceId);
        const high = db.prepare("SELECT revision FROM risk_editor_versions WHERE risk_id = ?").get(id)?.revision;
        const revision = Math.max(Number(high ?? 0), Number(current?.revision ?? 0)) + 1;
        db.prepare(`INSERT INTO risk_items (${itemColumns.join(", ")}, revision) VALUES (${[...itemColumns.map(() => "?"), "?"].join(", ")})
          ON CONFLICT(risk_id) DO UPDATE SET ${itemColumns.slice(1).map(column => `${column} = excluded.${column}`).join(", ")}, revision = excluded.revision`)
          .run(...itemColumns.map(column => item[column] ?? null), revision);
        db.prepare("DELETE FROM risk_links WHERE risk_id = ?").run(id);
        db.prepare("DELETE FROM risk_events WHERE risk_id = ?").run(id);
        addRows("risk_links", linkColumns, id, links);
        addRows("risk_events", eventColumns, id, events);
      },
    };
  } };
}

export function riskSyncBindings(context: PluginStartContext, projectId: string): PluginSyncBinding[] {
  const scope = context.sync, service = context.services?.sync;
  if (!scope || !service) return [];
  return [{ collection_id: collection, replica: service.collection(collection, riskCollection(projectId)),
    content: createSyncJsonContent({ spaceId: scope.spaceId, authorize: scope.assertActive }), locate: syncTupleLocation("risk", true, 2) }];
}
