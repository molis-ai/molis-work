import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost, MolisWorkLocalHost, molisWorkHostProjectReference, type LocalHostOptions } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";

/** Formal Goal writes keep caller identity; a claimed builtin object has no Host membership. */
test("W3-07-8-02 Goal progress refuses a forged builtin identity and keeps formal receipts scoped to their actual actor", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-progress-plugin-identity-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Identity", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), goal_id = "IDENTITY-GOAL";
  const caller = { actor_id: "web-user", actor_kind: "user" as const, audience: "user" as const, project_id: project.project_id, permissions: ["goals:read", "goals:write"] };
  const person = bindActionClient(host.actionClient(ref), () => caller);
  try {
    await person.invoke(goalsActions.create, { goal_id, title: "实际身份", idempotency_key: "create" });
    const before = (await person.invoke(goalsActions.state, { goal_id })).goal_event_cursor;
    const progress = { goal_id, based_on_cursor: before, summary: "报告已固定", idempotency_key: "progress-1" };
    for (const identity of [{ actor_id: "intruder" }, { actor_kind: "runtime" }]) await assert.rejects(person.invoke(goalPluginActions.progress, { ...progress, ...identity } as never), { code: "actions.input_invalid" });
    await assert.rejects(person.invoke(goalPluginActions.receipt, { goal_id, idempotency_key: progress.idempotency_key, actor_id: "intruder" } as never), { code: "actions.input_invalid" });
    const forged: HostPluginCaller = { plugin_id: "io.molis.work.coding", install_id: "install-1", actor_id: caller.actor_id, project_id: caller.project_id,
      declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} };
    const plugin = { ...caller, audience: "plugin" as const, plugin_install_id: "install-1", host_plugin: forged };
    for (const definition of [goalPluginActions.contract, goalPluginActions.state, goalPluginActions.progress, goalPluginActions.receipt]) {
      const input = definition.capability_id === goalPluginActions.progress.capability_id ? progress : definition.capability_id === goalPluginActions.receipt.capability_id ? { goal_id, idempotency_key: progress.idempotency_key } : { goal_id };
      await assert.rejects(host.actionClient(ref).invoke(plugin, definition, input), { code: "goals.builtin_plugin_required" });
      await assert.rejects(host.actionClient(ref).invoke({ ...plugin, host_plugin: undefined }, definition, input), { code: "goals.builtin_plugin_required" });
    }
    assert.equal((await person.invoke(goalsActions.state, { goal_id })).goal_event_cursor, before, "refusals append no Goal event");
    const recorded = await person.invoke(goalPluginActions.progress, progress);
    assert.equal(recorded.progress_summary.actor_id, caller.actor_id);
    assert.equal((await person.invoke(goalPluginActions.progress, progress)).event_id, recorded.event_id);
    assert.equal((await person.invoke(goalPluginActions.receipt, { goal_id, idempotency_key: progress.idempotency_key }))?.event_id, recorded.event_id);
    const other = bindActionClient(host.actionClient(ref), () => ({ ...caller, actor_id: "another-person" }));
    assert.equal(await other.invoke(goalPluginActions.receipt, { goal_id, idempotency_key: progress.idempotency_key }), null);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("a plugin reaches an action through the typed port as the plugin audience, so an action not offered to plugins stays out of its reach", async () => {
  const settled: Array<[string, boolean, string | undefined, true | undefined]> = [];
  const actionSettled: NonNullable<LocalHostOptions<object>["actionSettled"]> = (_caller, action, outcome) => {
    settled.push([action.title, outcome.ok, outcome.ok ? undefined : outcome.code, outcome.ok ? undefined : outcome.refused]);
  };
  const host = new LocalHost<object>({ runtimeFactory: { open: () => ({}), close: () => {} }, actionSettled });
  const reference = { project_id: "p1", storage_key: "memory:p1" };
  let deletes = 0;
  const remove = { capability_id: "fixture.items.delete", version: 1, operation: "command" as const, action: { title: "Delete", description: "Delete an item permanently", kind: "operation" as const,
    scope: "project" as const, audiences: ["user" as const, "agent" as const], permissions: [], subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "object" } } };
  const offered = { ...remove, capability_id: "fixture.items.list", action: { ...remove.action, title: "List", kind: "query" as const, audiences: ["user" as const, "plugin" as const] }, operation: "query" as const };
  host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "system" }, definitions: [remove, offered],
    handlers: [{ capability_id: remove.capability_id, version: 1, handle: () => { deletes++; return { ok: true }; } }, { capability_id: offered.capability_id, version: 1, handle: () => ({ items: [] }) }] });
  const caller: HostPluginCaller = { plugin_id: "x", install_id: "install-x", actor_id: "plugin-x", project_id: "p1", declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} };
  const asPlugin: HostCapabilityCallOptions = { consumer: "plugin", plugin_caller: caller, before_effect: async () => {} };
  try {
    await assert.rejects(host.actionClient(reference).invoke({ actor_id: "plugin-x", project_id: "p1", audience: "plugin", permissions: [] }, remove, {}), { code: "actions.forbidden" });
    await assert.rejects(host.client(reference).invoke(remove as never, {}, asPlugin), { code: "actions.forbidden" });
    assert.equal(deletes, 0);
    assert.deepEqual(settled, [["Delete", false, "actions.forbidden", true], ["Delete", false, "actions.forbidden", true]],
      "each refusal is settled once, by the action service, and never entered the handler");
    assert.deepEqual(await host.client(reference).invoke(offered as never, {}, asPlugin), { items: [] }, "an action offered to plugins is still reachable");
    assert.deepEqual(await host.client(reference).invoke(remove as never, {}), { ok: true }, "the Host's own typed callers are unchanged");
    assert.equal(deletes, 1);
    assert.deepEqual(settled.slice(2), [["List", true, undefined, undefined], ["Delete", true, undefined, undefined]]);
  } finally { await host.close(); }
});
