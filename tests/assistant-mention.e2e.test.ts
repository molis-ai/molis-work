import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience §composer-mentions「触发范围」(VUX-17): what the “@” list shows is always for the words typed now.
// A search still on its way dims the hits already there and they cannot be chosen; a late answer for older words never
// stands in for the newer ones; no hits and a failed search each say so; a chosen hit replaces exactly the “@words” it was
// found for, and the caret lands right after it.

/** The system search, held until the test answers it: `searches.answer(query, hits | "fail")`. */
const HOLD_SEARCH = `(() => {
  const real = window.fetch.bind(window), held = new Map();
  window.searches = { asked: () => [...held.keys()], answer: (query, hits) => { const h = held.get(query); held.delete(query); h(hits); } };
  window.fetch = (input, init) => {
    const url = String(input && input.url || input);
    if (!url.endsWith('/api/search/query')) return real(input, init);
    const { query } = JSON.parse(init.body);
    return new Promise((resolve) => held.set(query, (hits) => resolve(hits === 'fail'
      ? new Response(JSON.stringify({ error: '搜索服务没有回应', code: 'search.unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ status: 'ready', hits }), { status: 200, headers: { 'content-type': 'application/json' } }))));
  };
})()`;

const hit = (id: string, title: string, plugin = "Pages") => ({ hit_id: "h-" + id, plugin_id: "pages", plugin_title: plugin, title, snippet: title + " 的摘要",
  subject: { kind: "pages_document", id }, open: { surface: "pages" } });

test("VUX-17: the @ list is always for the words typed now, says when it is looking, empty or failed, and puts the caret after the chosen reference", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] [data-assistant-input]')", 20_000);
  await evaluate(HOLD_SEARCH);
  const field = "document.querySelector('[data-assistant-input]')", list = "document.querySelector('[data-assistant-starters]')";
  await evaluate(`${field}.focus()`);
  const type = (text: string) => command("Input.insertText", { text }, sessionId);
  const shown = () => evaluate<{ busy: boolean; hits: Array<{ text: string; stale: boolean; disabled: boolean }>; notes: string[] }>(`(() => { const pop = ${list};
    return { busy: pop.getAttribute('aria-busy') === 'true', hits: [...pop.querySelectorAll('.assistant-mention')].map((b) => ({ text: b.querySelector('.assistant-mention-title').textContent, stale: b.classList.contains('is-stale'), disabled: b.disabled })),
      notes: [...pop.querySelectorAll('.assistant-material-origin')].map((p) => p.textContent) }; })()`);

  await type("看看 @");
  await waitFor(`!${list}.hidden && ${list}.dataset.mode === 'mention'`);
  assert.deepEqual((await shown()).notes, ["输入关键词，从本项目和你个人的内容里找"], "no words yet: it says what to type");

  // The first words: looking, then their hits.
  await type("发布");
  await waitFor("searches.asked().includes('发布')");
  assert.deepEqual(await shown(), { busy: true, hits: [], notes: ["正在找「发布」…"] }, "it says what it is looking for");
  await evaluate(`searches.answer('发布', ${JSON.stringify([hit("a", "发布计划"), hit("b", "发布计划", "Issues")])})`);
  await waitFor(`${list}.querySelectorAll('.assistant-mention').length === 2`);
  assert.deepEqual((await shown()).hits.map((row) => row.text), ["Pages · 发布计划", "Issues · 发布计划"], "the same name in two places says where each is");

  // More words: the hits for the older ones stay in view, dimmed, and cannot be chosen until the new answer comes.
  await type("计");
  await waitFor("searches.asked().includes('发布计')");
  let now = await shown();
  assert.equal(now.busy, true);
  assert.deepEqual(now.hits.map((row) => [row.stale, row.disabled]), [[true, true], [true, true]], "the older hits are dimmed and off");
  assert.deepEqual(now.notes, ["正在找「发布计」…"]);
  // And more again before that answer: the late answer for 「发布计」 does not stand in for 「发布计划」.
  await type("划");
  await waitFor("searches.asked().includes('发布计划')");
  await evaluate(`searches.answer('发布计划', ${JSON.stringify([hit("c", "发布计划 · 第二版")])})`);
  await waitFor(`${list}.getAttribute('aria-busy') !== 'true'`);
  await evaluate(`searches.answer('发布计', ${JSON.stringify([hit("x", "旧词的结果")])})`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  now = await shown();
  assert.deepEqual(now.hits, [{ text: "Pages · 发布计划 · 第二版", stale: false, disabled: false }], "only the answer for the words typed now");

  // Chosen with words after it: exactly 「@发布计划」 is replaced, and the caret is right after the reference.
  await evaluate(`(() => { const f = ${field}; const at = f.value.length; f.value += ' 明天发'; f.setSelectionRange(at, at); })()`);
  await evaluate(`${list}.querySelector('.assistant-mention').click()`);
  const after = await evaluate<{ value: string; caret: number; hidden: boolean; chip: boolean }>(`(() => { const f = ${field};
    return { value: f.value, caret: f.selectionStart, hidden: ${list}.hidden, chip: [...document.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip')].some((c) => c.textContent.includes('发布计划 · 第二版')) }; })()`);
  assert.equal(after.value, "看看 「发布计划 · 第二版」 明天发");
  assert.equal(after.caret, "看看 「发布计划 · 第二版」".length, "the caret lands right after the reference");
  assert.equal(after.hidden, true);
  assert.equal(after.chip, true, "the reference is on the strip by the same name");

  // No hits, and a failed search, each say so.
  await evaluate(`(() => { const f = ${field}; f.setSelectionRange(f.value.length, f.value.length); })()`);
  await type(" @无");
  await waitFor("searches.asked().includes('无')");
  await evaluate("searches.answer('无', [])");
  await waitFor(`${list}.textContent.includes('没有找到')`);
  assert.equal((await shown()).busy, false);
  await type("人");
  await waitFor("searches.asked().includes('无人')");
  await evaluate("searches.answer('无人', 'fail')");
  await waitFor(`${list}.textContent.includes('搜索服务没有回应')`);
  now = await shown();
  assert.deepEqual([now.busy, now.hits.length], [false, 0], "a failure says why and leaves nothing to choose");
});
