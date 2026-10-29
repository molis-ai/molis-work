import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { callerPlugin, projectPluginCaller, type CallerPlugin } from "./fixtures/plugin-callers.js";
import { goalApplicationOf, goalsQueryOf } from "./fixtures/goal-application.js";

async function fixture(projectId: string, plugin?: CallerPlugin) {
  const home = await mkdtemp(join(tmpdir(), "goals-library-actions-"));
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId });
  let denied: string | undefined;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, ...(plugin ? { pluginFixtures: { project: [plugin.definition] } } : {}), actionAvailability: (_caller, view) =>
    view.capability_id === denied ? { available: false, code: "actions.plugin_disabled", reason: "管理动作已停用" } : { available: true } });
  // The management entries act as the person on this machine (§9.5 #6).
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: ref.project_id,
    permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "local-cli", message_ref: "explicit-command" } };
  return { home, ref, host, caller, client: host.actionClient(ref), block: (id?: string) => { denied = id; },
    close: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

test("PLIB-15 board initialization (version 2, no name) keeps original receipts and requires trusted management through the registered action", async () => {
  // A plugin that holds the Goals permissions, started by the Host.
  const initializer = callerPlugin("boardinitializer", "project", { "goals:read": true, "goals:write": true });
  const f = await fixture("initial", initializer); const { host, ref, caller, client, block } = f;
  const input = { idempotency_key: "initial" };
  try {
    // The plugin's call carries the caller the Host issued its session (S-15), claiming the person's permissions and management entry.
    const asPlugin = await projectPluginCaller(host, ref, initializer, caller.permissions, { user_action: caller.user_action });
    for (const audience of ["mcp", "agent", "workflow", "plugin"] as const) {
      const claimed = audience === "plugin" ? asPlugin : { ...caller, audience };
      assert.equal((await client.discover(claimed)).some(v => v.capability_id === goalsActions.initialize.capability_id), false);
      await assert.rejects(client.invoke(claimed, goalsActions.initialize, input), { code: "actions.forbidden" });
    }
    await assert.rejects(client.invoke({ ...caller, user_action: undefined }, goalsActions.initialize, input), { code: "goals.management_required" });
    await assert.rejects(client.invoke({ ...caller, user_action: { ...caller.user_action!, source: "web" } }, goalsActions.initialize, input), { code: "goals.management_required" });
    await assert.rejects(client.invoke(caller, goalsActions.initialize, { ...input, project_id: "other" } as never), { code: "actions.input_invalid" });
    await assert.rejects(client.invoke(caller, goalsActions.initialize, { ...input, title: "版本 1 收的名称" } as never), { code: "actions.input_invalid" }, "the name version 1 took is refused");
    await assert.rejects(client.invoke({ ...caller, project_id: "other" }, goalsActions.initialize, input), { code: "actions.scope_mismatch" });
    block(goalsActions.initialize.capability_id);
    await assert.rejects(client.invoke(caller, goalsActions.initialize, input), { code: "actions.plugin_disabled" });
    assert.equal(await host.withProject(ref, r => goalsQueryOf(r.store).getBoard(ref.project_id)), null);
    block();
    const old = await host.withProject(ref, r => goalApplicationOf(r).initializeBoard({ ...input, project_id: ref.project_id, actor_id: caller.actor_id }));
    assert.deepEqual(await client.invoke(caller, goalsActions.initialize, input), { ...old, replayed: true });
    const snapshot = await bindActionClient(client, () => caller).invoke(goalsActions.snapshot, {});
    assert.equal(snapshot.board.project_id, ref.project_id);
    assert.equal("title" in snapshot.board, false, "the board no longer carries a name: the directory owns it");
    assert.equal(snapshot.cursor, old.observed_event_cursor);
  } finally { await f.close(); }
});

test("PLIB-15 the four actions whose contracts carried the board's name are at version 2 in the project's directory, with no version 1 beside them", async () => {
  const f = await fixture("versions");
  try {
    const entries = await f.client.discover(f.caller);
    for (const definition of [goalsActions.initialize, goalsActions.snapshot, goalsActions.contract, goalsActions.collection]) {
      assert.deepEqual(entries.filter(entry => entry.capability_id === definition.capability_id).map(entry => entry.version), [2], definition.capability_id);
    }
  } finally { await f.close(); }
});
