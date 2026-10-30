import assert from "node:assert/strict";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

function seedEmptyBoard(databasePath: string, projectId = ""): void {
  const store = new LocalProjectDatabase(databasePath);
  try {
    new GoalProjectApplication(store).initializeBoard({
      project_id: projectId,
      actor_id: "browser-test",
      idempotency_key: "empty-goal-create-board",
    });
    store.checkpoint();
  } finally {
    store.close();
  }
}

// EGCD-01, EGCD-02, EGCD-03: an empty current Goal list opens the existing create dialog on entry.

async function post(origin: string, path: string, body: object, key: string) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin,
      "x-molis-work-control-token": "goals-risk-test-control-token-0123456789",
      "x-molis-work-idempotency-key": key },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, await response.text());
}

test("EGCD-01 EGCD-02 EGCD-03 empty Goals opens the create dialog, a closed dialog stays closed, and a Goal suppresses it", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "user", seedEmptyBoard);
  if (!browser) return;
  const { origin, projectId, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  assert.ok(projectId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const home = `${origin}/projects/${projectId}/`;
  await navigate(() => command("Page.navigate", { url: home }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('[data-plugin-strip] [data-plugin-id=\"goals\"]')");
  assert.equal(await evaluate("document.querySelector('[data-create-dialog]')?.open"), false, "home does not open the dialog");

  const dialogOpen = "document.querySelector('[data-create-dialog]')?.open === true && document.activeElement?.name === 'title'";
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor(dialogOpen);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "goals");

  await click("[data-create-dialog] [data-close-create]");
  await waitFor("document.querySelector('[data-create-dialog]')?.open === false && document.body.dataset.desktopSurface === 'goals'");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelector('[data-create-dialog]').open"), false, "closing the dialog stays on Goals");

  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('[data-create-dialog]')?.open === false");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor(dialogOpen);

  await click("[data-create-dialog] [data-close-create]");
  await waitFor("document.querySelector('[data-create-dialog]')?.open === false");
  await post(origin, `/projects/${projectId}/api/plugins/io.molis.work.goals/goals`, {
    title: "已经有一条", idempotency_key: "empty-goal-create-existing",
  }, "empty-goal-create-existing");
  await navigate(() => command("Page.navigate", { url: home }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.body.textContent.includes('已经有一条')");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelector('[data-create-dialog]').open"), false, "a Goal already in the list does not open the dialog");
});
