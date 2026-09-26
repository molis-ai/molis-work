import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { EXPERIMENTS_ACTIONS, EXPERIMENTS_ACTION_PERMISSIONS, experimentsActions as a } from "@molis-ai/molis-work-plugin-experiments";
import { openFunctionsStore } from "@molis-ai/molis-work-module-functions";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { closeExperiments } from "../apps/local-host/src/experiments-native-plugin-http.js";

test("Experiments register at Home; only lists and result summaries leave the local interface", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "experiments-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, functions: { env: {} } });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [...EXPERIMENTS_ACTION_PERMISSIONS] };
  const client = host.homeActionClient(), bound = bindActionClient(client, () => user);
  try {
    const mine = (await client.discover(user)).filter(row => row.provider.plugin_id === "io.molis.work.experiments");
    assert.deepEqual(mine.map(row => row.capability_id).sort(), EXPERIMENTS_ACTIONS.map(row => row.capability_id).sort());
    const external = (await client.discover({ ...user, actor_id: "runtime:x", audience: "mcp" })).filter(row => row.provider.plugin_id === "io.molis.work.experiments");
    assert.deepEqual(external.map(row => row.capability_id).sort(), ["experiments.list", "experiments.results"],
      "participants name local executables, so configuring and running stay with the local user");

    const store = openFunctionsStore(home);
    let fn;
    try { fn = store.updateDraft(store.createChoice({ name: "fixture" }).id, { instructions: "原始函数标准", criteria: [{ key: "yes", description: "支持" }, { key: "no", description: "不支持" }] }); }
    finally { store.close(); }
    const input = { name: "快照", function_id: fn.id, cases: [{ id: "a", label: "fixture", input: "fixture", source: "fixture", reference: "yes", reference_status: "human" as const, rationale: "" }],
      participants: [{ id: "jev", name: "Jev", kind: "jev" as const, model: "jev-latest" }] };
    // The judgment definition is read through the system Functions actions with the caller's own authority.
    await assert.rejects(client.invoke({ ...user, permissions: ["experiments:read", "experiments:write"] }, a.create, input), { code: "actions.forbidden" });
    const { experiment } = await bound.invoke(a.create, input);
    assert.equal(experiment.task.instructions, "原始函数标准");
    assert.equal(experiment.task.function_snapshot?.config_hash, fn.config_hash);

    const reader = bindActionClient(client, () => ({ ...user, actor_id: "runtime:x", audience: "mcp", permissions: ["experiments:read"] }));
    assert.deepEqual((await reader.invoke(a.list, {})).experiments.map(row => row.id), [experiment.id]);
    const results = await reader.invoke(a.results, { id: experiment.id });
    assert.equal(results.summary[0]?.participant_id, "jev");
    assert.doesNotMatch(JSON.stringify(results), /fixture|原始函数标准/, "summaries carry metrics, not materials or task text");
    await assert.rejects(reader.invoke(a.get, { id: experiment.id }), { code: "actions.forbidden" });
    await assert.rejects(reader.invoke(a.run, { id: experiment.id }), { code: "actions.forbidden" });
  } finally {
    await host.close(); await closeExperiments(home);
    await rm(home, { recursive: true, force: true });
  }
});
