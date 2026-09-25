import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, setActiveGoalCapability, trashedGoalsCapability, createGoalEntryCompositionClient } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { insertHistoricalClaim, insertHistoricalRun } from "./historical-sql-fixture.js";

async function recordDelivery(actions: BoundActionClient, goal_id: string) {
  await actions.invoke(goalsActions.configure, { goal_id, expected_version: 0, idempotency_key: `config-${goal_id}`,
    types: [{ type_id: "delivery", version: 1, name: "Delivery", purpose: "Actual result", fields: [{ field_id: "body", name: "Body", purpose: "Evidence", format: "text", required: true }] }],
    requirement_bindings: [{ type_id: "delivery", requirement_id: "delivered" }] });
  await actions.invoke(goalsActions.report, { goal_id, idempotency_key: `report-${goal_id}`, events: [{ type_id: "delivery", type_version: 1,
    title: "Delivered result", fields: { body: "The agreed result is available" }, judgments: [{ requirement_id: "delivered", verdict: "supports" }] }] });
}

test("lifecycle actions preserve old receipts, active Goal, relations, history, rollback and restart", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-lifecycle-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Lifecycle", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const denied = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, action) =>
    denied.has(action.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "Lifecycle disabled" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "runtime:lifecycle", project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write"] };
  const client = host.actionClient(ref), typed = host.client(ref), bound = bindActionClient(client, () => caller);
  const composition = createGoalEntryCompositionClient(typed);
  const snapshot = () => host.withProject(ref, r => r.store.snapshot(project.board_id));
  const active = { goal_id: "left", reason: "Continue this Goal", idempotency_key: "active-original" };
  const trash = { goal_id: "left", trashed: true, reason: "User confirmed trash", user_confirmed: true, idempotency_key: "trash-original" };
  try {
    for (const goal_id of ["left", "right", "done"]) await bound.invoke(goalsActions.create, { goal_id, title: goal_id, outcome: "Deliver the agreed work",
      requirements: goal_id === "done" ? [{ requirement_id: "delivered", statement: "The agreed result is available" }] : [], idempotency_key: `create-${goal_id}` });
    const relation = await host.withProject(ref, r => r.coordinator.goals.commands.addRelation(project.board_id,
      { from_goal_id: "left", to_goal_id: "right", type: "extends", reason: "Related work" }, { actor_id: caller.actor_id, idempotency_key: "relation" }));
    const note = await bound.invoke(goalsActions.note, { goal_id: "left", body: "Preserve this complete history", idempotency_key: "history" });
    const oldActive = await host.withProject(ref, r => r.coordinator.setActiveGoal(project.board_id,
      { goal_id: active.goal_id, reason: active.reason }, { actor_id: caller.actor_id, idempotency_key: active.idempotency_key }));
    assert.deepEqual(await bound.invoke(goalsActions.active, active), { ...oldActive, replayed: true });
    const before = await snapshot();
    await assert.rejects(bound.invoke(goalsActions.trash, { ...trash, user_confirmed: false }), { code: "goal.trash_confirmation_required" });
    await assert.rejects(bound.invoke(goalsActions.trash, { ...trash, actor_id: "user" } as never), { code: "actions.input_invalid" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.trash, trash), { code: "actions.forbidden" });
    await assert.rejects(client.invoke({ ...caller, project_id: "foreign" }, goalsActions.active, active), { code: "actions.scope_mismatch" });
    await assert.rejects(typed.invoke(trashedGoalsCapability, { board_id: "foreign" }), { code: "actions.scope_mismatch" });
    await assert.rejects(bound.invoke(goalsActions.archive, { goal_id: "left", archived: true, reason: "Not complete", idempotency_key: "archive-unfinished" }));
    assert.deepEqual(await snapshot(), before);

    // Fail after the owner has changed placement, relations and the current Goal pointer.
    await host.withProject(ref, r => r.store.db.exec(`CREATE TEMP TRIGGER reject_trash BEFORE INSERT ON events
      WHEN NEW.type = 'goal.trashed' BEGIN SELECT RAISE(ABORT, 'injected trash append failure'); END`));
    await assert.rejects(bound.invoke(goalsActions.trash, trash), /injected trash append failure/);
    assert.deepEqual(await snapshot(), before);
    assert.equal(await host.withProject(ref, r => (r.store.db.prepare("SELECT COUNT(*) AS n FROM goal_trash_records WHERE goal_id = 'left'").get() as { n: number }).n), 0);
    await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER reject_trash"));
    const { user_confirmed: _confirmed, idempotency_key, ...oldInput } = trash;
    const oldTrash = await host.withProject(ref, r => r.coordinator.goals.lifecycle.setTrashed(project.board_id, oldInput, { actor_id: caller.actor_id, idempotency_key }));
    assert.deepEqual(await bound.invoke(goalsActions.trash, trash), { ...oldTrash, replayed: true });
    assert.equal(oldTrash.active_goal_cleared, true);
    assert.deepEqual(oldTrash.deactivated_relation_ids, [relation.relation_id]);
    assert.equal((await snapshot()).board.active_goal_id, null);
    const trashed = await typed.invoke(trashedGoalsCapability, { board_id: project.board_id });
    assert.deepEqual(trashed.goals, [oldTrash.goal]);
    const trashedDocument = await bound.invoke(goalsActions.document, { goal_id: "left" });
    assert.ok(trashedDocument.timeline.items.some(item => item.event_id === note.event_id));
    assert.equal(trashedDocument.relations.find(r => r.relation_id === relation.relation_id)?.state, "inactive");
    await assert.rejects(bound.invoke(goalsActions.trash, { ...trash, reason: "Different request" }));
    await assert.rejects(bound.invoke(goalsActions.active, { ...active, idempotency_key: "active-trashed" }), { code: "goal.trashed" });
    await bound.invoke(goalsActions.trash, { ...trash, goal_id: "right", idempotency_key: "trash-right" });
    const leftRestored = await composition.setTrashedWithWorkState(project.board_id, { goal_id: "left", trashed: false, reason: "Restore left" },
      { actor_id: caller.actor_id, idempotency_key: "restore-left" });
    assert.equal(leftRestored.work_state.status, "open");
    assert.deepEqual(leftRestored.result.pending_relation_ids, [relation.relation_id]);
    const rightRestored = await bound.invoke(goalsActions.trash, { ...trash, goal_id: "right", trashed: false, idempotency_key: "restore-right" });
    assert.deepEqual(rightRestored.restored_relation_ids, [relation.relation_id]);
    assert.equal((await snapshot()).relations.find(r => r.relation_id === relation.relation_id)?.state, "active");
    assert.equal(((await bound.invoke(goalsActions.event, { goal_id: "left", event_id: note.event_id }))?.payload as { body: string }).body, "Preserve this complete history");
    await typed.invoke(setActiveGoalCapability, { board_id: project.board_id, goal: { goal_id: "done", reason: "Finish this Goal" }, write: { actor_id: caller.actor_id, idempotency_key: "active-done" } });
    await recordDelivery(bound, "done");
    const state = await bound.invoke(goalsActions.state, { goal_id: "done" });
    const closed = await bound.invoke(goalsActions.close, { goal_id: "done", kind: "complete", result: "Delivered the agreed work", reason: "Delivered", expected_config_version: state.config.version,
      expected_agreement_version: state.agreement.version, idempotency_key: "complete" });
    assert.equal(closed.work_status, "completed", JSON.stringify(closed));
    const archived = await bound.invoke(goalsActions.archive, { goal_id: "done", archived: true, reason: "Organize completed work", idempotency_key: "archive" });
    assert.equal(archived.goal.fulfillment_state, "satisfied"); assert.ok(archived.goal.archived_at);
    const archivedDocument = await bound.invoke(goalsActions.document, { goal_id: "done" });
    assert.equal(archivedDocument.state.work_status, "completed"); assert.equal(archivedDocument.transfer.kind, "reopen_event_completed");
    await assert.rejects(bound.invoke(goalsActions.active, { ...active, goal_id: "done", idempotency_key: "active-archived" }));
    const restored = await bound.invoke(goalsActions.archive, { goal_id: "done", archived: false, reason: "Show completed work", idempotency_key: "unarchive" });
    assert.equal(restored.goal.archived_at, null); assert.equal(restored.goal.fulfillment_state, "satisfied");

    denied.add(goalsActions.active.capability_id); denied.add(goalsActions.trash.capability_id); denied.add(goalsActions.trashed.capability_id);
    await assert.rejects(typed.invoke(setActiveGoalCapability, { board_id: project.board_id, goal: active, write: { actor_id: caller.actor_id, idempotency_key: "denied" } }), { code: "actions.plugin_disabled" });
    await assert.rejects(composition.setTrashedWithWorkState(project.board_id, oldInput, { actor_id: caller.actor_id, idempotency_key: "denied" }), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(trashedGoalsCapability, { board_id: project.board_id }), { code: "actions.plugin_disabled" });
    const final = await snapshot();
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      assert.deepEqual(await restarted.withProject(ref, r => r.store.snapshot(project.board_id)), final);
      assert.deepEqual(await restarted.actionClient(ref).invoke(caller, goalsActions.trash, trash), { ...oldTrash, replayed: true });
      assert.deepEqual(await restarted.withProject(ref, r => r.store.snapshot(project.board_id)), final, "replaying a historical receipt must not trash a restored Goal again");
    } finally { await restarted.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("Web lifecycle routes obey live policy and report blocked historical work without deleting it", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-lifecycle-http-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Lifecycle HTTP", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const denied = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, action) =>
    denied.has(action.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "Lifecycle disabled" } : { available: true } });
  const token = "lifecycle-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const bound = bindActionClient(host.actionClient(ref), () => ({ actor_id: "user", audience: "user", project_id: project.project_id, permissions: ["goals:read", "goals:write"] }));
  try {
    await bound.invoke(goalsActions.create, { goal_id: "web-goal", title: "Web lifecycle", outcome: "Deliver the web work",
      requirements: [{ requirement_id: "delivered", statement: "The agreed result is available" }], idempotency_key: "create" });
    await host.withProject(ref, r => {
      insertHistoricalClaim(r.store.db, { claim_id: "old-claim", board_id: project.board_id, goal_id: "web-goal", actor_id: "old-runtime", state: "active", expires_at: "2099-01-01T00:00:00Z", released_at: null, release_reason: null });
      insertHistoricalRun(r.store.db, { run_id: "old-run", board_id: project.board_id, goal_id: "web-goal", claim_id: "old-claim", actor_id: "old-runtime", state: "started", ended_at: null });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, base = `${origin}/projects/${project.project_id}/api/goals/web-goal`;
    const request = (path: string, body: unknown, authorized = true) => fetch(base + path, { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body) });
    assert.equal((await request("/active", { reason: "Current" }, false)).status, 403);
    assert.equal((await request("/active", { reason: "Current" })).status, 200);
    const trash = { trashed: true, user_confirmed: true, reason: "User confirmed trash" };
    assert.equal((await request("/trash", { ...trash, user_confirmed: false })).status, 400);
    const blocked = await request("/trash", trash); assert.equal(blocked.status, 200);
    const blockedResult = await blocked.json() as { status: string; blocking_claim_ids: string[]; blocking_run_ids: string[] };
    assert.equal(blockedResult.status, "blocked"); assert.deepEqual(blockedResult.blocking_claim_ids, ["old-claim"]); assert.deepEqual(blockedResult.blocking_run_ids, ["old-run"]);
    assert.deepEqual((await bound.invoke(goalsActions.trashed, {})).goals, []);
    for (const [path, action, body] of [["/active", goalsActions.active, { reason: "Current" }], ["/archive", goalsActions.archive, { archived: true }], ["/trash", goalsActions.trash, trash]] as const) {
      denied.add(action.capability_id);
      const response = await request(path, body); assert.equal(response.status, 400); assert.match(await response.text(), /Lifecycle disabled/);
    }
    denied.clear();
    await host.withProject(ref, r => r.store.db.exec(`UPDATE claims SET state = 'released', released_at = '2026-09-25T00:00:00Z', release_reason = 'finished' WHERE claim_id = 'old-claim';
      UPDATE runs SET state = 'failed', ended_at = '2026-09-25T00:00:00Z', block_reason = 'finished' WHERE run_id = 'old-run';`));
    const saved = await request("/trash", trash); assert.equal(saved.status, 200);
    assert.equal((await saved.json() as { status: string }).status, "trashed");
    assert.equal((await bound.invoke(goalsActions.trashed, {})).goals[0]?.trashed_by, "web-user");
    const restored = await request("/trash", { ...trash, trashed: false }); assert.equal(restored.status, 200);
    assert.equal((await restored.json() as { status: string }).status, "restored");
    await recordDelivery(bound, "web-goal");
    const state = await bound.invoke(goalsActions.state, { goal_id: "web-goal" });
    const closed = await bound.invoke(goalsActions.close, { goal_id: "web-goal", kind: "complete", result: "Delivered the web work", reason: "Complete", expected_config_version: state.config.version,
      expected_agreement_version: state.agreement.version, idempotency_key: "close" });
    assert.equal(closed.work_status, "completed", JSON.stringify(closed));
    const archived = await request("/archive", { archived: true }); assert.equal(archived.status, 200, await archived.clone().text());
    assert.equal((await archived.json() as { goal: { archived_by: string } }).goal.archived_by, "web-user");
    assert.equal((await request("/archive", { archived: false })).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); }
});
