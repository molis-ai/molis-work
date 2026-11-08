import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience §composer-mentions「触发范围」(VUX-17), in the unified composer (K3, UIV-14): the Assistant's “@” is
// the component's system search now, the same in every page that mounts a composer. What the list shows is always for the words
// typed now: while it looks it says so, a late answer for older words never stands in for the newer ones, no hits and a failed
// search each say so, and a chosen hit takes exactly the “@words” it was found for out of the text and goes with the Send as a
// reference, the caret where the words were.

/** The system search, held until the test answers it: `searches.answer(query, hits | "fail")`; and each Send's body as the page made it. */
const HOLD_SEARCH = `(() => {
  const real = window.fetch.bind(window), held = new Map();
  window.searches = { asked: () => [...held.keys()], answer: (query, hits) => { const h = held.get(query); held.delete(query); h(hits); } };
  window.__sent = [];
  window.fetch = (input, init) => {
    const url = String(input && input.url || input);
    if (/\\/api\\/assistant\\/send$/.test(url) && init && init.body) window.__sent.push(JSON.parse(String(init.body)));
    if (!url.endsWith('/api/search/query')) return real(input, init);
    const { query } = JSON.parse(init.body);
    return new Promise((resolve) => held.set(query, (hits) => resolve(hits === 'fail'
      ? new Response(JSON.stringify({ error: '搜索服务没有回应', code: 'search.unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ status: 'ready', hits }), { status: 200, headers: { 'content-type': 'application/json' } }))));
  };
})()`;

const hit = (id: string, title: string, plugin = "Pages") => ({ hit_id: "h-" + id, plugin_id: "pages", plugin_title: plugin, title, snippet: title + " 的摘要",
  subject: { kind: "pages_document", id }, revision: "r-" + id, open: { surface: "pages" } });

test("VUX-17 UIV-14: the Assistant's @ list is always for the words typed now, says when it is looking, empty or failed, and a chosen hit goes with the Send", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input')", 20_000);
  await evaluate(HOLD_SEARCH);
  const field = "document.querySelector('[data-assistant-composer] .mw-composer__input')", list = "document.querySelector('[data-assistant-composer] [data-compose-menu]')";
  await evaluate(`${field}.focus()`);
  const type = (text: string) => command("Input.insertText", { text }, sessionId);
  const shown = () => evaluate<{ open: boolean; hits: Array<{ text: string; from: string }>; notes: string[] }>(`(() => { const pop = ${list};
    return { open: !pop.hidden, hits: [...pop.querySelectorAll('[data-composer-mention]')].map((b) => ({ text: b.querySelector('[id$="-label"]')?.textContent ?? b.textContent, from: b.querySelector('.mw-menu__desc')?.textContent ?? '' })),
      notes: [...pop.querySelectorAll('.mw-composer__line')].map((p) => p.textContent) }; })()`);

  // A bare @ has nothing to look for yet: no list, no search.
  // The "@" is typed on its own, as a key press gives it (the component starts a search on an "@" after a space).
  await type("看看 "); await type("@");
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal((await shown()).open, false, "no words yet: nothing opens");
  assert.deepEqual(await evaluate("searches.asked()"), []);

  // The first words: looking, then their hits, each saying which plugin it is from.
  await type("发布");
  await waitFor("searches.asked().includes('发布')");
  assert.deepEqual(await shown(), { open: true, hits: [], notes: ["正在找…"] }, "it says it is looking");
  await evaluate(`searches.answer('发布', ${JSON.stringify([hit("a", "发布计划"), hit("b", "发布计划", "Issues")])})`);
  await waitFor(`${list}.querySelectorAll('[data-composer-mention]').length === 2`);
  assert.deepEqual((await shown()).hits.map((row) => row.from), ["Pages", "Issues"], "the same name in two places says where each is");

  // More words, and more again before that answer: the late answer for 「发布计」 does not stand in for 「发布计划」.
  await type("计");
  await waitFor("searches.asked().includes('发布计')");
  assert.deepEqual((await shown()).notes, ["正在找…"], "while the newer words are looked for, the older hits are not offered");
  await type("划");
  await waitFor("searches.asked().includes('发布计划')");
  await evaluate(`searches.answer('发布计划', ${JSON.stringify([hit("c", "发布计划 · 第二版")])})`);
  await waitFor(`${list}.querySelectorAll('[data-composer-mention]').length === 1`);
  await evaluate(`searches.answer('发布计', ${JSON.stringify([hit("x", "旧词的结果")])})`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const now = await shown();
  assert.deepEqual(now.hits.map((row) => row.text), ["发布计划 · 第二版"], "only the answer for the words typed now");

  // Chosen: exactly 「@发布计划」 comes out, the caret is where it was, and the reference is on the composer's strip.
  await evaluate(`${list}.querySelector('[data-composer-mention]').click()`);
  const after = await evaluate<{ value: string; caret: number; open: boolean; chip: boolean }>(`(() => { const f = ${field};
    return { value: f.value, caret: f.selectionStart, open: !${list}.hidden, chip: [...document.querySelectorAll('[data-assistant-composer] .mw-composer__files .mw-upload')].some((c) => c.textContent.includes('发布计划 · 第二版')) }; })()`);
  assert.equal(after.value, "看看 ");
  assert.equal(after.caret, "看看 ".length, "the caret is where the @words were");
  assert.equal(after.open, false);
  assert.equal(after.chip, true, "the reference is on the strip by its name");

  // No hits, and a failed search, each say so.
  await type("@"); await type("无");
  await waitFor("searches.asked().includes('无')");
  await evaluate("searches.answer('无', [])");
  await waitFor(`${list}.textContent.includes('没有找到')`);
  await type("人");
  await waitFor("searches.asked().includes('无人')");
  await evaluate("searches.answer('无人', 'fail')");
  await waitFor(`${list}.textContent.includes('现在用不了')`);
  assert.equal((await shown()).hits.length, 0, "a failure leaves nothing to choose");

  // The chosen reference goes with the Send, by its owner's object (read again by its owner when the round starts).
  await evaluate(`(() => { const f = ${field}; f.value = '看看这份'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate("document.querySelector('[data-assistant-composer] [data-composer-send]').click()");
  await waitFor("window.__sent.length === 1", 10_000);
  const sent = await evaluate<{ materials: Array<{ kind: string; reference?: { subject: { kind: string; id: string } }; object?: { title: string } }> }>("window.__sent[0]");
  assert.ok(sent.materials.some((one) => one.kind === "object" && one.reference?.subject.id === "c" && one.object?.title === "发布计划 · 第二版"), JSON.stringify(sent.materials));
});
