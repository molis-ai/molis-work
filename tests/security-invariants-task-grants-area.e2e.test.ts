// SECURITY-INVARIANTS S-142, the shell's half (specs/proactive-assistant/task-grants-platform-area.md §3, §4): the reads area of a
// plugin page's task is drawn by the workbench outside the plugin's frame and changes only on the person's own, deliberate press. The
// page gives an empty element and a key; what it can make the area do (move it, cover it, half show it, press for the person, send it
// made-up messages) writes nothing. Every refusal asserts that no `set` went to the Host and that the grant records did not change.
// The Host route's own refusals are tests/security-invariants-task-grants-area.test.ts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

const WIDE = 396, NARROW = 468;
const AREA = "[data-task-grants-area]";

/**
 * What the outer document sends, recorded as it goes: every downward message to the frame, every request to the area's route. The
 * lines go before the plugin-frame client, which both the outer document and each frame load; in a frame they record only its own traffic.
 */
const OBSERVE = `(() => {
  window.tgaDown = []; window.tgaSent = [];
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (message, ...rest) {
    if (message && typeof message.type === "string" && message.type.startsWith("task-grants-")) { window.tgaDown.push(JSON.parse(JSON.stringify(message))); window.tgaPort = this; }
    return post.call(this, message, ...rest);
  };
  const fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/host/plugin-page-task-grants")) {
      const headers = new Headers(init && init.headers);
      let body = null; try { body = JSON.parse(init.body); } catch {}
      window.tgaSent.push({ body, page: headers.get("x-molis-context-page") });
      // A test may hold a write on its way, to press again while it is in flight.
      if (body && body.mode === "set" && window.tgaHold) { const args = arguments; return window.tgaHold.then(() => fetch.apply(this, args)); }
    }
    return fetch.apply(this, arguments);
  };
})();`;

type Sent = { body: { mode: string; key: string; categories?: Array<{ provider_id: string; group_id?: string; confirm?: boolean }> }; page: string };

async function open(t: TestContext) {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return null;
  await browser.setViewport(1440, 960);
  const child = await pluginFrameBrowser(t, browser, "schedule");
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {
    set(target,key,value){target[key]=key==='schedule'?host=>{window.pageHost=host;return value(host)}:value;return true}
  });${OBSERVE}`);
  const prefix = `/projects/${browser.projectId}`;
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + prefix + "/?openPlugin=schedule" }, browser.sessionId));
  await browser.surfaceReady("schedule");
  await child.waitFor("window.pageHost");

  /** An empty element in the plugin's document at a fixed place, and the area placed on it with this key. */
  const place = async (id: string, key: string, style: string) => {
    await child.evaluate(`(() => {
      const element = document.getElementById(${JSON.stringify(id)}) ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: ${JSON.stringify(id)} }));
      element.style.cssText = ${JSON.stringify("position:fixed;z-index:2147483647;" + style)};
      window.tgaStates ??= {}; window.tgaPlaced ??= {}; window.tgaStates[${JSON.stringify(id)}] = [];
      window.tgaPlaced[${JSON.stringify(id)}] = pageHost.taskGrants.place(element, ${JSON.stringify(key)}, { onChange: state => window.tgaStates[${JSON.stringify(id)}].push(state) })
        .then(() => "shown", error => "refused: " + error.message);
    })()`);
  };
  const placed = (id: string) => child.evaluate<string>(`window.tgaPlaced[${JSON.stringify(id)}]`);
  /** The number of areas shown now. */
  const shown = () => browser.evaluate<number>(`[...document.querySelectorAll("[data-framed-area]")].filter(holder => !holder.hidden && holder.querySelector("[data-task-grants-row], .task-grants-area__empty")).length`);
  const sent = () => browser.evaluate<Sent[]>("window.tgaSent");
  const sets = async () => (await sent()).filter(item => item.body?.mode === "set");
  const down = () => browser.evaluate<Array<Record<string, unknown>>>("window.tgaDown");
  const records = async () => JSON.stringify((await readMcpToolPreference(browser.homeDirectory)).action_grants.filter(grant => grant.client_id.startsWith("agent:task:")).map(({ generation: _generation, ...grant }) => grant));
  const line = (nth = 0) => browser.evaluate<string>(`document.querySelectorAll(${JSON.stringify(AREA)})[${nth}]?.querySelector(".mw-toast > span")?.textContent ?? ""`);
  /** The centre of an outer element, in the window's coordinates. */
  const centre = (selector: string) => browser.evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
  /** A real press of the mouse, as the browser delivers a person's: trusted, from a pointerdown. */
  const press = async (selector: string, at?: { x: number; y: number }) => {
    const point = at ?? await centre(selector);
    await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, browser.sessionId);
    await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, browser.sessionId);
  };
  const key = (code: "Space" | "Enter") => (async () => {
    const text = code === "Space" ? " " : "\r", keyName = code === "Space" ? " " : "Enter", vk = code === "Space" ? 32 : 13;
    await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode: vk, text }, browser.sessionId);
    await browser.command("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: vk }, browser.sessionId);
  })();
  const settle = (ms = 650) => new Promise(resolve => setTimeout(resolve, ms));
  /** As a person waits: the area has held still for the steady time (its entry motion counts as moving) and shows ready. */
  const ready = async () => { await settle(); await browser.waitFor(`![...document.querySelectorAll(${JSON.stringify(AREA)})].some(area => area.hasAttribute("data-unready"))`); };
  /** The first row's switch in the nth area, or a row's by its category name. */
  const control = (kind: "switch" | "allow" | "remove", row = 0) => `${AREA} [data-task-grants-row]:nth-child(${row + 1}) [data-framed-control^="${kind}:"]`;
  return { browser, child, prefix, place, placed, shown, sent, sets, down, records, line, centre, press, key, settle, ready, control };
}

test("S-142 TGA-01 TGA-06 TGA-07 TGA-11 TGA-12 TGA-16 the area is the shell's: the page's styles, made-up messages and scripted clicks change nothing, and the person's own press writes once", { timeout: 120_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser, child } = p;
  await p.place("tga", "daily", "left:24px;top:24px;width:560px");
  assert.equal(await p.placed("tga"), "shown");
  await browser.waitFor(`document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]")})`);
  const rows = await browser.evaluate<Array<{ name: string; status: string }>>(`[...document.querySelectorAll("${AREA} [data-task-grants-row]")].map(row => ({ name: row.dataset.taskGrantsRow, status: row.dataset.status }))`);
  t.diagnostic("categories offered: " + JSON.stringify(rows));
  assert.ok(rows.length >= 2, "the seeded project offers at least two categories");
  assert.ok(rows.every(row => row.status === "off"), "a new task reads nothing");
  // Schedule's reminders: its plugin runs (this is its page), so the category can be recorded now (R5).
  const target = rows.findIndex(row => row.name === "io.molis.work.schedule\nreminders");
  assert.ok(target >= 0, "Schedule offers its reminders");
  const reveal = () => browser.evaluate(`document.querySelectorAll(${JSON.stringify(AREA + " [data-task-grants-row]")})[${target}].scrollIntoView({ block: "nearest" })`);
  // The element is as tall as the shell's step for its width, nothing more (§3.1).
  assert.equal(await child.evaluate("document.getElementById('tga').getBoundingClientRect().height"), WIDE);
  const none = await p.records();

  // TGA-01: the page hides its element and puts its own button under it; the area, drawn outside the frame, is unchanged.
  await child.evaluate(`(() => { const element = document.getElementById("tga"); element.style.opacity = "0"; element.style.visibility = "hidden"; element.style.zIndex = "-1";
    const decoy = document.body.appendChild(Object.assign(document.createElement("button"), { id: "decoy", textContent: "继续" }));
    decoy.style.cssText = "position:fixed;left:24px;top:24px;width:560px;height:396px;z-index:1"; decoy.onclick = () => { window.decoyPressed = true; }; })()`);
  await p.settle();
  const style = await browser.evaluate<{ opacity: string; visibility: string; above: boolean; inFrame: boolean }>(`(() => { const area = document.querySelector(${JSON.stringify(AREA)}), holder = area.closest("[data-framed-area]");
    const frame = document.querySelector("iframe[data-plugin-frame=schedule]");
    return { opacity: getComputedStyle(area).opacity, visibility: getComputedStyle(area).visibility, above: Number(getComputedStyle(holder).zIndex) > 1, inFrame: frame.contains(area) }; })()`);
  assert.deepEqual(style, { opacity: "1", visibility: "visible", above: true, inFrame: false });

  // TGA-06: a script in the outer document (an injected one, say) presses the switch as a pointer would, on a ready area, and also
  // clicks it outright; nothing it dispatches is trusted, nothing is written.
  await reveal(); await p.ready();
  await browser.evaluate(`(() => { const control = document.querySelector(${JSON.stringify(p.control("switch", target))});
    const box = control.getBoundingClientRect(), at = { bubbles: true, cancelable: true, composed: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    control.dispatchEvent(new PointerEvent("pointerdown", { ...at, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
    control.dispatchEvent(new PointerEvent("pointerup", { ...at, pointerId: 1, isPrimary: true, button: 0 }));
    control.dispatchEvent(new MouseEvent("click", { ...at, detail: 1, button: 0 })); control.click(); })()`);
  await p.settle(200);
  assert.deepEqual(await p.sets(), [], "TGA-06 a click that is not trusted does not write");

  // TGA-07: made-up messages from the frame: a write, an open that names categories, a bad key, a bad id, a fifth area.
  await child.evaluate(`(() => { const port = window.tgaPort;
    port.postMessage({ type: "task-grants-set", id: 1, categories: [{ provider_id: "system.search" }] });
    port.postMessage({ type: "task-grants-open", id: 90, key: "forged", categories: [{ provider_id: "system.search" }] });
    port.postMessage({ type: "task-grants-open", id: 91, key: "a:b" });
    port.postMessage({ type: "task-grants-open", id: -1, key: "negative" });
    port.postMessage({ type: "task-grants-open", id: 0.5, key: "fraction" });
  })()`);
  for (const id of ["two", "three", "four", "five"]) await p.place(id, "k" + id, `left:${700 + 10}px;top:${["two", "three", "four", "five"].indexOf(id) * 120}px;width:300px;height:1px`);
  assert.equal(await p.placed("five"), "refused: 暂时不能显示", "a fifth area on one page is not shown");
  const refusals = (await p.down()).filter(message => message.type === "task-grants-shown" && "error" in message);
  assert.deepEqual(new Set(refusals.map(message => message.error)), new Set(["暂时不能显示"]), "every refusal is one fixed sentence");
  assert.ok(refusals.some(message => message.id === 90) && refusals.some(message => message.id === 91), "the forged and the bad opens are refused");
  assert.equal(refusals.some(message => message.id === -1 || message.id === 0.5), false, "a bad id gets no answer at all");
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-framed-area]').length"), 4);
  for (const id of ["two", "three", "four"]) await child.evaluate(`document.getElementById(${JSON.stringify(id)}).remove()`);
  await browser.waitFor("document.querySelectorAll('[data-framed-area]').length === 1");
  assert.deepEqual(await p.sets(), [], "TGA-07 nothing the frame sends writes");
  assert.equal(await p.records(), none);

  // TGA-12 and TGA-16: the person's own press, three times at once, then twice more on a ready area while the write is held on its
  // way: one `set`, the category the only one sent, the line says so.
  await reveal(); await p.ready();
  const point = await p.centre(p.control("switch", target));
  await browser.evaluate("window.tgaHold = new Promise(resolve => { window.tgaRelease = resolve; }); true");
  await Promise.all([p.press("", point), p.press("", point), p.press("", point)]);
  await browser.waitFor(`window.tgaSent.some(item => item.body && item.body.mode === "set")`);
  await p.ready();
  await p.press("", point); await p.settle(100); await p.press("", point);
  await p.settle(200);
  await browser.evaluate("window.tgaHold = null; window.tgaRelease()");
  await browser.waitFor(`document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]:nth-child(" + (target + 1) + ")")}).dataset.status === "granted"`);
  await p.settle(300);
  assert.equal(await browser.evaluate(`(() => { const body = document.querySelector("${AREA} .mw-platform-area__body").getBoundingClientRect(), row = document.querySelectorAll("${AREA} [data-task-grants-row]")[${target}].getBoundingClientRect();
    return row.top >= body.top - 1 && row.bottom <= body.bottom + 1; })()`), true, "the list keeps its place across the redraw");
  const first = await p.sets();
  assert.equal(first.length, 1, "TGA-16 one write for presses made while it is in flight: " + JSON.stringify(first));
  assert.deepEqual(first[0]!.body.categories?.map(item => item.provider_id + "/" + (item.group_id ?? "")), [rows[target]!.name.replace("\n", "/")]);
  assert.equal(first[0]!.body.key, "daily");
  assert.equal(await child.evaluate("window.decoyPressed ?? false"), false, "the decoy under the page's element was never pressed");
  assert.match(await p.line(), /下一次运行起能读到/);
  assert.notEqual(await p.records(), none, "the person's press wrote the task's grants");
  // Undo goes back to what was there before.
  await p.ready();
  await p.press(`${AREA} .mw-toast__action`);
  await browser.waitFor(`document.querySelector(${JSON.stringify(AREA + " [data-task-grants-row]:nth-child(" + (target + 1) + ")")}).dataset.status === "off"`);
  assert.deepEqual((await p.sets()).at(-1)!.body.categories, []);
  assert.equal(await p.records(), none, "undo restored the records as they were");

  // TGA-11: everything the frame heard is a height step, a shown answer, two flags or a reveal; nothing names a category.
  const messages = await p.down();
  for (const message of messages) {
    assert.ok(["task-grants-size", "task-grants-shown", "task-grants-changed", "task-grants-reveal"].includes(String(message.type)), JSON.stringify(message));
    if (message.type === "task-grants-size") assert.ok([0, WIDE, NARROW].includes(Number(message.height)), JSON.stringify(message));
    if (message.type === "task-grants-changed") assert.deepEqual(Object.keys(message.state as object).sort(), ["attention", "granted"]);
    if (message.type === "task-grants-shown") assert.deepEqual(Object.keys(message).filter(name => !["type", "id", "error"].includes(name)), []);
  }
  const text = JSON.stringify(messages);
  for (const row of rows) assert.equal(text.includes(row.name.split("\n")[0]!), false, "no provider is named downward");
  assert.equal(/revision|categor|capability/u.test(text), false);
  assert.deepEqual(await child.evaluate("window.tgaStates.tga"), [{ granted: true, attention: false }, { granted: false, attention: false }]);
});

test("S-142 TGA-02 TGA-03 TGA-04 TGA-05 TGA-10 TGA-15 TGA-18 TGA-19 a press counts only on an area that has held still, shown whole and on top, for long enough", { timeout: 150_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser, child } = p;
  await p.place("tga", "daily", "left:24px;top:24px;width:560px");
  assert.equal(await p.placed("tga"), "shown");
  const rows = await browser.evaluate<string[]>(`[...document.querySelectorAll("${AREA} [data-task-grants-row]")].map(row => row.dataset.taskGrantsRow)`);
  const target = rows.indexOf("io.molis.work.schedule\nreminders");
  assert.ok(target >= 0, "Schedule offers its reminders");
  await browser.evaluate(`document.querySelectorAll(${JSON.stringify(AREA + " [data-task-grants-row]")})[${target}].scrollIntoView({ block: "nearest" })`);
  const toggle = p.control("switch", target);
  const holders = `[...document.querySelectorAll("[data-framed-area]")]`;
  const unready = () => browser.evaluate<boolean>(`document.querySelector(${JSON.stringify(AREA)}).hasAttribute("data-unready")`);
  const writes = async () => (await p.sets()).length;
  await p.settle();
  const none = await p.records();

  // TGA-02: the page moves its element 100 ms before the press, so the switch comes under the pointer.
  await child.evaluate(`document.getElementById("tga").style.left = "64px"`);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await unready(), true, "TGA-02 a moved area is not ready");
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute("aria-disabled")`), "true", "its controls fade");
  await p.press(toggle);
  await p.settle(250);
  assert.equal(await writes(), 0, "TGA-02 a press on a moved area does not write");
  assert.equal(await p.line(), "刚移动过，请再拨一次");

  // TGA-03: the outer layout moves the frame (a pane being resized) while the page reports the same place; pressed at once.
  await p.ready();
  await browser.evaluate(`document.querySelector("iframe[data-plugin-frame=schedule]").style.translate = "30px 0"`);
  await new Promise(resolve => setTimeout(resolve, 80));
  await p.press(toggle);
  await p.settle(250);
  assert.equal(await writes(), 0, "TGA-03 an area the shell moved does not act at once, though the page reported no move");
  await browser.evaluate(`document.querySelector("iframe[data-plugin-frame=schedule]").style.translate = ""`);
  // TGA-03: an area pressed as soon as it is shown.
  await p.place("fresh", "fresh", "left:640px;top:24px;width:320px");
  assert.equal(await p.placed("fresh"), "shown");
  const fresh = await browser.evaluate<{ x: number; y: number }>(`(() => { const box = ${holders}[1].querySelector('[data-framed-control^="switch:"]').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
  await p.press("", fresh);
  await p.settle(250);
  assert.equal(await writes(), 0, "TGA-03 an area just shown does not act");
  await child.evaluate(`document.getElementById("fresh").remove()`);
  await browser.waitFor(`${holders}.length === 1`);

  // TGA-15: the focus arrives on the switch (as by Tab from the frame) and Space follows within 100 ms: not ready, nothing written.
  await p.ready();
  await browser.evaluate(`document.querySelector(${JSON.stringify(toggle)}).focus()`);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute("aria-disabled")`), "true", "TGA-15 a control the focus just reached is not ready");
  await p.key("Space");
  await p.settle(250);
  assert.equal(await writes(), 0, "TGA-15 a key press right after the focus arrived does not write");
  // Held there for the steady time, the same key writes.
  await p.settle();
  await p.key("Space");
  await browser.waitFor(`document.querySelectorAll(${JSON.stringify(AREA + " [data-task-grants-row]")})[${target}].dataset.status === "granted"`);
  assert.equal(await writes(), 1, "TGA-15 the key press after the steady time writes once");
  assert.equal(await browser.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(toggle)})`), true, "the redraw keeps the focus on the switch");
  const granted = await p.records();
  assert.notEqual(granted, none);
  await browser.evaluate("document.activeElement.blur()");

  // TGA-04: the page reports a place whose header is outside the frame; a switch shows, the area does not show whole.
  await child.evaluate(`document.getElementById("tga").style.top = "-160px"`);
  await p.ready();
  const shownSwitch = await browser.evaluate<{ x: number; y: number } | null>(`(() => { const frame = document.querySelector("iframe[data-plugin-frame=schedule]").getBoundingClientRect();
    for (const control of document.querySelectorAll('${AREA} [data-framed-control^="switch:"]')) { const box = control.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (y > frame.top + 4 && y < frame.bottom - 4 && control.contains(document.elementFromPoint(x, y))) return { x, y }; } return null; })()`);
  assert.ok(shownSwitch, "a switch shows below the frame's edge");
  const reveals = async () => (await p.down()).filter(message => message.type === "task-grants-reveal").length;
  const revealed = await reveals();
  await p.press("", shownSwitch);
  await p.settle(250);
  assert.equal(await writes(), 1, "TGA-04 a press on an area not shown whole does not write");
  assert.equal(await p.line(), "请先让这一块完整显示");
  assert.equal(await reveals(), revealed + 1, "the frame is asked to bring its element into view");
  await child.evaluate(`document.getElementById("tga").style.top = "24px"`);
  await p.ready();

  // TGA-05: the area lies above what the page can ask for (reviews and embeds, z-index 1); something laid over its header anyway stops it.
  assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector("[data-framed-area]")).zIndex`), "2");
  await browser.evaluate(`(() => { const head = document.querySelector("${AREA} [data-framed-area-head]").getBoundingClientRect();
    const cover = document.body.appendChild(document.createElement("div")); cover.id = "tga-cover";
    cover.style.cssText = "position:fixed;z-index:2147483647;left:" + head.left + "px;top:" + head.top + "px;width:" + head.width + "px;height:" + head.height + "px"; })()`);
  await p.ready();
  await p.press(toggle);
  await p.settle(250);
  assert.equal(await writes(), 1, "TGA-05 a press on an area whose header is covered does not write");
  assert.equal(await p.line(), "请先让这一块完整显示");
  await browser.evaluate(`document.getElementById("tga-cover").remove()`);

  // An outer ancestor clipping the header off has the same effect (the hit check finds the header is not the area's there).
  await browser.evaluate(`(() => { const root = document.querySelector("[data-framed-area]").parentElement, head = document.querySelector("${AREA} [data-framed-area-head]").getBoundingClientRect();
    root.dataset.tgaClip = root.style.clipPath; root.style.overflow = "hidden"; root.style.clipPath = "inset(" + (head.bottom - root.getBoundingClientRect().top) + "px 0 0 0)"; })()`);
  await p.settle(100);
  await p.press(toggle);
  await p.settle(250);
  assert.equal(await writes(), 1, "TGA-04 a header clipped by an outer ancestor does not let the area act");
  assert.equal(await p.line(), "请先让这一块完整显示", "the area was ready: the refusal is the clip, not the timing");
  await browser.evaluate(`(() => { const root = document.querySelector("[data-framed-area]").parentElement; root.style.clipPath = root.dataset.tgaClip; root.style.overflow = ""; })()`);

  // TGA-10: the frame hidden (another tab), or a dialog open in the page: the area hides and does not act.
  const point = await p.centre(toggle);
  await browser.evaluate(`document.querySelector("[data-work-surface=schedule]").hidden = true`);
  await browser.waitFor(`document.querySelector("[data-framed-area]").hidden`);
  await p.press("", point);
  await browser.evaluate(`document.querySelector("[data-work-surface=schedule]").hidden = false`);
  await browser.waitFor(`!document.querySelector("[data-framed-area]").hidden`);
  await child.evaluate(`(() => { const dialog = document.body.appendChild(document.createElement("dialog")); dialog.id = "tga-dialog"; dialog.showModal(); })()`);
  await browser.waitFor(`document.querySelector("[data-framed-area]").hidden`);
  await p.press("", point);
  await child.evaluate(`document.getElementById("tga-dialog").close()`);
  await browser.waitFor(`!document.querySelector("[data-framed-area]").hidden`);
  await p.settle(250);
  assert.equal(await writes(), 1, "TGA-10 a hidden area does not act");

  // TGA-18: a frame narrower than 280 px: the area hides and the page's element goes back to no height.
  await browser.evaluate(`(() => { const frame = document.querySelector("iframe[data-plugin-frame=schedule]"); frame.dataset.tgaWidth = frame.style.width; frame.style.width = "260px"; frame.style.minWidth = "0"; })()`);
  await browser.waitFor(`document.querySelector("[data-framed-area]").hidden`);
  await child.waitFor(`document.getElementById("tga").getBoundingClientRect().height === 0`);
  await p.press("", point);
  await browser.evaluate(`(() => { const frame = document.querySelector("iframe[data-plugin-frame=schedule]"); frame.style.width = frame.dataset.tgaWidth; frame.style.minWidth = ""; })()`);
  await browser.waitFor(`!document.querySelector("[data-framed-area]").hidden`);
  await child.waitFor(`document.getElementById("tga").getBoundingClientRect().height === ${WIDE}`);
  await p.settle(250);
  assert.equal(await writes(), 1, "TGA-18 an area on a frame too narrow does not act");

  // TGA-19: two areas laid over each other both hide; apart again, both show.
  await p.place("other", "other", "left:300px;top:120px;width:400px");
  await browser.waitFor(`${holders}.length === 2`);
  await browser.waitFor(`${holders}.every(holder => getComputedStyle(holder).visibility === "hidden")`);
  await p.press("", point);
  await child.evaluate(`document.getElementById("other").style.left = "640px"`);
  await browser.waitFor(`${holders}.every(holder => !holder.hidden && getComputedStyle(holder).visibility !== "hidden")`);
  await p.settle(250);
  assert.equal(await writes(), 1, "TGA-19 crossing areas do not act");
  assert.equal(await p.records(), granted, "nothing but the one deliberate press wrote");
});

test("S-142 TGA-12 TGA-13 TGA-14 TGA-17 a change sends every category the task holds as recorded, allows and removes only on the person's word, and a changed key or a closed page writes nothing", { timeout: 150_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser } = p;
  const REMINDERS = "io.molis.work.schedule\nreminders", OPERATIONS = "io.molis.work.schedule\noperations", INBOX = "io.molis.work.inbox\ninbox";
  const SCHEDULE = "io.molis.work.schedule";
  const file = join(browser.homeDirectory, "config", "mcp-tools.json");
  /** The rows by name, the one asked for scrolled into view. */
  const rowOf = async (name: string) => {
    const index = await browser.evaluate<number>(`(() => { const rows = [...document.querySelectorAll(${JSON.stringify(AREA + " [data-task-grants-row]")})];
      const index = rows.findIndex(row => row.dataset.taskGrantsRow === ${JSON.stringify(name)}); rows[index]?.scrollIntoView({ block: "nearest" }); return index; })()`);
    assert.ok(index >= 0, "a row for " + name);
    return index;
  };
  const status = (name: string) => browser.evaluate<string>(`[...document.querySelectorAll(${JSON.stringify(AREA + " [data-task-grants-row]")})].find(row => row.dataset.taskGrantsRow === ${JSON.stringify(name)})?.dataset.status ?? "none"`);
  /** A deliberate press on a row's control: the row in view, the area held still for the steady time. */
  const act = async (name: string, kind: "switch" | "allow" | "remove", then: string) => {
    const index = await rowOf(name), before = (await p.sets()).length;
    await p.ready();
    await p.press(p.control(kind, index));
    try { await browser.waitFor(`window.tgaSent.filter(item => item.body && item.body.mode === "set").length === ${before + 1}`); }
    catch (error) {
      t.diagnostic(`${kind} ${JSON.stringify(name)}: line ${await p.line()}; ` + await browser.evaluate<string>(`(() => { const control = document.querySelector(${JSON.stringify(p.control(kind, index))}), box = control.getBoundingClientRect(), body = document.querySelector("${AREA} .mw-platform-area__body").getBoundingClientRect();
        return JSON.stringify({ box: [box.top, box.bottom], body: [body.top, body.bottom], hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.outerHTML.slice(0, 120) }); })()`));
      throw error;
    }
    await browser.waitFor(`([...document.querySelectorAll(${JSON.stringify(AREA + " [data-task-grants-row]")})].find(row => row.dataset.taskGrantsRow === ${JSON.stringify(name)})?.dataset.status ?? "none") === ${JSON.stringify(then)}`);
    return (await p.sets()).at(-1)!.body;
  };
  /** The area read anew: the page places its element again (same key), as it does when it shows the task again. */
  const reread = async (key = "daily") => {
    await p.place("tga", key, "left:24px;top:24px;width:560px");
    assert.equal(await p.placed("tga"), "shown");
  };
  const grantsOf = async (provider: string) => JSON.stringify((await readMcpToolPreference(browser.homeDirectory)).action_grants
    .filter(grant => grant.client_id.startsWith("agent:task:") && grant.client_id.endsWith(":daily") && grant.provider_id === provider).map(grant => [grant.capability_id, grant.generation]).sort());
  const plugins = (method: "DELETE" | "POST", plugin_id: string) => fetch(`${browser.origin}/api/settings/projects/${encodeURIComponent(browser.projectId!)}/plugins`, { method,
    headers: { origin: browser.origin, "content-type": "application/json", "x-molis-work-control-token": browser.controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify({ plugin_id }) });

  await reread();
  await act(OPERATIONS, "switch", "granted");
  await act(INBOX, "switch", "granted");

  // X needs confirmation: one of its actions has no record (as when the provider adds a reading); Y's provider is off (TGA-13, TGA-14).
  const stored = JSON.parse(await readFile(file, "utf8")) as { action_grants: Array<{ client_id: string; provider_id: string; capability_id: string }> };
  const dropped = stored.action_grants.findIndex(grant => grant.client_id.endsWith(":daily") && grant.provider_id === SCHEDULE);
  assert.ok(dropped >= 0);
  stored.action_grants.splice(dropped, 1);
  await writeFile(file, JSON.stringify(stored, null, 2) + "\n");
  const off = await plugins("DELETE", "inbox");
  assert.equal(off.status, 200, await off.text());
  await reread();
  assert.equal(await status(OPERATIONS), "needs_confirmation");
  assert.equal(await status(INBOX), "unavailable");
  const operations = await grantsOf(SCHEDULE), inbox = await grantsOf("io.molis.work.inbox");
  const turnedOn = await act(REMINDERS, "switch", "granted");
  const refs = turnedOn.categories!.map(item => [item.provider_id + "/" + (item.group_id ?? ""), item.confirm ?? false]);
  assert.deepEqual(refs.sort(), [[`${SCHEDULE}/operations`, false], [`${SCHEDULE}/reminders`, false], ["io.molis.work.inbox/inbox", false]].sort(),
    "TGA-13 TGA-14 the set names every category the task holds, as held, with no confirm");
  assert.equal(await status(OPERATIONS), "needs_confirmation", "TGA-13 X still needs the person");
  assert.equal(await status(INBOX), "unavailable");
  const reminders = scheduleActions.reminders.capability_id;
  assert.deepEqual(JSON.parse(await grantsOf(SCHEDULE)).filter((row: string[]) => row[0] !== reminders), JSON.parse(operations),
    "TGA-13 X's records are as they were; its new reading is still not recorded");
  assert.equal(await grantsOf("io.molis.work.inbox"), inbox, "TGA-14 Y's records stay while its provider is off");
  // Y's provider is back and unchanged: Y reads again, without the person doing anything.
  assert.equal((await plugins("POST", "inbox")).status, 200);
  await reread();
  assert.equal(await status(INBOX), "granted", "TGA-14 a category whose provider came back reads again");

  // TGA-12: allowing X records it anew with the person's confirm, and offers no undo.
  const allowed = await act(OPERATIONS, "allow", "granted");
  assert.deepEqual(allowed.categories!.filter(item => item.confirm).map(item => item.group_id), ["operations"]);
  assert.match(await p.line(), /新读取能力/);
  assert.equal(await browser.evaluate(`document.querySelector("${AREA} .mw-toast__action")`), null, "allowing has no undo");
  // TGA-12: a category no longer offered is removed on the person's word, with no undo.
  const kept = JSON.parse(await readFile(file, "utf8")) as { action_grants: Array<Record<string, unknown>> };
  const model = kept.action_grants.find(grant => String(grant.client_id).endsWith(":daily") && grant.provider_id === SCHEDULE)!;
  kept.action_grants.push({ ...model, capability_id: "schedule.no.longer.declared", generation: "planted" });
  await writeFile(file, JSON.stringify(kept, null, 2) + "\n");
  await reread();
  assert.equal(await status(SCHEDULE + "\n"), "removed");
  const removed = await act(SCHEDULE + "\n", "remove", "none");
  assert.equal(removed.categories!.some(item => item.provider_id === SCHEDULE && item.group_id === undefined), false);
  assert.equal(await status(SCHEDULE + "\n"), "none");
  assert.equal((await grantsOf(SCHEDULE)).includes("schedule.no.longer.declared"), false, "the removed category's records are gone");
  assert.match(await p.line(), /不再提供/);

  // TGA-17: the page places its element again under another key; the area that shows is that task's, and the old one is gone.
  const daily = await p.records();
  await reread("weekly");
  assert.equal(await browser.evaluate(`document.querySelectorAll("[data-framed-area]").length`), 1);
  assert.equal(await status(REMINDERS), "off", "another key is another task, with nothing yet");
  const weekly = await act(REMINDERS, "switch", "granted");
  assert.equal(weekly.key, "weekly");
  const both = await p.records();
  assert.ok(both.includes(":weekly") && JSON.parse(both).filter((grant: { client_id: string }) => grant.client_id.endsWith(":daily")).length === JSON.parse(daily).length, "the old key's grants are untouched");
  // TGA-17: the page's authority is closed (the page left); a press then writes nothing.
  const page = (await p.sent()).at(-1)!.page;
  await browser.evaluate(`molisWorkRequest(${JSON.stringify(p.prefix + "/api/host/plugin-pages/")} + ${JSON.stringify(page)}, { method: "DELETE", body: {} })`);
  const index = await rowOf(REMINDERS);
  await p.settle();
  await p.press(p.control("switch", index));
  await browser.waitFor(`document.querySelector("${AREA} .mw-toast.is-error")`);
  assert.equal(await p.line(), "没能保存，原来的授权没变");
  assert.equal(await p.records(), both, "TGA-17 a press after the page closed wrote nothing");
});
