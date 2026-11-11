// TGA-21, TGA-22 (batch 18 P3-2; specs/proactive-assistant/task-grants-platform-area.md §10): Schedule takes up the platform's reads
// area the way any plugin would, through `host.taskGrants.place` alone. The open task's detail gives its kept empty element and the
// task's id; another task, the back button or the form taking the pane closes it. After the person's own change in the area, the
// list's mark follows the two flags the frame hears, without another read of the grants. The area's own checks are
// tests/security-invariants-task-grants-area.e2e.test.ts; this file only shows Schedule using it.
import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

const WIDE = 396, NARROW = 468;
const AREA = "[data-task-grants-area]";
const REMINDERS = "io.molis.work.schedule\nreminders";

/** The outer document records what it asks the Host for (a frame's requests go through it) and what it tells a frame about areas. */
const OBSERVE = `(() => { if (window.top !== window) return;
  window.tgaDown = []; window.tgaUrls = []; window.tgaKeys = [];
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (message, ...rest) {
    if (message && typeof message.type === "string" && message.type.startsWith("task-grants-")) window.tgaDown.push(JSON.parse(JSON.stringify(message)));
    return post.call(this, message, ...rest);
  };
  const fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = String(input instanceof Request ? input.url : input);
    window.tgaUrls.push(url);
    if (url.includes("/api/host/plugin-page-task-grants")) { try { window.tgaKeys.push(JSON.parse(init.body).key); } catch { /* not a JSON body: not an area request */ } }
    return fetch.apply(this, arguments);
  };
})();`;

test("TGA-21 TGA-22 FSS-35 Schedule keeps the open task's grants and its localized feedback through a language change", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  await browser.setViewport(1440, 960);
  const api = `/projects/${browser.projectId}/api/plugins/io.molis.work.schedule`;
  const made = async (title: string) => (await browser.web.post<{ task: { task_id: string } }>(api + "/tasks", { title, instructions: "List what is due today", time: "08:00" })).task.task_id;
  const first = await made("Morning brief"), second = await made("Evening review");
  const child = await pluginFrameBrowser(t, browser, "schedule");
  await pluginFrameInitScript(t, browser, OBSERVE);
  const path = `/projects/${browser.projectId}/?openPlugin=schedule`;
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/locale?lang=zh&next=" + encodeURIComponent(path) }, browser.sessionId));
  await browser.surfaceReady("schedule");
  const row = (id: string) => `[data-schedule-row][data-schedule-task-id="${id}"]`;
  const mark = (id: string) => child.evaluate<string>(`document.querySelector(${JSON.stringify(row(id) + " [data-schedule-kind-mark]")}).dataset.scheduleKindMark`);
  await child.waitFor(`document.querySelector(${JSON.stringify(row(first) + " [data-schedule-kind-mark]")}).dataset.scheduleKindMark !== "unknown"`);
  assert.equal(await mark(first), "files", "a new task reads project files");
  const grantReads = () => browser.evaluate<number>(`window.tgaUrls.filter(url => new URL(url, location.href).pathname.endsWith("/io.molis.work.schedule/grants")).length`);
  const areas = () => browser.evaluate<number>(`document.querySelectorAll(${JSON.stringify(AREA)}).length`);
  const element = (id: string) => `[data-schedule-detail="${id}"] [data-schedule-reads-area]`;
  const settle = (ms = 650) => new Promise(resolve => setTimeout(resolve, ms));

  // TGA-21: opening a task places the area on its detail's kept element, keyed by the task's id; the element is the area's height.
  await child.click(row(first));
  await browser.waitFor(`document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]")})`);
  assert.deepEqual(await browser.evaluate("window.tgaKeys"), [first], "one read, for this task's key");
  const placed = await child.evaluate<{ height: number; width: number; shown: string | undefined; summary: boolean }>(`(() => { const element = document.querySelector(${JSON.stringify(element(first))}), box = element.getBoundingClientRect();
    return { height: box.height, width: box.width, shown: element.closest("[data-schedule-reads]").dataset.scheduleArea, summary: [...element.closest("[data-schedule-reads]").querySelectorAll("[data-schedule-reads-summary]")].some(line => line.getClientRects().length > 0) }; })()`);
  assert.equal(placed.height, placed.width < 480 ? NARROW : WIDE, "the element takes the step the shell gives for its width");
  assert.equal(placed.shown, "shown");
  assert.equal(placed.summary, false, "the area says the categories; Schedule's own count steps aside");
  // The area lies over the element, outside the frame (once its entry motion has played).
  await settle();
  const over = await child.evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(element(first))}).getBoundingClientRect(); return { x: box.x, y: box.y }; })()`);
  const drawn = await browser.evaluate<{ x: number; y: number; inFrame: boolean }>(`(() => { const frame = document.querySelector("iframe[data-plugin-frame=schedule]"), outer = frame.getBoundingClientRect(), area = document.querySelector(${JSON.stringify(AREA)});
    const box = area.getBoundingClientRect(); return { x: box.x - outer.x, y: box.y - outer.y, inFrame: frame.contains(area) }; })()`);
  assert.equal(drawn.inFrame, false);
  assert.ok(Math.abs(drawn.x - over.x) <= 1 && Math.abs(drawn.y - over.y) <= 1, `the area sits on the element: ${JSON.stringify({ drawn, over })}`);

  // TGA-21: another task closes the first area and places one for itself; the first element gives its height back.
  await child.click(row(second));
  await browser.waitFor(`window.tgaKeys.length === 2`);
  assert.deepEqual(await browser.evaluate("window.tgaKeys"), [first, second]);
  await browser.waitFor(`document.querySelectorAll(${JSON.stringify(AREA)}).length === 1 && document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]")})`);
  assert.equal(await child.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(element(first))}); return element.style.height + "|" + element.hasAttribute("data-schedule-area-placed"); })()`), "|false");
  // The back button closes the detail, and the area with it.
  await child.click(`[data-schedule-detail="${second}"] [data-schedule-collapse]`);
  await browser.waitFor(`document.querySelectorAll(${JSON.stringify(AREA)}).length === 0`);
  // So does the new-task form taking the pane.
  await child.click(row(first));
  await browser.waitFor(`document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]")})`);
  await child.click("[data-schedule-new]");
  await browser.waitFor(`document.querySelectorAll(${JSON.stringify(AREA)}).length === 0`);
  await child.click("[data-schedule-create-close]");

  // TGA-21 with P3-1's review fix 3: a detail opened while the page is out of sight (a tab behind). The area is not refused: it waits,
  // reads nothing meanwhile, and is drawn when the page shows, without Schedule trying again.
  const keys = (await browser.evaluate<string[]>("window.tgaKeys")).length;
  await browser.evaluate(`document.querySelector("[data-work-surface=schedule]").hidden = true`);
  // Nothing on the hidden page can be pressed, so the row is opened as the page's own code would.
  await child.evaluate(`document.querySelector(${JSON.stringify(row(second))}).click()`);
  await settle(400);
  assert.equal((await browser.evaluate<string[]>("window.tgaKeys")).length, keys, "nothing is read while the page is out of sight");
  assert.deepEqual((await browser.evaluate<Array<Record<string, unknown>>>("window.tgaDown")).filter(message => message.type === "task-grants-shown" && "error" in message), [], "nor is the area refused");
  await browser.evaluate(`document.querySelector("[data-work-surface=schedule]").hidden = false`);
  await browser.waitFor(`document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]")})`);
  assert.equal((await browser.evaluate<string[]>("window.tgaKeys")).at(-1), second, "drawn for the task opened behind");
  assert.equal(await child.evaluate(`document.querySelector(${JSON.stringify(`[data-schedule-detail="${second}"] [data-schedule-reads]`)}).dataset.scheduleArea`), "shown");
  await child.click(`[data-schedule-detail="${second}"] [data-schedule-collapse]`);
  await browser.waitFor(`document.querySelectorAll(${JSON.stringify(AREA)}).length === 0`);

  // TGA-22: the person turns on Schedule's reminders for the first task, as a person presses. The row's mark says it reads data from
  // the flags the frame heard; the page asks for the grants no more than it had.
  await child.click(row(first));
  await browser.waitFor(`document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]")})`);
  const rows = await browser.evaluate<string[]>(`[...document.querySelectorAll("${AREA} [data-task-grants-row]")].map(item => item.dataset.taskGrantsRow)`);
  const target = rows.indexOf(REMINDERS);
  assert.ok(target >= 0, "Schedule offers its reminders: " + JSON.stringify(rows));
  const control = `${AREA} [data-task-grants-row]:nth-child(${target + 1})`;
  await browser.evaluate(`document.querySelector(${JSON.stringify(control)}).scrollIntoView({ block: "nearest" })`);
  const ready = async () => { await settle(); await browser.waitFor(`!document.querySelector(${JSON.stringify(AREA)}).hasAttribute("data-unready")`); };
  const press = async (selector: string) => {
    const point = await browser.evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
    await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, browser.sessionId);
    await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, browser.sessionId);
  };
  await ready();
  const before = await grantReads();
  await press(`${control} [data-framed-control^="switch:"]`);
  await browser.waitFor(`document.querySelector(${JSON.stringify(control)}).dataset.status === "granted"`);
  await child.waitFor(`document.querySelector(${JSON.stringify(row(first) + " [data-schedule-kind-mark]")}).dataset.scheduleKindMark === "data"`);
  assert.equal(await mark(second), "files", "only the changed task's mark moves");
  assert.equal(await child.evaluate(`document.querySelector(${JSON.stringify(row(first) + " [data-schedule-row-reconfirm]")}).hidden`), true);
  assert.deepEqual((await browser.evaluate<Array<Record<string, unknown>>>("window.tgaDown")).filter(message => message.type === "task-grants-changed").map(message => message.state), [{ granted: true, attention: false }]);
  const status = `document.querySelector(${JSON.stringify(AREA + " [role=status] > span")})?.textContent`;
  const categoryWords = `[...document.querySelectorAll(${JSON.stringify(control + " strong, " + control + " small")})].map(node => node.textContent)`;
  const undo = AREA + ' [data-framed-control="undo"]';
  assert.equal(await browser.evaluate(status), "已允许读 提醒，下一次运行起能读到");
  const choose = (tag: "zh" | "en") => browser.evaluate(`(() => {
    const link=document.createElement('a'); link.dataset.uiLanguage=${JSON.stringify(tag)};
    link.href='/locale?lang='+link.dataset.uiLanguage; document.body.append(link); link.click(); link.remove();
  })()`);
  const areaRequests = await browser.evaluate<number>("tgaKeys.length");
  await choose("en");
  await browser.waitFor(`${status} === 'Reminders allowed; the next run can read it'`);
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(undo)})?.textContent`), "Undo");
  assert.deepEqual(await browser.evaluate(categoryWords), ["Reminders", "This project's reminders: what they say (including the text of reminders other plugins set), which plugin set them and when they are next due"]);
  assert.deepEqual(await browser.evaluate(`tgaKeys.slice(${areaRequests})`), [first], "language reads the current task once");
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(control)}).dataset.status`), "granted");
  // Undo takes it back, and the mark with it.
  await ready();
  await press(undo);
  await browser.waitFor(`document.querySelector(${JSON.stringify(control)}).dataset.status === "off"`);
  await child.waitFor(`document.querySelector(${JSON.stringify(row(first) + " [data-schedule-kind-mark]")}).dataset.scheduleKindMark === "files"`);
  assert.equal(await browser.evaluate(status), "Change undone");
  await choose("zh");
  await browser.waitFor(`${status} === '已撤销刚才的改动' && ${categoryWords}[0] === '提醒'`);
  await settle(300);
  assert.equal(await grantReads(), before, "TGA-22 the marks follow the area without another read of the grants");
});
