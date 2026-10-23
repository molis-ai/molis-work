import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openWork, waitWork } from "./fixtures/assistant-send-journey.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// specs/visual-ui-experience VUX-12, VUX-20 (found in the second real-scenario walk, 2026-10-23): stopping a running round, the
// Host answers with the work already stopped while the round itself is still ending. The page stopped following the moment
// the work was no longer live, so the round said 正在处理… for good, though the Host had it stopped. The page keeps following
// until the round itself has ended. Chrome hands the page the Host's own control answer as it was in that moment (the round
// still running), so the case does not depend on the race.
test("VUX-12/VUX-20: a stopped round's line settles after Stop, though the Host's answer came while the round was still ending", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "user"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  let release!: () => void;
  await issueModel(t, browser.homeDirectory, { replyText: "不会答到这里。", held: new Promise<void>((resolve) => { release = resolve; }) });
  t.after(() => release());
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  const sent = await evaluate<AssistantSendResult>(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/send`)}, { method: 'POST', headers: molisWorkControlHeaders(),
    body: JSON.stringify({ text: '写一份很长的读书笔记模板', request_id: crypto.randomUUID(), scope: { kind: 'project', project_id: ${JSON.stringify(projectId)} } }) }).then(r => r.json())`);
  const id = sent.work.work_id;
  await openWork(browser, id);
  await waitWork(browser, id, (view) => view.rounds.at(-1)?.phase === "running");
  const status = "[...document.querySelectorAll('[data-assistant-thread] .assistant-round-status')].at(-1)";
  await waitFor(`${status}?.dataset.phase === 'running'`, 10_000);

  // The control answer reaches the page as the Host gave it at that moment: the work stopped, its round not yet ended.
  let rewritten = 0;
  const off = browser.on("Fetch.requestPaused", async (event, session) => {
    if (session !== sessionId) return;
    const body = await command<{ body: string; base64Encoded: boolean }>("Fetch.getResponseBody", { requestId: event.requestId }, sessionId);
    const view = JSON.parse(body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body) as AssistantWorkView;
    const last = view.rounds.at(-1)!;
    Object.assign(last, { phase: "running", ended_at: null }); delete last.stop_reason;
    rewritten += 1;
    await command("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: event.responseStatusCode, responseHeaders: event.responseHeaders,
      body: Buffer.from(JSON.stringify(view)).toString("base64") }, sessionId);
  });
  t.after(off);
  await command("Fetch.enable", { patterns: [{ urlPattern: `*/api/assistant/works/${id}/control`, requestStage: "Response" }] }, sessionId);
  await evaluate(`[...document.querySelectorAll('[data-assistant-control="stop"]:not([data-keep-connections])')].find((b) => b.offsetParent).click()`);
  await waitFor(`document.querySelector('[data-assistant-control="stop"]:not([data-keep-connections])')?.offsetParent === null`, 10_000);
  assert.equal(rewritten, 1, "the page took the control answer with the round still ending");
  await command("Fetch.disable", {}, sessionId);
  release();

  // The Host ends the round; the page follows it there and the line no longer says it is working.
  const stopped = await waitWork(browser, id, (view) => view.rounds.at(-1)?.phase === "stopped");
  assert.equal(stopped.work.state, "stopped");
  await waitFor(`${status}?.dataset.phase === 'stopped' && !${status}.textContent.includes('正在处理')`, 15_000);
});
