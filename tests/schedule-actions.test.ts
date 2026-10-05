import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  SCHEDULE_ACTIONS, SCHEDULE_ACTION_PERMISSIONS, SchedulePluginRouteTable, createScheduleRouteHandlers, scheduleActions as s,
  scheduleRouteErrorResponse, type ScheduleConversationTaskView,
} from "@molis-ai/molis-work-plugin-schedule";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { projectActionAvailability } from "../apps/local-host/src/project-action-availability.js";
import { scheduleServiceFor } from "../apps/local-host/src/schedule-runtime.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("Schedule tasks register as project actions shared by HTTP, Host callers and production MCP", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "schedule-actions-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Schedule actions", actor_id: "owner" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "schedule", actor_id: "owner" });
  const policy = projectActionAvailability(async (_options, run) => run(catalog), home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: policy });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  const clients: Client[] = [];
  try {
    const directory = (await client.discover(caller)).filter(row => row.provider.plugin_id === "io.molis.work.schedule");
    assert.deepEqual(directory.map(row => row.capability_id).sort(), SCHEDULE_ACTIONS.map(row => row.capability_id).sort());
    assert.ok(directory.every(row => row.availability.available && row.provider.project_id === project.project_id));

    // The HTTP paths are thin: the 201 status and the owner's validation messages come through.
    let changed = 0;
    const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: bound, changed: () => { changed++; } }));
    const post = async (pathname: string, body: Record<string, unknown>) => {
      try { return await routes.handle({ method: "POST", pathname, query: new URLSearchParams(), body }); }
      catch (error) { return scheduleRouteErrorResponse(error); }
    };
    const created = await post("/api/schedule/tasks", { title: "晨报", instructions: "把未读收成三条", time: "08:30" });
    assert.equal(created?.status, 201);
    const task = (created?.body as { task: ScheduleConversationTaskView }).task;
    assert.equal(task.clock_label, "08:30");
    assert.equal(task.notify_important, true);
    assert.equal(changed, 1);
    const blank = await post("/api/schedule/tasks", { title: "  ", instructions: "x", time: "09:00" });
    assert.equal(blank?.status, 400);
    assert.match(String((blank?.body as { error: string }).error), /1 到 80 字的标题/);
    const conversationJob = await post(`/api/schedule/jobs/${encodeURIComponent(task.job_id!)}/enabled`, { enabled: false });
    assert.equal(conversationJob?.status, 400);
    assert.match(String((conversationJob?.body as { error: string }).error), /任务自己的开关/);
    assert.equal((await post("/api/schedule/tasks/missing/open", {}))?.status, 404);

    // Callers, not arguments, carry project and authority.
    await assert.rejects(client.invoke({ ...caller, permissions: ["schedule:read"] }, s.createTask, { title: "x", instructions: "y", time: "09:00" }), { code: "actions.forbidden" });
    await assert.rejects(client.invoke({ ...caller, project_id: "other" }, s.list, {}), { code: "actions.scope_mismatch" });
    await assert.rejects(bound.invoke(s.createTask, { title: "x", instructions: "y", time: "09:00", project_id: "other" } as never), { code: "actions.input_invalid" });

    const paused = (await bound.invoke(s.setTaskEnabled, { task_id: task.task_id, enabled: false })).task;
    assert.equal(paused.enabled, false);
    const job = (jobId: string) => host.withProject(ref, runtime => scheduleServiceFor(runtime.store.db).get(jobId));
    assert.equal((await job(task.job_id!))?.enabled, false, "the scheduler job follows the task");
    const resumed = (await bound.invoke(s.setTaskEnabled, { task_id: task.task_id, enabled: true })).task;
    assert.equal(resumed.enabled, true);

    // Disabling the plugin in the project removes access without deleting tasks; re-enabling restores them.
    catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "schedule", actor_id: "owner" });
    const disabled = (await client.discover(caller)).find(row => row.capability_id === s.list.capability_id)!;
    assert.equal(disabled.availability.available, false);
    await assert.rejects(bound.invoke(s.list, {}), { code: "actions.plugin_disabled" });
    const reminders = (await client.discover({ ...caller, audience: "plugin" })).filter(row => row.capability_id.startsWith("reminders."));
    assert.deepEqual(reminders.map(row => row.capability_id).sort(), ["reminders.add", "reminders.cancel"]);
    assert.ok(reminders.every(row => row.availability.available && row.provider.kind === "system"), "common reminders do not acquire the optional conversation UI's enablement requirement");
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "schedule", actor_id: "owner" });
    await host.closeProject(ref);
    assert.deepEqual((await bound.invoke(s.list, {})).tasks.map(row => row.task_id), [task.task_id], "reopening the Runtime keeps the task");

    // An external client sees only exactly granted actions; its writes land in the same project tasks.
    for (const definition of [s.list, s.createTask]) {
      await writeMcpActionGrant(home, createMcpActionGrant("runtime:scheduler", project.project_id,
        directory.find(row => row.capability_id === definition.capability_id)!, true));
    }
    const sdk = new Client({ name: "untrusted-name", version: "1" }); clients.push(sdk);
    await sdk.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("./fixtures/production-action-mcp-server.ts", import.meta.url)), home, project.project_id, "scheduler", project.database_path, project.board_id], stderr: "pipe" }));
    const tools = (await sdk.listTools()).tools.map(tool => tool.name);
    assert.ok(tools.includes(hostActionToolName(s.createTask)));
    assert.ok(!tools.includes(hostActionToolName(s.archiveTask)), "ungranted actions are not exported");
    assert.ok(!tools.includes(hostActionToolName(s.recoverReminder)), "ordinary Schedule grants do not implicitly expose installation recovery to MCP");
    assert.ok(!tools.includes(hostActionToolName(s.recoverOperation)), "operation retry/skip requires its own explicit MCP grant");
    const external = await sdk.callTool({ name: hostActionToolName(s.createTask),
      arguments: { title: "周报", instructions: "汇总本周进展", time: "18:00", notify_important: false }, _meta: { project_id: "other" } });
    assert.equal(external.isError, false, JSON.stringify(external));
    const externalTask = (external.structuredContent as { task: ScheduleConversationTaskView }).task;
    const listed = await bound.invoke(s.list, {});
    assert.deepEqual(listed.tasks.map(row => row.task_id).sort(), [task.task_id, externalTask.task_id].sort());
    assert.equal(listed.tasks.find(row => row.task_id === externalTask.task_id)?.clock_label, "18:00");
    assert.equal((await sdk.callTool({ name: hostActionToolName(s.archiveTask), arguments: { task_id: task.task_id } })).isError, true);

    assert.deepEqual(await bound.invoke(s.archiveTask, { task_id: externalTask.task_id }), { archived: true });
    assert.equal(await job(externalTask.job_id!), null, "archiving cancels the pending wakeup");
    assert.deepEqual((await bound.invoke(s.list, {})).tasks.map(row => row.task_id), [task.task_id]);
  } finally {
    await Promise.all(clients.map(sdk => sdk.close()));
    await host.close(); catalog.close();
    await rm(home, { recursive: true, force: true });
  }
});
