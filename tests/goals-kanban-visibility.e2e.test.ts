import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

test("a desktop Kanban opens its columns after data refreshes while the board is hidden", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, click, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  await click('[data-board-view-tab="list"]');
  await waitFor("document.querySelector('[data-goal-kanban]').clientWidth === 0");
  const app = new GoalProjectApplication(browser.store);
  const created = app.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, title: "隐藏期间新增的工作", outcome: "显示看板后可以读到卡片",
    actor_id: "kanban-test", actor_kind: "user", idempotency_key: "hidden-desktop" }).goal;
  const selector = `[data-goal-kanban] [data-goal-id="${created.goal_id}"]`;
  // The real visible-page poll reloads the graph and hidden Kanban from the changed project.
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`, 15_000);
  assert.equal(await evaluate("document.querySelector('[data-goal-kanban]').clientWidth"), 0);
  await click('[data-board-view-tab="kanban"]');
  await waitFor("document.querySelector('[data-goal-kanban]').clientWidth > 839");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-kanban-group]')].every(group => group.open)"), true);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })`);
  const pointer = await evaluate<{ open: boolean; height: number; hit: boolean; geometry: unknown }>(`(() => { const card = document.querySelector(${JSON.stringify(selector)}); const r = card.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + 12, r.y + 12); return { open: card.closest('details').open, height: r.height, hit: card.contains(target),
      geometry: { rect: r.toJSON(), target: target?.outerHTML.slice(0, 300), cards: card.parentElement.getBoundingClientRect().toJSON() } }; })()`);
  assert.ok(pointer.open && pointer.height > 0 && pointer.hit, JSON.stringify(pointer));
});

test("a phone Kanban preserves a person's folded column through hidden refresh and reopening", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, click, evaluate, waitFor } = browser;
  const app = new GoalProjectApplication(browser.store);
  app.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, title: "手机上待处理的工作", outcome: "保留人选的折叠状态",
    actor_id: "kanban-test", actor_kind: "user", idempotency_key: "phone-before" });
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  await click('[data-board-view-tab="kanban"]');
  const group = '[data-kanban-column="continue"] [data-kanban-group]';
  if (!await evaluate(`document.querySelector(${JSON.stringify(group)}).open`)) await click(`${group} > summary`);
  await waitFor(`document.querySelector(${JSON.stringify(group)}).open`);
  await click(`${group} > summary`);
  await waitFor(`!document.querySelector(${JSON.stringify(group)}).open`);
  await click('[data-board-view-tab="list"]');
  await waitFor("document.querySelector('[data-goal-kanban]').clientWidth === 0");
  const created = app.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, title: "折叠后新增的工作", outcome: "刷新不替人展开",
    actor_id: "kanban-test", actor_kind: "user", idempotency_key: "phone-after" }).goal;
  await waitFor(`document.querySelector('[data-goal-kanban] [data-goal-id="${created.goal_id}"]')`, 15_000);
  await click('[data-board-view-tab="kanban"]');
  await waitFor("document.querySelector('[data-goal-kanban]').clientWidth > 0");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).open`), false);
  await click(`${group} > summary`);
  await waitFor(`document.querySelector(${JSON.stringify(group)}).open`);
  assert.equal(await evaluate(`document.querySelector('[data-goal-kanban] [data-goal-id="${created.goal_id}"]').getBoundingClientRect().height > 0`), true);
});
