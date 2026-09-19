import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import {
  DEMO_BOARD_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { CODING_PLUGIN_ID, codingManifest, createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";

/** 命令要么能做事，要么说清为什么不能——不给一个点了没反应的入口。 */

function platformFor(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const platform = createPluginPlatform({
    board_id: DEMO_BOARD_ID, actor_id: "tester", db: store.db,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: (event) => store.appendEvent(event) }),
    ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  return { store, platform };
}

test("声明的命令都有 opens_view_id，指向真实存在的视图", () => {
  const views = new Set((codingManifest.ui.views ?? []).map((view) => view.view_id));
  const commands = codingManifest.ui.commands ?? [];
  assert.equal(commands.length > 0, true, "设计 §5 要求这些入口存在");
  for (const command of commands) {
    assert.equal(views.has(command.opens_view_id), true,
      `${command.command_id} 指向的 ${command.opens_view_id} 不是已声明视图`);
    assert.equal(command.input_kinds.length > 0, true, `${command.command_id} 得说清作用于什么`);
  }
});

test("没有可打开对象时，对象类命令说明原因而不是静默", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-commands-"));
  try {
    const { store, platform } = platformFor(directory);
    await platform.start([{ definition: createCodingPlugin() }]);
    const contribution = platform.supervisor.contribution(CODING_PLUGIN_ID) as {
      commandAvailability?(id: string): { available: boolean; reason?: string };
    };
    assert.equal(contribution.commandAvailability?.("coding.new-session").available, true);
    const changeset = contribution.commandAvailability?.("coding.open-changeset");
    assert.equal(changeset?.available, false);
    assert.match(changeset?.reason ?? "", /还没有可打开的对象/);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("命令作用于交给它的对象，而不是当前碰巧开着的那个", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-commands-"));
  try {
    const { store, platform } = platformFor(directory);
    await platform.start([{
      definition: createCodingPlugin({ hasObject: () => ({ available: true }) }),
    }]);
    const contribution = platform.supervisor.contribution(CODING_PLUGIN_ID) as {
      executeCommand?(id: string, input: unknown): { ref: { object_id: string } };
    };
    const opened = contribution.executeCommand?.("coding.open-changeset",
      { kind: "agent-session", session_id: "session-42" });
    assert.equal(opened?.ref.object_id, "session-42");

    const fromArtifact = contribution.executeCommand?.("coding.open-report",
      { kind: "artifacts", references: [{ artifact_id: "report-7", version: 1 }] });
    assert.equal(fromArtifact?.ref.object_id, "report-7");
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("未知命令报不可用，而不是假装能开", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-commands-"));
  try {
    const { store, platform } = platformFor(directory);
    await platform.start([{ definition: createCodingPlugin() }]);
    const contribution = platform.supervisor.contribution(CODING_PLUGIN_ID) as {
      commandAvailability?(id: string): { available: boolean; reason?: string };
    };
    const unknown = contribution.commandAvailability?.("coding.nope");
    assert.equal(unknown?.available, false);
    assert.match(unknown?.reason ?? "", /未知命令/);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
