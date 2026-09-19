import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import {
  DEMO_BOARD_ID,
  LocalProjectDatabase,
  createPluginPlatform,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { DIFF_PLUGIN_ID, createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { FILES_PLUGIN_ID, createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { GIT_PLUGIN_ID, createGitPlugin } from "@molis-ai/molis-work-plugin-git";
import { TEXT_STATS_PLUGIN_ID, createTextStatsPlugin } from "@molis-ai/molis-work-plugin-text-stats";
import { WORKSPACE_PLUGIN_ID, createWorkspacePlugin } from "@molis-ai/molis-work-plugin-workspace";

/**
 * The five Plugins as one graph on the real platform.
 *
 * Each of them is tested on its own elsewhere. What this file asks is the thing
 * no unit test can: that Workspace, Files, Diff, Git and Text stats actually
 * start together, that their declared ports can be bound, and that a value
 * published at the head of the graph arrives at the far end.
 */

interface Publisher {
  publish(input: unknown): unknown;
  invalidate?(input: unknown): unknown;
}

/** Wrap a definition so the test can reach the services the Host handed it. */
function capturing(
  definition: PluginDefinition,
  onStart: (context: PluginStartContext) => void,
): PluginDefinition {
  return {
    ...definition,
    async start(context) {
      onStart(context);
      return await definition.start(context);
    },
  };
}

function project(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const platform = createPluginPlatform({
    board_id: DEMO_BOARD_ID,
    actor_id: "tester",
    db: store.db,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: (event) => store.appendEvent(event) }),
    ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  return { store, platform };
}

const WORKSPACE_REF = { workspace_id: "ws-1", name: "示例项目", handle: "ws-1" };

function snapshot(text: string) {
  return { workspace: { workspace_id: "ws-1", name: "示例项目" }, path: ["a.ts"], text };
}

test("五个插件在真平台上一起起来，没有一个被依赖挡住", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workspace-graph-"));
  try {
    const { store, platform } = project(directory);
    const report = await platform.start([
      { definition: createWorkspacePlugin({ currentWorkspaceId: () => "ws-1" }) },
      { definition: createFilesPlugin({ readable: () => true }) },
      { definition: createDiffPlugin() },
      { definition: createGitPlugin({ ready: () => true }) },
      { definition: createTextStatsPlugin() },
      { definition: createCodingPlugin() },
    ]);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.blocked, []);
    assert.equal(report.running.includes(WORKSPACE_PLUGIN_ID), true);
    assert.equal(report.running.includes(FILES_PLUGIN_ID), true);
    assert.equal(report.running.includes(DIFF_PLUGIN_ID), true);
    assert.equal(report.running.includes(GIT_PLUGIN_ID), true);
    assert.equal(report.running.includes(TEXT_STATS_PLUGIN_ID), true);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("工作目录从图的源头流到 Files 和 Git", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workspace-graph-"));
  try {
    const { store, platform } = project(directory);
    let workspaceServices: { outputs: Publisher } | undefined;
    const filesSaw: boolean[] = [];
    const gitSaw: string[] = [];

    await platform.start([
      {
        definition: capturing(
          createWorkspacePlugin({ currentWorkspaceId: () => "ws-1" }),
          (context) => {
            workspaceServices = context.services as { outputs: Publisher };
          },
        ),
      },
      {
        definition: createFilesPlugin({
          readable: () => true,
          onWorkspaceChanged: (available) => { filesSaw.push(available); },
        }),
      },
      {
        definition: createGitPlugin({
          ready: () => true,
          onWorkingTreeChanged: (reason) => { gitSaw.push(reason); },
        }),
      },
    ]);

    for (const target of [
      { plugin: FILES_PLUGIN_ID, port: "workspace" },
      { plugin: GIT_PLUGIN_ID, port: "workspace" },
    ]) {
      platform.wiring.bind({
        board_id: DEMO_BOARD_ID,
        target_plugin_id: target.plugin,
        target_port: target.port,
        source_plugin_id: WORKSPACE_PLUGIN_ID,
        source_port: "workspace",
        origin: "user",
        actor_id: "tester",
      });
    }

    workspaceServices!.outputs.publish({
      port: "workspace",
      content: { kind: "inline", payload: WORKSPACE_REF },
    });
    await platform.wiring.drain();

    assert.deepEqual(filesSaw, [true], "Files 应当收到一次“有工作目录了”");
    assert.deepEqual(gitSaw, ["upstream"], "Git 也绑在同一个源头上");
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Files 捕获的快照到得了 Text stats，数出来的是那一份", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workspace-graph-"));
  try {
    const { store, platform } = project(directory);
    let filesServices: { outputs: Publisher } | undefined;
    const counted: Array<{ content: unknown; content_version: number } | null> = [];

    await platform.start([
      {
        definition: capturing(
          createFilesPlugin({ readable: () => true }),
          (context) => { filesServices = context.services as { outputs: Publisher }; },
        ),
      },
      { definition: createTextStatsPlugin({ onSnapshot: (input) => { counted.push(input); } }) },
    ]);

    platform.wiring.bind({
      board_id: DEMO_BOARD_ID,
      target_plugin_id: TEXT_STATS_PLUGIN_ID,
      target_port: "text",
      source_plugin_id: FILES_PLUGIN_ID,
      source_port: "before",
      origin: "user",
      actor_id: "tester",
    });

    filesServices!.outputs.publish({
      port: "before",
      content: { kind: "inline", payload: snapshot("中文") },
    });
    await platform.wiring.drain();

    assert.equal(counted.length, 1);
    assert.deepEqual(counted[0]?.content, snapshot("中文"));
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("端口声明里的类型两两对得上，连线才可能是合法的", () => {
  const outputs = new Map<string, { type: string; version: number }>();
  const manifests = [
    createWorkspacePlugin().manifest,
    createFilesPlugin().manifest,
    createDiffPlugin().manifest,
    createGitPlugin().manifest,
    createTextStatsPlugin().manifest,
    createCodingPlugin().manifest,
  ];
  for (const manifest of manifests) {
    for (const port of manifest.ports?.outputs ?? []) {
      outputs.set(`${manifest.plugin_id}:${port.port}`, {
        type: port.artifact_type_id,
        version: port.schema_version,
      });
    }
  }
  // Every input type must be produced by somebody; an input for a type nothing
  // publishes is a connection that can never be bound.
  const produced = new Set([...outputs.values()].map((entry) => `${entry.type}@${entry.version}`));
  for (const manifest of manifests) {
    for (const port of manifest.ports?.inputs ?? []) {
      assert.equal(
        produced.has(`${port.artifact_type_id}@${port.schema_version}`),
        true,
        `${manifest.plugin_id}.${port.port} 等的是没人发布的 ${port.artifact_type_id}`,
      );
    }
  }
});

test("每个插件声明的视图都有对应的 contribution", () => {
  for (const definition of [
    createWorkspacePlugin(),
    createFilesPlugin(),
    createDiffPlugin(),
    createGitPlugin(),
    createTextStatsPlugin(),
  ]) {
    const manifest = definition.manifest;
    const declared = new Set(manifest.ui.contributions);
    for (const view of manifest.ui.views ?? []) {
      assert.equal(
        declared.has(view.contribution_id ?? `${manifest.plugin_id}.${view.view_id}`),
        true,
        `${manifest.plugin_id} 的视图 ${view.view_id} 没有对应的 contribution`,
      );
    }
    for (const command of manifest.ui.commands ?? []) {
      assert.equal(
        (manifest.ui.views ?? []).some((view) => view.view_id === command.opens_view_id),
        true,
        `${manifest.plugin_id} 的命令 ${command.command_id} 指向不存在的视图`,
      );
    }
  }
});
