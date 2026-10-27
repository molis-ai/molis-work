import assert from "node:assert/strict";
import test from "node:test";
import { actionSourceIdentity, sameActionSourceIdentity, ACTION_SOURCE_IDENTITY_SCHEMA, type ActionCallContext, type ActionDefinition,
  type ActionProvider, type ActionSubjectRetention } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineSubjectRetentionAction } from "@molis-ai/molis-work-plugin-sdk";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { SearchRetentionIdentity } from "@molis-ai/molis-work-contracts/services/search";
import { readSubjectRetention } from "@molis-ai/molis-work-service-search";

const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: "project", permissions: [] };
const system: ActionProvider = { provider_id: "system.documents", title: "Documents", kind: "system", project_id: "project", project_data_instance_id: "instance-1" };
const subject = { kind: "document", id: "fixed-version" };

test("MEM-SOURCE-01 trusted source identities distinguish installations from project instances and reject crossed scopes", () => {
  assert.deepEqual(actionSourceIdentity(system, "project"), { kind: "project-data", data_instance_id: "instance-1" });
  assert.equal(actionSourceIdentity(system, "other"), null);
  assert.equal(actionSourceIdentity({ ...system, project_id: undefined }, "project"), null);
  assert.equal(actionSourceIdentity({ ...system, plugin_installation_generation: "instance-1" }, "project"), null);
  assert.equal(actionSourceIdentity({ ...system, plugin_id: "documents" }, "project"), null);
  assert.deepEqual(actionSourceIdentity({ provider_id: "notes", title: "Notes", kind: "plugin", plugin_installation_generation: "install-1" }, "project"),
    { kind: "plugin-installation", generation: "install-1" });
  assert.equal(sameActionSourceIdentity(null, null), false);
  assert.equal(sameActionSourceIdentity({ kind: "plugin-installation", generation: "same" }, { kind: "project-data", data_instance_id: "same" }), false);
  assert.equal(sameActionSourceIdentity(actionSourceIdentity(system, "project"), { kind: "project-data", data_instance_id: "instance-2" }), false);
});

test("MEM-SOURCE-02 the public action boundary rejects mixed and unknown source identity shapes", async () => {
  const actions = new ActionService();
  const identity: ActionDefinition = { capability_id: "source.identity", version: 1, operation: "query", action: {
    title: "Identity", description: "Validate a selected source identity", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: ACTION_SOURCE_IDENTITY_SCHEMA, output_schema: ACTION_SOURCE_IDENTITY_SCHEMA,
  } };
  actions.registerProvider({ provider: system, definitions: [identity], handlers: [{ ...identity, handle: (_context, input) => input }] });
  const selected = { kind: "project-data", data_instance_id: "instance-1" };
  assert.deepEqual(await actions.invoke(caller, identity, selected), selected);
  for (const input of [null, { kind: "system", data_instance_id: "instance-1" }, { kind: "project-data", data_instance_id: "" },
    { ...selected, generation: "install-1" }, { kind: "plugin-installation", data_instance_id: "instance-1" }]) {
    await assert.rejects(actions.invoke(caller, identity, input), { code: "actions.input_invalid" });
  }
});

test("MEM-SOURCE-03 system retention verifies exact current revision and data instance without promoting unknown or archived sources", async () => {
  const actions = new ActionService(), retention = defineSubjectRetentionAction("documents.retention", subject.kind, "Documents", []);
  let state: ActionSubjectRetention = { subject, state: "active", current_revision: "revision-1", retained: null };
  const register = (provider: ActionProvider) => actions.registerProvider({ provider, sourceRevision: () => "unchanged-owner", definitions: [retention], handlers: [{ ...retention, handle: () => state }] });
  let remove = register(system);
  const identity = { project_id: "project", provider_id: system.provider_id, subject,
    retention: { source_identity: { kind: "project-data" as const, data_instance_id: "instance-1" } }, expected_revision: "revision-1" };
  const read = (input: SearchRetentionIdentity = identity) => readSubjectRetention({ client: actions, caller }, input);
  assert.deepEqual(await read(), state);
  assert.equal((await read({ ...identity, expected_revision: "revision-2" })).state, "unavailable");
  assert.equal((await read({ ...identity, expected_revision: undefined })).state, "unavailable");
  state = { subject, state: "active", current_revision: null, retained: null };
  assert.equal((await read()).state, "unavailable");
  state = { subject, state: "temporarily_archived", retained: { content_revision: null, restoration_operation_id: null } };
  assert.equal((await read()).state, "temporarily_archived");
  remove(); remove = register({ ...system, project_data_instance_id: "instance-2" });
  assert.equal((await read()).state, "unavailable");
  remove(); remove = register({ ...system, project_data_instance_id: undefined });
  assert.equal((await read()).state, "unavailable");
  remove();
  actions.registerProvider({ provider: system, definitions: [], handlers: [] });
  assert.equal((await read()).state, "unavailable", "unsupported cannot authorize a system source");
});
