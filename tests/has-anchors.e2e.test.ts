import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";
import { expensiveHasSelectors, insertMedian } from "./fixtures/style-invalidation.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/visual-ui-experience VUX-36: one node put in a long Assistant reply restyles that node, not the page. Before this,
// `:has()` rules elsewhere on the page (Settings, Jelly, the plugin market, the directory) made every insert restyle whole
// subtrees or re-check every <strong>, <span> and <svg> in it: 38–40 ms an insert, which a streamed reply pays each frame.

const LINE = (index: number) => `第 ${index} 段：这里是一段比较长的回答文字，用来让回复有足够多的节点。` + "`code`".repeat(3) + " **加粗** 与 _强调_。";

test("VUX-36: a node put in a long streamed Assistant reply costs well under a millisecond of style, and no :has() rule has a shape that makes it page-wide", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const model = await assistantTextModel(t, homeDirectory, Array.from({ length: 400 }, (_, index) => LINE(index)).join("\n\n"), { pieces: 2, pause: 100 });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-assistant-input]"); await command("Input.insertText", { text: "写一大段" }, sessionId); await click("[data-assistant-send]");
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich strong')?.textContent === '第一段'", 30_000); model.finish();
  await waitFor("document.querySelectorAll('.assistant-msg--assistant .assistant-rich p').length > 400", 60_000);
  const reply = "document.querySelector('.assistant-msg--assistant .assistant-rich p:last-of-type')";
  // The check finds both shapes (the two rules this replaced), and only them.
  await evaluate(`(() => { const style = document.createElement('style'); style.id = 'has-shape-check'; style.textContent = '.a:has(input:checked) strong { color: red } .b:has(.c) > :not(.d) { color: red } .e:has(.f) :is(.g, .h) { color: red } .i:has(.j) > .k { color: red }'; document.head.append(style); })()`);
  assert.deepEqual(await expensiveHasSelectors(evaluate), [".a:has(input:checked) strong", ".b:has(.c) > :not(.d)"]);
  await evaluate("document.getElementById('has-shape-check').remove()");
  const shapes = await expensiveHasSelectors(evaluate);
  assert.deepEqual(shapes, [], "no :has() rule ends in a bare tag or a broad part after the :has()");
  const costs: Record<string, number> = {};
  for (const [width, height] of [[1440, 950], [820, 900]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor(`!document.querySelector('[data-assistant-panel]').hidden && ${reply}.getClientRects().length > 0`, 10_000);
    costs[width] = await insertMedian(evaluate, reply);
    // 0.3 ms here alone; it was 6.8 ms with the rules that end in a tag and 38–40 ms with the broad one in Settings as well.
    assert.ok(costs[width]! < 3, `one node put in the reply at ${width}px: ${costs[width]!.toFixed(2)} ms`);
  }
  const nodes = await evaluate<number>("document.getElementsByTagName('*').length");
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("has-anchors.json", evidence), JSON.stringify({ nodes, insert_ms: Object.fromEntries(Object.entries(costs).map(([width, ms]) => [width, Math.round(ms * 100) / 100])) }, null, 2));
});
