import assert from "node:assert/strict";
import test from "node:test";
import { GoalsQueryService, GoalsRepository } from "@molis-ai/molis-work-module-goals";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { importV3Board } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("V3 imported Goal keeps coverage visible and records a current browser note after reopen and refresh", { timeout: 60_000 }, async t => {
  let path = "";
  const browser = await openGoalBrowser(t, false, databasePath => {
    path = databasePath;
    const store = new LocalProjectDatabase(path);
    try {
      importV3Board(store, new GoalProjectApplication(store), {
        schema_version: "3.0", goal_id: "old", meta: { title: "历史项目" }, root_goal: { constraints: ["无损"] },
        goals: [{ id: "child", parent: null, one_liner: "历史目标", covers: ["keep"], inputs: ["历史输入"], outputs: ["历史输出"] }],
        coverage_ledger: [{ id: "keep", requirement: "迁移后保留需求覆盖", status: "now", owner_goal: "child", reason: "历史确认理由" }],
      }, { target_board_id: DEMO_BOARD_ID, actor_id: "original-user", idempotency_key: "browser-v3-import" });
    } finally { store.close(); }
  });
  if (!browser) return;
  const { store, before, origin, sessionId, command, navigate, evaluate, click, waitFor, reloadPage } = browser;
  const goalId = before.goals.find(goal => goal.title === "历史目标")!.goal_id;
  const query = new GoalsQueryService(new GoalsRepository(store.db));
  const coverage = query.listLegacyCoverage(DEMO_BOARD_ID);
  const noteBody = "导入后即可继续记录";
  const noteForm = '[data-event-form="note"]';
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + encodeURIComponent(goalId) }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]:not([hidden])')");
  await click('[data-goal-event-document]:not([hidden]) [data-event-reader="description"]');
  await waitFor("document.querySelector('[data-event-panel=\"description\"]')?.hidden === false");
  assert.match(await evaluate<string>("document.querySelector('[data-event-panel=\"description\"]').textContent"), /迁移后保留需求覆盖[\s\S]*历史确认理由/);
  await reloadPage();
  await waitFor("document.querySelector('[data-goal-event-document]:not([hidden])')");
  await click('[data-goal-event-document]:not([hidden]) [data-event-reader="description"]');
  await waitFor("document.querySelector('[data-event-panel=\"description\"]')?.hidden === false");
  assert.match(await evaluate<string>("document.querySelector('[data-event-panel=\"description\"]').textContent"), /迁移后保留需求覆盖/);
  await click('[data-goal-event-document]:not([hidden]) [data-event-form-open="note"]');
  await waitFor(`document.querySelector('${noteForm}')?.hidden === false`);
  const beforeCursor = await evaluate<number>("Number(document.querySelector('[data-goal-event-document]:not([hidden])')?.dataset.goalEventCursor || 0)");
  await evaluate(`(() => { const field = document.querySelector('${noteForm} [name="note"]');
    if (!field) throw new Error("Missing note field");
    field.value = ${JSON.stringify(noteBody)};
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true; })()`);
  await click(`${noteForm} button[type="submit"]`);
  try {
    await waitFor(`Number(document.querySelector('[data-goal-event-document]:not([hidden])')?.dataset.goalEventCursor) > ${beforeCursor}`);
  } catch (error) {
    throw new Error(`note save failed: ${await evaluate(`JSON.stringify({status:document.querySelector('${noteForm} [data-form-status]')?.textContent,invalid:Array.from(document.querySelectorAll('${noteForm} :invalid')).map(e=>e.name)})`)} ${error}`);
  }
  assert.match(
    await evaluate<string>("Array.from(document.querySelectorAll('[data-goal-event-document]:not([hidden]) [data-timeline-item]')).map(item => item.textContent).join('\\n')"),
    /导入后即可继续记录/,
  );
  assert.equal(query.getGoal(DEMO_BOARD_ID, goalId)!.title, "历史目标");
  assert.equal(query.getGoal(DEMO_BOARD_ID, goalId)!.definition_state, "draft");
  assert.deepEqual(query.listLegacyCoverage(DEMO_BOARD_ID), coverage);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).relations, before.relations);
  await reloadPage();
  await waitFor("document.querySelector('[data-goal-event-document]:not([hidden])')");
  await click('[data-goal-event-document]:not([hidden]) [data-event-reader="description"]');
  await waitFor("document.querySelector('[data-event-panel=\"description\"]')?.hidden === false");
  assert.match(await evaluate<string>("document.querySelector('[data-event-panel=\"description\"]').textContent"), /迁移后保留需求覆盖/);
  assert.match(
    await evaluate<string>("Array.from(document.querySelectorAll('[data-goal-event-document]:not([hidden]) [data-timeline-item]')).map(item => item.textContent).join('\\n')"),
    /导入后即可继续记录/,
  );
  const reopened = new LocalProjectDatabase(path);
  try {
    const persisted = new GoalsQueryService(new GoalsRepository(reopened.db));
    const reopenedApp = new GoalProjectApplication(reopened);
    assert.equal(persisted.getGoal(DEMO_BOARD_ID, goalId)!.title, "历史目标");
    assert.deepEqual(persisted.listLegacyCoverage(DEMO_BOARD_ID), coverage);
    assert.match(JSON.stringify(reopenedApp.goalEvents.listEvents(DEMO_BOARD_ID, goalId, { limit: 100 })), /导入后即可继续记录/);
  } finally { reopened.close(); }
});
