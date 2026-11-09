import assert from "node:assert/strict";
import test from "node:test";
import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  BLUEPRINT_PART_ORIGIN_SCHEMA,
  BLUEPRINT_SOURCE_SCHEMA,
  CHARACTER_DEFAULT_SELECTION_SCHEMA,
  CHARACTER_EFFECTIVE_SELECTION_SCHEMA,
  CHARACTER_ROLE_READ_INPUT_SCHEMA,
  CHARACTER_ROLE_READ_OUTPUT_SCHEMA,
  CHARACTER_ROLE_READ_RESULT_SCHEMA,
  CHARACTER_ROLE_VERSION_REF_SCHEMA,
  CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA,
  type BlueprintPartOrigin,
  type BlueprintSource,
  type CharacterDefaultSelection,
  type CharacterRole,
  type CharacterRoleReadInput,
  type CharacterRoleReadOutput,
  type CharacterRoleReadQuery,
  type CharacterRoleReadResult,
  type CharacterRoleVersionRef,
  type CharacterSectionStatus,
  type CharacterTaskSelection,
  type CharacterTemplateAdoptionResult,
  type EffectiveCharacterSelection,
  type PersonalCharacterRef,
  type PersonalCharacterVersionRef,
  type ProjectCharacterMemberRef,
  type ProjectCharacterVersionRef,
} from "@molis-ai/molis-work-contracts/modules/characters";
import { assertActionInput, compileActionSchema } from "@molis-ai/molis-work-kernel";

const personalRef = { kind: "personal", character_id: "writer" } satisfies PersonalCharacterRef;
const projectRef = { kind: "project", member_id: "weekly-writer" } satisfies ProjectCharacterMemberRef;
const personalVersion = { ...personalRef, version: 3 } satisfies PersonalCharacterVersionRef;
const projectVersion = { ...projectRef, member_version: 2, original: personalVersion } satisfies ProjectCharacterVersionRef;
const follow = { mode: "follow" } satisfies CharacterSectionStatus;
const override = { mode: "override", based_on_original_version: 2, original_changed: true } satisfies CharacterSectionStatus;
const personalRole = {
  layer: "personal", state: "active", draft_revision: 4, current: personalVersion, origin: null,
} satisfies CharacterRole;
const projectRole = {
  layer: "project", state: "active", revision: "member-revision-4", current: projectVersion, origin: null,
  sections: { work_style: follow, capabilities: follow },
} satisfies CharacterRole;
const packageSource = { kind: "package", plugin_id: "io.example.weekly-scene", version: "1.2.0" } satisfies BlueprintSource;
const draftSource = { kind: "draft", draft_id: "weekly-draft", revision: 1 } satisfies BlueprintSource;
const packageOrigin = { source: packageSource, part_id: "writer" } satisfies BlueprintPartOrigin;
const draftOrigin = { source: draftSource, part_id: "writer" } satisfies BlueprintPartOrigin;
const created = { outcome: "created", origin: packageOrigin, role: { ...projectRole, origin: packageOrigin } } satisfies CharacterTemplateAdoptionResult;
const reused = { outcome: "reused", origin: draftOrigin, role: personalRole } satisfies CharacterTemplateAdoptionResult;

function accepts(schema: ActionSchema, ...values: unknown[]): void {
  const validate = compileActionSchema(schema);
  for (const value of values) assert.equal(validate(value), true, JSON.stringify({ value, errors: validate.errors }));
}

function rejects(schema: ActionSchema, ...values: unknown[]): void {
  for (const value of values) {
    assert.throws(() => assertActionInput(schema, value), { code: "actions.input_invalid" }, JSON.stringify(value));
  }
}

test("RSC-C01 a fixed role version identifies the original and, for a member, its local version", () => {
  const safeBoundary = { ...personalVersion, version: Number.MAX_SAFE_INTEGER } satisfies CharacterRoleVersionRef;
  accepts(CHARACTER_ROLE_VERSION_REF_SCHEMA, personalVersion, projectVersion, safeBoundary);
  rejects(CHARACTER_ROLE_VERSION_REF_SCHEMA,
    { ...projectRef, member_version: 2 },
    { ...projectVersion, member_version: Number.MAX_SAFE_INTEGER + 1 },
    { ...projectVersion, original: { ...personalVersion, version: Number.MAX_SAFE_INTEGER + 1 } },
    { ...projectVersion, original: projectVersion },
    { ...projectVersion, project_id: "forged-project" },
    { ...personalVersion, character_id: "" },
    { ...personalVersion, version: 0 },
    { ...personalVersion, version: 1.5 },
    { ...personalVersion, version: "3" },
    { artifact_id: "published-role", version: 3 },
  );
});

test("RSC-C01 each member section can follow or have its own override", () => {
  const workStyleOverride = {
    ...projectRole, sections: { work_style: override, capabilities: follow },
  } satisfies CharacterRole;
  const capabilitiesOverride = {
    ...projectRole, state: "disabled", sections: { work_style: follow, capabilities: { ...override, original_changed: false } },
  } satisfies CharacterRole;
  const roleResult = (role: CharacterRole) => ({ kind: "role", role }) satisfies CharacterRoleReadResult;
  accepts(CHARACTER_ROLE_READ_RESULT_SCHEMA,
    roleResult(personalRole), roleResult(projectRole), roleResult(workStyleOverride), roleResult(capabilitiesOverride));
  rejects(CHARACTER_ROLE_READ_RESULT_SCHEMA,
    { kind: "role", role: { ...projectRole, sections: { work_style: follow } } },
    { kind: "role", role: { ...projectRole, sections: { ...projectRole.sections, materials: follow } } },
    { kind: "role", role: { ...projectRole, sections: { work_style: { mode: "copy" }, capabilities: follow } } },
    { kind: "role", role: { ...projectRole, sections: { work_style: { ...override, mode: "follow" }, capabilities: follow } } },
    { kind: "role", role: { ...projectRole, sections: { work_style: { ...override, based_on_original_version: 0 }, capabilities: follow } } },
    { kind: "role", role: { ...projectRole, revision: "" } },
    { kind: "role", role: { ...projectRole, current: personalVersion } },
    { kind: "role", role: { ...personalRole, draft_revision: Number.MAX_SAFE_INTEGER + 1 } },
    { kind: "role", role: { ...personalRole, owner_actor_id: "forged-owner" } },
    { kind: "role", role: { ...personalRole, title: "role content" } },
  );
});

test("RSC-C02 defaults and effective selections keep their scope and source", () => {
  const assistant = { kind: "assistant" } satisfies CharacterTaskSelection;
  const defaults = [
    { layer: "personal", selection: personalRef },
    { layer: "personal", selection: null },
    { layer: "project", selection: projectRef },
    { layer: "project", selection: null },
    { layer: "project", selection: assistant },
  ] satisfies CharacterDefaultSelection[];
  accepts(CHARACTER_DEFAULT_SELECTION_SCHEMA, ...defaults);
  rejects(CHARACTER_DEFAULT_SELECTION_SCHEMA,
    { layer: "personal", selection: projectRef },
    { layer: "personal", selection: assistant },
    { layer: "project", selection: personalRef },
    { layer: "project", selection: projectVersion },
    { layer: "project", selection: { ...projectRef, project_id: "forged-project" } },
    { layer: "project", selection: null, actor_id: "forged-actor" },
  );

  const effective = [
    { kind: "role", source: "task", version: projectVersion },
    { kind: "role", source: "task", version: personalVersion },
    { kind: "role", source: "project", version: projectVersion },
    { kind: "role", source: "personal", version: personalVersion },
    { kind: "assistant", source: "task" },
    { kind: "assistant", source: "project" },
    { kind: "assistant", source: "assistant" },
    { kind: "assistant", source: "assistant", stopped_project_default: projectRef },
  ] satisfies EffectiveCharacterSelection[];
  accepts(CHARACTER_EFFECTIVE_SELECTION_SCHEMA, ...effective);
  rejects(CHARACTER_EFFECTIVE_SELECTION_SCHEMA,
    { kind: "role", source: "project", version: personalVersion },
    { kind: "role", source: "personal", version: projectVersion },
    { kind: "role", source: "task", version: projectVersion, stopped_project_default: projectRef },
    { kind: "assistant", source: "task", stopped_project_default: projectRef },
    { kind: "assistant", source: "project", stopped_project_default: projectRef },
    { kind: "assistant", source: "assistant", stopped_project_default: personalRef },
  );
});

test("RSC-C03 adoption keeps source identity separate from the role's own origin", () => {
  accepts(BLUEPRINT_SOURCE_SCHEMA, packageSource, draftSource);
  rejects(BLUEPRINT_SOURCE_SCHEMA,
    { ...packageSource, draft_id: "other-source" },
    { ...packageSource, installation_id: "forged-installation" },
    { ...packageSource, version: "" },
    { ...draftSource, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...draftSource, revision: 0 },
  );
  accepts(BLUEPRINT_PART_ORIGIN_SCHEMA, packageOrigin, draftOrigin);
  rejects(BLUEPRINT_PART_ORIGIN_SCHEMA, { ...packageOrigin, part_id: "" }, { ...draftOrigin, actor_id: "forged-actor" });
  accepts(CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA, created, reused);
  rejects(CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA,
    { ...created, outcome: "updated" },
    { ...created, origin: null },
    { ...created, origin: { ...packageOrigin, source: { ...packageSource, installation_id: "forged-installation" } } },
    { ...reused, role: { ...personalRole, origin: { ...draftOrigin, actor_id: "forged-actor" } } },
  );
});

test("RSC-C03 a read batch accepts 1 to 128 closed role or request queries", () => {
  const byProjectRole = { by: "role", role: projectRef } satisfies CharacterRoleReadQuery;
  const byPersonalRole = { by: "role", role: personalRef } satisfies CharacterRoleReadQuery;
  const byProjectRequest = { by: "request", layer: "project", request_id: "adoption-1:writer" } satisfies CharacterRoleReadQuery;
  const byPersonalRequest = { by: "request", layer: "personal", request_id: "adoption-2:writer" } satisfies CharacterRoleReadQuery;
  const fullBatch = { queries: Array.from({ length: 128 }, (_, index) => ({
    ...byProjectRequest, request_id: `adoption-1:part-${index}`,
  })) } satisfies CharacterRoleReadInput;
  const inputs = [
    { queries: [byProjectRole] },
    { queries: [byProjectRole, byPersonalRole, byProjectRequest, byPersonalRequest] },
    fullBatch,
  ] satisfies CharacterRoleReadInput[];
  accepts(CHARACTER_ROLE_READ_INPUT_SCHEMA, ...inputs);
  rejects(CHARACTER_ROLE_READ_INPUT_SCHEMA,
    byProjectRole,
    { queries: [] },
    { queries: [...fullBatch.queries, byProjectRole] },
    { queries: [byProjectRole], project_id: "forged-project" },
    { queries: [{ ...byProjectRole, actor_id: "forged-actor" }] },
    { queries: [{ ...byProjectRole, role: { ...projectRef, project_id: "forged-project" } }] },
    { queries: [{ ...byProjectRole, request_id: byProjectRequest.request_id }] },
    { queries: [{ ...byProjectRequest, role: projectRef }] },
    { queries: [{ ...byProjectRequest, request_id: "" }] },
    { queries: [{ ...byProjectRequest, installation_id: "forged-installation" }] },
    { queries: [{ ...byPersonalRequest, authority: { actor_id: "forged-actor" } }] },
  );
});

test("RSC-C03 read results distinguish a missing role from a receipt with no current role", () => {
  const missing = { kind: "missing" } satisfies CharacterRoleReadResult;
  const role = { kind: "role", role: projectRole } satisfies CharacterRoleReadResult;
  const detached = { kind: "receipt", receipt: created, current: null } satisfies CharacterRoleReadResult;
  const current = {
    kind: "receipt", receipt: created, current: { ...created.role, revision: "member-revision-5" },
  } satisfies CharacterRoleReadResult;
  const results = [
    { results: [missing] },
    { results: [role, detached, missing, current] },
    { results: Array.from({ length: 128 }, () => missing) },
  ] satisfies CharacterRoleReadOutput[];
  accepts(CHARACTER_ROLE_READ_RESULT_SCHEMA, missing, role, detached, current);
  accepts(CHARACTER_ROLE_READ_OUTPUT_SCHEMA, ...results);
  rejects(CHARACTER_ROLE_READ_OUTPUT_SCHEMA,
    detached,
    { results: [] },
    { results: Array.from({ length: 129 }, () => missing) },
    { results: [{ kind: "receipt", receipt: created }] },
    { results: [{ ...missing, receipt: created }] },
    { results: [{ ...role, current: null }] },
    { results: [detached], pending: true },
  );
});
