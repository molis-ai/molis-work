import assert from "node:assert/strict";
import test from "node:test";
import { addProjectPlugin, createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("a todo moved away from the placement panel leaves this page: the open detail closes and the row goes; moved here, it stays", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, web } = browser;
  assert.ok(projectId);
  const child = await pluginFrameBrowser(t, browser, "todo");
  const { evaluate, waitFor } = child;
  const other = await createProject(web, "Other tasks");
  await addProjectPlugin(web, other.project_id, "todo");
  await addProjectPlugin(web, projectId, "todo");
  // Both tasks qualify for the initial Today view, so the row assertions really observe the move.
  const create = async (id: string, title: string) => (await web.post<{item: {id: string}}>(`/projects/${id}/api/plugins/io.molis.work.todo/items`,
    { title, due_date: "2000-01-01" })).item;
  const move = (id: string, from: string, to: string) => web.post("/api/placement/move", { object: { kind: "todo_item", id, project_id: from }, to_project_id: to });
  const away = await create(projectId, "整理 Beta 用户回访记录");
  const stay = await create(other.project_id, "准备周会材料");
  const changed = async (id: string, from: string, to: string) => {
    await browser.evaluate(`window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: { mode: "move", from: { kind: "todo_item", id: ${JSON.stringify(id)}, project_id: ${JSON.stringify(from)} }, to: { kind: "todo_item", id: ${JSON.stringify(id)}, project_id: ${JSON.stringify(to)} } } }))`);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openItem=${away.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-todo-field=title]')?.value === '整理 Beta 用户回访记录'`);
  await waitFor(`!!document.querySelector('[data-todo-row="${away.id}"]')`);
  await move(away.id, projectId, other.project_id);
  await changed(away.id, projectId, other.project_id);
  await waitFor("document.querySelector('[data-todo-stage-workspace]').hidden");
  await waitFor(`!document.querySelector('[data-todo-row="${away.id}"]')`);

  // Move the second task into the open partition via its real owner before opening its detail.
  await move(stay.id, other.project_id, projectId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openItem=${stay.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-todo-field=title]')?.value === '准备周会材料'`);
  await changed(stay.id, other.project_id, projectId);
  await waitFor(`!!document.querySelector('[data-todo-row="${stay.id}"]')`);
  assert.equal(await evaluate("document.querySelector('[data-todo-stage-workspace]').hidden"), false);
});
