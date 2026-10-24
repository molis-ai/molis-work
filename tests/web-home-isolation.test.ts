import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Server } from "node:http";
import { createEvidenceContentStore, createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference, projectActionAvailability, seedDemoBoard, DEMO_PROJECT_ID, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
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
    const feedPath = `/projects/${project.project_id}/api/feed`;
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
  const databases = homes.map((_, i) => join(root, `board-${i}.sqlite`));
  async function start(i: number) {
    const server = createMolisWorkWebServer({ homeDirectory: homes[i], databasePath: databases[i], projectId: DEMO_PROJECT_ID, controlToken });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return `http://127.0.0.1:${address.port}`;
  }
  try {
    databases.forEach((db) => seedDemoBoard(db));
    const defaultStore = createFileSecretStore();
    defaultStore.put(defaultOnlyRef, "default-home-only-0000");
    const urls = await Promise.all([start(0), start(1)]);
    const bound = async (url: string) => {
      const response = await fetch(`${url}/api/feed`);
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
  post: (path: string, body: unknown, headers?: Record<string, string>) => Promise<Response> }) => Promise<void>) => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-call-id-web-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "编号", actor_id: "test" });
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

test("W3-01 C a refused read on a page's own route answers with the number of its row, in the header and in the error body", { timeout: 60_000 }, async () => {
  await withRequestFixture(async ({ base, host, projectId }) => {
    // Feed's own route in a project that has no Feed: the person asked for it by name, so the host answers 403 and records it as not run.
    const response = await fetch(`${base}/api/feed`);
    assert.equal(response.status, 403);
    const id = response.headers.get("x-molis-work-call-id");
    assert.match(id ?? "", CALL_ID);
    const body = await response.json() as { call_id?: string; error?: string };
    assert.equal(typeof body.error, "string");
    assert.equal(body.call_id, id, "the body and the header carry the same number");
    const rows = host.callLog!.find(id!);
    assert.equal(rows.length, 1, "the number is one the call log can find");
    assert.equal(rows[0]!.project_id, projectId);
    assert.equal(rows[0]!.code, "actions.plugin_disabled");
    assert.equal(rows[0]!.refused, true);
  });
});

test("W3-01 C every request has a number of its own, and a number sent by the client is never taken", { timeout: 60_000 }, async () => {
  await withRequestFixture(async ({ base, host }) => {
    const forged = "11111111-2222-4333-8444-555555555555";
    const [first, second, third] = await Promise.all([fetch(`${base}/api/feed`), fetch(`${base}/api/feed`), fetch(`${base}/api/feed`, { headers: { "x-molis-work-call-id": forged } })]);
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
