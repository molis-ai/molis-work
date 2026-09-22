import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import {
  DEMO_BOARD_ID,
  LocalProjectDatabase,
  createPluginPlatform,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
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
    appendEvent: (event) => store.appendEvent(event),
  });
  const platform = createPluginPlatform({
    board_id: DEMO_BOARD_ID,
    actor_id: "tester",
    db: store.db,
    artifacts,
    ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  return { store, platform };
}

test("Coding 由 Plugin Runtime 启动，并注册它声明的视图", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-activation-"));
  try {
    const { store, platform } = project(directory);
    const report = await platform.start([
      { definition: createCodingPlugin() },
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
    // grants 默认是 Manifest 声明的全部必需权限；明确给空数组才是「什么都没授」
    const report = await platform.start([
      { definition: createCodingPlugin(), grants: [] },
    ]);
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
    const report = await platform.start([{ definition: createCodingPlugin() }]);
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
