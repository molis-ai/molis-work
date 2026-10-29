// W5-02 PR-B: which plugins a project's page shows is the Host's fact, read per request from the project's Catalog (enabled, minus
// hidden, with the personal plugins), and the page, its refresh and its fragments read that one view. A Goal's 「加输入」 lists a
// 「新建」 button for each plugin the page shows that declares one, so the Pages button is where a hidden Pages would leak back in.
import assert from "node:assert/strict";
import test from "node:test";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const PAGES_CREATE = 'data-placement-create="pages"';

test("RAC-712 a project that hid Pages has no Pages create button in its page, refresh or document fragment; shown again, it has it in all three", { timeout: 60_000 }, async t => {
  const { request, project } = await serveHomeRuntime(t), current = await project("Shown plugins");
  const prefix = `/projects/${encodeURIComponent(current.project_id)}`;
  const created = await request(`${prefix}/api/plugins/io.molis.work.goals/goals`, { method: "POST", body: { title: "Shown plugins goal", idempotency_key: "shown-plugins-goal" } });
  assert.equal(created.status, 201, await created.clone().text());
  const goalId = (await created.json() as { goal: { goal_id: string } }).goal.goal_id;
  const html = async (path: string) => {
    const response = await request(prefix + path);
    const body = await response.text();
    assert.equal(response.status, 200, `${path}: ${body.slice(0, 200)}`);
    return body;
  };
  const surfaces = async () => ({
    page: await html(`/goals/${encodeURIComponent(goalId)}`),
    refresh: await html(`/api/board/refresh?goal_id=${encodeURIComponent(goalId)}`),
    document: await html(`/api/goals/${encodeURIComponent(goalId)}/document`),
  });
  const withPages = (all: Record<string, string>) => Object.fromEntries(Object.entries(all).map(([name, body]) => [name, body.includes(PAGES_CREATE)]));

  assert.deepEqual(withPages(await surfaces()), { page: true, refresh: true, document: true }, "Pages is a personal plugin, so a new project shows it");

  const hidden = await request(`/api/settings/projects/${encodeURIComponent(current.project_id)}/plugins`, { method: "DELETE", body: { plugin_id: "pages" } });
  assert.equal(hidden.status, 200, await hidden.clone().text());
  assert.deepEqual(withPages(await surfaces()), { page: false, refresh: false, document: false }, "hidden, it is gone from every surface the view draws");

  const shown = await request(`/api/settings/projects/${encodeURIComponent(current.project_id)}/plugins`, { method: "POST", body: { plugin_id: "pages" } });
  assert.equal(shown.status, 200, await shown.clone().text());
  assert.deepEqual(withPages(await surfaces()), { page: true, refresh: true, document: true }, "shown again, every surface has it");
});
