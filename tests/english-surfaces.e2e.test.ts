import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { TEXT_WRAP_AUDIT, type TextWrapIssue } from "./fixtures/text-wrap-audit.js";

// specs/visual-ui-experience VUX-40「中英文…不溢出、不混排」: a page shown in English says everything it says itself in English.
// Goals' status words (the projection words them in Chinese), Jelly's fixed "uncategorized" category, and the Files, Diff
// and Text Stats pages with the shell around them used to stay Chinese in English. What a person wrote (Goal titles,
// project names) is theirs and is not checked. The same places in Chinese still say it in Chinese, and the longer English
// fits where the Chinese did.

/** Visible text and labels with Chinese characters inside the elements `selector` finds. */
const HAN_IN = (selector: string) => `(() => {
  const out = [], han = /[\\u4e00-\\u9fff]/;
  for (const scope of document.querySelectorAll(${JSON.stringify(selector)})) {
    if (!scope.checkVisibility()) continue;
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node; (node = walk.nextNode());) if (han.test(node.data) && node.parentElement.checkVisibility()) out.push(node.data.trim());
    for (const el of [scope, ...scope.querySelectorAll('[aria-label], [title], [placeholder]')]) for (const name of ['aria-label', 'title', 'placeholder']) {
      const value = el.getAttribute(name); if (value && han.test(value) && el.checkVisibility()) out.push('@' + name + ' ' + value);
    }
  }
  return [...new Set(out)];
})()`;

test("VUX-40: Goals statuses, Jelly's fixed category and the Files, Diff and Text Stats pages speak English in English", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const open = async (plugin: string, ready: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=${plugin}` }, sessionId));
    await waitFor(ready, 30_000);
  };
  // Each page's own words: where they are and when it has drawn them.
  const pages: Array<[plugin: string, ready: string, selector: string, zh: string]> = [
    ["goals", "document.querySelectorAll('.goal-status').length > 3", ".goal-status", "正在推进"],
    ["jelly", "document.querySelector('[data-jelly-category-filters] [data-jelly-filter=uncategorized]')", "[data-jelly-category-filters]", "未分类"],
    ["files", "document.querySelector('[data-companion=files] [data-files-browser]:not([hidden])')", "[data-companion=files]", "项目的当前目录"],
    ["diff", "document.querySelector('[data-companion=diff] [data-companion-content] .mw-empty')", "[data-companion=diff]", "打开 Files"],
    ["text-stats", "document.querySelector('[data-companion=text-stats] [data-companion-content] .mw-empty')", "[data-companion=text-stats]", "固定一份文件快照后"],
  ];
  for (const [plugin, ready, selector, zh] of pages) {
    await open(plugin, ready);
    assert.ok((await evaluate<string>(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.textContent).join(' ')`)).includes(zh), `${plugin} in Chinese says 「${zh}」`);
  }
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=%2F` }, sessionId));
  for (const [plugin, ready, selector] of pages) {
    await open(plugin, ready);
    assert.deepEqual(await evaluate<string[]>(HAN_IN(selector)), [], `${plugin} in English`);
    // The English is longer: none of it runs out of its box.
    assert.deepEqual((await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill"), [], `${plugin} in English fits`);
  }
  await open("goals", pages[0]![1]);
  assert.ok((await evaluate<string>("[...document.querySelectorAll('.goal-status')].map((el) => el.textContent).join('|')")).includes("In progress"));
});
