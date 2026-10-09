import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * `goals.inputs.confirm` is how a plugin that owns a source (today Feed, when a person promotes an item) has Goals record that the
 * source was confirmed as an input of a Goal, as it was then. Goals writes its own receipt; the caller writes nothing of Goals'.
 */
test("a confirmed source becomes the Goal's input receipt, once, under the caller's identity and under Goals' own policy", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-input-confirm-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Inputs", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  let denied = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) =>
    denied && view.capability_id === goalsActions.inputsConfirm.capability_id ? { available: false, code: "actions.plugin_disabled", reason: "Goals 已停用" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["goals:read", "goals:write"] };
  const actions = host.actionClient(ref), bound = bindActionClient(actions, () => caller);
  const receipts = (goal_id: string) => host.withProject(ref, runtime => runtime.coordinator.goalInputs.list(project.project_id).filter(receipt => receipt.goal_id === goal_id));
  const digest = `sha256:${"a".repeat(64)}`;
  const input = { goal_id: "INPUT-GOAL", source: { kind: "feed_item" as const, id: "item-1" }, name: "Feed Item 输入", snapshot_digest: digest, reason: "用户确认该输入" };
  try {
    await bound.invoke(goalsActions.create, { goal_id: "INPUT-GOAL", title: "接收输入", idempotency_key: "create" });
    await bound.invoke(goalsActions.create, { goal_id: "OTHER-GOAL", title: "另一个目标", idempotency_key: "create-other" });

    const first = await bound.invoke(goalsActions.inputsConfirm, input);
    assert.equal(first.replayed, false);
    assert.deepEqual([first.binding.goal_id, first.binding.source, first.binding.name, first.binding.snapshot_digest, first.binding.state],
      ["INPUT-GOAL", { kind: "feed_item", id: "item-1" }, "Feed Item 输入", digest, "confirmed"]);
    const [receipt] = await receipts("INPUT-GOAL");
    assert.deepEqual([receipt!.source_type, receipt!.source_ref, receipt!.snapshot_digest, receipt!.state, receipt!.created_by, receipt!.reason],
      ["feed_item", "feed-item:item-1", digest, "confirmed", "web-user", "用户确认该输入"]);

    // Confirming the same source again returns the receipt that is there; another source or another Goal gets its own.
    assert.deepEqual(await bound.invoke(goalsActions.inputsConfirm, input), { binding: first.binding, replayed: true });
    await bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "item-2" } });
    await bound.invoke(goalsActions.inputsConfirm, { ...input, goal_id: "OTHER-GOAL" });
    assert.deepEqual((await receipts("INPUT-GOAL")).map(item => item.source_ref), ["feed-item:item-1", "feed-item:item-2"]);
    assert.equal((await receipts("OTHER-GOAL")).length, 1);

    // The caller's identity, project and authority come from its context, never from the input.
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, actor_id: "forged" } as never), { code: "actions.input_invalid" });
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, project_id: "foreign" } as never), { code: "actions.input_invalid" });
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "pages_document", id: "doc" } } as never), { code: "actions.input_invalid" });
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, goal_id: "MISSING" }), { code: "goal.not_found" });
    await assert.rejects(actions.invoke({ ...caller, project_id: "foreign" }, goalsActions.inputsConfirm, input), { code: "actions.scope_mismatch" });
    await assert.rejects(actions.invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.inputsConfirm, input), { code: "actions.forbidden" });
    const runtime = await actions.invoke({ actor_id: "runtime:confirmer", audit_actor_id: "runtime:confirmer:session", runtime_session_id: "session", actor_kind: "runtime",
      audience: "agent", project_id: project.project_id, permissions: ["goals:read", "goals:write"] }, goalsActions.inputsConfirm,
      { ...input, source: { kind: "feed_item", id: "item-3" } }) as { binding: { binding_id: string } };
    assert.equal((await receipts("INPUT-GOAL")).find(item => item.binding_id === runtime.binding.binding_id)?.created_by, "runtime:confirmer:session");

    // A project that no longer has Goals refuses it like any other Goals action, and writes nothing.
    const before = (await receipts("INPUT-GOAL")).length;
    denied = true;
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "item-4" } }), { code: "actions.plugin_disabled" });
    assert.equal((await receipts("INPUT-GOAL")).length, before);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
