import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, defineBackgroundTasksAction, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { runningPartitionPlatformServices } from "@molis-ai/molis-work-app-local-host";
import type { HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";

const source = { surface: "example", title: "Example", icon: "list" };
const answer = (project: string) => ({ source, tasks: [{ subject: { kind: "homebg_task", id: project }, title: "Export", state: "running", details: [], waiting: false,
  updated_at: "2026-10-01T10:00:00.000Z", executor: { kind: "plugin", label: "Example" }, serves: [], scope: "project", commands: [], decisions: [], open: null }] });

/**
 * Since batch 108 (V17) a plugin's background tasks reach the Home only as its overview rows, and the Home asks live only the Host's own
 * providers (the Assistant's work) in each open project. This one stands for such a provider: its answer is whatever the test sets, and
 * its output schema accepts any object, so the Host checks the rest.
 */
function hostTaskSource(home: TestHome, projects: readonly TestProject[]) {
  const state = { answer: answer as (project: string) => unknown, calls: [] as Array<{ project: string | null; query_only: boolean }> };
  const query = defineBackgroundTasksAction("homebg.tasks", 1, ["homebg_task"], "示例后台任务", []);
  const declared = { ...query, action: { ...query.action, output_schema: { type: "object" as const } } };
  for (const project of projects) home.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "homebg", title: "Example", kind: "system" },
    definitions: [declared], handlers: [{ ...declared, async handle(caller: ActionExecutionContext) {
      state.calls.push({ project: caller.project_id ?? null, query_only: caller.query_only === true });
      return await state.answer(caller.project_id ?? "");
    } }] });
  return state;
}

test("QEA-14/16 Home attention keeps partial failure, invalid-answer and timeout evidence until a real read recovers", { timeout: 90_000 }, async t => {
  let denied = "";
  const home = await openTestHome(t, { catalogPolicy: false, host: { overviewProjectAccess: (_caller, id) => id !== denied } });
  const a = await home.createProject("Alpha", ["images", "coding"]), b = await home.createProject("Beta");
  const provider = hostTaskSource(home, [a, b]);
  const read = async () => (await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult }>("/api/attention")).background_tasks;
  const secret = "provider-private-error-content";
  provider.answer = project => { if (project === b.project_id) throw new ActionError("example.read_failed", secret); return answer(project); };
  const partial = await read();
  assert.equal(partial.issues?.length, 1, "a failed source must not disappear from Home's answer");
  assert.deepEqual(partial.tasks.map(row => [row.project_id, row.project_name, row.subject.id]), [[a.project_id, "Alpha", a.project_id]]);
  assert.equal(partial.issues[0]!.project_id, b.project_id);
  assert.equal(partial.issues[0]!.source?.capability_id, "homebg.tasks");
  assert.equal(partial.issues[0]!.code, "example.read_failed");
  assert.ok(!JSON.stringify(partial).includes(secret), "only the error code crosses HTTP");

  provider.answer = () => { throw new ActionError("example.read_failed", secret); };
  const failed = await read();
  assert.deepEqual(failed.tasks, []);
  assert.deepEqual(failed.issues.map(issue => issue.project_id).sort(), [a.project_id, b.project_id].sort());

  provider.answer = () => ({ source, tasks: "invalid" });
  const invalid = await read();
  assert.deepEqual(invalid.tasks, []);
  assert.deepEqual(invalid.issues.map(issue => issue.code), ["actions.output_invalid", "actions.output_invalid"]);

  const released = Promise.withResolvers<unknown>();
  provider.answer = () => released.promise;
  try {
    const timeout = await read();
    assert.deepEqual(timeout.tasks, []);
    assert.deepEqual(timeout.issues.map(issue => issue.code), ["actions.timeout", "actions.timeout"]);
  } finally { released.resolve({ source, tasks: [] }); }

  provider.answer = answer;
  const recovered = await read();
  assert.deepEqual(recovered.issues, []);
  assert.deepEqual(recovered.tasks.map(row => row.project_id).sort(), [a.project_id, b.project_id].sort());
  const beforeHomeView = provider.calls.length;
  const chooser = await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult; line: null; tasks: null }>(`/projects/${a.project_id}/api/attention?view=home`);
  assert.deepEqual(chooser.background_tasks, recovered, "Home keeps every open project's tasks when a project is selected");
  assert.deepEqual([chooser.line, chooser.tasks], [null, null], "Home does not read a project line it never renders");
  assert.deepEqual(provider.calls.slice(beforeHomeView).map(call => call.project).sort(), [a.project_id, b.project_id].sort(), "each provider is read only once, without a second Mainline read");
  assert.equal((await home.web.get<{ background_tasks: null }>(`/projects/${a.project_id}/api/attention`)).background_tasks, null, "the ordinary project page still has no Home aggregate");
  // B2R-02: revoke A while both system providers are being read. Keep B, and never query A on a subsequent read.
  const entered = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
  provider.answer = async id => {
    if (id === a.project_id) {
      entered.resolve();
      await resume.promise;
      throw new ActionError("example.read_failed", secret);
    }
    return answer(id);
  };
  const index = runningPartitionPlatformServices(home.home)!.overview, readSources = index.refreshForRead.bind(index);
  const scheduled = Promise.withResolvers<void>();
  index.markDirty(a.project_id);
  t.mock.method(index, "refreshForRead", (libraries: Parameters<typeof readSources>[0]) => {
    const progress = readSources(libraries);
    if (progress.pending.some(library => library.partition_id === a.project_id)) scheduled.resolve();
    return progress;
  });
  const pending = read();
  try { await Promise.all([entered.promise, scheduled.promise]); denied = a.project_id; } finally { resume.resolve(); }
  const filtered = await pending;
  assert.deepEqual(filtered.issues, []);
  assert.equal(filtered.updating, undefined, "A was the only project refreshing");
  assert.deepEqual(filtered.tasks.map(row => row.project_id), [b.project_id]);
  provider.answer = answer;
  const beforeDeniedRead = provider.calls.length;
  assert.deepEqual((await read()).tasks.map(row => row.project_id), [b.project_id]);
  assert.deepEqual(provider.calls.slice(beforeDeniedRead).map(row => row.project), [b.project_id]);
  provider.answer = () => ({ source, tasks: [] });
  assert.deepEqual(await read(), { tasks: [], issues: [] }, "only a complete empty read means no background work");
  assert.ok(provider.calls.every(call => call.query_only));
});
