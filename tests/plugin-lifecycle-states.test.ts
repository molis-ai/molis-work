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
 * Lifecycle states are facts of Plugin Runtime: a switched-off install is not started by an upgrade, an uninstalled
 * one can be installed again at the version the person picks, a failed upgrade leaves the old code with its own event
 * contract, and a bundled upgrade can be started again by the next boot.
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

test("Supervisor does not upgrade or roll back a plugin the Host switched off", async () => {
  const starts: string[] = [];
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const supervisor = new PluginSupervisor(runtime);
  const v1 = probe("1.0.0", { starts }), v2 = probe("2.0.0", { starts, compatible: ["1.0.0"] });
  await supervisor.start([{ definition: v1 }]);
  const id = supervisor.state(ID)!.install_id!;
  supervisor.revoke(ID);
  await runtime.stop(id);
  starts.length = 0;

  const refused = await supervisor.upgrade(ID, v2);
  assert.equal(refused.status, "failed");
  assert.equal(refused.code, "plugin_revoked");
  assert.match(refused.message ?? "", /启用/);
  assert.equal(runtime.get(id).state, "disabled");
  assert.equal(runtime.get(id).version, "1.0.0", "the installation did not move");
  assert.equal((await supervisor.rollback(ID, v1)).code, "plugin_revoked");
  assert.deepEqual(starts, []);
  assert.equal(supervisor.state(ID)?.code, "plugin_revoked", "still revoked, not running");
  assert.equal(supervisor.contribution(ID), null);

  assert.equal((await supervisor.enable(ID)).status, "running");
  assert.deepEqual(starts, ["1.0.0"]);
  assert.equal((await supervisor.upgrade(ID, v2)).status, "running", "an enabled plugin upgrades as before");
  assert.equal(runtime.get(id).version, "2.0.0");
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

test("a reinstall at another version reuses kept data only when that version declares it can read it", async () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  const v1 = probe("1.0.0"), v2 = probe("2.0.0"), v3 = probe("3.0.0", { migratable: ["1.0.0"] });
  const id = runtime.install({ definition: v1, deployment: "local" }).install.install_id;

  await runtime.uninstall(id, { retain_private_data: true });
  assert.equal(await code(() => runtime.install({ definition: v2, deployment: "local" })), "plugin_upgrade_required",
    "kept data from 1.0.0 is not handed to code that never promised to read it");
  assert.equal(await code(() => runtime.install({ definition: v3, deployment: "local" })), "plugin_upgrade_required",
    "reading it needs a migration check an install cannot run");
  assert.equal(runtime.get(id).state, "uninstalled", "a refused install changes nothing");
  assert.equal(runtime.get(id).version, "1.0.0");
  assert.equal(runtime.install({ definition: v1, deployment: "local" }).install.version, "1.0.0", "the uninstalled version itself is always possible");

  await runtime.uninstall(id, { retain_private_data: false });
  const fresh = runtime.install({ definition: v2, deployment: "local" }).install;
  assert.equal(fresh.version, "2.0.0", "with the data deleted there is nothing to protect");
  assert.equal(fresh.state, "installed");
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
