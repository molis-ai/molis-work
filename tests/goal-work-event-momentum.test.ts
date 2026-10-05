import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog, renderDesktopCapsuleShell } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, buildMolisWorkWebView, createLocalHostCapsule } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, buildGoalMomentumView, goalMomentumInput } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

const { buildCapsuleSnapshot } = createLocalHostCapsule(renderDesktopCapsuleShell);

test("reported work and an applied closure reach momentum activity, completion cadence and the capsule", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-work-event-momentum-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Momentum", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:momentum", audit_actor_id: "runtime:momentum:session",
    actor_kind: "runtime", audience: "agent", project_id: project.project_id, permissions: ["goals:read", "goals:write"] }));
  const recordWork = async (goal_id: string, title: string) => {
    await actions.invoke(goalsActions.create, { goal_id, title, outcome: `${title}有可读的交付`, idempotency_key: `${goal_id}:create`,
      requirements: [{ requirement_id: `${goal_id}:delivered`, statement: "交付正文已记录" }] });
    await actions.invoke(goalsActions.configure, { goal_id, expected_version: 0, idempotency_key: `${goal_id}:configure`,
      types: [{ type_id: "work", version: 1, name: "交付", purpose: "保留工作事实",
        fields: [{ field_id: "body", name: "正文", purpose: "原文", format: "longtext" as const, required: true }] }],
      requirement_bindings: [{ type_id: "work", requirement_id: `${goal_id}:delivered` }] });
    const reported = await actions.invoke(goalsActions.report, { goal_id, idempotency_key: `${goal_id}:report`, events: [{ type_id: "work",
      type_version: 1, title: "交付正文", fields: { body: `${title}的正文` }, judgments: [{ requirement_id: `${goal_id}:delivered`, verdict: "supports" as const }] }] });
    return reported.events[0]!.event_id;
  };
  try {
    const reportId = await recordWork("WORKING-GOAL", "只记录工作");
    await recordWork("DONE-GOAL", "记录并完成");
    const state = await actions.invoke(goalsActions.state, { goal_id: "DONE-GOAL" });
    const closed = await actions.invoke(goalsActions.close, { goal_id: "DONE-GOAL", kind: "complete", result: "交付已完成",
      reason: "唯一要求已有支持", idempotency_key: "DONE-GOAL:close",
      expected_config_version: state.config.version, expected_agreement_version: state.agreement.version });
    assert.equal(closed.completion_applied, true);
    const closedAt = closed.closure.recorded_at;

    const collection = await actions.invoke(goalsActions.collection, {});
    const item = (goalId: string) => collection.goals.find(candidate => candidate.goal.goal_id === goalId)!;
    assert.ok(item("WORKING-GOAL").events.some(event => event.event_id === reportId), "a work event belongs to the Goal it was reported on");
    assert.ok(!item("DONE-GOAL").events.some(event => event.event_id === reportId), "a work event is not attached to another Goal");
    assert.ok(item("DONE-GOAL").events.some(event => event.event_id === closed.event_id));

    const now = new Date(Date.parse(closedAt) + 1_000);
    const momentum = buildGoalMomentumView(collection.goals.map(goalMomentumInput), collection.snapshot.relations, undefined, now);
    const node = (goalId: string) => momentum.nodes.find(candidate => candidate.goal_id === goalId)!;
    assert.equal(node("WORKING-GOAL").history_sufficient, true, "reported work is Goal activity");
    assert.equal(node("DONE-GOAL").completed, true);
    const week = momentum.cadence[7];
    assert.deepEqual({ started: week.started, completed: week.completed, incomplete: week.history_incomplete },
      { started: 2, completed: 1, incomplete: 0 });
    assert.equal(week.buckets.find(bucket => bucket.date === closedAt.slice(0, 10))?.completed, 1);

    const view = await host.withProject(ref, runtime => buildMolisWorkWebView(runtime.store, collection, { databasePath: project.database_path,
      boardId: project.board_id, project: { project_id: project.project_id, display_name: "Momentum" }, routePrefix: `/projects/${project.project_id}` }));
    const directory = (await actions.invoke(goalsActions.list, { limit: 100 })).goals;
    const completedTab = (at: Date) => buildCapsuleSnapshot(view, directory, at).tabs.find(tab => tab.kind === "completed")?.items ?? [];
    assert.deepEqual(completedTab(now).map(entry => [entry.goal_id, entry.status_since]), [["DONE-GOAL", closedAt]]);
    assert.deepEqual(completedTab(new Date(Date.parse(closedAt) + 60_000)), [], "the completion shows only briefly");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
