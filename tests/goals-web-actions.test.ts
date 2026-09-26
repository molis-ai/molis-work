import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, MolisWorkCasebookIntegration, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { InteractionJournal } from "../apps/local-host/src/casebook/journal.js";
import { PURPOSE, VERSION } from "../apps/local-host/src/casebook/contract.js";

test("Web Goals use shared actions and record resolved results exactly once across async policy and replay", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-web-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Web Goals", actor_id: "user" }));
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const seen: string[] = [];
  const deniedQueries = new Set<string>();
  let gate: Promise<void> | undefined, enter: (() => void) | undefined, release: (() => void) | undefined;
  let gateAction = "goals.note";
  let denied = false, pending: Promise<Response> | undefined;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: async (_caller, action) => {
    if (action.capability_id.startsWith("goals.")) seen.push(action.capability_id);
    if (action.capability_id === gateAction && gate) { enter!(); await gate; }
    if (deniedQueries.has(action.capability_id)) return { available: false, code: "actions.plugin_disabled", reason: "动作已停用" };
    if (action.capability_id === "goals.note") {
      if (denied) return { available: false, code: "actions.plugin_disabled", reason: "便笺已停用" };
    }
    return { available: true };
  } });
  const casebook = new MolisWorkCasebookIntegration({ client: host.client(reference), verifyUserAction: () => true });
  await casebook.setInteractionAuthorization({ project_ref: project.project_id, purpose: PURPOSE, action: "join",
    actor_ref: "fixture-owner", user_action_ref: "isolated-fixture", user_confirmed: true, idempotency_key: "join" });
  const facts = () => host.withProject(reference, runtime => {
    const journal = new InteractionJournal(runtime.store.db, project.board_id, project.project_id);
    const epoch = journal.authorization().authorization_epoch; assert.ok(epoch);
    return journal.read({ project_ref: project.project_id, schema_version: VERSION, authorization_epoch: epoch, after_cursor: 0, limit: 100 }).facts;
  });
  const token = "goals-web-actions-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, base = `${origin}/projects/${project.project_id}`;
    const request = (path: string, body?: unknown, authorized = true) => fetch(base + path, body === undefined ? {} : {
      method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body),
    });
    const input = { title: "网页真实目标", goal_id: "WEB-ACTION-GOAL", idempotency_key: "web-create" };
    assert.equal((await request("/api/goals", input, false)).status, 403);
    assert.equal((await facts()).length, 0);
    let response = await request("/api/goals", input);
    assert.equal(response.status, 201, await response.clone().text());
    const created = await response.json() as { goal: { goal_id: string }; goal_path: string; replayed: boolean };
    assert.equal(created.goal.goal_id, input.goal_id);
    assert.equal(created.goal_path, `/projects/${project.project_id}/goals/${input.goal_id}`);
    const batch = await facts();
    assert.equal(batch.length, 2); assert.ok(batch.every(fact => fact.channel === "web.goal-events.v1"));
    assert.equal(batch[1]!.outcome, "returned"); assert.ok(batch[1]!.saved?.goal_ref);
    const notePath = `/api/goals/${input.goal_id}/event-note`;
    const noteInput = { note: "便笺原文不能丢", idempotency_key: "web-note" };
    const entered = new Promise<void>(resolve => { enter = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    pending = request(notePath, noteInput);
    await Promise.race([entered, pending.then(() => { throw new Error("HTTP returned before the action policy checkpoint"); })]);
    const waiting = (await facts()).filter(fact => fact.capability.endsWith(".note"));
    assert.equal(waiting.length, 1, "a pending Promise must not be recorded as a completed result");
    assert.equal(waiting[0]!.kind, "attempt"); assert.equal(waiting[0]!.outcome, "pending");
    release!(); response = await pending; pending = undefined; gate = undefined;
    assert.equal(response.status, 200, await response.clone().text());
    const recorded = await response.json() as { event_id: string; recorded: boolean; replayed: boolean };
    assert.equal(recorded.recorded, true); assert.equal(recorded.replayed, false); assert.ok(recorded.event_id);
    let notes = (await facts()).filter(fact => fact.capability.endsWith(".note"));
    assert.equal(notes.length, 2); assert.equal(notes[1]!.saved?.event_refs.length, 1);
    assert.equal(notes[1]!.outcome, "returned"); assert.equal(notes[0]!.operation_id, notes[1]!.operation_id);
    const stored = await host.withProject(reference, runtime => runtime.coordinator.goalEvents.readEvent(project.board_id, input.goal_id, recorded.event_id));
    assert.equal((stored.payload as { body: string }).body, noteInput.note);
    assert.equal(stored.actor_id, "web-user"); assert.equal(stored.actor_kind, "user");
    response = await request(notePath, noteInput);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...recorded, replayed: true });
    notes = (await facts()).filter(fact => fact.capability.endsWith(".note"));
    assert.equal(notes.length, 4); assert.equal(notes[3]!.replayed, true);
    response = await request("/api/capsule");
    assert.equal(response.status, 200, await response.clone().text());
    const capsule = await response.json() as { tabs: Array<{ items: Array<{ goal_id: string; goal_title: string }> }> };
    assert.ok(capsule.tabs.flatMap(tab => tab.items).some(goal => goal.goal_id === input.goal_id && goal.goal_title === input.title));
    assert.ok(seen.includes("goals.create") && seen.includes("goals.note") && seen.includes("goals.list"), "all three Web consumers must reach the shared action policy");
    const reads = (await facts()).filter(fact => fact.capability.endsWith(".list-goals"));
    assert.equal(reads.length, 2); assert.equal(reads[1]!.saved, null);
    const queries = [
      ["goals.state.read", `/api/goals/${input.goal_id}/event-state`, "read-state"],
      ["goals.events.read", `/api/goals/${input.goal_id}/events/${recorded.event_id}`, "read"],
      ["goals.history.list", `/api/goals/${input.goal_id}/event-timeline?limit=999`, "timeline"],
      ["goals.history.read", `/api/goals/${input.goal_id}/history/${recorded.event_id}`, "read"],
    ] as const;
    for (const [capability, path, observedSuffix] of queries) {
      const before = (await facts()).length;
      const result = await request(path);
      assert.equal(result.status, 200, await result.clone().text());
      assert.ok(seen.includes(capability), `${capability} must use shared action policy`);
      const added = (await facts()).slice(before);
      assert.equal(added.length, 2, "composite history reads must not duplicate internal observations");
      assert.ok(added.every(fact => fact.channel === "web.goal-events.v1" && fact.capability.endsWith(`.${observedSuffix}`)));
      assert.equal(added[1]!.outcome, "returned"); assert.equal(added[1]!.saved, null);
      deniedQueries.add(capability);
      const deniedRead = await request(path);
      assert.equal(deniedRead.status, 400);
      assert.equal((await deniedRead.json() as { code: string }).code, "actions.plugin_disabled");
      deniedQueries.delete(capability);
    }
    assert.equal((await request(`/api/goals/${input.goal_id}/history/MISSING`)).status, 404);
    for (const invalidLimit of ["0", "-1", "abc"]) {
      assert.equal((await request(`/api/goals/${input.goal_id}/event-timeline?limit=${invalidLimit}`)).status, 200,
        "legacy Web pagination keeps its default for invalid limits");
    }
    const configured = await request(`/api/goals/${input.goal_id}/event-configure`, { expected_version: 0, idempotency_key: "web-config",
      types: [{ type_id: "work", version: 1, name: "交付", purpose: "记录实际工作", fields: [{ field_id: "body", name: "正文", purpose: "原文", format: "text", required: true }] }] });
    assert.equal(configured.status, 200, await configured.clone().text());
    gateAction = "goals.events.report";
    const reportEntered = new Promise<void>(resolve => { enter = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    pending = request(`/api/goals/${input.goal_id}/event-report`, { idempotency_key: "web-report", events: [{ type_id: "work", type_version: 1,
      title: "网页报告", fields: { body: "实际报告原文" } }] });
    await Promise.race([reportEntered, pending.then(() => { throw new Error("Report returned before policy checkpoint"); })]);
    const reportsWhilePending = (await facts()).filter(fact => fact.capability.endsWith(".report"));
    assert.equal(reportsWhilePending.length, 1); assert.equal(reportsWhilePending[0]!.outcome, "pending");
    release!(); response = await pending; pending = undefined; gate = undefined; gateAction = "goals.note";
    assert.equal(response.status, 200, await response.clone().text());
    const reported = await response.json() as { events: Array<{ actor_id: string; payload: { body: string } }> };
    assert.equal(reported.events[0]?.actor_id, "web-user"); assert.equal(reported.events[0]?.payload.body, "实际报告原文");
    const reports = (await facts()).filter(fact => fact.capability.endsWith(".report"));
    assert.equal(reports.length, 2); assert.equal(reports[1]!.saved?.event_refs.length, 1); assert.equal(reports[1]!.outcome, "returned");
    const decisionPath = `/api/goals/${input.goal_id}/event-decision`;
    const decisionInput = { idempotency_key: "web-decision", conclusion: "用户明确允许发布", effects: [{ kind: "authorize_action", action: "publish" }], scope: { action: "publish" } };
    assert.equal((await request(decisionPath, decisionInput, false)).status, 403);
    assert.equal((await request(decisionPath, { ...decisionInput, authority: { actor_id: "forged" } })).status, 400);
    gateAction = "goals.decisions.record";
    const decisionEntered = new Promise<void>(resolve => { enter = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    pending = request(decisionPath, decisionInput);
    await Promise.race([decisionEntered, pending.then(() => { throw new Error("Decision bypassed shared policy"); })]);
    let decisions = (await facts()).filter(fact => fact.capability.endsWith(".decide"));
    assert.equal(decisions.length, 1); assert.equal(decisions[0]!.outcome, "pending");
    release!(); response = await pending; pending = undefined; gate = undefined;
    assert.equal(response.status, 200, await response.clone().text());
    const decision = await response.json() as { event_id: string; replayed: boolean; decision: { actor_id: string; authority_source: string } };
    assert.equal(decision.decision.actor_id, "web-user"); assert.equal(decision.decision.authority_source, "web");
    assert.equal(decision.replayed, false);
    decisions = (await facts()).filter(fact => fact.capability.endsWith(".decide"));
    assert.equal(decisions.length, 2); assert.equal(decisions[1]!.outcome, "returned"); assert.equal(decisions[1]!.saved?.event_refs.length, 1);
    response = await request(decisionPath, decisionInput);
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), { ...decision, replayed: true });
    decisions = (await facts()).filter(fact => fact.capability.endsWith(".decide"));
    assert.equal(decisions.length, 4); assert.equal(decisions[3]!.replayed, true);
    const decisionDeniedEntered = new Promise<void>(resolve => { enter = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    pending = request(decisionPath, { ...decisionInput, idempotency_key: "disabled-decision" });
    await Promise.race([decisionDeniedEntered, pending.then(() => { throw new Error("Decision bypassed policy wait"); })]);
    deniedQueries.add(gateAction); release!(); response = await pending; pending = undefined; gate = undefined; gateAction = "goals.note";
    assert.equal(response.status, 400);
    decisions = (await facts()).filter(fact => fact.capability.endsWith(".decide"));
    assert.equal(decisions.length, 6); assert.equal(decisions[5]!.outcome, "threw"); assert.equal(decisions[5]!.saved, null);
    const deniedEntered = new Promise<void>(resolve => { enter = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    pending = request(notePath, { note: "等待中停用，不应保存", idempotency_key: "denied-note" });
    await Promise.race([deniedEntered, pending.then(() => { throw new Error("HTTP returned before the action policy checkpoint"); })]);
    denied = true; release!(); response = await pending; pending = undefined; gate = undefined;
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, "actions.plugin_disabled");
    notes = (await facts()).filter(fact => fact.capability.endsWith(".note"));
    assert.equal(notes.length, 6); assert.equal(notes[5]!.outcome, "threw"); assert.equal(notes[5]!.saved, null);
    const events = await host.withProject(reference, runtime => runtime.coordinator.goalEvents.listEvents(project.board_id, input.goal_id));
    assert.equal(events.events.filter(event => event.kind === "system" && event.payload.operation === "observation_note").length, 1);
    assert.equal(events.events.filter(event => event.kind === "system" && event.payload.operation === "user_decision").length, 1);
  } finally {
    release?.(); await pending?.catch(() => undefined);
    await new Promise<void>(resolve => server.close(() => resolve())); await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
