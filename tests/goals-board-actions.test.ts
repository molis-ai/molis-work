import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, initializeBoardCapability, importV3Capability, type LegacyV3ImportInput } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";

const legacy: LegacyV3ImportInput = { schema_version: "3.0", goal_id: "legacy-root", meta: { title: "旧资料", source: { seed: "source" } },
  root_goal: { constraints: ["保留数据"] }, goals: [
    { id: "root", parent: null, one_liner: "总目标", covers: ["原范围"], inputs: ["原输入"], outputs: ["原输出"] },
    { id: "child", parent: "root", one_liner: "子目标", covers: [], inputs: [], outputs: [] },
  ], coverage_ledger: [{ id: "r1", requirement: "原要求", status: "now", owner_goal: "child", reason: "原原因" }] };
async function fixture(boardId: string) {
  const home = await mkdtemp(join(tmpdir(), "goals-board-actions-"));
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId });
  let denied: string | undefined;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) =>
    view.capability_id === denied ? { available: false, code: "actions.plugin_disabled", reason: "管理动作已停用" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "original-owner", actor_kind: "user", audience: "user", project_id: ref.project_id,
    permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "local-cli", message_ref: "explicit-command" } };
  return { home, ref, host, caller, client: host.actionClient(ref), typed: host.client(ref), block: (id?: string) => { denied = id; },
    close: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

test("board initialization keeps original receipts and requires trusted management across action and typed entries", async () => {
  const f = await fixture("initial"); const { host, ref, caller, client, typed, block } = f;
  const input = { title: "原始项目名", idempotency_key: "initial" };
  try {
    for (const action of [goalsActions.initialize, goalsActions.importV3]) {
      const payload = action === goalsActions.initialize ? input : { legacy, idempotency_key: "import" };
      for (const audience of ["mcp", "agent", "workflow", "plugin"] as const) {
        assert.equal((await client.discover({ ...caller, audience })).some(v => v.capability_id === action.capability_id), false);
        await assert.rejects(client.invoke({ ...caller, audience }, action as typeof goalsActions.initialize, payload as never), { code: "actions.forbidden" });
      }
    }
    await assert.rejects(client.invoke({ ...caller, user_action: undefined }, goalsActions.initialize, input), { code: "goals.management_required" });
    await assert.rejects(client.invoke({ ...caller, user_action: { ...caller.user_action!, source: "web" } }, goalsActions.initialize, input), { code: "goals.management_required" });
    await assert.rejects(client.invoke(caller, goalsActions.initialize, { ...input, board_id: "other" } as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(initializeBoardCapability, { ...input, board_id: "other", actor_id: caller.actor_id }), { code: "actions.scope_mismatch" });
    block(goalsActions.initialize.capability_id);
    await assert.rejects(typed.invoke(initializeBoardCapability, { ...input, board_id: ref.board_id, actor_id: caller.actor_id }), { code: "actions.plugin_disabled" });
    assert.equal(await host.withProject(ref, r => r.store.goalsQuery.getBoard(ref.board_id)), null);
    block();
    const old = await host.withProject(ref, r => r.coordinator.initializeBoard({ ...input, board_id: ref.board_id, actor_id: caller.actor_id }));
    assert.deepEqual(await client.invoke(caller, goalsActions.initialize, input), { ...old, replayed: true });
    assert.deepEqual(await typed.invoke(initializeBoardCapability, { ...input, board_id: ref.board_id, actor_id: caller.actor_id }), { ...old, replayed: true });
    const snapshot = await bindActionClient(client, () => caller).invoke(goalsActions.snapshot, {});
    assert.equal(snapshot.board.title, input.title);
    assert.equal(snapshot.cursor, old.observed_event_cursor);
    const plugin = createPluginCapabilityClient({ ...filesManifest, plugin_id: "io.molis.work.test.board-manager",
      capabilities: { provides: [], consumes: [initializeBoardCapability.capability_id, importV3Capability.capability_id] } }, typed);
    for (const definition of [initializeBoardCapability, importV3Capability]) {
      const available = plugin.availability(definition);
      assert.equal(available.available, false);
      assert.equal(!available.available && available.code, "actions.host_only");
    }
    await assert.rejects(plugin.invoke({ ...initializeBoardCapability, host_only: false }, { ...input, board_id: ref.board_id, actor_id: "fake-user" }), { code: "actions.host_only" });
  } finally { await f.close(); }
});

test("V3 action import preserves mapped records, rolls back partial writes, rejects overwrite and survives restart", async () => {
  const f = await fixture("imported"); const { host, ref, caller, client, typed, block } = f;
  const input = { legacy: { ...legacy, ignored_v3_extension: { note: "retained input compatibility" } }, idempotency_key: "import" };
  try {
    await assert.rejects(typed.invoke(importV3Capability, { ...input, target_board_id: "foreign", actor_id: caller.actor_id }), { code: "actions.scope_mismatch" });
    block(goalsActions.importV3.capability_id);
    await assert.rejects(typed.invoke(importV3Capability, { ...input, target_board_id: ref.board_id, actor_id: caller.actor_id }), { code: "actions.plugin_disabled" });
    block();
    await host.withProject(ref, r => r.store.db.exec(`CREATE TEMP TRIGGER reject_import BEFORE INSERT ON events
      WHEN NEW.type = 'v3.imported' BEGIN SELECT RAISE(FAIL, 'reject import'); END`));
    await assert.rejects(client.invoke(caller, goalsActions.importV3, input), /reject import/);
    await host.withProject(ref, r => {
      assert.equal(r.store.goalsQuery.getBoard(ref.board_id), null);
      assert.equal((r.store.db.prepare("SELECT count(*) AS n FROM goals").get() as { n: number }).n, 0);
      r.store.db.exec("DROP TRIGGER reject_import");
    });
    const imported = await bindActionClient(client, () => caller).invoke(goalsActions.importV3, input);
    assert.deepEqual(imported.goal_id_map, { root: "imported:v3:root", child: "imported:v3:child" });
    const snapshot = await bindActionClient(client, () => caller).invoke(goalsActions.snapshot, {});
    assert.equal(snapshot.board.title, "旧资料");
    assert.deepEqual(snapshot.goals.find(g => g.goal_id === imported.goal_id_map.root)?.required_inputs, ["原输入"]);
    assert.equal(snapshot.relations[0]?.type, "part_of");
    const collection = await bindActionClient(client, () => caller).invoke(goalsActions.collection, {});
    assert.equal(collection.coverage[0]?.owner_goal_id, imported.goal_id_map.child);
    assert.equal(collection.coverage[0]?.reason, "原原因");
    await assert.rejects(typed.invoke(importV3Capability, { ...input, target_board_id: ref.board_id, actor_id: caller.actor_id }), /不会覆盖/);
    assert.deepEqual(await client.invoke(caller, goalsActions.snapshot, {}), snapshot);
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
    try { assert.deepEqual(await restarted.actionClient(ref).invoke(caller, goalsActions.snapshot, {}), snapshot); }
    finally { await restarted.close(); }
  } finally { await f.close(); }
});
