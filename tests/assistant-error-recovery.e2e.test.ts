import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantWork, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { saveFirstModel, standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

// W3-02-G3-03: observe the real failure response, then use its repair link and continue the same persisted work.
test("Assistant keeps the failed Send's draft and work from details, and its model-settings link repairs that work", { timeout: 120_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const model = await startModelStandIn(standInKey, "周报已整理");
  t.after(() => model.close());
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1&openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-input]')");
  // Only observe an actual response; leave the request and reply consumed by the product untouched.
  await evaluate(`(() => { window.g3Sends = []; const send = window.fetch.bind(window); window.fetch = async (url, init) => {
    const response = await send(url, init);
    if (init?.method === 'POST' && new URL(String(url), location.origin).pathname.endsWith('/api/assistant/send'))
      window.g3Sends.push({ status: response.status, input: JSON.parse(init.body), body: await response.clone().json() });
    return response; }; })()`);
  const text = "帮我整理本周进展";
  await click("[data-assistant-input]");
  await command("Input.insertText", { text }, sessionId);
  await click("[data-assistant-send]");
  await waitFor("window.g3Sends.length === 1 && document.querySelector('.assistant-problem a')", 10_000);
  const refused = await evaluate<{ status: number; input: { request_id: string }; body: { code: string; details: { work: AssistantWork; action: string } } }>("window.g3Sends[0]");
  assert.deepEqual([refused.status, refused.body.code, refused.body.details.action], [400, "assistant.model_missing", "打开模型设置"]);
  assert.equal(Object.hasOwn(refused.body, "work"), false); assert.equal(Object.hasOwn(refused.body, "action"), false);
  assert.equal(refused.body.details.work.draft, text); assert.ok(refused.input.request_id);
  const workId = refused.body.details.work.work_id;
  const api = `/projects/${projectId}/api/assistant/works/${workId}`;
  const read = () => evaluate<AssistantWorkView>(`fetch(${JSON.stringify(api)}).then(r => r.json())`);
  assert.equal((await read()).work.draft, text);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), text);
  await click(".assistant-problem a");
  await waitFor("document.querySelector('[data-model-settings] [data-model-template]')", 10_000);
  await saveFirstModel(browser, model.baseUrl);
  await waitFor("!document.querySelector('[data-cover-chip]') && !document.querySelector('.assistant-problem')", 15_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), text);
  await click("[data-assistant-send]");
  await waitFor("window.g3Sends.length === 2", 10_000);
  const continued = await evaluate<{ status: number; input: { work_id: string }; body: { work: AssistantWork } }>("window.g3Sends[1]");
  assert.deepEqual([continued.status, continued.input.work_id, continued.body.work.work_id], [200, workId, workId]);
  await waitFor(`document.querySelector('[data-assistant-thread]')?.textContent.includes('周报已整理')`, 15_000);
  const view = await read();
  assert.equal(view.work.work_id, workId); assert.equal(view.work.draft, "");
  assert.deepEqual(view.rounds.map(round => round.text), [text], "repair sent the saved draft once in the existing work");
});
