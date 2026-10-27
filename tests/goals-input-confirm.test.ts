import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalApplicationOf } from "./fixtures/goal-application.js";

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
  const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["goals:read", "goals:write", "context-ledger:write"] };
  const actions = host.actionClient(ref), bound = bindActionClient(actions, () => caller);
  const receipts = (goal_id: string) => host.withProject(ref, runtime => goalApplicationOf(runtime).goalInputs.list(project.project_id).filter(receipt => receipt.goal_id === goal_id));
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
    await assert.rejects(bound.invoke(goalsActions.inputsConfirm, { ...input, goal_id: "MISSING" }), { code: "goals.not_found" });
    await assert.rejects(actions.invoke({ ...caller, project_id: "foreign" }, goalsActions.inputsConfirm, input), { code: "actions.scope_mismatch" });
    await assert.rejects(actions.invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.inputsConfirm, input), { code: "actions.forbidden" });
    const runtime = await actions.invoke({ actor_id: "runtime:confirmer", audit_actor_id: "runtime:confirmer:session", runtime_session_id: "session", actor_kind: "runtime",
      audience: "agent", project_id: project.project_id, permissions: ["goals:read", "goals:write", "context-ledger:write"] }, goalsActions.inputsConfirm,
      { ...input, source: { kind: "feed_item", id: "item-3" } }) as { binding: { binding_id: string } };
    assert.equal((await receipts("INPUT-GOAL")).find(item => item.binding_id === runtime.binding.binding_id)?.created_by, "runtime:confirmer:session");

    // Only the person's call records the input confirmed; the assistant, an Agent, a workflow and an MCP client propose it for the person to accept.
    assert.equal(first.binding.state, "confirmed");
    const asRuntime = { actor_id: "runtime:confirmer", audit_actor_id: "runtime:confirmer:session", runtime_session_id: "session", actor_kind: "runtime" as const,
      project_id: project.project_id, permissions: ["goals:read", "goals:write", "context-ledger:write"] };
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

/**
 * An input the assistant, an Agent, a workflow or an MCP client recorded stays `proposed` until the person says so in Goals
 * (specs/repository-anti-corruption §1, 2026-10-10): `goals.inputs.accept` is the person's alone, and the person can also take the
 * proposal off the Goal with `goals.inputs.release`.
 */
test("an input an Agent proposed waits for the person, who alone accepts it, and who can remove it instead", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-input-accept-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Accept", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const person: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["goals:read", "goals:write", "context-ledger:write"] };
  const agent: ActionCallContext = { actor_id: "runtime:proposer", audit_actor_id: "runtime:proposer:session", runtime_session_id: "session", actor_kind: "runtime",
    audience: "agent", project_id: project.project_id, permissions: ["goals:read", "goals:write", "context-ledger:write"] };
  const actions = host.actionClient(ref), asPerson = bindActionClient(actions, () => person);
  const receipts = (goal_id: string) => host.withProject(ref, runtime => goalApplicationOf(runtime).goalInputs.list(project.project_id).filter(receipt => receipt.goal_id === goal_id));
  const digest = `sha256:${"b".repeat(64)}`;
  const input = (id: string) => ({ goal_id: "ACCEPT-GOAL", source: { kind: "feed_item" as const, id }, name: "Feed Item 输入", snapshot_digest: digest, reason: "从 Feed Item 提议该输入" });
  const propose = async (id: string, by: ActionCallContext = agent) =>
    (await actions.invoke(by, goalsActions.inputsConfirm, input(id)) as { binding: { binding_id: string; state: string } }).binding;
  try {
    await asPerson.invoke(goalsActions.create, { goal_id: "ACCEPT-GOAL", title: "接收提议", idempotency_key: "create" });
    await asPerson.invoke(goalsActions.create, { goal_id: "OTHER-GOAL", title: "另一个目标", idempotency_key: "create-other" });
    const proposed = await propose("item-a");
    assert.equal(proposed.state, "proposed");
    assert.deepEqual(await actions.invoke(agent, goalsActions.inputsConfirm, input("item-a")), { binding: proposed, replayed: true });

    // The person's own confirmation of a source that is only proposed is not met with the proposal as if it were settled.
    await assert.rejects(asPerson.invoke(goalsActions.inputsConfirm, input("item-a")), { code: "goals.input_proposed" });
    assert.deepEqual((await receipts("ACCEPT-GOAL")).map(receipt => receipt.state), ["proposed"]);

    // Accepting is the person's alone, whoever else holds the Goals grants.
    for (const audience of ["agent", "workflow", "mcp"] as const)
      await assert.rejects(actions.invoke({ ...agent, audience }, goalsActions.inputsAccept, { goal_id: "ACCEPT-GOAL", binding_id: proposed.binding_id }), { code: "actions.forbidden" }, audience);
    await assert.rejects(actions.invoke({ ...person, permissions: ["goals:read"] }, goalsActions.inputsAccept, { goal_id: "ACCEPT-GOAL", binding_id: proposed.binding_id }), { code: "actions.forbidden" });
    assert.deepEqual((await receipts("ACCEPT-GOAL")).map(receipt => receipt.state), ["proposed"]);

    // The receipt is found under its own Goal and is a confirmable source.
    await assert.rejects(asPerson.invoke(goalsActions.inputsAccept, { goal_id: "OTHER-GOAL", binding_id: proposed.binding_id }), { code: "goals.not_found" });
    await assert.rejects(asPerson.invoke(goalsActions.inputsAccept, { goal_id: "ACCEPT-GOAL", binding_id: "no-such-binding" }), { code: "goals.not_found" });
    await assert.rejects(asPerson.invoke(goalsActions.inputsAccept, { goal_id: "MISSING", binding_id: proposed.binding_id }), { code: "goals.not_found" });
    await assert.rejects(asPerson.invoke(goalsActions.inputsAccept, { goal_id: "ACCEPT-GOAL", binding_id: proposed.binding_id, actor_id: "forged" } as never), { code: "actions.input_invalid" });

    // The person accepts it: the receipt is confirmed, with the digest and the proposer's own words kept, and it is the same receipt.
    const accepted = await asPerson.invoke(goalsActions.inputsAccept, { goal_id: "ACCEPT-GOAL", binding_id: proposed.binding_id });
    assert.deepEqual([accepted.replayed, accepted.binding.binding_id, accepted.binding.state, accepted.binding.snapshot_digest, accepted.binding.source],
      [false, proposed.binding_id, "confirmed", digest, { kind: "feed_item", id: "item-a" }]);
    const [receipt] = await receipts("ACCEPT-GOAL");
    assert.deepEqual([receipt!.state, receipt!.created_by, receipt!.reason, receipt!.source_ref], ["confirmed", "runtime:proposer:session", "从 Feed Item 提议该输入", "feed-item:item-a"]);
    // Accepting again changes nothing; confirming again, by anyone, returns the confirmed receipt.
    assert.deepEqual(await asPerson.invoke(goalsActions.inputsAccept, { goal_id: "ACCEPT-GOAL", binding_id: proposed.binding_id }), { binding: accepted.binding, replayed: true });
    assert.deepEqual(await actions.invoke(agent, goalsActions.inputsConfirm, input("item-a")), { binding: accepted.binding, replayed: true });
    assert.deepEqual(await asPerson.invoke(goalsActions.inputsConfirm, input("item-a")), { binding: accepted.binding, replayed: true });

    // The person can turn a proposal down: the receipt stays as history and no longer counts, and it cannot be accepted afterwards.
    const declined = await propose("item-b");
    assert.deepEqual(await asPerson.invoke(goalsActions.inputsRelease, { goal_id: "ACCEPT-GOAL", binding_id: declined.binding_id }), { released: true });
    assert.deepEqual((await receipts("ACCEPT-GOAL")).map(item => [item.source_ref, item.state]), [["feed-item:item-a", "confirmed"], ["feed-item:item-b", "inactive"]]);
    await assert.rejects(asPerson.invoke(goalsActions.inputsAccept, { goal_id: "ACCEPT-GOAL", binding_id: declined.binding_id }), { code: "goals.input_released" });
    assert.deepEqual(await asPerson.invoke(goalsActions.inputsRelease, { goal_id: "ACCEPT-GOAL", binding_id: declined.binding_id }), { released: false });
    // A source whose proposal was turned down can be proposed or confirmed afresh, as a new receipt.
    const again = await propose("item-b");
    assert.notEqual(again.binding_id, declined.binding_id);
    assert.equal(again.state, "proposed");

    // Others withdraw what they proposed; a confirmed input is taken off only by the person.
    assert.deepEqual(await actions.invoke(agent, goalsActions.inputsRelease, { goal_id: "ACCEPT-GOAL", binding_id: again.binding_id }), { released: true });
    await assert.rejects(actions.invoke(agent, goalsActions.inputsRelease, { goal_id: "ACCEPT-GOAL", binding_id: proposed.binding_id }), { code: "goals.input_confirmed" });
    assert.deepEqual((await receipts("ACCEPT-GOAL")).filter(item => item.state !== "inactive").map(item => item.source_ref), ["feed-item:item-a"]);
    assert.deepEqual(await asPerson.invoke(goalsActions.inputsRelease, { goal_id: "ACCEPT-GOAL", binding_id: proposed.binding_id }), { released: true });
    assert.deepEqual((await receipts("ACCEPT-GOAL")).filter(item => item.state !== "inactive"), []);
    await assert.rejects(asPerson.invoke(goalsActions.inputsRelease, { goal_id: "OTHER-GOAL", binding_id: again.binding_id }), { code: "goals.not_found" });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
