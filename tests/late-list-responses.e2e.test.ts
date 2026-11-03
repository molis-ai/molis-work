import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { openCogniaStore } from "./fixtures/plugin-home-stores.js";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import { TODO_ACTION_PERMISSIONS, todoOrganizeActions } from "@molis-ai/molis-work-plugin-todo";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// specs/visual-ui-experience VUX-31「旧响应不覆盖新状态」: a list that is filtered, searched or paged shows what was asked last.
// The earlier question's answer is held back in Chrome (a real request, nothing mocked) while the person asks again; when it arrives late it changes nothing, the control keeps what was chosen last, and a late page of an older question is
// not added to the new list. Each test counts the reads it saw, so a list that stopped asking could not pass.

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
interface Held { requestId: string; url: string }

/** Chrome holds the real request (or, at the "Response" stage, the answer the Host already gave) until the test lets it go; `seen` is every one of them, in the order they came. */
async function holdReads(browser: Browser, patterns: string[], stage: "Request" | "Response" = "Request") {
  const seen: string[] = [], held: Held[] = [];
  const off = browser.on("Fetch.requestPaused", (event, session) => {
    if (session !== browser.sessionId) return;
    const request = event.request as { url: string; postData?: string };
    const line = request.url + (request.postData ? " " + request.postData : "");
    seen.push(line); held.push({ requestId: String(event.requestId), url: line });
  });
  await browser.command("Fetch.enable", { patterns: patterns.map((urlPattern) => ({ urlPattern, requestStage: stage })) }, browser.sessionId);
  const release = async (one: Held) => { held.splice(held.indexOf(one), 1); await browser.command("Fetch.continueRequest", { requestId: one.requestId }, browser.sessionId); };
  return {
    seen,
    /** The first held request whose url (and body) has `part`, once it has been sent. */
    async next(part: string, ms = 10_000): Promise<Held> {
      for (const until = Date.now() + ms; ;) {
        const one = held.find((candidate) => candidate.url.includes(part));
        if (one) return one;
        if (Date.now() > until) throw new Error(`No request with ${part} was sent; seen ${JSON.stringify(seen)}`);
        await pause(25);
      }
    },
    release,
    /** Held now. */
    pending: () => [...held],
    /** The first `count` held requests whose url has `part`, once they have been sent. */
    async every(part: string, count: number, ms = 10_000): Promise<Held[]> {
      for (const until = Date.now() + ms; ;) {
        const found = held.filter((candidate) => candidate.url.includes(part));
        if (found.length >= count) return found.slice(0, count);
        if (Date.now() > until) throw new Error(`Fewer than ${count} requests with ${part} were sent; seen ${JSON.stringify(seen)}`);
        await pause(25);
      }
    },
    /** Lets the first held request whose url (and body) has `part` go. */
    async answer(part: string) { const one = await this.next(part); await release(one); },
    async close() { for (const one of [...held]) await release(one); off(); await browser.command("Fetch.disable", {}, browser.sessionId); },
  };
}

const typed = (selector: string, text: string) => `(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`;
const wide = (browser: Browser) => browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
const openPlugin = async (browser: Browser, plugin: string) => browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=${plugin}` }, browser.sessionId));

test("VUX-31: Todo shows the view chosen last when an earlier view answers late", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  // Todo runs in its own isolated frame: the page is read and driven there; its reads still go through this page's Host.
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "todo");
  await wide(browser); await openPlugin(browser, "todo");
  await waitFor("!!document.querySelector('[data-todo-quick-input]') && document.querySelector('[data-todo-loading]').hidden", 20_000);
  // One item is due today, the other has no day: each view lists exactly one of them.
  for (const title of ["今天写甲报告", "写乙报告"]) {
    await evaluate(`(() => { const input = document.querySelector('[data-todo-quick-input]'); input.value = ${JSON.stringify(title)}; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-todo-quick]').requestSubmit(); })()`);
    await waitFor(`document.querySelector('[data-todo-quick-input]').value === ''`, 10_000);
  }
  const view = (name: string) => evaluate(`document.querySelector('[data-todo-view="${name}"]').click()`);
  const shown = () => evaluate<string[]>("[...document.querySelectorAll('[data-todo-row]')].map((row) => row.textContent.includes('甲') ? '甲' : row.textContent.includes('乙') ? '乙' : '?')");
  const pressed = () => evaluate<string[]>("[...document.querySelectorAll('[data-todo-view][aria-pressed=true]')].map((button) => button.dataset.todoView)");
  await view("all"); await waitFor("document.querySelectorAll('[data-todo-row]').length === 2", 10_000);
  const hold = await holdReads(browser, ["*io.molis.work.todo/items?view=*"]);
  try {
    await view("today"); await hold.next("view=today");
    await view("unscheduled"); await hold.answer("view=unscheduled");
    await waitFor("document.querySelectorAll('[data-todo-row]').length === 1 && document.querySelector('[data-todo-view=unscheduled]').getAttribute('aria-pressed') === 'true'", 10_000);
    assert.deepEqual(await shown(), ["乙"], "the second view shows its own rows");
    await hold.answer("view=today"); await pause(800);
    assert.deepEqual(await shown(), ["乙"], "the first view's late answer does not replace the rows");
    assert.deepEqual(await pressed(), ["unscheduled"], "the control keeps the view chosen last");
    assert.deepEqual(hold.seen.map((line) => /view=(\w+)/.exec(line)![1]), ["today", "unscheduled"], "each view was read once");
  } finally { await hold.close(); }
  // What the late answer would have shown, so the check above could have failed.
  await view("today"); await waitFor("document.querySelectorAll('[data-todo-row]').length === 1", 10_000);
  assert.deepEqual(await shown(), ["甲"]);
});

test("VUX-31: Todo shows the search typed last when an earlier search answers late", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  // Todo runs in its own isolated frame: the page is read and driven there; its reads still go through this page's Host.
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "todo");
  await wide(browser); await openPlugin(browser, "todo");
  await waitFor("!!document.querySelector('[data-todo-quick-input]') && document.querySelector('[data-todo-loading]').hidden", 20_000);
  for (const title of ["今天写甲报告", "今天写乙报告"]) {
    await evaluate(`(() => { const input = document.querySelector('[data-todo-quick-input]'); input.value = ${JSON.stringify(title)}; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-todo-quick]').requestSubmit(); })()`);
    await waitFor(`[...document.querySelectorAll('[data-todo-row]')].some((row) => row.textContent.includes(${JSON.stringify(title.slice(-3))}))`, 10_000);
  }
  const shown = () => evaluate<string[]>("[...document.querySelectorAll('[data-todo-row]')].map((row) => row.textContent.includes('甲') ? '甲' : row.textContent.includes('乙') ? '乙' : '?')");
  const hold = await holdReads(browser, ["*io.molis.work.todo/items?view=*"]);
  try {
    await evaluate(typed("[data-todo-search]", "甲")); await hold.next("q=%E7%94%B2");
    await evaluate(typed("[data-todo-search]", "乙")); await hold.next("q=%E4%B9%99");
    await hold.answer("view=all&q=%E4%B9%99"); await hold.answer("view=closed&q=%E4%B9%99");
    await waitFor("document.querySelectorAll('[data-todo-row]').length === 1", 10_000);
    assert.deepEqual(await shown(), ["乙"]);
    await hold.answer("q=%E7%94%B2"); await pause(800);
    assert.deepEqual(await shown(), ["乙"], "the first search's late answer does not replace the rows");
    assert.equal(await evaluate("document.querySelector('[data-todo-search]').value"), "乙", "the box keeps what was typed last");
    assert.equal(hold.seen.length, 3, "the late answer started nothing more: two reads for the last search, one for the first: " + JSON.stringify(hold.seen));
  } finally { await hold.close(); }
});

test("VUX-31: Cognia shows the search typed last when an earlier search answers late", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { homeDirectory } = browser;
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "cognia");
  const store = openCogniaStore(homeDirectory);
  try { for (const title of ["甲资料", "乙资料"]) store.createMaterial({ title, body: title + "的正文" }); } finally { store.close(); }
  await wide(browser); await openPlugin(browser, "cognia");
  await waitFor("document.querySelectorAll('[data-cognia-id]').length === 2", 20_000);
  const shown = () => evaluate<string[]>("[...document.querySelectorAll('[data-cognia-id]')].map((row) => row.textContent.includes('甲') ? '甲' : '乙')");
  const hold = await holdReads(browser, ["*io.molis.work.cognia/library?*"]);
  try {
    await evaluate(typed("[data-cognia-search]", "甲资料")); await hold.next("q=%E7%94%B2");
    await evaluate(typed("[data-cognia-search]", "乙资料")); await hold.answer("q=%E4%B9%99");
    await waitFor("document.querySelectorAll('[data-cognia-id]').length === 1", 10_000);
    assert.deepEqual(await shown(), ["乙"]);
    await hold.answer("q=%E7%94%B2"); await pause(800);
    assert.deepEqual(await shown(), ["乙"], "the first search's late answer does not replace the rows");
    assert.equal(await evaluate("document.querySelector('[data-cognia-search]').value"), "乙资料");
    assert.equal(hold.seen.length, 2, JSON.stringify(hold.seen));
  } finally { await hold.close(); }
  await evaluate(typed("[data-cognia-search]", "")); await waitFor("document.querySelectorAll('[data-cognia-id]').length === 2", 10_000);
});

/** The pieces of the project's knowledge: a file imported into the 成果库 is one (the same door a person uses). */
async function importPieces(browser: Browser, count: number, words = (n: number) => `资料${n}`) {
  const origin = `${browser.origin}/projects/${browser.projectId}`;
  const send = async (n: number) => {
    const response = await fetch(origin + "/api/artifacts/import", { method: "POST", body: JSON.stringify({ source: "file", filename: `${words(n)}.md`, content: `# ${words(n)}\n\n${words(n)}的正文。` }),
      headers: { "content-type": "application/json", origin: browser.origin, "x-molis-work-control-token": browser.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    assert.ok(response.ok, `${n}: ${response.status} ${await response.clone().text()}`);
  };
  for (let from = 0; from < count; from += 8) await Promise.all(Array.from({ length: Math.min(8, count - from) }, (_, offset) => send(from + offset)));
}

const ROWS = "document.querySelectorAll('[data-knowledge-list] .knowledge-row').length";
/** The 项目资料 page, opened on a project with more pieces than one page (200) holds. */
async function openKnowledgePage(t: Parameters<typeof openGoalBrowser>[0]) {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return null;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await importPieces(browser, 205);
  await wide(browser);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/settings/knowledge` }, sessionId));
  await waitFor(`${ROWS} === 200 && !document.querySelector('[data-knowledge-more]').hidden`, 60_000);
  const choose = (state: string) => evaluate(`(() => { const select = document.querySelector('[data-knowledge-filter=state]'); select.value = ${JSON.stringify(state)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  return { browser, choose, rows: () => evaluate<number>(ROWS), moreHidden: () => evaluate<boolean>("document.querySelector('[data-knowledge-more]').hidden") };
}

test("VUX-31: the project knowledge page shows the state chosen last when an earlier state answers late", { timeout: 300_000 }, async (t) => {
  const page = await openKnowledgePage(t); if (!page) return;
  const { browser, choose, rows, moreHidden } = page, { evaluate, waitFor } = browser;
  const hold = await holdReads(browser, ["*/api/knowledge/overview?*"]);
  try {
    await choose("pending"); await hold.next("offset=0&state=pending");
    await choose("failed"); await hold.answer("offset=0&state=failed");
    await waitFor(`${ROWS} === 0 && document.querySelector('[data-knowledge-more]').hidden`, 10_000);
    await hold.answer("offset=0&state=pending"); await pause(800);
    assert.equal(await rows(), 0, "the first state's late answer does not replace the list");
    assert.equal(await evaluate("document.querySelector('[data-knowledge-filter=state]').value"), "failed", "the control keeps the state chosen last");
    assert.equal(await moreHidden(), true);
    assert.deepEqual(hold.seen.map((line) => /offset=\d+(&state=\w+)?/.exec(line)![0]), ["offset=0&state=pending", "offset=0&state=failed"], "each state was read once");
  } finally { await hold.close(); }
  // What the late answer would have shown, so the check above could have failed.
  await choose("pending"); await waitFor(`${ROWS} === 200`, 20_000);
});

test("VUX-31: the project knowledge page does not add a late page of the earlier list to the list of another state", { timeout: 300_000 }, async (t) => {
  const page = await openKnowledgePage(t); if (!page) return;
  const { browser, choose, rows, moreHidden } = page, { evaluate, waitFor } = browser;
  const hold = await holdReads(browser, ["*/api/knowledge/overview?*"]);
  try {
    await evaluate("document.querySelector('[data-knowledge-more]').click()"); await hold.next("offset=200");
    await choose("failed"); await hold.answer("offset=0&state=failed");
    await waitFor(`${ROWS} === 0`, 10_000);
    await hold.answer("offset=200"); await pause(800);
    assert.equal(await rows(), 0, "a late page of the earlier list is not added to the new one");
    assert.equal(await moreHidden(), true);
    assert.equal(hold.seen.length, 2, JSON.stringify(hold.seen));
  } finally { await hold.close(); }
  // The same page without the other state in the way is added, and it is the end of the list.
  await choose(""); await waitFor(`${ROWS} === 200 && !document.querySelector('[data-knowledge-more]').hidden`, 20_000);
  await evaluate("document.querySelector('[data-knowledge-more]').click()");
  await waitFor(`${ROWS} > 200 && document.querySelector('[data-knowledge-more]').hidden`, 20_000);
});

test("VUX-31: the search palette shows the words typed last when an earlier search answers late", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, click, navigate, command, sessionId, origin, projectId } = browser;
  await importPieces(browser, 2, (n) => ["alphaone", "betatwo"][n]!);
  await wide(browser);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]').open");
  const shown = () => evaluate<string[]>("[...document.querySelectorAll('[data-global-search-hit].is-content .global-search-hit-title')].map((node) => node.textContent)");
  // The index is filled in the background: ask until both pieces are found, before anything is held.
  for (const word of ["alphaone", "betatwo"]) {
    await evaluate(typed("[data-global-search]", word));
    await waitFor(`[...document.querySelectorAll('[data-global-search-hit].is-content .global-search-hit-title')].some((node) => node.textContent.includes(${JSON.stringify(word)}))`, 30_000);
  }
  const hold = await holdReads(browser, ["*/api/search/query"]);
  try {
    await evaluate(typed("[data-global-search]", "alphaone")); await hold.next('"query":"alphaone"');
    await evaluate(typed("[data-global-search]", "betatwo")); await hold.answer('"query":"betatwo"');
    await waitFor("[...document.querySelectorAll('[data-global-search-hit].is-content .global-search-hit-title')].some((node) => node.textContent.includes('betatwo'))", 10_000);
    await hold.answer('"query":"alphaone"'); await pause(800);
    const titles = await shown();
    assert.ok(titles.length && titles.every((title) => title.includes("betatwo")), "the first words' late answer does not replace the hits: " + JSON.stringify(titles));
    assert.equal(await evaluate("document.querySelector('[data-global-search]').value"), "betatwo");
    assert.equal(hold.seen.length, 2, JSON.stringify(hold.seen));
  } finally { await hold.close(); }
});

test("VUX-31: the search palette does not add a late page of the earlier words to the new hits", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, click, navigate, command, sessionId, origin, projectId } = browser;
  await importPieces(browser, 25, (n) => `gammathree${n}`);
  await importPieces(browser, 1, () => "betatwo");
  await wide(browser);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]').open");
  const titles = () => evaluate<string[]>("[...document.querySelectorAll('[data-global-search-hit].is-content .global-search-hit-title')].map((node) => node.textContent)");
  await evaluate(typed("[data-global-search]", "gammathree"));
  await waitFor("document.querySelectorAll('[data-global-search-hit].is-content').length >= 20 && !!document.querySelector('[data-global-search-more]')", 30_000);
  const hold = await holdReads(browser, ["*/api/search/query"]);
  try {
    await evaluate("document.querySelector('[data-global-search-more]').click()"); await hold.next('"cursor"');
    await evaluate(typed("[data-global-search]", "betatwo")); await hold.answer('"query":"betatwo"');
    await waitFor("[...document.querySelectorAll('[data-global-search-hit].is-content .global-search-hit-title')].every((node) => node.textContent.includes('betatwo')) && document.querySelectorAll('[data-global-search-hit].is-content').length > 0", 10_000);
    await hold.answer('"cursor"'); await pause(800);
    const now = await titles();
    assert.ok(now.length && now.every((title) => title.includes("betatwo")), "the late page of the earlier words is not added: " + JSON.stringify(now));
    assert.equal(hold.seen.length, 2, JSON.stringify(hold.seen));
  } finally { await hold.close(); }
});

test("VUX-31: the Assistant's slash menu shows the words typed last when the lists the first asked for answer late", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await wide(browser);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("!!document.querySelector('[data-assistant-input]') && !!document.querySelector('[data-assistant-starters]')", 20_000);
  const menu = () => evaluate<{ hidden: boolean; buttons: number; text: string }>("(() => { const pop = document.querySelector('[data-assistant-starters]'); return { hidden: pop.hidden, buttons: pop.querySelectorAll('button').length, text: pop.textContent }; })()");
  // The lists the menu draws from are read the first time it opens: two words typed before they arrive each ask for them.
  const hold = await holdReads(browser, ["*/api/assistant/capabilities", "*/api/assistant/methods"]);
  try {
    await evaluate(typed("[data-assistant-input]", "/")); const first = await hold.next("/api/assistant/capabilities");
    await evaluate(typed("[data-assistant-input]", "/zzzzqq"));
    const [, second] = await hold.every("/api/assistant/capabilities", 2);
    await hold.release(second!); await hold.answer("/api/assistant/methods");
    await waitFor("document.querySelector('[data-assistant-starters]').textContent.includes('没有匹配的能力')", 10_000);
    assert.equal((await menu()).buttons, 0, "the words typed last match nothing");
    await hold.release(first); await pause(800);
    const late = await menu();
    assert.equal(late.buttons, 0, "the first words' late answer does not draw its menu over the second's: " + late.text);
    assert.ok(late.text.includes("没有匹配的能力"));
    assert.equal(hold.seen.length, 3, JSON.stringify(hold.seen));
  } finally { await hold.close(); }
});

test("VUX-31: the side panel's file list does not add a late page to the list that was read again", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, click, navigate, command, sessionId, origin, projectId } = browser;
  // One page of a file source is 500 entries.
  await importPieces(browser, 505, (n) => `旧资料${n}`);
  await wide(browser);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-side-toggle]"); await click("[data-side-tab=files]");
  await waitFor("!!document.querySelector('[data-side-files-more]')", 30_000);
  const newRows = () => evaluate<number>("[...document.querySelectorAll('[data-side-file]')].filter((row) => row.textContent.includes('新资料')).length");
  // The page after the first is asked for, and the Host answers at once; the answer is held on its way to the page.
  const hold = await holdReads(browser, ["*/api/side/files/entries?*"], "Response");
  try {
    await evaluate("document.querySelector('[data-side-files-more]').click()"); const stale = await hold.next("cursor=");
    await importPieces(browser, 5, (n) => `新资料${n}`);
    await evaluate("document.querySelector('[data-side-files-action=refresh]').click()");
    // Every other source answers the read again at once; only the late page is kept back.
    for (const until = Date.now() + 20_000; await newRows() === 0; await pause(50)) {
      for (const one of hold.pending()) if (one !== stale) await hold.release(one);
      assert.ok(Date.now() < until, "the list was read again: " + JSON.stringify(hold.seen));
    }
    const before = await newRows();
    await hold.release(stale); await pause(800);
    assert.equal(await newRows(), before, "the late page does not take back the list that was read again");
    assert.ok(before > 0);
    assert.equal(hold.seen.filter((line) => line.includes("cursor=")).length, 1, "the page after the first was read once: " + JSON.stringify(hold.seen));
  } finally { await hold.close(); }
});

const civilToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

test("VUX-31: Jelly keeps what a command returned when the re-read after the Assistant's change answers late", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "jelly");
  const today = civilToday();
  const store = openJellyStore(browser.homeDirectory);
  try { for (const [id, title] of [["late-a", "写周报"], ["late-b", "订会议室"]]) store.execute({ type: "item.create", item: { id, title, kind: "task", start_date: today, end_date: today } }, store.read().revision); } finally { store.close(); }
  await wide(browser); await openPlugin(browser, "jelly");
  await waitFor("!!document.querySelector('[data-jelly-content] [data-jelly-day]')", 20_000);
  await evaluate("document.querySelector('[data-jelly-mode=list]').click()");
  await waitFor("document.querySelectorAll('[data-jelly-toggle-item]').length === 2", 10_000);
  const done = () => evaluate<string[]>("[...document.querySelectorAll('[data-jelly-occurrence].is-done .jelly-item-title')].map((node) => node.textContent)");
  // The Host answers the page's read of the workspace at once; the answer is held on its way to the page.
  const hold = await holdReads(browser, ["*io.molis.work.jelly/"], "Response");
  try {
    await browser.evaluate("window.dispatchEvent(new CustomEvent('molis:assistant-effect', { detail: { work_id: 'w-1', capability_id: 'jelly.item.create' } }))");
    const stale = await hold.next("io.molis.work.jelly/");
    // The person ticks an item meanwhile: the command's answer is the newer workspace.
    await evaluate("document.querySelector('[data-jelly-toggle-item=late-a]').click()");
    await waitFor("document.querySelectorAll('[data-jelly-occurrence].is-done').length === 1", 10_000);
    assert.deepEqual(await done(), ["写周报"]);
    await hold.release(stale); await pause(800);
    assert.deepEqual(await done(), ["写周报"], "the earlier read's late answer does not take the tick back");
    assert.equal(hold.seen.length, 1, "the late answer started nothing more: " + JSON.stringify(hold.seen));
    // The next command is accepted (it carries the newer revision), not turned away as a conflict.
    await evaluate("document.querySelector('[data-jelly-toggle-item=late-b]').click()");
    await waitFor("document.querySelectorAll('[data-jelly-occurrence].is-done').length === 2 || !document.querySelector('[data-jelly-notice]').hidden", 10_000);
    assert.equal(await evaluate("document.querySelector('[data-jelly-notice]').hidden ? '' : document.querySelector('[data-jelly-notice]').textContent"), "", "no conflict notice");
    assert.deepEqual((await done()).sort(), ["写周报", "订会议室"]);
  } finally { await hold.close(); }
});

/** Todo with an organize result of three candidates waiting in 整理结果, opened on that view. */
async function openTodoReview(t: Parameters<typeof openGoalBrowser>[0]) {
  const answer = JSON.stringify({ candidates: [
    { ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true }, due: { date: null, time: null, phrase: null }, evidence: [{ material: 1, excerpt: "请周五前发新版方案" }] },
    { ref: "c2", kind: "waiting", title: "等待小李确认预算", why: "预算要小李确认", owner: { who: "小李", stated: true }, due: { date: null, phrase: null }, waiting: { who: "小李", what: "确认预算" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
    { ref: "c3", kind: "suggestion", title: "今天催小李确认预算", why: "预算确认影响周五交付", owner: { who: "你", stated: false }, due: { date: null, phrase: null }, evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
  ], reference_only: [] });
  const browser = await openGoalBrowser(t, true, undefined, async () => answer); if (!browser) return null;
  const frame = await pluginFrameBrowser(t, browser, "todo");
  await browser.localHost.homeActionClient().invoke({ actor_id: "assistant", project_id: null, audience: "agent", permissions: [...TODO_ACTION_PERMISSIONS] }, todoOrganizeActions.extract,
    { title: "整理：张总的邮件", materials: [{ title: "张总：新版方案", text: "小王你好，请周五前发新版方案，预算等小李确认。" }] });
  await wide(browser); await openPlugin(browser, "todo");
  await frame.waitFor("!document.querySelector('[data-todo-view=review]').hidden", 20_000);
  await frame.evaluate("document.querySelector('[data-todo-view=review]').click()");
  await frame.waitFor("document.querySelectorAll('[data-todo-candidate]').length === 3", 10_000);
  return { browser, ...frame };
}

test("VUX-31: Todo's organize results keep the decision made when an earlier read of them answers late", { timeout: 120_000 }, async (t) => {
  const page = await openTodoReview(t); if (!page) return;
  const { browser, evaluate, waitFor } = page;
  const pending = () => evaluate<number>("document.querySelectorAll('[data-todo-candidate-ignore]').length");
  const hold = await holdReads(browser, ["*io.molis.work.todo/organize"], "Response");
  try {
    // A read of the results begins (the page was shown again); its answer is the results before any decision.
    await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    const stale = await hold.next("io.molis.work.todo/organize");
    await evaluate("document.querySelector('[data-todo-candidate-ignore]').click()");
    // Ignoring reads the results again, and that answer is the one that shows the decision.
    const [, fresh] = await hold.every("io.molis.work.todo/organize", 2);
    await hold.release(fresh!);
    await waitFor("document.querySelectorAll('[data-todo-candidate-ignore]').length === 2", 10_000);
    await hold.release(stale); await pause(800);
    assert.equal(await pending(), 2, "the earlier read's late answer does not bring the ignored candidate back");
    assert.equal(hold.seen.length, 2, JSON.stringify(hold.seen));
  } finally { await hold.close(); }
});

test("VUX-31: Todo's reminders keep the one just acknowledged when an earlier read answers late", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "todo");
  const everything = { projectId: browser.projectId, projectIds: [], actor: "user" as const, actorId: "test" };
  const store = openTodoStore(browser.homeDirectory);
  try { for (const title of ["交报销单", "给妈妈打电话"]) store.create({ title, remind_at: new Date(Date.now() - 5 * 60_000).toISOString() }, everything); } finally { store.close(); }
  await wide(browser); await openPlugin(browser, "todo");
  await waitFor("document.querySelectorAll('[data-todo-reminder]').length === 2", 20_000);
  const hold = await holdReads(browser, ["*io.molis.work.todo/reminders"], "Response");
  try {
    await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    const stale = await hold.next("io.molis.work.todo/reminders");
    await evaluate("document.querySelector('[data-todo-reminder-ack]').click()");
    const [, fresh] = await hold.every("io.molis.work.todo/reminders", 2);
    await hold.release(fresh!);
    await waitFor("document.querySelectorAll('[data-todo-reminder]').length === 1", 10_000);
    await hold.release(stale); await pause(800);
    assert.equal(await evaluate("document.querySelectorAll('[data-todo-reminder]').length"), 1, "the earlier read's late answer does not bring the acknowledged reminder back");
  } finally { await hold.close(); }
});
