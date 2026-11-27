import assert from "node:assert/strict";
import test from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { ActionError, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { HOST_BUILD_TRUST, MemoryPluginConsentLedger, MemoryPluginRuntimeRepository, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL, PluginRuntime,
  SqlitePluginRuntimeRepository, UNSIGNED_TRUST, resolveActionProviderId, type ReleasePackages } from "@molis-ai/molis-work-plugin-runtime";
import { HOST_STAND_IN_IDS, ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

const FINGERPRINT = `ed25519:sha256:${"a".repeat(64)}`;
const OTHER_KEY = `ed25519:sha256:${"b".repeat(64)}`;
const PINNED = { level: "pinned", publisher_key_id: FINGERPRINT } as const;
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const caller = { actor_id: "identity-test", audience: "user" as const, project_id: "p", permissions: [] };

function manifest(pluginId: string, signature: string): PluginManifest {
  return { schema_version: 1, host_api_version: 1, plugin_id: pluginId, version: "1.0.0", name: "Identity fixture", kind: "app",
    publisher: { publisher_id: "identity", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } };
}
const definition = (value: PluginManifest): PluginDefinition => ({ manifest: value, async start() { return { kind: "app", views: [] }; }, async stop() {} });
const install = (runtime: PluginRuntime, pluginId: string, signature: string, trust: Parameters<PluginRuntime["install"]>[0]["trust"] = UNSIGNED_TRUST) =>
  runtime.install({ definition: definition(manifest(pluginId, signature)), deployment: "local", grants: [], trust });

/** Observe all writes through the actual Runtime ports, including the kept-data hook that must never run on an identity refusal. */
function observed(hostIds: ReadonlySet<string> = ISOLATED_HOST_IDS, releaseIds?: ReleasePackages) {
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
  const runtime = new PluginRuntime(storage, executor, { hostIds, ...(releaseIds ? { releaseIds } : {}), consents: ledger, actions: { registry: actions, project_id: "p" } });
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
    for (const trust of [UNSIGNED_TRUST, HOST_BUILD_TRUST]) h.refused(() => install(h.runtime, "com.example.fp", signature, trust), "plugin.signer_mismatch");
  }
  h.refused(() => install(h.runtime, "com.example.fp", OTHER_KEY, PINNED), "plugin.signer_mismatch");
  h.refused(() => install(h.runtime, "com.example.fp", "copied-label", PINNED), "plugin.signer_mismatch");
  assert.equal(install(h.runtime, "com.example.fp", FINGERPRINT, PINNED).install.publisher_trust, "pinned");
  assert.equal(install(h.runtime, "com.example.label", "my-own-label").install.publisher_trust, "unsigned");
});

test("RAC-395 S-75 unsigned ids cannot nest above or below, including identical labels; pinned keys alone share a namespace", async () => {
  for (const firstId of ["com.example.tools", "com.example.tools.extra"]) {
    const h = observed(); install(h.runtime, firstId, "first");
    const nestedId = firstId.endsWith("extra") ? "com.example.tools" : `${firstId}.extra`;
    for (const label of ["first", "second"]) h.refused(() => install(h.runtime, nestedId, label));
    h.refused(() => install(h.runtime, nestedId, FINGERPRINT, PINNED));
    assert.equal(install(h.runtime, "com.example.toolset", "second").install.publisher_trust, "unsigned", "letters without a dot are not nesting");
  }
  for (const firstId of ["com.example.signed", "com.example.signed.extra"]) {
    const h = observed(), parent = install(h.runtime, firstId, FINGERPRINT, PINNED);
    const nestedId = firstId.endsWith("extra") ? "com.example.signed" : `${firstId}.extra`;
    h.refused(() => install(h.runtime, nestedId, OTHER_KEY, { level: "pinned", publisher_key_id: OTHER_KEY }));
    h.refused(() => install(h.runtime, nestedId, FINGERPRINT, { level: "pinned", publisher_key_id: OTHER_KEY }), "plugin.signer_mismatch");
    const child = install(h.runtime, nestedId, FINGERPRINT, PINNED);
    assert.equal(child.install.publisher_trust, "pinned");
    await h.runtime.start(parent.install.install_id); await h.runtime.start(child.install.install_id);
    await h.runtime.stop(child.install.install_id); await h.runtime.stop(parent.install.install_id);
  }
  const h = observed(), first = install(h.runtime, "com.example.same", "first");
  assert.notEqual(install(h.runtime, "com.example.same", "second").install.install_id, first.install.install_id, "BL-586 remains a separate decision");
});

test("RAC-395 S-75 an uninstalled plugin frees its name", async () => {
  const h = observed(), first = install(h.runtime, "com.example.gone", "first");
  h.refused(() => install(h.runtime, "com.example.gone.child", "first"));
  await h.runtime.uninstall(first.install.install_id);
  assert.equal(install(h.runtime, "com.example.gone.child", "second").install.plugin_id, "com.example.gone.child");
});

test("RAC-399 S-75 an id the Host's build ships, or one under it, is not for another trust level", () => {
  const h = observed(new Set(["com.example.shipped"]));
  for (const id of ["com.example.shipped", "com.example.shipped.sub", "io.molis.work.example"]) {
    h.refused(() => install(h.runtime, id, "someone")); h.refused(() => install(h.runtime, id, FINGERPRINT, PINNED));
  }
  assert.equal(install(h.runtime, "com.example.shipped", "host-label", HOST_BUILD_TRUST).install.publisher_trust, "host");
  assert.equal(install(h.runtime, "com.example.shipped.child", "host-label", HOST_BUILD_TRUST).install.publisher_trust, "host");
  assert.equal(install(h.runtime, "com.example.other", "someone").install.publisher_trust, "unsigned");
});

test("PSD-04 S-reserved-host-prefix a package not of the Host's build is refused any id under io.molis.work., listed in the Host's build or not, unsigned or under a pinned key", () => {
  const h = observed(new Set<string>());
  for (const id of ["io.molis.work.characters", "io.molis.work.assistant", "system.shelf", "io.molis.work.artifacts", "io.molis.work.not-yet-released"]) {
    h.refused(() => install(h.runtime, id, "someone")); h.refused(() => install(h.runtime, id, FINGERPRINT, PINNED));
  }
  assert.equal(install(h.runtime, "io.molis.work.characters", "host-label", HOST_BUILD_TRUST).install.publisher_trust, "host", "the Host's own build keeps the prefix");
  // 44B: the platform's own parts are `system.*`; no package installs under that prefix, unsigned or pinned. Only the Host's own build
  // runs one there (the Shelf the runtime hosts).
  for (const id of ["system.characters", "system.assistant", "system.artifacts", "system.shelf", "system.not-yet-named"]) {
    h.refused(() => install(h.runtime, id, "someone")); h.refused(() => install(h.runtime, id, FINGERPRINT, PINNED));
  }
  assert.equal(install(h.runtime, "system.shelf", "host-label", HOST_BUILD_TRUST).install.publisher_trust, "host", "the platform's own Shelf runs in the runtime");
});

/** A release folder that carries `ids`, each signed by `signer` (the folder's key, or this Home's for a package it ships unsigned). */
const release = (ids: readonly string[], signer = FINGERPRINT): ReleasePackages => ({ has: id => ids.includes(id), signedBy: (id, signature) => ids.includes(id) && signature === signer });

test("PSD-04a S-reserved-host-prefix only an id this release ships in its package folder passes the prefix check, and other names stay open", () => {
  const h = observed(new Set<string>(), release(["io.molis.work.content.shipped-pack"]));
  assert.equal(install(h.runtime, "io.molis.work.content.shipped-pack", FINGERPRINT, PINNED).install.publisher_trust, "pinned");
  h.refused(() => install(h.runtime, "io.molis.work.content.other-pack", FINGERPRINT, PINNED));
  assert.equal(install(h.runtime, "com.example.notes", "someone").install.plugin_id, "com.example.notes");
  assert.equal(install(h.runtime, "studio.294ae82b-b3fe-4dd6-8e65-28613de2a18e", FINGERPRINT, PINNED).install.plugin_id, "studio.294ae82b-b3fe-4dd6-8e65-28613de2a18e");
});

test("P-13 S-reserved-host-prefix a release id is taken only under that package's signer, at install and again at every start, so a record that skipped the preview never runs", async () => {
  const shipped = "io.molis.work.content.shipped-pack";
  // At install: the same id signed by another pinned key, or under an unsigned label, is refused with nothing written.
  const h = observed(new Set<string>(), release([shipped]));
  h.refused(() => install(h.runtime, shipped, OTHER_KEY, { level: "pinned", publisher_key_id: OTHER_KEY }));
  h.refused(() => install(h.runtime, shipped, "official-looking-label"));
  // At start: a record for the id signed by another key arrives through the repository (as if installed past the preview, here by a
  // Runtime that let any signer through); the Host's Runtime, which binds the signer, refuses it before activation, at start and recovery.
  for (const restart of [false, true]) {
    const db = openTestSqlite(":memory:"); db.exec(PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL);
    try {
      const repository = new SqlitePluginRuntimeRepository(db), service = new ActionService(), calls: string[] = [];
      const forged = actionable(shipped, OTHER_KEY, calls), genuine = actionable(shipped, FINGERPRINT, calls);
      const lax = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS, actions: { registry: service, project_id: "p" } });
      const record = lax.install({ definition: forged.plugin, deployment: "local", grants: [], trust: { level: "pinned", publisher_key_id: OTHER_KEY } }).install;
      const strictOptions = { hostIds: ISOLATED_HOST_IDS, releaseIds: release([shipped]), actions: { registry: service, project_id: "p" } };
      const runtime = restart ? new PluginRuntime(new SqlitePluginRuntimeRepository(db), undefined, strictOptions) : new PluginRuntime(repository, undefined, strictOptions);
      runtime.register(forged.plugin);
      await assert.rejects(runtime.start(record.install_id), code("plugin.id_namespace_conflict"));
      assert.equal(runtime.get(record.install_id).state, "crashed"); assert.equal(runtime.get(record.install_id).last_error_code, "plugin.id_namespace_conflict");
      await assert.rejects(runtime.recover(record.install_id), code("plugin.id_namespace_conflict"));
      assert.deepEqual(calls, [], "the forged package never started");
      assert.deepEqual(service.discover(caller), [], "nothing registered under the release id");
      await runtime.uninstall(record.install_id);
      // The package as the release signs it installs and starts in the same Runtime.
      const kept = runtime.install({ definition: genuine.plugin, deployment: "local", grants: [], trust: PINNED }).install;
      await runtime.start(kept.install_id);
      assert.deepEqual(calls, [`start:${shipped}`]);
      await runtime.stop(kept.install_id);
    } finally { db.close(); }
  }
});

test("RAC-394 RAC-399 S-75 identity refusals precede consents and retained or discarded private-data cleanup", async () => {
  for (const retain_private_data of [false, true]) {
    const hostIds = new Set<string>(), h = observed(hostIds), id = "com.example.kept";
    const original = install(h.runtime, id, "owner");
    h.privateData.set(original.install.install_id, "private bytes");
    await h.runtime.uninstall(original.install.install_id, { retain_private_data });
    // This id becomes part of the next Host build. A refusal must not prepare/erase the earlier uninstalled installation's data.
    hostIds.add(id);
    const requested = manifest(id, "owner");
    h.refused(() => h.runtime.install({ definition: definition(requested), deployment: "local", grants: [], trust: UNSIGNED_TRUST,
      discard_kept_data: true }));
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

test("RAC-396 S-75 an installation's actions are registered under its install id, or as its package in the sandbox, and under its plugin id only when it is of the Host's build", async () => {
  const id = "com.example.provider";
  for (const { trust, execution } of [{ trust: UNSIGNED_TRUST }, { trust: PINNED }, { trust: UNSIGNED_TRUST, execution: "sandbox" as const },
    { trust: PINNED, execution: "sandbox" as const }, { trust: HOST_BUILD_TRUST }]) {
    const service = new ActionService(), calls: string[] = [], fixture = actionable(id, trust.level === "pinned" ? FINGERPRINT : "label", calls);
    const registered: string[] = [];
    const registry = { registerProvider: (r: ActionProviderRegistration) => { registered.push(r.provider.provider_id); return service.registerProvider(r); } };
    // The embedder has no say in the name: what it would answer is not read.
    const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS,
      actions: { registry, project_id: "p", providerId: () => id } as NonNullable<ConstructorParameters<typeof PluginRuntime>[2]["actions"]> });
    const installed = runtime.install({ definition: { ...fixture.plugin, ...(execution ? { execution } : {}) }, deployment: "local", trust, grants: [] }).install;
    const own = trust.level === "host" ? id : execution === "sandbox" ? `plugin:${id}` : installed.install_id;
    await runtime.start(installed.install_id);
    assert.deepEqual(registered, [own]);
    assert.equal(resolveActionProviderId(runtime.get(installed.install_id)), own);
    if (trust.level !== "host") {
      await assert.rejects(Promise.resolve(service.invoke(caller, { ...fixture.action, provider_id: id }, {})), code("actions.provider_changed"));
      assert.deepEqual(calls, [`start:${id}`], "nothing answers under the plugin id");
    }
    assert.equal(await service.invoke(caller, { ...fixture.action, provider_id: own }, {}), id);
    await runtime.stop(installed.install_id);
  }
  const impostor = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS });
  assert.throws(() => install(impostor, `plugin:${id}`, "label"), code("plugin.manifest_invalid"), "no plugin id can be spelled as a package's provider");
});

test("RAC-395 RAC-399 S-75 normally loaded existing conflicts crash before activation in the same or a new Runtime", async () => {
  for (const restart of [false, true]) for (const above of [false, true]) for (const conflict of ["unsigned-same", "unsigned-other", "pinned", "host"] as const) {
    const db = openTestSqlite(":memory:"); db.exec(PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL);
    try {
      const repository = new SqlitePluginRuntimeRepository(db), service = new ActionService(), calls: string[] = [], registrations: string[] = [];
      const hostIds = new Set<string>(), consents = new MemoryPluginConsentLedger();
      const registry = { registerProvider: (r: ActionProviderRegistration) => { registrations.push(r.provider.provider_id); return service.registerProvider(r); } };
      const runtimeOptions = { hostIds, consents, actions: { registry, project_id: "p" } };
      const original = new PluginRuntime(repository, undefined, runtimeOptions), id = "com.example.existing";
      const old = actionable(id, conflict === "pinned" ? FINGERPRINT : "same-label", calls);
      const installed = original.install({ definition: old.plugin, deployment: "local", grants: [], trust: conflict === "pinned" ? PINNED : UNSIGNED_TRUST }).install;
      await original.start(installed.install_id);
      assert.equal(await service.invoke(caller, { ...old.action, provider_id: installed.install_id }, {}), id);
      if (restart) await original.stop(installed.install_id, { preserve_enabled: true });
      const nestedId = above ? id.slice(0, id.lastIndexOf(".")) : `${id}.child`;
      if (conflict === "host") hostIds.add(nestedId);
      else {
        // Existing records arrive unchanged through the repository port. Each record is from a real public install, never a forged state/trust shape.
        const source = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS });
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
        const source = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }); await source.uninstall(other.install_id); }
      await runtime.recover(installed.install_id);
      assert.equal(await service.invoke(caller, { ...old.action, provider_id: installed.install_id }, {}), id);
      await runtime.stop(installed.install_id);
    } finally { db.close(); }
  }
});

test("RAC-395 S-75 a refused nested installation leaves the legal original provider usable", async () => {
  const h = observed(), calls: string[] = [], original = actionable("com.example.usable", "label", calls);
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
