import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import {
  DEMO_PROJECT_ID,
  LocalProjectDatabase,
  createPluginPlatform,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import { CODING_PLUGIN_ID, codingManifest, createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";

/**
 * Coding really starts under Plugin Runtime.
 *
 * This is what has to be true before the Manifest may say `app`: not that the
 * code exists, but that the Runtime activates it, isolates it, and refuses it
 * when a grant is missing.
 */

function project(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const artifacts = new ArtifactsModule({
    db: store.db,
    appendEvent: (event) => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId),
  });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: (event) => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID),
    project_id: DEMO_PROJECT_ID,
    actor_id: "tester",
    db: store.db,
    artifacts,
    processItems,
    ui: new UiHost(),
    home: null,
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  return { store, platform };
}

test("Coding 由 Plugin Runtime 启动，并注册它声明的视图", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-activation-"));
  try {
    const { store, platform } = project(directory);
    const report = await platform.start([
      { definition: createCodingPlugin(), trust: { level: "host" } },
    ]);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.blocked, []);
    assert.deepEqual(report.running, [CODING_PLUGIN_ID], "Coding 必须真的跑起来");
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("没拿到 artifact:write 就起不来，而不是起来之后在发布时才炸", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-activation-"));
  try {
    const { store, platform } = project(directory);
    // grants 默认是 Manifest 声明的全部必需权限；明确给空数组才是「什么都没授」。随宿主发布的构建（Coding）一律拿到它声明的
    // 全部权限（hostBuildGrants），缺授权只会发生在别的信任等级上：所以这里用一个不随宿主发布、同样必需 artifact:write 的插件。
    const needsWrite = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.needs-write", version: "1.0.0", name: "需要写成果",
      kind: "app", publisher: { publisher_id: "example", signature: "needs-write" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [{ permission: "artifact:write", required: true, reason: "发布成果" }], capabilities: { provides: [], consumes: [] },
      artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] }, async start() { return { kind: "app" }; } });
    const report = await platform.start([{ definition: needsWrite, grants: [] }]);
    assert.deepEqual(report.running, [], "缺授权就不该处于运行状态");
    assert.equal(report.failed.length + report.blocked.length, 1, "必须在激活期就被挡住");
    const problem = [...report.failed, ...report.blocked][0];
    assert.match(String(problem?.message ?? ""), /artifact:write/,
      "拒绝的理由要说清是哪一项授权");
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("跑起来的贡献，恰好兑现 Manifest 声明的那两个视图", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-activation-"));
  try {
    const { store, platform } = project(directory);
    const report = await platform.start([{ definition: createCodingPlugin(), trust: { level: "host" } }]);
    assert.deepEqual(report.running, [CODING_PLUGIN_ID]);

    const contribution = platform.supervisor.contribution(CODING_PLUGIN_ID);
    assert.notEqual(contribution, null, "跑着就该拿得到它的贡献");
    assert.equal(contribution?.kind, "app", "它是作为 app 被托管的");

    const rendered = (contribution as { views?: ReadonlyArray<{ descriptor: { contribution_id: string } }> })
      .views?.map((view) => view.descriptor.contribution_id).sort() ?? [];
    const declared = [...new Set((codingManifest.ui.views ?? []).map((view) => view.contribution_id))].sort();
    assert.deepEqual(rendered, declared,
      "声明了几个视图就要兑现几个——平台会因为少一个而拒绝激活");
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
