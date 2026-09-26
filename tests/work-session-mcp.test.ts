import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions, WORK_ACTION_PERMISSIONS, type WorkSessionDirectory, type PublicSessionContent } from "@molis-ai/molis-work-plugin-work";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { DesktopPanelService } from "../apps/desktop/src/panels.js";
import { createDesktopPanelTables, SqliteDesktopPanelRepository } from "../apps/desktop/src/adapters/sqlite-panels.js";
import { MolisWorkProjectCatalog } from "../apps/local-host/src/project-catalog.js";
import type { LocalWebCatalogRunner } from "../apps/local-host/src/web-project-settings.js";
import { projectActionAvailability } from "../apps/local-host/src/project-action-availability.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("formal MCP and Web share Session directory/content/resume and borrowed Host survives Web shutdown", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "work-formal-mcp-"));
  const project = await withCatalog({ homeDirectory: home }, async catalog => {
    const project = await catalog.createProject({ display_name: "Session MCP", actor_id: "owner" });
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" });
    return project;
  });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id, boardId: project.board_id });
  const requests: string[] = [];
  const withPolicyCatalog: LocalWebCatalogRunner = async (options, operation) => {
    const catalog = await MolisWorkProjectCatalog.open(options, { createPanelSchema: createDesktopPanelTables,
      createPanels: (db, ports) => new DesktopPanelService({ ...ports, repository: new SqliteDesktopPanelRepository(db) }) });
    try { return await operation(catalog); } finally { catalog.close(); }
  };
  const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: projectActionAvailability(withPolicyCatalog, home), runtimeSessionTransport: {
    async request(method, params) { requests.push(`${method}:${params.threadId}`); if (method === "turn/start") return { turn: { id: "confirmed-mcp-message" } }; return { thread: { id: params.threadId, turns: [] } }; },
    subscribe() { return () => undefined; },
  } });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const clientId = "runtime:work-client";
  const context = { runtime_id: "work-client", stable_work_context_id: "work-context", host_declares_stable: true };
  const sdk = new Client({ name: "untrusted-name", version: "1" });
  let closed = false;
  try {
    const resources = await host.sessionResources();
    const session = resources.registry.explicitlyLinkSession({ runtime_id: "codex", native_runtime_session_id: "exact-native-thread", project_id: project.project_id,
      title: "共享目录中的会话", current_goal_id: null, actor_id: "owner", user_confirmed: true });
    const other = resources.registry.explicitlyLinkSession({ runtime_id: "codex", native_runtime_session_id: "foreign-thread", project_id: "foreign-project", actor_id: "owner", user_confirmed: true });
    resources.registry.appendEvent({ session_id: session.session_id, source: "molis_work", kind: "user_message", source_id: "message", content: "ONE-OWNER-CONTENT" });
    await withCatalog({ homeDirectory: home }, catalog => catalog.bindRuntimeContext({ context, project_id: project.project_id, actor_id: "owner", user_confirmed: true }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, prefix = `${origin}/projects/${project.project_id}`;
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: context.runtime_id,
      MOLIS_WORK_WORK_CONTEXT_ID: context.stable_work_context_id, MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    }, stderr: "pipe" });
    let stderr = ""; transport.stderr?.on("data", chunk => { stderr += String(chunk); });
    await sdk.connect(transport).catch(error => { throw new Error(String(error) + stderr); });
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === hostActionToolName(workActions.directory)), false);
    const directory = await host.inspectActions({ actor_id: clientId, project_id: project.project_id, audience: "mcp", permissions: [] }, reference);
    for (const action of Object.values(workActions)) {
      const view = directory.find(view => view.capability_id === action.capability_id)!; assert.ok(view);
      await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, view, true));
    }
    assert.ok((await sdk.listTools()).tools.some(tool => tool.name === hostActionToolName(workActions.directory)));
    const call = async (action: { capability_id: string; version: number }, input: Record<string, unknown>) => {
      const result = await sdk.callTool({ name: hostActionToolName(action), arguments: input });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    };
    const facts = await call(workActions.directory, {}) as WorkSessionDirectory;
    assert.ok(facts.records.some(row => row.session.session_id === session.session_id));
    assert.ok(!facts.records.some(row => row.session.session_id === other.session_id));
    assert.ok(facts.records.every(row => row.session.project_id === project.project_id));
    assert.equal(facts.records.find(row => row.session.session_id === session.session_id)!.event_count, 1);
    const page = await fetch(`${prefix}/`); assert.equal(page.status, 200);
    assert.ok((await page.text()).includes("共享目录中的会话"));
    const content = await call(workActions.content, { session_id: session.session_id }) as PublicSessionContent;
    const web = await fetch(`${prefix}/api/sessions/${session.session_id}/content`); assert.equal(web.status, 200);
    assert.deepEqual(await web.json(), content);
    assert.equal(content.events[0]!.content, "ONE-OWNER-CONTENT");
    assert.equal((await call(workActions.resume, { session_id: session.session_id })).status, "ok");
    assert.equal((await sdk.callTool({ name: hostActionToolName(workActions.content), arguments: { session_id: other.session_id } })).isError, true);
    assert.ok(!requests.some(value => value.includes("foreign-thread"))); assert.ok(requests.includes("thread/resume:exact-native-thread"));
    const messageInput = { session_id: session.session_id, expected_goal_id: null, idempotency_key: "formal-message", text: "MCP-REAL-DELIVERY" };
    const sent = await call(workActions.messageSend, messageInput);
    assert.equal(sent.state, "accepted"); assert.equal(sent.native_turn_id, "confirmed-mcp-message");
    assert.equal((await call(workActions.messageRead, { request_id: sent.request_id })).text, messageInput.text);
    await call(workActions.messageSend, messageInput); await call(workActions.messageRetry, { request_id: sent.request_id });
    assert.equal(requests.filter(request => request === "turn/start:exact-native-thread").length, 1);
    const timeline = await (await fetch(`${prefix}/api/sessions/${session.session_id}/content`)).json() as PublicSessionContent;
    assert.equal(timeline.events.filter(event => event.content === messageInput.text).length, 1);
    const webMessageUrl = `${prefix}/api/sessions/${session.session_id}/messages`;
    const webSend = (key: string, text: string) => fetch(webMessageUrl, { method: "POST", headers: { origin,
      "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": key },
      body: JSON.stringify({ expected_goal_id: null, idempotency_key: "web-message-1", text }) });
    const webSentResponse = await webSend("http-message-1", "WEB-REAL-DELIVERY");
    assert.equal(webSentResponse.status, 200, await webSentResponse.clone().text());
    const webSent = await webSentResponse.json() as { request_id: string; state: string };
    assert.equal(webSent.state, "accepted");
    assert.equal((await webSend("http-message-2", "WEB-REAL-DELIVERY")).status, 200);
    assert.equal((await webSend("http-message-conflict", "changed content")).status, 409);
    const webReceipt = await fetch(`${prefix}/api/session-messages/${webSent.request_id}`); assert.equal(webReceipt.status, 200);
    assert.equal((await webReceipt.json() as { state: string }).state, "accepted");
    assert.equal((await sdk.callTool({ name: hostActionToolName(workActions.messageRead), arguments: { request_id: webSent.request_id } })).isError, true, "MCP cannot read another actor's private request");
    assert.equal(requests.filter(request => request === "turn/start:exact-native-thread").length, 2);
    const grant = directory.find(view => view.capability_id === workActions.content.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, grant, false));
    assert.equal((await sdk.callTool({ name: hostActionToolName(workActions.content), arguments: { session_id: session.session_id } })).isError, true);
    await withCatalog({ homeDirectory: home }, catalog => catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" }));
    assert.equal((await sdk.callTool({ name: hostActionToolName(workActions.directory), arguments: {} })).isError, true);
    const disabledPage = await fetch(`${prefix}/`); assert.equal(disabledPage.status, 200);
    assert.ok(!(await disabledPage.text()).includes("共享目录中的会话"));
    await withCatalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" }));
    assert.ok((await call(workActions.directory, {})).records.some((row: WorkSessionDirectory["records"][number]) => row.session.session_id === session.session_id));
    await sdk.close();
    await new Promise<void>(resolve => server.close(() => resolve())); closed = true;
    assert.equal(await host.sessionResources(), resources);
    const listed = await bindActionClient(host.actionClient(reference), () => ({ actor_id: "owner", project_id: project.project_id, audience: "user", permissions: WORK_ACTION_PERMISSIONS })).invoke(workActions.list, {});
    assert.ok(listed.sessions.some(row => row.session_id === session.session_id));
    assert.ok(listed.sessions.every(row => row.project_id === project.project_id));
  } finally {
    await sdk.close();
    if (!closed) await new Promise<void>(resolve => server.close(() => resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});
