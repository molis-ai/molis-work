import type { ArtifactReference } from "../modules/artifacts.js";
import type { DirectoryRole } from "../modules/projects.js";
import type { ActionSchema } from "./actions.js";
import type { ActionSubject } from "./action-subjects.js";

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

/** One line of "recently used": the stored reference and its origin as read just now (§2.1). */
export interface RecentMaterial { ref: MaterialRef; origin: MaterialOrigin }

/**
 * One item `materials.origins@1` reads: a full reference, or only its subject when no revision was kept (an old Goal input with no
 * fingerprint). A subject alone is only looked for, never compared, and always says `unchecked`.
 */
export type MaterialOriginQuery = { ref: MaterialRef } | { subject: ActionSubject };
/** The origin of one item, in the order asked. Null only to a plugin, for what it cannot read or what is gone: it is not told which. */
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
