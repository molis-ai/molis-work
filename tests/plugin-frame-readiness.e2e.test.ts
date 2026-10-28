import assert from "node:assert/strict";
import test from "node:test";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";
import { renderPluginFrameClientScript } from "@molis-ai/molis-work-app-workbench";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

type GoalBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type PluginChild = Awaited<ReturnType<typeof pluginFrameBrowser>>;

/**
 * Hold the child's second load of the frame bridge and its plugin client bundle, so both loading windows are real:
 * the parsed but hidden markup (bridge pending), and the visible but unmounted controls (bundle pending).
 */
function holdFrameAssets(browser: GoalBrowser) {
  const handlers = browser.server.listeners("request");
  let bridgeRequests = 0, posts = 0;
  let sendBridge: (() => void) | null = null, sendClient: ((status?: number) => void) | null = null;
  let bridgeRequested!: () => void, clientRequested!: () => void;
  const bridge = new Promise<void>(resolve => { bridgeRequested = resolve; });
  const client = new Promise<void>(resolve => { clientRequested = resolve; });
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++;
    const respond = () => { for (const handler of handlers) handler.call(browser.server, request, response); };
    if (request.method === "GET" && request.url === "/assets/molis-work-plugin-frame.js") {
      const answer = () => {
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        response.end(renderPluginFrameClientScript());
      };
      if (++bridgeRequests === 2) { sendBridge = answer; bridgeRequested(); }
      else answer();
    } else if (request.url === "/assets/molis-work-plugins/lingguang.js") {
      sendClient = status => {
        if (status === undefined) respond();
        else { response.writeHead(status, { "content-type": "text/javascript; charset=utf-8" }); response.end(""); }
      };
      clientRequested();
    } else respond();
  });
  return {
    bridge, client, bridgeRequests: () => bridgeRequests, posts: () => posts,
    releaseBridge: () => { sendBridge?.(); sendBridge = null; },
    respondClient: (status?: number) => { sendClient?.(status); sendClient = null; },
  };
}

/** Count only events the browser dispatched as input inside the opaque child; a script click never counts. */
async function armTrustedProbe(child: PluginChild): Promise<void> {
  await child.evaluate(`(() => {
    if (!globalThis.__mwTrustedProbeInstalled) {
      globalThis.__mwTrustedProbeInstalled = true;
      for (const type of ["pointerdown", "click"]) {
        document.addEventListener(type, event => { if (event.isTrusted && globalThis.__mwGuardProbe) globalThis.__mwGuardProbe[type]++; }, true);
      }
    }
    globalThis.__mwGuardProbe = { pointerdown: 0, click: 0 };
  })()`);
}

async function trustedClicks(child: PluginChild): Promise<{ pointerdown: number; click: number }> {
  return child.evaluate<{ pointerdown: number; click: number }>(`(() => ({ pointerdown: globalThis.__mwGuardProbe.pointerdown, click: globalThis.__mwGuardProbe.click }))()`);
}

/** A real pointer click: the owner's iframe rectangle plus a point measured inside the child (or its centre). */
async function clickInsideFrame(browser: GoalBrowser, child: PluginChild | null, selector?: string): Promise<void> {
  const frame = await browser.evaluate<{ x: number; y: number; width: number; height: number }>(`(() => {
    const frame = document.querySelector("iframe[data-plugin-frame=lingguang]");
    if (!frame) throw new Error("Missing plugin frame");
    const box = frame.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  })()`);
  const point = child && selector
    ? await child.evaluate<{ x: number; y: number }>(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Missing " + ${JSON.stringify(selector)});
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height) throw new Error("Invisible " + ${JSON.stringify(selector)});
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      })()`)
    : { x: frame.width / 2, y: frame.height / 2 };
  const at = { x: frame.x + point.x, y: frame.y + point.y };
  await browser.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y }, browser.sessionId);
  await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 }, browser.sessionId);
  await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 }, browser.sessionId);
}

async function sideSurfaceState(browser: GoalBrowser): Promise<{ inert: boolean; busy: string | null; state: string | undefined }> {
  return browser.evaluate<{ inert: boolean; busy: string | null; state: string | undefined }>(`(() => {
    const root = document.querySelector("[data-side-view-root] > [data-work-surface=lingguang]");
    if (!root) throw new Error("Missing side view surface");
    return { inert: root.inert, busy: root.getAttribute("aria-busy"), state: root.dataset.uiClientState };
  })()`);
}

test("a visible plugin document precedes its listeners; the owner readiness gate precedes one real click", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const handlers = browser.server.listeners("request");
  let held = true, requested = false, posts = 0;
  const waiting: Array<() => void> = [];
  const release = () => { held = false; for (const respond of waiting.splice(0)) respond(); };
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++;
    const respond = () => { for (const handler of handlers) handler.call(browser.server, request, response); };
    if (held && request.url === "/assets/molis-work-plugins/lingguang.js") { requested = true; waiting.push(respond); }
    else respond();
  });
  t.after(release);
  const count = () => {
    const store = openLingguangStore(browser.homeDirectory);
    try { return store.list(browser.projectId!).length; } finally { store.close(); }
  };
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'home'");
  await browser.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  // The original journey waited only for this child DOM condition, bypassing the owner's inert surface.
  await child.waitFor("!document.querySelector('[data-work-surface=lingguang]').hidden");
  assert.equal(requested, true);
  assert.deepEqual(await browser.evaluate("(()=>{const root=document.querySelector('[data-work-surface=lingguang]');return [root.dataset.uiClientState,root.inert];})()"), ["loading", true]);
  assert.equal(await child.evaluate("(()=>{const button=[...document.querySelectorAll('[data-work-surface=lingguang] button')].find(button=>button.getClientRects().length&&button.textContent.includes('记下'));button?.click();return !!button;})()"), true);
  assert.equal(posts, 0); assert.equal(count(), 0);
  release();
  await browser.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.uiClientState === 'ready' && !document.querySelector('[data-work-surface=lingguang]').inert");
  assert.equal(await child.evaluate("document.querySelector('[data-work-surface=lingguang]').dataset.expanded"), "false");
  assert.equal(posts, 0); assert.equal(count(), 0, "a pre-listener DOM click is not replayed when the client becomes ready");
  await child.click("[data-lingguang-capture]");
  await child.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && !!document.querySelector('[data-lingguang-id]')");
  assert.equal(posts, 1); assert.equal(count(), 1);
});

test("VUX-16: a side document waits through hidden markup and visible unmounted controls before one real capture", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const handlers = browser.server.listeners("request");
  let bridgeRequests = 0, posts = 0;
  let releaseBridge = () => {}, releaseClient = () => {};
  let bridgeRequested!: () => void, clientRequested!: () => void;
  const bridgePaused = new Promise<void>(resolve => { bridgeRequested = resolve; });
  const clientPaused = new Promise<void>(resolve => { clientRequested = resolve; });
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++;
    const respond = () => { for (const handler of handlers) handler.call(browser.server, request, response); };
    if (request.method === "GET" && request.url === "/assets/molis-work-plugin-frame.js") {
      // The owner must mount the real frame first. No-store makes the child's second request observable, even
      // when the same production bridge was just loaded by its owner; neither response changes the program.
      const sendBridge = () => {
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        response.end(renderPluginFrameClientScript());
      };
      if (++bridgeRequests === 2) { releaseBridge = sendBridge; bridgeRequested(); }
      else sendBridge();
    } else if (request.url === "/assets/molis-work-plugins/lingguang.js") {
      releaseClient = respond; clientRequested();
    } else respond();
  });
  t.after(() => { releaseBridge(); releaseClient(); });
  const count = () => {
    const store = openLingguangStore(browser.homeDirectory);
    try { return store.list(browser.projectId!).length; } finally { store.close(); }
  };
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/side/lingguang/side` }, browser.sessionId));
  await bridgePaused;
  // This is precisely the old wait: parsed markup is present, but startChild has not shown it yet.
  await child.waitFor("document.querySelector('[data-lingguang=workbench]')", 30_000);
  assert.equal(bridgeRequests, 2);
  assert.deepEqual(await child.evaluate("[document.querySelector('[data-lingguang=workbench]').hidden, [...document.querySelectorAll('[data-lingguang-capture]')].filter(button => button.getClientRects().length).length]"), [true, 0]);
  assert.equal(await browser.evaluate("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]').dataset.uiClientState === 'ready'"), false);
  assert.equal(posts, 0); assert.equal(count(), 0);
  releaseBridge(); releaseBridge = () => {};
  await clientPaused;
  await child.waitFor("[...document.querySelectorAll('[data-lingguang-capture]')].some(button => button.getClientRects().length)");
  assert.equal(await child.evaluate("document.querySelector('[data-lingguang=workbench]').hidden"), false);
  assert.equal(await browser.evaluate("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]').dataset.uiClientState === 'ready'"), false);
  assert.equal(posts, 0); assert.equal(count(), 0, "visible markup alone has not created a spark");
  releaseClient(); releaseClient = () => {};
  await browser.waitFor("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]')?.dataset.uiClientState === 'ready' && document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]').checkVisibility()", 30_000);
  assert.equal(posts, 0); assert.equal(count(), 0, "mounting alone does not create a spark");
  await child.click("[data-lingguang-capture]");
  await child.waitFor("document.querySelector('[data-lingguang-title]')?.getClientRects().length && !!document.querySelector('[data-lingguang-id]')");
  assert.equal(posts, 1); assert.equal(count(), 1, "one real click creates exactly one persisted spark");
});

/**
 * Record every observable write to the four guard attributes on the owner's surface, in order, with the value
 * each write replaced. A write of the value already present produces no mutation, so this is the complete
 * observable history, not every call: RAC-1490 says below what that limit leaves to the diff review.
 */
async function watchGuardWrites(browser: GoalBrowser): Promise<void> {
  await browser.evaluate(`(() => {
    globalThis.__mwGuardRecords = [];
    globalThis.__mwGuardObserver = new MutationObserver(records => {
      for (const record of records) {
        if (!(record.target instanceof Element) || !record.target.matches("[data-work-surface=lingguang]")) continue;
        globalThis.__mwGuardRecords.push({ attribute: record.attributeName, oldValue: record.oldValue });
      }
    });
    globalThis.__mwGuardObserver.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["inert", "aria-busy", "data-ui-client-state", "data-deferred-surface"] });
  })()`);
}

/** Drain the observer before reading: records queued after the wait still belong to the same ordered history. */
async function guardWrites(browser: GoalBrowser): Promise<Array<{ attribute: string; oldValue: string | null }>> {
  return browser.evaluate<Array<{ attribute: string; oldValue: string | null }>>(`(() => {
    for (const record of globalThis.__mwGuardObserver.takeRecords()) {
      if (!(record.target instanceof Element) || !record.target.matches("[data-work-surface=lingguang]")) continue;
      globalThis.__mwGuardRecords.push({ attribute: record.attributeName, oldValue: record.oldValue });
    }
    return globalThis.__mwGuardRecords.slice();
  })()`);
}

test("RAC-1487: a side view is guarded through both loading windows; a real pointer cannot reach the child", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const assets = holdFrameAssets(browser);
  const count = () => {
    const store = openLingguangStore(browser.homeDirectory);
    try { return store.list(browser.projectId!).length; } finally { store.close(); }
  };
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  t.after(() => { assets.releaseBridge(); assets.respondClient(); });
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/side/lingguang/side` }, browser.sessionId));
  // Window one: the markup is parsed but hidden, and the frame bridge has not been served to the child yet.
  await assets.bridge;
  await child.waitFor("document.querySelector('[data-lingguang=workbench]')", 30_000);
  const window1Before = {
    bridgeRequests: assets.bridgeRequests(),
    hidden: await child.evaluate<[boolean, number]>("[document.querySelector('[data-lingguang=workbench]').hidden, [...document.querySelectorAll('[data-lingguang-capture]')].filter(button => button.getClientRects().length).length]"),
    state: await sideSurfaceState(browser),
  };
  await armTrustedProbe(child);
  await clickInsideFrame(browser, null);
  const window1 = { trusted: await trustedClicks(child), posts: assets.posts(), count: count() };
  assets.releaseBridge();
  // Window two: the visible control exists but its client bundle has not arrived yet; events are counted per window.
  await assets.client;
  await child.waitFor("[...document.querySelectorAll('[data-lingguang-capture]')].some(button => button.getClientRects().length)");
  const window2Before = {
    hidden: await child.evaluate<boolean>("document.querySelector('[data-lingguang=workbench]').hidden"),
    state: await sideSurfaceState(browser),
  };
  await armTrustedProbe(child);
  await clickInsideFrame(browser, child, "[data-lingguang-capture]");
  const window2 = { trusted: await trustedClicks(child), posts: assets.posts(), count: count() };
  assets.respondClient();
  await browser.waitFor("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]')?.dataset.uiClientState === 'ready'", 30_000);
  const ready = { state: await sideSurfaceState(browser), posts: assets.posts(), count: count() };
  // Positive control on the same target after release: one real pointer reaches the child and makes one spark.
  await clickInsideFrame(browser, child, "[data-lingguang-capture]");
  await child.waitFor("document.querySelector('[data-lingguang-title]')?.getClientRects().length && !!document.querySelector('[data-lingguang-id]')", 30_000);
  const delivered = { posts: assets.posts(), count: count() };
  assert.equal(window1Before.bridgeRequests, 2);
  assert.deepEqual(window1Before.hidden, [true, 0]);
  assert.deepEqual(window1Before.state, { inert: true, busy: "true", state: "loading" }, "window one guards the surface");
  assert.deepEqual(window1.trusted, { pointerdown: 0, click: 0 }, "a real pointer in window one does not reach the child");
  assert.equal(window1.posts, 0); assert.equal(window1.count, 0);
  assert.equal(window2Before.hidden, false);
  assert.deepEqual(window2Before.state, { inert: true, busy: "true", state: "loading" }, "window two keeps the guard while the bundle is missing");
  assert.deepEqual(window2.trusted, { pointerdown: 0, click: 0 }, "a real pointer in window two does not reach the child");
  assert.equal(window2.posts, 0); assert.equal(window2.count, 0);
  assert.deepEqual(ready.state, { inert: false, busy: null, state: "ready" }, "ready releases the guard");
  assert.equal(ready.posts, 0); assert.equal(ready.count, 0, "a guarded pointer is not replayed when the client becomes ready");
  assert.equal(delivered.posts, 1); assert.equal(delivered.count, 1, "one real click after release creates exactly one spark");
});

test("RAC-1488: the side view releases its guard into ready and a real click is delivered exactly once", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const assets = holdFrameAssets(browser);
  const count = () => {
    const store = openLingguangStore(browser.homeDirectory);
    try { return store.list(browser.projectId!).length; } finally { store.close(); }
  };
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  t.after(() => { assets.releaseBridge(); assets.respondClient(); });
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/side/lingguang/side` }, browser.sessionId));
  await assets.bridge;
  assets.releaseBridge();
  await assets.client;
  await child.waitFor("[...document.querySelectorAll('[data-lingguang-capture]')].some(button => button.getClientRects().length)");
  await armTrustedProbe(child);
  await clickInsideFrame(browser, child, "[data-lingguang-capture]");
  const guarded = { trusted: await trustedClicks(child), state: await sideSurfaceState(browser), posts: assets.posts(), count: count() };
  assets.respondClient();
  await browser.waitFor("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]')?.dataset.uiClientState === 'ready'", 30_000);
  const released = { state: await sideSurfaceState(browser), posts: assets.posts(), count: count() };
  await child.click("[data-lingguang-capture]");
  await child.waitFor("document.querySelector('[data-lingguang-title]')?.getClientRects().length && !!document.querySelector('[data-lingguang-id]')");
  const delivered = { posts: assets.posts(), count: count() };
  assert.deepEqual(guarded.trusted, { pointerdown: 0, click: 0 }, "the guarded pointer never reaches the child");
  assert.deepEqual(guarded.state, { inert: true, busy: "true", state: "loading" });
  assert.equal(guarded.posts, 0); assert.equal(guarded.count, 0);
  assert.deepEqual(released.state, { inert: false, busy: null, state: "ready" }, "ready releases the guard");
  assert.equal(released.posts, 0); assert.equal(released.count, 0, "the guarded click is not replayed when the client becomes ready");
  assert.equal(delivered.posts, 1); assert.equal(delivered.count, 1);
});

test("RAC-1489: a failed side view load releases the guard and leaves a failure notice, not a dead surface", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const assets = holdFrameAssets(browser);
  const count = () => {
    const store = openLingguangStore(browser.homeDirectory);
    try { return store.list(browser.projectId!).length; } finally { store.close(); }
  };
  t.after(() => { assets.releaseBridge(); assets.respondClient(); });
  // The failure view replaces the surface in the DOM, so keep the original root object: rebuild the value
  // history from the observer's ordered old values on that same root, and read the final values from it.
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    globalThis.__mwSideGuardLog = [];
    globalThis.__mwSideRoot = null;
    globalThis.__mwSideObserver = new MutationObserver(records => {
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof Element) || !target.matches("[data-work-surface=lingguang]") || !target.closest("[data-side-view-root]")) continue;
        globalThis.__mwSideRoot ??= target;
        globalThis.__mwSideGuardLog.push({ attribute: record.attributeName, oldValue: record.oldValue });
      }
    });
    globalThis.__mwSideObserver.observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["inert", "aria-busy", "data-ui-client-state"] });
  })()` }, browser.sessionId);
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/side/lingguang/side` }, browser.sessionId));
  await assets.bridge;
  assets.releaseBridge();
  await assets.client;
  const respondedAt = Date.now();
  assets.respondClient(503);
  await browser.waitFor("!document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]')", 30_000);
  const observed = await browser.evaluate<{
    present: boolean;
    final: { inert: boolean; busy: string | null; state: string | undefined } | null;
    records: Array<{ attribute: string; oldValue: string | null }>;
    frame: boolean;
    notice: string;
  }>(`(() => {
    for (const record of globalThis.__mwSideObserver.takeRecords()) {
      const target = record.target;
      if (!(target instanceof Element) || !target.matches("[data-work-surface=lingguang]") || !target.closest("[data-side-view-root]")) continue;
      globalThis.__mwSideRoot ??= target;
      globalThis.__mwSideGuardLog.push({ attribute: record.attributeName, oldValue: record.oldValue });
    }
    const root = globalThis.__mwSideRoot;
    return {
      present: !!root,
      final: root ? { inert: root.inert, busy: root.getAttribute("aria-busy"), state: root.dataset.uiClientState } : null,
      records: globalThis.__mwSideGuardLog,
      frame: !!document.querySelector("iframe[data-plugin-frame=lingguang]"),
      notice: document.querySelector("[data-side-view-root]")?.textContent?.trim() ?? "",
    };
  })()`);
  const elapsed = Date.now() - respondedAt;
  t.diagnostic(`RAC-1489: the child's failed message ended the wait after ${elapsed} ms; notice ${JSON.stringify(observed.notice)}`);
  t.diagnostic(`RAC-1489 records: ${JSON.stringify(observed.records)}`);
  assert.equal(observed.present, true, "the observer kept the original surface root");
  assert.deepEqual(observed.final, { inert: false, busy: null, state: "failed" }, "the failed surface is not left inert or busy");
  assert.deepEqual(observed.records, [
    { attribute: "inert", oldValue: null },
    { attribute: "aria-busy", oldValue: null },
    { attribute: "data-ui-client-state", oldValue: null },
    { attribute: "inert", oldValue: "" },
    { attribute: "aria-busy", oldValue: "true" },
    { attribute: "data-ui-client-state", oldValue: "loading" },
    // The catch writes "failed" a second time after the failed message; the same value is still one record.
    { attribute: "data-ui-client-state", oldValue: "failed" },
  ], "one owned cycle: guard on, loading, then guard off and failed");
  assert.equal(observed.frame, false, "the failed frame is removed");
  assert.ok(observed.notice.length > 0, "the side view tells the user the load failed");
  // The child reports failed over its port; that message lands far before the owner's 10 s deadline.
  assert.ok(elapsed < 9000, `the child's failed message, not the deadline, ended the wait: ${elapsed} ms`);
  assert.equal(count(), 0);
});

test("RAC-1490: the main path runs one guard cycle from loading to ready, and the frame never writes it again", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'home'");
  await watchGuardWrites(browser);
  await browser.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await browser.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.uiClientState === 'ready'", 30_000);
  const records = await guardWrites(browser);
  // The observer sees every attribute change, including a duplicate write of the same value; what it cannot see is
  // which code wrote it. The two mutations below prove both a stray guard write and an early release turn this red.
  assert.deepEqual(records, [
    { attribute: "inert", oldValue: null },
    { attribute: "aria-busy", oldValue: null },
    { attribute: "data-ui-client-state", oldValue: null },
    { attribute: "data-deferred-surface", oldValue: "" },
    { attribute: "inert", oldValue: "" },
    { attribute: "aria-busy", oldValue: "true" },
    { attribute: "data-ui-client-state", oldValue: "loading" },
  ], "the deferred client owns the only cycle: guard on, drop the deferred marker, release into ready");
});

test("RAC-1490: a failed main path load releases its own guard, and retry starts one fresh cycle", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const handlers = browser.server.listeners("request");
  let clientRequests = 0;
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    if (request.url === "/assets/molis-work-plugins/lingguang.js") {
      clientRequests++;
      response.writeHead(503, { "content-type": "text/javascript; charset=utf-8" }); response.end("");
      return;
    }
    for (const handler of handlers) handler.call(browser.server, request, response);
  });
  t.after(() => browser.server.removeAllListeners("request"));
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'home'");
  await watchGuardWrites(browser);
  await browser.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await browser.waitFor("document.querySelector('[data-work-surface=lingguang]')?.dataset.uiClientState === 'failed' && !!document.querySelector('[data-ui-client-retry]')", 30_000);
  const first = await guardWrites(browser);
  assert.equal(clientRequests, 1);
  assert.deepEqual(first, [
    { attribute: "inert", oldValue: null },
    { attribute: "aria-busy", oldValue: null },
    { attribute: "data-ui-client-state", oldValue: null },
    { attribute: "inert", oldValue: "" },
    { attribute: "aria-busy", oldValue: "true" },
    { attribute: "data-ui-client-state", oldValue: "loading" },
  ], "the frame owns one cycle: guard on, then off and failed; it never drops the deferred marker on failure");
  await browser.evaluate(`(() => { globalThis.__mwGuardRecords = []; })()`);
  await browser.click("[data-ui-client-retry]");
  // The retry goes back through the deferred client's own guard write first, so the frame still owns nothing.
  await browser.waitFor("globalThis.__mwGuardRecords.length >= 6 && document.querySelector('[data-work-surface=lingguang]')?.dataset.uiClientState === 'failed' && !!document.querySelector('[data-ui-client-retry]')", 30_000);
  const second = await guardWrites(browser);
  assert.equal(clientRequests, 2);
  assert.deepEqual(second, [
    { attribute: "inert", oldValue: null },
    { attribute: "aria-busy", oldValue: null },
    { attribute: "data-ui-client-state", oldValue: "failed" },
    { attribute: "inert", oldValue: "" },
    { attribute: "aria-busy", oldValue: "true" },
    { attribute: "data-ui-client-state", oldValue: "loading" },
  ], "the retry writes the same single cycle again; the frame adds nothing");
  t.diagnostic(`RAC-1490: failed load ${clientRequests} bundle requests, ${first.length}+${second.length} observable guard writes`);
});
