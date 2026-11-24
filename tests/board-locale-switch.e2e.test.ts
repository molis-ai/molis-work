import assert from "node:assert/strict";
import test from "node:test";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";

// FSS-61: the component board's 语言与文字 section (apps/workbench/src/environment-specimens.ts) switches language in place, the way
// specs/font-and-skin-system/a-section-contract.md §5.4 merges: only `Text.data` and `setAttribute` are written. This proves the base case on the board;
// batch 16 has to pass it on the real first screen (FSS-35).

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/** Watches the live region from now on: nodes taken out, HTML written, a field's value written, and whether the page was loaded again. */
const WATCH = `(() => {
  const live = document.querySelector('[data-board-env-live]');
  window.__boardEnv = { removed: 0, html: 0, values: 0, loadedOnce: true };
  new MutationObserver((records) => { for (const r of records) window.__boardEnv.removed += r.removedNodes.length; }).observe(live, { childList: true, subtree: true });
  const count = (proto, name, key) => { const d = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, { ...d, set(value) { if (this instanceof Node && document.querySelector('#environment')?.contains(this)) window.__boardEnv[key] += 1; d.set.call(this, value); } }); };
  count(Element.prototype, 'innerHTML', 'html'); count(Element.prototype, 'outerHTML', 'html'); count(HTMLInputElement.prototype, 'value', 'values');
  const adjacent = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (...args) { if (document.querySelector('#environment')?.contains(this)) window.__boardEnv.html += 1; return adjacent.apply(this, args); };
})()`;

async function openSection(browser: Browser) {
  const { navigate, command, sessionId, origin, waitFor } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=zh` }, sessionId));
  await waitFor("document.readyState === 'complete' && document.querySelector('#environment')?.dataset.boardEnvShown === 'zh' && document.querySelector('[data-board-env-snapshot]')?.dataset.same === 'true'", 20_000);
}

async function switchTo(browser: Browser, locale: "zh" | "en" | "ja") {
  await browser.evaluate(`document.querySelector('[data-board-env-lang=${locale}]').click()`);
  await browser.waitFor(`document.querySelector('#environment').dataset.boardEnvShown === '${locale}'`);
}

/** The same-words row: the label, the person's 保存 drawn by the server, the interface's 保存, and whatever the page put beside them. */
const SAME_ROW = "[...document.querySelector('[data-board-env-same]').children].filter((el) => el.localName !== 'span' || !el.matches(':first-child')).map((el) => (el.matches('[data-board-env-user]') ? 'user:' : el.matches('[data-board-env-word]') ? 'word:' : 'client:') + el.textContent)";

test("FSS-61 the board section changes its words, dates, numbers and attributes in place; what the person did stays", async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate } = browser;
  await openSection(browser);
  // What a person does before switching: types and selects in the field, opens the details, scrolls, and the page adds a row of its own words and a
  // row of the person's 保存. One text the page changed itself no longer reads as either render's.
  await evaluate(`(() => {
    const input = document.querySelector('[data-board-env-search]'); input.focus(); input.value = '我的查询词'; input.setSelectionRange(1, 3); input.__mark = 'same node';
    document.querySelector('[data-board-env-more]').open = true;
    document.querySelector('[data-board-env-scroll]').scrollTop = 40;
    document.querySelector('[data-board-env-add-row]').click();
    document.querySelector('[data-board-env-add-user]').click();
    document.querySelector('[data-board-env-scroll] p').firstChild.data = '页面自己改过的字';
    input.focus(); input.setSelectionRange(1, 3);
  })()`);
  await evaluate(WATCH);
  const before = await evaluate<Record<string, string>>(`({ when: document.querySelector('.mw-board-env__facts time').textContent, count: document.querySelectorAll('.mw-board-env__facts dd')[4].textContent })`);
  await switchTo(browser, "en");
  const after = await evaluate<Record<string, unknown>>(`(() => {
    const input = document.querySelector('[data-board-env-search]'), facts = [...document.querySelectorAll('.mw-board-env__facts dd')];
    return {
      title: document.querySelector('#board-env h2').textContent,
      skin: facts[0].textContent, font: facts[1].textContent, owners: facts[2].textContent,
      when: document.querySelector('.mw-board-env__facts time').textContent, count: facts[4].textContent,
      rename: document.querySelector('.mw-board-env__actions .mw-btn [data-slot=button-label]')?.textContent ?? document.querySelector('.mw-board-env__actions .mw-btn').textContent.trim(),
      clear: document.querySelector('.mw-board-env__actions input[type=button]').value,
      placeholder: input.placeholder, label: input.getAttribute('aria-label'), scrollLabel: document.querySelector('[data-board-env-scroll]').getAttribute('aria-label'),
      value: input.value, selection: [input.selectionStart, input.selectionEnd], focused: document.activeElement === input, sameNode: input.__mark,
      open: document.querySelector('[data-board-env-more]').open, scroll: document.querySelector('[data-board-env-scroll]').scrollTop,
      changedByPage: document.querySelector('[data-board-env-scroll] p').textContent, secondLine: document.querySelectorAll('[data-board-env-scroll] p')[1].textContent,
      rows: [...document.querySelectorAll('[data-board-env-rows] li')].map((li) => li.textContent),
      same: ${SAME_ROW},
      save: document.querySelector('[data-board-env-save]').textContent, editable: document.querySelector('[data-board-env-editable]').textContent,
      snapshot: [document.querySelector('[data-board-env-snapshot]').dataset.same, document.querySelector('[data-board-env-snapshot]').textContent],
      checks: document.querySelector('.mw-board-env__checks').textContent.includes('ui.'),
      pressed: document.querySelector('[data-board-env-lang=en]').getAttribute('aria-pressed'),
      watched: window.__boardEnv,
    };
  })()`);
  assert.equal(after.title, "Language and text");
  assert.equal(after.skin, "Soft Workbench");
  assert.equal(after.font, "System Sans");
  assert.equal(after.owners, "Words of the workbench · Words of a sample plugin", "two owners on one page, each with its own words");
  assert.notEqual(after.when, before.when, "the date is drawn in the new language");
  assert.match(String(after.count), /^1 note saved · 3 notes saved · 12K$/u);
  assert.notEqual(after.count, before.count);
  assert.equal(after.rename, "Rename “Tom's R&D notes”");
  assert.equal(after.clear, "Clear", "a button's label is its value");
  assert.equal(after.placeholder, "Type what to find");
  assert.equal(after.label, "Search notes");
  assert.equal(after.scrollLabel, "Content that scrolls");
  assert.equal(after.value, "我的查询词", "what the person typed stays");
  assert.deepEqual(after.selection, [1, 3], "and what they selected");
  assert.equal(after.focused, true, "and where the focus is");
  assert.equal(after.sameNode, "same node", "the field is the same node, never drawn again");
  assert.equal(after.open, true, "what is open stays open");
  assert.equal(after.scroll, 40, "where it is scrolled stays");
  assert.equal(after.changedByPage, "页面自己改过的字", "a text the page changed is no longer either render's: it is left alone");
  assert.equal(after.secondLine, "Line 2");
  assert.deepEqual(after.rows, ["List row 1", "List row 2", "保存"], "the server's row changes, the page's own row is drawn again from what produced it, the person's 保存 stays");
  assert.deepEqual(after.same, ["user:保存", "word:Save"], "the person's 保存 the server drew stays; the interface's word beside it changes");
  assert.equal(after.save, "Save");
  assert.equal(after.editable, "保存", "an editable text is never written, even beside the same interface word");
  assert.deepEqual(after.snapshot, ["true", "The server and the page agree on the display snapshot"], "the page works the snapshot out again and both agree");
  assert.equal(after.checks, true, "the file checks are what the parser said, in no language");
  assert.equal(after.pressed, "true");
  assert.deepEqual(after.watched, { removed: 0, html: 0, values: 0, loadedOnce: true }, "no node taken out, no HTML written, no field value written, no reload");

  // Switch en → ja in place: Japanese words, ja-JP dates/numbers, fallback sample owner, and all user state stays intact.
  await switchTo(browser, "ja");
  const afterJa = await evaluate<Record<string, unknown>>(`(() => {
    const input = document.querySelector('[data-board-env-search]'), facts = [...document.querySelectorAll('.mw-board-env__facts dd')];
    return {
      title: document.querySelector('#board-env h2').textContent,
      skin: facts[0].textContent, font: facts[1].textContent, owners: facts[2].textContent,
      when: document.querySelector('.mw-board-env__facts time').textContent, count: facts[4].textContent,
      rename: document.querySelector('.mw-board-env__actions .mw-btn [data-slot=button-label]')?.textContent ?? document.querySelector('.mw-board-env__actions .mw-btn').textContent.trim(),
      clear: document.querySelector('.mw-board-env__actions input[type=button]').value,
      placeholder: input.placeholder, label: input.getAttribute('aria-label'), scrollLabel: document.querySelector('[data-board-env-scroll]').getAttribute('aria-label'),
      value: input.value, selection: [input.selectionStart, input.selectionEnd], focused: document.activeElement === input, sameNode: input.__mark,
      open: document.querySelector('[data-board-env-more]').open, scroll: document.querySelector('[data-board-env-scroll]').scrollTop,
      changedByPage: document.querySelector('[data-board-env-scroll] p').textContent, secondLine: document.querySelectorAll('[data-board-env-scroll] p')[1].textContent,
      rows: [...document.querySelectorAll('[data-board-env-rows] li')].map((li) => li.textContent),
      same: ${SAME_ROW},
      save: document.querySelector('[data-board-env-save]').textContent, editable: document.querySelector('[data-board-env-editable]').textContent,
      snapshot: [document.querySelector('[data-board-env-snapshot]').dataset.same, document.querySelector('[data-board-env-snapshot]').textContent],
      pressed: document.querySelector('[data-board-env-lang=ja]').getAttribute('aria-pressed'),
      watched: window.__boardEnv,
    };
  })()`);
  assert.equal(afterJa.title, "言語とテキスト");
  assert.equal(afterJa.skin, "Soft Workbench");
  assert.equal(afterJa.font, "システムサンセリフ");
  assert.equal(afterJa.owners, "ワークベンチの語句 · サンプルプラグイン独自の文言");
  assert.notEqual(afterJa.when, after.when, "the date is drawn in Japanese");
  assert.match(String(afterJa.count), /^1件のメモを保存しました · 3件のメモを保存しました · 1\.2万$/u);
  assert.equal(afterJa.rename, "「Tom's R&D notes」の名前を変更");
  assert.equal(afterJa.clear, "クリア");
  assert.equal(afterJa.placeholder, "探したい言葉を入力");
  assert.equal(afterJa.label, "メモを検索");
  assert.equal(afterJa.scrollLabel, "スクロール可能なテキスト");
  assert.equal(afterJa.value, "我的查询词");
  assert.deepEqual(afterJa.selection, [1, 3]);
  assert.equal(afterJa.focused, true);
  assert.equal(afterJa.sameNode, "same node");
  assert.equal(afterJa.open, true);
  assert.equal(afterJa.scroll, 40);
  assert.equal(afterJa.changedByPage, "页面自己改过的字");
  assert.equal(afterJa.secondLine, "2行目");
  assert.deepEqual(afterJa.rows, ["リスト1行目", "リスト2行目", "保存"]);
  assert.deepEqual(afterJa.same, ["user:保存", "word:保存"]);
  assert.equal(afterJa.save, "保存");
  assert.equal(afterJa.editable, "保存");
  assert.deepEqual(afterJa.snapshot, ["true", "サーバとページの表示スナップショットが一致"]);
  assert.equal(afterJa.pressed, "true");
  assert.deepEqual(afterJa.watched, { removed: 0, html: 0, values: 0, loadedOnce: true });

  // And back: ja → zh in place, with the person's state still there.
  await switchTo(browser, "zh");
  assert.deepEqual(await evaluate(`[document.querySelector('#board-env h2').textContent, document.querySelector('[data-board-env-search]').value, [...document.querySelectorAll('[data-board-env-rows] li')].map((li) => li.textContent), window.__boardEnv]`),
    ["语言与文字", "我的查询词", ["列表第 1 行", "列表第 2 行", "保存"], { removed: 0, html: 0, values: 0, loadedOnce: true }]);
});

test("FSS-61 when the other language cannot be had, nothing on the page changes, it says so, and trying again works", async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate } = browser;
  await openSection(browser);
  await evaluate(`(() => { const template = document.querySelector('template[data-board-env-render=en]'); window.__held = template; template.remove(); })()`);
  await evaluate(WATCH);
  await evaluate("document.querySelector('[data-board-env-lang=en]').click()");
  await browser.waitFor("!document.querySelector('[data-board-env-status]').hidden");
  assert.deepEqual(await evaluate(`[document.querySelector('#environment').dataset.boardEnvShown, document.querySelector('#board-env h2').textContent, document.querySelector('[data-board-env-lang=zh]').getAttribute('aria-pressed'),
    document.querySelector('[data-board-env-status]').textContent, document.querySelector('[data-board-env-retry]').hidden, window.__boardEnv]`),
  ["zh", "语言与文字", "true", "没切成：另一种语言的内容还没拿到，页面没有改动。", false, { removed: 0, html: 0, values: 0, loadedOnce: true }]);
  await evaluate("document.querySelector('#environment').append(window.__held)");
  await evaluate("document.querySelector('[data-board-env-retry]').click()");
  await browser.waitFor("document.querySelector('#environment').dataset.boardEnvShown === 'en'");
  assert.deepEqual(await evaluate("[document.querySelector('#board-env h2').textContent, document.querySelector('[data-board-env-status]').hidden, document.querySelector('[data-board-env-retry]').hidden]"),
    ["Language and text", true, true]);
});

test("FSS-61 a value sent with a form stays: an option's and a button's value are data, their words change", async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate } = browser;
  await openSection(browser);
  // The same form at the same place in the page and in both renders; two renders of one form differ in their words and, here, in the values too.
  await evaluate(`(() => {
    const form = (zh) => { const f = document.createElement('form'); f.dataset.testForm = '';
      f.innerHTML = zh ? '<button name="go" value="提交的值">提交</button><select name="pick"><option value="甲">中文选项</option></select>'
        : '<button name="go" value="sent-value">Send</button><select name="pick"><option value="A">English option</option></select>';
      return f; };
    document.querySelector('[data-board-env-live]').append(form(true));
    document.querySelector('template[data-board-env-render=zh]').content.append(form(true));
    document.querySelector('template[data-board-env-render=en]').content.append(form(false));
  })()`);
  await evaluate(WATCH);
  await switchTo(browser, "en");
  // A select may mirror its chosen option's words itself (Chrome's selectedcontent), so only what the merge writes is counted here: no HTML, no field value.
  assert.deepEqual(await evaluate(`(() => { const f = document.querySelector('[data-board-env-live] [data-test-form]'), option = f.querySelector('option[value]'), button = f.querySelector('button[name=go]');
    return [option.getAttribute('value'), option.textContent, button.getAttribute('value'), button.textContent, window.__boardEnv.html, window.__boardEnv.values]; })()`),
  ["甲", "English option", "提交的值", "Send", 0, 0]);
});

test("FSS-61 a merge that throws puts the old language back: what the page writes next is in the language on show", async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate } = browser;
  await openSection(browser);
  // The first word the merge writes throws, once: the merge stops halfway, as a defect in it would.
  await evaluate(`(() => {
    const d = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data'); window.__failOnce = true;
    Object.defineProperty(CharacterData.prototype, 'data', { ...d, set(value) { if (window.__failOnce && value === 'Language and text') { window.__failOnce = false; throw new Error('merge stopped for the test'); } d.set.call(this, value); } });
  })()`);
  await evaluate("document.querySelector('[data-board-env-lang=en]').click()");
  await browser.waitFor("window.__failOnce === false");
  await evaluate("new Promise((done) => setTimeout(done, 50))");
  await evaluate("document.querySelector('[data-board-env-add-row]').click()");
  assert.deepEqual(await evaluate("[document.querySelector('#environment').dataset.boardEnvShown, document.querySelector('#board-env h2').textContent, document.querySelector('[data-board-env-rows] li:last-child').textContent]"),
    ["zh", "语言与文字", "列表第 2 行"], "the switcher still says zh, and so does the language the page's own words are written in");
  await switchTo(browser, "en");
  assert.equal(await evaluate("document.querySelector('#board-env h2').textContent"), "Language and text", "the next switch works");
});

/**
 * Same words next to each other (§5.4, the reach rule). What each case comes to is the record the design doc keeps: a real interface word is never
 * left in the old language; a word the page or the person put right beside it may show translated until it is drawn again.
 */
const CASES: ReadonlyArray<{ readonly name: string; readonly change: string; readonly same: readonly string[] }> = [
  { name: "a page node of the same word right after the interface word: both change", change: "word.after(client())", same: ["user:保存", "word:Save", "client:Save"] },
  { name: "two page nodes right after it: all of them change", change: "word.after(client(), client())", same: ["user:保存", "word:Save", "client:Save", "client:Save"] },
  // The person's word on the board carries an attribute of its own, which is a word between them: the page's node is apart from it, and is not changed.
  // Three plain texts with nothing between them would leave the person's word translated until drawn again (§5.4); the board has no such row.
  { name: "a page node before the person's word: its attribute keeps them apart, only the interface word changes", change: "user.before(client())", same: ["client:保存", "user:保存", "word:Save"] },
  { name: "the person's word taken out: the interface word still changes", change: "user.replaceWith()", same: ["word:Save"] },
];

test("FSS-61 same words next to each other: the interface word never stays in the old language", async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate } = browser;
  for (const { name, change, same } of CASES) {
    await openSection(browser);
    await evaluate(`(() => { const user = document.querySelector('[data-board-env-user]'), word = document.querySelector('[data-board-env-word]');
      const client = () => { const node = document.createElement('b'); node.textContent = '保存'; return node; }; ${change}; })()`);
    await switchTo(browser, "en");
    assert.deepEqual(await evaluate(SAME_ROW), same, name);
  }
});

test("FSS-61 /__ui/catalog live switches across zh | en | ja with zero leftover Chinese in en and ja", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { navigate, command, sessionId, origin, waitFor, evaluate } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=zh` }, sessionId));
  await waitFor("document.readyState === 'complete' && document.querySelector('[data-board-lang=ja]') && document.querySelector('#environment')?.dataset.boardEnvShown === 'zh'", 25_000);
  await evaluate("window.__catalogBody = document.body; window.__catalogHeading = document.querySelector('h1');");

  // Collect visible text outside explicit non-translated/language-autonym/typography-proof slots
  // and the 6 SDK-default primitive labels (packages/plugin-sdk/src/ui/{field,calendar,number-field}.ts).
  const scanLeftover = (mode: "en" | "ja", rootSelectors?: readonly string[]) => evaluate<string[]>(`(() => {
    const IGNORED = '[translate="no"], script, style, template, svg, textarea, [data-board-lang], [data-board-env-lang], [data-cond-value=zh], [data-cond-value=ja], [data-board-env-user], [data-board-env-editable], .mw-board-env__checks';
    const ALLOWED_TEXT = /中\\u2060?文\\s+mixed\\s+with\\s+English|简体中文|日本語|繁體中文|Aa\\s+123|Aa\\s+你好\\s+12|文字\\s+Aa|中英文混排|“保存”|「保存」/gu;
    const SDK_SR_DEFAULTS = /^(?:减少|增加|上个月|下个月|打开日历)$/u;
    const EN_CJK = /[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]/u;
    const JA_SC = /[请这吗吧们还给让个无页读删设击错误败经过时间话说关闭开结获验证权记录检查确认编辑创执发连账码钥夹项题链试图网络务应统环输异态进详筛销导评论历级启继续您哪么什为从对你咱呢啊哦啦呗]/u;
    const re = ${mode === "en" ? "EN_CJK" : "JA_SC"};
    const selectors = ${JSON.stringify(rootSelectors ?? null)};
    const roots = selectors ? selectors.flatMap(sel => [...document.querySelectorAll(sel)]) : [document.body];
    const hits = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || parent.closest(IGNORED)) continue;
        if (parent.closest('[hidden]')) continue;
        const text = (node.data || '').trim();
        if (!text) continue;
        if (parent.matches('span.mw-sr-only') && SDK_SR_DEFAULTS.test(text)) continue;
        if (parent.matches('small') && text === '必填') continue;
        const cleaned = text.replace(ALLOWED_TEXT, '');
        if (re.test(cleaned)) {
          const section = parent.closest('section[id]')?.id || parent.tagName.toLowerCase();
          hits.push(section + ': ' + text.slice(0, 80));
          if (hits.length >= 25) return hits;
        }
      }
    }
    return hits;
  })()`);

  const LIVE_ROOTS = [
    ".mw-catalog-top",
    "[data-catalog-index]",
    "#typeface",
    "#language",
    "#zones",
    "#palette",
    "#buttons",
    "#platform-area",
    "#conditions",
    "#assistant",
    "#plugin-rows",
  ] as const;

  const switchTop = async (tag: "zh" | "en" | "ja", htmlLangExpected: string) => {
    await evaluate(`document.querySelector('[data-board-lang=${tag}]').click()`);
    await waitFor(`document.documentElement.lang === '${htmlLangExpected}' && document.querySelector('[data-board-lang=${tag}]')?.getAttribute('aria-pressed') === 'true'`, 25_000);
    assert.deepEqual(
      await evaluate("[window.__catalogBody === document.body, window.__catalogHeading === document.querySelector('h1')]"),
      [true, true],
      `in-place switch to ${tag}`,
    );
  };

  // Part A: Live in-place switching zh → en → ja → zh without reloading.
  await switchTop("en", "en");
  assert.equal(await evaluate("document.querySelector('h1').textContent.trim()"), "Molis Work Component catalog");
  assert.equal(await evaluate("document.querySelector('#typeface h2').textContent.trim()"), "Font");
  assert.deepEqual(await scanLeftover("en", LIVE_ROOTS), [], "no leftover Chinese after live switch to en");

  await switchTop("ja", "ja");
  assert.notEqual(await evaluate("document.querySelector('h1').textContent.trim()"), "Molis Work Component catalog");
  assert.equal(await evaluate("document.querySelector('#typeface h2').textContent.trim()"), "フォント");
  assert.deepEqual(await scanLeftover("ja", LIVE_ROOTS), [], "no leftover Simplified-Chinese leaks after live switch to ja");

  await switchTop("zh", "zh-CN");
  assert.equal(await evaluate("document.querySelector('#typeface h2').textContent.trim()"), "字体");

  // Part B: Full-page /__ui/catalog?lang=en and ?lang=ja across every section on the board.
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=en` }, sessionId));
  await waitFor("document.readyState === 'complete' && document.documentElement.lang === 'en'", 25_000);
  assert.deepEqual(await scanLeftover("en"), [], "zero leftover Chinese across entire /__ui/catalog?lang=en");

  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=ja` }, sessionId));
  await waitFor("document.readyState === 'complete' && document.documentElement.lang === 'ja'", 25_000);
  assert.deepEqual(await scanLeftover("ja"), [], "zero leftover Simplified-Chinese leaks across entire /__ui/catalog?lang=ja");
});
