import { changeMcpClientCredential, partitionPluginScope, runningPluginPlatform } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import { MolisWorkLocalHost, molisWorkHostProjectReference, resolveWebControlToken, captureHostLog, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebCore } from "@molis-ai/molis-work-app-desktop";
import { issuesActions, ISSUES_PLUGIN_ID, type Issue } from "@molis-ai/molis-work-plugin-issues";
import { WORK_BRIEF_PLUGIN_ID, workBriefPersonalActions } from "@molis-ai/molis-work-plugin-work-brief";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openReadOnlyHomeSqlite } from "@molis-ai/molis-work-storage";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { PENDING, within } from "./fixtures/stopped-calls.js";
import { partitionInstallation } from "./fixtures/home-runtime.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { pluginDocuments } from "./fixtures/plugin-documents.js";

// Since batch 108 Issues runs in each partition it is added to (specs/unified-partition-plugins §4.2): its records are that partition's.
// The Home's own plugin runtime stays until 109-3; its lifecycle is checked here on the Home half of Work Brief.
const homeUser: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: ["work-brief:read", "work-brief:write"] };
const user = (projectId: string): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: ["issues:read", "issues:write"] });
const space = (home: string, projectId: string) => ({ project_id: projectId, reference: molisWorkHostProjectReference({ databasePath: join(home, `${projectId}.sqlite`), projectId }) });
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
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const directory = join(home, "plugin-runtime"), path = join(directory, "plugin-runtime.db");
  await mkdir(directory);
  const broken = new DatabaseSync(path); broken.exec("PRAGMA user_version=9"); broken.close();
  const original = await readFile(path);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), token = resolveWebControlToken({ homeDirectory: home });
  const server = createDesktopWebCore({ ptyClientFilePath: () => "" })({ homeDirectory: home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const retry = (authorized = true) => fetch(`${origin}/api/plugins/${WORK_BRIEF_PLUGIN_ID}/retry`, { method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: "{}" });
  try {
    // A Home route of a Home plugin answers the failure; it neither starts nor retries anything.
    const enable = () => fetch(`${origin}/api/plugins/${WORK_BRIEF_PLUGIN_ID}/enable`, { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token }, body: "{}" });
    const refused = await enable();
    assert.equal(refused.status, 503); await refused.text();
    assert.deepEqual(await readFile(path), original);
    assert.equal((await retry(false)).status, 403);
    assert.equal((await fetch(`${origin}/api/plugins/${WORK_BRIEF_PLUGIN_ID}/retry`)).status, 405);
    const failedRetry = host.homePlugins!.retry();
    assert.equal(host.homePlugins!.retry(), failedRetry, "concurrent retries share a failed attempt too");
    await assert.rejects(failedRetry, { code: "storage.store_too_new" });
    // Repair only the isolated fixture; the rejected original remains intact beside it.
    await rename(path, join(directory, "rejected.db"));
    await assert.rejects(host.homePlugins!.ready(), { code: "storage.store_too_new" });
    const again = await enable();
    assert.equal(again.status, 503, "ordinary requests do not silently restart"); await again.text();
    const retries = await Promise.all(Array.from({ length: 4 }, () => retry()));
    for (const response of retries) { assert.equal(response.status, 200, await response.clone().text()); await response.text(); }
    // Four concurrent retries install each Home plugin once (Work Brief's Home half, and every other Home plugin beside it).
    const installed = host.homePlugins!.installations().map(record => record.plugin_id);
    assert.deepEqual(installed.filter(id => id === WORK_BRIEF_PLUGIN_ID), [WORK_BRIEF_PLUGIN_ID]);
    assert.ok(!installed.includes(ISSUES_PLUGIN_ID), "Issues is no Home plugin");
    assert.equal(new Set(installed).size, installed.length, "no Home plugin is installed twice");
    const capabilities = await host.homeActionClient().discover(homeUser);
    assert.ok(capabilities.some(view => view.capability_id === workBriefPersonalActions.get.capability_id && view.availability.available));
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
  const server = createDesktopWebCore({ ptyClientFilePath: () => "" })({ homeDirectory: home });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, token = resolveWebControlToken({ homeDirectory: home });
    const response = await fetch(`${origin}/api/plugins/${WORK_BRIEF_PLUGIN_ID}/retry`, { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token }, body: "{}" });
    assert.equal(response.status, 200, await response.clone().text()); await response.text();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const db = openReadOnlyHomeSqlite(home, "plugin-runtime");
    try { assert.equal(new SqlitePluginRuntimeRepository(db).list().find(row => row.plugin_id === WORK_BRIEF_PLUGIN_ID)?.state, "installed"); }
    finally { db.close(); }
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try { await restarted.homeActionClient().discover(homeUser); assert.equal(restarted.homePlugins!.installation(WORK_BRIEF_PLUGIN_ID)!.state, "running"); }
    finally { await restarted.close(); }
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test("ISSUE-01 ISSUE-02 Issues starts once per project, keeps its records there and persists; a revoked run refuses writes", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "issue-runtime-")), a = space(home, "a"), b = space(home, "b");
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const catalogs = await Promise.all(Array.from({ length: 4 }, () => host.actionClient(a.reference).discover(user("a"))));
    for (const catalog of catalogs) {
      const own = catalog.filter(view => view.capability_id.startsWith("issues."));
      assert.equal(own.length, 9); assert.ok(own.every(view => view.availability.available && view.provider.plugin_id === ISSUES_PLUGIN_ID));
    }
    const { install } = await partitionInstallation(host, a, ISSUES_PLUGIN_ID);
    assert.notEqual(install.install_id, ISSUES_PLUGIN_ID);
    assert.ok(catalogs[0]!.filter(view => view.capability_id.startsWith("issues.")).every(view => view.provider.plugin_install_id === install.install_id),
      "providers name the installation that owns their grants, separately from the public plugin id");
    const saved = await host.actionClient(a.reference).invoke(user("a"), issuesActions.create, input) as Issue;
    assert.ok(existsSync(partitionPluginScope(home, "a", ISSUES_PLUGIN_ID, install.install_id).libraryPath("issues")), "the record is in project a's own library");
    await host.actionClient(b.reference).discover(user("b"));
    await assert.rejects(host.actionClient(b.reference).invoke(user("b"), issuesActions.read, { id: saved.id }), { code: "actions.missing" }, "project b has no such issue");
    await assert.rejects(host.actionClient(a.reference).invoke(user("a"), issuesActions.create, { ...input, submitter_id: "forged", entered_via: "mcp" }));
    await assert.rejects(host.actionClient(a.reference).invoke({ ...user("a"), permissions: [] }, issuesActions.create, input), { code: "actions.forbidden" });
    await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    assert.deepEqual(await host.actionClient(a.reference).invoke(user("a"), issuesActions.read, { id: saved.id }), saved);
    const cancelled = new AbortController(); cancelled.abort();
    const fresh = new AbortController();
    // The dispatcher preserves AbortSignal.reason; a fresh nested signal must not mask its parent's cancellation.
    await assert.rejects(bindActionClient(host.actionClient(a.reference), () => ({ ...user("a"), signal: cancelled.signal }))
      .invoke(issuesActions.create, input, { signal: fresh.signal, beforeEffect: async () => {} }), error => error === cancelled.signal.reason);
    assert.equal((await host.actionClient(a.reference).invoke(user("a"), issuesActions.list, {}) as { items: Issue[] }).items.length, 1);
    const running = await partitionInstallation(host, a, ISSUES_PLUGIN_ID);
    running.platform.supervisor.revoke(ISSUES_PLUGIN_ID); await running.platform.runtime.stop(running.install.install_id);
    await assert.rejects(host.actionClient(a.reference).invoke(user("a"), issuesActions.create, input));
    await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    await host.actionClient(a.reference).discover(user("a"));
    const platform = await host.withProject(a.reference, runtime => runningPluginPlatform(runtime.store, "a", ISSUES_PLUGIN_ID));
    assert.ok(platform);
    // A partition's instance is turned off for the person by taking Issues out of the project's plugin list (project-catalog UPP tests);
    // a revoke of the running instance lasts for that run, and the next start finds the same installation and the same records.
    assert.equal(platform.supervisor.state(ISSUES_PLUGIN_ID)?.status, "running");
    assert.deepEqual(await host.actionClient(a.reference).invoke(user("a"), issuesActions.read, { id: saved.id }), saved);
    assert.equal(platform.runtime.get(install.install_id).installation_generation, install.installation_generation);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("ISSUE-02 ISSUE-04 revoked installation cannot commit a queued write or keep an old route alive", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "issue-revoke-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), a = space(home, "a");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), logged: HostLogEntry[] = [], restore = captureHostLog(logged);
  try {
    await host.actionClient(a.reference).discover(user("a"));
    const { platform, install } = await partitionInstallation(host, a, ISSUES_PLUGIN_ID);
    const contribution = platform.runtime.contribution(install.install_id);
    assert.equal(contribution?.kind, "app");
    const oldRoute = contribution?.kind === "app" ? contribution.routes?.find(route => route.route_id === "issues.create") : undefined;
    const pending = host.actionClient(a.reference).invoke({ ...user("a"), validate_authority: async () => { entered.resolve(); await release.promise; } }, issuesActions.create, input);
    const refusal = assert.rejects(pending);
    await entered.promise;
    await platform.runtime.stop(install.install_id);
    platform.runtime.grant(install.install_id, ["issues:read", "storage:private"]); release.resolve(); await refusal;
    // BL-403: the Host routes requests to the running activation only. Held directly, the stopped activation's route is refused by
    // the Runtime with 403 before its handler runs, so nothing calls the refused client (no log line), and the list below shows the
    // write did not land.
    const answer = await within(oldRoute!.handle({ method: "POST", pathname: "/create", actor_id: LOCAL_PERSON_ACTOR_ID, params: {}, query: {}, body: input }));
    assert.notEqual(answer, PENDING);
    const { value } = answer as { value: { status: number; body: { code: string } } };
    assert.equal(value.status, 403);
    assert.equal(value.body.code, "actions.forbidden");
    assert.ok(!logged.some(entry => entry.event === "stopped_service_call" && entry.fields?.plugin_id === ISSUES_PLUGIN_ID
      && entry.fields.service === "actions" && entry.fields.method === "invoke"));
    platform.runtime.grant(install.install_id, ["issues:read", "issues:write", "storage:private"]); await platform.runtime.start(install.install_id);
    const list = await host.actionClient(a.reference).invoke(user("a"), issuesActions.list, {}) as { items: Issue[] };
    assert.equal(list.items.length, 0);
  } finally { restore(); release.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("ISSUE-03 ISSUE-06 ISSUE-07 ISSUE-09 real HTTP and an authorized MCP client share one project's records", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-entry-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const served = await serveTestHost(t, { home, host }), { origin, controlToken: token } = served, clientId = "runtime:issue-check";
  const project = await served.createProject("Issue 录入", ["issues"]), base = `/projects/${project.project_id}/api/plugins/${ISSUES_PLUGIN_ID}`;
  const request = (path: string, body?: unknown, authorized = true) => fetch(origin + path, { method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin, referer: `${origin}/projects/${project.project_id}`,
      ...(authorized ? { "x-molis-work-control-token": token } : {}), "x-molis-work-idempotency-key": randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const page = await request(`/projects/${project.project_id}`); assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(pluginDocuments(html).join(""), /data-issues="workbench"/u, "the Issue content is mounted in the isolated Host frame");
  assert.equal((await request(`${base}/create`, input, false)).status, 403);
  const image = attachedPng();
  assert.ok(image.data_url.length > 256_000);
  assert.equal((await request(`${base}/create`, {...input,supplement:"removed"})).status,400);
  assert.equal((await request(`${base}/create`, {...input,images:[{...image,data_url:"https://example.com/x.png"}]})).status,400);
  // S-03: authenticated input is bounded in bytes, including multibyte text.
  assert.equal((await request(`${base}/create`, {title:"界".repeat(4*1024*1024)})).status,413);
  assert.equal((await request(`${base}/list`)).status,200);
  const response = await request(`${base}/create`, {...input,images:[image]});
  assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json() as Issue;
  assert.deepEqual(saved.images,[image]); assert.equal("supplement" in saved.context,false);
  assert.equal(saved.entered_via, "manual"); assert.equal(saved.context.page?.url, `/projects/${project.project_id}`); assert.equal(saved.context.page?.provenance, "client_reported");
  const tooLargeDefault=await request("/api/settings/mcp/actions",{client_id:clientId,padding:"界".repeat(90000)});
  assert.ok(tooLargeDefault.status>=400); assert.match(await tooLargeDefault.text(),/请求内容过大/u);
  changeMcpClientCredential(home, clientId, "connect");
  const before = await served.mcp(clientId, project.project_id);
  assert.equal((await before.client.discover(before.caller)).filter(view => view.capability_id.startsWith("issues.")).length, 0);
  const granted = Object.values(issuesActions).filter(action => action.action.audiences.includes("mcp"));
  await served.grant(clientId, project.project_id, granted.map(action => ({ capability_id: action.capability_id, version: action.version })));
  const { client: mcp, caller } = await served.mcp(clientId, project.project_id);
  const created = await mcp.invoke(caller, issuesActions.create, { ...input, title: "MCP 录入", images:[image] }) as Issue;
  const mcpIssue = await host.actionClient(project.reference).invoke(user(project.project_id), issuesActions.read, { id: created.id }) as Issue;
  assert.deepEqual(created, mcpIssue); assert.deepEqual(mcpIssue.images,[image]);
  assert.equal(mcpIssue.submitter_id, LOCAL_PERSON_ACTOR_ID); assert.equal(mcpIssue.entered_via, "mcp"); assert.equal(mcpIssue.context.page, null);
  await mcp.invoke(caller, issuesActions.update, { id: saved.id, expected_version: 1, title: "MCP 修改" });
  const after = await (await request(`${base}/read?id=${saved.id}`)).json() as Issue;
  assert.equal(after.title, "MCP 修改"); assert.deepEqual(after.images,[image]);
  assert.equal((await request(`${base}/update`, { id: saved.id, expected_version: 1, title: "过期页面" })).status, 409);
  await mcp.invoke(caller, issuesActions.delete, { id: mcpIssue.id, expected_version: 1 });
  await served.revoke(clientId, project.project_id, [{ capability_id: issuesActions.create.capability_id, version: issuesActions.create.version }]);
  await assert.rejects(mcp.invoke(caller, issuesActions.create, input));
  const remaining = await request(`${base}/list`);
  assert.equal((await remaining.json()).items.length, 1);
});
