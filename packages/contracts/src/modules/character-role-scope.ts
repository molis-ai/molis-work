import { inputSchemaFor } from "../platform/action-input.js";
import type { ActionSchema } from "../platform/actions.js";
import { BLUEPRINT_PART_ORIGIN_SCHEMA, type BlueprintPartOrigin } from "../platform/blueprint-source.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";

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
const projectVersion = closedObjectSchema({
  ...projectRef.properties,
  member_version: positiveSafeInteger,
  original: personalVersion,
});

export const CHARACTER_ROLE_VERSION_REF_SCHEMA: ActionSchema = { oneOf: [personalVersion, projectVersion] };

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
