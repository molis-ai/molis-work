import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Goal document tabs retry lazy loading, restore selection, and keep the current event document", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, before, sessionId, command, evaluate, waitFor, click, reloadPage } = browser;
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Page.navigate", { url: origin + "/goals/V1" }, sessionId);
  await command("Page.bringToFront", {}, sessionId);
  const dom = (selector: string) => "document.querySelector(" + JSON.stringify(selector) + ")";
  await waitFor("document.readyState === 'complete' && " + dom("[data-goal-event-document]"));
  assert.equal(await evaluate(dom("[data-goal-event-document]") + ".dataset.goalView"), "V1");
  await command("Network.setBlockedURLs", { urls: [origin + "/api/goals/V1/event-state*"] }, sessionId);
  await evaluate(`document.querySelector(".goal-more").open = true; document.querySelector('.goal-more [data-event-reader="planning"]').click();`);
  await waitFor(dom("[data-event-reader-root]") + " && !" + dom("[data-event-reader-root]") + ".hasAttribute('hidden')");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click("[data-event-back]");
  await waitFor(dom("[data-event-sheet]") + " && !" + dom("[data-event-sheet]") + ".hasAttribute('hidden')");
  await reloadPage();
  await waitFor(dom("[data-goal-event-document]") + "?.dataset.goalView === 'V1'");
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor(dom("[data-goal-event-document]") + "?.dataset.goalView === 'RELEASE'");
  assert.equal(await evaluate(dom("[data-current-summary]") + " != null"), true);
  const screenshots = process.env.MOLIS_WORK_TEST_CAPTURE === "1" ? await mkdtemp(join(tmpdir(), "molis-work-gw5-document-")) : null;
  async function capture(name: string) {
    if (!screenshots) return;
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(screenshots, name + ".png"), Buffer.from(data, "base64"));
    console.log("Document UI capture: " + join(screenshots, name + ".png"));
  }
  await capture("desktop");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await evaluate(`document.querySelector(".goal-more").open = true; document.querySelector('.goal-more [data-event-reader="planning"]').click();`);
  await waitFor(dom("[data-event-reader-root]") + " && !" + dom("[data-event-reader-root]") + ".hasAttribute('hidden')");
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  await capture("mobile");
  const after = store.snapshot(DEMO_BOARD_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.relations, before.relations);
  assert.deepEqual(after.runs, before.runs);
});

test("late completed document response never replaces the newer selected Goal", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')");
  // Delay delivery of a real, fully read HTTP response. No invented document or server state.
  // Aborting after the body completed cannot undo a result already queued for delivery.
  await evaluate(`(() => {
    const original = fetch.bind(globalThis);
    globalThis.fetch = async (input, options) => {
      const response = await original(input, options);
      if (new URL(String(input), location.href).pathname === '/api/goals/RELEASE/document') {
        const body = await response.text();
        globalThis.__heldGoalResponse = true;
        await new Promise(resolve => { globalThis.__releaseGoalResponse = resolve; });
        globalThis.__lateGoalDelivered = true;
        return new Response(body, {status:response.status,headers:response.headers});
      }
      return response;
    };
    return true;
  })()`);
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor("globalThis.__heldGoalResponse === true");
  await click('.tree-node[data-select-goal="V1"]');
  await waitFor("document.querySelector('[data-document-pane]').getAttribute('aria-busy') !== 'true' && document.querySelector('[data-goal-view]').dataset.goalView === 'V1'");
  await evaluate("globalThis.__releaseGoalResponse(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("globalThis.__lateGoalDelivered"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "V1");
  assert.equal(await evaluate("document.querySelector('.tree-node.is-selected').dataset.selectGoal"), "V1");
  assert.equal(await evaluate("location.pathname"), "/goals/V1");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).relations, before.relations);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).runs, before.runs);
});

test("public document clients isolate requests and keep Host callbacks, failure recovery and both pane layouts", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, navigate, evaluate } = browser;
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  const result = await evaluate<{
    first: boolean | null; second: boolean | null; newer: boolean | null; failed: boolean | null; retry: boolean | null;
    aGoal: string; bGoal: string; failedGoal: string; aBusy: boolean; bBusy: boolean;
    heldBusy: boolean; aAborted: boolean; bAborted: boolean; headerKept: boolean; siblingKept: boolean;
    calls: string[]; errors: string[]; caches: string[];
  }>(`(async () => {
    const createClient = (${GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT});
    const aPane = document.createElement('section');
    aPane.innerHTML = '<aside>Host sibling</aside><div data-work-surface="goal"><article data-goal-view="initial-a"></article></div>';
    const bPane = document.createElement('section');
    bPane.innerHTML = '<header class="desktop-pane-header">Host header</header><article data-goal-view="initial-b"></article>';
    const header = bPane.firstElementChild;
    const sibling = aPane.firstElementChild;
    const calls = [], errors = [], caches = [];
    const ports = (name, documentPane) => ({
      documentPane, documentCollection: 'current', route: path => path, translate: text => text,
      isAbortError: error => error instanceof DOMException && error.name === 'AbortError',
      showError: message => errors.push(message),
      beforeReplace: () => calls.push(name + ':before:' + documentPane.querySelector('[data-goal-view]').dataset.goalView),
      afterReplace: () => calls.push(name + ':after:' + documentPane.querySelector('[data-goal-view]').dataset.goalView),
    });
    const a = createClient(ports('a', aPane)), b = createClient(ports('b', bPane));
    const originalFetch = globalThis.fetch;
    let releaseBody, bodyRead, aSignal, bSignal, held = false;
    const captured = new Promise(resolve => { bodyRead = resolve; });
    const gate = new Promise(resolve => { releaseBody = resolve; });
    globalThis.fetch = async (input, options) => {
      const path = new URL(String(input), location.href).pathname;
      caches.push(options.cache);
      if (path === '/api/goals/V1/document') bSignal = options.signal;
      const response = await originalFetch(input, options);
      if (path === '/api/goals/RELEASE/document' && !held) {
        held = true;
        aSignal = options.signal;
        const body = await response.text();
        bodyRead();
        await gate;
        return new Response(body, {status:response.status,headers:response.headers});
      }
      return response;
    };
    try {
      const pending = a.loadGoalDocument('RELEASE');
      await captured;
      const heldBusy = aPane.getAttribute('aria-busy') === 'true';
      const second = await b.loadGoalDocument('V1');
      const newer = await a.loadGoalDocument('CORE');
      releaseBody();
      const first = await pending;
      const failed = await a.loadGoalDocument('DOES-NOT-EXIST');
      const failedGoal = aPane.querySelector('[data-goal-view]').dataset.goalView;
      const retry = await a.loadGoalDocument('RELEASE');
      return {first,second,newer,failed,retry,failedGoal,heldBusy,
        aGoal:aPane.querySelector('[data-goal-view]').dataset.goalView,
        bGoal:bPane.querySelector('[data-goal-view]').dataset.goalView,
        aBusy:aPane.hasAttribute('aria-busy'),bBusy:bPane.hasAttribute('aria-busy'),
        aAborted:aSignal.aborted,bAborted:bSignal.aborted,
        headerKept:bPane.firstElementChild === header,siblingKept:aPane.firstElementChild === sibling,
        calls,errors,caches};
    } finally { releaseBody(); globalThis.fetch = originalFetch; }
  })()`);
  assert.equal(result.first, null);
  assert.equal(result.second, true);
  assert.equal(result.newer, true);
  assert.equal(result.failed, false);
  assert.equal(result.failedGoal, "CORE");
  assert.equal(result.retry, true);
  assert.equal(result.aGoal, "RELEASE");
  assert.equal(result.bGoal, "V1");
  assert.equal(result.aBusy, false);
  assert.equal(result.bBusy, false);
  assert.equal(result.heldBusy, true);
  assert.equal(result.aAborted, true);
  assert.equal(result.bAborted, false);
  assert.equal(result.headerKept, true);
  assert.equal(result.siblingKept, true);
  assert.deepEqual(result.calls, ["b:before:initial-b", "b:after:V1", "a:before:initial-a", "a:after:CORE", "a:before:CORE", "a:after:RELEASE"]);
  assert.deepEqual(result.errors, ["无法读取这条 Goal 正文"]);
  assert.deepEqual(result.caches, Array(5).fill("no-store"));
  const after = store.snapshot(DEMO_BOARD_ID);
  for (const key of ["goals", "relations", "risks", "claims", "runs", "evidence"] as const) assert.deepEqual(after[key], before[key]);
});

test("switching Goals while a document is loading still keeps the later selection after the old response arrives", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, navigate, evaluate, click, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')");
  await evaluate(`(() => {
    const originalFetch = globalThis.fetch;
    let held = false;
    globalThis.fetch = async (input, options) => {
      const response = await originalFetch(input, options);
      if (!held && new URL(String(input), location.href).pathname === '/api/goals/RELEASE/document') {
        held = true;
        const body = await response.text();
        globalThis.__heldDocumentResponse = true;
        await new Promise(resolve => { globalThis.__releaseDocumentResponse = resolve; });
        return new Response(body, {status:response.status,headers:response.headers});
      }
      return response;
    };
    return true;
  })()`);
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor("globalThis.__heldDocumentResponse === true");
  await click('.tree-node[data-select-goal="V1"]');
  await waitFor("document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'V1'");
  await evaluate("__releaseDocumentResponse(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelector('[data-goal-event-document]').dataset.goalView"), "V1");
  const after = store.snapshot(DEMO_BOARD_ID);
  for (const key of ["goals", "relations", "risks", "claims", "runs", "evidence"] as const) assert.deepEqual(after[key], before[key]);
});
