import assert from "node:assert/strict";
import test from "node:test";
import { openTodoStore } from "@molis-ai/molis-work-plugin-todo";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("a todo moved away from the placement panel leaves this page: the open detail closes and the row goes; moved here, it stays", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, origin, projectId, homeDirectory } = browser;
  const store = openTodoStore(homeDirectory);
  const scope = { projectId, everything: true, actor: "user" as const, actorId: "test" };
  const away = store.create({ title: "整理 Beta 用户回访记录", placement: "project" }, scope).item;
  const stay = store.create({ title: "准备周会材料", placement: "project" }, scope).item;
  store.close();
  // What the placement panel does: the move itself, then its event (Home objects carry no project in the event).
  const moved = async (id: string, to: string | null) => {
    const s = openTodoStore(homeDirectory);
    try { s.move(id, to, scope); } finally { s.close(); }
    await evaluate(`window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: { mode: "move", from: { kind: "todo_item", id: ${JSON.stringify(id)}, project_id: null }, to: { kind: "todo_item", id: ${JSON.stringify(id)}, project_id: null } } }))`);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openItem=${away.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-todo-field=title]')?.value === '整理 Beta 用户回访记录'`);
  await moved(away.id, "project-q4");
  await waitFor("document.querySelector('[data-todo-stage-workspace]').hidden");
  await waitFor(`!document.querySelector('[data-todo-row="${away.id}"]')`);

  // Moved to the personal space it is still shown here (personal todos show in every project), so the detail stays.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openItem=${stay.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-todo-field=title]')?.value === '准备周会材料'`);
  await moved(stay.id, null);
  await waitFor("document.querySelector('[data-todo-placement-choices] [aria-checked=true]')?.textContent === '个人空间'");
  assert.equal(await evaluate("document.querySelector('[data-todo-stage-workspace]').hidden"), false);
});
