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
import { projectGuidanceActions } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { serveTestHost } from "./fixtures/test-home.js";

test("official MCP connection summaries obey live action grants, preserve binding and never read offline local content", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-context-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Connection A", actor_id: "user" }));
  const second = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Connection B", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const seen = new Set<string>();
  let disabled = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (caller, action) => {
    if (caller.audience === "mcp" && [goalsActions.resumeSummary.capability_id, projectGuidanceActions.read.capability_id].includes(action.capability_id)) {
      seen.add(caller.actor_id + ":" + action.capability_id);
      if (disabled) return { available: false, code: "actions.plugin_disabled", reason: "Goals temporarily unavailable" };
    }
    return { available: true };
  } });
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "user", actor_kind: "user", project_id: project.project_id,
    audience: "user", permissions: ["goals:read", "goals:write", "projects:guidance-read", "projects:guidance"] }));
  // The Host's own web server: the access settings the grants go through, and the action service the MCP launcher reaches.
  const served = await serveTestHost(t, { home, host });
  const withHostCatalog = host.configurePersonalPlanning(home, withCatalog);
  const origin = served.origin;
  const sdk = new Client({ name: "untrusted-client-label", version: "1" });
  const runtimeContext = { runtime_id: "context-actions", stable_work_context_id: "context-actions-session", host_declares_stable: true };
  try {
    await actions.invoke(goalsActions.create, { goal_id: "CONTEXT-SECRET", title: "Authorized goal content", idempotency_key: "create-context" });
    await actions.invoke(projectGuidanceActions.add, { kind: "constraint", content: "Authorized project instruction", reason: "Fixture",
      confirmation_summary: "Exact instruction confirmed", user_confirmed: true, idempotency_key: "guidance-context" });
    await withHostCatalog({ homeDirectory: home }, c => c.bindRuntimeContext({ context: runtimeContext, project_id: project.project_id, actor_id: "user", user_confirmed: true }));
    const bindingsBefore = await withHostCatalog({ homeDirectory: home }, c => c.listRuntimeContextBindings());
    const cursorBefore = await host.withProject(ref, r => r.store.eventCursor(project.project_id));
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
    // Batch 44 C7: the resume is each granted plugin's own summary, by section; an ungranted summary is not in the directory, so there is no section.
    const none = { sections: [] };
    const goalsFocus = (value: { resume: { sections: Array<{ plugin_id: string; focus?: { subject: { id: string } } }> } }) =>
      value.resume.sections.find(section => section.plugin_id === "io.molis.work.goals")?.focus?.subject.id;
    assert.equal(result.project_guidance, null); assert.equal(result.runtime_prompt_prefix, null); assert.deepEqual(result.resume, none);
    assert.ok(result.project_guidance_error.code); assert.equal(result.resume_error, undefined);
    assert.doesNotMatch(JSON.stringify(result), /Authorized goal content|Authorized project instruction/);
    const caller = { actor_id: "runtime:context-actions", audience: "mcp" as const, project_id: project.project_id, permissions: [] };
    const views = await host.inspectActions(caller, ref);
    const grant = async (capabilityId: string, enabled: boolean) => {
      const view = views.find(row => row.capability_id === capabilityId)!;
      if (enabled) await served.grant(caller.actor_id, project.project_id, [view]); else await served.revoke(caller.actor_id, project.project_id, [view]);
      // Saving a grant asks the policy about the client too; what the later assertions read is what the connection summary asked.
      seen.clear();
    };
    await grant(projectGuidanceActions.read.capability_id, true);
    result = await resolve();
    assert.match(result.runtime_prompt_prefix, /Authorized project instruction/); assert.equal(result.project_guidance_error, undefined);
    assert.deepEqual(result.resume, none, "Goals' directory alone does not answer for its resume summary");
    await grant(goalsActions.resumeSummary.capability_id, true);
    result = await resolve();
    assert.equal(goalsFocus(result), "CONTEXT-SECRET"); assert.equal(result.resume_error, undefined);
    assert.ok(seen.has(caller.actor_id + ":" + goalsActions.resumeSummary.capability_id));
    await grant(projectGuidanceActions.read.capability_id, false);
    result = await resolve();
    assert.equal(result.project_guidance, null); assert.equal(result.runtime_prompt_prefix, null); assert.ok(result.project_guidance_error);
    assert.equal(goalsFocus(result), "CONTEXT-SECRET");
    disabled = true;
    result = await resolve();
    assert.equal(result.status, "bound"); assert.deepEqual(result.resume, none, "an unavailable summary has no section");
    assert.doesNotMatch(JSON.stringify(result), /CONTEXT-SECRET|Authorized goal content/);
    disabled = false;
    assert.deepEqual(await withHostCatalog({ homeDirectory: home }, c => c.listRuntimeContextBindings()), bindingsBefore);
    assert.equal(await host.withProject(ref, r => r.store.eventCursor(project.project_id)), cursorBefore, "read-only recovery never claims work or rewrites project facts");
    result = await contextCall("molis_work_v1_context_bind", { project_id: second.project_id,
      user_confirmed: true, rebind_confirmed: true });
    assert.equal(result.connection.project_id, second.project_id); assert.deepEqual(result.resume, none);
    assert.doesNotMatch(JSON.stringify(result), /CONTEXT-SECRET|Authorized goal content/);
    result = await contextCall("molis_work_v1_context_create_and_bind", { display_name: "New ungranted project",
      user_confirmed: true, rebind_confirmed: true, idempotency_key: "new-context-project" });
    assert.equal(result.status, "bound"); assert.notEqual(result.connection.project_id, project.project_id);
    assert.equal(result.project_guidance, null); assert.deepEqual(result.resume, none);
    await contextCall("molis_work_v1_context_bind", { project_id: project.project_id,
      user_confirmed: true, rebind_confirmed: true });
    await grant(projectGuidanceActions.read.capability_id, true);
    const offlineBindings = await withHostCatalog({ homeDirectory: home }, c => c.listRuntimeContextBindings());
    await served.close();
    const offline = await sdk.callTool({ name: "molis_work_v1_context_resolve", arguments: {} });
    assert.equal(offline.isError, true, JSON.stringify(offline));
    // RAC-105-A-GW-03: production context stays on the resident-only path when that Host is unavailable.
    // C5 (w5-16 step 5) first tries this Home's installed launcher; a test Home has none, so the answer is that install error, never a local read.
    assert.match(JSON.stringify(offline), /mcp\.startup_entry_missing/);
    assert.doesNotMatch(JSON.stringify(offline), /Authorized goal content|Authorized project instruction/);
    assert.deepEqual(await withHostCatalog({ homeDirectory: home }, c => c.listRuntimeContextBindings()), offlineBindings,
      "RAC-105-A-09: the offline call does not resolve or rewrite a local binding");
  } finally {
    await sdk.close(); await served.close();
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

for (const changed of ["project", "client"]) test(`context presentation rejects a replaced ${changed} instead of returning mixed context`, async () => {
  const connection = new RuntimeProjectConnection();
  const lifetime = new AbortController();
  const host = { homeDirectory: "/test-home", runtimeContext: { runtime_id: "fixture", stable_work_context_id: "session", host_declares_stable: true } };
  let resumeRead = false;
  const present = createMcpContextPresenter({ connection, contextSignal: () => lifetime.signal, createError: (code, message) => new ActionError(code, message),
    readGuidance: async () => {
      if (changed === "project") connection.accept({ projectId: "other", databasePath: "/other.db", webBaseUrl: "http://127.0.0.1:4173" }, host.runtimeContext);
      else lifetime.abort();
      throw new ActionError("actions.forbidden", "Not granted");
    }, readResumeSections: async () => { resumeRead = true; return []; } });
  // The Catalog shape is irrelevant to this race; presentation reads only its resolved connection.
  await assert.rejects(present({ connection: { project_id: "first", database_path: "/first.db" } } as never, host), { code: "mcp.context_changed" });
  assert.equal(resumeRead, false); assert.equal(connection.connection?.projectId, changed === "project" ? "other" : "first");
});
