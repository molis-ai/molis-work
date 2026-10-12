import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference, resolveWebControlToken, LocalActionGatewayClient } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebHost, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { actionMcpToolName } from "@molis-ai/molis-work-app-mcp";
import { issuesActions, ISSUES_PLUGIN_ID, type Issue } from "@molis-ai/molis-work-plugin-issues";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openReadOnlyHomeSqlite } from "@molis-ai/molis-work-storage";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";

const user: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: ["issues:read", "issues:write"] };
const input = { title: "跨入口记录", type: "bug", description: "  点击后没有反馈\n再次点击才出现。\n" };

// A valid PNG with a text chunk, large enough to exercise the real HTTP/MCP body path.
function attachedPng() {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
  const data = Buffer.from("Comment\0" + "capture context ".repeat(20000)), chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length); chunk.write("tEXt",4); data.copy(chunk,8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4,-4)),chunk.length-4);
  return {name:"screen.png",data_url:"data:image/png;base64,"+Buffer.concat([png.subarray(0,-12),chunk,png.subarray(-12)]).toString("base64")};
}

test("ISSUE-01 failed Home initialization preserves its database and only explicit concurrent retries recover it", async () => {
  const home = await mkdtemp(join(tmpdir(), "issue-start-retry-"));
  const directory = join(home, "plugin-runtime"), path = join(directory, "plugin-runtime.db");
  await mkdir(directory);
  const broken = new DatabaseSync(path); broken.exec("PRAGMA user_version=9"); broken.close();
  const original = await readFile(path);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), token = resolveWebControlToken({ homeDirectory: home });
  const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const retry = (authorized = true) => fetch(`${origin}/api/plugins/${ISSUES_PLUGIN_ID}/retry`, { method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: "{}" });
  try {
    const page = await fetch(`${origin}/plugins/issues`);
    assert.equal(page.status, 503); assert.match(await page.text(), /data-home-lifecycle="retry"/u);
    assert.deepEqual(await readFile(path), original);
    assert.equal((await retry(false)).status, 403);
    assert.equal((await fetch(`${origin}/api/plugins/${ISSUES_PLUGIN_ID}/retry`)).status, 405);
    const failedRetry = host.homePlugins!.retry();
    assert.equal(host.homePlugins!.retry(), failedRetry, "concurrent retries share a failed attempt too");
    await assert.rejects(failedRetry, { code: "storage.schema_version_mismatch" });
    // Repair only the isolated fixture; the rejected original remains intact beside it.
    await rename(path, join(directory, "rejected.db"));
    await assert.rejects(host.homePlugins!.ready(), { code: "storage.schema_version_mismatch" });
    assert.equal((await fetch(`${origin}/plugins/issues`)).status, 503, "ordinary reads do not silently restart");
    const retries = await Promise.all(Array.from({ length: 4 }, () => retry()));
    for (const response of retries) { assert.equal(response.status, 200, await response.clone().text()); await response.text(); }
    assert.equal(host.homePlugins!.installations().length, 1);
    const capabilities = await host.homeActionClient().discover(user);
    assert.equal(capabilities.filter(action => action.capability_id.startsWith("issues.")).length, 9);
    const saved = await host.homeActionClient().invoke(user, issuesActions.create, input) as Issue;
    assert.deepEqual(await host.homeActionClient().invoke(user, issuesActions.read, { id: saved.id }), saved);
    assert.deepEqual(await readFile(join(directory, "rejected.db")), original);
    await host.close();
    await assert.rejects(host.homePlugins!.retry(), { code: "actions.plugin_unavailable" });
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

test("ISSUE-01 ISSUE-05 owned web server close persists Home plugin shutdown before its callback", async () => {
  const home = await mkdtemp(join(tmpdir(), "issue-owned-close-"));
  const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/plugins/issues`);
    assert.equal(response.status, 200); await response.text();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const db = openReadOnlyHomeSqlite(home, "plugin-runtime");
    try { assert.equal(new SqlitePluginRuntimeRepository(db).list().find(row => row.plugin_id === ISSUES_PLUGIN_ID)?.state, "installed"); }
    finally { db.close(); }
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try { await restarted.homeActionClient().discover(user); assert.equal(restarted.homePlugins!.installation(ISSUES_PLUGIN_ID)!.state, "running"); }
    finally { await restarted.close(); }
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test("ISSUE-01 ISSUE-02 Home discovery starts once, crosses projects, persists, and keeps explicit disablement", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "issue-runtime-"));
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const catalogs = await Promise.all(Array.from({ length: 4 }, () => host.homeActionClient().discover(user)));
    for (const catalog of catalogs) {
      const own = catalog.filter(view => view.capability_id.startsWith("issues."));
      assert.equal(own.length, 9); assert.ok(own.every(view => view.availability.available && view.provider.provider_id === ISSUES_PLUGIN_ID && !view.provider.project_id));
    }
    assert.equal(host.homePlugins!.installations().filter(row => row.plugin_id === ISSUES_PLUGIN_ID).length, 1);
    const installation = host.homePlugins!.installation(ISSUES_PLUGIN_ID)!;
    assert.notEqual(installation.install_id, ISSUES_PLUGIN_ID);
    assert.ok(catalogs[0].filter(view => view.capability_id.startsWith("issues.")).every(view => view.provider.plugin_install_id === installation.install_id),
      "Home providers name the installation that owns their grants, separately from the public plugin id");
    const saved = await host.homeActionClient().invoke(user, issuesActions.create, input) as Issue;
    const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Issue 范围核对", actor_id: LOCAL_PERSON_ACTOR_ID }));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const fromProject = await host.actionClient(reference).invoke({ ...user, project_id: reference.project_id }, issuesActions.read, { id: saved.id });
    assert.deepEqual(fromProject, saved);
    await assert.rejects(host.homeActionClient().invoke(user, issuesActions.create, { ...input, submitter_id: "forged", entered_via: "mcp" }));
    await assert.rejects(host.homeActionClient().invoke({ ...user, permissions: [] }, issuesActions.create, input), { code: "actions.forbidden" });
    await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    assert.deepEqual(await host.homeActionClient().invoke(user, issuesActions.read, { id: saved.id }), saved);
    const cancelled = new AbortController(); cancelled.abort();
    const fresh = new AbortController();
    // The dispatcher preserves AbortSignal.reason; a fresh nested signal must not mask its parent's cancellation.
    await assert.rejects(bindActionClient(host.homeActionClient(), () => ({ ...user, signal: cancelled.signal }))
      .invoke(issuesActions.create, input, { signal: fresh.signal, beforeEffect: async () => {} }), error => error === cancelled.signal.reason);
    assert.equal((await host.homeActionClient().invoke(user, issuesActions.list, {}) as { items: Issue[] }).items.length, 1);
    const platform = await host.homePlugins!.ready();
    platform.supervisor.revoke(ISSUES_PLUGIN_ID); await platform.runtime.stop(installation.install_id);
    await assert.rejects(host.homeActionClient().invoke(user, issuesActions.create, input));
    await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    await host.homeActionClient().discover(user);
    assert.equal(host.homePlugins!.installation(ISSUES_PLUGIN_ID)!.state, "disabled");
    const resumed = await host.homePlugins!.ready(); await resumed.supervisor.enable(ISSUES_PLUGIN_ID);
    assert.deepEqual(await host.homeActionClient().invoke(user, issuesActions.read, { id: saved.id }), saved);
    assert.equal(host.homePlugins!.installation(ISSUES_PLUGIN_ID)!.installation_generation, installation.installation_generation);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("ISSUE-02 ISSUE-04 revoked installation cannot commit a queued write or keep an old route alive", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "issue-revoke-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  try {
    const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(ISSUES_PLUGIN_ID)!;
    const contribution = platform.runtime.contribution(install.install_id);
    assert.equal(contribution?.kind, "app");
    const oldRoute = contribution?.kind === "app" ? contribution.routes?.find(route => route.route_id === "issues.create") : undefined;
    const pending = host.homeActionClient().invoke({ ...user, validate_authority: async () => { entered.resolve(); await release.promise; } }, issuesActions.create, input);
    const refusal = assert.rejects(pending);
    await entered.promise;
    await platform.runtime.stop(install.install_id);
    platform.runtime.grant(install.install_id, ["issues:read", "storage:private"]); release.resolve(); await refusal;
    const stale = await oldRoute!.handle({ method: "POST", pathname: "/create", actor_id: LOCAL_PERSON_ACTOR_ID, params: {}, query: {}, body: input });
    assert.notEqual(stale.status, 200);
    platform.runtime.grant(install.install_id, ["issues:read", "issues:write", "storage:private"]); await platform.runtime.start(install.install_id);
    const list = await host.homeActionClient().invoke(user, issuesActions.list, {}) as { items: Issue[] };
    assert.equal(list.items.length, 0);
  } finally { release.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("ISSUE-03 ISSUE-06 ISSUE-07 ISSUE-09 real HTTP and authorized MCP process share Home records without a project", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "issue-entry-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`, clientId = "runtime:issue-check";
  const request = (path: string, body?: unknown, authorized = true) => fetch(origin + path, { method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin, referer: `${origin}/plugins/issues`,
      ...(authorized ? { "x-molis-work-control-token": token } : {}), "x-molis-work-idempotency-key": randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const sdk = new Client({ name: "Issue integration", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))],
    env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_RUNTIME_ID: "issue-check", MOLIS_WORK_WEB_URL: origin,
      MOLIS_WORK_WORK_CONTEXT_ID: "issue-home-check", MOLIS_WORK_WORK_CONTEXT_STABLE: "true" }, stderr: "pipe" });
  try {
    const page = await request("/plugins/issues"); assert.equal(page.status, 200); assert.match(await page.text(), /data-issues="workbench"/u);
    assert.equal((await withCatalog({ homeDirectory: home }, catalog => catalog.listProjects())).length, 0);
    assert.equal((await request(`/api/plugins/${ISSUES_PLUGIN_ID}/create`, input, false)).status, 403);
    const image = attachedPng();
    assert.ok(image.data_url.length > 256_000);
    assert.equal((await request(`/api/plugins/${ISSUES_PLUGIN_ID}/create`, {...input,supplement:"removed"})).status,400);
    assert.equal((await request(`/api/plugins/${ISSUES_PLUGIN_ID}/create`, {...input,images:[{...image,data_url:"https://example.com/x.png"}]})).status,400);
    // S-03: authenticated Home input is bounded in bytes, including multibyte text.
    assert.equal((await request(`/api/plugins/${ISSUES_PLUGIN_ID}/create`, {title:"界".repeat(4*1024*1024)})).status,413);
    assert.equal((await request(`/api/plugins/${ISSUES_PLUGIN_ID}/list`)).status,200);
    const response = await request(`/api/plugins/${ISSUES_PLUGIN_ID}/create`, {...input,images:[image]});
    assert.equal(response.status, 200, await response.clone().text());
    const saved = await response.json() as Issue;
    assert.deepEqual(saved.images,[image]); assert.equal("supplement" in saved.context,false);
    assert.equal(saved.entered_via, "manual"); assert.equal(saved.context.page?.url, "/plugins/issues"); assert.equal(saved.context.page?.provenance, "client_reported");
    const tooLargeDefault=await request("/api/settings/mcp/actions",{client_id:clientId,padding:"界".repeat(90000)});
    assert.ok(tooLargeDefault.status>=400); assert.match(await tooLargeDefault.text(),/请求内容过大/u);
    const gateway = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId, projectId: null });
    const external: ActionCallContext = { actor_id: clientId, project_id: null, audience: "mcp", permissions: [] };
    assert.equal((await gateway.discover(external)).filter(view => view.capability_id.startsWith("issues.")).length, 0);
    for (const action of Object.values(issuesActions).filter(action => action.action.audiences.includes("mcp"))) {
      const grant = await request("/api/settings/mcp/actions", { client_id: clientId, project_id: null, capability_id: action.capability_id, version: action.version, provider_id: ISSUES_PLUGIN_ID, enabled: true });
      assert.equal(grant.status, 200, await grant.clone().text());
    }
    await sdk.connect(transport);
    const name = (action: { capability_id: string; version: number }) => actionMcpToolName({ ...action, capability_id: `molis_work_v1_action_${action.capability_id}`, provider_id: ISSUES_PLUGIN_ID });
    assert.ok((await sdk.listTools()).tools.some(tool => tool.name === name(issuesActions.create)));
    const created = await sdk.callTool({ name: name(issuesActions.create), arguments: { ...input, title: "MCP 录入", images:[image] } });
    assert.equal(created.isError, false, JSON.stringify(created));
    const mcpIssue = await host.homeActionClient().invoke(user, issuesActions.read, { id: created.structuredContent?.id }) as Issue;
    assert.deepEqual(created.structuredContent, mcpIssue); assert.deepEqual(mcpIssue.images,[image]);
    assert.equal(mcpIssue.submitter_id, LOCAL_PERSON_ACTOR_ID); assert.equal(mcpIssue.entered_via, "mcp"); assert.equal(mcpIssue.context.page, null);
    const updated = await sdk.callTool({ name: name(issuesActions.update), arguments: { id: saved.id, expected_version: 1, title: "MCP 修改" } });
    assert.equal(updated.isError, false, JSON.stringify(updated));
    const read = await request(`/api/plugins/${ISSUES_PLUGIN_ID}/read?id=${saved.id}`);
    const after = await read.json() as Issue;
    assert.equal(after.title, "MCP 修改"); assert.deepEqual(after.images,[image]);
    assert.equal((await request(`/api/plugins/${ISSUES_PLUGIN_ID}/update`, { id: saved.id, expected_version: 1, title: "过期页面" })).status, 409);
    const deleted = await sdk.callTool({ name: name(issuesActions.delete), arguments: { id: mcpIssue.id, expected_version: 1 } });
    assert.equal(deleted.isError, false, JSON.stringify(deleted));
    await request("/api/settings/mcp/actions", { client_id: clientId, project_id: null, capability_id: "issues.create", version: issuesActions.create.version, provider_id: ISSUES_PLUGIN_ID, enabled: false });
    assert.equal((await sdk.callTool({ name: name(issuesActions.create), arguments: input })).isError, true);
    const remaining = await request(`/api/plugins/${ISSUES_PLUGIN_ID}/list`);
    assert.equal((await remaining.json()).items.length, 1);
  } finally {
    await sdk.close(); await transport.close(); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});
