import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { STATE_MACHINE_DECLARATION_LIMITS, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { STATE_VOCABULARIES } from "@molis-ai/molis-work-contracts/platform/state-vocabulary";
import { STATE_RING_FAMILIES } from "@molis-ai/molis-work-contracts/platform/ui";
import { KNOWLEDGE_CARD_STATES } from "@molis-ai/molis-work-contracts/services/knowledge";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { defineStateMachine } from "@molis-ai/molis-work-plugin-sdk/state-machine";
import { runPluginCli } from "@molis-ai/molis-work-plugin-cli";

const pluginId = "io.molis.work.state-probe";
const data = {
  machine_id: pluginId + ".item", version: 1,
  states: { idle: "idle", active: "running", closed: "done" },
  initial: "idle", terminal: ["closed"],
} as const;
const transitions = {
  begin: { from: ["idle"], to: "active" },
  finish: { from: ["active"], to: "closed", trigger: { capability_id: "state-probe.finish", version: 1 } },
} as const;
const manifest: PluginManifest = {
  schema_version: 1, host_api_version: 1, plugin_id: pluginId, name: "State probe", version: "1.0.0", kind: "app",
  publisher: { publisher_id: "state-probe", signature: "fixture" },
  entrypoints: [{ deployment: "local", entrypoint: "./must-not-run.mjs" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  ui: { contributions: [] },
};

test("SMP-01 SMP-09 SMP-19 public vocabulary uses only the shared 21 families and platform owners", () => {
  assert.equal(STATE_RING_FAMILIES.length, 21);
  const families = new Set(STATE_RING_FAMILIES.map(({ key }) => key));
  assert.deepEqual(Object.values(STATE_VOCABULARIES).map(({ owner }) => owner), ["plugin-runtime", "connector-host", "agent-host", "knowledge", "placement"]);
  for (const { states } of Object.values(STATE_VOCABULARIES)) {
    for (const family of Object.values(states)) assert.ok(families.has(family));
  }
});

test("SMP-03 SMP-07 untrusted declarations reject wrong identity, bounds, shapes and initial or terminal states", () => {
  const invalid = [
    { ...data, machine_id: "platform.plugin-runtime.item" },
    { ...data, machine_id: "io.molis.work.another.item" },
    { ...data, machine_id: pluginId + "." + "a".repeat(STATE_MACHINE_DECLARATION_LIMITS.id) },
    { ...data, version: 0 }, { ...data, initial: "unknown" }, { ...data, terminal: ["closed", "closed"] },
    { ...data, terminal: ["unknown"] }, { ...data, states: { idle: "made-up" } },
    { ...data, states: Object.fromEntries(Array.from({ length: STATE_MACHINE_DECLARATION_LIMITS.states + 1 }, (_, i) => ["s" + i, "idle"])) },
    { ...data, transitions }, { ...data, value: "business contents" }, null,
  ];
  for (const machine of invalid) assert.throws(() => parsePluginManifest({ ...manifest, state_machines: [machine] }), { code: "state_machines.declaration_invalid" });
  for (const machines of [[data, data], Array.from({ length: STATE_MACHINE_DECLARATION_LIMITS.machines + 1 }, () => data), {}]) {
    assert.throws(() => parsePluginManifest({ ...manifest, state_machines: machines }), { code: "state_machines.declaration_invalid" });
  }
  assert.deepEqual(parsePluginManifest({ ...manifest, state_machines: [data] }).state_machines, [data]);
  assert.equal(parsePluginManifest(manifest).state_machines, undefined);
});

test("SMP-03 SMP-05 SMP-15 definitions check edges and permit a trigger reference before actions are registered", () => {
  const machine = defineStateMachine({ ...data, transitions });
  assert.deepEqual(machine.describe(), data);
  assert.deepEqual(machine.definition.transitions.finish.trigger, transitions.finish.trigger);
  assert.notEqual(machine.definition.transitions.finish.trigger, transitions.finish.trigger);
  assert.ok(Object.isFrozen(machine.definition.transitions.finish.trigger));
  assert.ok(Object.isFrozen(machine.definition.transitions.finish.from));
  const trigger = { capability_id: "7Connector:Probe", version: 1 };
  assert.deepEqual(defineStateMachine({ ...data, transitions: { ...transitions, finish: { ...transitions.finish, trigger } } }).definition.transitions.finish.trigger, trigger);
  assert.deepEqual(KNOWLEDGE_CARD_STATES, Object.keys(STATE_VOCABULARIES.knowledgeCard.states));
  assert.equal(machine.family("active"), "running");
  assert.equal(machine.next("active", "finish"), "closed");
  assert.equal(machine.can("closed", "begin"), false);
  assert.throws(() => machine.assert("closed", "begin"), { code: "state_machines.transition_invalid" });
  assert.throws(() => defineStateMachine({ ...data, transitions: { ...transitions, reopen: { from: ["closed"], to: "idle" } } }), { code: "state_machines.declaration_invalid" });
  assert.throws(() => defineStateMachine({ ...data, transitions: { begin: transitions.begin } }), { code: "state_machines.declaration_invalid" });
  assert.throws(() => defineStateMachine({ ...data, transitions: { ...transitions, broken: { from: ["idle"], to: "unknown" } } }), { code: "state_machines.declaration_invalid" });
  assert.throws(() => defineStateMachine({ ...data, machine_id: "no-dots", transitions }), { code: "state_machines.declaration_invalid" });
});

test("SMP-04 makes and validates the template for long plugin ids with a numeric segment", async t => {
  const dir = await mkdtemp(join(tmpdir(), "molis-state-template-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "plugin");
  const id = "io.molis.work." + "2state.".repeat(22) + "notes";
  const messages: string[] = [];
  const output = { stdout: (line: string) => messages.push(line), stderr: (line: string) => messages.push(line) };
  assert.equal(await runPluginCli(["create", path, id, "example", "signed-label"], output), 0, messages.join("\n"));
  assert.equal(await runPluginCli(["validate", join(path, "manifest.json")], output), 0, messages.join("\n"));
  const created = JSON.parse(await readFile(join(path, "manifest.json"), "utf8")) as PluginManifest;
  assert.equal(created.state_machines?.[0]?.machine_id, id + ".result");
});

test("SMP-05 state changes keep CAS and the caller's authority in the write port", async () => {
  const machine = defineStateMachine({ ...data, transitions });
  const trace: string[] = [];
  const port = {
    beforeEffect: () => { trace.push("authority"); },
    compareAndSet: (expected: string, next: string) => { trace.push(expected + " → " + next); return false; },
  };
  await assert.rejects(machine.apply(port, { expectedFrom: "closed", event: "begin" }), { code: "state_machines.transition_invalid" });
  assert.deepEqual(trace, []);
  await assert.rejects(machine.apply(port, { expectedFrom: "idle", event: "begin" }), { code: "state_machines.state_changed" });
  assert.deepEqual(trace, ["authority", "idle → active"]);
  await assert.rejects(machine.apply({ ...port, beforeEffect() { throw new Error("revoked"); } }, { expectedFrom: "idle", event: "begin" }), /revoked/u);
  assert.deepEqual(trace, ["authority", "idle → active"]);
});

test("SMP-07 SMP-12 validate reads and reports metadata without executing the entrypoint", async t => {
  const dir = await mkdtemp(join(tmpdir(), "molis-state-declarations-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "manifest.json");
  await writeFile(join(dir, "must-not-run.mjs"), "throw Error('entrypoint executed')");
  const messages: string[] = [];
  const output = { stdout: (text: string) => messages.push(text), stderr: (text: string) => messages.push(text) };
  await writeFile(path, JSON.stringify({ ...manifest, state_machines: [data] }));
  assert.equal(await runPluginCli(["validate", path], output), 0);
  assert.deepEqual(JSON.parse(messages.pop()!).state_machines, [data]);
  await writeFile(path, JSON.stringify({ ...manifest, state_machines: [{ ...data, transitions }] }));
  assert.equal(await runPluginCli(["validate", path], output), 1);
  assert.equal(JSON.parse(messages.pop()!).code, "state_machines.declaration_invalid");
});
