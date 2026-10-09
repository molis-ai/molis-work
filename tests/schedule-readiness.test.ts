import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  MolisWorkLocalHost, molisWorkHostProjectReference, scheduledTaskReadiness, withConnectorConnections,
} from "@molis-ai/molis-work-app-local-host";
import {
  SCHEDULE_ACTION_PERMISSIONS, SCHEDULE_CLIENT_FACTORY_SCRIPT, SCHEDULE_NATIVE_PLUGIN_ROUTES, SchedulePluginRouteTable,
  createScheduleRouteHandlers, scheduleActions as s, scheduleRouteErrorResponse, scheduleUiContribution,
  type ScheduleUiModel,
} from "@molis-ai/molis-work-plugin-schedule";
import { directScheduleActions } from "./schedule-direct-actions.js";

// W2-18 decision 3: creating a scheduled task without a model or a bound workspace shows a hint in the dialog and still
// allows creation. The two things a due task needs are the ones the runner checks when it wakes up.

const verified: ProjectWorkspaceRef = { workspace_id: "w1", canonical_path: "/tmp/schedule-readiness", realpath_verified: true, display_name: "readiness" };

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "schedule-readiness-"));
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  try { return await run(home); }
  finally {
    resetSecretStoreCache();
    if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous;
    await rm(home, { recursive: true, force: true });
  }
}
/** A text model the way settings saves it: a connection holding the key, and a provider entry pointing at it. */
async function configureModel(home: string): Promise<void> {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const connection = withConnectorConnections(home, store => {
      const made = store.createToken({ serviceId: "model-api", displayName: "ready", token: "ready-fixture-key" });
      store.assertTarget(made.connection_id, "model-api", "http://127.0.0.1:9");
      return made;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "ready", display_name: "ready", base_url: "http://127.0.0.1:9/v1",
      api_format: "openai-chat-completions", prompt_cache: "off", models: [{ model_id: "ready-model", enabled: true }] });
  } finally { catalog.close(); }
}

test("a due task needs a configured text model and a verified bound workspace, and the readiness probe reads exactly those", async () => withHome(async home => {
  assert.deepEqual(await scheduledTaskReadiness({ homeDirectory: home, projectId: "p" }), { model: false, workspace: false }, "nothing set up");
  assert.deepEqual(await scheduledTaskReadiness({ homeDirectory: home, projectId: "p", workspaceFor: () => verified }), { model: false, workspace: true });
  assert.deepEqual(await scheduledTaskReadiness({ homeDirectory: home, projectId: "p", workspaceFor: async () => ({ ...verified, realpath_verified: false }) }),
    { model: false, workspace: false }, "a directory that is not verified is refused by the runner, so it does not count");
  assert.deepEqual(await scheduledTaskReadiness({ homeDirectory: home, projectId: "p", workspaceFor: () => null }), { model: false, workspace: false });
  await configureModel(home);
  assert.deepEqual(await scheduledTaskReadiness({ homeDirectory: home, projectId: "p", workspaceFor: async () => verified }), { model: true, workspace: true });
  assert.deepEqual(await scheduledTaskReadiness({ projectId: "p", workspaceFor: () => verified }), { model: false, workspace: true }, "a Host without a Home has no model");
}));

test("the readiness action is a project query that reports what the Host reports, and the route maps to it", { timeout: 60_000 }, async () => withHome(async home => {
  let workspace: ProjectWorkspaceRef | null = null;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: () => workspace });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS };
  try {
    await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ project_id: ref.project_id, title: "Schedule", actor_id: "owner", idempotency_key: "init" }));
    const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
    const row = (await client.discover(caller)).find(item => item.capability_id === s.readiness.capability_id);
    assert.ok(row, "listed in the one directory");
    assert.equal(s.readiness.operation, "query");
    assert.deepEqual(s.readiness.action.permissions, ["schedule:read"]);
    assert.deepEqual(await bound.invoke(s.readiness, {}), { model: false, workspace: false });
    await assert.rejects(client.invoke({ ...caller, permissions: [] }, s.readiness, {}), { code: "actions.forbidden" });
    await assert.rejects(client.invoke({ ...caller, project_id: "b" }, s.readiness, {}), { code: "actions.scope_mismatch" });

    const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: bound, changed: () => undefined }));
    assert.ok(SCHEDULE_NATIVE_PLUGIN_ROUTES.some(route => route.route_id === "schedule.readiness" && route.method === "GET"));
    const get = (pathname: string) => routes.handle({ method: "GET", pathname, query: new URLSearchParams(), body: {} });
    assert.deepEqual((await get("/api/schedule/readiness"))?.body, { model: false, workspace: false });
    workspace = verified;
    assert.deepEqual((await get("/api/schedule/readiness"))?.body, { model: false, workspace: true }, "read each time, so a model or folder added later shows up");

    // Missing both never stops a task from being made: the hint is advice, not a gate.
    workspace = null;
    const created = await routes.handle({ method: "POST", pathname: "/api/schedule/tasks", query: new URLSearchParams(),
      body: { title: "晨报", instructions: "汇总未读", time: "08:30" } });
    assert.equal(created?.status, 201);
    const listed = await bound.invoke(s.list, {});
    assert.equal(listed.tasks.length, 1);
    assert.equal(listed.tasks[0]!.enabled, true, "and it is enabled as before");
  } finally { await host.close(); }
}));

test("a Host that gives no readiness check answers the way other missing host ports do, and the route says why", async () => {
  const unused = () => { throw new Error("unused"); };
  const bound = directScheduleActions({ listJobs: () => [], setEnabled: unused, listTasks: () => [], recoverReminder: unused, createTask: unused, updateTask: unused,
    archiveTask: unused, setTaskEnabled: unused, openTask: unused });
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: bound, changed: () => undefined }));
  const answered = await routes.handle({ method: "GET", pathname: "/api/schedule/readiness", query: new URLSearchParams(), body: {} }).catch(scheduleRouteErrorResponse);
  assert.equal(answered?.status, 503);
});

test("the create dialog carries two hidden hints, one per missing thing, and nothing in it blocks creating", () => {
  const p: ScheduleUiModel["primitives"] = { escape: String, icon: name => `<i data-icon="${name}"></i>`, text: value => value, formatDate: value => value };
  const html = scheduleUiContribution.render({ contribution_id: "io.molis.work.native.schedule.ui.v1", surface: "workbench", model: { route_prefix: "", jobs: [], tasks: [], primitives: p } });
  const dialog = html.slice(html.indexOf("data-schedule-create-dialog"), html.indexOf("</dialog>", html.indexOf("data-schedule-create-dialog")));
  for (const kind of ["model", "workspace"]) {
    const hint = new RegExp(`<p[^>]*data-schedule-hint="${kind}"[^>]*>`).exec(dialog)?.[0];
    assert.ok(hint, `a hint for ${kind}`);
    assert.match(hint, /\bhidden\b/, "shown only once the Host says it is missing");
    assert.match(hint, /role="status"/);
  }
  assert.match(dialog, /还没有配置文字模型/);
  assert.match(dialog, /还没有绑定工作区/);
  assert.match(dialog, /仍可以创建/, "says the task can still be created");
  assert.match(dialog, /<button class="mw-btn mw-btn--primary" type="submit">/);
  assert.doesNotMatch(dialog, /type="submit"[^>]*disabled/);
});

test("the client reads readiness when the dialog opens, and a failed read stays silent (the behaviour itself is in plugin-small-ux.e2e.test.ts)", () => {
  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /\/api\/schedule\/readiness[\s\S]{0,400}\.catch\(/);
});
