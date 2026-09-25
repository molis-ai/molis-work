import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { ensureProjectPlugins, releaseProjectPlugins } from "../apps/local-host/src/project-plugins.js";
import { LocalProjectDatabase } from "../apps/local-host/src/project-database.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

test("background startup shares its instance with later UI execution adapters and closing revokes providers", async () => {
  const home = mkdtempSync(join(tmpdir(), "project-plugin-startup-")), file = join(home, "project.sqlite");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_BOARD_ID);
  let ready = 0, modelReads = 0, capabilityCalls = 0;
  const ports = { store, boardId: DEMO_BOARD_ID, actorId: "web-user", homeDirectory: home, actions, goalTitle: () => undefined,
    capabilities: { async invoke<I, O>(definition: { capability_id: string }, _input: I): Promise<O> {
      capabilityCalls++;
      if (definition.capability_id === agentHostCapabilities.listRuntimes.capability_id) return [] as O;
      if (definition.capability_id === projectsCapabilities.readWorkspace.capability_id) return null as O;
      return { workspaces: [], selected: null } as O;
    } },
  };
  const caller = { actor_id: "owner", project_id: DEMO_BOARD_ID, audience: "user" as const, permissions: ["artifact:read"] };
  try {
    const [first, concurrent] = await Promise.all([ensureProjectPlugins(ports), ensureProjectPlugins(ports)]);
    assert.equal(first, concurrent); assert.equal(first.running, true, first.error); assert.ok(first.platform);
    assert.equal(capabilityCalls, 0, "discovery must not read business capabilities");
    const invokeState = () => first.platform!.router().dispatch({ method: "GET", pathname: "/api/plugins/io.molis.work.coding/state", actor_id: ports.actorId });
    assert.match(JSON.stringify((await invokeState())!.body), /Agent 执行服务尚未接通/);
    const later = await ensureProjectPlugins({ ...ports, execution: {
      ready: async () => { ready++; }, models: async () => { modelReads++; return [{ provider_id: "late", model_id: "chosen", label: "Chosen model" }]; },
    } });
    assert.equal(later.platform, first.platform);
    const response = await invokeState();
    assert.equal(response!.status, 200, JSON.stringify(response));
    assert.deepEqual((response!.body as any).models, [{ provider_id: "late", model_id: "chosen", label: "Chosen model" }]);
    assert.equal(ready, 1); assert.equal(modelReads, 1);
    const directory = await actions.client.discover(caller);
    const count = directory.find(row => row.capability_id === "text-stats.count")!;
    assert.ok(count);
    for (const changed of [{ actorId: "other" }, { homeDirectory: home + "-other" }, { actions: { ...actions, project_id: "other" } }]) {
      await assert.rejects(ensureProjectPlugins({ ...ports, ...changed }), /身份不一致/);
    }
    await releaseProjectPlugins(store, DEMO_BOARD_ID);
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
    await releaseProjectPlugins(store, DEMO_BOARD_ID);
    assert.ok(stopped > 1, "one failure cannot leave the other plugin providers live");
    assert.equal((await actions.client.discover(caller)).length, 0);
  } finally { await releaseProjectPlugins(store, DEMO_BOARD_ID); store.close(); rmSync(home, { recursive: true, force: true }); }
});
