import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/visual-ui-experience VUX-14/15 (§stream-rendering): a streamed reply goes in through the design system's one
// `molisStreamText`. What did not change stays the same nodes (a selection, a focus, a code block's buttons in them are
// kept); only text that grew while the reply is being written eases in, once, from the grapheme it ended in, a few pieces
// at a time; code and rewritten text show at once; nothing is replayed on a reopen, a redraw or under reduced motion; and
// when the pieces have finished the page holds the renderer's own HTML, with nothing extra to copy, find or read aloud.

test("VUX-14/15: stream text keeps unchanged nodes, eases in only grown text by grapheme, caps the pieces and leaves the renderer's HTML", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("typeof window.molisStreamText === 'function'");
  await evaluate("window.box = document.body.appendChild(document.createElement('div')); window.put = (html, reveal = true) => window.molisStreamText(window.box, html, { reveal })");
  const put = (html: string, reveal = true) => evaluate<{ kept: number; replaced: number; fresh: number }>(`window.put(${JSON.stringify(html)}, ${reveal})`);
  const fresh = () => evaluate<string[]>("[...window.box.querySelectorAll('.mw-fresh')].map(piece => piece.textContent)");
  const settled = async () => { await waitFor("!window.box.querySelector('.mw-fresh')", 3_000); return evaluate<string>("window.box.innerHTML"); };

  // The first block is kept as the same node, with a selection in it; inside the wrapper only the text that went on is fresh.
  await put(`<div class="rich"><p>先看 <strong>第一段</strong>。</p><p>第二</p></div>`, false);
  await evaluate("window.first = window.box.querySelector('p'); getSelection().selectAllChildren(window.first.querySelector('strong'))");
  const grown = await put(`<div class="rich"><p>先看 <strong>第一段</strong>。</p><p>第二段写下去</p></div>`);
  assert.equal(await evaluate("window.first === window.box.querySelector('p') && window.first.parentElement === window.box.firstChild"), true, "the unchanged block and its wrapper stay the same nodes");
  assert.equal(await evaluate("getSelection().toString()"), "第一段", "a selection in a kept block survives the update");
  assert.deepEqual(await fresh(), ["段写下去"], "only the text that went on is shown arriving");
  assert.equal(grown.fresh, 1);
  assert.equal(await evaluate("getComputedStyle(window.box.querySelector('.mw-fresh')).animationName"), "mw-fresh");
  assert.equal(await settled(), `<div class="rich"><p>先看 <strong>第一段</strong>。</p><p>第二段写下去</p></div>`, "finished pieces go back to the renderer's HTML");

  // A grapheme cut by the stream is revealed whole: the half that was already shown comes back with the rest.
  await put("<p>完成 👩</p>", false);
  await put("<p>完成 👩‍💻 了</p>");
  assert.deepEqual(await fresh(), ["👩‍💻 了"], "the emoji sequence is not split");
  await settled();

  // A link keeps its address while its words grow; code shows at once; rewritten text is not shown arriving.
  await put(`<p>见 <a href="https://example.com/a?b=1&amp;c=2">链</a></p><pre><code>const a = 1;</code></pre>`, false);
  await put(`<p>见 <a href="https://example.com/a?b=1&amp;c=2">链接文字</a></p><pre><code>const a = 1;\nconst b = 2;</code></pre><p>新的一段</p>`);
  assert.deepEqual(await fresh(), ["接文字", "新的一段"], "the link's new words and the new block arrive; the code does not");
  assert.equal(await evaluate("window.box.querySelector('a').getAttribute('href')"), "https://example.com/a?b=1&c=2");
  await settled();
  await put("<p>改写成了别的话</p>", false); await put("<p>完全不同的一句</p>");
  assert.deepEqual(await fresh(), [], "text rewritten rather than grown shows at once");

  // A fast reply never queues: at most six pieces ease at a time, and the last update finishes them all.
  await put("<p>a</p>", false);
  let text = "a";
  for (let index = 0; index < 20; index += 1) { text += "，下一句" + index; await put(`<p>${text}</p><p>尾${index}</p>`); }
  assert.ok((await fresh()).length <= 6, `${(await fresh()).length} pieces at once`);
  await put(`<p>${text}</p><p>尾19</p>`, false);
  assert.deepEqual(await fresh(), [], "an update without reveal finishes every piece at once");
  assert.equal(await evaluate("window.box.innerHTML"), `<p>${text}</p><p>尾19</p>`);

  // Reduced motion shows new text as it comes.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await put("<p>减少动态</p>", false);
  assert.equal((await put("<p>减少动态效果时</p>")).fresh, 0);
  await command("Emulation.setEmulatedMedia", { features: [] }, sessionId);

  // What it costs, before (the whole reply put in again) and after, on a long reply growing at its tail: the time per update
  // and how many nodes each puts in. Written to cost.json beside the review picture; the counts are asserted, the times only recorded.
  const cost = await evaluate<{ before: number; after: number; reveal: number; madeBefore: number; madeAfter: number }>(`(() => {
    const blocks = Array.from({ length: 400 }, (_, i) => '<p>第 ' + i + ' 段：<strong>稳定</strong>的正文，含 <a href="https://example.com/' + i + '">链接</a> 与 <code>code</code>。</p>');
    const html = (n) => '<div class="rich">' + blocks.join('') + '<p>' + '正在写的尾段'.repeat(1 + n) + '</p></div>';
    const median = (list) => list.sort((a, b) => a - b)[list.length >> 1];
    const size = (records) => records.reduce((sum, record) => sum + [...record.addedNodes].reduce((all, node) => all + 1 + (node.nodeType === 1 ? node.getElementsByTagName('*').length : 0), 0), 0);
    const run = (put) => { const box = document.body.appendChild(document.createElement('div')), times = []; let made = 0;
      const seen = new MutationObserver((records) => { made += size(records); }); seen.observe(box, { subtree: true, childList: true });
      put(box, html(0)); seen.takeRecords(); made = 0;
      for (let n = 1; n <= 60; n += 1) { const start = performance.now(); put(box, html(n)); box.offsetHeight; times.push(performance.now() - start); }
      made += size(seen.takeRecords()); seen.disconnect(); box.remove(); return { time: median(times), made: made / 60 }; };
    const before = run((box, h) => { box.innerHTML = h; }), after = run((box, h) => window.molisStreamText(box, h)), reveal = run((box, h) => window.molisStreamText(box, h, { reveal: true }));
    return { before: before.time, after: after.time, reveal: reveal.time, madeBefore: before.made, madeAfter: after.made };
  })()`);
  assert.ok(cost.madeAfter <= 2, `each update puts in only the tail (${cost.madeAfter} nodes), not the reply (${cost.madeBefore})`);
  assert.ok(cost.madeBefore > 1000, "the comparison is a long reply");

  // The board's specimen: the same helper at a model's pace, compared at 2 px and the 6 px upper bound, then nothing left.
  await evaluate("window.box.remove(); document.querySelector('[data-catalog-stream]').scrollIntoView({ block: 'center', behavior: 'instant' }); document.querySelector('[data-catalog-stream-slow]').click(); document.querySelector('[data-catalog-stream-replay]').click()");
  await waitFor("document.querySelectorAll('[data-catalog-stream] .mw-fresh').length > 0", 3_000);
  const blurs = await evaluate<string[]>("[...document.querySelectorAll('[data-catalog-stream]')].map(box => getComputedStyle(box.querySelector('.mw-fresh') || box).animationName)");
  assert.deepEqual(blurs, ["mw-fresh", "mw-catalog-fresh-6"]);
  // Mid-reply, for the review picture: part of the text written, its newest pieces still arriving.
  await waitFor("document.querySelector('[data-catalog-stream]').textContent.length > 40 && document.querySelector('[data-catalog-stream] .mw-fresh')", 10_000);
  await evaluate("document.querySelector('[data-catalog-stream]').scrollIntoView({ block: 'center', behavior: 'instant' })");
  const evidence = reviewEvidenceUrl("stream-text/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("cost.json", evidence), JSON.stringify(cost, null, 2));
  await writeFile(new URL("board.png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await waitFor("document.querySelector('[data-catalog-stream]').textContent.endsWith('再对照基线。') && !document.querySelector('[data-catalog-stream] .mw-fresh')", 15_000);
  assert.equal(await evaluate("document.querySelectorAll('[data-catalog-stream]')[1].innerHTML === document.querySelectorAll('[data-catalog-stream]')[0].innerHTML"), true, "both specimens end on the same HTML");
});

test("VUX-14/15: the Assistant's streamed reply keeps its blocks, shows only new words arriving and reopens without replay", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const reply = "第二段带一个[链接](https://example.com/a?b=1&c=2)和 `行内代码`，还有 👩‍💻。\n\n- 第一项\n- 第二项\n\n> 引用的一句\n\n```ts\nconst x = 1;\n```\n\n最后一段写完。";
  const model = await assistantTextModel(t, homeDirectory, reply, { pieces: 12, pause: 180 });
  // Every piece the page shows arriving is counted from the first script on, so a reopen that replayed would be seen.
  const watch = "window.freshSeen = 0; new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && (node.matches('.mw-fresh') || node.querySelector('.mw-fresh'))) window.freshSeen += 1; }).observe(document, { subtree: true, childList: true });";
  await command("Page.addScriptToEvaluateOnNewDocument", { source: watch }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  // This case observes the motion itself; under automation `data-craft-still` freezes the `.mw-fresh` reveal animation, so `animationend` never comes.
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "写一段说明" }, sessionId);
  await click("[data-assistant-send]");
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich strong')?.textContent === '第一段'", 30_000);
  assert.equal(await evaluate<number>("window.freshSeen"), 0, "the reply's first words are not a growth of anything");
  await evaluate("window.firstBlock = document.querySelector('.assistant-msg--assistant .assistant-rich > p'); getSelection().selectAllChildren(window.firstBlock.querySelector('strong'))");
  model.finish();
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich')?.textContent.includes('最后一段写完')", 30_000);
  assert.equal(await evaluate("window.firstBlock === document.querySelector('.assistant-msg--assistant .assistant-rich > p')"), true, "the first block stayed the same node while the rest was written");
  assert.equal(await evaluate("getSelection().toString()"), "第一段", "and the person's selection in it stayed");
  assert.ok(await evaluate<number>("window.freshSeen") > 0, "new words were shown arriving while the reply was written");
  await waitFor("!document.querySelector('.assistant-msg--assistant .mw-fresh')", 5_000);
  const written = await evaluate<{ html: string; text: string; code: string; href: string; copies: number }>(`(() => { const rich = document.querySelector('.assistant-msg--assistant .assistant-rich');
    return { html: rich.innerHTML, text: rich.textContent, code: document.querySelector('.assistant-msg--assistant .assistant-code').dataset.code, href: rich.querySelector('a[href]').getAttribute('href'), copies: document.querySelectorAll('.assistant-msg--assistant .assistant-code-copy').length }; })()`);
  assert.equal(written.href, "https://example.com/a?b=1&c=2");
  assert.equal(written.code, "const x = 1;");
  assert.equal(written.copies, 1, "the code block has one copy button");
  // VUX-04: a reply written while it streamed wraps line by line, so a line already read never moves as it grows or ends.
  assert.deepEqual(await evaluate("(() => { const rich = document.querySelector('.assistant-msg--assistant .assistant-rich'); return [!!rich.closest('[data-streamed]'), getComputedStyle(rich.querySelector('p')).textWrapStyle]; })()"), [true, "auto"], "the streamed reply wraps greedily");
  await waitFor(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/works`)}).then(r=>r.json()).then(b=>b.works[0]?.state==='completed')`, 30_000);

  // Reopened, the same reply reads the same, and nothing in it is shown arriving again.
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich')?.textContent.includes('最后一段写完')", 30_000);
  const reopened = await evaluate<{ html: string; text: string; seen: number }>("({ html: document.querySelector('.assistant-msg--assistant .assistant-rich').innerHTML, text: document.querySelector('.assistant-msg--assistant .assistant-rich').textContent, seen: window.freshSeen })");
  assert.equal(reopened.seen, 0, "a reopen does not replay the reveal");
  assert.deepEqual(await evaluate("(() => { const rich = document.querySelector('.assistant-msg--assistant .assistant-rich'); return [!!rich.closest('[data-streamed]'), getComputedStyle(rich.querySelector('p')).textWrapStyle]; })()"), [false, "pretty"], "reopened from history, its paragraphs wrap pretty again");
  assert.equal(reopened.text, written.text, "the reopened reply has the same words");
  assert.equal(reopened.html.replaceAll(' data-bound=""', ""), written.html.replaceAll(' data-bound=""', ""), "and the same structure as the one that was written");
});

test("SYS-04 streaming updates in one frame keep mixed text and stable nodes", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
  await waitFor("typeof window.molisStreamText === 'function'");
  await evaluate("window.box = document.body.appendChild(document.createElement('div')); window.put = (html, reveal = true) => window.molisStreamText(window.box, html, { reveal })");
  // SYS-04: update before animationend, in the same frame, while a split text node precedes a growing strong.
  const mixed = await evaluate<{ html: string; text: string; kept: boolean }>(`(() => {
    window.put('<p>Stable</p><p>Hel</p>', false);
    const stable = window.box.firstChild;
    window.put('<p>Stable</p><p>Hello <strong>b</strong></p>');
    window.put('<p>Stable</p><p>Hello <strong>bold</strong></p>');
    window.put('<p>Stable</p><p>Hello <strong>bold</strong></p>', false);
    return { html: window.box.innerHTML, text: window.box.textContent, kept: stable === window.box.firstChild };
  })()`);
  assert.deepEqual(mixed, { html: '<p>Stable</p><p>Hello <strong>bold</strong></p>', text: 'StableHello bold', kept: true });
  assert.equal(await evaluate("window.box.querySelectorAll('.mw-fresh').length"), 0);

});
