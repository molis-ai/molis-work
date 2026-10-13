import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, initializeBoardCapability } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";

async function fixture(projectId: string) {
  const home = await mkdtemp(join(tmpdir(), "goals-board-actions-"));
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId });
  let denied: string | undefined;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) =>
    view.capability_id === denied ? { available: false, code: "actions.plugin_disabled", reason: "管理动作已停用" } : { available: true } });
  // The management entries act as the person on this machine (§9.5 #6).
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: ref.project_id,
    permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "local-cli", message_ref: "explicit-command" } };
  return { home, ref, host, caller, client: host.actionClient(ref), typed: host.client(ref), block: (id?: string) => { denied = id; },
    close: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

test("board initialization keeps original receipts and requires trusted management across action and typed entries", async () => {
  const f = await fixture("initial"); const { host, ref, caller, client, typed, block } = f;
  const input = { title: "原始项目名", idempotency_key: "initial" };
  try {
    for (const audience of ["mcp", "agent", "workflow", "plugin"] as const) {
      assert.equal((await client.discover({ ...caller, audience })).some(v => v.capability_id === goalsActions.initialize.capability_id), false);
      await assert.rejects(client.invoke({ ...caller, audience }, goalsActions.initialize, input), { code: "actions.forbidden" });
    }
    await assert.rejects(client.invoke({ ...caller, user_action: undefined }, goalsActions.initialize, input), { code: "goals.management_required" });
    await assert.rejects(client.invoke({ ...caller, user_action: { ...caller.user_action!, source: "web" } }, goalsActions.initialize, input), { code: "goals.management_required" });
    await assert.rejects(client.invoke(caller, goalsActions.initialize, { ...input, project_id: "other" } as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(initializeBoardCapability, { ...input, project_id: "other" }), { code: "actions.scope_mismatch" });
    block(goalsActions.initialize.capability_id);
    await assert.rejects(typed.invoke(initializeBoardCapability, { ...input, project_id: ref.project_id }), { code: "actions.plugin_disabled" });
    assert.equal(await host.withProject(ref, r => r.store.goalsQuery.getBoard(ref.project_id)), null);
    block();
    const old = await host.withProject(ref, r => r.coordinator.initializeBoard({ ...input, project_id: ref.project_id, actor_id: caller.actor_id }));
    assert.deepEqual(await client.invoke(caller, goalsActions.initialize, input), { ...old, replayed: true });
    assert.deepEqual(await typed.invoke(initializeBoardCapability, { ...input, project_id: ref.project_id }), { ...old, replayed: true });
    const snapshot = await bindActionClient(client, () => caller).invoke(goalsActions.snapshot, {});
    assert.equal(snapshot.board.title, input.title);
    assert.equal(snapshot.cursor, old.observed_event_cursor);
    const plugin = createPluginCapabilityClient({ ...filesManifest, plugin_id: "io.molis.work.test.board-manager",
      capabilities: { provides: [], consumes: [initializeBoardCapability.capability_id] } }, typed);
    const available = plugin.availability(initializeBoardCapability);
    assert.equal(available.available, false);
    assert.equal(!available.available && available.code, "actions.host_only");
    await assert.rejects(plugin.invoke({ ...initializeBoardCapability, host_only: false }, { ...input, project_id: ref.project_id }), { code: "actions.host_only" });
  } finally { await f.close(); }
});
