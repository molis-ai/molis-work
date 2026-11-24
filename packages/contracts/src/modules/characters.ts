import { defineArtifactPreviewAction, parseExactActionReferences, type ActionDefinition, type ActionSchema, type ExactActionReference } from "../platform/actions.js";
import { ACTION_REFERENCE_SCHEMA } from "../platform/action-offers.js";
import { inputSchemaFor, type InferActionInput } from "../platform/action-input.js";
import { BLUEPRINT_PART_ORIGIN_SCHEMA, type BlueprintPartOrigin } from "../platform/blueprint-source.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import { PLUGIN_ID_PATTERN } from "../platform/plugin-manifest.js";
import { TEXT_REF_LIMITS, TEXT_REF_SCHEMA, type TextRef } from "../platform/ui-text.js";
import { parseCharacterImportSnapshot, type CharacterImportSnapshot } from "./character-import.js";
import {
  CHARACTER_ROLE_READ_INPUT_SCHEMA, CHARACTER_ROLE_READ_OUTPUT_SCHEMA, CHARACTER_ROLE_SCHEMAS, CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA,
  personalVersion, projectRef, type CharacterDefaultSelection, type CharacterDefaults, type CharacterMemberAddInput, type CharacterMemberResult,
  type CharacterMemberSaveInput, type CharacterMemberSaveResult, type CharacterMemberSectionInput, type CharacterMemberStateInput, type CharacterRestoreInput, type CharacterRole,
  type CharacterRoleCatalog, type CharacterRoleListInput, type CharacterRoleReadInput, type CharacterRoleReadOutput, type CharacterRoleResolution,
  type CharacterRoleResolveInput, type CharacterRoleVersionEntry, type CharacterTemplateAdoptionResult, type CharacterVersionsReadInput,
  type EffectiveCharacterSelection, type PersonalCharacterVersionRef, type ProjectCharacterMemberRef,
} from "./character-role-scope.js";
export * from "./character-import.js";
export {
  BLUEPRINT_PART_ORIGIN_SCHEMA,
  BLUEPRINT_SOURCE_SCHEMA,
  type BlueprintPartOrigin,
  type BlueprintSource,
} from "../platform/blueprint-source.js";
export {
  CHARACTER_ROLE_CATALOG_SCHEMA,
  CHARACTER_ROLE_CONTENT_SCHEMA,
  CHARACTER_ROLE_SCHEMAS,
  CHARACTER_ROLE_SNAPSHOT_SCHEMA,
  type CharacterDefaults,
  type CharacterImportedSkillEntry,
  type CharacterMemberAddInput,
  type CharacterMemberEntry,
  type CharacterMemberResult,
  type CharacterMemberSaveInput,
  type CharacterMemberSaveResult,
  type CharacterMemberSectionInput,
  type CharacterMemberStateInput,
  type CharacterOriginalEntry,
  type CharacterRestoreInput,
  type CharacterRoleAvailability,
  type CharacterRoleCatalog,
  type CharacterRoleContent,
  type CharacterRoleListInput,
  type CharacterRoleResolution,
  type CharacterRoleResolveInput,
  type CharacterRoleSnapshot,
  type CharacterRoleUnavailable,
  type CharacterRoleVersionEntry,
  type CharacterVersionsReadInput,
  CHARACTER_DEFAULT_SELECTION_SCHEMA,
  CHARACTER_EFFECTIVE_SELECTION_SCHEMA,
  CHARACTER_ROLE_READ_INPUT_SCHEMA,
  CHARACTER_ROLE_READ_OUTPUT_SCHEMA,
  CHARACTER_ROLE_READ_RESULT_SCHEMA,
  CHARACTER_ROLE_VERSION_REF_SCHEMA,
  CHARACTER_TASK_SELECTION_SCHEMA,
  characterVersionMatchesSelection,
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
export const CHARACTER_PLUGIN_ID = "system.characters";
export const CHARACTER_PUBLISHER_SIGNATURE = "official-characters-binding";

/** How a published Character reads in the 成果库; Characters answers it, the 成果库 and the Host's producer table name it. */
export const characterArtifactPreviewAction = defineArtifactPreviewAction("characters.artifacts.preview", /* @version action.characters.artifacts.preview */ 1, "角色", ["artifact:read"]);

/**
 * What Characters writes to the 成果库, declared the way a Manifest's `artifacts.produces` would be: Characters is part of the
 * Host, not a plugin, so it has no Manifest, and the Host's table of producers that are not plugins carries this instead.
 */
export const CHARACTER_ARTIFACT_PRODUCER = {
  plugin_id: CHARACTER_PLUGIN_ID, name: "Characters", binding_signature: CHARACTER_PUBLISHER_SIGNATURE,
  produces: [{ artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: /* @version type.character.definition */ 1, title: "角色", searchable_fields: ["instructions"],
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
          pack: { type: "string", pattern: PLUGIN_ID_PATTERN, maxLength: TEXT_REF_LIMITS.owner },
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

type CharacterTemplateSelection<Template> =
  | { layer: "personal" | "project"; selection: { kind: "create" }; template: Template }
  | { layer: "personal"; selection: { kind: "reuse"; role: PersonalCharacterVersionRef } }
  | { layer: "project"; selection: { kind: "reuse"; role: ProjectCharacterMemberRef; expected_revision: string; expected_original_version: number } };

type CharacterTemplateRequest = { origin: BlueprintPartOrigin; request_id: string };

/** Origin is provenance. The owner resolves the layer and references in the caller's trusted scope. */
export type CharacterTemplateAdoptionInput = CharacterTemplateRequest & CharacterTemplateSelection<RoleTemplate>;

const observation = { type: "string", pattern: "\\S" } as const;
const templateRequest = { origin: BLUEPRINT_PART_ORIGIN_SCHEMA, request_id: observation };
// TextRef's combinations are checked by the SDK after the gateway checks the wire envelope.
type CharacterTemplateAdoptionEnvelope = CharacterTemplateRequest & CharacterTemplateSelection<InferActionInput<typeof ROLE_TEMPLATE_SCHEMA>>;
export const CHARACTER_TEMPLATE_ADOPTION_INPUT_SCHEMA = inputSchemaFor<CharacterTemplateAdoptionEnvelope>()({ oneOf: [
  closedObjectSchema({
    ...templateRequest, layer: { enum: ["personal", "project"] }, selection: closedObjectSchema({ kind: { const: "create" } }),
    template: ROLE_TEMPLATE_SCHEMA,
  }),
  closedObjectSchema({
    ...templateRequest, layer: { const: "personal" }, selection: closedObjectSchema({ kind: { const: "reuse" }, role: personalVersion }),
  }),
  closedObjectSchema({
    ...templateRequest, layer: { const: "project" }, selection: closedObjectSchema({
      kind: { const: "reuse" }, role: projectRef, expected_revision: observation, expected_original_version: personalVersion.properties.version,
    }),
  }),
] });

const READERS = ["user", "agent", "workflow", "mcp", "plugin"] as const;
const WRITERS = ["user", "agent", "mcp"] as const;
/** Each version's full text and the files it imported: the person's own, not offered to plugins (Coding reads roles through `list` and `resolve`). */
const VERSION_READERS = ["user", "agent", "workflow", "mcp"] as const;
/**
 * A role action. Plugins reach only the ones that name them (`roles.list`, `roles.resolve`): the rest are `plugin: false`, so the
 * rule that lets plugins reach agent actions does not hand them a person's versions or a way to change their roles (S-15).
 */
function roleAction<I, O>(capabilityId: string, version: number, operation: "query" | "command", title: string, description: string,
  audiences: readonly ("user" | "agent" | "workflow" | "mcp" | "plugin")[], schemas: { input: ActionSchema; output: ActionSchema }): ActionDefinition<I, O> {
  return { capability_id: capabilityId, version, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    effect: operation === "query" ? "read" : "write", scope: "project", audiences: [...audiences], ...(audiences.includes("plugin") ? {} : { plugin: false }), permissions: [], subject_kinds: ["character"],
    input_schema: schemas.input, output_schema: schemas.output } };
}

/**
 * The person's roles (specs/onboarding-coverage/role-service-design.md §3), defined once here, where the Assistant, Coding and any
 * plugin that runs a person's role find them; Characters answers them. The person and the project come from the call: in personal
 * work there is no project layer. Choosing a role grants nothing: a role only narrows what a task already opens.
 */
export const characterRoleActions: {
  fromTemplate: ActionDefinition<CharacterTemplateAdoptionInput, CharacterTemplateAdoptionResult>;
  read: ActionDefinition<CharacterRoleReadInput, CharacterRoleReadOutput>;
  list: ActionDefinition<CharacterRoleListInput, CharacterRoleCatalog>;
  resolve: ActionDefinition<CharacterRoleResolveInput, CharacterRoleResolution>;
  versions: ActionDefinition<CharacterVersionsReadInput, { versions: CharacterRoleVersionEntry[] }>;
  memberAdd: ActionDefinition<CharacterMemberAddInput, CharacterMemberResult>;
  memberSave: ActionDefinition<CharacterMemberSaveInput, CharacterMemberSaveResult>;
  memberSection: ActionDefinition<CharacterMemberSectionInput, CharacterMemberResult>;
  memberState: ActionDefinition<CharacterMemberStateInput, { role: CharacterMemberResult["role"] | null }>;
  restore: ActionDefinition<CharacterRestoreInput, { role: CharacterRole }>;
  defaults: ActionDefinition<CharacterDefaultSelection, { defaults: CharacterDefaults; effective: EffectiveCharacterSelection }>;
} = {
  fromTemplate: roleAction("characters.from_template", /* @version action.characters.from_template */ 1, "command", "采用角色模板", "按已确认的选择创建或复用角色；同一请求重放原回执",
    ["user"], { input: CHARACTER_TEMPLATE_ADOPTION_INPUT_SCHEMA, output: CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA }),
  read: roleAction("characters.roles.read", /* @version action.characters.roles.read */ 1, "query", "批读角色与采用回执", "按角色引用或采用请求读取角色及回执",
    ["user"], { input: CHARACTER_ROLE_READ_INPUT_SCHEMA, output: CHARACTER_ROLE_READ_OUTPUT_SCHEMA }),
  list: roleAction("characters.roles.list", /* @version action.characters.roles.list */ 1, "query", "角色列表",
    "一次读出我的角色（当前版本、几个项目在用）、本项目的角色（跟随或改过哪一节）、两层默认、新任务默认用哪个角色，以及每个角色现在能不能选", READERS, CHARACTER_ROLE_SCHEMAS.list),
  resolve: roleAction("characters.roles.resolve", /* @version action.characters.roles.resolve */ 1, "query", "新任务由哪个角色来做",
    "按「这一次 → 项目默认 → 我的默认 → 助理自己」得出新任务的角色和要存在任务上的稳定选择；这一次另选的角色不能用时拒绝并说原因，不换成别的", READERS, CHARACTER_ROLE_SCHEMAS.resolve),
  versions: roleAction("characters.versions.read", /* @version action.characters.versions.read */ 1, "query", "角色的版本", "读一个角色保存过的固定版本与各版内容，最新的在前", VERSION_READERS, CHARACTER_ROLE_SCHEMAS.versions),
  memberAdd: roleAction("characters.members.add", /* @version action.characters.members.add */ 1, "command", "把角色加进本项目", "把我的一个角色加进当前项目，两节都跟随原件", WRITERS, CHARACTER_ROLE_SCHEMAS.memberAdd),
  memberSave: roleAction("characters.members.save", /* @version action.characters.members.save */ 1, "command", "保存项目角色的修改",
    "仅保存给出的节。提供已确认的原件草稿修订号时，同时修改原件并恢复这些节的跟随；否则只改本项目", WRITERS, CHARACTER_ROLE_SCHEMAS.memberSave),
  memberSection: roleAction("characters.members.section", /* @version action.characters.members.section */ 1, "command", "恢复跟随或保持本项目的",
    "本项目改过的一节：恢复跟随原件（存成新的一版），或确认保持本项目的写法（不再提示原件的这次改动）", WRITERS, CHARACTER_ROLE_SCHEMAS.memberSection),
  memberState: roleAction("characters.members.state", /* @version action.characters.members.state */ 1, "command", "启用、停用或移出本项目的角色",
    "只改本项目里的这个角色；移出不删原件；已开始的任务照旧用原来的版本", WRITERS, CHARACTER_ROLE_SCHEMAS.memberState),
  restore: roleAction("characters.versions.restore", /* @version action.characters.versions.restore */ 1, "command", "恢复角色的某一版",
    "把某一版存成新的一版；提供已确认的原件草稿修订号时，一并恢复成员与原件", WRITERS, CHARACTER_ROLE_SCHEMAS.restore),
  defaults: roleAction("characters.defaults.set", /* @version action.characters.defaults.set */ 1, "command", "设默认角色",
    "设我的默认或本项目的默认；本项目可选「助理自己」，不选就沿用我的默认", WRITERS, CHARACTER_ROLE_SCHEMAS.defaults),
};

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
  create(patch: CharacterDraftPatch): CharacterDraft;
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
