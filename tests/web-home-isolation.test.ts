import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Server } from "node:http";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { createFeedEvidenceContentStore } from "@molis-ai/molis-work-module-feed";
import { seedDemoBoard, DEMO_PROJECT_ID, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const controlToken = "home-isolation-test-control-token-0123456789";
/** A secret in the default Home's store; no other Home may read or replace it. */
const defaultOnlyRef = "connector:github:client_id";

test("Web resolves environment Home once for Catalog, Sessions, control token and Feed", async (t) => {
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
    assert.ok(existsSync(join(envHome, "sessions/sessions.db")));
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
      const content = createFeedEvidenceContentStore();
      await waitForOtherHome;
      secrets.put(authRef, "a-first");
      const body = content.write("body belonging to A");
      return { secrets, content, body };
    });
    const b = runWithMolisWorkHome(join(root, "b"), () => {
      const secrets = createFileSecretStore();
      secrets.put(authRef, "b-only");
      release();
      return { secrets, content: createFeedEvidenceContentStore() };
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
