import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { backgroundPlugin } from "./fixtures/home-background-plugin.js";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { openTestHome } from "./fixtures/test-home.js";

const source = { surface: "example", title: "Example", icon: "list" };
const answer = (project: string) => ({ source, tasks: [{ subject: { kind: "homebg_task", id: project }, title: "Export", state: "running", details: [], waiting: false,
  updated_at: "2026-10-01T10:00:00.000Z", executor: { kind: "plugin", label: "Example" }, serves: [], scope: "project", commands: [], decisions: [], open: null }] });

test("QEA-14/16 Home attention keeps partial failure, invalid-answer and timeout evidence until a real read recovers", { timeout: 90_000 }, async t => {
  const plugin = backgroundPlugin(answer);
  // Nothing runs in the personal space, which the Home reads too (batch 106): every answer set below is the projects'.
  let projectAnswer = plugin.state.answer;
  Object.defineProperty(plugin.state, "answer", { get: () => (project: string) => project === PERSONAL_SPACE_PROJECT_ID ? { source, tasks: [] } : projectAnswer(project),
    set: (next: typeof projectAnswer) => { projectAnswer = next; } });
  const home = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [plugin.definition] } } });
  const a = await home.createProject("Alpha"), b = await home.createProject("Beta");
  await startProjectPlugins(home.host, a.reference);
  await startProjectPlugins(home.host, b.reference);
  const read = async () => (await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult }>("/api/attention")).background_tasks;
  const secret = "provider-private-error-content";
  plugin.state.answer = project => { if (project === b.project_id) throw new ActionError("example.read_failed", secret); return answer(project); };
  const partial = await read();
  assert.equal(partial.issues?.length, 1, "a failed source must not disappear from Home's answer");
  assert.deepEqual(partial.tasks.map(row => [row.project_id, row.project_name, row.subject.id]), [[a.project_id, "Alpha", a.project_id]]);
  assert.equal(partial.issues[0]!.project_id, b.project_id);
  assert.equal(partial.issues[0]!.source?.capability_id, "homebg.tasks");
  assert.equal(partial.issues[0]!.code, "example.read_failed");
  assert.ok(!JSON.stringify(partial).includes(secret), "only the error code crosses HTTP");

  plugin.state.answer = () => { throw new ActionError("example.read_failed", secret); };
  const failed = await read();
  assert.deepEqual(failed.tasks, []);
  assert.deepEqual(failed.issues.map(issue => issue.project_id).sort(), [a.project_id, b.project_id].sort());

  plugin.state.answer = () => ({ source, tasks: "invalid" });
  const invalid = await read();
  assert.deepEqual(invalid.tasks, []);
  assert.deepEqual(invalid.issues.map(issue => issue.code), ["actions.output_invalid", "actions.output_invalid"]);

  const released = Promise.withResolvers<unknown>();
  plugin.state.answer = () => released.promise;
  try {
    const timeout = await read();
    assert.deepEqual(timeout.tasks, []);
    assert.deepEqual(timeout.issues.map(issue => issue.code), ["actions.timeout", "actions.timeout"]);
  } finally { released.resolve({ source, tasks: [] }); }

  plugin.state.answer = answer;
  const recovered = await read();
  assert.deepEqual(recovered.issues, []);
  assert.deepEqual(recovered.tasks.map(row => row.project_id).sort(), [a.project_id, b.project_id].sort());
  const beforeHomeView = plugin.state.calls.length;
  const chooser = await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult; line: null; tasks: null }>(`/projects/${a.project_id}/api/attention?view=home`);
  assert.deepEqual(chooser.background_tasks, recovered, "Home keeps every open project's tasks when a project is selected");
  assert.deepEqual([chooser.line, chooser.tasks], [null, null], "Home does not read a project line it never renders");
  assert.deepEqual(plugin.state.calls.slice(beforeHomeView).map(call => call.project).sort(), [PERSONAL_SPACE_PROJECT_ID, a.project_id, b.project_id].sort(), "each provider is read only once, without a second Mainline read");
  assert.equal((await home.web.get<{ background_tasks: null }>(`/projects/${a.project_id}/api/attention`)).background_tasks, null, "the ordinary project page still has no Home aggregate");
  plugin.state.answer = () => ({ source, tasks: [] });
  assert.deepEqual(await read(), { tasks: [], issues: [] }, "only a complete empty read means no background work");
  assert.ok(plugin.state.calls.every(call => call.query_only));
  assert.deepEqual(plugin.state.stops, [], "reading and recovering never dispatch a task command");
});
