import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * W4-10: an idle project home tab asks the Host for little. What waits on the person (background tasks, the Assistant's
 * notices, plugin deliveries) is one read every 15 seconds (`/api/attention`), and the home's own refresh is every 30;
 * nothing else polls while the person does nothing. The budget is per minute of a visible, untouched tab.
 */
const BUDGET_PER_MINUTE = 6;

test("W4-10-02 an idle home tab stays within its request budget: one attention read every 15 seconds and the home's own refresh", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, waitFor, evaluate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const send = window.fetch.bind(window); window.__requests = [];
    window.fetch = (input, init) => { window.__requests.push({ at: performance.now(), url: new URL(typeof input === 'string' ? input : input.url, location.href).pathname }); return send(input, init); }; })();` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && Boolean(document.querySelector('.workbench-bar'))", 30_000);
  // Opening the page reads what it shows; the minute starts once that is done.
  await waitFor("window.__requests.some(request => request.url.endsWith('/api/attention'))", 15_000);
  await new Promise(resolve => setTimeout(resolve, 3_000));
  const start = await evaluate<number>("performance.now()");
  await new Promise(resolve => setTimeout(resolve, 60_000));
  const requests = await evaluate<Array<{ at: number; url: string }>>(`window.__requests.filter(request => request.at > ${start})`);
  const byPath = requests.reduce<Record<string, number>>((counts, request) => ({ ...counts, [request.url]: (counts[request.url] ?? 0) + 1 }), {});
  assert.ok(requests.length <= BUDGET_PER_MINUTE, `an idle minute asked ${requests.length} times: ${JSON.stringify(byPath)}`);
  assert.equal(byPath[`/projects/${projectId}/api/attention`], 4, `what waits on the person is read every 15 seconds: ${JSON.stringify(byPath)}`);
  for (const old of ["/api/background-tasks", `/projects/${projectId}/api/plugins/runtime/events`, `/projects/${projectId}/api/assistant/notices`]) {
    assert.equal(byPath[old], undefined, `${old} is no longer polled on its own`);
  }
});
