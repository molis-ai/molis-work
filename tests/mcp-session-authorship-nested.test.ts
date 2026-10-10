import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { ActionError, bindActionClient, defineWorkflowContentActions, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { WORKFLOWS_ACTION_PERMISSIONS, workflowsActions as w } from "@molis-ai/molis-work-plugin-workflows";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";

/**
 * A wrapper action reaches other actions with the client's authority. The Session rule holds there too: a Runtime without a
 * stable Session cannot have the workflows plugin create session-authored content for it, any more than it can create it itself.
 */
const CLIENT = "runtime:codex";
const START = "molis_work_v1_action_workflows.instances.start__v1";
const station = defineWorkflowContentActions({ id: "authored-notes", title: "署名笔记", icon: "note", create: true, receive: false, subject_kind: "authored_note",
  read_permissions: ["authored:read"], write_permissions: ["authored:write"] });

/** A project with a workflow from a station whose blank content is authored by a Session, into a plain step; the client holds every grant the run needs. */
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-session-nested-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost({ homeDirectory });
  const project = await catalog.createProject({ display_name: "署名", actor_id: "user" });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const authors: string[] = [];
  const create: ActionDefinition<{ title: string }, { plugin: string; item_id: string; title: string }> =
    { ...station.create!, action: { ...station.create!.action, authorship: "session" } };
  const sink: ActionDefinition<{ title: string }, { ok: true }> = { capability_id: "fixture.sink.write", version: 1, operation: "command",
    action: { title: "收下", description: "收下交过来的标题", kind: "operation", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: ["authored:write"],
      subject_kinds: ["authored_note"], input_schema: { type: "object", properties: { title: { type: "string", minLength: 1 } }, required: ["title"], additionalProperties: false },
      output_schema: { type: "object", properties: { ok: { const: true } }, required: ["ok"] } } };
  const definitions = [station.list, station.read, create, sink];
  await host.withProject(reference, () => {
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture-authored-notes", title: "署名笔记", kind: "plugin", plugin_id: "io.molis.work.fixture.authored-notes" },
      definitions, handlers: [
        { ...station.list, handle: () => [] },
        { ...station.read, handle: () => ({ title: "笔记", body: "正文" }) },
        { ...create, handle: (caller, input) => { authors.push(caller.audit_actor_id ?? caller.actor_id); return { plugin: "authored-notes", item_id: `note-${authors.length}`, title: (input as { title: string }).title }; } },
        { ...sink, handle: () => ({ ok: true }) },
      ] });
  });
  const person = bindActionClient(host.actionClient(reference), () => ({ actor_id: "web-user", project_id: project.project_id, audience: "user" as const,
    permissions: [...WORKFLOWS_ACTION_PERMISSIONS, "authored:read", "authored:write"] }));
  const step = (await person.invoke(w.actionSteps, {})).actions.find(row => row.ref.capability_id === "fixture.sink.write")!;
  const { workflow } = await person.invoke(w.create, { title: "署名笔记流程", chain: { stations: [{ plugin: "authored-notes" },
    { plugin: "action", action: { ref: step.ref, title: step.title, group: step.group, mapping: { title: { from: "title" } } } }],
    links: [{ kind: "function", title_template: "", body_template: "{正文}", instructions: "" }] } });
  await grantGoalsMcp(host, homeDirectory, project, CLIENT, [...definitions, w.start]);
  const server = (nativeRuntimeSessionId?: string) => new MolisWorkServer("runtime", { databasePath: project.database_path, projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173" },
    { homeDirectory, ...(nativeRuntimeSessionId ? { nativeRuntimeSessionId } : {}),
      runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false } }, host);
  return { workflow, authors, server, person,
    done: async () => { await host.close(); catalog.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("a Runtime without a stable Session cannot start a workflow whose first station creates session-authored content", async () => {
  const f = await fixture();
  const mcp = f.server();
  try {
    await assert.rejects(mcp.callTool(START, { id: f.workflow.workflow_id }),
      (error: unknown) => error instanceof ActionError && error.code === "mcp.runtime_identity_missing" && /稳定 Session/.test(error.message));
    assert.deepEqual(f.authors, [], "the station's create never ran");
    assert.equal((await f.person.invoke(w.get, { id: f.workflow.workflow_id })).instances.length, 0, "no run was started");
  } finally { await mcp.close(); await f.done(); }
});

test("with a stable Session the same workflow starts and the station's content is the Session's", async () => {
  const f = await fixture();
  const mcp = f.server("native-session");
  try {
    const started = JSON.parse(await mcp.callTool(START, { id: f.workflow.workflow_id })) as { instance: { instance_id: string } };
    assert.ok(started.instance.instance_id);
    assert.equal((await f.person.invoke(w.get, { id: f.workflow.workflow_id })).instances.length, 1);
    assert.deepEqual(f.authors, [`${CLIENT}:native-session`]);
  } finally { await mcp.close(); await f.done(); }
});
