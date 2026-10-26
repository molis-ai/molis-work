import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { openWork, readWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

// W2-18-PAGE-CARDS-01: two actual page offers share a work; rendering one cannot remove its sibling.
test("W2-18-PAGE-CARDS-01: both page cards remain visible and executing or ignoring each survives rereading", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t, false); if (!browser) return;
  const offer = (title: string, work?: string) => browser.evaluate<{ work_id: string; card: AssistantCard }>(`fetch('/projects/${browser.projectId}/api/assistant/cards', {
    method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({ message_id: crypto.randomUUID(), source: { surface: 'pages', title: 'Pages' },
      ${work ? `work_id: ${JSON.stringify(work)},` : ""} card: { title: ${JSON.stringify(title)}, summary: '把选中的文字记到待办', reference: { capability_id: 'todo.items.create', version: 1, provider_id: 'io.molis.work.todo' },
        input: { title: ${JSON.stringify(title)}, placement: 'project' } } })
  }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(JSON.stringify(body)); return body; })`);
  const first = await offer("执行第一张页面卡"), second = await offer("忽略第二张页面卡", first.work_id);
  assert.equal(second.work_id, first.work_id);
  assert.deepEqual((await readWork(browser, first.work_id)).cards.map(card => card.status), ["ready", "ready"]);
  await openWork(browser, first.work_id);
  await browser.waitFor("document.querySelector('[data-assistant-thread] > [data-card]')");
  const cards = () => browser.evaluate<Array<[string, string]>>("[...document.querySelectorAll('[data-assistant-thread] > [data-card]')].map(node => [node.dataset.card, node.dataset.status])");
  assert.deepEqual(await cards(), [[first.card.card_id, "ready"], [second.card.card_id, "ready"]], "both Host cards must be reachable in the same work");
  const savedTodos = () => {
    const store = openTodoStore(browser.homeDirectory);
    try { return store.list({ projectId: browser.projectId, projectIds: [], actor: "user", actorId: "web-user" }).map(todo => todo.title); }
    finally { store.close(); }
  };
  assert.ok(!savedTodos().includes("执行第一张页面卡"), "placing a card performs no business action");
  await browser.click(`[data-assistant-thread] > [data-card="${first.card.card_id}"] [data-ix-action="run"]`);
  await browser.waitFor(`document.querySelector('[data-assistant-thread] > [data-card="${first.card.card_id}"]')?.dataset.status === 'done'`);
  assert.deepEqual(await cards(), [[first.card.card_id, "done"], [second.card.card_id, "ready"]], "executing the first leaves the second ready");
  assert.equal(savedTodos().filter(title => title === "执行第一张页面卡").length, 1);
  await browser.click(`[data-assistant-thread] > [data-card="${second.card.card_id}"] [data-ix-action="dismiss"]`);
  await browser.waitFor(`!document.querySelector('[data-assistant-thread] > [data-card="${second.card.card_id}"]')`);
  assert.deepEqual((await readWork(browser, first.work_id)).cards.map(card => [card.card_id, card.status]), [[first.card.card_id, "done"], [second.card.card_id, "dismissed"]]);
  assert.ok(!savedTodos().includes("忽略第二张页面卡"), "ignoring the second performs no business action");
  await browser.reloadPage();
  await browser.waitFor(`document.querySelector('[data-assistant-thread] > [data-card="${first.card.card_id}"]')?.dataset.status === 'done'`);
  assert.deepEqual(await cards(), [[first.card.card_id, "done"]], "rereading keeps the executed card and omits only the dismissed sibling");
  assert.equal(savedTodos().filter(title => title === "执行第一张页面卡").length, 1, "rereading never repeats the action");
});
