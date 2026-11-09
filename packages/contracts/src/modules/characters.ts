import { defineArtifactPreviewAction, parseExactActionReferences, type ActionDefinition, type ActionSchema, type ExactActionReference } from "../platform/actions.js";
import { ACTION_REFERENCE_SCHEMA } from "../platform/action-offers.js";
import { TEXT_REF_LIMITS, TEXT_REF_SCHEMA, type TextRef } from "../platform/ui-text.js";
import type { ArtifactReference } from "./artifacts.js";
import { parseCharacterImportSnapshot, type CharacterImportSnapshot } from "./character-import.js";
export * from "./character-import.js";
export {
  BLUEPRINT_PART_ORIGIN_SCHEMA,
  BLUEPRINT_SOURCE_SCHEMA,
  type BlueprintPartOrigin,
  type BlueprintSource,
} from "../platform/blueprint-source.js";
export {
  CHARACTER_DEFAULT_SELECTION_SCHEMA,
  CHARACTER_EFFECTIVE_SELECTION_SCHEMA,
  CHARACTER_ROLE_READ_INPUT_SCHEMA,
  CHARACTER_ROLE_READ_OUTPUT_SCHEMA,
  CHARACTER_ROLE_READ_RESULT_SCHEMA,
  CHARACTER_ROLE_VERSION_REF_SCHEMA,
  CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA,
  type CharacterDefaultSelection,
  type CharacterRole,
  type CharacterRoleReadInput,
  type CharacterRoleReadOutput,
  type CharacterRoleReadQuery,
  type CharacterRoleReadResult,
  type CharacterRoleSection,
  type CharacterRoleVersionRef,
  type CharacterSectionStatus,
  type CharacterTaskSelection,
  type CharacterTemplateAdoptionResult,
  type EffectiveCharacterSelection,
  type PersonalCharacterRef,
  type PersonalCharacterVersionRef,
  type ProjectCharacterMemberRef,
  type ProjectCharacterVersionRef,
} from "./character-role-scope.js";
export { characterErrors } from "./characters-errors.js";
import type { ContractDescriptor } from "../platform/package.js";

export const modulesCharactersContract = {
  contractId: /* @version contract.io.molis.work.module.characters "io.molis.work.module.characters.v{version}" */ "io.molis.work.module.characters.v1", kind: "module", schemaVersion: /* @version contract.io.molis.work.module.characters */ 1,
  maturity: "partial", ssot: "specs/coding-plugin/spec.md",
} as const satisfies ContractDescriptor;

export const CHARACTER_ARTIFACT_TYPE = /* @version type.character.definition "character.definition.v{version}" */ "character.definition.v1";
export const CHARACTER_PLUGIN_ID = "io.molis.work.characters";
export const CHARACTER_PUBLISHER_SIGNATURE = "official-characters-binding";

/** How a published Character reads in the 成果库; Characters answers it, the 成果库 and the Host's producer table name it. */
export const characterArtifactPreviewAction = defineArtifactPreviewAction("characters.artifacts.preview", /* @version action.characters.artifacts.preview */ 1, "角色", ["artifact:read"]);

/**
 * What Characters writes to the 成果库, declared the way a Manifest's `artifacts.produces` would be: Characters is part of the
 * Host, not a plugin, so it has no Manifest, and the Host's table of producers that are not plugins carries this instead.
 */
export const CHARACTER_ARTIFACT_PRODUCER = {
  plugin_id: CHARACTER_PLUGIN_ID, name: "Characters", binding_signature: CHARACTER_PUBLISHER_SIGNATURE,
  produces: [{ artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: /* @version type.character.definition */ 1, title: "角色",
    preview: { capability_id: characterArtifactPreviewAction.capability_id, version: characterArtifactPreviewAction.version } }],
} as const;

export type CharacterState = "active" | "disabled" | "tombstoned";

/** Reusable character content declared by a scene package or draft. */
export interface RoleTemplate {
  title: TextRef;
  instructions: string;
  /** Omitted or null inherits the caller's selection. An empty list removes all Host tools. */
  host_tools?: string[] | null;
  /** Omitted or null inherits the explicit run selection. An empty list removes all actions. */
  action_tools?: ExactActionReference[] | null;
  skills?: Array<{ pack: string; skill_id: string }>;
  materials?: TextRef;
  outputs?: TextRef;
  works_with?: string[];
}

/** Wire shape. TextRef combinations, parser semantics and UTF-16 limits belong to SDK validation. */
export const ROLE_TEMPLATE_SCHEMA = {
  type: "object",
  properties: {
    title: TEXT_REF_SCHEMA,
    instructions: { type: "string", maxLength: 20_000 },
    host_tools: { type: ["array", "null"], maxItems: 100, items: { type: "string" } },
    action_tools: {
      type: ["array", "null"],
      maxItems: 100,
      items: { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pack: { type: "string", pattern: "^io\\.molis\\.work\\.[a-z0-9][a-z0-9.-]*$", maxLength: TEXT_REF_LIMITS.owner },
          skill_id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
        },
        required: ["pack", "skill_id"],
        additionalProperties: false,
      },
    },
    materials: TEXT_REF_SCHEMA,
    outputs: TEXT_REF_SCHEMA,
    works_with: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
  },
  required: ["title", "instructions"],
  additionalProperties: false,
} as const satisfies ActionSchema;

/** A personal draft. Its revision is NOT an Artifact publication version. */
export interface CharacterDraft {
  character_id: string;
  owner_actor_id: string;
  revision: number;
  state: CharacterState;
  title: string;
  instructions: string;
  /** null inherits the caller's set; [] deliberately removes all Host tools. */
  host_tools: string[] | null;
  /** null/absent inherits the explicit run selection; [] excludes every action. */
  action_tools?: ExactActionReference[] | null;
  created_at: string;
  updated_at: string;
  import_snapshot?: CharacterImportSnapshot;
}

/** Immutable Artifact body, without credentials, execution state or approval. */
export interface CharacterContent {
  character_id: string;
  title: string;
  instructions: string;
  host_tools: string[] | null;
  /** null/absent inherits the explicit run selection; [] excludes every action. */
  action_tools?: ExactActionReference[] | null;
  source: { owner_actor_id: string; draft_revision: number };
  import_snapshot?: CharacterImportSnapshot;
}

export interface CharacterDraftPatch {
  title: string;
  instructions: string;
  host_tools: string[] | null;
  /** null/absent inherits the explicit run selection; [] excludes every action. */
  action_tools?: ExactActionReference[] | null;
}

export interface CharactersQuery {
  list(): CharacterDraft[];
  get(characterId: string): CharacterDraft | null;
}

export interface CharactersCommand {
  create(): CharacterDraft;
  update(characterId: string, expectedRevision: number, patch: CharacterDraftPatch): CharacterDraft;
  setState(characterId: string, expectedRevision: number, state: CharacterState): CharacterDraft;
}

export function parseCharacterContent(value: unknown): CharacterContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Character 内容无效");
  const x = value as Record<string, unknown>;
  const source = x.source as Record<string, unknown> | undefined;
  if (typeof x.character_id !== "string" || !x.character_id.trim() || x.character_id.length > 200
    || typeof x.title !== "string" || !x.title.trim() || x.title.length > 120
    || typeof x.instructions !== "string" || !x.instructions.trim() || x.instructions.length > 20_000
    || !source || typeof source.owner_actor_id !== "string" || !source.owner_actor_id.trim() || source.owner_actor_id.length > 200
    || !Number.isSafeInteger(source.draft_revision) || Number(source.draft_revision) < 1) throw new Error("Character 正文或来源不完整");
  return { character_id: x.character_id, title: x.title, instructions: x.instructions,
    host_tools: parseCharacterTools(x.host_tools),
    ...(x.action_tools === undefined ? {} : { action_tools: x.action_tools === null ? null : parseExactActionReferences(x.action_tools) }),
    ...(x.import_snapshot === undefined ? {} : { import_snapshot: parseCharacterImportSnapshot(x.import_snapshot) }),
    source: { owner_actor_id: source.owner_actor_id, draft_revision: source.draft_revision as number } };
}

export function parseCharacterTools(value: unknown): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > 100 || value.some(tool => typeof tool !== "string"
    || !/^[a-z][a-z0-9-]{0,79}$/.test(tool)) || new Set(value).size !== value.length) throw new Error("Character 工具范围无效或重复");
  return [...value] as string[];
}

const versionReference: ActionSchema = { type: "object",
  properties: { artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } }, required: ["artifact_id", "version"], additionalProperties: false };
const closedObject = (properties: Record<string, unknown>): ActionSchema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

/**
 * The two Characters reads that whoever runs a person's Character consumes (PG-086), defined once: Characters answers them. Coding
 * names their `capability_id` in its Manifest `capabilities.consumes` and invokes them through `services.actions`; the Assistant, which
 * acts as the person, reads the same two (C2b). Neither reaches Characters' implementation or the Host's frozen-Character helper.
 * `list` keeps its version and shape and adds the plugin audience; `runnable` answers the person and plugins, and only whether a version
 * can run: the launch details the person's `characters.execution` gives (the local program and folders) stay the person's, with no
 * plugin audience. A caller needs `artifact:read`.
 */
export const characterPluginActions: {
  /** The person's drafts and this project's published Character versions, as the 成果库 and the picker show them. */
  readonly list: ActionDefinition<Record<string, never>, { drafts: unknown[]; publications: unknown[] }>;
  /**
   * Whether this published version can run now. Characters answers `available: false` with its own reason for a version that is not
   * a current publication of this project, or whose Character is disabled or deleted; nothing about how it would be launched.
   */
  readonly runnable: ActionDefinition<{ reference: ArtifactReference }, { available: true } | { available: false; reason: string }>;
} = {
  list: {
    capability_id: "characters.list", version: /* @version action.characters.list */ 1, operation: "query",
    action: { title: "角色列表", description: "读取本人的角色草稿和本项目已发布的固定版本", kind: "query", scope: "project",
      audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions: ["artifact:read"], subject_kinds: ["character"],
      input_schema: closedObject({}), output_schema: closedObject({ drafts: { type: "array" }, publications: { type: "array" } }) },
  },
  runnable: {
    capability_id: "characters.runnable", version: /* @version action.characters.runnable */ 1, operation: "query",
    action: { title: "角色能否运行", description: "核对这个发布版本现在能否运行：是本项目当前的发布版本，角色也没有停用或删除；不能运行时给出原因", kind: "query", scope: "project",
      audiences: ["user", "plugin"], permissions: ["artifact:read"], subject_kinds: ["character"],
      input_schema: closedObject({ reference: versionReference }),
      output_schema: { type: "object", properties: { available: { type: "boolean" }, reason: { type: "string", minLength: 1, maxLength: 500 } }, required: ["available"], additionalProperties: false } },
  },
};
