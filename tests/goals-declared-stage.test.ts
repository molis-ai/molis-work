import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { openTestHome } from "./fixtures/test-home.js";

test("RAC-2682 Goals owns the canvas markup and the shell has no Goals renderer import", () => {
  const shell = readFileSync(new URL("../apps/workbench/src/shell-page-renderer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /goal-canvas-shell|buildGoalCollectionModel|molis-work-plugin-goals/u);
});

test("RAC-2682 the declared stage action reads the real project collection and selected document without writes", async t => {
  const served = await openTestHome(t);
  const project = await served.createProject("Goals stage");
  const response = await fetch(`${served.origin}/projects/${project.project_id}/api/plugins/io.molis.work.goals/goals`, {
    method: "POST", headers: { origin: served.origin, "content-type": "application/json", "x-molis-work-control-token": served.controlToken,
      "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ title: "Declared stage selection", idempotency_key: randomUUID() }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const { goal } = await response.json() as { goal: { goal_id: string } };
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id: project.project_id, permissions: ["goals:read"] };
  const actions = bindActionClient(served.host.actionClient(project.reference), () => caller);
  const before = await actions.invoke(goalsActions.collection, {});
  const document = await actions.invoke(goalsActions.document, { goal_id: goal.goal_id });
  const stage = await actions.invoke(goalsActions.stage, { goal_id: goal.goal_id });
  assert.deepEqual(stage.collection, before);
  assert.deepEqual(stage.selected, { goal_id: goal.goal_id, document });
  assert.equal(stage.selection, "current");
  assert.deepEqual(await actions.invoke(goalsActions.collection, {}), before, "reading the stage leaves the owner facts unchanged");
  assert.equal((await actions.invoke(goalsActions.stage, { goal_id: "missing-stage-goal" })).selected, null);
  assert.equal((await actions.invoke(goalsActions.stage, { goal_id: goal.goal_id, collection: "trash" })).selected, null,
    "a Goal outside the requested collection is not selected; the page route supplies its original 404 body");
  const untrusted = { goal_id: goal.goal_id, project_id: "another-project", actor_id: "another-person" };
  await assert.rejects(actions.invoke(goalsActions.stage, untrusted), "request input cannot replace the trusted scope or actor");
  const other = await served.createProject("Other Goals stage");
  const otherActions = bindActionClient(served.host.actionClient(other.reference), () => ({ ...caller, project_id: other.project_id }));
  const outside = await otherActions.invoke(goalsActions.stage, { goal_id: goal.goal_id });
  assert.equal(outside.selected, null);
  assert.equal(outside.collection.goals.some(item => item.goal.goal_id === goal.goal_id), false);
  const denied = bindActionClient(served.host.actionClient(project.reference), () => ({ ...caller, permissions: [] }));
  await assert.rejects(denied.invoke(goalsActions.stage, { goal_id: goal.goal_id }));
  const pageResponse = await fetch(`${served.origin}/projects/${project.project_id}/goals/${goal.goal_id}`);
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  assert.equal((html.match(/data-goal-canvas-shell(?=[\s>])/g) ?? []).length, 1, "the actual Runtime stage is not drawn again from the catalog");
  assert.match(html, /<title>Declared stage selection · Molis Work<\/title>/);
  assert.match(html, /data-desktop-surface="goals"/);
  assert.match(html, /data-board-view="current"/);
  const at = (marker: string) => { const found = html.indexOf(marker); assert.ok(found >= 0, marker); return found; };
  assert.ok(at('id="molis-work-data"') < at('/assets/molis-work-workbench.js'));
});
