import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";

/**
 * A plugin that records Goal progress is the actor its own call context carries. The arguments do not name one, so a
 * plugin can neither write as somebody else nor read another actor's receipt.
 */
test("the Goal progress capabilities take a plugin's identity from its call context, never from the arguments", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-progress-plugin-identity-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Identity", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const goal_id = "IDENTITY-GOAL";
  const person = bindActionClient(host.actionClient(ref), () => ({ actor_id: "web-user", audience: "user" as const, project_id: project.project_id, permissions: ["goals:read", "goals:write"] }));
  const typed = host.client(ref);
  const plugin = (actor_id: string): HostCapabilityCallOptions => ({ consumer: "plugin", before_effect: async () => {},
    plugin_caller: { plugin_id: "io.molis.work.coding", install_id: "install-1", actor_id, project_id: project.project_id,
      declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} } });
  try {
    await person.invoke(goalsActions.create, { goal_id, title: "记录进展", idempotency_key: "create" });
    const cursor = (await person.invoke(goalsActions.state, { goal_id })).goal_event_cursor;
    const progress = { goal_id, based_on_cursor: cursor, expected_goal_cursor: cursor, summary: "报告已固定", idempotency_key: "progress-1" };

    // The arguments cannot name the actor a plugin acts as.
    await assert.rejects(typed.invoke(goalProgressCapabilities.record, { ...progress, actor_id: "intruder" } as never, plugin("web-user")), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(goalProgressCapabilities.record, { ...progress, actor_kind: "runtime" } as never, plugin("web-user")), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(goalProgressCapabilities.receipt, { goal_id, idempotency_key: progress.idempotency_key, actor_id: "web-user" } as never, plugin("web-user")), { code: "actions.input_invalid" });
    assert.equal((await person.invoke(goalsActions.state, { goal_id })).goal_event_cursor, cursor, "a refused call writes nothing");

    // A plugin consumer without its call context is refused rather than guessed at.
    await assert.rejects(typed.invoke(goalProgressCapabilities.record, progress as never, { consumer: "plugin", before_effect: async () => {} }), { code: "actions.forbidden" });
    await assert.rejects(typed.invoke(goalProgressCapabilities.receipt, { goal_id, idempotency_key: progress.idempotency_key } as never, { consumer: "plugin" }), { code: "actions.forbidden" });

    // The record belongs to the plugin's actor, and so does the receipt lookup.
    const recorded = await typed.invoke(goalProgressCapabilities.record, progress as never, plugin("web-user"));
    assert.equal(recorded.progress_summary.actor_id, "web-user");
    const receipt = await typed.invoke(goalProgressCapabilities.receipt, { goal_id, idempotency_key: progress.idempotency_key } as never, plugin("web-user"));
    assert.equal(receipt?.event_id, recorded.event_id);
    assert.equal(await typed.invoke(goalProgressCapabilities.receipt, { goal_id, idempotency_key: progress.idempotency_key } as never, plugin("someone-else")), null,
      "another actor's receipt cannot be read by naming the key");
    const replay = await typed.invoke(goalProgressCapabilities.record, progress as never, plugin("web-user"));
    assert.equal(replay.event_id, recorded.event_id, "the same actor's retry replays the original");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("a plugin reaches an action through the typed port as the plugin audience, so an action not offered to plugins stays out of its reach", async () => {
  const host = new LocalHost<object>({ runtimeFactory: { open: () => ({}), close: () => {} } });
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
    assert.deepEqual(await host.client(reference).invoke(offered as never, {}, asPlugin), { items: [] }, "an action offered to plugins is still reachable");
    assert.deepEqual(await host.client(reference).invoke(remove as never, {}), { ok: true }, "the Host's own typed callers are unchanged");
    assert.equal(deletes, 1);
  } finally { await host.close(); }
});
