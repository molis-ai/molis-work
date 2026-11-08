import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

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

async function switchTo(browser: Browser, locale: "zh" | "en") {
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
  // And back: the same section in Chinese again, with the person's state still there.
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
      f.innerHTML = zh ? '<select name="pick"><option value="甲">中文选项</option></select><button name="go" value="提交的值">提交</button>'
        : '<select name="pick"><option value="A">English option</option></select><button name="go" value="sent-value">Send</button>';
      return f; };
    document.querySelector('[data-board-env-live]').append(form(true));
    document.querySelector('template[data-board-env-render=zh]').content.append(form(true));
    document.querySelector('template[data-board-env-render=en]').content.append(form(false));
  })()`);
  await evaluate(WATCH);
  await switchTo(browser, "en");
  assert.deepEqual(await evaluate(`(() => { const f = document.querySelector('[data-board-env-live] [data-test-form]'), option = f.querySelector('option'), button = f.querySelector('button');
    return [option.getAttribute('value'), option.textContent, button.getAttribute('value'), button.textContent, window.__boardEnv]; })()`),
  ["甲", "English option", "提交的值", "Send", { removed: 0, html: 0, values: 0, loadedOnce: true }]);
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
