import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

/**
 * The HTTP operations every Runtime plugin shares (restart, release-quarantine, upgrade, "not running", the view revision, then the
 * plugin's own route) live in one place, `apps/local-host/src/plugin-route-operations.ts`, so that the project's instance and the
 * Home-level instance (W3-06 F) answer them the same way. This pins their answers through the product's web server, with Coding
 * as the plugin, before and after the code moved out of the Coding surface into the project's entry (`project-plugin-http.ts`).
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const CODING = "io.molis.work.coding";

/** A project with Coding enabled whose install failed to start, behind the product's web server. */
async function withCrashedCoding(run: (api: {
  base: string;
  request: (url: string, method?: string, body?: unknown, authorized?: boolean) => Promise<Response>;
  repository: SqlitePluginRuntimeRepository;
  installId: string;
}) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-route-operations-"));
  const token = "plugin-route-operations-fixture-control-token";
  const server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = (url: string, method = "GET", body?: unknown, authorized = true) => fetch(origin + url, {
    method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      ...(authorized ? { "x-molis-work-control-token": token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let db: Database.Database | undefined;
  try {
    const created = await request("/api/settings/projects", "POST", { display_name: "Route operations", user_confirmed: true });
    assert.equal(created.status, 201);
    const projectId = (await created.json()).project.project_id;
    assert.equal((await request(`/api/settings/projects/${projectId}/plugins`, "POST", { plugin_id: "coding" })).status, 200);
    db = new Database(path.join(root, "projects", projectId, "molis-work.db"));
    const repository = new SqlitePluginRuntimeRepository(db);
    const current = createCodingPlugin();
    const failing = { ...current, async start(): Promise<never> { throw new Error("fixture startup failure"); },
      manifest: { ...current.manifest, version: "1.30.0", upgrade_compatibility: undefined } };
    const runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, maxRecoveryAttempts: 1 });
    const installed = runtime.install({ trust: { level: "host" }, definition: failing, deployment: "local", grants: failing.manifest.permissions.map(p => p.permission) }).install;
    await assert.rejects(runtime.start(installed.install_id), /Plugin entrypoint 启动失败/);
    await run({ base: `/projects/${projectId}`, request, repository, installId: installed.install_id });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db?.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("a plugin that is not running answers 503 with its own reason, a retry needs a POST, and the restart brings it back (route operations)", async () => {
  await withCrashedCoding(async ({ base, request, repository, installId }) => {
    const route = (operation: string) => `${base}/api/plugins/${CODING}/${operation}`;
    // The first request starts the project's platform; the plugin comes up crashed and says why.
    assert.match(await (await request(base)).text(), /Plugin 当前状态 crashed 不能直接启动/);
    for (const operation of ["state", "view-revision"]) {
      const notRunning = await request(route(operation));
      assert.equal(notRunning.status, 503, `${operation} while the plugin is not running`);
      assert.match((await notRunning.json()).error, /不能直接启动/);
    }
    for (const [operation, sentence] of [["restart", "重试必须通过 POST 确认"], ["release-quarantine", "重试必须通过 POST 确认"], ["upgrade", "升级必须通过 POST 确认"]]) {
      const refused = await request(route(operation));
      assert.equal(refused.status, 405, operation);
      assert.deepEqual(await refused.json(), { error: sentence });
    }
    assert.equal(repository.get(installId)!.state, "crashed", "a refused retry changes nothing");
    const restarted = await request(route("restart"), "POST", {});
    assert.equal(restarted.status, 200, await restarted.clone().text());
    assert.equal((await restarted.json()).state.status, "running");
    assert.equal(repository.get(installId)!.state, "running");
    // The Coding surface follows the restart: the page that showed the failure shows the plugin.
    const page = await (await request(base)).text();
    assert.doesNotMatch(page, /请检查插件状态后重新打开/);
    assert.match(page, /data-coding/);
    // The view revision is served only while the plugin runs, as a GET, uncached, and stays the same until the plugin says its view changed.
    const revision = await request(route("view-revision"));
    assert.equal(revision.status, 200);
    assert.equal(revision.headers.get("cache-control"), "no-store");
    const first = (await revision.json()).revision;
    assert.equal(typeof first, "string");
    assert.equal((await (await request(route("view-revision"))).json()).revision, first);
    // Only what a running plugin declared is dispatched; everything else falls through to the next handler.
    assert.equal((await request(route("view-revision"), "POST", {})).status, 404);
    assert.equal((await request(route("not-declared"))).status, 404);
    assert.equal((await request(`${base}/api/plugins/io.molis.work.not-installed/restart`, "POST", {})).status, 404);
  });
});

test("an upgrade that does not happen answers 409 with the supervisor's reason and code, and changes nothing (route operations)", async () => {
  await withCrashedCoding(async ({ base, request, repository, installId }) => {
    await request(base);
    const upgrade = `${base}/api/plugins/${CODING}/upgrade`;
    assert.equal((await request(upgrade, "POST", {}, false)).status, 403, "the control token comes first");
    const before = repository.get(installId)!;
    // The Host's own build is the only target a bundled plugin has, and a bundled plugin follows it when it is restarted rather than
    // when somebody asks for an upgrade, so this install's version is not below the build's: nothing to move up to.
    const refused = await request(upgrade, "POST", {});
    assert.equal(refused.status, 409);
    assert.deepEqual(await refused.json(), { error: "升级目标必须高于当前安装版本", code: "plugin.upgrade_required" });
    assert.equal(repository.get(installId)!.version, before.version);
    assert.equal(repository.get(installId)!.manifest_digest, before.manifest_digest);
  });
});

test("the shared route operations know no plugin: they are the only place that runs a restart, an upgrade or a view revision (route operations)", async () => {
  const shared = await readFile(path.join(repoRoot, "apps/local-host/src/plugin-route-operations.ts"), "utf8");
  assert.match(shared, /export async function dispatchRuntimePluginRoute\(/);
  // One implementation for the project's instance and the Home-level one: neither a plugin id nor a plugin package is written in it.
  assert.doesNotMatch(shared, /io\.molis\.work\./);
  assert.doesNotMatch(shared, /@molis-ai\/molis-work-plugin-(?!(?:runtime|sdk)\b)/);
  assert.doesNotMatch(shared, /@molis-ai\/molis-work-module-/);
  const entry = await readFile(path.join(repoRoot, "apps/local-host/src/project-plugin-http.ts"), "utf8");
  for (const operation of [/supervisor\.restart\(/, /platform\.upgrade\(/, /\.viewRevision\(/]) {
    assert.doesNotMatch(entry, operation, "the project's entry hands these to the shared operations");
    assert.match(shared, operation);
  }
});

test("PG037-01: the project's plugin entry names no plugin and takes no step of any plugin from its caller (route operations)", async () => {
  const entry = await readFile(path.join(repoRoot, "apps/local-host/src/project-plugin-http.ts"), "utf8");
  assert.match(entry, /export async function handleProjectPluginHttp\(/);
  assert.doesNotMatch(entry, /io\.molis\.work\./, "no plugin id is written in the entry");
  assert.doesNotMatch(entry, /@molis-ai\/molis-work-plugin-(?!(?:runtime|sdk)\b)/);
  assert.doesNotMatch(entry, /@molis-ai\/molis-work-module-/);
  assert.doesNotMatch(entry, /coding-surface|_PLUGIN_ID\b|hooks/, "no plugin-specific step is written in the entry or handed to it");
  assert.equal(existsSync(path.join(repoRoot, "apps/local-host/src/coding-surface.ts")), false, "the Coding surface is gone (RAC-433)");
  const routes = await readFile(path.join(repoRoot, "apps/local-host/src/web-project-platform-routes.ts"), "utf8");
  assert.match(routes, /handleProjectPluginHttp\(request, response, url, pluginPorts\)/);
  // Whether a plugin runs is read from the supervisor per plugin, not from one flag the Coding surface kept.
  const plugins = await readFile(path.join(repoRoot, "apps/local-host/src/project-plugins.ts"), "utf8");
  assert.doesNotMatch(plugins, /\brunning\??: boolean/);
  assert.doesNotMatch(plugins, /Coding 启动失败/);
});
