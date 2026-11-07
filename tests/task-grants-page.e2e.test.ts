// 授权与放行 in a project's settings (specs/proactive-assistant/task-grants-platform-area.md §5, §5.3): every background task's grants by
// task, read once, changed with one request each, formed as the task's own area forms them (§3.6). The first test runs against the real
// Host with Schedule's tasks; the second answers the page's requests itself, to show every state a category can be in and the titles
// a provider's search source gives. The route's own refusals are tests/security-invariants-task-grants-page.test.ts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const SCHEDULE = "io.molis.work.schedule";
type Sent = { mode: string; plugin_install_id?: string; key?: string; cursor?: string | null; expected_revision?: string; categories?: Array<{ provider_id: string; group_id?: string; confirm?: true }> };

/**
 * Records every request the page sends to its route. With `window.tgpAnswer` set, the page's requests are answered by it instead of the
 * Host (the second test); otherwise they go through.
 */
const OBSERVE = `(() => {
  window.tgpSent = [];
  const fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/settings/task-grants")) {
      let body = null; try { body = JSON.parse(init.body); } catch {}
      window.tgpSent.push(body);
      const answer = window.tgpAnswer && window.tgpAnswer(body);
      if (answer) return Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status || 200, headers: { "content-type": "application/json" } }));
    }
    return fetch.apply(this, arguments);
  };
})();`;

async function open(t: TestContext, answer?: string) {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return null;
  await browser.setViewport(1440, 960);
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVE + (answer ? `window.tgpAnswer = ${answer};` : "") }, browser.sessionId);
  const prefix = `/projects/${browser.projectId}`, endpoint = browser.origin + prefix + "/api/settings/task-grants";
  /** The person's own call of the route from outside the page, as another window of the settings would make it. */
  const call = async <T>(body: unknown) => {
    const response = await fetch(endpoint, { method: "POST", body: JSON.stringify(body), headers: { origin: browser.origin, "content-type": "application/json",
      "x-molis-work-control-token": browser.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as T;
  };
  const visit = async (path = prefix + "/settings/grants") => {
    await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + path }, browser.sessionId));
    await browser.waitFor(`document.querySelector("[data-task-grants-list]") && !document.querySelector("[data-task-grants-list][aria-busy]") && !document.querySelector("[data-task-grants-list] > p.task-grants-page__state:only-child")?.textContent?.includes("…")`);
  };
  const sent = () => browser.evaluate<Sent[]>("window.tgpSent");
  const press = async (selector: string) => { await browser.click(selector); };
  /** A task's card and a row in it, found by their names (which hold a line break, so no selector can name them). */
  const task = (id: string) => `[...document.querySelectorAll("[data-task-grants-task]")].find(card => card.dataset.taskGrantsTask === ${JSON.stringify(id)})`;
  const row = (id: string, name: string) => `[...((${task(id)})?.querySelectorAll("[data-task-grants-row]") ?? [])].find(item => item.dataset.taskGrantsRow === ${JSON.stringify(name)})`;
  /** A real press on a control inside an element the expression finds. */
  const pressIn = async (expression: string, control: string) => {
    assert.ok(await browser.evaluate<boolean>(`(() => { const target = (${expression})?.querySelector(${JSON.stringify(control)}); target?.setAttribute("data-tgp-target", ""); return !!target; })()`), control);
    await browser.click("[data-tgp-target]");
    await browser.evaluate(`document.querySelector("[data-tgp-target]")?.removeAttribute("data-tgp-target")`);
  };
  const toast = () => browser.evaluate<string>(`document.querySelector("[data-settings-toast]")?.textContent ?? ""`);
  const rows = (id: string) => browser.evaluate<Array<{ name: string; status: string }>>(`[...((${task(id)})?.querySelectorAll("[data-task-grants-row]") ?? [])].map(row => ({ name: row.dataset.taskGrantsRow, status: row.dataset.status }))`);
  /** A screenshot for review, to the ignored folder; nothing is committed. */
  const shot = async (name: string) => {
    const dir = join(process.cwd(), ".impeccable", "qa", "review", "task-grants-page");
    await mkdir(dir, { recursive: true });
    const { data } = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, browser.sessionId);
    await writeFile(join(dir, name + ".png"), Buffer.from(data, "base64"));
  };
  return { browser, prefix, call, visit, sent, press, pressIn, task, row, toast, rows, shot };
}

type Category = { provider_id: string; group_id?: string; plugin_id?: string; title: string };
type Listed = { categories: Category[]; subjects: Array<{ plugin_install_id: string; key: string; revision: string; categories: Array<Category & { status: string }> }>; installations: Array<{ plugin_install_id: string; titled: boolean }> };
const ref = (category: Category) => category.group_id === undefined ? { provider_id: category.provider_id } : { provider_id: category.provider_id, group_id: category.group_id };
const rowName = (category: Category) => category.provider_id + "\n" + (category.group_id ?? "");

test("TGA-24 TGA-25 TGA-27 授权与放行 reads once, takes a category back with one set of the rest, a task with one clear, and reads again only when changed elsewhere", { timeout: 180_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser } = p;
  // The project's offered categories, and Schedule's installation: its tasks are the ones the page lists.
  const offered = (await p.call<Listed>({ mode: "list" })).categories;
  const install = readPluginRuntimeRecords(browser.store.db).find(record => record.plugin_id === SCHEDULE && record.state !== "uninstalled")?.install_id;
  assert.ok(install, "Schedule is installed in the seeded project");
  assert.ok(offered.length >= 2, "the seeded project offers at least two categories");
  const [first, second] = offered as [Category, Category];
  await p.call({ mode: "set", plugin_install_id: install, key: "daily", categories: [ref(first), ref(second)], expected_revision: "" });
  await p.call({ mode: "set", plugin_install_id: install, key: "weekly", categories: [ref(first)], expected_revision: "" });

  // TGA-24: one list, no installation named; one card per task under Schedule, one row per category the task holds, each granted.
  await p.visit();
  const opened = await p.sent();
  const titled = (await p.call<Listed>({ mode: "list" })).installations.filter(item => item.titled).length;
  assert.deepEqual(opened.filter(body => body.mode === "list"), [{ mode: "list" }], "one list, with nothing named");
  assert.equal(opened.filter(body => body.mode === "titles").length, titled, "one titles request per installation that names its tasks");
  assert.equal(opened.length, 1 + titled);
  const daily = install + "\ndaily", weekly = install + "\nweekly";
  assert.deepEqual(await p.rows(daily), [first, second].map(category => ({ name: rowName(category), status: "granted" })));
  assert.deepEqual(await p.rows(weekly), [{ name: rowName(first), status: "granted" }]);
  assert.equal(await browser.evaluate(`document.querySelectorAll("[data-task-grants-install]").length`), 1, "one group, Schedule's");
  if (!titled) assert.match(await browser.evaluate<string>(`(${p.task(daily)}).querySelector("header strong").textContent`), /· 一个任务$/u, "a task its plugin does not name");
  await p.shot("zh-light-1440");

  // TGA-25: taking one category back is one set of the task's other categories, with the revision read; the answer is shown as it is.
  const before = (await p.call<Listed>({ mode: "list" })).subjects.find(subject => subject.key === "daily")!;
  const mark = (await p.sent()).length;
  await p.pressIn(p.task(daily), `[data-task-grants-row]:first-child [data-task-grants-act="off"]`);
  await browser.waitFor(`(${p.task(daily)})?.querySelectorAll("[data-task-grants-row]").length === 1`);
  const revoked = (await p.sent()).slice(mark);
  assert.deepEqual(revoked, [{ mode: "set", plugin_install_id: install, key: "daily", categories: [ref(second)], expected_revision: before.revision }], "one set, nothing read after it");
  assert.match(await p.toast(), /下一次运行起读不到/u);
  const records = (await readMcpToolPreference(browser.homeDirectory)).action_grants.filter(grant => grant.client_id.endsWith(":daily"));
  assert.ok(records.length > 0 && records.every(grant => grant.provider_id === second.provider_id), "only the other category's records are left");

  // TGA-27: the weekly task changed elsewhere after the page read it; the page's set is a conflict, it says so and reads once more.
  const weeklyNow = (await p.call<Listed>({ mode: "list" })).subjects.find(subject => subject.key === "weekly")!;
  await p.call({ mode: "set", plugin_install_id: install, key: "weekly", categories: [ref(first), ref(second)], expected_revision: weeklyNow.revision });
  const held = JSON.stringify((await readMcpToolPreference(browser.homeDirectory)).action_grants.filter(grant => grant.client_id.endsWith(":weekly")));
  const mark2 = (await p.sent()).length;
  await p.pressIn(p.task(weekly), `[data-task-grants-row]:first-child [data-task-grants-act="off"]`);
  await browser.waitFor(`(${p.task(weekly)})?.querySelectorAll("[data-task-grants-row]").length === 2`);
  assert.deepEqual((await p.sent()).slice(mark2).map(body => body.mode), ["set", "list"], "the conflict reads the page once more");
  assert.match(await p.toast(), /已在别处改动，已刷新/u);
  assert.equal(JSON.stringify((await readMcpToolPreference(browser.homeDirectory)).action_grants.filter(grant => grant.client_id.endsWith(":weekly"))), held, "the refused set changed nothing");

  // TGA-25: all of a task is one clear naming its installation, once the person says so in the dialog.
  const mark3 = (await p.sent()).length;
  await p.pressIn(p.task(daily), `[data-task-grants-act="clear"]`);
  await browser.waitFor(`document.querySelector("dialog[open] [data-task-grants-act=confirm]")`);
  await p.shot("zh-light-confirm");
  await p.press(`dialog[open] [data-task-grants-act=confirm]`);
  await browser.waitFor(`!(${p.task(daily)})`);
  assert.deepEqual((await p.sent()).slice(mark3), [{ mode: "clear", plugin_install_id: install, key: "daily" }]);
  assert.equal((await readMcpToolPreference(browser.homeDirectory)).action_grants.filter(grant => grant.client_id.endsWith(":daily")).length, 0);
  await p.pressIn(p.task(weekly), `[data-task-grants-act="clear"]`);
  await browser.waitFor(`document.querySelector("dialog[open] [data-task-grants-act=confirm]")`);
  await p.press(`dialog[open] [data-task-grants-act=confirm]`);
  await browser.waitFor(`document.querySelector("[data-task-grants-list] > .task-grants-page__state")`);
  assert.match(await browser.evaluate<string>(`document.querySelector("[data-task-grants-list]").textContent`), /还没有后台任务/u, "the empty state");
  await p.shot("zh-light-empty");
});

/**
 * A provider's title that is markup and every character that needs escaping: the page shows it as words, makes no element of it,
 * and its `onerror` never runs (it would mark `window.tgpRan`).
 */
const EVIL = `唯一的任务<img src=x onerror="window.tgpRan=1">"'&`;
/**
 * What the page is answered with in the second test: a task holding a category in each state, a named task, one not named, one
 * named with markup (`EVIL`), and an installation whose titles never end, a new cursor on every page.
 */
const ANSWER = String.raw`(() => {
  const cat = (provider_id, group_id, title, description) => ({ provider_id, ...(group_id ? { group_id } : {}), title, description });
  const todo = cat("plugin.todo", null, "待办", "标题、截止日期和是否完成"), notes = cat("plugin.notes", "pages", "笔记", "这个项目里页面的标题和正文");
  const inbox = cat("plugin.inbox", null, "收件箱", "发件人、主题和开头几行"), gone = cat("plugin.feed", null, "订阅", "关注来源的标题和摘要");
  const state = (category, status) => ({ ...category, status });
  window.tgpSubjects = [
    { plugin_install_id: "install-a", key: "morning", revision: "r1", categories: [state(todo, "granted"), state(notes, "needs_confirmation"), state(inbox, "unavailable"), state(gone, "removed")] },
    { plugin_install_id: "install-a", key: "archived", revision: "r2", categories: [state(todo, "granted")] },
    { plugin_install_id: "install-b", key: "nightly", revision: "r3", categories: [state(todo, "granted")] },
    { plugin_install_id: "install-c", key: "solo", revision: "r4", categories: [state(todo, "granted")] },
    { plugin_install_id: "install-d", key: "endless", revision: "r5", categories: [state(todo, "granted")] },
  ];
  let page = 0;
  return body => {
    if (body.mode === "list") return { body: { categories: [todo, notes], subjects: window.tgpSubjects, installations: [
      { plugin_install_id: "install-a", plugin_id: "io.molis.work.schedule", name: "日程", titled: true }, { plugin_install_id: "install-b", plugin_id: "io.molis.work.example", name: "示例", titled: true },
      { plugin_install_id: "install-c", plugin_id: "io.molis.work.single", name: "单个", titled: true }, { plugin_install_id: "install-d", plugin_id: "io.molis.work.endless", name: "无尽", titled: true }] } };
    if (body.mode === "titles" && body.plugin_install_id === "install-b") return { status: 503, body: { code: "actions.unavailable", error: "暂时不可用" } };
    if (body.mode === "titles" && body.plugin_install_id === "install-c") return { body: { entries: [{ key: "solo", title: ${JSON.stringify(EVIL)}, open: { surface: "single", id: "solo" } }], next_cursor: "more" } };
    if (body.mode === "titles" && body.plugin_install_id === "install-d") { page += 1; return { body: { entries: [{ key: "other-" + page, title: "别的", open: { surface: "endless", id: "other" } }], next_cursor: "d" + page } }; }
    if (body.mode === "titles" && body.cursor === null) return { body: { entries: [{ key: "other", title: "别的任务", open: { surface: "schedule", id: "other" } }], next_cursor: "c2" } };
    if (body.mode === "titles" && body.cursor === "c2") return { body: { entries: [{ key: "morning", title: "每天早上的简报", open: { surface: "schedule", id: "morning" } }], next_cursor: "c3" } };
    if (body.mode === "titles") return { body: { entries: [], next_cursor: null } };
    if (body.mode === "set") {
      const subject = window.tgpSubjects.find(item => item.key === body.key);
      // What the service answers: a confirmed category is granted, the rest keep the status they had.
      subject.revision += "+"; subject.categories = body.categories.map(item => {
        const held = subject.categories.find(entry => entry.provider_id === item.provider_id && entry.group_id === item.group_id);
        return { ...held, status: item.confirm ? "granted" : held.status };
      });
      return { body: { subject } };
    }
    return null;
  };
})()`;

test("TGA-25 TGA-26 a category in each state has its own action, sent with the rest as read, and a task is named by its plugin's own titles, one more page only while unnamed and at most twenty, shown as words", { timeout: 180_000 }, async t => {
  const p = await open(t, ANSWER); if (!p) return;
  const { browser } = p;
  await p.visit();
  // TGA-26: the next page of titles only while a task is unnamed: install-a's to its last page (one task is never listed), install-c's
  // first page alone (it names its one task, though it says there is more); install-b's titles fail and its task is named by its plugin.
  // install-d gives a new cursor on every page and never its task: twenty pages (10,000 entries), then its task is named by its plugin.
  const opened = (await p.sent()).filter(body => body.mode === "titles").map(body => [body.plugin_install_id, body.cursor]);
  assert.deepEqual(opened.filter(([install]) => install !== "install-d").sort(),
    [["install-a", null], ["install-a", "c2"], ["install-a", "c3"], ["install-b", null], ["install-c", null]].sort(), "the next page only while a task is unnamed");
  assert.deepEqual(opened.filter(([install]) => install === "install-d"), [["install-d", null], ...Array.from({ length: 19 }, (_, index) => ["install-d", "d" + (index + 1)])],
    "a provider that keeps giving new cursors is read for twenty pages, no more");
  const head = (id: string) => browser.evaluate<{ name: string; open: string | null; clear: boolean }>(`(() => { const card = ${p.task(id)};
    return { name: card.querySelector("header strong").textContent, open: card.querySelector("header a")?.getAttribute("href") ?? null, clear: !!card.querySelector("[data-task-grants-act=clear]") }; })()`);
  const morning = await head("install-a\nmorning");
  assert.equal(morning.name, "每天早上的简报");
  assert.ok(morning.open && new URL(morning.open, browser.origin).searchParams.get("openPlugin") === "schedule" && new URL(morning.open, browser.origin).searchParams.get("openItem") === "morning", morning.open ?? "");
  assert.deepEqual(await head("install-a\narchived"), { name: "日程 · 一个任务", open: null, clear: true }, "a task its plugin's source does not list: named by the plugin, still taken back");
  assert.deepEqual(await head("install-b\nnightly"), { name: "示例 · 一个任务", open: null, clear: true }, "titles that failed: named by the plugin");
  assert.deepEqual(await head("install-d\nendless"), { name: "无尽 · 一个任务", open: null, clear: true }, "titles past twenty pages: named by the plugin");
  // A title that is markup is words: the same text in the heading, its tooltip and the open link's name; no element made of it, nothing run.
  const solo = await browser.evaluate<{ text: string; tooltip: string; label: string; parts: string[]; images: number; ran: boolean }>(`(() => { const card = ${p.task("install-c\nsolo")}, strong = card.querySelector("header strong");
    return { text: strong.textContent, tooltip: strong.title, label: card.querySelector("header a").getAttribute("aria-label"), parts: [...card.querySelector("header").querySelectorAll("*")].map(part => part.tagName),
      images: document.querySelector("[data-task-grants-list]").querySelectorAll("img").length, ran: window.tgpRan === 1 }; })()`);
  assert.deepEqual(solo, { text: EVIL, tooltip: EVIL, label: "打开 · " + EVIL, parts: ["STRONG", "SPAN", "A", "BUTTON"], images: 0, ran: false }, "a provider's markup is shown as its words");
  assert.deepEqual(await p.rows("install-a\nmorning"), [["plugin.todo\n", "granted"], ["plugin.notes\npages", "needs_confirmation"], ["plugin.inbox\n", "unavailable"], ["plugin.feed\n", "removed"]].map(([name, status]) => ({ name, status })));
  const acts = await browser.evaluate<string[][]>(`[...(${p.task("install-a\nmorning")}).querySelectorAll("[data-task-grants-row]")].map(row => [...row.querySelectorAll("[data-task-grants-act]")].map(button => button.dataset.taskGrantsAct))`);
  assert.deepEqual(acts, [["off"], ["allow", "off"], ["off"], ["remove"]], "允许 only where there is more to allow, 移除 only where it is no longer offered");
  // The rows are the area's own (task-grants-area.ts `taskGrantRowHtml`): the same row class and the same note for each state.
  const notes = await browser.evaluate<Array<[string, string | null]>>(`[...(${p.task("install-a\nmorning")}).querySelectorAll("[data-task-grants-row]")].map(row => [row.className, row.querySelector("em")?.textContent ?? null])`);
  assert.deepEqual(notes, [null, "有新的读取能力，允许之前读不到", "暂时读不到，授权还在", "这一类已不再提供"].map(note => ["mw-item task-grants-area__row", note]));
  await p.shot("zh-light-states");

  // TGA-25: 允许 is the task's categories as read, this one with confirm; the others, the removed one by its provider alone, as they are.
  const mark = (await p.sent()).length;
  await p.pressIn(p.row("install-a\nmorning", "plugin.notes\npages"), "[data-task-grants-act=allow]");
  await browser.waitFor(`(${p.row("install-a\nmorning", "plugin.notes\npages")})?.dataset.status === "granted"`);
  assert.deepEqual((await p.sent()).slice(mark), [{ mode: "set", plugin_install_id: "install-a", key: "morning", expected_revision: "r1",
    categories: [{ provider_id: "plugin.todo" }, { provider_id: "plugin.notes", group_id: "pages", confirm: true }, { provider_id: "plugin.inbox" }, { provider_id: "plugin.feed" }] }]);
  assert.equal(await p.toast(), "已允许 笔记 的新读取能力；不想要可以撤回这一类", "what it did, in the page's own words: there is no switch here to point to");
  // 移除 takes the removed one off and keeps the rest as they are now, with the revision the answer gave.
  const mark2 = (await p.sent()).length;
  await p.pressIn(p.row("install-a\nmorning", "plugin.feed\n"), "[data-task-grants-act=remove]");
  await browser.waitFor(`!(${p.row("install-a\nmorning", "plugin.feed\n")})`);
  assert.deepEqual((await p.sent()).slice(mark2), [{ mode: "set", plugin_install_id: "install-a", key: "morning", expected_revision: "r1+",
    categories: [{ provider_id: "plugin.todo" }, { provider_id: "plugin.notes", group_id: "pages" }, { provider_id: "plugin.inbox" }] }]);
  assert.match(await p.toast(), /已移除/u);

  // The page in English, dark, and at three widths: rows stay one line, buttons keep their bounds.
  await p.visit(`/locale?lang=en&next=${encodeURIComponent(p.prefix + "/settings/grants")}`);
  assert.equal(await browser.evaluate(`document.documentElement.lang`), "en");
  const words = await browser.evaluate<string>(`document.querySelector("[data-task-grants-settings]").innerText`);
  assert.ok(!/[一-鿿]/u.test(words.replace(/每天早上的简报|唯一的任务|日程|示例|单个|无尽|待办|标题、截止日期和是否完成|笔记|这个项目里页面的标题和正文|收件箱|发件人、主题和开头几行|订阅|关注来源的标题和摘要/gu, "")), "every word of the page's own is English: " + words);
  for (const [scheme, widths] of [["light", [1440, 1024, 390]], ["dark", [1440, 1024, 390]]] as const) {
    await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, browser.sessionId);
    for (const width of widths) {
      await browser.setViewport(width, 900, width < 500);
      await browser.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      const layout = await browser.evaluate<{ scroll: boolean; wrapped: string[]; outside: string[] }>(`(() => { const lines = [...document.querySelectorAll(".task-grants-area__row, .task-grants-page__task-head")];
        return { scroll: document.documentElement.scrollWidth > innerWidth + 1,
          wrapped: lines.filter(row => row.getBoundingClientRect().height > 56 || [...row.querySelectorAll("strong, small, em")].some(part => part.getBoundingClientRect().height > 24)).map(row => row.textContent),
          outside: lines.filter(row => [...row.querySelectorAll("*")].some(part => part.getBoundingClientRect().right > row.closest(".task-grants-page__task").getBoundingClientRect().right + 1)).map(row => row.textContent) }; })()`);
      assert.deepEqual(layout, { scroll: false, wrapped: [], outside: [] }, `${scheme} ${width}: no sideways scroll, every row one line and inside its task`);
      await p.shot(`en-${scheme}-${width}`);
    }
  }
  // Taking back a category that cannot simply be turned on again says where to turn it on: the task's own 「能读的数据」, not a switch.
  // (The page was read again for English, so the task is as first answered.)
  await browser.setViewport(1440, 960);
  const mark3 = (await p.sent()).length;
  await p.pressIn(p.row("install-a\nmorning", "plugin.inbox\n"), "[data-task-grants-act=off]");
  await browser.waitFor(`!(${p.row("install-a\nmorning", "plugin.inbox\n")})`);
  assert.deepEqual((await p.sent()).slice(mark3), [{ mode: "set", plugin_install_id: "install-a", key: "morning", expected_revision: "r1",
    categories: [{ provider_id: "plugin.todo" }, { provider_id: "plugin.notes", group_id: "pages" }, { provider_id: "plugin.feed" }] }]);
  assert.equal(await p.toast(), "收件箱 withdrawn; to read it again, turn it on in the task's “Data it can read”");
});
