import type { ArtifactReference } from "../modules/artifacts.js";
import type { DirectoryRole } from "../modules/projects.js";
import type { ActionDefinition, ActionSchema } from "./actions.js";
import { defineFileContentAction, defineFileEntriesAction } from "./file-sources.js";
import { defineSubjectContextAction, type ActionSubject } from "./action-subjects.js";
import type { SystemOutputSource } from "./plugin-wiring.js";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_SCHEMA_VERSION, FILE_TEXT_SELECTION_TYPE, FILES_COLLECTION_SCHEMA_VERSION,
  FILES_COLLECTION_TYPE, WORKSPACE_FILE_SUBJECT_KIND, workspaceReadActions, type FileSnapshot, type FileTextSelection, type WorkspaceFileResult } from "../modules/workspace-artifacts.js";
import { fileResult, integer as offset, nullable, object as shape, path as filePath, snapshot as snapshotShape, workspace as workspaceShape } from "../modules/workspace-action-schemas.js";

/**
 * What the materials panel, the picker, "add to task", a citation and a provenance line all call one thing
 * (specs/shared-sources-and-surfaces §2). A reference names a material and says nothing about who may read it: no owner, no project,
 * no installation. Those come from the call context and the action catalog, and what shows beside a reference is read at the moment
 * it shows (`MaterialOrigin`), so a revoked or deleted material cannot answer from an old copy.
 */
export type MaterialPin =
  /** The file as it is now; `read_revision` is the revision read, for telling the person it has moved on since. For a local file that is the sha256 of its bytes or `size:<bytes>`, which `assertMaterialRef` checks. */
  | { mode: "current"; read_revision: string }
  /** A fixed version in the 成果库. */
  | { mode: "fixed"; version: ArtifactReference }
  /** A snapshot or selection: a process item, which never enters the 成果库. */
  | { mode: "snapshot"; version: ArtifactReference };

/** Where in the material a selection falls, in the terms `horizontal/knowledge` uses for its anchors and 1-based lines. */
export interface MaterialRange { anchor?: string; line?: number; length?: number; page?: number }

export interface MaterialRef {
  /** The identity its owner gives. A local file is `WORKSPACE_FILE_SUBJECT_KIND` with id `<workspace_id>:<relative path>`. */
  subject: ActionSubject;
  pin: MaterialPin;
  range?: MaterialRange;
}

/** What shows beside a reference. Read by the platform from the `MaterialRef` under the caller's current authority; never stored with it. */
export interface MaterialOrigin {
  source: "directory" | "import" | "object";
  /** For display. The platform finds the owner through the action catalog and does not authorize by this. */
  owner: { kind: "plugin" | "system"; id: string; title: string };
  /**
   * With source "directory": always for ok, changed, truncated and unreadable; for missing and forbidden only when the platform could tell
   * which directory; never for unmapped.
   */
  directory?: { workspace_id: string; display_name: string; roles: DirectoryRole[] };
  /** `unmapped`: the id is not a directory of this project, and no folder has been named for it. Only with `source: "directory"`, and then without `directory`. */
  state: "ok" | "changed" | "missing" | "forbidden" | "truncated" | "unreadable" | "unmapped";
  note?: string;
}

/**
 * One line of "recently used": the stored reference and its origin as read just now (§2.1). `origin` is null only to the person, when
 * no one owner can be found for it now (its plugin was uninstalled, or more than one declares its kind); a plugin is not given the line.
 */
export interface RecentMaterial { ref: MaterialRef; origin: MaterialOrigin | null }

/**
 * One item `materials.origins@1` reads: a full reference, or only its subject when no revision was kept (an old Goal input with no
 * fingerprint). A subject alone is only looked for, never compared, and always says `unchecked`.
 */
export type MaterialOriginQuery = { ref: MaterialRef } | { subject: ActionSubject };
/**
 * The origin of one item, in the order asked. Null to a plugin for what it cannot read, what is gone, or what has no one owner now: it
 * is not told which. Null to the person only for what has no one owner now (its plugin was uninstalled, or more than one declares its kind).
 */
export interface MaterialOriginAnswer { origin: MaterialOrigin | null }
/** How many items one `materials.origins@1` call reads. */
export const MATERIAL_ORIGINS_MAX = 20;
/** How many `current` references one read compares by content; the rest are only looked for. */
export const MATERIAL_ORIGINS_COMPARE = 5;
/** The notes the platform writes into an origin (Chinese source text, translated where shown). */
export const MATERIAL_ORIGIN_NOTES = {
  unchecked: "内容没有核对",
  former_default_output: "这个项目原来的默认输出目录",
  other_default_output: "另一台设备的默认输出目录",
} as const;

export const MATERIAL_REF_LIMITS = {
  subject_kind: 200,
  /** The longest workspace file id: a 200-character folder id, the colon, and 64 path segments of 255 with their separators. */
  subject_id: 16_584,
  revision: 1000,
  artifact_id: 200,
  /** What `knowledge.read` takes, so a stored anchor can always be read back. */
  anchor: 200,
} as const;
/** How many references one `materials.recent.record@1` call takes. */
export const MATERIAL_RECENT_RECORD_MAX = 10;
/** How many references one caller keeps in one project, which is also the most `materials.recent@1` returns. */
export const MATERIAL_RECENT_KEEP = 20;

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const positive = { type: "integer", minimum: 1 };
const closed = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const version = closed({ artifact_id: text(MATERIAL_REF_LIMITS.artifact_id), version: positive });
const roles = ["input", "output"] satisfies DirectoryRole[];

/** The JSON shape only. A workspace file id's path also has to stay inside its folder, and its `read_revision` has to be the sha256 of its bytes or `size:<bytes>`, so an owner runs `assertMaterialRef` on what it accepts. */
const subject = closed({ kind: text(MATERIAL_REF_LIMITS.subject_kind), id: text(MATERIAL_REF_LIMITS.subject_id) });
export const MATERIAL_REF_SCHEMA: ActionSchema = closed({
  subject,
  pin: { oneOf: [
    closed({ mode: { const: "current" }, read_revision: text(MATERIAL_REF_LIMITS.revision) }),
    closed({ mode: { const: "fixed" }, version }),
    closed({ mode: { const: "snapshot" }, version }),
  ] },
  range: { ...closed({ anchor: text(MATERIAL_REF_LIMITS.anchor), line: positive, length: positive, page: positive }, []), minProperties: 1 },
}, ["subject", "pin"]);

const anyText = { type: "string" };
export const MATERIAL_ORIGIN_SCHEMA: ActionSchema = {
  ...closed({
    source: { enum: ["directory", "import", "object"] },
    owner: closed({ kind: { enum: ["plugin", "system"] }, id: anyText, title: anyText }),
    directory: closed({ workspace_id: anyText, display_name: anyText, roles: { type: "array", items: { enum: roles }, minItems: 1, uniqueItems: true } }),
    state: { enum: ["ok", "changed", "missing", "forbidden", "truncated", "unreadable", "unmapped"] },
    note: anyText,
  }, ["source", "owner", "state"]),
  if: { properties: { state: { const: "unmapped" } } },
  then: { properties: { source: { const: "directory" } }, not: { required: ["directory"] } },
  else: {
    if: { properties: { source: { const: "directory" } } },
    // A folder this project no longer has, or one the caller may not read, can leave its name and roles out.
    then: { if: { properties: { state: { enum: ["missing", "forbidden"] } } }, then: true, else: { required: ["directory"] } },
    else: { not: { required: ["directory"] } },
  },
};

export const MATERIAL_ORIGIN_QUERY_SCHEMA: ActionSchema = { oneOf: [closed({ ref: MATERIAL_REF_SCHEMA }), closed({ subject })] };
export const MATERIAL_ORIGIN_ANSWER_SCHEMA: ActionSchema = closed({ origin: { anyOf: [MATERIAL_ORIGIN_SCHEMA, { type: "null" }] } });

/** The platform's materials service (Files retirement, specs/batch-06-shared-tools §3): a system provider of actions and of process items. */
export const MATERIALS_PROVIDER_ID = "system.materials";

/** Its four output ports: the folder being read, a fixed text before and after, and a fixed selection. `before` and `after` share one type. */
export const MATERIALS_PORTS = Object.freeze({ files: "files", before: "before", after: "after", selection: "selection" } as const);
export type MaterialsPort = typeof MATERIALS_PORTS[keyof typeof MATERIALS_PORTS];

/** The one registration of the platform as a producer: what it may write and which ports it offers. */
export const SYSTEM_MATERIALS_SOURCE: SystemOutputSource = Object.freeze({
  plugin_id: MATERIALS_PROVIDER_ID,
  name: "资料",
  signature: "molis-work:system.materials",
  process_items: Object.freeze([
    Object.freeze({ artifact_type_id: FILES_COLLECTION_TYPE, schema_version: FILES_COLLECTION_SCHEMA_VERSION }),
    Object.freeze({ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }),
    Object.freeze({ artifact_type_id: FILE_TEXT_SELECTION_TYPE, schema_version: FILE_TEXT_SELECTION_SCHEMA_VERSION }),
  ]),
  outputs: Object.freeze([
    Object.freeze({ port: MATERIALS_PORTS.files, artifact_type_id: FILES_COLLECTION_TYPE, schema_version: FILES_COLLECTION_SCHEMA_VERSION }),
    Object.freeze({ port: MATERIALS_PORTS.before, artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }),
    Object.freeze({ port: MATERIALS_PORTS.after, artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }),
    Object.freeze({ port: MATERIALS_PORTS.selection, artifact_type_id: FILE_TEXT_SELECTION_TYPE, schema_version: FILE_TEXT_SELECTION_SCHEMA_VERSION }),
  ]),
});

/** The platform producers a Manifest may name as a port's `default_source` and a binding may read from: today only the materials service. */
export const SYSTEM_OUTPUT_SOURCES: readonly SystemOutputSource[] = Object.freeze([SYSTEM_MATERIALS_SOURCE]);
export const systemOutputSource = (pluginId: string): SystemOutputSource | undefined => SYSTEM_OUTPUT_SOURCES.find(source => source.plugin_id === pluginId);

/** The version the platform records as `producer_plugin_version` on what the materials service writes; its `signature` is what is checked. */
export const SYSTEM_MATERIALS_PRODUCER_VERSION = /* @version identity.system.materials-producer */ "1";

/** One of the project's folders as the materials service shows it; `handle` is the folder's id, never a path. */
export interface MaterialsWorkspace { workspace_id: string; name: string; handle: string }
export interface MaterialsOpenInput { workspace_id: string; path: readonly string[] }
export interface MaterialsOpenResult { workspace: MaterialsWorkspace; result: WorkspaceFileResult; path: readonly string[] }
/** The ports a capture may also hand its version to. */
export type MaterialsCapturePort = "before" | "after" | "selection";
/**
 * Fix the text the caller has seen (its `fingerprint`), or a UTF-16 half-open range of it. With `port`, the version is also handed on
 * at that output in the same commit; without, only the reference is returned.
 */
export interface MaterialsCaptureInput {
  workspace_id: string; path: readonly string[];
  /** What the caller saw of a file read whole (its fingerprint); a file read in windows names the window instead (`cursor`). */
  fingerprint?: string;
  /** The `window.cursor` of the window a selection of a long file falls in: the owner reads that window again and cuts from it. */
  cursor?: string;
  port?: MaterialsCapturePort; start?: number; end?: number;
}
export interface MaterialsCaptureResult { ref: MaterialRef; port: MaterialsCapturePort | null; snapshot: FileSnapshot | FileTextSelection }
/**
 * `head` checks the reference and says what it names now; `text` also returns its text. A file too long for one read is read in windows:
 * the first without `cursor`, each next with the `next_cursor` the last one gave.
 */
export interface MaterialsReadInput { ref: MaterialRef; mode: "head" | "text"; cursor?: string }
/**
 * One window of a long file: its text starts at UTF-16 offset `start` of the whole file. `cursor` names this window (to fix a selection in
 * it), `next_cursor` the next one, null at the end. Both are the owner's, bound to this project, this person and this file as it was read:
 * any change to the file, and a restarted Host, ends them; read from the start again.
 */
export interface MaterialsReadWindow { start: number; cursor: string; next_cursor: string | null }
export interface MaterialsReadResult {
  /** The reference as its owner states it: the same material, nothing the caller wrote that the owner does not keep. */
  ref: MaterialRef;
  title: string;
  /** The revision read now; for a file, the sha256 of its bytes, or `size:<bytes>` when it was too large to read whole. */
  read_revision: string;
  /** False when `read_revision` cannot be compared with another (a size only). */
  comparable: boolean;
  /** `changed`: a `current` reference whose revision is not the one read now. Fixed and snapshot versions never change. */
  state: "ok" | "changed";
  /** Only with `mode: "text"`. */
  text?: string;
  /** A selection's UTF-16 half-open range in the file it was cut from, as its owner recorded it. */
  selection?: { start: number; end: number };
  /** Only for a file read in windows. */
  window?: MaterialsReadWindow;
}
/** The longest cursor: it carries the file's reference id. */
export const MATERIALS_CURSOR_MAX = 24_000;

/**
 * What a fixed version of the materials service stands for, restored from the version alone (a Goal keeps only its id and version):
 * the full reference, its title and digest, or nulls when the caller cannot read it, with no path.
 */
export interface MaterialsPinnedInput { versions: readonly ArtifactReference[] }
export interface MaterialsPinnedResult { items: Array<{ version: ArtifactReference; ref: MaterialRef | null; title: string | null; read_revision: string | null }> }
/** The most versions one `materials.pinned` reads. */
export const MATERIALS_PINNED_MAX = 100;

/** Where a person was last reading in this project: a folder of it and a path in it, never an absolute path. */
export interface MaterialsPosition { workspace_id: string; path: readonly string[] }

// Reading a folder needs the one workspace read action and the project's folders; the callers hold `workspace:read` for it.
const materialsReading = { permissions: ["workspace:read"], required_actions: [
  { capability_id: workspaceReadActions.file.capability_id, version: workspaceReadActions.file.version },
  { capability_id: "projects.directories.get", version: /* @version action.projects.directories.get */ 1 },
] };
const capturePort = { enum: ["before", "after", "selection"] };
const cursorShape = { type: "string", minLength: 1, maxLength: MATERIALS_CURSOR_MAX };

/**
 * The platform's materials service (Files retirement, specs/batch-06-shared-tools §3 and materials-ui-contract §1, §5): open a file of the
 * project's folders, fix what was seen as a process item, and read a reference back. Project, person and calling plugin come from the call.
 */
export const materialsActions = {
  open: {
    capability_id: "materials.open",
    version: /* @version action.materials.open */ 1,
    operation: "command",
    action: { title: "打开资料", description: "有界读取项目文件夹里的一个文本文件，记下阅读位置；文件夹可列出时，同时把它作为文件集合交给接了「资料」输出的插件",
      kind: "operation", scope: "project", scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: ["workspace", "file"], ...materialsReading,
      input_schema: shape({ workspace_id: { type: "string", minLength: 1 }, path: filePath }),
      output_schema: shape({ workspace: workspaceShape, result: fileResult, path: filePath }) },
  } as ActionDefinition<MaterialsOpenInput, MaterialsOpenResult>,
  capture: {
    capability_id: "materials.capture",
    version: /* @version action.materials.capture */ 1,
    operation: "command",
    action: { title: "固定资料", description: "重新读取并核对看过的指纹，把全文或一段选区固定成过程项并返回它的引用；给了 port 时同一次提交交到这个输出；不改原文件",
      kind: "operation", scope: "project", scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: ["workspace", "file"], ...materialsReading,
      input_schema: { ...shape({ workspace_id: { type: "string", minLength: 1 }, path: filePath, fingerprint: { type: "string", minLength: 1, maxLength: MATERIAL_REF_LIMITS.revision },
        cursor: cursorShape, port: capturePort, start: offset, end: offset }, ["workspace_id", "path"]), oneOf: [{ required: ["fingerprint"] }, { required: ["cursor", "start", "end"] }] },
      output_schema: shape({ ref: MATERIAL_REF_SCHEMA, port: nullable(capturePort), snapshot: snapshotShape }) },
  } as ActionDefinition<MaterialsCaptureInput, MaterialsCaptureResult>,
  read: {
    capability_id: "materials.read",
    version: /* @version action.materials.read */ 1,
    operation: "query",
    action: { title: "读取资料引用", description: "按调用方此刻的授权读一份资料引用：head 只核对它现在指向什么，text 同时返回正文；读不了的拒绝，不交付内容",
      kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: ["workspace", "file"], ...materialsReading,
      input_schema: shape({ ref: MATERIAL_REF_SCHEMA, mode: { enum: ["head", "text"] }, cursor: cursorShape }, ["ref", "mode"]),
      output_schema: shape({ ref: MATERIAL_REF_SCHEMA, title: { type: "string" }, read_revision: { type: "string", minLength: 1 }, comparable: { type: "boolean" },
        state: { enum: ["ok", "changed"] }, text: { type: "string" }, selection: shape({ start: offset, end: offset }),
        window: shape({ start: offset, cursor: cursorShape, next_cursor: nullable(cursorShape) }) }, ["ref", "title", "read_revision", "comparable", "state"]),
      output_type: "materials.read" },
  } as ActionDefinition<MaterialsReadInput, MaterialsReadResult>,
  position: {
    capability_id: "materials.position",
    version: /* @version action.materials.position */ 1,
    operation: "query",
    action: { title: "上次阅读位置", description: "读取调用的人在当前项目里上次打开的文件；那个文件夹已不在项目里时为空；只读",
      kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user", "plugin"], subject_kinds: ["project"], ...materialsReading,
      input_schema: shape({}),
      output_schema: shape({ position: nullable(shape({ workspace_id: { type: "string", minLength: 1 }, path: filePath })) }),
      output_type: "materials.position" },
  } as ActionDefinition<Record<string, never>, { position: MaterialsPosition | null }>,
  pinned: {
    capability_id: "materials.pinned",
    version: /* @version action.materials.pinned */ 1,
    operation: "query",
    action: { title: "固定资料的出处", description: "按过程项的 id 与版本读回平台资料固定下来的快照或选区，给出它的完整引用、题名与摘要；读不了的（已不在、不是平台资料固定的、不是调用的人的）给空，不给路径；只读",
      kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: ["file"], ...materialsReading,
      input_schema: shape({ versions: { type: "array", minItems: 1, maxItems: MATERIALS_PINNED_MAX, items: version } }),
      output_schema: shape({ items: { type: "array", items: shape({ version, ref: nullable(MATERIAL_REF_SCHEMA), title: nullable({ type: "string" }), read_revision: nullable({ type: "string" }) }) } }),
      output_type: "materials.pinned" },
  } as ActionDefinition<MaterialsPinnedInput, MaterialsPinnedResult>,
};

/**
 * The files of the project's folders as a side panel source (materials-ui-contract §6): every folder of the project, listed under its name
 * and previewed in place. They took over from the Files plugin's `files.side.*`; no plugin page opens them.
 */
/** The workbench's main-area reader of the project's folders: where a listed file opens when the person asks for room to read. */
export const MATERIALS_SURFACE = "materials";
const projectFileKinds = [{ kind: WORKSPACE_FILE_SUBJECT_KIND, title: "项目文件夹里的文件", surface: MATERIALS_SURFACE }];
const readingFolders = <Definition extends ActionDefinition>(definition: Definition): Definition => ({ ...definition, action: { ...definition.action, ...materialsReading } });
export const materialsFileSource = {
  entries: /* @__PURE__ */ readingFolders(defineFileEntriesAction("materials.files.entries", /* @version action.materials.files.entries */ 1, projectFileKinds, "项目文件夹", [])),
  content: /* @__PURE__ */ readingFolders(defineFileContentAction("materials.files.content", /* @version action.materials.files.content */ 1, projectFileKinds, "项目文件夹", [])),
  /** The one reader of a project-folder file's context (`isSubjectReader`): what Placement and the other subject readers find for `workspace_file`. */
  subject: /* @__PURE__ */ readingFolders(defineSubjectContextAction("materials.subject.read", /* @version action.materials.subject.read */ 1, WORKSPACE_FILE_SUBJECT_KIND, "项目文件夹里的文件", [])),
};
