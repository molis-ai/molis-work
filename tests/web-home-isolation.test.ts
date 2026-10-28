import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Server } from "node:http";
import { createEvidenceContentStore, createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference, projectActionAvailability, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { feedItemActions } from "@molis-ai/molis-work-plugin-feed";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const controlToken = "home-isolation-test-control-token-0123456789";
/** A secret in the default Home's store; no other Home may read or replace it. */
const defaultOnlyRef = "connector:github:client_id";

test("RAC-212: Web resolves environment Home once for Catalog, control token and Feed without creating the retired Sessions database", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "molis-work-web-env-home-"));
  const envHome = join(root, "configured");
  const defaultHome = join(root, "default-user");
  const originalEnv = { ...process.env };
  t.mock.method(os, "homedir", () => defaultHome);
  Object.assign(process.env, { MOLIS_WORK_HOME: envHome, MOLIS_WORK_SECRET_BACKEND: "file", NODE_ENV: "test" });
  delete process.env.MOLIS_WORK_GITHUB_TOKEN;
  delete process.env.MOLIS_WORK_GMAIL_ACCESS_TOKEN;
  let server: Server | undefined;
  try {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: envHome });
    const { project } = await catalog.ensureDemoProject({ actor_id: "env-home-test", user_confirmed: true });
    catalog.close();
    const start = async () => {
      server = createMolisWorkWebServer();
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
      const address = server!.address();
      assert.ok(address && typeof address === "object");
      return `http://127.0.0.1:${address.port}`;
    };
    let origin = await start();
    const feedPath = `/projects/${project.project_id}/api/plugins/io.molis.work.feed/snapshot`;
    let response = await fetch(origin + feedPath);
    assert.equal(response.status, 200, await response.text());
    const token = readFileSync(join(envHome, "config/web-control-token"), "utf8").trim();
    response = await fetch(origin + "/api/settings/connectors/connections", {
      method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "env-home-synthetic-bind" },
      body: JSON.stringify({ service_id: "github", display_name: "Env Home GitHub", token: "synthetic-env-home-token-cccc" }),
    });
    assert.equal(response.status, 201, await response.text());
    assert.ok(existsSync(join(envHome, "connectors/connectors.db")));
    assert.equal(existsSync(join(envHome, "sessions/sessions.db")), false, "First startup must not create the retired Sessions database");
    assert.ok(existsSync(join(envHome, "feed/secrets.json")));
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    resetSecretStoreCache();
    origin = await start();
    response = await fetch(origin + feedPath);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).connector_auth.github.bound, true);
    response = await fetch(origin + "/api/settings/connectors/connections?service_id=github", { headers: { "x-molis-work-control-token": token } });
    assert.deepEqual((await response.json()).connections.map((row: { display_name: string }) => row.display_name), ["Env Home GitHub"]);
    assert.equal(readFileSync(join(envHome, "config/web-control-token"), "utf8").trim(), token);
    assert.equal(existsSync(join(envHome, "sessions/sessions.db")), false, "Service recreation must not create the retired Sessions database");
    assert.equal(existsSync(defaultHome), false, "No service resource may fall back to the default user Home");
  } finally {
    if (server?.listening) await new Promise<void>(resolve => server!.close(() => resolve()));
    resetSecretStoreCache();
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit Web homes read only their own connections and survive service recreation", async () => {
  const root = mkdtempSync(join(tmpdir(), "molis-work-web-homes-"));
  const originalEnv = { ...process.env };
  const servers: Server[] = [];
  Object.assign(process.env, {
    MOLIS_WORK_HOME: join(root, "default"), MOLIS_WORK_SECRET_BACKEND: "file",
    NODE_ENV: "test",
  });
  delete process.env.MOLIS_WORK_GITHUB_TOKEN;
  delete process.env.MOLIS_WORK_GMAIL_ACCESS_TOKEN;
  const homes = [join(root, "a"), join(root, "b")];
  // Each Home has its own catalog project with Feed: Feed's routes are that project's Runtime plugin's (FI-7), under its prefix.
  const projects: string[] = [];
  async function start(i: number) {
    const server = createMolisWorkWebServer({ homeDirectory: homes[i], controlToken });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return `http://127.0.0.1:${address.port}/projects/${encodeURIComponent(projects[i]!)}`;
  }
  try {
    for (const home of homes) {
      const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
      try {
        const { project_id } = await catalog.createProject({ display_name: "连接", actor_id: "test" });
        if (!catalog.listProjectPlugins(project_id).includes("feed")) catalog.addProjectPlugin({ project_id, plugin_id: "feed", actor_id: "test" });
        projects.push(project_id);
      } finally { catalog.close(); }
    }
    const defaultStore = createFileSecretStore();
    defaultStore.put(defaultOnlyRef, "default-home-only-0000");
    const urls = await Promise.all([start(0), start(1)]);
    const bound = async (url: string) => {
      const response = await fetch(`${url}/api/plugins/io.molis.work.feed/snapshot`);
      assert.equal(response.status, 200);
      return (await response.json()).connector_auth.github.bound;
    };
    const read = () => homes.map(home => withConnectorConnections(home, store => store.list("github").map(row => row.display_name)));
    assert.deepEqual(await Promise.all(urls.map(bound)), [false, false]);
    homes.forEach((home, i) => withConnectorConnections(home, store => store.createToken({
      serviceId: "github", displayName: `Home ${i === 0 ? "A" : "B"}`, token: `synthetic-home-token-${i === 0 ? "aaaa" : "bbbb"}` })));
    assert.deepEqual(read(), [["Home A"], ["Home B"]]);
    assert.deepEqual(await Promise.all(urls.map(bound)), [true, true]);
    assert.equal(defaultStore.get(defaultOnlyRef), "default-home-only-0000");
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve, reject) => s.close((e) => e ? reject(e) : resolve()))));
    resetSecretStoreCache();
    const restarted = await Promise.all([start(0), start(1)]);
    assert.deepEqual(await Promise.all(restarted.map(bound)), [true, true]);
    assert.deepEqual(read(), [["Home A"], ["Home B"]]);
  } finally {
    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
    resetSecretStoreCache();
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    rmSync(root, { recursive: true, force: true });
  }
});

test("async home scopes and retained stores keep secrets and body keys in their creation home", async () => {
  const root = mkdtempSync(join(tmpdir(), "molis-work-storage-homes-"));
  const authRef = "fixture:home-scoped-secret";
  const oldBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  let release!: () => void;
  const waitForOtherHome = new Promise<void>((resolve) => { release = resolve; });
  try {
    const pending = runWithMolisWorkHome(join(root, "a"), async () => {
      const secrets = createFileSecretStore();
      const content = createEvidenceContentStore();
      await waitForOtherHome;
      secrets.put(authRef, "a-first");
      const body = content.write("body belonging to A");
      return { secrets, content, body };
    });
    const b = runWithMolisWorkHome(join(root, "b"), () => {
      const secrets = createFileSecretStore();
      secrets.put(authRef, "b-only");
      release();
      return { secrets, content: createEvidenceContentStore() };
    });
    const a = await pending;
    runWithMolisWorkHome(join(root, "b"), () => a.secrets.put(authRef, "a-updated"));
    assert.equal(a.secrets.get(authRef), "a-updated");
    assert.equal(b.secrets.get(authRef), "b-only");
    assert.equal(a.content.read(a.body.contentRef), "body belonging to A");
    assert.equal(b.content.has(a.body.contentRef), false);
    resetSecretStoreCache();
    assert.equal(runWithMolisWorkHome(join(root, "a"), () => createFileSecretStore().get(authRef)), "a-updated");
    assert.equal(runWithMolisWorkHome(join(root, "b"), () => createFileSecretStore().get(authRef)), "b-only");
  } finally {
    resetSecretStoreCache();
    if (oldBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = oldBackend;
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * W3-01 C. A request to the web server is one operation with one number. The answer shows the number (header `x-molis-work-call-id`,
 * and `call_id` in an error body) only when the call log holds a row for it, so the number a person copies can always be looked up.
 */
const CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const withRequestFixture = async (run: (fixture: { base: string; host: MolisWorkLocalHost; projectId: string; goals: BoundActionClient;
  post: (path: string, body: unknown, headers?: Record<string, string>) => Promise<Response> }) => Promise<void>, plugins: readonly string[] = []) => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-call-id-web-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "编号", actor_id: "test" });
  for (const plugin_id of plugins) if (!catalog.listProjectPlugins(created.project_id).includes(plugin_id)) catalog.addProjectPlugin({ project_id: created.project_id, plugin_id, actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  // The policy the desktop gives its Host: a plugin the project has not installed answers "not enabled" (a refused call, so a row).
  const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: projectActionAvailability(async (_, work) => work(catalog), home) });
  const controlToken = "call-id-web-test-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}/projects/${project.project_id}`;
    const origin = `http://127.0.0.1:${address.port}`;
    const goals = bindActionClient(host.actionClient(reference), () => ({ actor_id: "web-user", project_id: project.project_id, audience: "user" as const, permissions: ["goals:read", "goals:write"] }));
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, { method: "POST",
      headers: { "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": `call-id-${randomUUID()}`, ...headers },
      body: JSON.stringify(body) });
    await run({ base, host, projectId: project.project_id, goals, post });
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); catalog.close(); rmSync(home, { recursive: true, force: true });
  }
};

test("W3-01 C a read on a page's own route that fails answers with the number of its row; one refused at the door carries none", { timeout: 60_000 }, async () => {
  await withRequestFixture(async ({ base, host, projectId }) => {
    // The project has no confirmed workspace: the read runs, fails, and leaves its row, so its number is one the call log can find.
    const response = await fetch(`${base}/api/project-references/no-such`);
    assert.equal(response.status, 409);
    const id = response.headers.get("x-molis-work-call-id");
    assert.match(id ?? "", CALL_ID);
    const body = await response.json() as { call_id?: string; error?: string };
    assert.equal(typeof body.error, "string");
    assert.equal(body.call_id, id, "the body and the header carry the same number");
    const rows = host.callLog!.find(id!);
    assert.equal(rows.length, 1, "the number is one the call log can find");
    assert.equal(rows[0]!.project_id, projectId);
    assert.equal(rows[0]!.code, "artifacts.workspace_unconfirmed");
    // Feed's own route and stage in a project that has no Feed are refused at the door (FI-7: the Runtime's route, the shell's stage):
    // no call ran, so no row, and the answer names no number.
    for (const path of ["/api/plugins/io.molis.work.feed/snapshot", "/api/stage/feed"]) {
      const refused = await fetch(base + path);
      assert.equal(refused.status, 403, path);
      assert.equal(refused.headers.get("x-molis-work-call-id"), null, path);
      const refusal = await refused.json() as { code?: string; call_id?: string };
      assert.equal(refusal.code, "actions.plugin_disabled", path);
      assert.equal(Object.hasOwn(refusal, "call_id"), false, path);
    }
  });
});

test("W3-01 C a plugin's route the door let through, whose call is refused before it runs, leaves a row and answers with its number", { timeout: 60_000 }, async () => {
  await withRequestFixture(async ({ host, projectId, post }) => {
    // Feed is in this project, so its route passes the door and calls Feed's own action as the person; the item id is longer than that
    // action takes, so the call is refused before its handler: a row marked not run, whose number the answer shows.
    const refused = await post(`/api/plugins/io.molis.work.feed/items/${"x".repeat(201)}/read`, {});
    assert.equal(refused.status, 400);
    const id = refused.headers.get("x-molis-work-call-id");
    assert.match(id ?? "", CALL_ID);
    const body = await refused.json() as { code?: string; call_id?: string };
    assert.equal(body.code, "actions.input_invalid");
    assert.equal(body.call_id, id, "the body and the header carry the same number");
    const rows = host.callLog!.find(id!);
    const feedRows = rows.filter(row => row.capability_id === feedItemActions.read.capability_id);
    assert.equal(feedRows.length, 1, "the number finds the refused call");
    assert.equal(feedRows[0]!.project_id, projectId);
    assert.equal(feedRows[0]!.refused, true, "marked as not run");
    assert.equal(feedRows[0]!.code, "actions.input_invalid");
    // A plugin route also has the Host read the folder the project browses (BL-521, `announceProjectOpened`), under the same request;
    // this bare Host has no project settings, so that read is missing, leaves its own row and is tried again on the next route.
    assert.deepEqual(rows.filter(row => !feedRows.includes(row)).map(row => [row.capability_id, row.code]),
      rows.length === 1 ? [] : [[projectSettingsCapabilities.browsingWorkspace.capability_id, "actions.missing"]]);
  }, ["feed", "inbox"]);
});

test("W3-01 C every request has a number of its own, and a number sent by the client is never taken", { timeout: 60_000 }, async () => {
  await withRequestFixture(async ({ base, host }) => {
    const forged = "11111111-2222-4333-8444-555555555555";
    const read = `${base}/api/project-references/no-such`;
    const [first, second, third] = await Promise.all([fetch(read), fetch(read), fetch(read, { headers: { "x-molis-work-call-id": forged } })]);
    const ids = [first, second, third].map(response => response.headers.get("x-molis-work-call-id"));
    for (const id of ids) assert.match(id ?? "", CALL_ID);
    assert.equal(new Set(ids).size, 3, "three requests, three numbers, even when they run at the same time");
    assert.notEqual(ids[2], forged);
    assert.deepEqual(host.callLog!.find(forged), [], "the host never used the number the client sent");
    for (const id of ids) assert.equal(host.callLog!.find(id!).length, 1, id!);
  });
});

test("W3-01 C a command of a page, whether it ends well or not, shows its number in the header, and an error body shows it too", { timeout: 60_000 }, async () => {
  await withRequestFixture(async ({ base, host, goals, post }) => {
    await goals.invoke(goalsActions.create, { goal_id: "G1", title: "一个目标", idempotency_key: "create-g1" });
    const failed = await post("/api/goals/NOPE/archive", { archived: true, reason: "没有这个目标" });
    assert.equal(failed.status, 400);
    const failedId = failed.headers.get("x-molis-work-call-id");
    assert.match(failedId ?? "", CALL_ID);
    assert.equal((await failed.json() as { call_id?: string }).call_id, failedId);
    const failedRow = host.callLog!.find(failedId!)[0];
    assert.equal(failedRow?.capability_id, goalsActions.archive.capability_id);
    assert.equal(failedRow?.ok, false);
    const done = await post("/api/goals/G1/active", { reason: "先做这个" });
    assert.equal(done.status, 200);
    const doneId = done.headers.get("x-molis-work-call-id");
    assert.match(doneId ?? "", CALL_ID);
    assert.notEqual(doneId, failedId);
    assert.equal("call_id" in (await done.json() as object), false, "a success keeps its body as it was");
    const doneRow = host.callLog!.find(doneId!)[0];
    assert.equal(doneRow?.capability_id, goalsActions.active.capability_id);
    assert.equal(doneRow?.ok, true);
  });
});

test("W3-01 C a request that left no row shows no number: a read that worked and then a 404, and a refusal at the door", { timeout: 60_000 }, async () => {
  await withRequestFixture(async ({ base, host, goals, post }) => {
    await goals.invoke(goalsActions.create, { goal_id: "G1", title: "一个目标", idempotency_key: "create-g1" });
    await post("/api/goals/G1/active", { reason: "先做这个" });
    const rowsBefore = host.callLog!.recent(100).length;
    // The page reads the Goal, then the route itself finds it is a current Goal and not one in the trash: a 404 that no call produced.
    const notThere = await fetch(`${base}/trash/goals/G1`);
    assert.equal(notThere.status, 404);
    assert.equal(notThere.headers.get("x-molis-work-call-id"), null);
    const notThereBody = await notThere.json() as object;
    assert.equal("call_id" in notThereBody, false);
    // No control token: refused before any route, and before any call.
    const refused = await post("/api/goals/G1/active", { reason: "x" }, { "x-molis-work-control-token": "wrong" });
    assert.equal(refused.status, 403);
    assert.equal(refused.headers.get("x-molis-work-call-id"), null);
    assert.equal("call_id" in (await refused.json() as object), false);
    assert.equal(host.callLog!.recent(100).length, rowsBefore, "neither left a row");
  });
});
