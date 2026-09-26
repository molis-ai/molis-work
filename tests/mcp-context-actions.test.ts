import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, RuntimeProjectConnection } from "@molis-ai/molis-work-app-local-host";
import { createMcpContextPresenter } from "@molis-ai/molis-work-app-mcp";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("official MCP connection summaries obey live action grants, preserve binding and never read offline local content", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "mcp-context-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Connection A", actor_id: "user" }));
  const second = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Connection B", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const seen = new Set<string>();
  let disabled = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (caller, action) => {
    if (caller.audience === "mcp" && [goalsActions.list.capability_id, goalsActions.guidanceRead.capability_id].includes(action.capability_id)) {
      seen.add(caller.actor_id + ":" + action.capability_id);
      if (disabled) return { available: false, code: "actions.plugin_disabled", reason: "Goals temporarily unavailable" };
    }
    return { available: true };
  } });
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "user", actor_kind: "user", project_id: project.project_id,
    audience: "user", permissions: ["goals:read", "goals:write"] }));
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  const sdk = new Client({ name: "untrusted-client-label", version: "1" });
  const runtimeContext = { runtime_id: "context-actions", stable_work_context_id: "context-actions-session", host_declares_stable: true };
  try {
    await actions.invoke(goalsActions.create, { goal_id: "CONTEXT-SECRET", title: "Authorized goal content", idempotency_key: "create-context" });
    await actions.invoke(goalsActions.guidanceAdd, { kind: "constraint", content: "Authorized project instruction", reason: "Fixture",
      confirmation_summary: "Exact instruction confirmed", user_confirmed: true, idempotency_key: "guidance-context" });
    await withCatalog({ homeDirectory: home }, c => c.bindRuntimeContext({ context: runtimeContext, project_id: project.project_id, actor_id: "user", user_confirmed: true }));
    const bindingsBefore = await withCatalog({ homeDirectory: home }, c => c.listRuntimeContextBindings());
    const cursorBefore = await host.withProject(ref, r => r.store.eventCursor(project.board_id));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    await sdk.connect(new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))],
      env: { ...Object.fromEntries(Object.entries(process.env).filter((x): x is [string, string] => x[1] !== undefined)),
        MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: runtimeContext.runtime_id,
        MOLIS_WORK_WORK_CONTEXT_ID: runtimeContext.stable_work_context_id, MOLIS_WORK_WORK_CONTEXT_STABLE: "true" }, stderr: "pipe" }));
    const contextCall = async (name: string, input = {}) => {
      const result = await sdk.callTool({ name, arguments: input });
      assert.ok(!result.isError, JSON.stringify(result));
      const content = (result.content as Array<{ type: string; text?: string }>).find(c => c.type === "text");
      return JSON.parse(content!.text!);
    };
    const resolve = () => contextCall("molis_work_v1_context_resolve");
    let result = await resolve();
    assert.equal(result.status, "bound"); assert.equal(result.connection.project_id, project.project_id);
    assert.equal(result.project_guidance, null); assert.equal(result.runtime_prompt_prefix, null); assert.equal(result.resume, null);
    assert.ok(result.project_guidance_error.code); assert.ok(result.resume_error.code);
    assert.doesNotMatch(JSON.stringify(result), /Authorized goal content|Authorized project instruction/);
    const caller = { actor_id: "runtime:context-actions", audience: "mcp" as const, project_id: project.project_id, permissions: [] };
    const views = await host.inspectActions(caller, ref);
    const grant = async (capabilityId: string, enabled: boolean) => writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id,
      views.find(view => view.capability_id === capabilityId)!, enabled));
    await grant(goalsActions.guidanceRead.capability_id, true);
    result = await resolve();
    assert.match(result.runtime_prompt_prefix, /Authorized project instruction/); assert.equal(result.project_guidance_error, undefined);
    assert.equal(result.resume, null); assert.ok(result.resume_error);
    await grant(goalsActions.list.capability_id, true);
    result = await resolve();
    assert.equal(result.resume.focus.goal_id, "CONTEXT-SECRET"); assert.equal(result.resume.auto_claimed, false); assert.equal(result.resume_error, undefined);
    assert.ok(seen.has(caller.actor_id + ":" + goalsActions.list.capability_id));
    await grant(goalsActions.guidanceRead.capability_id, false);
    result = await resolve();
    assert.equal(result.project_guidance, null); assert.equal(result.runtime_prompt_prefix, null); assert.ok(result.project_guidance_error);
    assert.equal(result.resume.focus.goal_id, "CONTEXT-SECRET");
    disabled = true;
    result = await resolve();
    assert.equal(result.status, "bound"); assert.equal(result.resume, null); assert.ok(result.resume_error);
    disabled = false;
    assert.deepEqual(await withCatalog({ homeDirectory: home }, c => c.listRuntimeContextBindings()), bindingsBefore);
    assert.equal(await host.withProject(ref, r => r.store.eventCursor(project.board_id)), cursorBefore, "read-only recovery never claims work or rewrites project facts");
    result = await contextCall("molis_work_v1_context_bind", { project_id: second.project_id,
      actor_id: "user", user_confirmed: true, rebind_confirmed: true });
    assert.equal(result.connection.project_id, second.project_id); assert.equal(result.resume, null);
    assert.doesNotMatch(JSON.stringify(result), /CONTEXT-SECRET|Authorized goal content/);
    result = await contextCall("molis_work_v1_context_create_and_bind", { display_name: "New ungranted project", actor_id: "user",
      user_confirmed: true, rebind_confirmed: true, idempotency_key: "new-context-project" });
    assert.equal(result.status, "bound"); assert.notEqual(result.connection.project_id, project.project_id);
    assert.equal(result.project_guidance, null); assert.equal(result.resume, null); assert.ok(result.resume_error);
    await contextCall("molis_work_v1_context_bind", { project_id: project.project_id,
      actor_id: "user", user_confirmed: true, rebind_confirmed: true });
    await grant(goalsActions.guidanceRead.capability_id, true);
    await new Promise<void>(resolve => server.close(() => resolve()));
    result = await resolve();
    assert.equal(result.status, "bound"); assert.equal(result.connection.project_id, project.project_id);
    assert.equal(result.resume, null); assert.equal(result.project_guidance, null);
    assert.equal(result.resume_error.code, "actions.service_unavailable"); assert.equal(result.project_guidance_error.code, "actions.service_unavailable");
    assert.doesNotMatch(JSON.stringify(result), /Authorized goal content|Authorized project instruction/);
  } finally {
    await sdk.close(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

for (const changed of ["project", "client"]) test(`context presentation rejects a replaced ${changed} instead of returning mixed context`, async () => {
  const connection = new RuntimeProjectConnection();
  const lifetime = new AbortController();
  const host = { homeDirectory: "/test-home", runtimeContext: { runtime_id: "fixture", stable_work_context_id: "session", host_declares_stable: true } };
  let resumeRead = false;
  const present = createMcpContextPresenter({ connection, contextSignal: () => lifetime.signal, createError: (code, message) => new ActionError(code, message),
    readGuidance: async () => { throw new ActionError("actions.forbidden", "Not granted"); },
    readSession: async () => {
      if (changed === "project") connection.accept({ projectId: "other", boardId: "other", databasePath: "/other.db", webBaseUrl: "http://127.0.0.1:4173" }, host.runtimeContext);
      else lifetime.abort();
      return { sessionRegistry: { status: "unavailable", message: "No Session", session: null }, sessionGoalId: null };
    }, readResumeFacts: async () => { resumeRead = true; return { goals: [] }; } });
  // The Catalog shape is irrelevant to this race; presentation reads only its resolved connection.
  await assert.rejects(present({ connection: { project_id: "first", board_id: "first", database_path: "/first.db" } } as never, host), { code: "mcp.context_changed" });
  assert.equal(resumeRead, false); assert.equal(connection.connection?.projectId, changed === "project" ? "other" : "first");
});
