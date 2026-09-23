import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BUILTIN_PLUGIN_CATALOG,
  OWN_DIRECTORY_SURFACES,
  islandEntries,
  railEntries,
} from "@molis-ai/molis-work-app-workbench";
import {
  DEMO_BOARD_ID,
  GoalProjectApplication,
  LocalProjectDatabase,
} from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error as ContractsError } from "@molis-ai/molis-work-contracts/platform/errors";
import { mcpPublicToolName, parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UI_VIEW_SLOTS } from "@molis-ai/molis-work-contracts/platform/ui";
import { SYSTEM_HOME_DOCK_FUNCTION_KEY } from "@molis-ai/molis-work-contracts/modules/functions";
import { FunctionsError, openFunctionsStore } from "@molis-ai/molis-work-module-functions";
import { MolisWorkV1Error as GoalsError } from "@molis-ai/molis-work-plugin-goals";
import {
  DATASET_CLIENT_FACTORY_SCRIPT,
  datasetManifest,
} from "@molis-ai/molis-work-plugin-dataset";
import { FORM_CLIENT_FACTORY_SCRIPT, formManifest } from "@molis-ai/molis-work-plugin-form";
import { FUNCTIONS_CLIENT_FACTORY_SCRIPT, functionsManifest } from "@molis-ai/molis-work-plugin-functions";
import { LINGGUANG_CLIENT_FACTORY_SCRIPT, lingguangManifest } from "@molis-ai/molis-work-plugin-lingguang";
import {
  PAGES_CLIENT_FACTORY_SCRIPT,
  PAGES_PROJECT_PLUGIN_ID,
  openPagesStore,
  pagesManifest,
  runPagesMcpTool,
} from "@molis-ai/molis-work-plugin-pages";
import { PPT_CLIENT_FACTORY_SCRIPT, pptManifest, renderPptWorkbench } from "@molis-ai/molis-work-plugin-ppt";
import { homeSqlitePath, PERSONAL_HOME_SQLITE_STORES } from "@molis-ai/molis-work-storage";
import { hostCompleteText } from "../apps/local-host/src/host-complete-text.ts";
import { handlePersonalNativePluginHttp } from "../apps/local-host/src/personal-native-plugin-http.ts";
import { nativeMcpPluginSources } from "../apps/local-host/src/mcp-native-plugins.ts";
import { rewriteNativePluginApiPath } from "../apps/local-host/src/native-plugin-api.ts";
import { registerPagesArtifactVersion } from "../apps/local-host/src/pages-artifact.ts";
import { MolisWorkUninstallService } from "../apps/local-host/src/installer/uninstall.ts";
import { RuntimeIntegrationService } from "../apps/local-host/src/installer/runtime-integration.ts";
import { MolisWorkWebServiceManager } from "../apps/local-host/src/installer/web-service.ts";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { BUILTIN_PLUGIN_WORKBENCH } from "../apps/workbench/src/plugin-workbench.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-review-fixes-"));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function listenDispatcher(
  home: string,
  ports: Parameters<typeof handlePersonalNativePluginHttp>[4] = {},
): Promise<{ origin: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    void handlePersonalNativePluginHttp(request, response, url, home, ports).then((handled) => {
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
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("purge 名单覆盖全部个人 home 库", () => {
  assert.deepEqual([...PERSONAL_HOME_SQLITE_STORES], ["images", "pages", "form", "dataset", "ppt", "lingguang", "jelly", "cognia", "alchemist", "functions"]);
});

test("uninstall --purge 会把已有的个人库目录列入删除并真正删掉", async () => {
  await withHome(async (home) => {
    const userHome = join(home, "user");
    await mkdir(userHome, { recursive: true });
    for (const storeName of PERSONAL_HOME_SQLITE_STORES) {
      await mkdir(join(home, storeName), { recursive: true });
      await writeFile(join(home, storeName, `${storeName}.db`), "personal-store\n");
    }
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
    for (const storeName of PERSONAL_HOME_SQLITE_STORES) {
      assert.ok(
        plan.changes.some((change) => change.target === join(home, storeName)),
        `purge 计划要包含 ${storeName}`,
      );
    }
    const result = await service.confirm({
      plan_id: plan.plan_id,
      decision: "confirmed",
      purge_confirmation: { home_directory: plan.home_directory, user_project_count: plan.user_project_count },
    });
    assert.equal(result.status, "purged");
    for (const storeName of PERSONAL_HOME_SQLITE_STORES) {
      await assert.rejects(stat(join(home, storeName, `${storeName}.db`)));
    }
  });
});

test("打开 Schedule 时目录面是 schedule，不是 Goals", () => {
  assert.equal(OWN_DIRECTORY_SURFACES.includes("schedule"), true);
  assert.equal(OWN_DIRECTORY_SURFACES.includes("sources"), true);
  assert.equal(OWN_DIRECTORY_SURFACES.includes("coding"), false);
});

test("灵光在岛上，不在侧栏轨；Manifest 声明 island 槽", () => {
  assert.equal(UI_VIEW_SLOTS.includes("island"), true);
  parsePluginManifest(lingguangManifest);
  assert.equal(lingguangManifest.ui.views?.[0]?.slot, "island");
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
    functionsManifest,
  ]) {
    parsePluginManifest(manifest);
    assert.ok(manifest.permissions.some((item) => item.permission === "storage:private"), manifest.plugin_id);
  }
  assert.ok(pagesManifest.permissions.some((item) => item.permission === "artifact:write"));
});

test("客户端走 /api/plugins/<id>/，Host 改写到现有短路径", () => {
  assert.equal(rewriteNativePluginApiPath("/api/plugins/pages/abc/promote"), "/api/pages/abc/promote");
  assert.equal(rewriteNativePluginApiPath("/api/plugins/io.molis.work.form"), "/api/form");
  assert.equal(rewriteNativePluginApiPath("/api/plugins/io.molis.work.shelf/file"), "/api/shelf/file");
  assert.equal(rewriteNativePluginApiPath("/api/pages/abc"), "/api/pages/abc");
  assert.equal(rewriteNativePluginApiPath("/api/plugins/unknown/x"), "/api/plugins/unknown/x");
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /\/api\/plugins\/pages/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /\/api\/plugins\/form/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /\/api\/plugins\/dataset/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /\/api\/plugins\/ppt/);
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /\/api\/plugins\/lingguang/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /\/api\/plugins\/functions/);
});

test("/api/plugins/functions 与 /api/functions 打到同一 handler", async () => {
  await withHome(async (home) => {
    const dispatcher = await listenDispatcher(home);
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

test("catalog 路径 Promote 不发 Artifact；注入口之后 MCP 与 HTTP 同口写出", async () => {
  await withHome(async (home) => {
    const catalog = await listenDispatcher(home);
    try {
      const created = await fetch(`${catalog.origin}/api/plugins/pages?project_id=project-alpha`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: "project-alpha", title: "周记" }),
      });
      assert.equal(created.status, 200);
      const document = (await created.json() as { document: { id: string } }).document;
      const missing = await fetch(`${catalog.origin}/api/plugins/pages/${document.id}/promote?project_id=project-alpha`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: "project-alpha", goal_id: "CORE" }),
      });
      assert.equal(missing.status, 409);
      const missingBody = await missing.json() as { code: string; document?: { goal_id?: string } };
      assert.equal(missingBody.code, "pages.unavailable");
      assert.equal(missingBody.document, undefined);
      const catalogPages = openPagesStore(home);
      try {
        assert.equal(catalogPages.get(document.id, "project-alpha").goal_id, "");
      } finally {
        catalogPages.close();
      }
    } finally {
      await catalog.close();
    }

    const project = new LocalProjectDatabase(join(home, "project.db"));
    try {
      const coordinator = new GoalProjectApplication(project);
      coordinator.initializeBoard({
        board_id: DEMO_BOARD_ID,
        title: "复查",
        actor_id: "web-user",
        idempotency_key: "review-fixes-board",
      });
      const publishArtifact = registerPagesArtifactVersion(coordinator, DEMO_BOARD_ID);
      const projectDispatcher = await listenDispatcher(home, { publishArtifact });
      try {
        const created = await fetch(`${projectDispatcher.origin}/api/plugins/pages?project_id=project-alpha`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project_id: "project-alpha", title: "发出去", goal_id: "CORE" }),
        });
        const page = (await created.json() as { document: { id: string } }).document;
        const promoted = await fetch(`${projectDispatcher.origin}/api/pages/${page.id}/promote?project_id=project-alpha`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project_id: "project-alpha", goal_id: "CORE" }),
        });
        assert.equal(promoted.status, 200);
        const httpBody = await promoted.json() as { artifact: { artifact_id: string; version: number } };
        assert.equal(httpBody.artifact.artifact_id, `pages-${page.id}`);
        assert.equal(
          coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, {
            artifact_id: httpBody.artifact.artifact_id,
            version: 1,
          })?.artifact_id,
          httpBody.artifact.artifact_id,
        );
      } finally {
        await projectDispatcher.close();
      }

      const pages = openPagesStore(home);
      try {
        const created = JSON.parse(runPagesMcpTool(pages, {
          tool_id: "create",
          arguments: { title: "MCP 文档", goal_id: "CORE" },
        }, "project-alpha")) as { document: { id: string } };
        const promoted = JSON.parse(runPagesMcpTool(pages, {
          tool_id: "promote",
          arguments: { id: created.document.id, goal_id: "CORE" },
        }, "project-alpha", { publishArtifact })) as {
          artifact: { artifact_id: string; version: number };
          document: { artifact_id: string };
        };
        assert.equal(promoted.artifact.artifact_id, `pages-${created.document.id}`);
        assert.equal(promoted.document.artifact_id, promoted.artifact.artifact_id);
        assert.ok(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, {
          artifact_id: promoted.artifact.artifact_id,
          version: 1,
        }));
      } finally {
        pages.close();
      }
    } finally {
      project.close();
    }
  });
});

test("草稿 CAS：过期 updated_at 不能覆盖已写入的草稿、预览和样例", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    try {
      const created = store.createChoice({ name: "cas" });
      store.updateDraft(created.id, { name: "first" });
      const stale = "2000-01-01T00:00:00.000Z";
      assert.throws(
        () => store.updateDraft(created.id, { name: "mine" }, stale),
        (error: unknown) => error instanceof FunctionsError && error.code === "functions.conflict",
      );
      assert.equal(store.get(created.id)?.name, "first");

      const live = store.get(created.id)!;
      store.addSample(live.id, { input: "样例一" });
      assert.throws(
        () => store.addSample(live.id, { input: "样例二" }, stale),
        (error: unknown) => error instanceof FunctionsError && error.code === "functions.conflict",
      );
      assert.equal(store.get(created.id)?.samples.length, 1);

      const ready = store.updateDraft(created.id, { instructions: "判断说明要够长才能试跑。" });
      const preview = {
        input: "请退款",
        outcome: "ok" as const,
        primitive: "choice" as const,
        choice: "yes",
        probabilities: { yes: 0.9, no: 0.1 },
        confidence: 0.8,
        noul: null,
        score: null,
        legend: null,
        model: "jev-1.13.0",
        config_hash: ready.config_hash,
        at: "2026-09-21T00:00:00.000Z",
      };
      store.savePreview(ready.id, preview);
      assert.throws(
        () => store.savePreview(ready.id, preview, stale),
        (error: unknown) => error instanceof FunctionsError && error.code === "functions.conflict",
      );
    } finally {
      store.close();
    }
  });
});

test("再次打开库不改已有 published 内置函数的 instructions", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    try {
      assert.ok(store.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY));
    } finally {
      store.close();
    }
    const db = new DatabaseSync(homeSqlitePath(home, "functions"));
    db.prepare("UPDATE functions SET instructions = ? WHERE function_key = ?").run("用户改过", SYSTEM_HOME_DOCK_FUNCTION_KEY);
    db.close();
    const again = openFunctionsStore(home);
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
  assert.doesNotMatch(PPT_CLIENT_FACTORY_SCRIPT, /type=["']color["']/);
});

test("Host 文本补全口暂无模型；注入后 Pages AI 不再走 stub", async () => {
  assert.equal(hostCompleteText(), undefined);
  await withHome(async (home) => {
    const dispatcher = await listenDispatcher(home, { completeText: async () => "host-outline" });
    try {
      const created = await fetch(`${dispatcher.origin}/api/plugins/pages?project_id=project-alpha`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: "project-alpha", title: "写作" }),
      });
      const page = (await created.json() as { document: { id: string } }).document;
      const ai = await fetch(`${dispatcher.origin}/api/plugins/pages/${page.id}/ai?project_id=project-alpha`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: "project-alpha", command: "outline", text: "先写目标再写范围" }),
      });
      assert.equal(ai.status, 200);
      const body = await ai.json() as { stub: boolean; text: string };
      assert.equal(body.stub, false);
      assert.equal(body.text, "host-outline");
    } finally {
      await dispatcher.close();
    }
  });
});

test("Host 不再从插件包进口 openFunctionsStore；错误类型来自 contracts", async () => {
  assert.equal(ContractsError, GoalsError);
  const error = new ContractsError("pages.unavailable", "当前环境不能发出 Artifact");
  assert.equal(error instanceof GoalsError, true);
  const files = [
    "apps/local-host/src/functions-host.ts",
    "apps/local-host/src/functions-native-plugin-http.ts",
    "apps/local-host/src/mcp-functions-tools.ts",
    "apps/local-host/src/web-catalog.ts",
    "apps/local-host/src/mcp-native-plugins.ts",
    "apps/local-host/src/mcp-store-plugin-adapter.ts",
    "apps/local-host/src/web-view.ts",
    "apps/local-host/src/mcp-server.ts",
    "apps/local-host/src/mcp-authority.ts",
    "apps/local-host/src/mcp-event-identity.ts",
    "apps/local-host/src/goal-project-application.ts",
  ];
  for (const relative of files) {
    const source = await readFile(join(ROOT, "..", relative), "utf8");
    if (source.includes("openFunctionsStore")) {
      assert.match(source, /from "@molis-ai\/molis-work-module-functions"/);
      assert.doesNotMatch(source, /openFunctionsStore[\s\S]{0,80}plugin-functions/);
    }
    assert.doesNotMatch(source, /MolisWorkV1Error[\s\S]{0,80}plugin-goals/);
  }
  assert.match(await readFile(join(ROOT, "..", "apps/local-host/src/web-view.ts"), "utf8"), /functionsViewFingerprint/);
});

test("Native MCP 表与 catalog 的 mcp_exports 同源", () => {
  const declared = BUILTIN_PLUGIN_CATALOG
    .filter((entry) => (entry.manifest.mcp_exports ?? []).length > 0)
    .map((entry) => entry.manifest.plugin_id)
    .sort();
  assert.deepEqual(nativeMcpPluginSources().map((item) => item.plugin_id).sort(), declared);
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

test("Workbench 装配表覆盖 catalog 里有 summary 或 personal 的插件", () => {
  const shipped = BUILTIN_PLUGIN_CATALOG
    .filter((entry) => entry.personal === true || Boolean(entry.summary))
    .map((entry) => entry.project_plugin_id)
    .sort();
  const packed = [...new Set(BUILTIN_PLUGIN_WORKBENCH.map((pack) => pack.project_plugin_id))].sort();
  assert.deepEqual(packed, shipped);
});

test("绑定项目的 MCP promote 走 Host Artifact 口", async () => {
  await withHome(async (home) => {
    const databasePath = join(home, "project.db");
    const project = new LocalProjectDatabase(databasePath);
    try {
      new GoalProjectApplication(project).initializeBoard({
        board_id: DEMO_BOARD_ID,
        title: "MCP Promote",
        actor_id: "web-user",
        idempotency_key: "review-fixes-mcp-promote",
      });
    } finally {
      project.close();
    }
    await mkdir(join(home, "config"), { recursive: true });
    const createName = mcpPublicToolName(PAGES_PROJECT_PLUGIN_ID, "create");
    const promoteName = mcpPublicToolName(PAGES_PROJECT_PLUGIN_ID, "promote");
    await writeFile(join(home, "config", "mcp-tools.json"), JSON.stringify({
      version: 1,
      overrides: { [createName]: true, [promoteName]: true },
    }));
    const server = new MolisWorkServer("runtime", {
      databasePath,
      boardId: DEMO_BOARD_ID,
      projectId: "project-alpha",
      webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory: home,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "pages-promote", host_declares_stable: true },
      webBaseUrl: "http://127.0.0.1:4173",
    });
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
      const promoted = await server.handleMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: promoteName, arguments: { id: page.document.id, goal_id: "CORE" } },
      }) as { result: { isError: boolean; content: Array<{ text: string }> } };
      assert.equal(promoted.result.isError, false, promoted.result.content[0]?.text);
      const body = JSON.parse(promoted.result.content[0]?.text ?? "{}") as { artifact: { artifact_id: string } };
      assert.equal(body.artifact.artifact_id, `pages-${page.document.id}`);
      const verify = new LocalProjectDatabase(databasePath);
      try {
        const coordinator = new GoalProjectApplication(verify);
        assert.ok(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, {
          artifact_id: body.artifact.artifact_id,
          version: 1,
        }));
      } finally {
        verify.close();
      }
    } finally {
      await server.close();
    }
  });
});

