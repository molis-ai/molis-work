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

    // Only the person's call records the input confirmed; the assistant, an Agent, a workflow and an MCP client propose it for the person to accept.
    assert.equal(first.binding.state, "confirmed");
    const asRuntime = { actor_id: "runtime:confirmer", audit_actor_id: "runtime:confirmer:session", runtime_session_id: "session", actor_kind: "runtime" as const,
      project_id: project.project_id, permissions: ["goals:read", "goals:write"] };
    const proposals = await Promise.all((["agent", "workflow", "mcp"] as const).map(async audience =>
      (await actions.invoke({ ...asRuntime, audience }, goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: `item-by-${audience}` } }) as { binding: { binding_id: string; state: string } }).binding));
    assert.deepEqual(proposals.map(binding => binding.state), ["proposed", "proposed", "proposed"]);
    assert.deepEqual((await receipts("INPUT-GOAL")).filter(item => item.source_ref.startsWith("feed-item:item-by-")).map(item => [item.state, item.created_by]),
      [["proposed", "runtime:confirmer:session"], ["proposed", "runtime:confirmer:session"], ["proposed", "runtime:confirmer:session"]]);
    assert.equal((await receipts("INPUT-GOAL")).find(item => item.binding_id === runtime.binding.binding_id)?.state, "proposed", "the Agent's earlier call proposed too");

    // The receipt is strict on write: the digest is a sha256 of the form the owner computes, and the texts are bounded; nothing is written when one fails.
    const kept = (await receipts("INPUT-GOAL")).length;
    const refused = { code: "actions.input_invalid" };
    for (const snapshot_digest of ["", "anything", "a".repeat(64), `sha256:${"a".repeat(63)}`, `sha256:${"a".repeat(65)}`, `sha256:${"A".repeat(64)}`, `sha256:${"g".repeat(64)}`, `sha256:${"a".repeat(64)}\n`, `md5:${"a".repeat(64)}`])
      await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "item-bad-digest" }, snapshot_digest }), refused, `digest ${JSON.stringify(snapshot_digest)}`);
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "item-bad-reason" }, reason: "" }), refused);
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "item-long-reason" }, reason: "因".repeat(301) }), refused);
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "item-long-name" }, name: "名".repeat(201) }), refused);
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "i".repeat(201) } }), refused);
    assert.equal((await receipts("INPUT-GOAL")).length, kept);
    const longest = await bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "i".repeat(200) }, name: "名".repeat(200), reason: "因".repeat(300) });
    assert.equal(longest.replayed, false);

    // A project that no longer has Goals refuses it like any other Goals action, and writes nothing.
    const before = (await receipts("INPUT-GOAL")).length;
    denied = true;
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, source: { kind: "feed_item", id: "item-4" } }), { code: "actions.plugin_disabled" });
    assert.equal((await receipts("INPUT-GOAL")).length, before);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
