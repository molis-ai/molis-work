import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-39 (§render-lifecycle 同源标本): what the component board was still missing — its own language
// switch and English sample words beside Chinese and mixed ones; plugins' rows (Shelf's media materials, Diff's file rows,
// Coding's session rows) drawn by the plugins' own renderers through their declared specimens; the Assistant's usage detail
// while a round runs, once reported and when nothing was reported; and the Assistant's questionnaire answered, busy, refused
// (simulated) and taken. Samples and the stand-in Host are simulated, and the board says so.

const CJK = /[㐀-鿿]/;

test("VUX-39 the board switches its own language, and its plugin rows are Shelf's, Diff's and Coding's own rows in Chinese, English and mixed words", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=en#plugin-rows` }, sessionId));
  await waitFor("document.readyState === 'complete' && !!document.querySelector('#plugin-rows')", 20_000);
  await evaluate("document.querySelector('#plugin-rows').scrollIntoView()");
  const frame = "document.querySelector('[data-rows-frame]')";
  const inFrame = <T>(body: string) => evaluate<T>(`(() => { const d = ${frame}.contentDocument, w = d.defaultView; ${body} })()`);
  const ready = (query: string) => `${frame}.contentWindow.location.search.includes('${query}') && ${frame}.contentDocument.readyState === 'complete' && !!${frame}.contentDocument.querySelector('[data-board-plugin-rows]')`;
  const choose = async (name: string, value: string) => {
    await evaluate(`document.querySelector('[data-rows-params] [data-cond-param="${name}"][data-cond-value="${value}"]').click()`);
    if (name !== "width") await waitFor(ready(`${name}=${value}`), 20_000);
  };

  // The board's own switch: the page is in English (only this page: the Home's language is untouched) and its frames start in it.
  const board = await evaluate<{ lang: string; current: string; sections: string[]; frames: string[] }>(`(() => ({ lang: document.documentElement.lang,
    current: document.querySelector('[data-board-lang].is-current').dataset.boardLang,
    sections: ['#conditions', '#assistant', '#plugin-rows'].map((id) => document.querySelector(id + ' h2').textContent),
    frames: ['[data-cond-frame]', '[data-asst-frame]', '[data-rows-frame]'].map((s) => new URL(document.querySelector(s).src).searchParams.get('lang')) }))()`);
  assert.deepEqual(board, { lang: "en", current: "en", sections: ["Conditions and states", "Assistant information and works", "Plugin rows"], frames: ["en", "en", "en"] });
  // Its words are English; only the language switch names 中文 in its own language, as the product's switch does.
  assert.equal(CJK.test(await evaluate<string>("[...document.querySelectorAll('#plugin-rows h2, #plugin-rows .mw-catalog__hint, #plugin-rows .mw-cond-param > span, #plugin-rows [data-cond-param]:not([data-cond-value=zh])')].map((n) => n.textContent).join(' ')")), false,
    "the plugin rows section has no Chinese in English");
  await waitFor(ready("lang=en"), 20_000);

  // The strip: interface language, sample words and container; each specimen says it is a sample and whose renderer drew it.
  const strip = await evaluate<{ params: string[]; current: string[] }>(`(() => { const groups = [...document.querySelectorAll('[data-rows-params] [data-slot=toggle-group]')];
    return { params: groups.map((g) => g.querySelector('[data-cond-param]').dataset.condParam), current: groups.map((g) => g.querySelector('.is-current').dataset.condValue) }; })()`);
  assert.deepEqual(strip, { params: ["lang", "text", "width"], current: ["en", "zh", "760"] });
  const specimens = await inFrame<Array<[string, string, string, string]>>("return [...d.querySelectorAll('[data-board-specimen]')].map((f) => [f.dataset.boardPlugin, f.dataset.boardSpecimen, f.dataset.place, f.querySelector('figcaption').textContent]);");
  assert.deepEqual(specimens.map(([plugin, id, place]) => [plugin, id, place]), [["shelf", "shelf-media", "column"], ["coding", "coding-sessions", "column"], ["diff", "diff-files", "page"]]);
  assert.ok(specimens.every(([, , , caption]) => caption.includes("Sample data (simulated)")), "every specimen is labelled as sample data");

  // English words in English: nothing Chinese is left anywhere in the rows, the labels or the captions.
  await choose("text", "en");
  assert.equal(await inFrame<string>("return [...d.querySelector('[data-board-plugin-rows]').querySelectorAll('*')].map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('title') ?? '') + (n.getAttribute('aria-label') ?? '')).join(' ').match(/[㐀-鿿]+/g)?.join(' ') ?? '';"), "",
    "no Chinese text, title or label is left in English");

  // Shelf: the media materials and a failed result, drawn by Shelf's row (the extension stays visible while a long stem yields).
  const shelf = await inFrame<{ rows: Array<[string, string, string]>; failed: number; folds: string[]; ext: boolean }>(`const s = d.querySelector('[data-board-specimen=shelf-media]');
    const rows = [...s.querySelectorAll('.shelf-row')]; const long = rows[1].querySelector('.shelf-name__ext').getBoundingClientRect(), box = rows[1].getBoundingClientRect();
    return { rows: rows.map((r) => [r.dataset.shelfName, r.dataset.shelfKind, [...r.querySelector('.shelf-glyph').classList].find((c) => c.startsWith('tone-'))]),
      failed: s.querySelectorAll('.shelf-row.is-failed .shelf-status').length, folds: [...s.querySelectorAll('summary strong')].map((n) => n.textContent), ext: long.right <= box.right + 0.5 && long.width > 0 };`);
  t.diagnostic("shelf rows: " + JSON.stringify(shelf.rows));
  assert.deepEqual(shelf.rows.map(([name]) => name), ["whiteboard-photo.png", "first-use-notes-screenshot-import-wizard-step-one-2026-10-23-morning.png", "trial-recording-first-import.mp4", "interview-wang-yijun.m4a", "interview-transcript.md"]);
  assert.deepEqual(shelf.rows.map(([, kind]) => kind), ["image", "image", "file", "file", "markdown"], "the kinds Shelf gives these files (a recording and a voice note are files to it)");
  assert.deepEqual([shelf.failed, shelf.folds, shelf.ext], [1, ["Material", "Results"], true]);

  // Diff: a round's three files with their counts; the long path stays inside its row; the first file's rows follow.
  const diff = await inFrame<{ files: Array<[string, string, string]>; inside: boolean; rows: number; phase: string }>(`const s = d.querySelector('[data-board-specimen=diff-files]');
    const items = [...s.querySelectorAll('.mw-diff-files li')], body = s.querySelector('.mw-cond-plugin__body').getBoundingClientRect();
    return { files: items.map((li) => [li.dataset.kind, li.querySelector('button').textContent, li.querySelector('.mw-diff-counts').textContent]),
      inside: items.every((li) => li.getBoundingClientRect().right <= body.right + 0.5), rows: s.querySelectorAll('.mw-diff-rows li').length, phase: s.querySelector('.mw-diff').dataset.phase };`);
  assert.deepEqual(diff.files.map(([kind, , counts]) => [kind, counts]), [["modified", "+3 −1"], ["added", "+128 −0"], ["deleted", "+0 −1042"]]);
  assert.match(diff.files[0]![1], /^1\. packages\/authentication\/.+\.ts$/);
  assert.deepEqual([diff.inside, diff.phase], [true, "ready"]);
  assert.equal(diff.rows, 6, "the first file's six rows are drawn under the list");

  // Coding: the sessions under their Goal and with none, each with its state in words and the state ring the live list draws.
  const coding = await inFrame<{ groups: string[]; states: Array<[string, string, string, boolean]> }>(`const s = d.querySelector('[data-board-specimen=coding-sessions]');
    return { groups: [...s.querySelectorAll('.mw-dir__heading')].map((h) => h.textContent),
      states: [...s.querySelectorAll('.coding-session-state')].map((m) => [m.dataset.state, m.dataset.mwState, m.textContent, !!m.querySelector(':scope > svg.mw-state-ring')]) };`);
  assert.deepEqual(coding.groups, ["Unblock the first import", "No Goal"]);
  assert.deepEqual(coding.states.map(([state, ring]) => [state, ring]), [["running", "running"], ["waiting-answer", "answer"], ["waiting-approval", "approval"], ["reconcile-required", "verify"], ["failed", "failed"], ["paused", "paused"], ["done", "idle"]]);
  assert.ok(coding.states.every(([, , , ring]) => ring), "every state carries its ring (before: the first paint had none)");
  assert.deepEqual(coding.states.map(([, , words]) => words), ["Running", "Waiting for your answer", "Waiting for your review", "Results to check", "Failed, needs handling", "Paused", "Turn ended"]);

  // Mixed words hold both languages; Chinese interface words read as the plugins' pages read them.
  await choose("text", "mixed");
  const mixed = await inFrame<string>("return d.querySelector('[data-board-plugin-rows]').textContent;");
  assert.ok(CJK.test(mixed) && /first import|session cookie/.test(mixed), "mixed sample words hold Chinese and English");
  await choose("lang", "zh");
  assert.deepEqual(await inFrame<string[]>("return [...d.querySelectorAll('[data-board-specimen=coding-sessions] .coding-session-state')].slice(0, 2).map((m) => m.textContent);"), ["执行中", "等你回答"]);

  // Container and the page's preferences: no row runs out sideways in a split pane or on a phone; dark and compact reach the frame.
  for (const width of ["420", "360"]) {
    await choose("width", width);
    await waitFor(`${frame}.contentWindow.innerWidth === ${width}`);
    assert.equal(await inFrame<boolean>("return d.scrollingElement.scrollWidth <= d.scrollingElement.clientWidth;"), true, `nothing runs out sideways at ${width}px`);
  }
  await evaluate("document.querySelector('[data-cond-params] [data-theme-option=dark]').click(); document.querySelector('[data-cond-params] [data-density-option=compact]').click()");
  await waitFor(`(() => { const e = ${frame}.contentDocument.documentElement; return e.dataset.resolvedTheme === 'dark' && e.dataset.density === 'compact'; })()`);
  await evaluate("document.querySelector('[data-cond-params] [data-theme-option=light]').click(); document.querySelector('[data-cond-params] [data-density-option=standard]').click()");

  // Back to Chinese: the switch reloads the board in the other language, where it was.
  await navigate(() => evaluate("document.querySelector('[data-board-lang=zh]').click()"));
  await waitFor("document.readyState === 'complete' && new URL(location.href).searchParams.get('lang') === 'zh'", 20_000);
  assert.deepEqual(await evaluate("[document.documentElement.lang, document.querySelector('#plugin-rows h2').textContent, location.hash]"), ["zh-CN", "插件行视图", "#plugin-rows"]);
});

test("VUX-39 the board's Assistant shows its usage detail running, reported and unavailable, and its works in English words with no Chinese left", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#assistant` }, sessionId));
  await evaluate("document.querySelector('#assistant').scrollIntoView()");
  const frame = "document.querySelector('[data-asst-frame]')";
  const inFrame = <T>(body: string) => evaluate<T>(`(async () => { const d = ${frame}.contentDocument, w = d.defaultView; ${body} })()`);
  const ready = (work: string) => `(() => { const d = ${frame}.contentDocument; const p = d?.querySelector('[data-assistant-panel]'); return d?.readyState === 'complete' && p && !p.hidden
    && d.querySelector('.assistant-tab[data-current]')?.dataset.tab === '${work}' && !d.querySelector('[data-assistant-block=tools]').hidden; })()`;
  const open = async (work: string) => {
    await inFrame(`d.querySelector('[data-tab="${work}"] .assistant-tab-main').click(); return null;`);
    await waitFor(`(() => { const d = ${frame}.contentDocument; return d.querySelector('.assistant-tab[data-current]')?.dataset.tab === '${work}' && d.querySelector('[data-assistant-usage]').dataset.signature?.includes('"${work}"'); })()`, 15_000);
  };
  // The usage box of the open work, opened: each part's title and its rows.
  const usage = () => inFrame<{ summary: string; parts: Record<string, string[]>; bar: boolean }>(`const box = d.querySelector('[data-assistant-usage]'); if (box.hidden) return null;
    const details = box.querySelector('details'); details.open = true;
    return { summary: details.querySelector('summary').textContent, bar: !!box.querySelector('.assistant-progress'),
      parts: Object.fromEntries([...box.querySelectorAll('.assistant-usage-part')].map((p) => [p.querySelector('.assistant-block-sub').textContent,
        [...p.querySelectorAll('.assistant-usage-row')].map((r) => r.textContent)])) };`);
  await waitFor(ready("board-plan"), 20_000);

  // Reported: the round's own report, the window against the model's, cache apart from input, an unreported cost unavailable.
  const reported = await usage();
  t.diagnostic("reported: " + JSON.stringify(reported));
  assert.equal(reported.summary, "用量 · 18,200 tokens");
  assert.deepEqual(reported.parts["上下文窗口"], ["已用41,000 / 200,000 · 21%"]);
  assert.deepEqual(reported.parts["本轮"], ["输入9,200", "输出640", "缓存读取6,000", "费用暂不可用"]);
  assert.deepEqual(reported.parts["账户额度"], ["额度与重置暂不可用"]);
  assert.equal(reported.bar, true, "a share is drawn when both the use and the window are known");

  // Running: the round has its model and no report yet, so it says 进行中 and draws no share.
  await open("board-coding");
  const running = await usage();
  assert.deepEqual([running.parts["上下文窗口"], running.parts["本轮"], running.bar], [["已用进行中"], ["输入进行中", "输出进行中"], false]);

  // Unavailable: the round ended with no report, so every number reads 暂不可用, never 0.
  await open("board-digest");
  const unavailable = await usage();
  assert.deepEqual([unavailable.parts["上下文窗口"], unavailable.parts["本轮"], unavailable.bar], [["已用暂不可用"], ["输入暂不可用", "输出暂不可用"], false]);
  // A refused step (user 2026-10-23 ⑤): the reason and the field in plain words; the runtime's own text, hook name and all, one fold down and closed.
  const refused = await inFrame<{ head: string; rows: string[]; raw: string; open: boolean }>(`const step = d.querySelector('[data-entry="a:c-d3"]'), fold = step.querySelector('.assistant-activity-raw');
    return { head: step.querySelector('summary').textContent, rows: [...step.querySelectorAll('.assistant-activity-detail > p')].map((p) => p.textContent),
      raw: fold.textContent, open: fold.open };`);
  assert.equal(refused.head, "修改 Pages · 新建摘要文档 — 没有完成");
  assert.deepEqual(refused.rows, ["调用的能力pages.docs.create", "原因输入不符合能力合同", "整个输入多了合同里没有的内容"]);
  assert.match(refused.raw, /^原始说明Hook "molis-action-gateway-pages" blocked/);
  assert.equal(refused.open, false, "the runtime's text stays folded until asked for");

  // The works' own words in English beside the English interface: the panel, its tabs, the thread and the side pane keep no Chinese.
  for (const [name, value] of [["lang", "en"], ["text", "en"]] as const) {
    await evaluate(`document.querySelector('[data-asst-params] [data-cond-param="${name}"][data-cond-value="${value}"]').click()`);
    await waitFor(`${frame}.contentWindow.location.search.includes('${name}=${value}') && ${ready("board-plan")}`, 20_000);
  }
  const left = await inFrame<string>(`const panel = d.querySelector('[data-assistant-panel]');
    return [...panel.querySelectorAll('*')].filter((n) => n.getClientRects().length).map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('')).join(' ').match(/[㐀-鿿]+/g)?.join(' ') ?? '';`);
  assert.equal(left, "", "no Chinese left in the panel in English words and English interface");
  assert.deepEqual(await inFrame<string[]>("return [...d.querySelectorAll('.assistant-tab-title')].slice(0, 3).map((n) => n.textContent);"), ["Sign-in keeps the old session cookie", "Plan the trial review", "Reply to Yijun Wang's email"]);
  assert.match((await usage()).summary, /^Usage · 18,200 tokens$/);
  // Mixed words: one thread holds both languages.
  await evaluate(`document.querySelector('[data-asst-params] [data-cond-param="text"][data-cond-value="mixed"]').click()`);
  await waitFor(`${frame}.contentWindow.location.search.includes('text=mixed') && ${ready("board-plan")}`, 20_000);
  const mixed = await inFrame<string>("return d.querySelector('[data-assistant-thread]').textContent;");
  assert.ok(CJK.test(mixed) && /event|confirm/.test(mixed), "mixed words hold Chinese and English in one thread");
});

test("VUX-39 the board's Assistant questionnaire: one choice, several and other words; busy while sent, ⌘↵ sends once; refused under its question; taken", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#assistant` }, sessionId));
  await evaluate("document.querySelector('#assistant').scrollIntoView()");
  const frame = "document.querySelector('[data-asst-frame]')";
  const inFrame = <T>(body: string) => evaluate<T>(`(async () => { const d = ${frame}.contentDocument, w = d.defaultView; ${body} })()`);
  const inside = (expression: string) => `(() => { const d = ${frame}.contentDocument; if (!d || d.readyState !== 'complete') return false; return ${expression}; })()`;
  const card = "d.querySelector('[data-question]')";
  // Opens the work that asks, and fills its questionnaire: 英文 for the one choice, two of the arrangements and words of its own, a note.
  const fill = async () => {
    await waitFor(inside("!!d.querySelector('[data-tab=\"board-reply\"]')"), 20_000);
    await inFrame("d.querySelector('[data-tab=\"board-reply\"] .assistant-tab-main').click(); return null;");
    await waitFor(inside("!!d.querySelector('[data-question] [type=submit]')"), 15_000);
    return inFrame<{ one: string[]; several: string[]; other: string }>(`const c = ${card};
      const q1 = c.querySelector('[data-ix-field=q1]'), q2 = c.querySelector('[data-ix-field=q2]');
      q1.querySelector('[data-ix-option="2"]').click(); q2.querySelector('[data-ix-option="1"]').click(); q2.querySelector('[data-ix-option="3"]').click();
      const other = q2.querySelector('[data-ix-other]'); other.value = '也抄送产品组'; other.dispatchEvent(new w.Event('input', { bubbles: true }));
      const note = c.querySelector('[data-ix-field=t3] textarea'); note.value = '语气客气一点'; note.dispatchEvent(new w.Event('input', { bubbles: true }));
      return { one: [...q1.querySelectorAll('[data-ix-option]')].map((o) => o.getAttribute('aria-checked')), several: [...q2.querySelectorAll('[data-ix-option]')].map((o) => o.getAttribute('aria-pressed')), other: other.value };`);
  };
  // Counts the answers that leave the page, through the frame's own fetch (the stand-in Host answers it).
  const countAnswers = () => inFrame("const f = w.fetch; w.__answers = 0; w.fetch = (input, init) => { if (String(input).endsWith('/answer')) w.__answers += 1; return f(input, init); }; return null;");

  // Refused (simulated): the stand-in Host refuses as the Runtime refuses a questionnaire.
  await evaluate(`document.querySelector('[data-asst-params] [data-cond-param="answer"][data-cond-value="refused"]').click()`);
  await waitFor(`${frame}.contentWindow.location.search.includes('answer=refused')`, 20_000);
  const filled = await fill();
  assert.deepEqual(filled, { one: ["false", "true"], several: ["true", "false", "true"], other: "也抄送产品组" }, "one choice holds one pick, several hold two, other words are kept");
  await countAnswers();
  // Busy: the button shows the shared loading mark and is disabled; ⌘↵ in the note sends nothing a second time.
  const busy = await inFrame<{ disabled: boolean; loading: boolean; spinner: boolean; answers: number }>(`const c = ${card}, button = c.querySelector('[type=submit]');
    button.click(); await new Promise((r) => setTimeout(r, 50));
    c.querySelector('[data-ix-field=t3] textarea').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, ctrlKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    return { disabled: button.disabled, loading: button.hasAttribute('data-loading'), spinner: !!button.querySelector(':scope > .mw-spinner'), answers: w.__answers };`);
  assert.deepEqual(busy, { disabled: true, loading: true, spinner: true, answers: 1 }, "busy while the answer is on its way, and sent once (before, ⌘↵ sent it again)");
  // The refusal lands under the question it is about; the card stays with everything written; the button is back.
  await waitFor(inside("!d.querySelector('[data-question] [data-ix-field=q1] [data-ix-error]').hidden"), 10_000);
  const refused = await inFrame<{ error: string; invalid: string | null; disabled: boolean; loading: boolean; several: string[]; other: string; note: string }>(`const c = ${card}, button = c.querySelector('[type=submit]');
    return { error: c.querySelector('[data-ix-field=q1] [data-ix-error]').textContent, invalid: c.querySelector('[data-ix-field=q1] [role=radiogroup]').getAttribute('aria-invalid'),
      disabled: button.disabled, loading: button.hasAttribute('data-loading'), several: [...c.querySelectorAll('[data-ix-field=q2] [data-ix-option]')].map((o) => o.getAttribute('aria-pressed')),
      other: c.querySelector('[data-ix-field=q2] [data-ix-other]').value, note: c.querySelector('[data-ix-field=t3] textarea').value };`);
  assert.deepEqual(refused, { error: "选项已经变化，请重新选择", invalid: "true", disabled: false, loading: false, several: ["true", "false", "true"], other: "也抄送产品组", note: "语气客气一点" });

  // Taken: the card goes and the round runs on to its end.
  await evaluate(`document.querySelector('[data-asst-params] [data-cond-param="answer"][data-cond-value="ok"]').click()`);
  await waitFor(`${frame}.contentWindow.location.search.includes('answer=ok')`, 20_000);
  await fill();
  await inFrame(`${card}.querySelector('[type=submit]').click(); return null;`);
  assert.equal(await inFrame<boolean>(`return ${card}?.querySelector('[type=submit]')?.disabled ?? false;`), true, "disabled while it is sent");
  await waitFor(inside("!d.querySelector('[data-question]') && d.querySelector('[data-assistant-thread]').textContent.includes('回复草稿写好了')"), 10_000);
  t.diagnostic("questionnaire answered");
});

test("VUX-39/VUX-43 the board's Assistant shows a rate-limited round counting down to its retry time in fixed-width digits, in both languages", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#assistant` }, sessionId));
  await evaluate("document.querySelector('#assistant').scrollIntoView()");
  const frame = "document.querySelector('[data-asst-frame]')";
  const status = `${frame}.contentDocument?.querySelector('[data-assistant-thread] .assistant-round-status[data-retry-until]')`;
  const read = () => evaluate<{ text: string; numeric: string } | null>(`(() => { const s = ${status}; return s ? { text: s.textContent, numeric: getComputedStyle(s).fontVariantNumeric } : null; })()`);
  const pick = async (name: string, value: string) => {
    await evaluate(`document.querySelector('[data-asst-params] [data-cond-param="${name}"][data-cond-value="${value}"]').click()`);
    await waitFor(`${frame}.contentWindow.location.search.includes('${name}=${value}')`, 20_000);
  };
  // The sample's runtime waits ten minutes, so the board shows the countdown, not 正在重试….
  await pick("work", "limited");
  await waitFor(`${status}?.textContent.startsWith('被限流，')`, 20_000);
  const first = await read();
  t.diagnostic("zh: " + JSON.stringify(first));
  assert.match(first!.text, /^被限流，(09:[0-5]\d|10:00) 后自动重试$/);
  assert.equal(first!.numeric, "tabular-nums", "the digits keep their width while they count");
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.notEqual((await read())!.text, first!.text, "it counts down");
  await pick("lang", "en");
  await waitFor(`${status}?.textContent.startsWith('Rate limited.')`, 20_000);
  assert.match((await read())!.text, /^Rate limited\. Retrying in (09:[0-5]\d|10:00)$/);
});
