import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

async function post(origin: string, path: string, body: object, key: string) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin,
      "x-molis-work-control-token": "goals-risk-test-control-token-0123456789",
      "x-molis-work-idempotency-key": key },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, await response.text());
}

async function addGoal(origin: string, goalId: string) {
  await post(origin, "/api/goals", {
    goal_id: goalId, title: goalId, outcome: "Appear after another user's update",
    why: "Exercise refresh against real changed state", business_logic: "Read the new Goal without starting work",
    priority: 10, acceptance_criteria: ["The updated directory is visible"],
  }, "refresh-create-" + goalId);
}

test("background refresh follows external archive and restore without changing the Goal or execution history", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, navigate } = browser;
  await navigate(() => command("Page.navigate", { url: origin + "/goals/CORE" }, sessionId));
  for (const archived of [true, false]) {
    await post(origin, "/api/goals/CORE/archive", { archived, reason: "Another user's archive action" }, "refresh-archive-" + archived);
    const afterExternalWrite = store.snapshot(DEMO_BOARD_ID);
    await navigate(() => evaluate("document.dispatchEvent(new Event('visibilitychange'))"));
    const path = archived ? "/archive/goals/CORE" : "/goals/CORE";
    assert.equal(await evaluate("location.pathname"), path);
    await waitFor("document.querySelector('[data-goal-view]')?.dataset.goalView === 'CORE'");
    assert.match(await evaluate<string>("document.querySelector('[data-toast]').textContent"), archived ? /已归档/ : /已恢复/);
    assert.deepEqual(store.snapshot(DEMO_BOARD_ID), afterExternalWrite, "Refresh is read-only, including history and active Goal");
  }
});

test("a completed refresh response cannot overwrite a Goal selected while it was in flight", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  await evaluate(`(() => {
    const original = fetch.bind(globalThis);
    let held = false;
    globalThis.fetch = async (input, options) => {
      const response = await original(input, options);
      if (!held && new URL(String(input), location.href).pathname === '/api/board/refresh') {
        held = true;
        const body = await response.text();
        globalThis.__refreshHeld = true;
        await new Promise(resolve => { globalThis.__releaseRefresh = resolve; });
        globalThis.__refreshDelivered = true;
        return new Response(body, {status: response.status, headers: response.headers});
      }
      return response;
    };
  })()`);
  await addGoal(origin, "REFRESH-RACE");
  const afterExternalWrite = store.snapshot(DEMO_BOARD_ID);
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await waitFor("globalThis.__refreshHeld === true");
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor("document.querySelector('[data-goal-view]')?.dataset.goalView === 'RELEASE' && !document.querySelector('[data-document-pane]').hasAttribute('aria-busy')");
  await evaluate("globalThis.__releaseRefresh(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("globalThis.__refreshDelivered"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "RELEASE");
  // The discarded response must not advance the cursor; the deferred refresh must still apply the new Goal.
  await waitFor("document.querySelector('.tree-node[data-select-goal=REFRESH-RACE]')");
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "RELEASE");
  assert.equal(await evaluate("document.querySelector('.tree-node.is-selected').dataset.selectGoal"), "RELEASE");
  assert.equal(await evaluate("location.pathname"), "/goals/RELEASE");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID), afterExternalWrite);
});

test("failed compact refresh falls back to the full Goal page and keeps other work surfaces intact", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, navigate } = browser;
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1?desktop=1" }, sessionId));
  await evaluate(`(() => {
    const original = fetch.bind(globalThis);
    globalThis.__refreshPaths = [];
    globalThis.__feedSurface = document.querySelector('[data-work-surface=feed]');
    globalThis.fetch = async (input, options) => {
      const path = new URL(String(input), location.href).pathname;
      globalThis.__refreshPaths.push(path);
      const response = await original(input, options);
      if (path === '/api/board/refresh') {
        await response.text();
        return new Response('Injected compact endpoint failure', { status: 503 });
      }
      return response;
    };
  })()`);
  await addGoal(origin, "REFRESH-FALLBACK");
  const afterExternalWrite = store.snapshot(DEMO_BOARD_ID);
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await waitFor("document.querySelector('.tree-node[data-select-goal=REFRESH-FALLBACK]')");
  const paths = await evaluate<string[]>("globalThis.__refreshPaths");
  assert.ok(paths.includes("/api/board/refresh"));
  assert.ok(paths.indexOf("/goals/V1") > paths.indexOf("/api/board/refresh"));
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "V1");
  assert.equal(await evaluate("Boolean(globalThis.__feedSurface) && document.querySelector('[data-work-surface=feed]') === globalThis.__feedSurface"), true);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID), afterExternalWrite);
});
