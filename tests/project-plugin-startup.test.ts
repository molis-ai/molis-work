import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MolisWorkLocalHost, seedDemoBoard, DEMO_PROJECT_ID, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { ensureProjectPlugins, releaseProjectPlugins } from "../apps/local-host/dist/project-plugins.js";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { fakeAgentHostActions, pluginActions } from "./fixtures/plugin-actions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

test("background startup shares its instance with later UI execution adapters and closing revokes providers", async () => {
  const home = mkdtempSync(join(tmpdir(), "project-plugin-startup-")), file = join(home, "project.sqlite");
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  // The Agent service is attached to the Host after the project's plugins start; until it is, nothing provides its actions, and a
  // call to one is refused as a call to any action nobody provides is.
  let agentCalls = 0, capabilityCalls = 0;
  const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user", homeDirectory: home, actions,
    capabilities: { async invoke<I, O>(definition: { capability_id: string }, _input: I): Promise<O> {
      capabilityCalls++;
      if (definition.capability_id === projectsCapabilities.readWorkspace.capability_id) return null as O;
      return { workspaces: [], selected: null } as O;
    } },
  };
  const caller = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: ["artifact:read"] };
  try {
    const [first, concurrent] = await Promise.all([ensureProjectPlugins(ports), ensureProjectPlugins(ports)]);
    assert.equal(first, concurrent); assert.equal(first.platform?.supervisor.state("io.molis.work.coding")?.status, "running", first.error); assert.ok(first.platform);
    assert.equal(capabilityCalls, 0, "discovery must not read business capabilities");
    const invokeState = () => first.platform!.router().dispatch({ method: "GET", pathname: "/api/plugins/io.molis.work.coding/state", actor_id: ports.actorId });
    // Before the Agent service is attached: the first call, to its runtime directory, is the one that fails, as an action nobody provides.
    // Coding has no `ready` gate of its own to answer first any more, and the Agent actions initialize themselves when called.
    const refused = await invokeState();
    assert.notEqual(refused!.status, 200);
    assert.match(JSON.stringify(refused!.body), /actions\.dependency_missing/);
    assert.equal(capabilityCalls + agentCalls, 0, "the first call was the refused one; nothing was waited on before it");
    // The model list is not a port a later caller attaches: it is the Home's own provider catalog through `services.model`, so a model
    // configured now is listed as soon as the Agent service answers, by the same plugin instance.
    await seedConfiguredModels(home, [{ provider_id: "late", model_id: "chosen" }]);
    fakeAgentHostActions(actions, definition => {
      agentCalls++;
      if (definition.capability_id === agentHostCapabilities.listRuntimes.capability_id) return [];
      throw new Error(`Unexpected agent action ${definition.capability_id}`);
    });
    const later = await ensureProjectPlugins(ports);
    assert.equal(later.platform, first.platform);
    const response = await invokeState();
    assert.equal(response!.status, 200, JSON.stringify(response));
    const models = (response!.body as { models: Array<{ provider_id: string; model_id: string }> }).models;
    assert.deepEqual(models.map(({ provider_id, model_id }) => ({ provider_id, model_id })), [{ provider_id: "late", model_id: "chosen" }]);
    const directory = await actions.client.discover(caller);
    const count = directory.find(row => row.capability_id === "text-stats.count")!;
    assert.ok(count);
    for (const changed of [{ actorId: "other" }, { homeDirectory: home + "-other" }, { actions: { ...actions, project_id: "other" } }]) {
      await assert.rejects(ensureProjectPlugins({ ...ports, ...changed }), /身份不一致/);
    }
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    assert.equal((await actions.client.discover(caller)).length, 0);
    await assert.rejects(actions.client.invoke(caller, count, { text: "closed" }));
    const reopened = await ensureProjectPlugins(ports);
    assert.notEqual(reopened.platform, first.platform);
    assert.ok(reopened.platform);
    assert.equal((await actions.client.discover(caller)).find(row => row.capability_id === count.capability_id)!.provider.provider_id, count.provider.provider_id);
    const stop = reopened.platform.runtime.stop.bind(reopened.platform.runtime);
    let stopped = 0;
    reopened.platform.runtime.stop = async installId => {
      const receipt = await stop(installId);
      if (++stopped === 1) throw new Error("one plugin stop failed");
      return receipt;
    };
    // The failed stop is reported (the Host's close goes on with its other owners); the rest are still stopped and revoked.
    await assert.rejects(releaseProjectPlugins(store, DEMO_PROJECT_ID), /项目插件停止失败/);
    assert.ok(stopped > 1, "one failure cannot leave the other plugin providers live");
    assert.equal((await actions.client.discover(caller)).length, 0);
  } finally { await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(home, { recursive: true, force: true }); }
});

type RunningPlugin = { readonly id: string; readonly install: string };
type RunningPlatform = NonNullable<Awaited<ReturnType<typeof ensureProjectPlugins>>["platform"]>;

async function openProject() {
  const home = mkdtempSync(join(tmpdir(), "project-plugin-close-")), file = join(home, "project.sqlite");
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user", homeDirectory: home, actions: pluginActions(store, DEMO_PROJECT_ID) };
  return { home, store, ports };
}

/** The plugins the close loop stops, in the loop's own order, and each one's installation. */
function runningPlugins(platform: RunningPlatform): RunningPlugin[] {
  return platform.supervisor.enabledPluginIds().flatMap(id => {
    const state = platform.supervisor.state(id);
    return state?.status === "running" && state.install_id ? [{ id, install: state.install_id }] : [];
  });
}

/** Every installation's Runtime record, read the way the Host's record store reads it (`plugin_runtime_installs.record_json`). */
function installRecords(store: LocalProjectDatabase): Array<{ install_id: string; state: string }> {
  const rows = store.db.prepare("SELECT record_json FROM plugin_runtime_installs").all() as Array<{ record_json: string }>;
  return rows.map(row => JSON.parse(row.record_json) as { install_id: string; state: string });
}

/** Run the cleanup steps one by one: a failing step is recorded, and the later steps still run. Every case below starts its try right
 * after openProject(): whether the platform never started, started, or was already released, the finally still runs its cleanup (RAC-1600). */
async function collectCleanupErrors(steps: ReadonlyArray<() => void | Promise<void>>): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/** After the cleanup steps: throw the recorded failures with the test body's own failure first, so nothing masks it. */
function throwCleanupErrors(failure: unknown, errors: readonly unknown[]): void {
  if (errors.length === 0) return;
  throw new AggregateError(failure === undefined ? [...errors] : [failure, ...errors], "测试收尾失败");
}

test("RAC-1453 a project plugin whose install record the Runtime cannot give is one close failure, and the plugins after it still stop and are revoked", async () => {
  const { home, store, ports } = await openProject();
  let platform: RunningPlatform | undefined;
  let running: RunningPlugin[] = [];
  let saved: Record<string, unknown> | undefined;
  let failure: unknown;
  try {
    const opened = (await ensureProjectPlugins(ports)).platform;
    assert.ok(opened);
    platform = opened;
    running = runningPlugins(opened);
    assert.ok(running.length > 1, "a project has more than one running plugin");
    const [gone, ...rest] = running;
    // Keep the row so the finally can put it back; deleting it is how the close meets a record the Runtime cannot give.
    saved = store.db.prepare("SELECT * FROM plugin_runtime_installs WHERE install_id = ?").get(gone.install) as Record<string, unknown>;
    assert.ok(saved);
    store.db.prepare("DELETE FROM plugin_runtime_installs WHERE install_id = ?").run(gone.install);
    await assert.rejects(releaseProjectPlugins(store, DEMO_PROJECT_ID), error => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /项目插件停止失败/);
      assert.equal(error.errors.length, 1);
      assert.equal((error.errors[0] as { code?: string }).code, "plugin.definition_missing");
      return true;
    });
    assert.equal(store.db.prepare("SELECT 1 FROM plugin_runtime_installs WHERE install_id = ?").get(gone.install), undefined);
    const records = installRecords(store);
    for (const plugin of rest) assert.equal(records.find(record => record.install_id === plugin.install)?.state, "installed", `${plugin.id} stops after the plugin whose record is gone`);
    for (const plugin of running) {
      assert.ok(!platform.supervisor.enabledPluginIds().includes(plugin.id), `${plugin.id} is revoked`);
      assert.equal(platform.supervisor.state(plugin.id)?.code, "plugin.revoked");
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // Nobody stopped the instances the close left running (on the red branch, all of `rest` too); the project is already
    // forgotten, so release cannot reach them, and each installation is its own cleanup step. A failure before the row was
    // saved or before the platform was assigned skips only that step.
    const cleanup: Array<() => void | Promise<void>> = [() => {
      if (!saved) return;
      const present = store.db.prepare("SELECT 1 FROM plugin_runtime_installs WHERE install_id = ?").get(saved.install_id);
      if (present) return;
      const columns = Object.keys(saved);
      store.db.prepare(`INSERT INTO plugin_runtime_installs (${columns.join(", ")}) VALUES (${columns.map(column => `@${column}`).join(", ")})`).run(saved);
    }];
    const live = platform;
    if (live) for (const plugin of running) cleanup.push(async () => {
      if (live.runtime.get(plugin.install).state === "running") await live.runtime.stop(plugin.install);
    });
    cleanup.push(() => releaseProjectPlugins(store, DEMO_PROJECT_ID), () => store.close(), () => rmSync(home, { recursive: true, force: true }));
    const errors = await collectCleanupErrors(cleanup);
    throwCleanupErrors(failure, errors);
  }
});

test("RAC-1454 a crashed installation the supervisor still counts running is not stopped, does not fail the close, and keeps its record", async () => {
  const { home, store, ports } = await openProject();
  let failure: unknown;
  try {
    const platform = (await ensureProjectPlugins(ports)).platform;
    assert.ok(platform);
    const running = runningPlugins(platform);
    assert.ok(running.length > 1);
    const crashed = running[0];
    await platform.runtime.reportCrash(crashed.install);
    assert.equal(platform.runtime.get(crashed.install).state, "crashed");
    assert.equal(platform.supervisor.state(crashed.id)?.status, "running", "the supervisor does not hear about a crash");
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    const records = installRecords(store);
    assert.equal(records.find(record => record.install_id === crashed.install)?.state, "crashed");
    for (const plugin of running.slice(1)) assert.equal(records.find(record => record.install_id === plugin.install)?.state, "installed");
    for (const plugin of running) {
      assert.ok(!platform.supervisor.enabledPluginIds().includes(plugin.id));
      assert.equal(platform.supervisor.state(plugin.id)?.code, "plugin.revoked");
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const errors = await collectCleanupErrors([
      () => releaseProjectPlugins(store, DEMO_PROJECT_ID),
      () => store.close(),
      () => rmSync(home, { recursive: true, force: true }),
    ]);
    throwCleanupErrors(failure, errors);
  }
});

test("RAC-1455 every running project plugin is stopped exactly once with preserve_enabled, recorded installed, and starts again when the project reopens", async () => {
  const { home, store, ports } = await openProject();
  let failure: unknown;
  try {
    const platform = (await ensureProjectPlugins(ports)).platform;
    assert.ok(platform);
    const running = runningPlugins(platform);
    assert.ok(running.length > 0);
    const stop = platform.runtime.stop.bind(platform.runtime);
    const stopped: Array<{ install: string; options: { preserve_enabled?: boolean } | undefined }> = [];
    platform.runtime.stop = async (installId, options) => {
      stopped.push({ install: installId, options });
      return stop(installId, options);
    };
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    assert.deepEqual(stopped.map(entry => entry.install).sort(), running.map(plugin => plugin.install).sort());
    for (const entry of stopped) assert.deepEqual(entry.options, { preserve_enabled: true });
    const records = installRecords(store);
    for (const plugin of running) assert.equal(records.find(record => record.install_id === plugin.install)?.state, "installed");
    const reopened = await ensureProjectPlugins(ports);
    assert.ok(reopened.platform);
    for (const plugin of running) assert.equal(reopened.platform.supervisor.state(plugin.id)?.status, "running");
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // The release below is the platform this test reopened; it cannot be skipped.
    const errors = await collectCleanupErrors([
      () => releaseProjectPlugins(store, DEMO_PROJECT_ID),
      () => store.close(),
      () => rmSync(home, { recursive: true, force: true }),
    ]);
    throwCleanupErrors(failure, errors);
  }
});
