import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { AssistantRound } from "@molis-ai/molis-work-contracts/services/assistant";
import { openWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

type Trail = AssistantRound["memories_used"];
const selector = "[data-assistant-panel] .assistant-round .assistant-memories";
const node = `document.querySelector(${JSON.stringify(selector)})`;
const remembered = { memory_id: "remembered", version: 1, scope: "personal" as const, text: "Keep release notes concise", origin: "User request" };

/** Real Work/HTTP/Chrome; replacing the read DTO exercises rendering, not SDK delivery or model quality. */
async function memoryPage(t: TestContext) {
  const browser = await sendBrowser(t); if (!browser) return null;
  const id = await seedWork(browser, "整理发布说明");
  await browser.evaluate(`(() => { const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
    if (path !== ${JSON.stringify(`/projects/${browser.projectId}/api/assistant/works/${id}`)} || (init?.method && init.method !== 'GET')) return response;
    const view = await response.json(); view.rounds.at(-1).memories_used = window.__memoryTrail;
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  const show = async (trail: Trail, refresh = false) => {
    await browser.evaluate(`window.__memoryTrail = ${JSON.stringify(trail) ?? "undefined"}`);
    if (refresh) await browser.evaluate("window.dispatchEvent(new Event('focus'))");
    else await openWork(browser, id);
  };
  return { ...browser, show };
}

test("empty current memory references remove the prior text from the same round", { timeout: 60_000 }, async t => {
  const page = await memoryPage(t); if (!page) return;
  for (const empty of [undefined, { used: [], omitted: [] }]) {
    await page.show({ used: [remembered], omitted: [] });
    await page.waitFor(`${node}?.textContent.includes('Keep release notes concise')`);
    await page.show(empty);
    await page.waitFor(`!${node}`, 5000);
    assert.equal(await page.evaluate<boolean>("document.querySelector('[data-assistant-panel]').textContent.includes('Keep release notes concise')"), false);
  }
});

test("memory reference presentation keeps delivery uncertainty, changed content and unsaved round records distinct", { timeout: 60_000 }, async t => {
  const page = await memoryPage(t); if (!page) return;
  const trail: Trail = { used: [remembered, { ...remembered, memory_id: "changed", scope: "project", text: "NEWER_BODY_NOT_SENT", content_changed: true }],
    uncertain: [{ ...remembered, memory_id: "uncertain", scope: "character", text: "Unconfirmed delivery" }],
    omitted: [{ ...remembered, memory_id: "omitted", text: "Not sent due to budget", reason: "budget" }], recording_error: "memory.receipt_unrecorded" };
  await page.show(trail);
  await page.waitFor(`${node}?.textContent.includes('本轮参考记录未保存')`);
  await page.click(selector + " > summary");
  const shown = await page.evaluate<{ summary: string; rows: string[]; text: string }>(`(() => { const box = ${node}; window.__memoryBox = box;
    box.querySelector('summary').focus(); return { summary: box.firstElementChild.textContent,
      rows: [...box.querySelectorAll('.assistant-memory')].map(row => row.textContent), text: box.textContent }; })()`);
  assert.equal(shown.summary, "已提供 2 条记忆 · 没带上 1 条");
  assert.deepEqual(shown.rows, ["个人Keep release notes concise", "本项目记忆已更新，隐藏旧内容", "角色Unconfirmed delivery", "个人Not sent due to budget"]);
  assert.match(shown.text, /记忆送达未确认/);
  assert.doesNotMatch(shown.text, /NEWER_BODY_NOT_SENT/);

  await page.show({ used: [{ ...remembered, text: "A visible updated reference" }], omitted: [] }, true);
  await page.waitFor(`${node}?.textContent.includes('A visible updated reference')`);
  assert.deepEqual(await page.evaluate(`({ same: ${node} === window.__memoryBox, open: window.__memoryBox.open,
    focused: document.activeElement === window.__memoryBox.querySelector('summary') })`), { same: true, open: true, focused: true });
  assert.doesNotMatch(await page.evaluate<string>(`${node}.textContent`), /未确认|未保存|旧内容|Unconfirmed delivery|Not sent due to budget/);
  await page.show({ used: [], omitted: [], unverified: true });
  await page.waitFor(`${node}?.textContent.includes('记忆送达未确认')`);
  assert.equal(await page.evaluate<string>(`${node}.firstElementChild.textContent`), "已提供 0 条记忆");
  assert.equal(await page.evaluate<number>(`${node}.querySelectorAll('.assistant-memory').length`), 0, "legacy unknown evidence does not fabricate a reference");
});
