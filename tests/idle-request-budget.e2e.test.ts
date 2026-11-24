import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * W4-10: an idle project home tab asks the Host for little. What waits on the person (background tasks, the Assistant's
 * notices, plugin deliveries) is read when the Host says something changed (`/api/attention/events`, WLN-27, user decision
 * 2026-11-15), not on a beat: an idle minute with nothing changing reads it not at all. The budget is per minute of a
 * visible, untouched tab.
 */
const BUDGET_PER_MINUTE = 6;

test("W4-10-02 WLN-27 an idle home tab stays within its request budget: what waits on the person is read on the Host's word, not on a beat", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, waitFor, evaluate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const send = window.fetch.bind(window); window.__requests = [];
    window.fetch = (input, init) => { window.__requests.push({ at: performance.now(), url: new URL(typeof input === 'string' ? input : input.url, location.href).pathname }); return send(input, init); }; })();` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && Boolean(document.querySelector('.workbench-bar'))", 30_000);
  // This seeded home also mounts the Goals collection. Its first acknowledgement follows the initial attention
  // response on the board polling cycle, and applying that collection starts the home reads. Measure a full
  // idle minute after that bootstrap, including all subsequent requests from the same paths.
  await waitFor("window.__requests.some(request => request.url.endsWith('/api/attention'))", 15_000);
  await waitFor("Number.isInteger(document.querySelector('#molis-work-data')?.boardCursor)", 15_000);
  const start = await evaluate<number>("performance.now()");
  await new Promise(resolve => setTimeout(resolve, 60_000));
  const requests = await evaluate<Array<{ at: number; url: string }>>(`window.__requests.filter(request => request.at > ${start})`);
  const byPath = requests.reduce<Record<string, number>>((counts, request) => ({ ...counts, [request.url]: (counts[request.url] ?? 0) + 1 }), {});
  assert.ok(requests.length <= BUDGET_PER_MINUTE, `an idle minute asked ${requests.length} times: ${JSON.stringify(byPath)}`);
  assert.equal(byPath[`/projects/${projectId}/api/attention`], undefined, `nothing changed, so what waits on the person is not read again: ${JSON.stringify(byPath)}`);
  assert.equal(byPath[`/projects/${projectId}/api/board/refresh`], undefined, "the initial collection was applied and its cursor did not move");
  for (const old of ["/api/background-tasks", `/projects/${projectId}/api/plugins/runtime/events`, `/projects/${projectId}/api/assistant/notices`]) {
    assert.equal(byPath[old], undefined, `${old} is no longer polled on its own`);
  }
});
