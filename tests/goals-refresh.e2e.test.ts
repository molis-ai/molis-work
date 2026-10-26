import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

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
    const afterExternalWrite = boardSnapshot(store, DEMO_PROJECT_ID);
    await navigate(() => evaluate("document.dispatchEvent(new Event('visibilitychange'))"));
    const path = archived ? "/archive/goals/CORE" : "/goals/CORE";
    assert.equal(await evaluate("location.pathname"), path);
    await waitFor("document.querySelector('[data-goal-view]')?.dataset.goalView === 'CORE'");
    assert.match(await evaluate<string>("document.querySelector('[data-toast]').textContent"), archived ? /已归档/ : /已恢复/);
    assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID), afterExternalWrite, "Refresh is read-only, including history and active Goal");
  }
});

test("a completed refresh response cannot overwrite a Goal selected while it was in flight", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate, openGoalWork } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  await openGoalWork(); // A Goal opens on its Frame tab; this test works in its workspace view.
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
  const afterExternalWrite = boardSnapshot(store, DEMO_PROJECT_ID);
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  // The board refreshes on the UI lifecycle's 4-second poll (#150); a synthetic visibilitychange does not restart it, so
  // the held refresh comes with the next poll. Under a full run that can take longer than the 4-second default wait.
  await waitFor("globalThis.__refreshHeld === true", 10_000);
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor("document.querySelector('[data-goal-view]')?.dataset.goalView === 'RELEASE' && !document.querySelector('[data-document-pane]').hasAttribute('aria-busy')");
  await evaluate("globalThis.__releaseRefresh(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("globalThis.__refreshDelivered"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "RELEASE");
  // The discarded response must not advance the cursor; the deferred refresh must still apply the new Goal (on a later poll).
  await waitFor("document.querySelector('.tree-node[data-select-goal=REFRESH-RACE]')", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "RELEASE");
  assert.equal(await evaluate("document.querySelector('.tree-node.is-selected').dataset.selectGoal"), "RELEASE");
  assert.equal(await evaluate("location.pathname"), "/goals/RELEASE");
  // PG094-TITLE-02: the focused item still owns its normal Goal title.
  const release = afterExternalWrite.goals.find(goal => goal.goal_id === "RELEASE")!;
  assert.equal(await evaluate("document.title"), release.title + " · Molis Work", "the focused Goal item still updates its own title");
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID), afterExternalWrite);
});

for (const destination of ["home", "settings"] as const) {
  test(`PG094-TITLE-01 a real completed Goal refresh preserves the focused ${destination} title`, { timeout: 60_000 }, async t => {
    const browser = await openGoalBrowser(t); if (!browser) return;
    const { store, origin, command, sessionId, evaluate, waitFor, navigate, openGoalWork, click } = browser;
    await navigate(() => command("Page.navigate", { url: origin + "/goals/V1?desktop=1" }, sessionId));
    await openGoalWork();
    await evaluate(`(() => {
      const original = fetch.bind(globalThis); let held = false;
      globalThis.fetch = async (input, options) => {
        const response = await original(input, options);
        if (!held && new URL(String(input), location.href).pathname === '/api/board/refresh') {
          held = true; const body = await response.text();
          globalThis.__refreshHeld = true;
          await new Promise(resolve => { globalThis.__releaseRefresh = resolve; });
          globalThis.__refreshDelivered = true;
          return new Response(body, { status: response.status, headers: response.headers });
        }
        return response;
      };
    })()`);
    const goalId = `TITLE-${destination.toUpperCase()}`;
    await addGoal(origin, goalId);
    const afterExternalWrite = boardSnapshot(store, DEMO_PROJECT_ID);
    await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor("globalThis.__refreshHeld === true", 10_000);
    await click(destination === "home" ? '[data-dock-pin="home"]' : '[data-directory-open="settings"]');
    await waitFor(destination === "home" ? "document.querySelector('.tab-item[data-tab-kind=home][aria-current]') && document.body.dataset.desktopSurface === 'home'"
      : "document.querySelector('[data-tab-workspace]').dataset.exclusive === 'settings'");
    const title = await evaluate<string>("document.title");
    assert.match(title, destination === "home" ? /^项目首页/ : /^设置/);
    await evaluate("globalThis.__releaseRefresh()");
    await waitFor(`Number(JSON.parse(document.querySelector('#molis-work-data').textContent).snapshot.cursor) === ${afterExternalWrite.cursor} && document.querySelector('.tree-node[data-select-goal="${goalId}"]')`, 10_000);
    assert.equal(await evaluate("globalThis.__refreshDelivered"), true);
    assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID), afterExternalWrite, "refresh made no writes beyond the one actual external Goal creation");
    assert.equal(await evaluate("document.title"), title, "the background response applied without taking the focused surface's title");
  });
}

test("failed compact refresh falls back to the full Goal page and keeps other work surfaces intact", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, navigate, openGoalWork } = browser;
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1?desktop=1" }, sessionId));
  await openGoalWork(); // A Goal opens on its Frame tab; this test works in its workspace view.
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
  const afterExternalWrite = boardSnapshot(store, DEMO_PROJECT_ID);
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  // Since #150 the board refreshes on the UI lifecycle's 4-second poll; a synthetic visibilitychange that does not change
  // visibility does not restart it, so the external write shows up on the next poll.
  await waitFor("document.querySelector('.tree-node[data-select-goal=REFRESH-FALLBACK]')", 10_000);
  const paths = await evaluate<string[]>("globalThis.__refreshPaths");
  assert.ok(paths.includes("/api/board/refresh"));
  assert.ok(paths.indexOf("/goals/V1") > paths.indexOf("/api/board/refresh"));
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "V1");
  assert.equal(await evaluate("Boolean(globalThis.__feedSurface) && document.querySelector('[data-work-surface=feed]') === globalThis.__feedSurface"), true);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID), afterExternalWrite);
});

// BL-140: right after a save the next poll sees a new cursor and replaces the Goal document; a menu the person had just opened
// closed under their next click. An open menu now holds the refresh back, and closing it lets the refresh in.
test("BL-140: a menu open in the Goal document holds the background refresh until it is closed", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, navigate } = browser;
  await navigate(() => command("Page.navigate", { url: origin + "/goals/CORE" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document] .goal-more')", 10_000);
  await evaluate(`(() => {
    window.__refreshes = 0;
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (new URL(String(input instanceof Request ? input.url : input), location.href).pathname === '/api/board/refresh') window.__refreshes += 1;
      return original(input, init);
    };
    document.querySelector('[data-goal-event-document] .goal-more').open = true;
    return true;
  })()`);
  await addGoal(origin, "MENU-HELD");
  // Two 4-second polls see the new cursor while the menu is open.
  await evaluate("new Promise(resolve => setTimeout(resolve, 9000))");
  assert.equal(await evaluate("window.__refreshes"), 0, "no refresh replaces the document under an open menu");
  assert.equal(await evaluate("document.querySelector('[data-goal-event-document] .goal-more').open"), true);
  await evaluate("document.querySelector('[data-goal-event-document] .goal-more').open = false");
  await waitFor("window.__refreshes > 0", 10_000);
});

test("ASC-41: a pending save blocks an in-flight refresh and later polls until its own response arrives", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t); if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate, openGoalWork } = browser;
  const goalId = "REFRESH-SAVING";
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await addGoal(origin, goalId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + goalId }, sessionId));
  await openGoalWork();
  await evaluate(`(() => {
    const original = window.fetch;
    window.__refreshRequests = 0; window.__trashRequests = 0;
    window.fetch = async (input, options) => {
      const path = new URL(String(input), location.href).pathname;
      if (path === '/api/board/refresh') {
        window.__refreshRequests++;
        if (window.__refreshRequests === 1) {
          window.__refreshHeld = true;
          await new Promise(resolve => { window.__releaseRefresh = resolve; });
        }
      }
      const response = await original(input, options);
      if (path.endsWith('/trash') && options?.method === 'POST') {
        window.__trashRequests++;
        window.__saveHeld = true;
        await new Promise(resolve => { window.__releaseSave = resolve; });
      }
      if (path === '/api/board/refresh') {
        const body = await response.text();
        window.__refreshDelivered = true;
        return new Response(body, { status: response.status, headers: response.headers });
      }
      return response;
    };
  })()`);
  await addGoal(origin, "REFRESH-TRIGGER");
  await waitFor("window.__refreshHeld === true", 10_000);
  await click(".goal-more > summary");
  await click('[data-goal-view="' + goalId + '"] [data-open-goal-trash]');
  await evaluate("document.querySelector('[data-goal-trash-form] [name=reason]').value = 'Keep the pending save in view'");
  await click("[data-goal-trash-submit]");
  await waitFor("window.__saveHeld === true");
  assert.equal(await evaluate("document.activeElement === document.body"), true, "disabling the submit button loses focus");
  const saved = boardSnapshot(store, DEMO_PROJECT_ID);
  assert.ok(saved.goals.find(goal => goal.goal_id === goalId)?.trashed_at);
  // The request began before saving; its actual response now describes the Goal in the trash.
  await evaluate("window.__releaseRefresh()");
  await waitFor("window.__refreshDelivered === true");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("location.pathname"), "/goals/" + goalId);
  assert.equal(await evaluate("document.querySelector('[data-goal-trash-dialog]').open"), true);
  // Two normal four-second polls must also respect the still-pending save.
  await evaluate("new Promise(resolve => setTimeout(resolve, 9000))");
  assert.deepEqual(await evaluate(`({ requests: window.__refreshRequests, saves: window.__trashRequests,
    open: document.querySelector('[data-goal-trash-dialog]').open,
    busy: document.querySelector('[data-goal-trash-form]').getAttribute('aria-busy') })`),
  { requests: 1, saves: 1, open: true, busy: "true" });
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID), saved, "waiting and refreshing cause no further writes");
  await navigate(() => evaluate("window.__releaseSave()"));
  await waitFor("document.querySelector('.trash-goal-panel--restore [data-open-goal-restore]')");
  assert.equal(await evaluate("location.pathname"), "/trash/goals/" + goalId);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID), saved);
});
