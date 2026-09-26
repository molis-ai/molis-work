import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, cachedMolisWorkWebView } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, readGoalEventStateCapability, listGoalEventsCapability, listLatestGoalEventsCapability,
  listLatestGoalTimelineCapability, readGoalEventCapability, projectResumeFactsCapability,
  snapshotBoardCapability, readGoalContractCapability } from "@molis-ai/molis-work-plugin-goals";
import { goalContextCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { bindActionClient, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { materializeGoalEventV35Fixture, goalEventV35Kinds } from "./goal-event-v35-fixture.js";
import { readTestGoalCollection } from "./fixtures/web-view.js";

test("Goals query actions preserve full bodies, cursor order, scope and live policy for typed consumers", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-query-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Queries", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  let denied: string | undefined;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    actionAvailability: (_caller, view) => view.capability_id === denied
      ? { available: false, code: "actions.plugin_disabled", reason: "当前查询已停用" } : { available: true } });
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "query-reader", audience: "user",
    project_id: project.project_id, permissions: ["goals:read", "goals:write"] }));
  const typed = host.client(ref), goal_id = "QUERY-GOAL", board_id = project.board_id;
  try {
    await actions.invoke(goalsActions.create, { goal_id, title: "保持原始记录", outcome: "分页能读到全部原文", idempotency_key: "create" });
    const noteIds: string[] = [];
    for (let i = 0; i < 4; i++) noteIds.push((await actions.invoke(goalsActions.note, {
      goal_id, body: `原文 ${i} <script>保留但转义</script>`, idempotency_key: `note-${i}`,
    })).event_id);
    const state = await actions.invoke(goalsActions.state, { goal_id });
    assert.equal(state.intent.title, "保持原始记录");
    assert.equal(state.agreement.outcome, "分页能读到全部原文");
    assert.equal(state.work_status, "open");
    const snapshot = await actions.invoke(goalsActions.snapshot, {});
    assert.deepEqual(snapshot, await host.withProject(ref, r => r.store.snapshot(board_id)));
    assert.deepEqual(await typed.invoke(snapshotBoardCapability, { board_id }), snapshot);
    const contract = await actions.invoke(goalsActions.contract, { goal_id });
    assert.deepEqual(contract, await host.withProject(ref, r => r.coordinator.goalQueries.readGoalContract(board_id, goal_id)));
    assert.deepEqual(await typed.invoke(readGoalContractCapability, { board_id, goal_id }), contract);
    const checkReadBoundary = async <Input, Output>(action: ActionDefinition<Input, Output>, input: Input) => {
      await assert.rejects(actions.invoke(action, { ...input, actor_id: "forged" } as never), { code: "actions.input_invalid" });
      await assert.rejects(host.actionClient(ref).invoke({ actor_id: "reader", audience: "mcp", project_id: ref.project_id, permissions: [] }, action, input), { code: "actions.forbidden" });
    };
    await checkReadBoundary(goalsActions.snapshot, {});
    await checkReadBoundary(goalsActions.contract, { goal_id });
    const collection = await actions.invoke(goalsActions.collection, {});
    assert.deepEqual(collection, await host.withProject(ref, r => readTestGoalCollection(r.store, r.coordinator, board_id)));
    assert.equal(collection.goals[0]?.goal.goal_id, goal_id);
    await checkReadBoundary(goalsActions.collection, {});
    await assert.rejects(typed.invoke(snapshotBoardCapability, { board_id: "foreign" }), { code: "actions.scope_mismatch" });
    await assert.rejects(typed.invoke(readGoalContractCapability, { board_id: "foreign", goal_id }), { code: "actions.scope_mismatch" });
    const document = await actions.invoke(goalsActions.document, { goal_id });
    assert.deepEqual(document.state, state);
    assert.equal(document.description.title, "保持原始记录");
    assert.equal(document.description.outcome, "分页能读到全部原文");
    assert.equal(document.timeline.items[0]?.event_id, noteIds.at(-1));
    assert.ok(document.planning_methods.length > 0);
    assert.deepEqual(document.transfer, { available: false, kind: null });
    await assert.rejects(actions.invoke(goalsActions.document, { goal_id: "MISSING" }));
    await assert.rejects(actions.invoke(goalsActions.document, { goal_id, board_id: "foreign" } as never), { code: "actions.input_invalid" });
    await assert.rejects(host.actionClient(ref).invoke({ actor_id: "query-reader", audience: "mcp", project_id: "foreign", permissions: ["goals:read"] },
      goalsActions.document, { goal_id }), { code: "actions.scope_mismatch" });
    assert.deepEqual(await typed.invoke(readGoalEventStateCapability, { board_id, goal_id }), state);
    const coding = await typed.invoke(goalContextCapabilities.read, { goal_id });
    assert.equal(coding.goal.goal_id, goal_id); assert.equal(coding.state.goal_event_cursor, state.goal_event_cursor);
    const directory = await actions.invoke(goalsActions.directoryItem, { goal_id });
    assert.equal(directory?.title, state.intent.title);
    assert.equal(await actions.invoke(goalsActions.directoryItem, { goal_id: "MISSING" }), null);
    const resumed = await typed.invoke(projectResumeFactsCapability, { board_id, focus_goal_ids: [goal_id] });
    assert.deepEqual(resumed.goals, [directory]);
    const ascending: string[] = [];
    let after_cursor: number | undefined;
    do {
      const page = await actions.invoke(goalsActions.events, { goal_id, limit: 2, ...(after_cursor === undefined ? {} : { after_cursor }) });
      assert.deepEqual(await typed.invoke(listGoalEventsCapability, { board_id, goal_id, limit: 2, after_cursor }), page);
      assert.ok(page.events.length <= 2);
      ascending.push(...page.events.map(event => event.event_id));
      after_cursor = page.next_cursor ?? undefined;
    } while (after_cursor !== undefined);
    assert.equal(new Set(ascending).size, ascending.length);
    assert.deepEqual(ascending.slice(-4), noteIds);
    const descending: string[] = [];
    let before_cursor: number | undefined;
    do {
      const page = await actions.invoke(goalsActions.latestEvents, { goal_id, limit: 2, ...(before_cursor === undefined ? {} : { before_cursor }) });
      assert.deepEqual(await typed.invoke(listLatestGoalEventsCapability, { board_id, goal_id, limit: 2, before_cursor }), page);
      descending.push(...page.events.map(event => event.event_id));
      before_cursor = page.next_cursor ?? undefined;
    } while (before_cursor !== undefined);
    assert.deepEqual(descending, ascending.toReversed());
    const timeline = await actions.invoke(goalsActions.timeline, { goal_id, limit: 2 });
    assert.deepEqual(timeline.items.map(item => item.event_id), noteIds.slice(-2).reverse());
    assert.deepEqual(await typed.invoke(listLatestGoalTimelineCapability, { board_id, goal_id, limit: 2 }), timeline);
    const event_id = noteIds[3]!;
    const event = await actions.invoke(goalsActions.event, { goal_id, event_id });
    assert.equal(event.actor_id, "query-reader");
    assert.deepEqual(event.payload, { operation: "observation_note", body: "原文 3 <script>保留但转义</script>" });
    assert.deepEqual(await typed.invoke(readGoalEventCapability, { board_id, goal_id, event_id }), event);
    const history = await actions.invoke(goalsActions.history, { goal_id, limit: 2 });
    assert.equal(history.items[0]?.item_id, event_id); assert.ok(history.next_cursor);
    const nextHistory = await actions.invoke(goalsActions.history, { goal_id, limit: 2, before_cursor: history.next_cursor });
    assert.equal(nextHistory.items.filter(item => history.items.some(first => first.item_id === item.item_id)).length, 0);
    const body = await actions.invoke(goalsActions.historyItem, { goal_id, item_id: event_id });
    assert.equal(body?.item.original_id, event_id);
    assert.match(body!.html, /原文 3 &lt;script&gt;保留但转义&lt;\/script&gt;/);
    assert.doesNotMatch(body!.html, /<script>/);
    assert.equal(await actions.invoke(goalsActions.historyItem, { goal_id, item_id: "MISSING" }), null);
    await actions.invoke(goalsActions.create, { goal_id: "OTHER-GOAL", title: "另一个目标", idempotency_key: "other" });
    await assert.rejects(actions.invoke(goalsActions.event, { goal_id: "OTHER-GOAL", event_id }));
    await assert.rejects(actions.invoke(goalsActions.events, { goal_id, limit: 101 }), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke(goalsActions.state, { goal_id, board_id: "foreign" } as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(readGoalEventStateCapability, { goal_id, board_id: "foreign" }), { code: "actions.scope_mismatch" });
    await assert.rejects(typed.invoke(projectResumeFactsCapability, { board_id: "foreign" }), { code: "actions.scope_mismatch" });
    denied = goalsActions.state.capability_id;
    await assert.rejects(typed.invoke(readGoalEventStateCapability, { board_id, goal_id }), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalContextCapabilities.read, { goal_id }), { code: "actions.plugin_disabled" });
    denied = goalsActions.list.capability_id;
    await assert.rejects(typed.invoke(projectResumeFactsCapability, { board_id }), { code: "actions.plugin_disabled" });
    denied = goalsActions.document.capability_id;
    await assert.rejects(actions.invoke(goalsActions.document, { goal_id }), { code: "actions.plugin_disabled" });
    denied = goalsActions.snapshot.capability_id;
    await assert.rejects(typed.invoke(snapshotBoardCapability, { board_id }), { code: "actions.plugin_disabled" });
    denied = goalsActions.contract.capability_id;
    await assert.rejects(typed.invoke(readGoalContractCapability, { board_id, goal_id }), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalContextCapabilities.read, { goal_id }), { code: "actions.plugin_disabled" });
    denied = goalsActions.collection.capability_id;
    await assert.rejects(actions.invoke(goalsActions.collection, {}), { code: "actions.plugin_disabled" });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("query contracts retain migrated completion, human requirements and original v35 event payloads", async () => {
  for (const kind of goalEventV35Kinds) {
    const fixture = materializeGoalEventV35Fixture(kind);
    const host = new MolisWorkLocalHost({ homeDirectory: fixture.directory, completeText: null });
    const ref = molisWorkHostProjectReference({ databasePath: fixture.path, boardId: "goalboard-v1-demo" });
    const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "migration-reader", audience: "user",
      project_id: ref.project_id, permissions: ["goals:read"] }));
    try {
      const snapshot = await actions.invoke(goalsActions.snapshot, {});
      assert.deepEqual(snapshot, await host.withProject(ref, r => r.store.snapshot(ref.board_id)));
      assert.ok(snapshot.claims.length > 0);
      assert.ok(snapshot.runs.length > 0);
      assert.ok(snapshot.evidence.length > 0);
      const collection = await actions.invoke(goalsActions.collection, {});
      assert.deepEqual(collection, await host.withProject(ref, r => readTestGoalCollection(r.store, r.coordinator, ref.board_id)));
      assert.deepEqual(await actions.invoke(goalsActions.snapshot, {}), snapshot, "collection reads must not write history or attention");
      for (const goal of snapshot.goals) {
        assert.deepEqual(await actions.invoke(goalsActions.contract, { goal_id: goal.goal_id }),
          await host.withProject(ref, r => r.coordinator.goalQueries.readGoalContract(ref.board_id, goal.goal_id)));
      }
      const core = await actions.invoke(goalsActions.state, { goal_id: "CORE" });
      assert.equal(core.work_status, "completed");
      assert.equal(core.imported_completion?.historical.journal_type, "goal.satisfied");
      assert.ok(core.imported_completion!.historical.evidence_ids.length > 0);
      assert.equal(core.closure, null);
      const human = await actions.invoke(goalsActions.state, { goal_id: "OLD-HUMAN" });
      assert.equal(human.requirements.find(item => item.requirement_id === "OLD-HUMAN-C1")?.human_decision_required, true);
      const directory = await actions.invoke(goalsActions.list, { limit: 100 });
      for (const goal of directory.goals) {
        const state = await actions.invoke(goalsActions.state, { goal_id: goal.goal_id });
        const document = await actions.invoke(goalsActions.document, { goal_id: goal.goal_id });
        assert.deepEqual(document.state, state);
        assert.equal(document.description.title, goal.title);
        if (goal.goal_id === "CORE") {
          assert.equal(document.transfer.kind, "reopen_event_completed");
          assert.ok(document.timeline.items.some(item => item.source !== "event_work"), "migrated history remains in the document");
        }
        assert.equal(state.work_status, goal.work_status);
        const page = await actions.invoke(goalsActions.events, { goal_id: goal.goal_id, limit: 100 });
        for (const event of page.events) {
          assert.equal(event.board_id, ref.board_id); assert.equal(event.goal_id, goal.goal_id);
          if (event.kind === "report") assert.ok(Object.values(event.payload).every(value => typeof value === "string"));
        }
      }
    } finally { await host.close(); await rm(fixture.directory, { recursive: true, force: true }); }
  }
});


test("Web cache keeps the cursor of its authorized collection when a write lands before composition", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-collection-cache-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Cache", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "cache-user", audience: "user", project_id: project.project_id,
    permissions: ["goals:read", "goals:write"] }));
  try {
    await actions.invoke(goalsActions.create, { goal_id: "before", title: "原目标", idempotency_key: "before" });
    const runtime = await host.withProject(ref, r => r);
    let interleave = true;
    const delayed: BoundActionClient = { discover: actions.discover, async invoke(definition, input) {
      const result = await actions.invoke(definition, input);
      if (interleave) {
        interleave = false;
        await actions.invoke(goalsActions.create, { goal_id: "after", title: "读取期间新增", idempotency_key: "after" });
      }
      return result;
    } };
    const cache = new Map(), options = { databasePath: project.database_path, boardId: project.board_id, homeDirectory: home };
    const first = await cachedMolisWorkWebView(cache, runtime.store, options, delayed);
    assert.equal(first.goals.some(item => item.goal.goal_id === "after"), false);
    const next = await cachedMolisWorkWebView(cache, runtime.store, options, delayed);
    assert.equal(next.goals.some(item => item.goal.goal_id === "after"), true);
    assert.ok(next.snapshot.cursor > first.snapshot.cursor);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
