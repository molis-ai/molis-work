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

async function addGoal(origin: string, prefix: string, goalId: string) {
  await post(origin, prefix + "/api/plugins/io.molis.work.goals/goals", {
    goal_id: goalId, title: goalId, outcome: "Appear after another user's update",
    why: "Exercise refresh against real changed state", business_logic: "Read the new Goal without starting work",
    priority: 10, acceptance_criteria: ["The updated directory is visible"],
  }, "refresh-create-" + goalId);
}

async function openDocument(b: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>) {
  await b.openGoalWork();
  if (await b.evaluate("document.querySelector('[data-goal-details-toggle]')?.getAttribute('aria-expanded') === 'false'")) await b.click('[data-goal-details-toggle]');
  await b.waitFor("document.querySelector('[data-document-pane] [data-work-surface=goals]')?.checkVisibility({visibilityProperty:true})");
}

async function showFrame(b: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, goalId: string) {
  const frame = "document.querySelector('[data-goal-frame-surface]')";
  const visible = `${frame}?.dataset.frameGoal === ${JSON.stringify(goalId)} && ${frame}.checkVisibility({visibilityProperty:true})`;
  if (!await b.evaluate(visible)) await b.openGoalFrame(`.tree-node[data-select-goal=${JSON.stringify(goalId)}]`);
  await b.waitFor(visible);
}

test("background refresh follows external archive and restore without changing the Goal or execution history", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { store, origin, projectId, sessionId, command, evaluate, waitFor, navigate } = browser;
  // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
  const prefix = `/projects/${projectId}`;
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/CORE" }, sessionId));
  for (const archived of [true, false]) {
    await post(origin, prefix + "/api/plugins/io.molis.work.goals/goals/CORE/archive", { archived, reason: "Another user's archive action" }, "refresh-archive-" + archived);
    const afterExternalWrite = boardSnapshot(store, projectId!);
    await navigate(() => evaluate("document.dispatchEvent(new Event('visibilitychange'))"));
    const path = prefix + (archived ? "/archive/goals/CORE" : "/goals/CORE");
    assert.equal(await evaluate("location.pathname"), path);
    await waitFor("document.querySelector('[data-goal-view]')?.dataset.goalView === 'CORE'");
    assert.match(await evaluate<string>("document.querySelector('[data-toast]').textContent"), archived ? /已归档/ : /已恢复/);
    assert.deepEqual(boardSnapshot(store, projectId!), afterExternalWrite, "Refresh is read-only, including history and active Goal");
  }
});

// QEA-172, QEA-199: Goal-only scenarios use the same seed in a normal project; the Feed fallback keeps the demo.
test("a completed refresh response cannot overwrite a Goal selected while it was in flight", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { store, origin, projectId, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
  const prefix = `/projects/${projectId}`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/V1" }, sessionId));
  await openDocument(browser); // A Goal opens on its Frame tab; this test works in its workspace view.
  await evaluate(`(() => {
    const original = fetch.bind(globalThis);
    let held = false;
    globalThis.fetch = async (input, options) => {
      const response = await original(input, options);
      // The page asks through its own route prefix (the project's path); compare locally so the harness holds the same request.
      const route_prefix = document.body.dataset.routePrefix || '';
      const pathname = new URL(String(input), location.href).pathname;
      if (!held && pathname === route_prefix + '/api/board/refresh') {
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
  await addGoal(origin, prefix, "REFRESH-RACE");
  const afterExternalWrite = boardSnapshot(store, projectId!);
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
  assert.equal(await evaluate("location.pathname"), prefix + "/goals/RELEASE");
  // PG094-TITLE-02: the focused item still owns its normal Goal title.
  const release = afterExternalWrite.goals.find(goal => goal.goal_id === "RELEASE")!;
  assert.equal(await evaluate("document.title"), release.title + " · Molis Work", "the focused Goal item still updates its own title");
  assert.deepEqual(boardSnapshot(store, projectId!), afterExternalWrite);
});

test("PG094-TITLE-01 QEA-199 Goal refresh preserves the title of both focused surfaces", async t => {
  const browser = await openGoalBrowser(t, "user"); if (!browser) return;
  for (const destination of ["home", "settings"] as const) await t.test(`PG094-TITLE-01 a real completed Goal refresh preserves the focused ${destination} title`, { timeout: 60_000 }, async () => {
    const { store, origin, projectId, command, sessionId, evaluate, waitFor, navigate, click } = browser;
    // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
    const prefix = `/projects/${projectId}`;
    await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/V1?desktop=1" }, sessionId));
    await openDocument(browser);
    await evaluate(`(() => {
      const original = fetch.bind(globalThis); let held = false;
      globalThis.fetch = async (input, options) => {
        const response = await original(input, options);
        // The page asks through its own route prefix (the project's path); compare locally so the harness holds the same request.
        const route_prefix = document.body.dataset.routePrefix || '';
        const pathname = new URL(String(input), location.href).pathname;
        if (!held && pathname === route_prefix + '/api/board/refresh') {
          held = true; const body = await response.text();
          globalThis.__refreshHeld = true;
          globalThis.__heldGoalDocument = document.querySelector('[data-goal-event-document]');
          await new Promise(resolve => { globalThis.__releaseRefresh = resolve; });
          globalThis.__refreshDelivered = true;
          return new Response(body, { status: response.status, headers: response.headers });
        }
        return response;
      };
    })()`);
    const goalId = `TITLE-${destination.toUpperCase()}`;
    await addGoal(origin, prefix, goalId);
    const afterExternalWrite = boardSnapshot(store, projectId!);
    await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor("globalThis.__refreshHeld === true", 10_000);
    await click(destination === "home" ? '[data-corner-home]' : '[data-directory-open="settings"]');
    await waitFor(destination === "home" ? "document.body.dataset.desktopSurface === 'home' && !document.querySelector(':is([data-titlebar-tabs], [data-tab-strip]) .tab-item[aria-current]')"
      : "document.querySelector('[data-tab-workspace]').dataset.exclusive === 'settings'");
    const title = await evaluate<string>("document.title");
    assert.match(title, destination === "home" ? /^项目首页/ : /^设置/);
    await evaluate("globalThis.__releaseRefresh()");
    await waitFor(`Number(JSON.parse(document.querySelector('#molis-work-data').textContent).snapshot.cursor) === ${afterExternalWrite.cursor} && document.querySelector('.tree-node[data-select-goal="${goalId}"]')`, 10_000);
    assert.equal(await evaluate("globalThis.__refreshDelivered"), true);
    assert.equal(await evaluate("document.querySelector('[data-goal-event-document]') === globalThis.__heldGoalDocument"), true, "QEA-114 a full response received after hiding only applies its collection");
    assert.deepEqual(boardSnapshot(store, projectId!), afterExternalWrite, "refresh made no writes beyond the one actual external Goal creation");
    assert.equal(await evaluate("document.title"), title, "the background response applied without taking the focused surface's title");
  });
});

// QEA-161: these projection cases use a normal new project with Goals and the Workbench.
test("QEA-113 QEA-114 QEA-199 collection refresh across Goal surfaces", async t => {
  const b = await openGoalBrowser(t, "user"); if (!b) return;

  await t.test("QEA-113 a hidden Goal keeps its document while the background collection receives an external write", { timeout: 60_000 }, async t => {
    const prefix = `/projects/${b.projectId}`;
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/V1?desktop=1" }, b.sessionId));
    await openDocument(b);
    await b.click('[data-corner-home]');
    await b.waitFor("document.body.dataset.desktopSurface === 'home'");
    await b.evaluate(`(() => {
      globalThis.__oldGoalDocument = document.querySelector('[data-goal-event-document]');
      globalThis.__collectionRequests = [];
      const original = fetch.bind(globalThis);
      globalThis.fetch = (input, options) => {
        const url = new URL(String(input), location.href);
        if (url.pathname.endsWith('/api/board/refresh')) globalThis.__collectionRequests.push(url.search);
        return original(input, options);
      };
    })()`);
    await addGoal(b.origin, prefix, "HIDDEN-COLLECTION");
    const after = boardSnapshot(b.store, b.projectId!);
    await b.waitFor("document.querySelector('.tree-node[data-select-goal=HIDDEN-COLLECTION]')", 15_000);
    assert.equal(await b.evaluate("document.querySelector('[data-goal-event-document]') === globalThis.__oldGoalDocument"), true, "the hidden document was not replaced");
    const paths = await b.evaluate<string[]>("globalThis.__collectionRequests");
    assert.ok(paths.length > 0);
    assert.ok(paths.every(path => new URLSearchParams(path).get("projection") === "collection" && !new URLSearchParams(path).has("goal_id")), JSON.stringify(paths));
    assert.equal(await b.evaluate("document.body.dataset.desktopSurface"), "home");
    assert.deepEqual(boardSnapshot(b.store, b.projectId!), after);
  });

  await t.test("QEA-113 a visible Goal Frame refreshes its collection without reading the hidden workspace document", { timeout: 60_000 }, async t => {
    const prefix = `/projects/${b.projectId}`;
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/V1?desktop=1" }, b.sessionId));
    // Reenter the Frame if the workbench restored the workspace last used in this Home.
    await showFrame(b, "V1");
    assert.equal(await b.evaluate("document.querySelector('[data-document-pane] [data-work-surface=goals]').checkVisibility({visibilityProperty:true})"), false);
    await b.evaluate(`(() => {
      globalThis.__oldGoalDocument = document.querySelector('[data-goal-event-document]');
      globalThis.__frameRefreshes = [];
      const original = fetch.bind(globalThis);
      globalThis.fetch = (input, options) => {
        const url = new URL(String(input), location.href);
        if (url.pathname.endsWith('/api/board/refresh')) globalThis.__frameRefreshes.push(url.search);
        return original(input, options);
      };
    })()`);
    await addGoal(b.origin, prefix, "FRAME-COLLECTION");
    const after = boardSnapshot(b.store, b.projectId!);
    await b.waitFor("document.querySelector('.tree-node[data-select-goal=FRAME-COLLECTION]')", 12_000);
    assert.equal(await b.evaluate("document.querySelector('[data-goal-event-document]') === globalThis.__oldGoalDocument"), true);
    const reads = await b.evaluate<string[]>("globalThis.__frameRefreshes");
    assert.ok(reads.length > 0 && reads.every(path => new URLSearchParams(path).get('projection') === 'collection'), JSON.stringify(reads));
    await openDocument(b);
    await b.waitFor("globalThis.__frameRefreshes.some(path => !new URLSearchParams(path).has('projection'))", 12_000);
    await b.waitFor("document.querySelector('[data-goal-event-document]') !== globalThis.__oldGoalDocument");
    assert.deepEqual(boardSnapshot(b.store, b.projectId!), after);
  });

  await t.test("QEA-113 hidden handwritten Goal input survives a collection refresh without blocking new directory facts", { timeout: 60_000 }, async t => {
    const prefix = `/projects/${b.projectId}`, goal = "DIRTY-COLLECTION";
    await addGoal(b.origin, prefix, goal);
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/" + goal + "?desktop=1" }, b.sessionId));
    await openDocument(b);
    await b.click('[data-record-menu] > summary');
    await b.click('[data-record-menu] [data-event-form-open=concern]');
    await b.waitFor("!document.querySelector('[data-event-form=concern]').hidden");
    await b.evaluate(`(() => { const input = document.querySelector('[data-event-form=concern] [name=statement]');
      input.value = 'Unsubmitted concern stays with its author'; input.dispatchEvent(new Event('input', { bubbles: true })); globalThis.__dirtyConcern = input; })()`);
    await b.click('[data-corner-home]');
    await b.waitFor("document.body.dataset.desktopSurface === 'home'");
    await addGoal(b.origin, prefix, "AFTER-DIRTY");
    const after = boardSnapshot(b.store, b.projectId!);
    await b.waitFor("document.querySelector('.tree-node[data-select-goal=AFTER-DIRTY]')", 12_000);
    assert.equal(await b.evaluate("document.querySelector('[data-event-form=concern] [name=statement]') === globalThis.__dirtyConcern"), true);
    assert.equal(await b.evaluate("globalThis.__dirtyConcern.value"), "Unsubmitted concern stays with its author");
    assert.equal(await b.evaluate("globalThis.__dirtyConcern.closest('form').dataset.liveDirty"), "true");
    assert.deepEqual(boardSnapshot(b.store, b.projectId!), after);
  });

  await t.test("QEA-114 the last hidden collection failure recovers on the normal poll without replacing the document or falling back to a full page", { timeout: 60_000 }, async t => {
    const prefix = `/projects/${b.projectId}`;
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/V1?desktop=1" }, b.sessionId));
    await openDocument(b);
    await b.click('[data-corner-home]');
    await b.waitFor("document.body.dataset.desktopSurface === 'home'");
    const before = await (await fetch(b.origin + prefix + "/api/board/cursor")).json() as { observed_event_cursor: number };
    await b.waitFor(`document.querySelector('#molis-work-data').boardCursor >= ${before.observed_event_cursor}`);
    await b.evaluate(`(() => {
      globalThis.__oldGoalDocument = document.querySelector('[data-goal-event-document]');
      globalThis.__failCollection = true; globalThis.__collectionFailed = false; globalThis.__pageFallbacks = [];
      const original = fetch.bind(globalThis);
      globalThis.fetch = async (input, options) => {
        const url = new URL(String(input), location.href), response = await original(input, options);
        if (url.pathname.endsWith('/api/board/refresh') && globalThis.__failCollection) {
          await response.text(); globalThis.__collectionFailed = true;
          return new Response('Collection unavailable', { status: 503 });
        }
        if (!url.pathname.includes('/api/') && url.pathname.startsWith(document.body.dataset.routePrefix)) globalThis.__pageFallbacks.push(url.pathname);
        return response;
      };
    })()`);
    await addGoal(b.origin, prefix, "COLLECTION-RECOVERY");
    const after = boardSnapshot(b.store, b.projectId!);
    await b.waitFor("globalThis.__collectionFailed");
    assert.equal(await b.evaluate("Boolean(document.querySelector('.tree-node[data-select-goal=COLLECTION-RECOVERY]'))"), false);
    assert.equal(await b.evaluate("document.querySelector('#molis-work-data').boardCursor"), before.observed_event_cursor, "a failed projection never acknowledges its hint");
    await b.evaluate("globalThis.__failCollection = false");
    // No second write or synthetic notification: the existing poll must recover the final unapplied hint.
    await b.waitFor("document.querySelector('.tree-node[data-select-goal=COLLECTION-RECOVERY]')", 12_000);
    assert.deepEqual(await b.evaluate("globalThis.__pageFallbacks"), []);
    assert.equal(await b.evaluate("document.querySelector('[data-goal-event-document]') === globalThis.__oldGoalDocument"), true);
    assert.deepEqual(boardSnapshot(b.store, b.projectId!), after);
  });
});

test("QEA-114 QEA-199 collection refresh with competing writes and navigation", async t => {
  const b = await openGoalBrowser(t, "user"); if (!b) return;

  await t.test("QEA-114 an attention hint received during a held collection read remains pending until its own projection applies", { timeout: 60_000 }, async t => {
    const prefix = `/projects/${b.projectId}`;
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/V1?desktop=1" }, b.sessionId));
    await openDocument(b);
    await b.click('[data-corner-home]');
    await b.waitFor("document.body.dataset.desktopSurface === 'home'");
    const cursor = async () => (await (await fetch(b.origin + prefix + "/api/board/cursor")).json() as { observed_event_cursor: number }).observed_event_cursor;
    await b.waitFor(`document.querySelector('#molis-work-data').boardCursor >= ${await cursor()}`);
    await b.evaluate(`(() => {
      globalThis.__holds = 0; globalThis.__held = []; globalThis.__release = [];
      globalThis.__oldGoalDocument = document.querySelector('[data-goal-event-document]');
      document.addEventListener('molis-work:attention', event => globalThis.__attentionCursor = event.detail.board_cursor);
      const original = fetch.bind(globalThis);
      globalThis.fetch = async (input, options) => {
        const response = await original(input, options);
        if (new URL(String(input), location.href).pathname.endsWith('/api/board/refresh') && globalThis.__holds < 2) {
          const at = globalThis.__holds++, body = await response.text(); globalThis.__held[at] = true;
          await new Promise(resolve => globalThis.__release[at] = resolve);
          return new Response(body, { status: response.status, headers: response.headers });
        }
        return response;
      };
    })()`);
    try {
      await addGoal(b.origin, prefix, "COLLECTION-FIRST");
      await b.waitFor("globalThis.__held[0]");
      await addGoal(b.origin, prefix, "COLLECTION-LAST");
      const latest = await cursor(), after = boardSnapshot(b.store, b.projectId!);
      await b.waitFor(`globalThis.__attentionCursor >= ${latest}`, 12_000);
      await b.evaluate("globalThis.__release[0]()");
      await b.waitFor("globalThis.__held[1]");
      await b.waitFor("document.querySelector('.tree-node[data-select-goal=COLLECTION-FIRST]')");
      assert.equal(await b.evaluate("Boolean(document.querySelector('.tree-node[data-select-goal=COLLECTION-LAST]'))"), false);
      assert.ok(await b.evaluate<number>("document.querySelector('#molis-work-data').boardCursor") < latest);
      await b.evaluate("globalThis.__release[1]()");
      await b.waitFor(`document.querySelector('.tree-node[data-select-goal=COLLECTION-LAST]') && document.querySelector('#molis-work-data').boardCursor >= ${latest}`);
      assert.equal(await b.evaluate("document.querySelector('[data-goal-event-document]') === globalThis.__oldGoalDocument"), true);
      assert.deepEqual(boardSnapshot(b.store, b.projectId!), after);
    } finally { await b.evaluate("globalThis.__release.forEach(release => release?.())").catch(() => {}); }
  });

  await t.test("QEA-114 a relation save queues its forced refresh behind an earlier response and settles the actual write once", { timeout: 60_000 }, async t => {
    await b.setViewport(1440, 1000);
    const prefix = `/projects/${b.projectId}`, reason = "Forced refresh retains the confirmed direction";
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/CORE?desktop=1" }, b.sessionId));
    await openDocument(b);
    await b.evaluate(`(() => {
      const original = fetch.bind(globalThis); globalThis.__held = false; globalThis.__relationWrites = 0;
      globalThis.fetch = async (input, options) => {
        const url = new URL(String(input), location.href), response = await original(input, options);
        if (url.pathname.endsWith('/api/board/refresh') && !globalThis.__held) {
          const body = await response.text(); globalThis.__held = true;
          await new Promise(resolve => globalThis.__release = resolve);
          return new Response(body, { status: response.status, headers: response.headers });
        }
        if (url.pathname.endsWith('/relations') && options?.method === 'POST') { globalThis.__relationWrites++; globalThis.__relationResult = await response.clone().json(); }
        return response;
      };
    })()`);
    try {
      await addGoal(b.origin, prefix, "FORCE-PROJECTION");
      await b.waitFor("globalThis.__held", 12_000);
      if (await b.evaluate("!document.querySelector('[data-goal-info]').open")) await b.click('[data-goal-info] > summary');
      await b.click('[data-event-reader=description]');
      await b.click('#goal-factor-tab-relations-CORE');
      await b.click('[data-relation-editor] > summary');
      await b.evaluate(`(() => { const form = document.querySelector('[data-relation-form]'); form.elements.target_goal_id.value = 'PLATFORM';
        form.elements.relation_intent.value = 'enables'; form.elements.relation_intent.dispatchEvent(new Event('change', { bubbles:true })); form.elements.reason.value = ${JSON.stringify(reason)}; })()`);
      await b.click('[data-relation-form] button[type=submit]');
      await b.waitFor("globalThis.__relationResult && document.querySelector('[data-relation-form]').getAttribute('aria-busy') === 'true'");
      assert.equal(await b.evaluate("Boolean(globalThis.__relationResult.error)"), false);
      const saved = boardSnapshot(b.store, b.projectId!);
      assert.equal(saved.relations.filter(row => row.reason === reason).length, 1);
      await b.evaluate("globalThis.__release()");
      await b.waitFor(`[...document.querySelectorAll('.relation-record')].some(node => node.textContent.includes(${JSON.stringify(reason)}))`, 12_000);
      assert.equal(await b.evaluate("globalThis.__relationWrites"), 1);
      assert.deepEqual(boardSnapshot(b.store, b.projectId!), saved);
    } finally { await b.evaluate("globalThis.__release?.()").catch(() => {}); }
  });

  // Archiving CORE changes the shared project. Exercise that after the relation write.
  await t.test("QEA-114 a late collection response cannot navigate back to an archived Frame after the person selects another Goal", { timeout: 60_000 }, async t => {
    await b.setViewport(1440, 1000);
    const prefix = `/projects/${b.projectId}`;
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/CORE?desktop=1" }, b.sessionId));
    await showFrame(b, "CORE");
    const navigations: string[] = [];
    const offNavigation = b.on("Page.frameRequestedNavigation", (event, session) => {
      if (session === b.sessionId) navigations.push((event as { url: string }).url);
    });
    await b.evaluate(`(() => {
      const original = fetch.bind(globalThis); globalThis.__held = false;
      globalThis.fetch = async (input, options) => {
        const url = new URL(String(input), location.href), response = await original(input, options);
        if (url.pathname.endsWith('/api/board/refresh') && !globalThis.__held) {
          const body = await response.text(); globalThis.__held = true; globalThis.__heldProjection = url.searchParams.get('projection');
          await new Promise(resolve => globalThis.__release = resolve);
          globalThis.__delivered = true;
          return new Response(body, { status: response.status, headers: response.headers });
        }
        return response;
      };
    })()`);
    try {
      await b.web.post(prefix + "/api/plugins/io.molis.work.goals/goals/CORE/archive", { archived: true, reason: "Archive while the Frame response is in flight" });
      await b.waitFor("globalThis.__held", 12_000);
      assert.equal(await b.evaluate("globalThis.__heldProjection"), "collection");
      await b.openGoalFrame('.tree-node[data-select-goal="RELEASE"]');
      await b.waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'RELEASE'");
      const address = await b.evaluate<string>("location.href"), saved = boardSnapshot(b.store, b.projectId!);
      await b.evaluate("globalThis.__release()");
      await b.waitFor(`JSON.parse(document.querySelector('#molis-work-data').textContent).snapshot.cursor === ${saved.cursor}`);
      assert.equal(await b.evaluate("document.querySelector('[data-goal-frame-surface]').dataset.frameGoal"), "RELEASE");
      assert.equal(await b.evaluate("location.href"), address);
      assert.equal(await b.evaluate("globalThis.__delivered"), true);
      assert.deepEqual(boardSnapshot(b.store, b.projectId!), saved);
    } finally {
      offNavigation(); t.diagnostic(`QEA-114 requested navigations ${JSON.stringify(navigations)}`);
      await b.evaluate("globalThis.__release?.()").catch(() => {});
    }
  });
});

test("failed compact refresh falls back to the full Goal page and keeps other work surfaces intact", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { store, origin, projectId, sessionId, command, evaluate, waitFor, navigate } = browser;
  // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
  const prefix = `/projects/${projectId}`;
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/V1?desktop=1" }, sessionId));
  await openDocument(browser); // A Goal opens on its Frame tab; this test works in its workspace view.
  await evaluate(`(() => {
    const original = fetch.bind(globalThis);
    globalThis.__refreshPaths = [];
    globalThis.__feedSurface = document.querySelector('[data-work-surface=feed]');
    globalThis.fetch = async (input, options) => {
      // Record the page's local route (without the project prefix) so the fallback order reads in the page's own terms.
      const route_prefix = document.body.dataset.routePrefix || '';
      const wire = new URL(String(input), location.href).pathname;
      const path = route_prefix && wire.startsWith(route_prefix) ? wire.slice(route_prefix.length) : wire;
      globalThis.__refreshPaths.push(path);
      const response = await original(input, options);
      if (path === '/api/board/refresh') {
        await response.text();
        return new Response('Injected compact endpoint failure', { status: 503 });
      }
      return response;
    };
  })()`);
  await addGoal(origin, prefix, "REFRESH-FALLBACK");
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
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { origin, projectId, sessionId, command, evaluate, waitFor, navigate } = browser;
  // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
  const prefix = `/projects/${projectId}`;
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/CORE" }, sessionId));
  await openDocument(browser);
  await waitFor("document.querySelector('[data-goal-event-document] .goal-more')", 10_000);
  await evaluate(`(() => {
    window.__refreshes = 0;
    const original = window.fetch;
    window.fetch = (input, init) => {
      // The page asks through its own route prefix (the project's path); count the refresh locally.
      const route_prefix = document.body.dataset.routePrefix || '';
      const wire = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if ((route_prefix && wire.startsWith(route_prefix) ? wire.slice(route_prefix.length) : wire) === '/api/board/refresh') window.__refreshes += 1;
      return original(input, init);
    };
    document.querySelector('[data-goal-event-document] .goal-more').open = true;
    return true;
  })()`);
  await addGoal(origin, prefix, "MENU-HELD");
  // Two 4-second polls see the new cursor while the menu is open.
  await evaluate("new Promise(resolve => setTimeout(resolve, 9000))");
  assert.equal(await evaluate("window.__refreshes"), 0, "no refresh replaces the document under an open menu");
  assert.equal(await evaluate("document.querySelector('[data-goal-event-document] .goal-more').open"), true);
  await evaluate("document.querySelector('[data-goal-event-document] .goal-more').open = false");
  await waitFor("window.__refreshes > 0", 10_000);
});

test("服务接入 §10.6 ASC-41: a pending save blocks an in-flight refresh and later polls until its own response arrives", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "user"); if (!browser) return;
  const { store, origin, projectId, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
  const prefix = `/projects/${projectId}`;
  const goalId = "REFRESH-SAVING";
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await addGoal(origin, prefix, goalId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/" + goalId }, sessionId));
  await openDocument(browser);
  await evaluate(`(() => {
    const original = window.fetch;
    window.__refreshRequests = 0; window.__trashRequests = 0;
    window.fetch = async (input, options) => {
      // The page asks through its own route prefix (the project's path); compare locally so the harness holds the same requests.
      const route_prefix = document.body.dataset.routePrefix || '';
      const wire = new URL(String(input), location.href).pathname;
      const path = route_prefix && wire.startsWith(route_prefix) ? wire.slice(route_prefix.length) : wire;
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
  await addGoal(origin, prefix, "REFRESH-TRIGGER");
  await waitFor("window.__refreshHeld === true", 10_000);
  await click(".goal-more > summary");
  await click('[data-goal-view="' + goalId + '"] [data-open-goal-trash]');
  await evaluate("document.querySelector('[data-goal-trash-form] [name=reason]').value = 'Keep the pending save in view'");
  await click("[data-goal-trash-submit]");
  await waitFor("window.__saveHeld === true");
  assert.equal(await evaluate("document.activeElement === document.body"), true, "disabling the submit button loses focus");
  const saved = boardSnapshot(store, projectId!);
  assert.ok(saved.goals.find(goal => goal.goal_id === goalId)?.trashed_at);
  // The request began before saving; its actual response now describes the Goal in the trash.
  await evaluate("window.__releaseRefresh()");
  await waitFor("window.__refreshDelivered === true");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("location.pathname"), prefix + "/goals/" + goalId);
  assert.equal(await evaluate("document.querySelector('[data-goal-trash-dialog]').open"), true);
  // Two normal four-second polls must also respect the still-pending save.
  await evaluate("new Promise(resolve => setTimeout(resolve, 9000))");
  assert.deepEqual(await evaluate(`({ requests: window.__refreshRequests, saves: window.__trashRequests,
    open: document.querySelector('[data-goal-trash-dialog]').open,
    busy: document.querySelector('[data-goal-trash-form]').getAttribute('aria-busy') })`),
  { requests: 1, saves: 1, open: true, busy: "true" });
  assert.deepEqual(boardSnapshot(store, projectId!), saved, "waiting and refreshing cause no further writes");
  await navigate(() => evaluate("window.__releaseSave()"));
  await waitFor("document.querySelector('.trash-goal-panel--restore [data-open-goal-restore]')");
  assert.equal(await evaluate("location.pathname"), prefix + "/trash/goals/" + goalId);
  assert.deepEqual(boardSnapshot(store, projectId!), saved);
});

// T01-GRAPH-REFRESH-01: a focused workspace also consumes the graph, even when its mode is not "graph".
test("T01-GRAPH-REFRESH-01 a focused Goal workspace reloads graph facts after a real board refresh", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "user"); if (!browser) return;
  const { store, origin, projectId, sessionId, command, evaluate, waitFor, navigate } = browser;
  const prefix = `/projects/${projectId}`;
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/CORE" }, sessionId));
  await openDocument(browser);
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  await addGoal(origin, prefix, "T01-GRAPH-REFRESH");
  const saved = boardSnapshot(store, projectId!);
  await waitFor("document.querySelector('.tree-node[data-select-goal=T01-GRAPH-REFRESH]')", 10_000);
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true' && document.querySelector('[data-goal-momentum] [data-goal-id=T01-GRAPH-REFRESH]')", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "CORE");
  assert.deepEqual(boardSnapshot(store, projectId!), saved, "the graph refresh is read-only");
});
