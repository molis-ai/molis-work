import type { ActionDefinition } from "./actions.js";
import type { PluginManifest } from "./plugin-manifest.js";
import type { PluginSyncCollection } from "./plugin-sync.js";

/** Platform owner for unified plugin data-section inspection and business-data export (Audit #7, PEQ-09). */
export const PLUGIN_DATA_PROVIDER_ID = "system.plugin-data";
export const PLUGIN_DATA_EXPORT_PERMISSION = "plugin-data:export";
export const PLUGIN_DATA_EXPORT_FORMAT = "molis-work-plugin-data" as const;
export const PLUGIN_DATA_EXPORT_VERSION = /* @version format.plugin.data.export */ 1;

/** Unified description of one plugin data section derived once from Manifest `sync.collections` / `databases`. */
export interface PluginDataSectionDeclaration {
  readonly plugin_id: string;
  readonly section_id: string;
  readonly title: string;
  readonly scope: "home" | "project";
  readonly schema_version: number;
  readonly tables: readonly string[];
  readonly files: readonly string[];
}

/** Read-only snapshot of one file inside a plugin's declared `owner_files` tree. */
export interface PluginDataFileSnapshot {
  readonly path: string;
  readonly byte_length: number;
  readonly content_base64?: string;
  readonly truncated?: boolean;
}

/** Portable read-only snapshot of one plugin data section (used by business export and work-asset bundles). */
export interface PluginDataSectionSnapshot {
  readonly plugin_id: string;
  readonly section_id: string;
  readonly schema_version: number;
  readonly title?: string;
  readonly items: readonly unknown[];
  readonly files?: readonly PluginDataFileSnapshot[];
  readonly truncated?: boolean;
}

export interface PluginDataExportResult {
  readonly format: typeof PLUGIN_DATA_EXPORT_FORMAT;
  readonly version: typeof PLUGIN_DATA_EXPORT_VERSION;
  readonly plugin_id: string;
  readonly project_id: string | null;
  readonly exported_at: string;
  readonly sections: readonly PluginDataSectionSnapshot[];
}

function collectionTables(collection: PluginSyncCollection): string[] {
  const fromSections = (collection.sections?.business ?? []).flatMap(section => section.tables.map(table => table.name));
  const fromTracking = (collection.tracking ?? []).map(row => row.table);
  const fromAggregates = (collection.aggregates ?? []).flatMap(row => [row.table, ...row.children.map(child => child.table)]);
  return [...new Set([...fromSections, ...fromTracking, ...fromAggregates])];
}

function defaultScope(manifest: Pick<PluginManifest, "databases">): "home" | "project" {
  return manifest.databases?.home && !manifest.databases?.project ? "home" : "project";
}

/** Derive a plugin's portable data sections once from its Manifest declarations (`sync.collections` and `databases`). */
export function pluginDataSectionsFromManifest(
  manifest: Pick<PluginManifest, "plugin_id" | "name" | "databases" | "sync" | "owner_files">,
): PluginDataSectionDeclaration[] {
  const files = (manifest.owner_files?.entries ?? []).map(entry => entry.name);
  const collections = manifest.sync?.collections ?? [];
  if (collections.length > 0) {
    return collections.map(collection => ({
      plugin_id: manifest.plugin_id, section_id: collection.id, title: collection.title,
      scope: collection.database ?? defaultScope(manifest), schema_version: collection.schema_version,
      tables: collectionTables(collection), files,
    }));
  }
  const scopes = (["project", "home"] as const).flatMap(scope => manifest.databases?.[scope] ? [[scope, manifest.databases[scope]!] as const] : []);
  if (scopes.length > 0) {
    return scopes.map(([scope, db]) => ({
      plugin_id: manifest.plugin_id, section_id: db.store_name, title: manifest.name,
      scope, schema_version: db.version, tables: [], files,
    }));
  }
  if (manifest.owner_files) {
    return [{
      plugin_id: manifest.plugin_id, section_id: manifest.owner_files.store_name, title: manifest.name,
      scope: "home", schema_version: /* @version format.plugin.data.export */ 1, tables: [], files,
    }];
  }
  return [];
}

const sectionDeclarationSchema = {
  type: "object", additionalProperties: false,
  required: ["plugin_id", "section_id", "title", "scope", "schema_version", "tables", "files"],
  properties: {
    plugin_id: { type: "string" }, section_id: { type: "string" }, title: { type: "string" },
    scope: { enum: ["home", "project"] }, schema_version: { type: "integer", minimum: 1 },
    tables: { type: "array", items: { type: "string" } }, files: { type: "array", items: { type: "string" } },
  },
} as const;

const fileSnapshotSchema = {
  type: "object", additionalProperties: false,
  required: ["path", "byte_length"],
  properties: {
    path: { type: "string" }, byte_length: { type: "integer", minimum: 0 },
    content_base64: { type: "string" }, truncated: { type: "boolean" },
  },
} as const;

const sectionSnapshotSchema = {
  type: "object", additionalProperties: false,
  required: ["plugin_id", "section_id", "schema_version", "items"],
  properties: {
    plugin_id: { type: "string" }, section_id: { type: "string" }, schema_version: { type: "integer", minimum: 1 },
    title: { type: "string" }, items: { type: "array" },
    files: { type: "array", items: fileSnapshotSchema }, truncated: { type: "boolean" },
  },
} as const;

export const pluginDataActions = {
  sections: {
    capability_id: "plugins.data.sections", version: /* @version action.plugins.data.sections */ 1, operation: "query",
    action: {
      kind: "query", scope: "home", audiences: ["user"], permissions: [PLUGIN_DATA_EXPORT_PERMISSION], subject_kinds: [],
      title: "列出插件数据分段声明",
      description: "按插件 Manifest 的单一分段声明列出某个插件或全部已装配／已安装插件的数据分段清单。",
      input_schema: {
        type: "object", additionalProperties: false,
        properties: { plugin_id: { type: "string", minLength: 1, maxLength: 200 }, project_id: { type: "string", minLength: 1, maxLength: 200 } },
      },
      output_schema: {
        type: "object", additionalProperties: false, required: ["sections"],
        properties: { sections: { type: "array", items: sectionDeclarationSchema } },
      },
    },
  } as ActionDefinition<{ plugin_id?: string; project_id?: string }, { sections: PluginDataSectionDeclaration[] }>,
  export: {
    capability_id: "plugins.data.export", version: /* @version action.plugins.data.export */ 1, operation: "query",
    action: {
      kind: "query", scope: "home", audiences: ["user"], permissions: [PLUGIN_DATA_EXPORT_PERMISSION], subject_kinds: [],
      title: "导出插件业务数据",
      description: "按插件声明的数据分段以只读方式导出其业务表内容，内置插件与已安装插件走同一条路。",
      input_schema: {
        type: "object", additionalProperties: false, required: ["plugin_id"],
        properties: { plugin_id: { type: "string", minLength: 1, maxLength: 200 }, project_id: { type: "string", minLength: 1, maxLength: 200 } },
      },
      output_schema: {
        type: "object", additionalProperties: false,
        required: ["format", "version", "plugin_id", "project_id", "exported_at", "sections"],
        properties: {
          format: { const: PLUGIN_DATA_EXPORT_FORMAT }, version: { const: PLUGIN_DATA_EXPORT_VERSION },
          plugin_id: { type: "string" }, project_id: { type: ["string", "null"] }, exported_at: { type: "string" },
          sections: { type: "array", items: sectionSnapshotSchema },
        },
      },
    },
  } as ActionDefinition<{ plugin_id: string; project_id?: string }, PluginDataExportResult>,
} as const;
