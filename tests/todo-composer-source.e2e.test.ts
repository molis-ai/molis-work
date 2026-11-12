import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/unified-input-voice K5 (UIV-13, BL-composer-source-refresh): Todo is the first real plugin to register a `composer_source`
// (`todo.composer.pick@1`, plugins/native/todo/src/search.ts). In the Assistant's composer its ＋ lists 待办 among the sources; what
// is typed narrows it to the todos still to do, and a pick goes on the composer's strip as a reference. Turned off, Todo is gone
// from ＋ the next time it opens and from `/` the next time the input takes focus: both are read again, so no reload or remount is
// needed.
test("UIV-13 K5: Todo's todos are a source in the composer's ＋, and a Todo turned off leaves the menu at its next opening", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "user"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // The page acts as the focused window, so focusing the input is what a person coming to it does (the `/` list is read then).
  await command("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input')", 20_000);
  const post = (path: string, body: unknown) => evaluate<number>(`fetch(${JSON.stringify(path)}, { method: 'POST', headers: molisWorkControlHeaders(),
    body: ${JSON.stringify(JSON.stringify(body))} }).then((r) => r.status)`);
  const todos = `/projects/${projectId}/api/plugins/io.molis.work.todo/items`;
  assert.equal(await post(todos, { title: "整理季度复盘材料", placement: "project" }), 200);
  assert.equal(await post(todos, { title: "订周五的会议室", placement: "project" }), 200);

  const composer = "[data-assistant-composer]";
  const sources = () => evaluate<string[]>(`[...document.querySelectorAll('${composer} [data-composer-source]')].map((node) => node.textContent.trim())`);
  const openAdd = async () => {
    await evaluate(`document.querySelector('${composer} [data-composer-add]').click()`);
    await waitFor(`!!document.querySelector('${composer} [data-compose-menu]:not([hidden])')`);
  };
  const closeMenu = async () => {
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor(`!document.querySelector('${composer} [data-compose-menu]:not([hidden])')`);
  };

  await openAdd();
  await waitFor(`[...document.querySelectorAll('${composer} [data-composer-source]')].some((node) => node.textContent.includes('待办'))`, 15_000);
  await evaluate(`[...document.querySelectorAll('${composer} [data-composer-source]')].find((node) => node.textContent.includes('待办')).click()`);
  await waitFor(`document.querySelectorAll('${composer} [data-composer-pick]').length === 2`, 15_000);
  // What is typed narrows the todos by their titles.
  await evaluate(`(() => { const field = document.querySelector('${composer} .mw-composer__query input'); field.value = '复盘'; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(`document.querySelectorAll('${composer} [data-composer-pick]').length === 1 && document.querySelector('${composer} [data-composer-pick]').textContent.includes('整理季度复盘材料')`, 15_000);
  await evaluate(`document.querySelector('${composer} [data-composer-pick]').click()`);
  await waitFor(`document.querySelector('${composer} .mw-composer__files')?.textContent.includes('整理季度复盘材料')`, 15_000);

  // `/` lists what this work may use, Todo's actions among them.
  const field = `document.querySelector('${composer} .mw-composer__input')`;
  const commands = () => evaluate<string[]>(`[...document.querySelectorAll('${composer} [data-composer-command]')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim())`);
  const slash = async () => {
    await evaluate(`(() => { ${field}.blur(); ${field}.value = ''; ${field}.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await evaluate(`${field}.focus()`);
    // The list is read again as the input takes focus; a moment for the answer before `/` opens the menu.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await command("Input.insertText", { text: "/" }, sessionId);
    await waitFor(`document.querySelectorAll('${composer} [data-composer-command]').length > 0`, 15_000);
    const listed = await commands();
    await closeMenu();
    return listed;
  };
  const todoCommands = (list: string[]) => list.filter((label) => label.includes("待办 ·"));
  assert.ok(todoCommands(await slash()).length > 0, "Todo's actions are in `/` while it is on");

  // Turned off, Todo leaves ＋ at its next opening and `/` the next time the input is come to; the other sources stay.
  assert.equal(await post("/api/plugins/io.molis.work.todo/disable", {}), 200);
  assert.deepEqual(todoCommands(await slash()), [], "a Todo turned off is not in `/`");
  await openAdd();
  await waitFor(`![...document.querySelectorAll('${composer} [data-composer-source]')].some((node) => node.textContent.includes('待办'))`, 15_000);
  assert.ok(!(await sources()).some((label) => label.includes("待办")), "a Todo turned off is not offered");
  await closeMenu();
  // On again, it is back at the next opening.
  assert.equal(await post("/api/plugins/io.molis.work.todo/enable", {}), 200);
  await openAdd();
  await waitFor(`[...document.querySelectorAll('${composer} [data-composer-source]')].some((node) => node.textContent.includes('待办'))`, 20_000);
});
