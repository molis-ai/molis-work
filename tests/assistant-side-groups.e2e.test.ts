import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantBackgroundJob, AssistantUndoable, AssistantUnsettledChange } from "@molis-ai/molis-work-contracts/services/assistant";
import { openWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-08, VUX-22: the Assistant's side groups what a work made, changed and still runs elsewhere
// into one disclosure each. A real work on a real Host; its change and job rows, which only an owner's undoable action or
// background job writes, are added to the view the page reads, in the contract's shape.
const at = "2026-10-19T08:00:00.000Z";
const undoable: AssistantUndoable[] = [
  { undo_id: "u1", title: "Todo · 新建「周报」", state: "available", created_at: at, capability_id: "todo.items.create" },
  { undo_id: "u2", title: "Pages · 改写「发布计划」", state: "failed", created_at: at, detail: "文档已被别人改过" },
];
const unsettled: AssistantUnsettledChange[] = [];
const job = (state: AssistantBackgroundJob["state"]): AssistantBackgroundJob[] => [{ job_id: "j1", work_id: "", title: "Feed · 抓取订阅", state, started_at: at }];

test("VUX-08 VUX-22: 产出, 变更 and 后台任务 are one disclosure each; folded they keep the summary that matters, open and fold to natural height, and an update never unfolds them", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId } = browser;
  const id = await seedWork(browser, "整理本周的变更");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await evaluate(`(() => { window.__jobState = "running"; const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (!/\\/api\\/assistant\\/works\\/${id}$/.test(path) || (init && init.method && init.method !== "GET")) return response;
    const view = await response.json();
    Object.assign(view, { undoable: ${JSON.stringify(undoable)}, unsettled: ${JSON.stringify(unsettled)}, jobs: ${JSON.stringify(job("running"))}.map((one) => ({ ...one, state: window.__jobState })) });
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  await openWork(browser, id);
  const block = (key: string) => `document.querySelector('[data-assistant-block="${key}"]')`;
  await waitFor(`${block("changes")}?.checkVisibility() && ${block("background")}?.checkVisibility()`, 15_000);

  assert.equal(await evaluate<boolean>(`${block("results")}.hidden`), true, "nothing made: no 产出 card is drawn for it");
  const head = (key: string) => `${block(key)}.querySelector('.assistant-block-head')`;
  const badge = (key: string) => evaluate<[string, boolean]>(`(() => { const b = ${block(key)}.querySelector('.assistant-block-badge'); return [b.textContent, b.classList.contains('is-attention')]; })()`);
  assert.deepEqual(await badge("changes"), ["1 项失败", true], "a failed change is the summary, and it stands out");
  assert.deepEqual(await badge("background"), ["1 项进行中", false]);
  assert.deepEqual(await evaluate(`[${head("changes")}.getAttribute('aria-expanded'), ${head("changes")}.getAttribute('aria-controls') === ${block("changes")}.querySelector('.assistant-block-body').id]`), ["true", true]);
  assert.equal(await evaluate<string>(`[...${block("changes")}.querySelectorAll('.assistant-item')].map((n) => n.textContent).join('|').includes('文档已被别人改过')`), true, "open, each change says how it stands");

  // Folding: the height runs from open to the heading alone, through the heights between, and the body leaves reach.
  // The page holds still under automation (craft-finish STILL_RESET); this check lifts that to see the motion itself.
  await evaluate(`document.documentElement.removeAttribute('data-craft-still')`);
  const open = await evaluate<number>(`${block("changes")}.getBoundingClientRect().height`);
  const headHeight = await evaluate<number>(`${head("changes")}.getBoundingClientRect().height`);
  await click(`[data-assistant-block="changes"] .assistant-block-head`);
  await new Promise(resolve => setTimeout(resolve, 70));
  const between = await evaluate<number>(`${block("changes")}.getBoundingClientRect().height`);
  assert.ok(between < open - 2 && between > headHeight + 2, `the fold passes through natural heights (${headHeight} < ${between} < ${open})`);
  await waitFor(`Math.abs(${block("changes")}.getBoundingClientRect().height - ${head("changes")}.getBoundingClientRect().height) < 1`);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate<string>(`${head("changes")}.getAttribute('aria-expanded')`), "false");
  assert.equal(await evaluate<boolean>(`[...${block("changes")}.querySelectorAll('button')].filter((b) => !b.closest('.assistant-block-head')).some((b) => b.checkVisibility({ visibilityProperty: true }))`), false, "folded, its buttons cannot be reached");
  assert.deepEqual(await badge("changes"), ["1 项失败", true], "folded, the failure still shows");

  // An update arrives: the job finished. The folded group stays folded; the other's summary follows.
  await evaluate(`window.__jobState = "completed"`);
  await openWork(browser, id);
  await waitFor(`${block("background")}.querySelector('.assistant-block-badge')?.textContent === '1'`);
  assert.equal(await evaluate<string>(`${head("changes")}.getAttribute('aria-expanded')`), "false", "an update never unfolds what the person folded");

  // Opening runs the other way and the rows come back into reach.
  await click(`[data-assistant-block="changes"] .assistant-block-head`);
  await waitFor(`Math.abs(${block("changes")}.getBoundingClientRect().height - ${open}) < 2`);
  assert.equal(await evaluate<boolean>(`[...${block("changes")}.querySelectorAll('.assistant-item button')].some((b) => b.checkVisibility({ visibilityProperty: true }))`), true);
});
