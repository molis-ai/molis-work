import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seedDemoBoard, DEMO_PROJECT_ID, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { ensureProjectPlugins, releaseProjectPlugins } from "../apps/local-host/dist/project-plugins.js";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

test("background startup shares its instance with later UI execution adapters and closing revokes providers", async () => {
  const home = mkdtempSync(join(tmpdir(), "project-plugin-startup-")), file = join(home, "project.sqlite");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  // The Agent service is attached to the Host after the project's plugins start; until it is, the Host's capability client answers
  // what it answers for any capability nobody has registered (the kernel's own error).
  let agentService = false, capabilityCalls = 0;
  const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user", homeDirectory: home, actions,
    capabilities: { async invoke<I, O>(definition: { capability_id: string }, _input: I): Promise<O> {
      capabilityCalls++;
      if (!agentService) throw new ActionError("kernel.capability_missing", `Capability 未注册: ${definition.capability_id}`);
      if (definition.capability_id === agentHostCapabilities.listRuntimes.capability_id) return [] as O;
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
    // Before the Agent service is attached: the first capability call is the one that fails, with the capability-not-registered error.
    // Coding has no `ready` gate of its own to answer first any more, and the Agent capabilities initialize themselves when called.
    const refused = await invokeState();
    assert.notEqual(refused!.status, 200);
    assert.match(JSON.stringify(refused!.body), /kernel\.capability_missing|Capability 未注册/);
    assert.equal(capabilityCalls, 1, "the first capability call was the refused one; nothing was waited on before it");
    // The model list is not a port a later caller attaches: it is the Home's own provider catalog through `services.model`, so a model
    // configured now is listed as soon as the Agent service answers, by the same plugin instance.
    await seedConfiguredModels(home, [{ provider_id: "late", model_id: "chosen" }]);
    agentService = true;
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
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    assert.ok(stopped > 1, "one failure cannot leave the other plugin providers live");
    assert.equal((await actions.client.discover(caller)).length, 0);
  } finally { await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(home, { recursive: true, force: true }); }
});
