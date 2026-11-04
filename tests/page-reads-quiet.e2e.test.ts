import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Roadmap batch 07-2a (docs/reviews/adversarial-review-2026-11-01.md N53, N54): a page asks nothing it knows will fail.
// The project chooser has no project, so it asks no project's declarations; no page asks for a favicon the product does
// not have; an old tab whose project is gone stops reading what waits on the person after the first 404.

/** Every request the page sends to this origin, by path with the project prefix removed. */
function recorder(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>) {
  const seen: Array<{ path: string; status?: number; id: string }> = [];
  const off = browser.on("Network.requestWillBeSent", params => {
    const { request, requestId } = params as { request: { url: string }; requestId: string };
    const url = new URL(request.url);
    if (url.origin === browser.origin) seen.push({ path: url.pathname.replace(/^\/projects\/[^/]+/u, ""), id: requestId });
  });
  const offStatus = browser.on("Network.responseReceived", params => {
    const { requestId, response } = params as { requestId: string; response: { status: number } };
    const one = seen.find(entry => entry.id === requestId); if (one) one.status = response.status;
  });
  return { seen, off: () => { off(); offStatus(); }, count: (path: string) => seen.filter(entry => entry.path === path).length };
}

test("07-2a N53: the project chooser asks for no project's surfaces and no page asks for a favicon", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, waitFor, origin, projectId } = browser;
  await createProject(browser.web, "第二个项目");
  await command("Network.enable", {}, sessionId);
  const reads = recorder(browser); t.after(reads.off);

  await navigate(() => command("Page.navigate", { url: `${origin}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('.chooser'))", 20_000);
  await new Promise(resolve => setTimeout(resolve, 3_000));
  assert.equal(reads.count("/api/contextual/surfaces"), 0, `the chooser has no project to ask about: ${JSON.stringify(reads.seen.map(one => one.path))}`);
  assert.equal(reads.count("/favicon.ico"), 0, "the chooser asks for no favicon");
  // Headless Chrome may not report the favicon fetch on the page session, so the page's own answer is checked too.
  assert.equal(await browser.evaluate<string>("document.querySelector('link[rel=icon]')?.getAttribute('href') ?? ''"), "data:,", "the chooser answers its icon itself");

  reads.seen.length = 0;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && Boolean(document.querySelector('.workbench-bar'))", 30_000);
  await new Promise(resolve => setTimeout(resolve, 3_000));
  assert.equal(reads.count("/favicon.ico"), 0, "a project page asks for no favicon");
  assert.equal(await browser.evaluate<string>("document.querySelector('link[rel=icon]')?.getAttribute('href') ?? ''"), "data:,", "a project page answers its icon itself");
  const failed = reads.seen.filter(one => one.path === "/api/contextual/surfaces" && (one.status ?? 200) >= 400);
  assert.deepEqual(failed, [], "a project page's surface reads succeed");
  t.diagnostic(`project home load: ${reads.seen.length} requests, ${reads.count("/api/contextual/surfaces")} surface reads`);
});

test("07-2a N54: after a 404 (the project is gone) the page stops reading what waits on the person", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, waitFor, evaluate, origin, projectId } = browser;
  // The page's own fetch answers /api/attention with a 404 once the test says the project is gone.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const real = window.fetch.bind(window); window.__attention = 0; window.__gone = false;
    window.fetch = (input, init) => {
      const url = String(input?.url ?? input);
      if (!/\\/api\\/attention/.test(url)) return real(input, init);
      window.__attention++;
      return window.__gone ? Promise.resolve(new Response(JSON.stringify({ error: "项目不在了" }), { status: 404, headers: { "content-type": "application/json" } })) : real(input, init);
    };
  })()` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("window.__attention >= 1", 20_000);
  await evaluate("window.__gone = true; document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor("window.__attention >= 2", 5_000);
  await new Promise(resolve => setTimeout(resolve, 500));
  const after = await evaluate<number>("window.__attention");
  // Two poll beats (15 s each) and a return to the page: none of them asks again.
  await new Promise(resolve => setTimeout(resolve, 32_000));
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate<number>("window.__attention"), after, "no read after the 404");
});
