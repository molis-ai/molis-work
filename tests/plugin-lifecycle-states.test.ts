import assert from "node:assert/strict";
import test from "node:test";
import type { IntegrationProviderPort, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  MemoryPluginEventsRepository,
  MemoryPluginRuntimeRepository,
  PluginEventBus,
  PluginRuntime,
  PluginSupervisor,
} from "@molis-ai/molis-work-plugin-runtime";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";

/**
 * Lifecycle states are facts of Plugin Runtime: a switched-off install can switch versions and stays switched off (also
 * across a Host restart), an uninstalled one can be installed again at the version the person picks, a failed upgrade
 * leaves the old code with its own event contract, and a bundled upgrade can be started again by the next boot.
 */
const ID = "io.molis.work.lifecycle-probe";

interface ProbeOptions {
  starts?: string[];
  publishes?: string[];
  compatible?: string[];
  migratable?: string[];
  sandbox?: boolean;
  failStart?: boolean;
  failValidation?: boolean;
  optionalPermission?: boolean;
}

function probe(version: string, options: ProbeOptions = {}): PluginDefinition {
  const publishes = options.publishes ?? [];
  const compatibility = options.compatible || options.migratable
    ? { upgrade_compatibility: {
      ...(options.compatible ? { compatible_from_versions: options.compatible } : {}),
      ...(options.migratable ? { migratable_from_versions: options.migratable } : {}),
    } }
    : {};
  return {
    manifest: {
      schema_version: 2, host_api_version: 2, plugin_id: ID, version, name: ID, kind: "app",
      publisher: { publisher_id: "molis", signature: "lifecycle-probe-binding" },
      entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
      ui: { contributions: [ID + ".main"], views: [{ view_id: "main", slot: "stage", title: "Main" }] },
      events: { publishes: publishes.map(name => ({ event_type_id: ID + "." + name, type_version: 1 })), subscribes: [] },
      ...compatibility,
    },
    ...(options.sandbox ? { execution: "sandbox" as const } : {}),
    event_types: publishes.map(name => ({ event_type_id: ID + "." + name, type_version: 1, validate: (payload: unknown) => payload })),
    ...(options.failValidation ? { validateUpgrade: async () => { throw new Error("old data cannot be read"); } } : {}),
    async start() {
      options.starts?.push(version);
      if (options.failStart) throw new Error(version + " cannot start");
      return { kind: "app", views: [{ descriptor: { contribution_id: ID + ".main", plugin_id: ID, kind: "primary-page", label: "m", slots: [] }, render: () => "<p></p>" }] };
    },
    async stop() {},
  } as PluginDefinition;
}

async function code(operation: Promise<unknown> | (() => unknown)): Promise<string | undefined> {
  try { await (typeof operation === "function" ? operation() : operation); return undefined; }
  catch (error) { return (error as { code?: string }).code; }
}

test("upgrading or rolling back a disabled install switches the code and leaves it disabled", async () => {
  const starts: string[] = [];
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const v1 = probe("1.0.0", { starts, sandbox: true }), v2 = probe("2.0.0", { starts, sandbox: true, compatible: ["1.0.0"] });
  const id = runtime.install({ definition: v1, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(id);
  await runtime.stop(id);
  assert.equal(runtime.get(id).state, "disabled");
  starts.length = 0;

  const upgraded = await runtime.upgrade({ install_id: id, definition: v2 });
  assert.equal(upgraded.install.state, "disabled", "the person's disable is not undone by a new version");
  assert.equal(runtime.get(id).version, "2.0.0");
  assert.equal(runtime.contribution(id), null);
  const back = await runtime.rollback({ install_id: id, definition: v1 });
  assert.equal(back.install.state, "disabled");
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal(runtime.contribution(id), null);
  assert.deepEqual(starts, [], "neither switch ran any code");

  await runtime.start(id);
  assert.equal(runtime.get(id).state, "running", "only an explicit start enables it again");
  assert.deepEqual(starts, ["1.0.0"]);
  await runtime.stop(id);
});

test("a failed upgrade of a disabled install does not start the old code either", async () => {
  const starts: string[] = [];
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const v1 = probe("1.0.0", { starts, sandbox: true }), v2 = probe("2.0.0", { starts, sandbox: true, compatible: ["1.0.0"], failValidation: true });
  const id = runtime.install({ definition: v1, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(id);
  await runtime.stop(id);
  starts.length = 0;
  assert.equal(await code(runtime.upgrade({ install_id: id, definition: v2 })), "plugin_upgrade_validation_failed");
  assert.equal(runtime.get(id).state, "disabled");
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal(runtime.contribution(id), null);
  assert.deepEqual(starts, [], "the restore after a failed upgrade only applies to an install that was running");
});

test("a running install that fails its upgrade is restored to running; a disabled one is not", async () => {
  const starts: string[] = [];
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const v1 = probe("1.0.0", { starts }), v2 = probe("2.0.0", { starts, compatible: ["1.0.0"], failStart: true });
  const id = runtime.install({ definition: v1, deployment: "local" }).install.install_id;
  await runtime.start(id);
  assert.equal(await code(runtime.upgrade({ install_id: id, definition: v2 })), "plugin_executor_failed");
  assert.equal(runtime.get(id).state, "running", "the old version keeps serving");
  assert.equal(runtime.get(id).version, "1.0.0");
  await runtime.stop(id);
});

test("upgrading or rolling back a disabled install still works after a restart, and it stays disabled", async () => {
  const starts: string[] = [];
  const repository = new MemoryPluginRuntimeRepository();
  const v1 = probe("1.0.0", { starts, sandbox: true }), v2 = probe("2.0.0", { starts, sandbox: true, compatible: ["1.0.0"] });
  const before = new PluginRuntime(repository);
  const id = before.install({ definition: v1, deployment: "local", grants: [] }).install.install_id;
  await before.start(id);
  await before.stop(id);
  starts.length = 0;

  const restarted = new PluginRuntime(repository);
  assert.equal((await restarted.upgrade({ install_id: id, definition: v2 })).install.state, "disabled");
  assert.equal(restarted.get(id).version, "2.0.0");
  assert.equal((await restarted.rollback({ install_id: id, definition: v1 })).install.state, "disabled");
  assert.equal(restarted.get(id).version, "1.0.0");
  assert.deepEqual(starts, [], "no code ran");
  assert.equal(await code(restarted.upgrade({ install_id: id, definition: probe("3.0.0", { starts, sandbox: true, compatible: ["1.0.0"], failValidation: true }) })),
    "plugin_upgrade_validation_failed");
  assert.equal(restarted.get(id).state, "disabled", "a failed switch leaves it off too");
});

test("Supervisor switches the version of a plugin the Host switched off, keeps it off, and enable starts the new version", async () => {
  const starts: string[] = [];
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const supervisor = new PluginSupervisor(runtime);
  const v1 = probe("1.0.0", { starts, sandbox: true }), v2 = probe("2.0.0", { starts, sandbox: true, compatible: ["1.0.0"] });
  await supervisor.start([{ definition: v1, grants: [] }]);
  const id = supervisor.state(ID)!.install_id!;
  supervisor.revoke(ID);
  await runtime.stop(id);
  starts.length = 0;

  const switched = await supervisor.upgrade(ID, v2);
  assert.equal(switched.code, "plugin_revoked", "the plugin is still switched off");
  assert.equal(runtime.get(id).version, "2.0.0", "but the installation moved");
  assert.equal(runtime.get(id).state, "disabled");
  assert.equal(supervisor.manifest(ID)?.version, "2.0.0");
  assert.equal(supervisor.state(ID)?.code, "plugin_revoked");
  assert.equal(supervisor.state(ID)?.install_id, id);
  assert.equal(supervisor.contribution(ID), null);
  assert.deepEqual(starts, []);

  assert.equal((await supervisor.enable(ID)).status, "running");
  assert.deepEqual(starts, ["2.0.0"], "enabling starts the version it was switched to");
  supervisor.revoke(ID);
  await runtime.stop(id);
  starts.length = 0;
  const refused = await supervisor.upgrade(ID, probe("3.0.0", { starts, sandbox: true, compatible: ["2.0.0"], failValidation: true }));
  assert.equal(refused.code, "plugin_upgrade_validation_failed");
  assert.equal(supervisor.state(ID)?.code, "plugin_revoked", "a failed switch leaves the plugin switched off, not failed");
  assert.equal(runtime.get(id).version, "2.0.0");
  assert.equal(runtime.get(id).state, "disabled");
  assert.equal((await supervisor.rollback(ID, v1)).code, "plugin_revoked", "rolling a switched-off plugin back is not refused either");
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal(supervisor.manifest(ID)?.version, "1.0.0");
  assert.equal(runtime.get(id).state, "disabled");
  assert.deepEqual(starts, []);
  assert.equal((await supervisor.enable(ID)).status, "running");
  assert.deepEqual(starts, ["1.0.0"]);
  assert.equal((await supervisor.upgrade(ID, probe("4.0.0", { starts, sandbox: true, compatible: ["1.0.0"] }))).status, "running", "an enabled plugin upgrades as before");
  await runtime.stop(id);
});

test("Supervisor switches the version of a disabled install it has never been told about (after a restart)", async () => {
  const starts: string[] = [];
  const repository = new MemoryPluginRuntimeRepository();
  const v1 = probe("1.0.0", { starts, sandbox: true }), v2 = probe("2.0.0", { starts, sandbox: true, compatible: ["1.0.0"] });
  const first = new PluginRuntime(repository);
  const id = first.install({ definition: v1, deployment: "local", grants: [] }).install.install_id;
  await first.start(id);
  await first.stop(id);
  starts.length = 0;

  const runtime = new PluginRuntime(repository), supervisor = new PluginSupervisor(runtime);
  assert.equal(supervisor.manifest(ID), undefined, "nothing was registered for it");
  const switched = await supervisor.upgrade(ID, v2);
  assert.equal(switched.code, "plugin_revoked");
  assert.equal(switched.install_id, id);
  assert.equal(runtime.get(id).version, "2.0.0");
  assert.equal(runtime.get(id).state, "disabled");
  assert.equal(supervisor.manifest(ID)?.version, "2.0.0", "it is registered now, so enable can find it");
  assert.equal(supervisor.contribution(ID), null);
  assert.deepEqual(starts, []);
  assert.equal((await supervisor.rollback(ID, v1)).code, "plugin_revoked");
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal((await supervisor.enable(ID)).status, "running");
  assert.deepEqual(starts, ["1.0.0"]);
  await runtime.stop(id);
});

test("Supervisor says it does not know an install it never started, and does not remember the question", async () => {
  const repository = new MemoryPluginRuntimeRepository();
  const v1 = probe("1.0.0", { sandbox: true }), v2 = probe("2.0.0", { sandbox: true, compatible: ["1.0.0"] });
  const first = new PluginRuntime(repository);
  const id = first.install({ definition: v1, deployment: "local", grants: [] }).install.install_id;
  await first.start(id);
  await first.stop(id, { preserve_enabled: true });
  assert.equal(first.get(id).state, "installed");

  const runtime = new PluginRuntime(repository), supervisor = new PluginSupervisor(runtime);
  const refused = await supervisor.upgrade(ID, v2);
  assert.equal(refused.code, "plugin_unknown");
  assert.equal(supervisor.state(ID), null, "a question about a plugin nobody registered leaves no state behind");
  assert.equal(supervisor.manifest(ID), undefined);
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal((await supervisor.start([{ definition: v1, grants: [] }])).running.length, 1, "starting it afterwards is not blocked");
  await runtime.stop(id);
});

test("after an uninstall a confirmed install at another version is a fresh installation of that version", async () => {
  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository);
  const v1 = probe("1.0.0", { sandbox: true }), v2 = probe("2.0.0", { sandbox: true, compatible: ["1.0.0"] });
  const first = runtime.install({ definition: v1, deployment: "local", grants: [] }).install;
  await runtime.start(first.install_id);
  await runtime.uninstall(first.install_id, { retain_private_data: true });

  const again = runtime.install({ definition: v2, deployment: "local", grants: [] }).install;
  assert.equal(again.install_id, first.install_id, "the data identity is kept");
  assert.equal(again.version, "2.0.0");
  assert.equal(again.state, "installed");
  assert.equal(again.uninstalled_at, null);
  assert.notEqual(again.installation_generation, first.installation_generation, "a reinstall is a new installation");
  assert.equal(again.retain_private_data, true);
  assert.notEqual(again.manifest_digest, first.manifest_digest);
  await runtime.start(first.install_id);
  assert.equal(runtime.get(first.install_id).state, "running");
  assert.equal(runtime.get(first.install_id).version, "2.0.0");
  await runtime.stop(first.install_id);
});

test("a reinstall at another version reuses kept data only when that version declares it can read it, else the person must agree to drop it", async () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const v1 = probe("1.0.0"), v2 = probe("2.0.0"), v3 = probe("3.0.0", { migratable: ["1.0.0"] });
  const id = runtime.install({ definition: v1, deployment: "local" }).install.install_id;

  await runtime.uninstall(id, { retain_private_data: true });
  assert.equal(await code(() => runtime.install({ definition: v2, deployment: "local" })), "plugin_kept_data_incompatible",
    "kept data from 1.0.0 is not handed to code that never promised to read it");
  assert.equal(await code(() => runtime.install({ definition: v3, deployment: "local" })), "plugin_kept_data_incompatible",
    "reading it needs a migration check an install cannot run");
  assert.equal(await code(() => runtime.install({ definition: v2, deployment: "local", discard_kept_data: false })), "plugin_kept_data_incompatible");
  assert.equal(runtime.get(id).state, "uninstalled", "a refused install changes nothing");
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal(runtime.install({ definition: v1, deployment: "local" }).install.version, "1.0.0", "the uninstalled version itself is always possible");

  await runtime.uninstall(id, { retain_private_data: true });
  const earlier = runtime.get(id).installation_generation;
  const agreed = runtime.install({ definition: v2, deployment: "local", discard_kept_data: true }).install;
  assert.equal(agreed.version, "2.0.0", "with the person's explicit word the other version installs fresh (the Host drops the data)");
  assert.equal(agreed.state, "installed");
  assert.notEqual(agreed.installation_generation, earlier, "it is a new installation");

  await runtime.uninstall(id, { retain_private_data: false });
  const fresh = runtime.install({ definition: v3, deployment: "local" }).install;
  assert.equal(fresh.version, "3.0.0", "with the data deleted there is nothing to protect");
  assert.equal(fresh.state, "installed");
});

test("an install that did not finish goes back to the uninstalled record it replaced, and only that install can be taken back", async () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const v1 = probe("1.0.0", { sandbox: true }), v3 = probe("3.0.0", { sandbox: true });
  const id = runtime.install({ definition: v1, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(id);
  await runtime.uninstall(id, { retain_private_data: true });
  const earlier = runtime.get(id);

  const fresh = runtime.install({ definition: v3, deployment: "local", grants: [], discard_kept_data: true }).install;
  await runtime.start(id);
  assert.equal(runtime.get(id).state, "running");
  assert.equal(await code(() => runtime.abandonInstall(fresh, { ...earlier, state: "installed" })), "plugin_state_invalid", "only an uninstalled record can be gone back to");
  const receipt = await runtime.abandonInstall(fresh, earlier);
  assert.deepEqual(runtime.get(id), earlier, "version, Manifest digest, installation generation and kept data are the earlier ones, whole");
  assert.equal(receipt.replayed, false);
  assert.equal(runtime.contribution(id), null, "the running code was stopped");
  assert.equal(await code(() => runtime.install({ definition: v3, deployment: "local", grants: [] })), "plugin_kept_data_incompatible",
    "so a plain install of the version that failed is asked about the kept data again");
  assert.equal((await runtime.abandonInstall(fresh, earlier)).replayed, true, "taking it back twice changes nothing");

  const another = runtime.install({ definition: v1, deployment: "local", grants: [] }).install;
  assert.equal(await code(() => runtime.abandonInstall(fresh, earlier)), "plugin_state_invalid", "an install that started over since is not undone by the old attempt");
  assert.deepEqual(runtime.get(id), another);
});

test("a reinstall of a generated plugin may use an older release; a Host that ships a version always installs it", async () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const v1 = probe("1.0.0", { sandbox: true }), v2 = probe("2.0.0", { sandbox: true, compatible: ["1.0.0"] });
  const id = runtime.install({ definition: v2, deployment: "local", grants: [] }).install.install_id;
  await runtime.uninstall(id, { retain_private_data: true });
  assert.equal(runtime.install({ definition: v1, deployment: "local", grants: [] }).install.version, "1.0.0", "generated code rolls back without rolling its data back");

  const host = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const h1 = probe("1.0.0"), h2 = probe("2.0.0");
  const hostId = host.install({ definition: h1, deployment: "local" }).install.install_id;
  await host.uninstall(hostId, { retain_private_data: true });
  assert.equal(host.install({ definition: h2, deployment: "local", bundled: true }).install.version, "2.0.0");
  await host.uninstall(hostId, { retain_private_data: true });
  assert.equal(await code(() => host.install({ definition: h1, deployment: "local", bundled: true })), "plugin_kept_data_incompatible",
    "the Host only moves its plugins up: an older bundled version does not get newer kept data");
});

test("a reinstall at the same version with a different manifest is still refused", async () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const original = probe("1.0.0");
  const id = runtime.install({ definition: original, deployment: "local" }).install.install_id;
  await runtime.uninstall(id);
  const changed = probe("1.0.0", { publishes: ["extra"] });
  assert.equal(await code(() => runtime.install({ definition: changed, deployment: "local" })), "plugin_definition_conflict");
});

test("a Host start can follow a bundled upgrade that made a required permission optional", async () => {
  const provider: IntegrationProviderPort = {
    type: "x", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
  };
  const original = createGithubIntegrationPlugin({ provider });
  const v1: PluginDefinition = { ...original, manifest: { ...original.manifest, version: "1.0.0" } };
  const v2: PluginDefinition = { ...original, manifest: { ...original.manifest, version: "2.0.0",
    permissions: original.manifest.permissions.map((permission, index) => index === 0 ? { ...permission, required: false } : permission) } };
  const repository = new MemoryPluginRuntimeRepository();
  const boot = async (definition: PluginDefinition) => {
    const runtime = new PluginRuntime(repository);
    const report = await new PluginSupervisor(runtime).start([{ definition, bundled: true }]);
    for (const record of runtime.list()) if (record.state === "running") await runtime.stop(record.install_id, { preserve_enabled: true });
    return { report, runtime };
  };
  assert.deepEqual((await boot(v1)).report.running, [v1.manifest.plugin_id]);
  const second = await boot(v2);
  assert.deepEqual(second.report.running, [v2.manifest.plugin_id], "the Host moves the install up with itself");
  assert.deepEqual(second.runtime.list()[0]!.grants, v1.manifest.permissions.map(permission => permission.permission).sort(), "the person's grants stay");
  const third = await boot(v2);
  assert.deepEqual(third.report.failed, [], "the next start of the same Host version is not a silent grant change");
  assert.deepEqual(third.report.running, [v2.manifest.plugin_id]);
});

test("a failed upgrade from a crashed install leaves the old code with its own event contract", async () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const supervisor = new PluginSupervisor(runtime);
  const bus = new PluginEventBus({ projectId: "p", lifecycle: supervisor, repository: new MemoryPluginEventsRepository() });
  const v1 = probe("1.0.0", { publishes: ["a"] }), v2 = probe("2.0.0", { publishes: ["b"], failStart: true, compatible: ["1.0.0"] });
  await supervisor.start([{ definition: v1 }]);
  const id = supervisor.state(ID)!.install_id!;
  const publish = (name: string) => {
    try { bus.publish({ project_id: "p", plugin_id: ID, install_id: id }, { event_type_id: ID + "." + name, type_version: 1, payload: {} }); return "accepted"; }
    catch (error) { return (error as { code?: string }).code; }
  };
  assert.equal(publish("a"), "accepted");
  await runtime.reportCrash(id);
  const upgrade = await supervisor.upgrade(ID, v2);
  assert.equal(upgrade.status, "failed");
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal((await supervisor.restart(ID)).status, "running");
  assert.equal(supervisor.manifest(ID)?.version, "1.0.0");
  assert.deepEqual([...supervisor.contract(ID)!.publishes.keys()], [ID + ".a@1"], "the candidate's declarations did not stay behind");
  assert.equal(publish("a"), "accepted", "the old code publishes what it declared");
  assert.equal(publish("b"), "event_not_declared", "and nothing the failed candidate declared");
  await runtime.stop(id);
});
