import assert from "node:assert/strict";
import test from "node:test";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("a todo moved away from the placement panel leaves this page: the open detail closes and the row goes; moved here, it stays", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "todo");
  const { evaluate, waitFor, click } = child;
  const store = openTodoStore(homeDirectory, undefined, projectId!);
  const scope = { actor: "user" as const, actorId: "test" };
  const away = store.create({ title: "整理 Beta 用户回访记录" }, scope).item;
  const stay = store.create({ title: "准备周会材料" }, scope).item;
  store.close();
  // What the placement panel does (batch 108: every partition has its own Todo library): the platform carries the todo to the other
  // partition and lets it go here, then tells the page.
  const changed = async (id: string, from: string, to: string) => {
    await browser.evaluate(`window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: { mode: "move", from: { kind: "todo_item", id: ${JSON.stringify(id)}, project_id: ${JSON.stringify(from)} }, to: { kind: "todo_item", id: ${JSON.stringify(id)}, project_id: ${JSON.stringify(to)} } } }))`);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openItem=${away.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-todo-field=title]')?.value === '整理 Beta 用户回访记录'`);
  const here = openTodoStore(homeDirectory, undefined, projectId!);
  try { here.removeCarried(away.id, here.exportRecord(away.id).revision); } finally { here.close(); }
  await changed(away.id, projectId!, "project-q4");
  await waitFor("document.querySelector('[data-todo-stage-workspace]').hidden");
  await waitFor(`!document.querySelector('[data-todo-row="${away.id}"]')`);

  // One moved here from another partition is in this partition's library: the open detail stays.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openItem=${stay.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-todo-field=title]')?.value === '准备周会材料'`);
  await changed(stay.id, "project-q4", projectId!);
  await waitFor(`!!document.querySelector('[data-todo-row="${stay.id}"]')`);
  assert.equal(await evaluate("document.querySelector('[data-todo-stage-workspace]').hidden"), false);
});
