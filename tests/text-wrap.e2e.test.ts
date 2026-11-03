import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { TEXT_WRAP_AUDIT, type TextWrapIssue } from "./fixtures/text-wrap-audit.js";

// specs/visual-ui-experience §type-optics (VUX-04): headings balance, paragraphs do not end on a lone character, and long
// words, paths and URLs wrap inside their box instead of being cut, on the real surfaces at a desktop and a phone width.
// The audit reads the page as drawn (tests/fixtures/text-wrap-audit.ts); code, inputs and strips that scroll are left out.

const PATH = "/Users/someone/Library/Mobile Documents/com~apple~CloudDocs/项目资料/2026 年第四季度/visual-ui-experience-baseline-measurements.final.json";
const LINK = "https://github.com/molis-ai/molis-work/pull/894/files#diff-4f1adc17f9a86aef9a4b982888e6e7e579228c94a6cce6";
const WORD = "VeryLongIdentifierWithoutAnySpacesThatAModelMightNameAFunctionLikeThis_claude-opus-5-5-20261020";

test("VUX-04: the board, the project page, a Pages document with long paths, links and identifiers, and Coding wrap cleanly at 1280 and 390 px", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const children = { pages: await pluginFrameBrowser(t,browser,"pages"), coding: await pluginFrameBrowser(t,browser,"coding") };
  const pages = openPagesStore(homeDirectory);
  const page = (() => { try { return pages.create({ project_id: projectId!, title: "第四季度视觉细节与 UI 性能的完整验收记录（含真实场景与本人验收的逐项对照）", body: { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "为什么这次要把项目页准备路径上的动作目录只算一次" }] },
    { type: "paragraph", content: [{ type: "text", text: `原始数据在 ${PATH}，对照 ${LINK}。${WORD} 是模型起的名字。` }] },
    { type: "paragraph", content: [{ type: "text", text: "这一段用来看最后一行会不会只剩一个字，所以写得长一点，让它在常见的阅读宽度下换到第二行或者第三行才结束了。" }] },
  ] } }); } finally { pages.close(); } })();
  const surfaces: [string, string][] = [
    ["组件板", "/__ui/catalog"],
    ["项目页", `/projects/${projectId}/`],
    ["Pages 长文档", `/projects/${projectId}/?openPlugin=pages&openItem=${page.id}`],
    ["Coding", `/projects/${projectId}/?openPlugin=coding`],
    ["项目选择", "/"],
  ];
  const found: string[] = [];
  for (const width of [1280, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const [name, path] of surfaces) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await waitFor("document.readyState === 'complete' && document.fonts.status === 'loaded'", 20_000);
      if (name === "Pages 长文档") await children.pages.waitFor(`document.body.innerText.includes(${JSON.stringify(WORD)})`, 20_000);
      // Late parts (the dock, plugin bodies) settle in a moment; the audit reads what is drawn after it.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const child = name === "Pages 长文档" ? children.pages : name === "Coding" ? children.coding : null;
      if (child) await child.waitFor("document.fonts.status === 'loaded'");
      for (const issue of [...await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT), ...child ? await child.evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT) : []]) found.push(`${width} ${name}: ${JSON.stringify(issue)}`);
    }
  }
  assert.deepEqual(found, [], "no heading ends on a stub, no paragraph on a lone character, no text cut at its box");
});

test("VUX-04 VUX-30: the board's list-and-detail composition stacks when too narrow instead of squeezing its detail", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const detail = "document.querySelector('[data-compose-split] .mw-compose__detail').getBoundingClientRect().width";
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
  await waitFor("document.querySelector('[data-compose-split]')", 20_000);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-compose-split]')).gridTemplateColumns.split(' ').length"), 2, "side by side when there is room");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`${detail} > 240`, 5_000);
  const [list, frame] = await evaluate<[DOMRect, DOMRect]>("['.mw-compose__list', '.mw-compose__detail'].map(part => document.querySelector('[data-compose-split] ' + part).getBoundingClientRect().toJSON())");
  assert.ok(list.bottom <= frame.top + 1, "the list sits above the detail");
});
