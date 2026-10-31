import assert from "node:assert/strict";
import test from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPrologueNodeAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { createExternalMcpDirectory } from "../apps/local-host/dist/external-mcp-actions.js";
import { EXTERNAL_MCP_PERMISSION, isMcpToolCapability } from "../apps/local-host/dist/mcp-tool-actions.js";
import { authorizeMcpActions } from "../apps/local-host/dist/mcp-action-client.js";
import { actionErrorFromResponse, actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { formatMcpToolError } from "@molis-ai/molis-work-app-mcp";
import { serveTestHost } from "./fixtures/test-home.js";

// PA-MCP-01: actual Molis registration and dispatch retain annotated tools and the existing effect boundaries.
test("real Prologue HTTP dispatch rechecks persisted action grants after DNS preparation, preserves cancellation and recovers", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "external-mcp-dispatch-"));
  const notes: string[] = [];
  const dispatched = Promise.withResolvers<void>();
  let gateDns = false;
  let entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const lookup = dns.lookup;
  // Delay a real DNS result in the actual Node adapter, after discovery and the
  // tool runner's entry check. No SDK deep import or alternative dispatch path.
  t.mock.method(dns, "lookup", async (...args: Parameters<typeof lookup>) => {
    const result = await lookup(...args);
    if (args[0] === "localhost" && gateDns) { gateDns = false; entered.resolve(); await release.promise; }
    return result;
  });
  syncBuiltinESMExports();
  const server = createServer(async (request, response) => {
    if (request.method === "DELETE") { response.writeHead(204).end(); return; }
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part));
    const message = JSON.parse(Buffer.concat(parts).toString());
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result: unknown;
    if (message.method === "initialize") result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "dispatch-test", version: "1" } };
    else if (message.method === "tools/list") {
      result = { tools: [{ name: "write_note", inputSchema: { type: "object", properties: { note: { type: "string", default: "not injected", "x-mcp-header": "note" } }, required: ["note"], additionalProperties: false } }] };
    } else if (message.method === "tools/call") {
      notes.push(message.params.arguments.note);
      if (message.params.arguments.note === "已经发出") { dispatched.resolve(); return; }
      result = { content: [{ type: "text", text: "Saved: " + message.params.arguments.note }] };
    } else { response.writeHead(400).end(); return; }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  // The grants are made the way a person makes them, through the access settings of the served Home. The calls stay in process: they pass their own
  // signal, and this file asserts what the server does when it fires, which a gateway call (a closed connection to the server) cannot show.
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const served = await serveTestHost(t, { home, host });
  const project = await served.createProject("MCP 最终派发");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.mcp-dispatch", appVersion: "1.0.0" }, reviewQueue: new AgentReviewQueue(),
    storageRoot: join(home, "runtime"), modelConfiguration: async () => null, resolveCredential: () => null });
  const reference = project.reference;
  const directory = createExternalMcpDirectory({ localHost: host, homeDirectory: home });
  try {
    const owner = { project_id: project.project_id, plugin_id: "io.molis.work.coding" }, library = adapter.mcpLibrary!;
    const saved = await library.save(owner, { expected_version: 0, label: "写笔记", transport: "http", enabled: true, timeout_ms: 5000,
      endpoint: `http://localhost:${address.port}/mcp`, auth: { kind: "none" } });
    await library.control(owner, saved.id, "connect");
    await host.withProject(reference, runtime => directory.sync(runtime, "prologue", library, owner));
    const user: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [EXTERNAL_MCP_PERMISSION] };
    const view = (await host.actionClient(reference).discover(user)).find(row => isMcpToolCapability(row.capability_id) && row.action.title === "write_note")!;
    assert.ok(view?.availability.available);
    const ref = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    const caller: ActionCallContext = { actor_id: "client-x", project_id: project.project_id, audience: "mcp", permissions: [] };
    const setGrant = async (enabled: boolean) => { await (enabled ? served.grant : served.revoke)(caller.actor_id, project.project_id, [view]); };
    await setGrant(true);
    let granted = await authorizeMcpActions(host, caller, home, reference);
    gateDns = true;
    const denied = assert.rejects(granted.service.invoke(granted.context, ref, { note: "已经撤权" }), { code: "EFFECT_NOT_AUTHORIZED" });
    await Promise.race([entered.promise, denied.then(() => { throw new Error("Call settled before DNS preparation gate"); })]);
    await setGrant(false); release.resolve(); await denied;
    assert.deepEqual(notes, [], "the actual remote write was never dispatched");

    await setGrant(true); granted = await authorizeMcpActions(host, caller, home, reference);
    assert.deepEqual(await granted.service.invoke(granted.context, ref, { note: "恢复授权" }), { text: "Saved: 恢复授权", truncated: false });
    assert.deepEqual(notes, ["恢复授权"]);

    entered = Promise.withResolvers<void>(); release = Promise.withResolvers<void>(); gateDns = true;
    const abort = new AbortController();
    const cancelled = await authorizeMcpActions(host, { ...caller, signal: abort.signal }, home, reference);
    const stopped = assert.rejects(cancelled.service.invoke(cancelled.context, ref, { note: "已经取消" }), { code: "CANCELLED" });
    await Promise.race([entered.promise, stopped.then(() => { throw new Error("Call settled before DNS preparation gate"); })]);
    abort.abort(); release.resolve(); await stopped;
    assert.deepEqual(notes, ["恢复授权"], "cancellation during preparation sends no tool call");
    assert.deepEqual(await granted.service.invoke(granted.context, ref, { note: "取消后仍可调用" }), { text: "Saved: 取消后仍可调用", truncated: false });
    assert.deepEqual(notes, ["恢复授权", "取消后仍可调用"]);

    // Cancellation after the server has written cannot claim nothing happened.
    // It must end the in-flight transport promptly and retain the uncertain result.
    const lateAbort = new AbortController();
    const sent = await authorizeMcpActions(host, { ...caller, signal: lateAbort.signal }, home, reference);
    const unknown = assert.rejects(sent.service.invoke(sent.context, ref, { note: "已经发出" }), { code: "EFFECT_RECONCILE_REQUIRED" });
    await Promise.race([dispatched.promise, unknown.then(() => { throw new Error("Call settled before remote write"); })]);
    lateAbort.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([unknown, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Cancellation did not stop transport before its 5-second timeout")), 2000);
    })]); } finally { clearTimeout(timer); }
    assert.deepEqual(notes, ["恢复授权", "取消后仍可调用", "已经发出"], "already committed remote content is not rolled back or retried");
  } finally {
    gateDns = false; release.resolve();
    t.mock.restoreAll(); syncBuiltinESMExports();
    await served.close(); directory.close(); await host.close(); await adapter.close();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

// RAC-2670 RAC-2671 RAC-2672: a scene's or a background task's permission that an MCP client does not hold (any more) is refused as a
// refusal (kind `forbidden`) at each of the checks that ask for one, so a reader that tells refusals from failures does not need this code;
// across the MCP process hop it reads back as forbidden (403, by the plugin SDK's one table); the tool result the client reads is unchanged.
// The fourth check, a retained background task whose permission was withdrawn, is in tests/mcp-effect-authority.test.ts (ACA005-03/07).
test("RAC-2670 RAC-2671 RAC-2672 a permission an MCP client does not hold is refused with mcp.permission_revoked of kind forbidden, wherever it is checked", async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-permission-kind-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const caller: ActionCallContext = { actor_id: "client-permission-kind", project_id: null, audience: "mcp", permissions: [] };
  // No settings file (`home` not given): the client holds no grant, so no permission. The last argument turns the background check on.
  const { context } = await authorizeMcpActions(host, caller, undefined, undefined, undefined, undefined, () => undefined);
  const missing = ["fixture:write"];
  const refusedBy = async (attempt: () => unknown): Promise<unknown> => {
    try { await attempt(); } catch (error) { return error; }
    return assert.fail("a permission the client does not hold must be refused");
  };
  const checks: Array<[string, unknown]> = [
    ["validate_permissions", await refusedBy(() => context.validate_permissions!(missing))],
    ["assert_authority_current", await refusedBy(() => context.assert_authority_current!(undefined, missing))],
    ["retain_background_authority", await refusedBy(() => context.retain_background_authority!([], missing))],
  ];
  for (const [where, refusal] of checks) {
    assert.ok(refusal instanceof ActionError, where);
    assert.deepEqual([refusal.code, refusal.kind], ["mcp.permission_revoked", "forbidden"], where);
    const { status, body } = actionErrorResponse(refusal);
    assert.equal(status, 403, `${where}: the status comes from the kind, by the one table in the plugin SDK`);
    const received = actionErrorFromResponse(status, body);
    assert.deepEqual([received.code, received.kind, received.message], ["mcp.permission_revoked", "forbidden", refusal.message], `${where}: the MCP process reads the same refusal back`);
    const before = new ActionError("mcp.permission_revoked", refusal.message);
    assert.equal(formatMcpToolError(refusal), formatMcpToolError(before), `${where}: the tool result is what it was`);
    assert.equal(formatMcpToolError(refusal, "call-1"), formatMcpToolError(before, "call-1"), where);
    assert.deepEqual(JSON.parse(formatMcpToolError(refusal)), { error: refusal.message, code: "mcp.permission_revoked" }, where);
  }
});
