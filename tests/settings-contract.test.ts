import assert from "node:assert/strict";
import test from "node:test";

import {
  SETTINGS_READ_INPUT_SCHEMA, SETTINGS_READ_INPUT_TYPE, SETTINGS_READ_OUTPUT_SCHEMA, SETTINGS_READ_OUTPUT_TYPE,
  SETTINGS_WRITE_INPUT_SCHEMA, SETTINGS_WRITE_INPUT_TYPE, type SettingEntryDeclaration, type SettingsDeclaration,
} from "@molis-ai/molis-work-contracts/platform/settings";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { assertJson, assertMatches, assertSchema, SandboxError } from "@molis-ai/molis-work-plugin-sandbox";
import { defineSettingsActions, resolveEffectiveSetting, validateSettingsDeclaration } from "@molis-ai/molis-work-plugin-sdk";

const action = (capability_id: string) => ({ capability_id, version: 1, title: "Fixture settings", description: "Fixture settings", permissions: [] });
const read = action("fixture.settings.read"), write = action("fixture.settings.write");
const actions = defineSettingsActions({ scope: "project", read, write });
const entry: SettingEntryDeclaration = {
  key: "another-prefix.interval", title: { key: "fixture.settings.interval" }, summary: { key: "common.done" },
  layers: ["project", "personal"], schema: { type: "integer", minimum: 0 }, consequence: ["schedule"],
};
const declaration: SettingsDeclaration = {
  entries: [entry], read: { capability_id: read.capability_id, version: 1 }, write: { capability_id: write.capability_id, version: 1 },
};
const manifest = { settings_entries: declaration, actions: [actions.read, actions.write], plugin_id: "io.molis.work.fixture" };

function assertProblem(override: Partial<Parameters<typeof validateSettingsDeclaration>[0]>, path: string, reason: RegExp): void {
  const problems = validateSettingsDeclaration({ ...manifest, ...override });
  assert.ok(problems.some(problem => problem.path === path && reason.test(problem.reason)), JSON.stringify(problems));
}

test("SPC-C01: public settings action definitions carry the fixed schemas, types, scopes and audiences", () => {
  assert.deepEqual([actions.read.operation, actions.read.action.kind, actions.read.action.effect, actions.read.action.scope], ["query", "query", "read", "project"]);
  assert.deepEqual([actions.write.operation, actions.write.action.kind, actions.write.action.effect, actions.write.action.scope], ["command", "operation", "write", "project"]);
  assert.deepEqual(actions.read.action.audiences, ["user", "plugin", "agent"]);
  assert.deepEqual(actions.write.action.audiences, ["user"]);
  assert.equal(actions.read.action.input_type, SETTINGS_READ_INPUT_TYPE);
  assert.equal(actions.write.action.input_type, SETTINGS_WRITE_INPUT_TYPE);
  assert.deepEqual(actions.read.action.input_schema, SETTINGS_READ_INPUT_SCHEMA);
  assert.deepEqual(actions.write.action.input_schema, SETTINGS_WRITE_INPUT_SCHEMA);
  for (const definition of [actions.read, actions.write]) {
    assert.equal(definition.action.output_type, SETTINGS_READ_OUTPUT_TYPE);
    assert.deepEqual(definition.action.output_schema, SETTINGS_READ_OUTPUT_SCHEMA);
  }
  assert.deepEqual(validateSettingsDeclaration(manifest), [], "the key's prefix does not identify its owner");
  const reordered = { ...actions.read, action: { ...actions.read.action, audiences: ["agent", "user", "plugin"],
    input_schema: Object.fromEntries(Object.entries(SETTINGS_READ_INPUT_SCHEMA).reverse()) } };
  assert.deepEqual(validateSettingsDeclaration({ ...manifest, actions: [reordered, actions.write] }), []);
});

test("SPC-C01: settings inputs and observations are closed at the action schema", () => {
  const input = { key: entry.key, layer: "personal", expected_revision: "seen", request_id: "retry", change: { set: null } };
  assertActionInput(SETTINGS_READ_INPUT_SCHEMA, { keys: [entry.key] });
  assertActionInput(SETTINGS_WRITE_INPUT_SCHEMA, input);
  assertActionInput(SETTINGS_WRITE_INPUT_SCHEMA, { ...input, change: { inherit: true } });
  for (const bad of [
    { ...input, change: { inherit: false } }, { ...input, change: { set: null, inherit: true } }, { ...input, change: {} },
    { ...input, layer: "provider_default" }, { ...input, expected_revision: "" }, { ...input, request_id: " " },
    { ...input, actor_id: "forged" }, { ...input, project_id: "elsewhere" }, { ...input, owner_id: "another-owner" },
  ]) assert.throws(() => assertActionInput(SETTINGS_WRITE_INPUT_SCHEMA, bad), { code: "actions.input_invalid" });
  assert.throws(() => assertActionInput(SETTINGS_READ_INPUT_SCHEMA, { keys: [entry.key], project_id: "forged" }), { code: "actions.input_invalid" });

  const unavailable = { key: entry.key, revision: "seen", state: "unavailable", reason: "Waiting for setup" };
  assertActionInput(SETTINGS_READ_OUTPUT_SCHEMA, { values: [unavailable] });
  assert.throws(() => assertActionInput(SETTINGS_READ_OUTPUT_SCHEMA, { values: [{ ...unavailable, value: 0 }] }), { code: "actions.input_invalid" });
  assert.throws(() => assertActionInput(SETTINGS_READ_OUTPUT_SCHEMA, { values: [{ ...unavailable, reason: "" }] }), { code: "actions.input_invalid" });
});

test("SPC-C01: a declaration must name the exact local action, schema and write audience", () => {
  assertProblem({ settings_entries: { ...declaration, write: { ...declaration.write, version: 2 } } }, "settings_entries.write", /本主人唯一声明/u);
  assertProblem({ settings_entries: { ...declaration, write: { ...declaration.write, provider_id: "another-owner" } } }, "settings_entries.write.provider_id", /不认识字段/u);
  assertProblem({ actions: [actions.read, { ...actions.write, action: { ...actions.write.action, input_schema: {} } }] }, "settings_entries.write", /固定的输入输出/u);
  assertProblem({ actions: [actions.read, { ...actions.write, action: { ...actions.write.action, output_type: "another.type" } }] }, "settings_entries.write", /固定的输入输出/u);
  assertProblem({ actions: [actions.read, { ...actions.write, action: { ...actions.write.action, audiences: ["user", "agent"] } }] }, "settings_entries.write", /受众/u);
  assertProblem({ actions: [actions.read, { ...actions.write, action: { ...actions.write.action, effect: "irreversible" } }] }, "settings_entries.write", /效果/u);
  assertProblem({ actions: [actions.read, { ...actions.write, action: { ...actions.write.action, scope: "home" } }] }, "settings_entries.write", /同一个 scope/u);
});

test("SPC-C01: entries reject duplicate keys, bad layers and consequences, malformed schemas and foreign text", () => {
  assertProblem({ settings_entries: { ...declaration, entries: [entry, entry] } }, "settings_entries.entries[1].key", /重复/u);
  for (const [field, value, reason] of [
    ["key", " ", /非空/u], ["layers", [], /写入层/u], ["layers", ["project", "project"], /不重复/u],
    ["layers", ["provider_default"], /写入层/u], ["consequence", ["permission"], /设置后果/u],
    ["title", { literal: "Hard-coded" }, /不收 literal/u], ["summary", { key: "foreign.summary" }, /本主人的前缀/u],
    ["schema", { type: "object", properties: {}, required: [], additionalProperties: true }, /additionalProperties:false/u],
    ["owner_id", "another-owner", /不认识字段/u],
  ] as const) assertProblem({ settings_entries: { ...declaration, entries: [{ ...entry, [field]: value }] } }, `settings_entries.entries[0].${field}`, reason);
});

test("SPC-C01: resolving a snapshot preserves each value and reports unavailability separately", () => {
  const observed = { key: entry.key, revision: "r1" };
  for (const [layers, source, value] of [
    [{ project: null, personal: false, provider_default: 0 }, "project", null],
    [{ personal: false, provider_default: 0 }, "personal", false],
    [{ provider_default: 0 }, "provider_default", 0],
  ] as const) {
    assert.deepEqual(resolveEffectiveSetting({ ...observed, state: "ok", layers }), { ...observed, state: "ok", layers, source, value });
  }
  const unavailable = { ...observed, state: "unavailable", reason: "Owner offline" } as const;
  assert.deepEqual(resolveEffectiveSetting(unavailable), unavailable);
  assert.equal(resolveEffectiveSetting({ ...observed, state: "ok", layers: {} }).state, "unavailable");
});

test("the sandbox entry points still report their original errors and validation order", () => {
  const invalidJson = { name: "SandboxError", code: "sandbox.invalid_json", message: "Only bounded JSON values are allowed" };
  assert.throws(() => assertJson([undefined]), invalidJson);
  assert.throws(() => assertSchema({ type: "wrong", value: undefined }), invalidJson);
  assert.throws(() => assertSchema({ type: "string", pattern: ".*" }), { name: "SandboxError", code: "sandbox.invalid_schema", message: "Unsupported schema keyword: pattern" });
  const schema: unknown = { type: "array", items: { type: "string", maxLength: 1 } };
  assertSchema(schema);
  assertMatches(schema, ["🧪"]);
  assert.throws(() => assertMatches(schema, [undefined]), invalidJson);
  assert.throws(() => assertMatches(schema, ["xx"], "value"), (error: unknown) => {
    assert.ok(error instanceof SandboxError);
    assert.equal(error.code, "sandbox.schema_mismatch");
    assert.equal(error.message, "value[0]: string too long");
    return true;
  });
});
