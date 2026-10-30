import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_BUILD_TRUST, MemoryPluginConsentLedger, MemoryPluginRuntimeRepository, PluginRuntime, PluginSupervisor, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

// BL-588, S-75 ⑥ (RAC-990～993): code that runs in the Host's process holds the Host's trust level, unless the Host's own code admitted that very
// definition object. The refusal is `plugin.in_process_denied`, before any record, consent or private data, and again before every start.

const FINGERPRINT = `ed25519:sha256:${"a".repeat(64)}`;
const PINNED = { level: "pinned", publisher_key_id: FINGERPRINT } as const;
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

function manifest(pluginId = "io.molis.work.example.inproc", signature = "inproc-label"): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "In-process fixture", kind: "app",
    publisher: { publisher_id: "inproc", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } };
}
/** A definition whose code runs in the Host's process (`execution` left at its default), counting how often that code was started. */
function inProcessDefinition(value = manifest(), starts: string[] = []): PluginDefinition {
  return { manifest: value, async start() { starts.push("start"); return { kind: "app", views: [] }; }, async stop() {} };
}
const sandboxedDefinition = (value = manifest()): PluginDefinition =>
  ({ manifest: value, execution: "sandbox", async start() { return { kind: "app", views: [] }; }, async stop() {} }) as PluginDefinition;

/** Everything an install may leave behind, so a refusal can be shown to leave none of it. */
function observed(admit?: Set<PluginDefinition>) {
  const repository = new MemoryPluginRuntimeRepository(), consents = new MemoryPluginConsentLedger(), effects: string[] = [];
  const privateData = { value: "kept" };
  const ledger = { record: (entry: Parameters<MemoryPluginConsentLedger["record"]>[0]) => { effects.push("consent"); return consents.record(entry); },
    consents: (id: string) => consents.consents(id), publishers: () => consents.publishers(), pinPublisher: consents.pinPublisher.bind(consents) };
  const storage = { get: repository.get.bind(repository), list: repository.list.bind(repository), save: (r: PluginInstanceRecord) => { effects.push("save"); repository.save(r); } };
  const executor = { start: async (d: PluginDefinition, c: Parameters<PluginDefinition["start"]>[0]) => { effects.push("start"); return { contribution: await d.start(c) }; },
    stop: async (d: PluginDefinition, c: Parameters<NonNullable<PluginDefinition["stop"]>>[0]) => { effects.push("stop"); await d.stop?.(c); },
    uninstalled: () => { effects.push("uninstalled"); }, keptDataDiscarded: () => { effects.push("discard"); },
    capturePrivateData: () => { effects.push("capture"); return { ...privateData }; },
    restorePrivateData: (_installId: string, snapshot: unknown) => { effects.push("restore"); Object.assign(privateData, snapshot); } };
  const runtime = new PluginRuntime(storage, executor, { hostIds: ISOLATED_HOST_IDS, consents: ledger, ...admit ? { inProcess: { admit } } : {} });
  const snapshot = () => ({ installs: runtime.list(), effects: [...effects], consents: runtime.list().flatMap(r => consents.consents(r.plugin_id)), privateData: { ...privateData } });
  return { runtime, repository, effects, privateData, snapshot };
}

for (const state of ["running", "disabled"] as const) {
  test(`RAC-990-UPGRADE-01 S-75 a ${state} install refuses an unadmitted upgrade before its callback, stop or private data`, async () => {
    const original = inProcessDefinition(), admit = new Set([original]), h = observed(admit);
    const { install } = h.runtime.install({ definition: original, deployment: "local", grants: [], trust: UNSIGNED_TRUST });
    await h.runtime.start(install.install_id);
    if (state === "disabled") await h.runtime.stop(install.install_id);
    let validations = 0, starts = 0;
    const target: PluginDefinition = { ...inProcessDefinition({ ...manifest(), version: "2.0.0", upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } }),
      async validateUpgrade() { validations++; h.privateData.value = "upgraded"; },
      async start() { starts++; return { kind: "app", views: [] }; } };
    const before = h.snapshot(), contribution = h.runtime.contribution(install.install_id);
    await assert.rejects(h.runtime.upgrade({ install_id: install.install_id, definition: target }), code("plugin.in_process_denied"));
    assert.equal(validations, 0, "the unadmitted callback never runs");
    assert.equal(starts, 0, "the unadmitted code never starts");
    assert.deepEqual(h.snapshot(), before, "no stop, record, consent, capture or data mutation precedes the refusal");
    assert.equal(h.runtime.contribution(install.install_id), contribution, "the old live instance is unchanged");
    admit.add(target);
    const upgraded = await h.runtime.upgrade({ install_id: install.install_id, definition: target });
    assert.equal(upgraded.install.install_id, install.install_id);
    assert.equal(upgraded.install.version, "2.0.0");
    assert.equal(upgraded.install.state, state, "upgrading keeps the person's disabled state");
    assert.equal(validations, 1);
    assert.equal(starts, state === "running" ? 1 : 0);
    assert.equal(h.privateData.value, "upgraded");
    await h.runtime.stop(install.install_id);
  });
}

test("RAC-990 S-75 a Runtime that admits no definition refuses unsigned and pinned code in the Host's process before any record, consent or data", () => {
  const h = observed(new Set());
  for (const trust of [UNSIGNED_TRUST, PINNED] as const) {
    const before = h.snapshot();
    assert.throws(() => h.runtime.install({ definition: inProcessDefinition(manifest("io.molis.work.example.inproc", trust.level === "pinned" ? FINGERPRINT : "inproc-label")),
      deployment: "local", grants: [], trust }), code("plugin.in_process_denied"), trust.level);
    assert.deepEqual(h.snapshot(), before, "a refusal leaves no install, consent or effect");
  }
  assert.deepEqual(h.runtime.list(), []);
});

test("RAC-990 S-75 the Host's own build, and sandboxed definitions of any level, are not what the rule refuses", () => {
  const h = observed(new Set());
  assert.equal(h.runtime.install({ definition: inProcessDefinition(manifest("io.molis.work.example.build", "build")), deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
  assert.equal(h.runtime.install({ definition: sandboxedDefinition(manifest("io.molis.work.example.generated", "generated")), deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
  assert.equal(h.runtime.install({ definition: sandboxedDefinition(manifest("io.molis.work.example.signed", FINGERPRINT)), deployment: "local", grants: [], trust: PINNED }).install.publisher_trust, "pinned");
});

test("RAC-991 S-75 a definition is admitted as the object the Host named, not by what it says or looks like", async () => {
  const starts: string[] = [], admitted = inProcessDefinition(manifest(), starts), lookalike = inProcessDefinition(manifest(), starts);
  const h = observed(new Set([admitted]));
  assert.throws(() => h.runtime.install({ definition: lookalike, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.in_process_denied"), "same manifest, another object");
  assert.throws(() => h.runtime.install({ definition: { ...admitted }, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.in_process_denied"), "a copy of the admitted object");
  const { install } = h.runtime.install({ definition: admitted, deployment: "local", grants: [], trust: UNSIGNED_TRUST });
  await h.runtime.start(install.install_id);
  assert.deepEqual(starts, ["start"]);
  const elsewhere = observed(new Set());
  assert.throws(() => elsewhere.runtime.install({ definition: admitted, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.in_process_denied"), "admission belongs to the Runtime that was given it");
});

test("RAC-992 S-75 a stored record is rechecked before every start and recovery, and a refusal is not retried until quarantine", async () => {
  const starts: string[] = [], plugin = inProcessDefinition(manifest(), starts), repository = new MemoryPluginRuntimeRepository();
  // The record is from a real public install in a Runtime that checks nothing (a test's bare Runtime), then the Host starts it under a strict one.
  const installed = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: plugin, deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install;
  assert.equal(installed.execution, "host");
  const strict = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, inProcess: { admit: new Set() } });
  strict.register(plugin);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await assert.rejects(attempt === 0 ? strict.start(installed.install_id) : strict.recover(installed.install_id), code("plugin.in_process_denied"));
    const record = strict.get(installed.install_id);
    assert.equal(record.state, "crashed", "never quarantined by a refusal that retrying cannot change");
    assert.equal(record.last_error_code, "plugin.in_process_denied");
    assert.equal(record.recovery_count, 0);
  }
  assert.deepEqual(starts, [], "the plugin's code never ran");
  // Admitting the object is a change of the Host's facts, and the same path then recovers it.
  const admitting = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, inProcess: { admit: new Set([plugin]) } });
  admitting.register(plugin);
  await admitting.recover(installed.install_id);
  assert.equal(admitting.get(installed.install_id).state, "running");
  assert.deepEqual(starts, ["start"]);
});

test("RAC-992 S-75 a live instance is rechecked when it is started again, and withdrawn if it is no longer admitted", async () => {
  const starts: string[] = [], plugin = inProcessDefinition(manifest(), starts), admit = new Set([plugin]), h = observed(admit);
  const { install } = h.runtime.install({ definition: plugin, deployment: "local", grants: [], trust: UNSIGNED_TRUST });
  await h.runtime.start(install.install_id);
  assert.equal(h.runtime.get(install.install_id).state, "running");
  admit.delete(plugin);
  await assert.rejects(h.runtime.start(install.install_id), code("plugin.in_process_denied"));
  assert.equal(h.runtime.get(install.install_id).state, "crashed");
  assert.equal(h.runtime.contribution(install.install_id), null, "its contribution is withdrawn");
});

test("RAC-996 S-75 a start entry that forgets its trust runs nowhere in a strict Runtime; the Host's build and an admitted fixture do", async () => {
  const forgotten = inProcessDefinition(manifest("io.molis.work.example.forgot", "forgot")), shipped = inProcessDefinition(manifest("io.molis.work.example.shipped", "shipped"));
  const fixture = inProcessDefinition(manifest("io.molis.work.example.fixture", "fixture"));
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS, inProcess: { admit: new Set([fixture]) } });
  const supervisor = new PluginSupervisor(runtime);
  const report = await supervisor.start([{ definition: forgotten }, { definition: shipped, trust: HOST_BUILD_TRUST }, { definition: fixture }]);
  assert.deepEqual(report.running.sort(), ["io.molis.work.example.fixture", "io.molis.work.example.shipped"]);
  assert.deepEqual(report.failed.map(state => [state.plugin_id, state.code]), [["io.molis.work.example.forgot", "plugin.in_process_denied"]]);
  assert.deepEqual(runtime.list().filter(record => record.plugin_id === "io.molis.work.example.forgot"), [], "nothing of it was installed");
});

test("RAC-993 S-75 nothing a plugin, a package or a caller writes opens the Host's process to it", () => {
  const strict = () => new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS, inProcess: { admit: new Set() } });
  // A Manifest cannot name it: not under any spelling of the option, nor with a trust claim or a `host` execution of its own.
  const claimed = inProcessDefinition(Object.assign(manifest(), { inProcess: { admit: true }, in_process: true, admit: true, execution: "host", trust: { level: "host" }, bundled: true }));
  assert.throws(() => strict().install({ definition: claimed, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.in_process_denied"));
  // A caller's install input cannot carry it either: the option is the Runtime's, set at construction.
  const plain = inProcessDefinition();
  const smuggled = { inProcess: { admit: new Set([plain]) }, admit: new Set([plain]) };
  assert.throws(() => strict().install({ definition: plain, deployment: "local", grants: [], trust: UNSIGNED_TRUST, ...smuggled }), code("plugin.in_process_denied"));
});

test("RAC-993 S-75 the option exists only in the Runtime package: no contracts or plugin SDK export names it", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]);
  const snapshots = files("tooling/gates/api").filter(file => file.endsWith(".txt"));
  assert.ok(snapshots.length > 20, "the public API snapshots are read");
  for (const file of snapshots) assert.doesNotMatch(readFileSync(file, "utf8"), /\binProcess\b|InProcessAdmission|in_process_admit/u, file);
});
