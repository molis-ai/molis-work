import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { ActionError, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { HOST_BUILD_TRUST, MemoryPluginConsentLedger, MemoryPluginRuntimeRepository, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL, PluginRuntime,
  SqlitePluginRuntimeRepository, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

const FINGERPRINT = `ed25519:sha256:${"a".repeat(64)}`;
const OTHER_KEY = `ed25519:sha256:${"b".repeat(64)}`;
const PINNED = { level: "pinned", publisher_key_id: FINGERPRINT } as const;
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const caller = { actor_id: "identity-test", audience: "user" as const, project_id: "p", permissions: [] };

function manifest(pluginId: string, signature: string): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Identity fixture", kind: "app",
    publisher: { publisher_id: "identity", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } };
}
const definition = (value: PluginManifest): PluginDefinition => ({ manifest: value, async start() { return { kind: "app", views: [] }; }, async stop() {} });
const install = (runtime: PluginRuntime, pluginId: string, signature: string, trust: Parameters<PluginRuntime["install"]>[0]["trust"] = UNSIGNED_TRUST) =>
  runtime.install({ definition: definition(manifest(pluginId, signature)), deployment: "local", grants: [], trust });

/** Observe all writes through the actual Runtime ports, including the kept-data hook that must never run on an identity refusal. */
function observed(hostIds: ReadonlySet<string> = ISOLATED_HOST_IDS) {
  const repository = new MemoryPluginRuntimeRepository(), consents = new MemoryPluginConsentLedger(), actions = new ActionService();
  const effects: string[] = [], privateData = new Map<string, string>();
  const rows = new Map<string, PluginInstanceRecord>();
  const executor: PluginExecutor = {
    start: async (d, c) => { effects.push("start"); return { contribution: await d.start(c) }; },
    stop: async (d, c) => { effects.push("stop"); await d.stop?.(c); },
    uninstalled: r => { effects.push("uninstalled"); if (!r.retain_private_data) privateData.delete(r.install_id); },
    keptDataDiscarded: r => { effects.push("discard"); privateData.delete(r.install_id); },
  };
  const ledger = { record: (entry: Parameters<MemoryPluginConsentLedger["record"]>[0]) => { effects.push("consent"); return consents.record(entry); },
    consents: (id: string) => consents.consents(id), publishers: () => consents.publishers(), pinPublisher: consents.pinPublisher.bind(consents) };
  const storage = { get: repository.get.bind(repository), list: repository.list.bind(repository), save: (r: PluginInstanceRecord) => {
    effects.push("save"); rows.set(r.install_id, structuredClone(r)); repository.save(r);
  } };
  const runtime = new PluginRuntime(storage, executor, { hostIds, consents: ledger, actions: { registry: actions, project_id: "p" } });
  const snapshot = () => ({ installs: runtime.list(), effects: [...effects], rows: [...rows.values()], privateData: [...privateData],
    consents: runtime.list().flatMap(r => consents.consents(r.plugin_id)), publishers: consents.publishers() });
  function refused(run: () => unknown, expected = "plugin.id_namespace_conflict") {
    const before = snapshot(); assert.throws(run, code(expected)); assert.deepEqual(snapshot(), before, "refusal has no install, consent or private-data effect");
  }
  return { runtime, repository, consents, effects, privateData, actions, snapshot, refused };
}

test("RAC-394 S-75 a signature in the fingerprint form is for a pinned key only, never for a label the author wrote", () => {
  const h = observed();
  for (const signature of [FINGERPRINT, FINGERPRINT.toUpperCase(), ` ${FINGERPRINT}`, `${FINGERPRINT}\t`, ` \n${FINGERPRINT.toUpperCase()} \t`]) {
    for (const trust of [UNSIGNED_TRUST, HOST_BUILD_TRUST]) h.refused(() => install(h.runtime, "io.molis.work.example.fp", signature, trust), "plugin.signer_mismatch");
  }
  h.refused(() => install(h.runtime, "io.molis.work.example.fp", OTHER_KEY, PINNED), "plugin.signer_mismatch");
  h.refused(() => install(h.runtime, "io.molis.work.example.fp", "copied-label", PINNED), "plugin.signer_mismatch");
  assert.equal(install(h.runtime, "io.molis.work.example.fp", FINGERPRINT, PINNED).install.publisher_trust, "pinned");
  assert.equal(install(h.runtime, "io.molis.work.example.label", "my-own-label").install.publisher_trust, "unsigned");
});

test("RAC-395 S-75 unsigned ids cannot nest above or below, including identical labels; pinned keys alone share a namespace", async () => {
  for (const firstId of ["io.molis.work.example.tools", "io.molis.work.example.tools.extra"]) {
    const h = observed(); install(h.runtime, firstId, "first");
    const nestedId = firstId.endsWith("extra") ? "io.molis.work.example.tools" : `${firstId}.extra`;
    for (const label of ["first", "second"]) h.refused(() => install(h.runtime, nestedId, label));
    h.refused(() => install(h.runtime, nestedId, FINGERPRINT, PINNED));
    assert.equal(install(h.runtime, "io.molis.work.example.toolset", "second").install.publisher_trust, "unsigned", "letters without a dot are not nesting");
  }
  for (const firstId of ["io.molis.work.example.signed", "io.molis.work.example.signed.extra"]) {
    const h = observed(), parent = install(h.runtime, firstId, FINGERPRINT, PINNED);
    const nestedId = firstId.endsWith("extra") ? "io.molis.work.example.signed" : `${firstId}.extra`;
    h.refused(() => install(h.runtime, nestedId, OTHER_KEY, { level: "pinned", publisher_key_id: OTHER_KEY }));
    h.refused(() => install(h.runtime, nestedId, FINGERPRINT, { level: "pinned", publisher_key_id: OTHER_KEY }), "plugin.signer_mismatch");
    const child = install(h.runtime, nestedId, FINGERPRINT, PINNED);
    assert.equal(child.install.publisher_trust, "pinned");
    await h.runtime.start(parent.install.install_id); await h.runtime.start(child.install.install_id);
    await h.runtime.stop(child.install.install_id); await h.runtime.stop(parent.install.install_id);
  }
  const h = observed(), first = install(h.runtime, "io.molis.work.example.same", "first");
  assert.notEqual(install(h.runtime, "io.molis.work.example.same", "second").install.install_id, first.install.install_id, "BL-586 remains a separate decision");
});

test("RAC-395 S-75 an uninstalled plugin frees its name", async () => {
  const h = observed(), first = install(h.runtime, "io.molis.work.example.gone", "first");
  h.refused(() => install(h.runtime, "io.molis.work.example.gone.child", "first"));
  await h.runtime.uninstall(first.install.install_id);
  assert.equal(install(h.runtime, "io.molis.work.example.gone.child", "second").install.plugin_id, "io.molis.work.example.gone.child");
});

test("RAC-399 S-75 an id the Host's build ships, or one under it, is not for another trust level", () => {
  const h = observed(new Set(["io.molis.work.example.shipped"]));
  for (const id of ["io.molis.work.example.shipped", "io.molis.work.example.shipped.sub", "io.molis.work.example"]) {
    h.refused(() => install(h.runtime, id, "someone")); h.refused(() => install(h.runtime, id, FINGERPRINT, PINNED));
  }
  assert.equal(install(h.runtime, "io.molis.work.example.shipped", "host-label", HOST_BUILD_TRUST).install.publisher_trust, "host");
  assert.equal(install(h.runtime, "io.molis.work.example.shipped.child", "host-label", HOST_BUILD_TRUST).install.publisher_trust, "host");
  assert.equal(install(h.runtime, "io.molis.work.example.other", "someone").install.publisher_trust, "unsigned");
});

test("RAC-394 RAC-399 S-75 identity refusals precede consents and retained or discarded private-data cleanup", async () => {
  for (const retain_private_data of [false, true]) {
    const hostIds = new Set<string>(), h = observed(hostIds), id = "io.molis.work.example.kept";
    const original = install(h.runtime, id, "owner");
    h.privateData.set(original.install.install_id, "private bytes");
    await h.runtime.uninstall(original.install.install_id, { retain_private_data });
    // This id becomes part of the next Host build. A refusal must not prepare/erase the earlier uninstalled installation's data.
    hostIds.add(id);
    const requested = { ...manifest(id, "owner"), always_on: true };
    h.refused(() => h.runtime.install({ definition: definition(requested), deployment: "local", grants: [], trust: UNSIGNED_TRUST,
      discard_kept_data: true, consents: [{ kind: "always_on", subject: "always_on" }] }));
  }
});

function actionable(id: string, signature: string, calls: string[]) {
  const action: ActionDefinition<Record<string, never>, string> = { capability_id: `${id}.read`, version: 1, operation: "query",
    action: { title: "Read identity", description: "Read the running installation", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } } };
  const plugin: PluginDefinition = { manifest: { ...manifest(id, signature), actions: [action] },
    async start() { calls.push(`start:${id}`); return { kind: "app", actions: [{ ...action, handle: () => { calls.push(`handle:${id}`); return id; } }] }; } };
  return { plugin, action };
}

test("RAC-396 S-75 an installation's actions are registered under its install id, and under its plugin id only when it is of the Host's build", async () => {
  const id = "io.molis.work.example.provider";
  for (const trust of [UNSIGNED_TRUST, PINNED, HOST_BUILD_TRUST]) {
    const service = new ActionService(), calls: string[] = [], fixture = actionable(id, trust.level === "pinned" ? FINGERPRINT : "label", calls);
    const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: service, project_id: "p", providerId: () => id } });
    const installed = runtime.install({ definition: fixture.plugin, deployment: "local", trust, grants: [] }).install;
    if (trust.level !== "host") {
      await assert.rejects(runtime.start(installed.install_id), code("plugin.id_namespace_conflict"));
      assert.equal(runtime.get(installed.install_id).state, "crashed"); assert.equal(runtime.get(installed.install_id).last_error_code, "plugin.id_namespace_conflict");
      assert.deepEqual(calls, []); assert.deepEqual(service.discover(caller), [], "no handler or provider is registered");
    } else {
      await runtime.start(installed.install_id);
      assert.equal(await service.invoke(caller, { ...fixture.action, provider_id: id }, {}), id);
      await runtime.stop(installed.install_id);
    }
  }
});

test("RAC-395 RAC-399 S-75 normally loaded existing conflicts crash before activation in the same or a new Runtime", async () => {
  for (const restart of [false, true]) for (const above of [false, true]) for (const conflict of ["unsigned-same", "unsigned-other", "pinned", "host"] as const) {
    const db = new Database(":memory:"); db.exec(PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL);
    try {
      const repository = new SqlitePluginRuntimeRepository(db), service = new ActionService(), calls: string[] = [], registrations: string[] = [];
      const hostIds = new Set<string>(), consents = new MemoryPluginConsentLedger();
      const registry = { registerProvider: (r: ActionProviderRegistration) => { registrations.push(r.provider.provider_id); return service.registerProvider(r); } };
      const runtimeOptions = { hostIds, consents, actions: { registry, project_id: "p" } };
      const original = new PluginRuntime(repository, undefined, runtimeOptions), id = "io.molis.work.example.existing";
      const old = actionable(id, conflict === "pinned" ? FINGERPRINT : "same-label", calls);
      const installed = original.install({ definition: old.plugin, deployment: "local", grants: [], trust: conflict === "pinned" ? PINNED : UNSIGNED_TRUST }).install;
      await original.start(installed.install_id);
      assert.equal(await service.invoke(caller, { ...old.action, provider_id: installed.install_id }, {}), id);
      if (restart) await original.stop(installed.install_id, { preserve_enabled: true });
      const nestedId = above ? id.slice(0, id.lastIndexOf(".")) : `${id}.child`;
      if (conflict === "host") hostIds.add(nestedId);
      else {
        // Existing records arrive unchanged through the repository port. Each record is from a real public install, never a forged state/trust shape.
        const source = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
        const existing = install(source, nestedId, conflict === "pinned" ? OTHER_KEY : conflict === "unsigned-other" ? "other-label" : "same-label",
          conflict === "pinned" ? { level: "pinned", publisher_key_id: OTHER_KEY } : UNSIGNED_TRUST).install;
        repository.save(existing);
      }
      const runtime = restart ? new PluginRuntime(new SqlitePluginRuntimeRepository(db), undefined, runtimeOptions) : original;
      if (restart) runtime.register(old.plugin); // The usual load path for an existing installation; it does not reinstall it.
      const priorCalls = [...calls], priorConsents = consents.consents(id), priorRegistrations = [...registrations];
      await assert.rejects(runtime.start(installed.install_id), code("plugin.id_namespace_conflict"));
      assert.equal(runtime.get(installed.install_id).state, "crashed"); assert.equal(runtime.get(installed.install_id).last_error_code, "plugin.id_namespace_conflict");
      assert.deepEqual(calls, priorCalls); assert.deepEqual(registrations, priorRegistrations); assert.deepEqual(consents.consents(id), priorConsents);
      assert.deepEqual(service.discover(caller), [], "an existing live provider is withdrawn and a new one is never registered");
      await assert.rejects(service.invoke(caller, { ...old.action, provider_id: installed.install_id }, {}));
      await assert.rejects(runtime.recover(installed.install_id), code("plugin.id_namespace_conflict"));
      assert.equal(runtime.get(installed.install_id).state, "crashed"); assert.equal(runtime.get(installed.install_id).last_error_code, "plugin.id_namespace_conflict");
      assert.deepEqual(calls, priorCalls); assert.deepEqual(registrations, priorRegistrations);
      // Removing the conflict permits explicit recovery on the same public path, without reinstalling or losing data.
      if (conflict === "host") hostIds.clear();
      else { const other = repository.list().find(r => r.install_id !== installed.install_id)!;
        const source = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS }); await source.uninstall(other.install_id); }
      await runtime.recover(installed.install_id);
      assert.equal(await service.invoke(caller, { ...old.action, provider_id: installed.install_id }, {}), id);
      await runtime.stop(installed.install_id);
    } finally { db.close(); }
  }
});

test("RAC-395 S-75 a refused nested installation leaves the legal original provider usable", async () => {
  const h = observed(), calls: string[] = [], original = actionable("io.molis.work.example.usable", "label", calls);
  const record = h.runtime.install({ definition: original.plugin, deployment: "local", trust: UNSIGNED_TRUST, grants: [] }).install;
  await h.runtime.start(record.install_id);
  h.refused(() => install(h.runtime, `${record.plugin_id}.child`, "label"));
  assert.equal(h.runtime.get(record.install_id).state, "running");
  assert.equal(h.runtime.contribution(record.install_id)?.kind, "app");
  assert.equal(await h.actions.invoke(caller, { ...original.action, provider_id: record.install_id }, {}), record.plugin_id);
  await h.runtime.stop(record.install_id);
});

test("RAC-399 S-75 Runtime construction requires the Host catalog even for JavaScript callers", () => {
  // @ts-expect-error Deliberately missing the required catalog, as an untyped embedder might do.
  assert.throws(() => new PluginRuntime(), code("plugin.state_invalid"));
  // @ts-expect-error An options object that omits hostIds must not silently disable the boundary.
  assert.throws(() => new PluginRuntime(undefined, undefined, {}), code("plugin.state_invalid"));
});
