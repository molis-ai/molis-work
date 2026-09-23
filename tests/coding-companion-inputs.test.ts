import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { DEMO_BOARD_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createWorkspacePlugin } from "@molis-ai/molis-work-plugin-workspace";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { createGitPlugin } from "@molis-ai/molis-work-plugin-git";
import { createDiffPlugin } from "../plugins/native/diff/src/plugin.js";
import { createTextStatsPlugin } from "../plugins/native/text-stats/src/plugin.js";

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "coding-companion-inputs-"));
  const databasePath = join(directory, "project.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const platform = createPluginPlatform({ board_id: DEMO_BOARD_ID, actor_id: "tester", db: store.db,
    artifacts, ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const contexts = new Map<string, PluginStartContext>();
  const capture = (definition: PluginDefinition): PluginDefinition => ({ ...definition, async start(context) {
    contexts.set(context.plugin_id, context);
    return definition.start(context);
  } });
  const report = await platform.start([createWorkspacePlugin(), createFilesPlugin(), createGitPlugin(), createDiffPlugin(), createTextStatsPlugin()]
    .map(definition => ({ definition: capture(definition) })));
  assert.deepEqual(report.failed, []); assert.deepEqual(report.blocked, []);
  const bind = (target: string, targetPort: string, source: string, sourcePort: string) => platform.wiring.bind({
    board_id: DEMO_BOARD_ID, actor_id: "tester", target_plugin_id: `io.molis.work.${target}`, target_port: targetPort,
    source_plugin_id: `io.molis.work.${source}`, source_port: sourcePort, origin: "user",
  });
  bind("files", "workspace", "workspace", "workspace");
  bind("git", "workspace", "workspace", "workspace");
  bind("diff", "git_changeset", "git", "changeset");
  bind("text-stats", "text", "files", "before");
  const outputs = (plugin: string) => contexts.get(`io.molis.work.${plugin}`)!.services!.outputs!;
  outputs("workspace").publish({ port: "workspace", content: { kind: "inline", payload: { workspace_id: "ws", name: "项目", handle: "ws" } } });
  await platform.wiring.drain();
  const state = async (plugin: string) => {
    const response = await platform.router().dispatch({ method: "GET", pathname: `/api/plugins/io.molis.work.${plugin}/state`, actor_id: "tester", query: {} });
    assert.equal(response?.status, 200);
    return (response!.body as { view: Record<string, any> }).view;
  };
  return { artifacts, platform, outputs, state, close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("Diff consumes its selected Git input group and preserves that group while input is missing", async () => {
  const host = await fixture();
  try {
    host.platform.wiring.selectInputGroup("io.molis.work.diff", "git-change-set");
    await host.platform.wiring.drain();
    const waiting = await host.state("diff");
    assert.equal(waiting.phase, "waiting"); assert.equal(waiting.group, "git-change-set");
    host.outputs("git").publish({ port: "changeset", content: { kind: "inline", payload: {
      workspace: { workspace_id: "ws", name: "项目" }, path: ["note.txt"], before_exists: true, after_exists: true,
      before: "old\n", after: "new\n", source: { kind: "comparison", comparison_id: "fixed-git-diff" },
    } } });
    await host.platform.wiring.drain();
    const ready = await host.state("diff");
    assert.equal(ready.phase, "ready"); assert.equal(ready.group, "git-change-set");
    assert.deepEqual(ready.rows.map((row: { kind: string; text: string }) => [row.kind, row.text]), [["delete", "old"], ["insert", "new"]]);
    host.outputs("git").invalidate("changeset", "重新选择原变更");
    await host.platform.wiring.drain();
    const invalidated = await host.state("diff");
    assert.equal(invalidated.phase, "waiting"); assert.equal(invalidated.group, "git-change-set");
    assert.deepEqual(invalidated.rows, []);
  } finally { host.close(); }
});

test("Text Stats never counts retained payload from an unavailable or archived Artifact", async () => {
  const host = await fixture();
  try {
    assert.equal((await host.state("text-stats")).phase, "waiting");
    const publish = () => host.outputs("files").publish({ port: "before", content: { kind: "inline", payload: {
      workspace: { workspace_id: "ws", name: "项目" }, path: ["note.txt"], text: "中文🙂\n",
    } } }).artifact;
    const first = publish(); await host.platform.wiring.drain();
    const ready = await host.state("text-stats");
    assert.equal(ready.phase, "ready"); assert.equal(ready.characters, 4); assert.equal(ready.utf8_bytes, 11); assert.equal(ready.lines, 1);
    host.artifacts.commands.markUnavailable({ board_id: DEMO_BOARD_ID, actor_id: "tester", artifact_id: first.artifact_id, version: first.version, reason: "原内容不可读取" });
    const unavailable = await host.state("text-stats");
    assert.equal(unavailable.phase, "unavailable"); assert.equal(unavailable.characters, undefined); assert.equal(unavailable.source, undefined);
    const second = publish(); await host.platform.wiring.drain();
    assert.equal((await host.state("text-stats")).phase, "ready");
    host.artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "tester", artifact_id: second.artifact_id, version: second.version });
    const archived = await host.state("text-stats");
    assert.equal(archived.phase, "unavailable"); assert.equal(archived.characters, undefined); assert.equal(archived.source, undefined);
  } finally { host.close(); }
});
