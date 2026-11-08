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
  /** Present when `source` is `directory` and `state` is not `unmapped`. */
  directory?: { workspace_id: string; display_name: string; roles: DirectoryRole[] };
  /** `unmapped`: the id is not a directory of this project, and no folder has been named for it. Only with `source: "directory"`, and then without `directory`. */
  state: "ok" | "changed" | "missing" | "forbidden" | "truncated" | "unreadable" | "unmapped";
  note?: string;
}

/** One line of "recently used": the stored reference and its origin as read just now (§2.1). */
export interface RecentMaterial { ref: MaterialRef; origin: MaterialOrigin }

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
export const MATERIAL_REF_SCHEMA: ActionSchema = closed({
  subject: closed({ kind: text(MATERIAL_REF_LIMITS.subject_kind), id: text(MATERIAL_REF_LIMITS.subject_id) }),
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
    then: { required: ["directory"] },
    else: { not: { required: ["directory"] } },
  },
};
