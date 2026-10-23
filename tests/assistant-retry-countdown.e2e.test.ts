import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { openWork, readWork, waitWork } from "./fixtures/assistant-send-journey.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// specs/visual-ui-experience VUX-20, VUX-43 (user decision 2026-10-23 ③): a model call the provider rate-limits is retried by the
// runtime, not the page. While it waits the round says why and counts down to the runtime's own retry time in a fixed-width MM:SS;
// once the retried call answers, the countdown is gone and the answer is there. The provider is a local model that refuses the
// first Assistant call with 429 and Retry-After: 5.
test("VUX-20/VUX-43: a rate-limited round counts down to the runtime's retry time, then answers", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "user"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await issueModel(t, browser.homeDirectory, { replyText: "限流之后答上了。", rateLimited: { times: 1, retryAfterSeconds: 5 } });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  const sent = await evaluate<AssistantSendResult>(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/send`)}, { method: 'POST', headers: molisWorkControlHeaders(),
    body: JSON.stringify({ text: '整理一下本周进展', request_id: crypto.randomUUID(), scope: { kind: 'project', project_id: ${JSON.stringify(projectId)} } }) }).then(r => r.json())`);
  const id = sent.work.work_id;
  await openWork(browser, id);

  // The Host carries the runtime's time and reason; the page reads them, it does not invent a retry.
  const waiting = await waitWork(browser, id, view => Boolean(view.rounds.at(-1)?.retry_wait));
  const wait = waiting.rounds.at(-1)!.retry_wait!;
  assert.equal(wait.reason, "rate-limited");
  assert.equal(wait.attempt, 1);
  const left = Date.parse(wait.until) - Date.now();
  assert.ok(left > 0 && left <= 5_500, `the retry time is the provider's Retry-After from now (${left} ms)`);

  const status = "document.querySelector('[data-assistant-thread] .assistant-round-status[data-retry-until]')";
  await waitFor(`${status}?.textContent.startsWith('被限流，')`, 10_000);
  const read = () => evaluate<{ text: string; width: number; numeric: string }>(`(() => { const s = ${status}; return s ? { text: s.textContent, width: s.getBoundingClientRect().width,
    numeric: getComputedStyle(s).fontVariantNumeric } : null; })()`);
  const first = await read();
  assert.match(first.text, /^被限流，00:0[1-5] 后自动重试$/);
  assert.equal(first.numeric, "tabular-nums", "the digits keep their width while they count");
  await new Promise(resolve => setTimeout(resolve, 1_200));
  const second = await read();
  assert.match(second.text, /^被限流，00:0[0-4] 后自动重试$|^正在重试…$/);
  if (second.text !== "正在重试…") {
    assert.ok(Number(second.text.slice(7, 9)) < Number(first.text.slice(7, 9)), `it counts down: ${first.text} → ${second.text}`);
    assert.ok(Math.abs(second.width - first.width) < 0.5, "the line keeps its width from one second to the next");
  }

  // The retried call answers: the round ends with the answer and nothing is left counting.
  const done = await waitWork(browser, id, view => view.work.state === "completed");
  assert.equal(done.rounds.at(-1)?.retry_wait, undefined);
  await waitFor(`document.querySelector('[data-assistant-thread]')?.textContent.includes('限流之后答上了。') && !${status}`, 15_000);
  assert.equal((await readWork(browser, id)).rounds.length, 1, "one round: the page did not send again");
});
