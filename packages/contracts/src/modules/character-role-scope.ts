import { inputSchemaFor } from "../platform/action-input.js";
import { ACTION_REFERENCE_SCHEMA } from "../platform/action-offers.js";
import type { ActionSchema, ExactActionReference } from "../platform/actions.js";
import { BLUEPRINT_PART_ORIGIN_SCHEMA, type BlueprintPartOrigin } from "../platform/blueprint-source.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import type { CharacterImportSnapshot } from "./character-import.js";

/** Stable references. The owner resolves them in the caller's trusted scope. */
export type PersonalCharacterRef = { kind: "personal"; character_id: string };
export type ProjectCharacterMemberRef = { kind: "project"; member_id: string };
export type PersonalCharacterVersionRef = PersonalCharacterRef & { version: number };
export type ProjectCharacterVersionRef = ProjectCharacterMemberRef & {
  member_version: number;
  original: PersonalCharacterVersionRef;
};
export type CharacterRoleVersionRef = PersonalCharacterVersionRef | ProjectCharacterVersionRef;

export type CharacterRoleSection = "work_style" | "capabilities";
export type CharacterSectionStatus =
  | { mode: "follow" }
  | { mode: "override"; based_on_original_version: number; original_changed: boolean };

export type CharacterRole =
  | {
      layer: "personal";
      state: "active" | "disabled";
      draft_revision: number;
      current: PersonalCharacterVersionRef;
      origin: BlueprintPartOrigin | null;
    }
  | {
      layer: "project";
      state: "active" | "disabled";
      revision: string;
      current: ProjectCharacterVersionRef;
      origin: BlueprintPartOrigin | null;
      sections: Record<CharacterRoleSection, CharacterSectionStatus>;
    };

export type CharacterDefaultSelection =
  | { layer: "personal"; selection: PersonalCharacterRef | null }
  | { layer: "project"; selection: ProjectCharacterMemberRef | { kind: "assistant" } | null };

export type CharacterTaskSelection = PersonalCharacterRef | ProjectCharacterMemberRef | { kind: "assistant" };

/** Whether a fixed version belongs to the selected original or project member. */
export function characterVersionMatchesSelection(version: CharacterRoleVersionRef, selection: CharacterTaskSelection): boolean {
  if (version.kind === "personal") return selection.kind === "personal" && selection.character_id === version.character_id;
  return version.kind === "project" && selection.kind === "project" && selection.member_id === version.member_id;
}

export type EffectiveCharacterSelection =
  | { kind: "role"; source: "task"; version: CharacterRoleVersionRef }
  | { kind: "role"; source: "project"; version: ProjectCharacterVersionRef }
  | { kind: "role"; source: "personal"; version: PersonalCharacterVersionRef }
  | { kind: "assistant"; source: "task" | "project" }
  | { kind: "assistant"; source: "assistant"; stopped_project_default?: ProjectCharacterMemberRef };

export type CharacterTemplateAdoptionResult = {
  outcome: "created" | "reused";
  origin: BlueprintPartOrigin;
  role: CharacterRole;
};

export type CharacterRoleReadQuery =
  | { by: "role"; role: PersonalCharacterRef | ProjectCharacterMemberRef }
  | { by: "request"; layer: "personal" | "project"; request_id: string };

export type CharacterRoleReadInput = { queries: CharacterRoleReadQuery[] };

export type CharacterRoleReadResult =
  | { kind: "missing" }
  | { kind: "role"; role: CharacterRole }
  | { kind: "receipt"; receipt: CharacterTemplateAdoptionResult; current: CharacterRole | null };

export type CharacterRoleReadOutput = { results: CharacterRoleReadResult[] };

const nonEmptyString = { type: "string", minLength: 1 } as const;
const positiveSafeInteger = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } as const;
const nullValue = { type: "null" } as const;
const personalRef = closedObjectSchema({ kind: { const: "personal" }, character_id: nonEmptyString });
export const projectRef = closedObjectSchema({ kind: { const: "project" }, member_id: nonEmptyString });
const assistant = closedObjectSchema({ kind: { const: "assistant" } });
export const personalVersion = closedObjectSchema({ ...personalRef.properties, version: positiveSafeInteger });
export const projectVersion = closedObjectSchema({
  ...projectRef.properties,
  member_version: positiveSafeInteger,
  original: personalVersion,
});

export const CHARACTER_ROLE_VERSION_REF_SCHEMA: ActionSchema = { oneOf: [personalVersion, projectVersion] };
/** A task's stable choice as a caller names it (never a version: the Host pins that): an original, a member, or the Assistant itself. */
export const CHARACTER_TASK_SELECTION_SCHEMA: ActionSchema = { oneOf: [personalRef, projectRef, assistant] };

const sectionStatus = { oneOf: [
  closedObjectSchema({ mode: { const: "follow" } }),
  closedObjectSchema({
    mode: { const: "override" },
    based_on_original_version: positiveSafeInteger,
    original_changed: { type: "boolean" },
  }),
] };
const state = { enum: ["active", "disabled"] };
const origin = { anyOf: [BLUEPRINT_PART_ORIGIN_SCHEMA, nullValue] };
const roleSchema: ActionSchema = { oneOf: [
  closedObjectSchema({ layer: { const: "personal" }, state, draft_revision: positiveSafeInteger, current: personalVersion, origin }),
  closedObjectSchema({
    layer: { const: "project" },
    state,
    revision: nonEmptyString,
    current: projectVersion,
    origin,
    sections: closedObjectSchema({ work_style: sectionStatus, capabilities: sectionStatus }),
  }),
] };

export const CHARACTER_DEFAULT_SELECTION_SCHEMA = inputSchemaFor<CharacterDefaultSelection>()({ oneOf: [
  closedObjectSchema({ layer: { const: "personal" }, selection: { oneOf: [personalRef, nullValue] } }),
  closedObjectSchema({ layer: { const: "project" }, selection: { oneOf: [projectRef, assistant, nullValue] } }),
] });

export const CHARACTER_EFFECTIVE_SELECTION_SCHEMA: ActionSchema = { oneOf: [
  closedObjectSchema({ kind: { const: "role" }, source: { const: "task" }, version: CHARACTER_ROLE_VERSION_REF_SCHEMA }),
  closedObjectSchema({ kind: { const: "role" }, source: { const: "project" }, version: projectVersion }),
  closedObjectSchema({ kind: { const: "role" }, source: { const: "personal" }, version: personalVersion }),
  closedObjectSchema({ kind: { const: "assistant" }, source: { enum: ["task", "project"] } }),
  closedObjectSchema({
    kind: { const: "assistant" },
    source: { const: "assistant" },
    stopped_project_default: projectRef,
  }, ["kind", "source"]),
] };

export const CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA: ActionSchema = closedObjectSchema({
  outcome: { enum: ["created", "reused"] },
  origin: BLUEPRINT_PART_ORIGIN_SCHEMA,
  role: roleSchema,
});

const readBatchLimit = 128;
const readQuerySchema = { oneOf: [
  closedObjectSchema({ by: { const: "role" }, role: { oneOf: [personalRef, projectRef] } }),
  closedObjectSchema({ by: { const: "request" }, layer: { enum: ["personal", "project"] }, request_id: nonEmptyString }),
] } as const;

export const CHARACTER_ROLE_READ_INPUT_SCHEMA = inputSchemaFor<CharacterRoleReadInput>()(closedObjectSchema({
  queries: { type: "array", minItems: 1, maxItems: readBatchLimit, items: readQuerySchema },
}));

export const CHARACTER_ROLE_READ_RESULT_SCHEMA: ActionSchema = { oneOf: [
  closedObjectSchema({ kind: { const: "missing" } }),
  closedObjectSchema({ kind: { const: "role" }, role: roleSchema }),
  closedObjectSchema({
    kind: { const: "receipt" },
    receipt: CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA,
    current: { anyOf: [roleSchema, nullValue] },
  }),
] };

export const CHARACTER_ROLE_READ_OUTPUT_SCHEMA: ActionSchema = closedObjectSchema({
  results: { type: "array", minItems: 1, maxItems: readBatchLimit, items: CHARACTER_ROLE_READ_RESULT_SCHEMA },
});

// ---- What a role says, the catalog and the fixed snapshot (specs/onboarding-coverage/role-service-design.md §2–§5) ---------------

/**
 * What a fixed version says. The same fields as a draft's content: `host_tools` null inherits the caller's set and [] removes every
 * Host tool; `action_tools` absent or null inherits the run's selection and [] excludes every action. A member's sections replace
 * `instructions` (work_style) or both tool fields (capabilities); the title always comes from the original.
 */
export interface CharacterRoleContent {
  title: string;
  instructions: string;
  host_tools: string[] | null;
  action_tools?: ExactActionReference[] | null;
  import_snapshot?: CharacterImportSnapshot;
}

/** The role a task runs with, fixed when it starts: the version it is, what that version says, and whose and where it is. */
export type CharacterRoleSnapshot = CharacterRoleContent & {
  version: CharacterRoleVersionRef;
  character_id: string;
  /** The project the member belongs to, or null for a personal original. */
  project_id: string | null;
  owner_actor_id: string;
  saved_at: string;
};

/** Why a role cannot be chosen now. The page words it; nothing stores the words. */
export type CharacterRoleUnavailable = "disabled" | "original_disabled" | "unsaved";
export type CharacterRoleAvailability = { available: true } | { available: false; reason: CharacterRoleUnavailable };
/** What a role's current version asks of a run: its tools, and the names of the Skills it imported (a run may pick some). */
type CharacterRoleTools = Pick<CharacterRoleContent, "host_tools" | "action_tools"> & { imported_skills?: CharacterImportedSkillEntry[] };
export type CharacterImportedSkillEntry = { id: string; name: string; compatibility: "portable" | "native-only"; reason?: string };

/** One of the person's originals: its current version (null until saved once), where it is used and whether it can be chosen. */
export type CharacterOriginalEntry = CharacterRoleTools & {
  ref: PersonalCharacterRef;
  title: string;
  state: "active" | "disabled";
  draft_revision: number;
  version: number | null;
  origin: BlueprintPartOrigin | null;
  /** Live members in projects, and how many of them changed a section. */
  use: { projects: number; changed: number };
  availability: CharacterRoleAvailability;
};

/** A member of this project as a role, with its original's title and the tools its current version asks for. */
export type CharacterMemberEntry = CharacterRoleTools & {
  role: Extract<CharacterRole, { layer: "project" }>;
  title: string;
  availability: CharacterRoleAvailability;
};

/**
 * Everything the picker and the two settings pages show, read once: the person's originals, this project's members (none in personal
 * work), the two default layers and the role a new task gets now. The capability-pack catalog reads scope, source and use from it too.
 */
export interface CharacterRoleCatalog {
  /** False in personal work: there is no project layer and no member. */
  in_project: boolean;
  originals: CharacterOriginalEntry[];
  members: CharacterMemberEntry[];
  defaults: CharacterDefaults;
  effective: EffectiveCharacterSelection;
}

export type CharacterDefaults = {
  personal: PersonalCharacterRef | null;
  project: ProjectCharacterMemberRef | { kind: "assistant" } | null;
};

/** A fixed version as the drawer lists it, newest first; `sections` says how a member's version took each section. */
export type CharacterRoleVersionEntry = {
  ref: CharacterRoleVersionRef;
  saved_at: string;
  content: CharacterRoleContent;
  current: boolean;
  sections?: Record<CharacterRoleSection, "follow" | "override">;
};

/** What a task keeps when it starts: the effective value, the stable choice (never a version: the Host pins that) and its title. */
export type CharacterRoleResolution = { effective: EffectiveCharacterSelection; selection: CharacterTaskSelection; title?: string };

const roleTitle = { type: "string", minLength: 1, maxLength: 120 } as const;
const hostTools = { anyOf: [{ type: "array", maxItems: 100, items: { type: "string", pattern: "^[a-z][a-z0-9-]{0,79}$" } }, nullValue] } as const;
const actionTools = { anyOf: [{ type: "array", maxItems: 100, items: { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] } }, nullValue] } as const;
const importedSkills = { type: "array", maxItems: 200, items: closedObjectSchema({ id: nonEmptyString, name: { type: "string" }, compatibility: { enum: ["portable", "native-only"] }, reason: { type: "string" } },
  ["id", "name", "compatibility"]) } as const;
const availability = { oneOf: [
  closedObjectSchema({ available: { const: true } }),
  closedObjectSchema({ available: { const: false }, reason: { enum: ["disabled", "original_disabled", "unsaved"] } }),
] } as const;
const memberRoleSchema = (roleSchema.oneOf as readonly ActionSchema[])[1]!;
const defaultsSchema = closedObjectSchema({
  personal: { oneOf: [personalRef, nullValue] },
  project: { oneOf: [projectRef, assistant, nullValue] },
});
/** The content of a version. The import snapshot is checked by its own parser where it is read, not by the wire schema. */
export const CHARACTER_ROLE_CONTENT_SCHEMA = closedObjectSchema({
  title: roleTitle, instructions: { type: "string", maxLength: 20_000 }, host_tools: hostTools, action_tools: actionTools, import_snapshot: { type: "object" },
}, ["title", "instructions", "host_tools"]);

export const CHARACTER_ROLE_CATALOG_SCHEMA: ActionSchema = closedObjectSchema({
  in_project: { type: "boolean" },
  originals: { type: "array", items: closedObjectSchema({
    ref: personalRef, title: roleTitle, state, draft_revision: positiveSafeInteger, version: { anyOf: [positiveSafeInteger, nullValue] }, origin,
    use: closedObjectSchema({ projects: { type: "integer", minimum: 0 }, changed: { type: "integer", minimum: 0 } }), availability,
    host_tools: hostTools, action_tools: actionTools, imported_skills: importedSkills,
  }, ["ref", "title", "state", "draft_revision", "version", "origin", "use", "availability", "host_tools"]) },
  members: { type: "array", items: closedObjectSchema({ role: memberRoleSchema, title: roleTitle, availability, host_tools: hostTools, action_tools: actionTools, imported_skills: importedSkills },
    ["role", "title", "availability", "host_tools"]) },
  defaults: defaultsSchema,
  effective: CHARACTER_EFFECTIVE_SELECTION_SCHEMA,
});

export const CHARACTER_ROLE_SNAPSHOT_SCHEMA: ActionSchema = closedObjectSchema({
  ...CHARACTER_ROLE_CONTENT_SCHEMA.properties, version: CHARACTER_ROLE_VERSION_REF_SCHEMA, character_id: nonEmptyString,
  project_id: { anyOf: [nonEmptyString, nullValue] }, owner_actor_id: nonEmptyString, saved_at: nonEmptyString,
}, ["title", "instructions", "host_tools", "version", "character_id", "project_id", "owner_actor_id", "saved_at"]);

const roleRef = { oneOf: [personalRef, projectRef] } as const;
const taskSelection = { oneOf: [personalRef, projectRef, assistant] } as const;
const sectionName = { enum: ["work_style", "capabilities"] } as const;
const memberRevision = { type: "string", pattern: "\\S", maxLength: 200 } as const;
const memberResult = closedObjectSchema({ role: memberRoleSchema });

export type CharacterRoleListInput = Record<string, never>;
export type CharacterVersionsReadInput = { role: PersonalCharacterRef | ProjectCharacterMemberRef };
export type CharacterMemberAddInput = { character_id: string };
export type CharacterMemberSaveInput = { member_id: string; expected_revision: string; expected_original_version: number;
  /** When given, write the edited sections to the original and make those member sections follow it, atomically. */
  expected_original_draft_revision?: number;
  work_style?: { instructions: string }; capabilities?: Pick<CharacterRoleContent, "host_tools" | "action_tools"> };
export type CharacterMemberSectionInput = { member_id: string; section: CharacterRoleSection; expected_revision: string; expected_original_version: number; to: "follow" | "keep" };
export type CharacterMemberStateInput = { member_id: string; expected_revision: string; state: "active" | "disabled" | "removed" };
export type CharacterRestoreInput =
  | { version: PersonalCharacterVersionRef; expected_revision: number }
  | { version: ProjectCharacterVersionRef; expected_revision: string; expected_original_version: number; expected_original_draft_revision?: number };
export type CharacterRoleResolveInput = { selection?: CharacterTaskSelection };
type ProjectRole = Extract<CharacterRole, { layer: "project" }>;

export const CHARACTER_ROLE_SCHEMAS = {
  list: { input: inputSchemaFor<CharacterRoleListInput>()(closedObjectSchema({})), output: CHARACTER_ROLE_CATALOG_SCHEMA },
  versions: {
    input: inputSchemaFor<CharacterVersionsReadInput>()(closedObjectSchema({ role: roleRef })),
    output: closedObjectSchema({ versions: { type: "array", items: closedObjectSchema({
      ref: CHARACTER_ROLE_VERSION_REF_SCHEMA, saved_at: nonEmptyString, content: CHARACTER_ROLE_CONTENT_SCHEMA, current: { type: "boolean" },
      sections: closedObjectSchema({ work_style: { enum: ["follow", "override"] }, capabilities: { enum: ["follow", "override"] } }),
    }, ["ref", "saved_at", "content", "current"]) } }) as ActionSchema,
  },
  memberAdd: { input: inputSchemaFor<CharacterMemberAddInput>()(closedObjectSchema({ character_id: nonEmptyString })), output: memberResult as ActionSchema },
  memberSave: {
    input: inputSchemaFor<CharacterMemberSaveInput>()(closedObjectSchema({
      member_id: nonEmptyString, expected_revision: memberRevision, expected_original_version: positiveSafeInteger,
      expected_original_draft_revision: positiveSafeInteger,
      work_style: closedObjectSchema({ instructions: { type: "string", maxLength: 20_000 } }),
      capabilities: closedObjectSchema({ host_tools: hostTools, action_tools: actionTools }, ["host_tools"]),
    }, ["member_id", "expected_revision", "expected_original_version"])),
    output: closedObjectSchema({ role: memberRoleSchema, original_draft_revision: positiveSafeInteger }, ["role"]) as ActionSchema,
  },
  memberSection: {
    input: inputSchemaFor<CharacterMemberSectionInput>()(closedObjectSchema({
      member_id: nonEmptyString, section: sectionName, expected_revision: memberRevision, expected_original_version: positiveSafeInteger, to: { enum: ["follow", "keep"] },
    })),
    output: memberResult as ActionSchema,
  },
  memberState: {
    input: inputSchemaFor<CharacterMemberStateInput>()(closedObjectSchema({
      member_id: nonEmptyString, expected_revision: memberRevision, state: { enum: ["active", "disabled", "removed"] },
    })),
    output: closedObjectSchema({ role: { anyOf: [memberRoleSchema, nullValue] } }) as ActionSchema,
  },
  restore: {
    input: inputSchemaFor<CharacterRestoreInput>()({ oneOf: [
      closedObjectSchema({ version: personalVersion, expected_revision: positiveSafeInteger }),
      closedObjectSchema({ version: projectVersion, expected_revision: memberRevision, expected_original_version: positiveSafeInteger,
        expected_original_draft_revision: positiveSafeInteger }, ["version", "expected_revision", "expected_original_version"]),
    ] }),
    output: closedObjectSchema({ role: roleSchema }) as ActionSchema,
  },
  defaults: {
    input: CHARACTER_DEFAULT_SELECTION_SCHEMA,
    output: closedObjectSchema({ defaults: defaultsSchema, effective: CHARACTER_EFFECTIVE_SELECTION_SCHEMA }) as ActionSchema,
  },
  resolve: {
    input: inputSchemaFor<CharacterRoleResolveInput>()(closedObjectSchema({ selection: taskSelection }, [])),
    output: closedObjectSchema({ effective: CHARACTER_EFFECTIVE_SELECTION_SCHEMA, selection: taskSelection, title: roleTitle }, ["effective", "selection"]) as ActionSchema,
  },
} as const;

export type CharacterMemberResult = { role: ProjectRole };
export type CharacterMemberSaveResult = CharacterMemberResult & { original_draft_revision?: number };
