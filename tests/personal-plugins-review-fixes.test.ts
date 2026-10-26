import { ActionError as ContractsError } from "@molis-ai/molis-work-contracts/platform/actions";
import * as goalsPluginExports from "@molis-ai/molis-work-plugin-goals";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { servePages } from "./fixtures/pages-runtime.js";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { handleFunctionsHttp, seedSceneRules } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  BUILTIN_PLUGIN_CATALOG,
  OWN_DIRECTORY_SURFACES,
  islandEntries,
  railEntries,
} from "@molis-ai/molis-work-app-workbench";
import {
  DEMO_PROJECT_ID,
} from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { UI_VIEW_SLOTS } from "@molis-ai/molis-work-contracts/platform/ui";
import { SYSTEM_HOME_DOCK_FUNCTION_KEY } from "@molis-ai/molis-work-contracts/modules/functions";
import { createFunctionsService, type TypeSafeProvider } from "@molis-ai/molis-work-module-functions";
import {
  datasetManifest,
} from "@molis-ai/molis-work-plugin-dataset";
import { FORM_CLIENT_FACTORY_SCRIPT, formManifest } from "@molis-ai/molis-work-plugin-form";
import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/dist/functions/client.js";
import { lingguangManifest } from "@molis-ai/molis-work-plugin-lingguang";
import {
  PAGES_CLIENT_FACTORY_SCRIPT,
  pagesActions,
  pagesManifest,
} from "@molis-ai/molis-work-plugin-pages";
import { pptManifest, renderPptWorkbench } from "@molis-ai/molis-work-plugin-ppt";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { homeStores, hostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { rewriteNativePluginApiPath } from "../apps/local-host/dist/native-plugin-api.js";
import { MolisWorkUninstallService } from "../apps/local-host/dist/installer/uninstall.js";
import { RuntimeIntegrationService } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkWebServiceManager } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { BUILTIN_PLUGIN_WORKBENCH } from "../apps/workbench/dist/plugin-workbench.js";
import { ensureProjectPlugins, releaseProjectPlugins } from "../apps/local-host/dist/project-plugins.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { HOME_DOCK } from "./fixtures/home-dock-scene.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  // The real path: the Home snapshot refuses a Home reached through a link (macOS puts tmpdir() under /var -> /private/var).
  const home = await realpath(await mkdtemp(join(tmpdir(), "molis-work-review-fixes-")));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function listenDispatcher(
  home: string,
): Promise<{ origin: string; close(): Promise<void> }> {
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env: {} } });
  const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: "test", project_id: null, audience: "user", permissions: ["functions:manage", "functions:invoke"] }));
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    void handleFunctionsHttp(request, response, url, home, { actions }).then((handled) => {
      if (!handled && !response.headersSent) {
        response.writeHead(404);
        response.end();
      }
    }).catch((error: unknown) => {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: String(error) }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("dispatcher 没有端口");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await host.close(); },
  };
}

// W4-11: the Home's one store registry. The pinned list is what a Home holds today; a new store is added here on purpose.
test("Home 存储登记列出全部个人库、讨论库 server/ 和 Home 里的其余数据", () => {
  assert.deepEqual(homeStores().stores.map(store => store.path).sort(), ["projects", "logs", "backups", "sessions", "shelf", "plugin-runtime", "plugin-libraries", "assistant",
    "placement", "agent-definitions", "agent-declarations", "connectors", "runtime", "context-onboarding", "alchemist", "plugin-originals", "plugin-directories", "functions", "characters", "memory", "search", "knowledge", "feed", "server",
    "issues", "cognia", "images", "jelly", "lingguang", "todo", "pages", "form", "dataset", "ppt", "workflows", "artifacts", "agent-runtime", "runtime-config-backups",
    "runtime-integrations", "runtime-integration-attempts", "browser", "plugin-builder", "plugin-files", "cache", "git-operation-details.json", "config/onboarding.json",
    "config/project-arrival.json", "config/mcp-tools.json", "config/external-mcp-tools.json", "config/connector-mcp-tools.json", "directory-access"].sort());
});

test("uninstall --purge 会把登记的每个 Home 存储列入删除并真正删掉", async () => {
  await withHome(async (home) => {
    // The person's own home is outside the Home: an entry the Home does not own stops the purge (FIX19).
    const userHome = await mkdtemp(join(tmpdir(), "molis-work-review-fixes-user-"));
    // Each registered store, written the way its owner writes it: a library file, a file, or a directory with something in it.
    const written = homeStores().stores.map(store => store.library ? homeStores().libraryPath(home, store)
      : /\.json$/u.test(store.path) ? join(home, ...store.path.split("/")) : join(home, store.path, "kept"));
    for (const file of written) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, "personal-store\n");
    }
    // The ledger of installed plugins' libraries is read at purge to name them (PG-022 P1b), so it is a real one, with a library in it.
    const ledger = homeStores().get("plugin-libraries")!;
    await rm(homeStores().libraryPath(home, ledger));
    const ledgerDb = new DatabaseSync(homeStores().libraryPath(home, ledger));
    ledgerDb.exec(ledger.library!.baseline.schema);
    ledgerDb.exec(`PRAGMA user_version = ${ledger.library!.baseline.version}`);
    ledgerDb.prepare("INSERT INTO plugin_home_libraries VALUES (?, ?, ?, 1, ?, ?)").run("example.installed", "signature", "installed-notes", "0".repeat(64), "2026-10-24T00:00:00.000Z");
    ledgerDb.close();
    const installedLibrary = join(home, "installed-notes");
    await mkdir(installedLibrary, { recursive: true });
    await writeFile(join(installedLibrary, "installed-notes.db"), "an installed plugin's rows\n");
    written.push(join(installedLibrary, "installed-notes.db"));
    const service = new MolisWorkUninstallService({
      homeDirectory: home,
      projects: {
        inspect: async () => ({ projects: [], conflict: null }),
        removeDemos: async () => {},
      },
      runtimeIntegrationService: new RuntimeIntegrationService({
        homeDirectory: home,
        userHomeDirectory: userHome,
        runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
      }),
      webServiceManager: new MolisWorkWebServiceManager({
        homeDirectory: home,
        userHomeDirectory: userHome,
        platform: "linux",
      }),
    });
    const plan = await service.prepare({ purge_user_data: true });
    assert.equal(plan.status, "ready", plan.conflicts.join(" | ") || plan.message);
    for (const store of homeStores().stores) {
      assert.ok(
        plan.changes.some((change) => change.target === join(home, ...store.path.split("/"))),
        `purge 计划要包含 ${store.path}`,
      );
    }
    assert.ok(plan.changes.some((change) => change.target === installedLibrary), "purge 计划要包含装进来的插件的库");
    const result = await service.confirm({
      plan_id: plan.plan_id,
      decision: "confirmed",
      purge_confirmation: { home_directory: plan.home_directory, user_project_count: plan.user_project_count },
    });
    assert.equal(result.status, "purged");
    for (const file of written) await assert.rejects(stat(file), file);
    await rm(userHome, { recursive: true, force: true });
  });
});

test("Schedule、Sources 和 Coding 都有自己的目录面", () => {
  assert.equal(OWN_DIRECTORY_SURFACES.includes("schedule"), true);
  assert.equal(OWN_DIRECTORY_SURFACES.includes("sources"), true);
  assert.equal(OWN_DIRECTORY_SURFACES.includes("coding"), true);
});

test("灵光在岛上，不在侧栏轨；Manifest 声明 island 槽", () => {
  assert.equal(UI_VIEW_SLOTS.includes("island"), true);
  parsePluginManifest(lingguangManifest);
  // #901 (PRR-12) put the stage view first; a view is placed by its slot, not its position in the list.
  assert.equal(lingguangManifest.ui.views?.find((view) => view.view_id === "island")?.slot, "island");
  const enabled = ["goals", "lingguang", "pages"] as const;
  assert.equal(railEntries([...enabled]).some((entry) => entry.id === "lingguang"), false);
  assert.deepEqual(islandEntries([...enabled]).map((entry) => entry.id), ["lingguang"]);
});

test("个人插件 Manifest 声明 storage:private，Pages 另有 artifact:write", () => {
  for (const manifest of [
    pagesManifest,
    formManifest,
    datasetManifest,
    pptManifest,
    lingguangManifest,
  ]) {
    parsePluginManifest(manifest);
    assert.ok(manifest.permissions.some((item) => item.permission === "storage:private"), manifest.plugin_id);
  }
  assert.ok(pagesManifest.permissions.some((item) => item.permission === "artifact:write"));
});

test("客户端使用当前插件路径，保留的 Host 适配按合同改写", () => {
  // The `/api/plugins/<plugin id>` short-name alias bridge is gone (W6-01/PG-058); only the functions adapter remains.
  // Form and Pages keep their Manifest routes, so the removed short names leave their paths untouched.
  assert.equal(rewriteNativePluginApiPath("/api/plugins/io.molis.work.form"), "/api/plugins/io.molis.work.form");
  assert.equal(rewriteNativePluginApiPath("/api/plugins/pages/abc/promote"), "/api/plugins/pages/abc/promote");
  // The functions adapter is the one retained rewrite (W6-01).
  assert.equal(rewriteNativePluginApiPath("/api/plugins/functions"), "/api/functions");
  assert.equal(rewriteNativePluginApiPath("/api/plugins/io.molis.work.functions/items"), "/api/functions/items");
  // Shelf's Home half is a Home Runtime instance (PG-026 S2): its routes are served under its own id, with no short native path.
  assert.equal(rewriteNativePluginApiPath("/api/plugins/io.molis.work.shelf/file"), "/api/plugins/io.molis.work.shelf/file");
  assert.equal(rewriteNativePluginApiPath("/api/pages/abc"), "/api/pages/abc");
  assert.equal(rewriteNativePluginApiPath("/api/plugins/unknown/x"), "/api/plugins/unknown/x");
  // W5-01-PAGES-02: the Runtime client uses its Manifest route, including the resource path.
  // RAC-158: Pages' page names its routes under the plugin ("/pages") and asks the shared host for the full path.
  assert.match(readFileSync(fileURLToPath(new URL("../plugins/native/pages/src/browser/request.ts", import.meta.url)), "utf8"), /host\.pluginRoute\("\/pages" \+ tail\)/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /\.pluginRoute\("\/pages"/);
  assert.ok(pagesManifest.routes?.some(route => route.method === "GET" && route.path === "/pages"), "and the Manifest declares that collection route");
  // RAC-132: Forms uses the Manifest route supplied by the shared client host (W4-04): its page calls the routes its Manifest declares, under the project, with no short path to rewrite to.
  assert.match(readFileSync(fileURLToPath(new URL("../plugins/native/form/src/browser/request.ts", import.meta.url)), "utf8"), /host\.pluginRoute\("\/forms"/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /\.pluginRoute\("\/forms"/);
  // W5-01-DATASET-05: the Runtime client uses the exact declared collection route.
  // RAC-150: Dataset's page names its routes under the plugin ("/datasets") and asks the shared host for the full path.
  const datasetBrowser = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/dataset/src/browser/${file}`, import.meta.url)), "utf8");
  assert.match(datasetBrowser("page.ts"), /api: "\/datasets"/);
  assert.match(datasetBrowser("request.ts"), /host\.pluginRoute\(path\)/);
  assert.ok(datasetManifest.routes?.some(route => route.method === "GET" && route.path === "/datasets"), "and the Manifest declares that collection route");
  // W5-01-PPT-02: the Runtime client uses its Manifest route, including the resource path. RAC-150: PPT's page names its routes
  // under the plugin ("/ppt") and asks the shared host for the full path.
  const pptBrowser = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/ppt/src/browser/${file}`, import.meta.url)), "utf8");
  assert.match(pptBrowser("page.ts"), /api: "\/ppt"/);
  assert.match(pptBrowser("request.ts"), /host\.pluginRoute\(path\)/);
  assert.ok(pptManifest.routes?.some(route => route.method === "GET" && route.path === "/ppt"), "and the Manifest declares that collection route");
  // RAC-31: the Runtime client targets its declared route; the HTTP discovery test rejects the removed URL.
  // RAC-146: 灵光's page names its routes under the plugin ("/sparks") and asks the shared host for the full path.
  const lingguangBrowser = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/lingguang/src/browser/${file}`, import.meta.url)), "utf8");
  assert.match(lingguangBrowser("page.ts"), /api: "\/sparks"/);
  assert.match(lingguangBrowser("request.ts"), /host\.pluginRoute\(path\)/);
  assert.ok(lingguangManifest.routes?.some(route => route.method === "GET" && route.path === "/sparks"), "and the Manifest declares that collection route");
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /\/api\/functions/);
});

// BFTC-01: FI-2 seeds a rule when its scene registers, after the Host opens the Home; both seeding tests use the same contract input.
const seedHomeDock = (home: string) => seedSceneRules(home, { provider_id: "test.declarer", title: "测试", kind: "system" }, [HOME_DOCK], { env: {}, credential: () => null });

test("/api/plugins/functions 与 /api/functions 打到同一 handler", async () => {
  await withHome(async (home) => {
    // The Host opens the Home first (a fresh Home adopts the current memory format), then registers its scenes.
    const dispatcher = await listenDispatcher(home);
    seedHomeDock(home);
    try {
      const shortPath = await fetch(`${dispatcher.origin}/api/functions`);
      const platformPath = await fetch(`${dispatcher.origin}/api/plugins/functions`);
      assert.equal(shortPath.status, 200);
      assert.equal(platformPath.status, 200);
      const shortBody = await shortPath.json() as { functions: Array<{ function_key: string }> };
      const platformBody = await platformPath.json() as { functions: Array<{ function_key: string }> };
      assert.deepEqual(
        shortBody.functions.map((row) => row.function_key).sort(),
        platformBody.functions.map((row) => row.function_key).sort(),
      );
      assert.ok(shortBody.functions.some((row) => row.function_key === SYSTEM_HOME_DOCK_FUNCTION_KEY));
    } finally {
      await dispatcher.close();
    }
  });
});

// The Host no longer assembles Pages: there is no "environment without a publisher" any more (the Runtime always gives the plugin the project's 成果库),
// so the old 409 `pages.unavailable` case has nothing left to refuse. What remains is that the HTTP route and the action write one line.
test("W5-01-PAGES-05 promote through the HTTP route and through the action write the same 成果 line in the project", async t => {
  const f = await servePages(t);
  const created = await f.http<{ document: { id: string } }>("", { title: "发出去", goal_id: "CORE" });
  const promoted = await f.http<{ artifact: { artifact_id: string; version: number } }>(`/${created.document.id}/promote`, { goal_id: "CORE" });
  assert.equal(promoted.artifact.artifact_id, `pages-${created.document.id}`);
  const versionOf = (artifactId: string) => f.host.withProject(f.project.reference, runtime =>
    runtime.artifacts.query.getArtifactVersion(f.project.project_id, { artifact_id: artifactId, version: 1 }));
  assert.equal((await versionOf(promoted.artifact.artifact_id))?.artifact_id, promoted.artifact.artifact_id);

  const action = await f.bound.invoke(pagesActions.create, { title: "Action 文档", goal_id: "CORE" });
  const pinned = await f.bound.invoke(pagesActions.promote, { id: action.document.id, goal_id: "CORE" });
  assert.equal(pinned.artifact.artifact_id, `pages-${action.document.id}`);
  assert.equal(pinned.document.artifact_id, pinned.artifact.artifact_id);
  assert.ok(await versionOf(pinned.artifact.artifact_id));
});

test("草稿 CAS：过期 updated_at 不能覆盖已写入的草稿、预览和样例", async () => {
  await withHome(async (home) => {
    const provider: TypeSafeProvider = { async evaluate() { return { primitive: "choice", choice: "yes", noul: null, score: null, legend: null,
      probabilities: { yes: 0.9, no: 0.1 }, confidence: 0.8, model: "jev-1.13.0" }; } };
    const functions = createFunctionsService({ home, credential: () => null, env: { TYPESAFE_API_KEY: "fixture-only" }, provider });
    try {
      const created = functions.createChoice({ name: "cas" });
      functions.updateDraft(created.id, { name: "first" });
      const stale = "2000-01-01T00:00:00.000Z";
      assert.throws(
        () => functions.updateDraft(created.id, { name: "mine" }, stale),
        (error: unknown) => error instanceof ActionError && error.code === "functions.conflict",
      );
      assert.equal(functions.get(created.id).name, "first");

      const live = functions.get(created.id);
      functions.addSample(live.id, { input: "样例一" });
      assert.throws(
        () => functions.addSample(live.id, { input: "样例二" }, stale),
        (error: unknown) => error instanceof ActionError && error.code === "functions.conflict",
      );
      assert.equal(functions.get(created.id).samples.length, 1);

      const ready = functions.updateDraft(created.id, { instructions: "判断说明要够长才能试跑。",
        criteria: [{ key: "yes", description: "是" }, { key: "no", description: "否" }] });
      await functions.preview(ready.id, "请退款");
      await assert.rejects(
        functions.preview(ready.id, "请退款", stale),
        (error: unknown) => error instanceof ActionError && error.code === "functions.conflict",
      );
    } finally {
      functions.close();
    }
  });
});

test("再次打开库不改已有 published 内置函数的 instructions", async () => {
  await withHome(async (home) => {
    seedHomeDock(home);
    const functions = createFunctionsService({ home, credential: () => null });
    try {
      assert.ok(functions.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY));
    } finally {
      functions.close();
    }
    const db = new DatabaseSync(homeSqlitePath(home, "functions"));
    db.prepare("UPDATE functions SET instructions = ? WHERE function_key = ?").run("用户改过", SYSTEM_HOME_DOCK_FUNCTION_KEY);
    db.close();
    // The Host registers its scenes again on the next start; that seeds nothing over what the person changed.
    seedHomeDock(home);
    const again = createFunctionsService({ home, credential: () => null });
    try {
      assert.equal(again.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY)?.instructions, "用户改过");
    } finally {
      again.close();
    }
  });
});

test("PPT 用色板，没有系统 color input", () => {
  const html = renderPptWorkbench({
    primitives: {
      escape: (value) => String(value ?? ""),
      text: (value) => value,
    },
  });
  assert.match(html, /data-ppt-swatch/);
  assert.doesNotMatch(html, /type="color"/);
  assert.doesNotMatch(readFileSync(fileURLToPath(new URL("../plugins/native/ppt/src/browser/slides.ts", import.meta.url)), "utf8"), /type=["']color["']/);
});

test("Host 文本补全口暂无模型；注入后 Pages AI 返回模型的候选文字，不带占位标记", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-review-fixes-model-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(hostCompleteText({ homeDirectory: home, env: {} }), undefined);
  const f = await servePages(t, { completeText: async () => "host-outline" });
  const page = (await f.http<{ document: { id: string } }>("", { title: "写作" })).document;
  const body = await f.http<{ text: string }>(`/${page.id}/ai`, { command: "outline", text: "先写目标再写范围" });
  assert.equal("stub" in body, false);
  assert.equal(body.text, "host-outline");
});

test("Host 不再进口 Functions 的库（FunctionsStore）；错误类型来自 contracts", async () => {
  assert.equal("MolisWorkV1Error" in goalsPluginExports, false, "W3-02-H-01 the retired error is not a plugin export");
  const error = new ContractsError("pages.unavailable", "当前环境不能发出 Artifact");
  assert.equal(error.name, "ActionError");
  const files = [
    "apps/local-host/src/functions-host.ts",
    "apps/local-host/src/functions-http.ts",
    "apps/local-host/src/web-catalog.ts",
    "apps/local-host/src/web-view.ts",
    "apps/local-host/src/mcp-server.ts",
    "apps/local-host/src/mcp-authority.ts",
    "apps/local-host/src/mcp-event-identity.ts",
    "apps/local-host/src/goal-project-application.ts",
  ];
  for (const relative of files) {
    const source = await readFile(join(ROOT, "..", relative), "utf8");
    assert.doesNotMatch(source, /openFunctionsStore|\bFunctionsStore\b/, `${relative}: the Functions library stays inside its Module`);
    assert.doesNotMatch(source, /MolisWorkV1Error[\s\S]{0,80}plugin-goals/);
  }
  // Current judgments come from the authorized Inbox/Feed actions; the web view no longer snapshots the Functions store.
  assert.doesNotMatch(await readFile(join(ROOT, "..", "apps/local-host/src/web-view.ts"), "utf8"), /openFunctionsStore|functionsViewFingerprint/);
});

test("HTTP 带着过期 updated_at 保存草稿会 409", async () => {
  await withHome(async (home) => {
    const dispatcher = await listenDispatcher(home);
    try {
      const created = await fetch(`${dispatcher.origin}/api/plugins/functions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primitive: "choice", name: "http-cas" }),
      });
      assert.equal(created.status, 200);
      const record = (await created.json() as { function: { id: string; updated_at: string } }).function;
      const first = await fetch(`${dispatcher.origin}/api/plugins/functions/${record.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "first", updated_at: record.updated_at }),
      });
      assert.equal(first.status, 200);
      const second = await fetch(`${dispatcher.origin}/api/plugins/functions/${record.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "second", updated_at: record.updated_at }),
      });
      assert.equal(second.status, 409);
      assert.equal((await second.json() as { code: string }).code, "functions.conflict");
      const latest = await fetch(`${dispatcher.origin}/api/plugins/functions/${record.id}`);
      assert.equal(((await latest.json()) as { function: { name: string } }).function.name, "first");
    } finally {
      await dispatcher.close();
    }
  });
});

test("Workbench 静态装配和实际 Runtime 贡献覆盖 catalog 的页面", async () => {
  await withHome(async home => {
    const databasePath = join(home, "board.db");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const { platform } = await ensureProjectPlugins({ store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID,
        actorId: "web-user", homeDirectory: home, actions: pluginActions(store, DEMO_PROJECT_ID) });
      assert.ok(platform, "Runtime 必须实际启动，不能仅将 app 插件从检查中排除");
      // A plugin's market words are its Manifest's `summary` since W5-02 PR-B (B2); the registration no longer carries them.
      const shipped = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.personal === true || Boolean(entry.manifest.summary));
      const packed = new Set(BUILTIN_PLUGIN_WORKBENCH.map(pack => pack.project_plugin_id));
      for (const entry of shipped) {
        if (packed.has(entry.project_plugin_id)) continue;
        assert.equal(entry.manifest.kind, "app", `${entry.project_plugin_id} 缺少静态装配`);
        assert.equal(platform.supervisor.state(entry.manifest.plugin_id)?.status, "running", entry.project_plugin_id);
        const contribution = platform.supervisor.contribution(entry.manifest.plugin_id);
        assert.equal(contribution?.kind, "app");
        if (contribution?.kind !== "app") throw new Error(`${entry.project_plugin_id} 未返回 app 贡献`);
        for (const view of entry.manifest.ui.views ?? []) {
          assert.ok(contribution.views?.some(actual => actual.descriptor.contribution_id === view.contribution_id),
            `${entry.project_plugin_id} 缺少声明的页面 ${view.view_id}`);
        }
      }
      for (const id of packed) assert.ok(shipped.some(entry => entry.project_plugin_id === id), `${id} 是孤立的静态装配`);
    } finally {
      await releaseProjectPlugins(store, DEMO_PROJECT_ID);
      store.close();
    }
  });
});

test("绑定项目的 MCP promote 走 Host Artifact 口", async t => {
  await withHome(async (home) => {
    const host = new MolisWorkLocalHost({ homeDirectory: home });
    // The Home is served so that the project and the client's grants are made the way a person makes them, through the settings routes.
    const served = await serveTestHost(t, { home, host });
    const project = await served.createProject("MCP Promote");
    const databasePath = project.database_path;
    const caller = { actor_id: "runtime:codex", project_id: project.project_id, audience: "mcp" as const, permissions: [] };
    const createName = molisWorkActionToolName(pagesActions.create), readName = molisWorkActionToolName(pagesActions.get), promoteName = molisWorkActionToolName(pagesActions.promote);
    await served.grant(caller.actor_id, project.project_id, [pagesActions.create, pagesActions.get, pagesActions.promote]);
    const server = new MolisWorkServer("runtime", {
      databasePath,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory: home,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "pages-promote", host_declares_stable: true },
      webBaseUrl: "http://127.0.0.1:4173",
    }, host);
    try {
      await server.handleMessage({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {} },
      });
      const created = await server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: createName, arguments: { title: "MCP 发出", goal_id: "CORE" } },
      }) as { result: { isError: boolean; content: Array<{ text: string }> } };
      assert.equal(created.result.isError, false, created.result.content[0]?.text);
      const page = JSON.parse(created.result.content[0]?.text ?? "{}") as { document: { id: string } };
      const current = await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: readName, arguments: { id: page.document.id } } }) as { result: { isError?: boolean; content: Array<{ text: string }> } };
      assert.notEqual(current.result.isError, true, current.result.content[0]?.text);
      const read = JSON.parse(current.result.content[0]?.text ?? "{}") as { document: { version: number } };
      assert.ok(Number.isInteger(read.document.version));
      const promoted = await server.handleMessage({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: promoteName, arguments: { id: page.document.id, goal_id: "CORE", expected_version: read.document.version } },
      }) as { result: { isError: boolean; content: Array<{ text: string }> } };
      assert.equal(promoted.result.isError, false, promoted.result.content[0]?.text);
      const body = JSON.parse(promoted.result.content[0]?.text ?? "{}") as { artifact: { artifact_id: string } };
      assert.equal(body.artifact.artifact_id, `pages-${page.document.id}`);
      const verify = new LocalProjectDatabase(databasePath);
      try {
        const library = openProjectVersionStores(verify);
        assert.ok(library.artifacts.query.getArtifactVersion(project.project_id, {
          artifact_id: body.artifact.artifact_id,
          version: 1,
        }));
      } finally {
        verify.close();
      }
    } finally {
      await server.close();
      await served.close();
      await host.close();
    }
  });
});
