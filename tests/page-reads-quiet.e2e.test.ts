import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

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

test("07-2a N54: on the chooser a project that answered 404 is not asked again, and the next project chosen is read on the next beat", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, waitFor, evaluate, click, origin, projectId } = browser;
  const other = (await createProject(browser.web, "第二个项目")).project_id;
  // The page's own fetch counts /api/attention by project, and answers the gone one with a 404 once the test says so.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const real = window.fetch.bind(window); window.__reads = {}; window.__goneId = "";
    window.fetch = (input, init) => {
      const url = String(input?.url ?? input), at = /\\/projects\\/([^/]+)\\/api\\/attention/.exec(url);
      if (!at) return real(input, init);
      const id = decodeURIComponent(at[1]); window.__reads[id] = (window.__reads[id] || 0) + 1;
      return id === window.__goneId ? Promise.resolve(new Response(JSON.stringify({ error: "项目不在了" }), { status: 404, headers: { "content-type": "application/json" } })) : real(input, init);
    };
  })()` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/` }, sessionId));
  await waitFor(`Boolean(document.querySelector('.chooser .mw-dir-row[data-id="${projectId}"]')) && Boolean(document.querySelector('.chooser .mw-dir-row[data-id="${other}"]'))`, 20_000);
  const reads = (id: string) => evaluate<number>(`window.__reads[${JSON.stringify(id)}] || 0`);
  await click(`.chooser .mw-dir-row[data-id="${projectId}"]`);
  await waitFor(`document.querySelector('.chooser').dataset.selected === ${JSON.stringify(projectId)}`, 5_000);
  // The chosen project goes: the next read of it answers 404.
  const was = await reads(projectId);
  await evaluate(`window.__goneId = ${JSON.stringify(projectId)}; document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))`);
  await waitFor(`(window.__reads[${JSON.stringify(projectId)}] || 0) > ${was}`, 5_000);
  await new Promise(resolve => setTimeout(resolve, 500));
  const goneReads = await reads(projectId), before = await reads(other);
  // Another project is chosen: the beat that kept going past the gone address reads it, within one beat.
  await click(`.chooser .mw-dir-row[data-id="${other}"]`);
  await waitFor(`document.querySelector('.chooser').dataset.selected === ${JSON.stringify(other)}`, 5_000);
  await waitFor(`(window.__reads[${JSON.stringify(other)}] || 0) > ${before}`, 16_000);
  // Back on the gone one for a beat and more: it is never asked again.
  await click(`.chooser .mw-dir-row[data-id="${projectId}"]`);
  await new Promise(resolve => setTimeout(resolve, 17_000));
  assert.equal(await reads(projectId), goneReads, "the project that answered 404 is not asked again");
});

test("07-2a N54: a read of what waits on the person that fails waits longer before the next, instead of every 15 seconds", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, waitFor, evaluate, origin, projectId } = browser;
  // The page's own fetch answers /api/attention with a 503, as a host that is not answering would.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const real = window.fetch.bind(window); window.__attention = 0;
    window.fetch = (input, init) => {
      const url = String(input?.url ?? input);
      if (!/\\/api\\/attention/.test(url)) return real(input, init);
      window.__attention++;
      return Promise.resolve(new Response(JSON.stringify({ error: "暂时不可用" }), { status: 503, headers: { "content-type": "application/json" } }));
    };
  })()` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("window.__attention >= 1", 20_000);
  await new Promise(resolve => setTimeout(resolve, 3_000));
  const settled = await evaluate<number>("window.__attention");
  // At a beat of 15 s, 50 s would ask three more times; after a failure the next waits at least 30 s, then 60, up to 2 minutes.
  await new Promise(resolve => setTimeout(resolve, 50_000));
  const more = await evaluate<number>("window.__attention") - settled;
  assert.ok(more <= 1, `a failing read backs off: ${more} more reads in 50 s`);
});

test("07-2a N53 request counts: loading the chooser and a project page, switching a tab and opening the side", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, waitFor, click, origin, projectId } = browser;
  await command("Network.enable", {}, sessionId);
  const seen: Array<{ phase: string; method: string; path: string; status?: number; id: string; frame: string; type: string }> = [];
  let phase = "chooser";
  const PHASES = ["chooser", "todo", "project", "tab", "side"];
  const off = browser.on("Network.requestWillBeSent", params => {
    const { request, requestId, frameId, type } = params as { request: { url: string; method: string }; requestId: string; frameId: string; type: string };
    const url = new URL(request.url);
    if (url.origin === origin) seen.push({ phase, method: request.method, path: url.pathname.replace(/^\/projects\/[^/]+/u, "").replace(/plugin-pages\/[^/]+/u, "plugin-pages/:id"), id: requestId, frame: frameId, type });
  });
  const offStatus = browser.on("Network.responseReceived", params => {
    const { requestId, response } = params as { requestId: string; response: { status: number } };
    const one = seen.find(entry => entry.id === requestId); if (one) one.status = response.status;
  });
  t.after(() => { off(); offStatus(); });
  const settle = () => new Promise(resolve => setTimeout(resolve, 3_000));
  const tally = (name: string) => {
    const rows = new Map<string, number>();
    for (const one of seen.filter(entry => entry.phase === name)) { const key = `${one.method} ${one.path} ${one.status ?? "-"} ${one.type}`; rows.set(key, (rows.get(key) ?? 0) + 1); }
    return Object.fromEntries([...rows].sort());
  };
  await navigate(() => command("Page.navigate", { url: `${origin}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('.chooser'))", 20_000); await settle();
  phase = "todo";
  // Todo is opened once beforehand, so the project page comes back with two tabs and has one to switch to.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'todo'", 30_000); await settle();
  phase = "project";
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=goals` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelectorAll('[data-titlebar-tabs] .tab-item').length >= 2", 30_000); await settle();
  phase = "tab";
  await click("[data-titlebar-tabs] .tab-item:not([aria-current]) .tab-item-trigger");
  await settle();
  phase = "side";
  await click("[data-side-tabs] [data-side-tab][aria-selected=true]");
  await waitFor("document.body.dataset.sideOpen === 'true'"); await settle();
  const counts = Object.fromEntries(PHASES.map(name => [name, { total: seen.filter(entry => entry.phase === name).length, by: tally(name) }]));
  const output = reviewEvidenceUrl("07-g2/"); await mkdir(output, { recursive: true });
  await writeFile(new URL("request-counts.json", output), JSON.stringify(counts, null, 2) + "\n");
  const requestsIn = (name: string) => seen.filter(entry => entry.phase === name);
  // 07-AUDIT (N53): two sets of numbers make this case a budget, not only a shape check. The 11-01 adversarial review measured what
  // the fixes must not bring back: attention read 3× while one page loaded, the Assistant's works 4×, a favicon 404 on every page,
  // the shared stylesheet asked twice. And b51cb696d1 (batch 07's request-count commit; it is not on main, it lives in PR #1981)
  // measured, in an isolated Home with the seeded demo project on a local Mac, one step each: chooser 15 requests, the first project
  // page (Todo) 39, the project page coming back with two tabs (Goals) 31, a tab switch 10, opening the side 10. The allowance covers
  // CI timing; the ceilings are call budgets, so a duplicate read or a whole page read again lands above them.
  const MEASURED = { chooser: 15, todo: 39, project: 31, tab: 10, side: 10 };
  const CALL_SLACK = 3;
  for (const name of PHASES) {
    assert.ok(requestsIn(name).length <= MEASURED[name] + CALL_SLACK, `${name}: ${requestsIn(name).length} requests, over the measured ${MEASURED[name]} + ${CALL_SLACK} allowance`);
  }
  // Each step really mounts a plugin frame, and a document asked for the shared stylesheet at least once: without this, the checks
  // below could pass because nothing was mounted or fetched at all (b51cb696d1 counted a page registration in every step, 1-2
  // each, and the sheet on each page load; a step whose document was already loaded may take it from the document's own cache).
  for (const name of PHASES) {
    assert.ok(requestsIn(name).some(one => one.method === "POST" && one.path === "/api/host/plugin-pages"), `${name}: a plugin frame registered its page`);
  }
  assert.ok(seen.some(one => one.path === "/assets/molis-work-workbench.css"), "a document asked for the shared stylesheet");
  // A page registered for a frame is kept while the frame is up: none of these steps takes one back as soon as it was made.
  assert.deepEqual(seen.filter(one => one.method === "DELETE" && one.path.startsWith("/api/host/plugin-pages")).map(one => one.phase), [], "no frame's page is taken back while it shows");
  // What waits on the person is read exactly once for a page that loads, however many readers ask (the review saw 3; b51cb696d1
  // counted 1 in each of these steps).
  for (const name of ["chooser", "todo", "project"]) assert.equal(requestsIn(name).filter(one => one.path === "/api/attention").length, 1, `${name}: one attention read`);
  // Each document asks for the shared stylesheet once (a plugin's frame is a document of its own, with its own cache).
  const sheets = new Map<string, number>();
  for (const one of seen.filter(entry => entry.path === "/assets/molis-work-workbench.css")) sheets.set(`${one.phase} ${one.frame}`, (sheets.get(`${one.phase} ${one.frame}`) ?? 0) + 1);
  assert.deepEqual([...sheets].filter(([, n]) => n > 1), [], "no document loads the shared stylesheet twice");
});
