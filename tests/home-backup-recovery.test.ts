import { managementGoals } from "./goal-management-caller.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { cp, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";

import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import {
  createMolisWorkLocalHost, molisWorkHostProjectReference,
} from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";

test("offline Home restore preserves Project, Goal history, and Artifact versions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-home-recovery-"));
  const home = join(directory, "home");
  const backup = join(directory, "backup");
  try {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const project = await catalog.createProject({ display_name: "恢复演练项目", actor_id: "user" });
    catalog.close();
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const host = createMolisWorkLocalHost({ instanceId: "backup-source" });
    try {
      await managementGoals(host.actionClient(reference, false), project.project_id).invoke(goalsActions.create, { idempotency_key: "backup-goal",
        goal_id: "retained-goal", title: "保留交接正文", outcome: "恢复后继续工作",
        why: "不能只恢复空壳", business_logic: "保留正文、关系、版本和历史", priority: 50,
      });
    } finally { await host.close(); }

    const source = new LocalProjectDatabase(project.database_path);
    const artifacts = new ArtifactsModule({ db: source.db, appendEvent: event => source.appendEvent(event), eventCursor: projectId => source.eventCursor(projectId) });
    try {
      for (const version of [1, 2]) artifacts.commands.registerVersion({ ...pinnedArtifact(`第${version}版报告`, { kind: "item", id: "report" }, String(version)),
        project_id: project.project_id, artifact_id: "report", version, actor_id: "user",
        artifact_type_id: "example.report", schema_version: 1,
        producer: { plugin_id: "example.writer", plugin_version: "1.0.0", binding_signature: "example-publisher" },
        content: { kind: "inline", payload: { text: `第${version}版报告`, custom: [null, 7, "附件说明"] } },
      });
    } catch (error) { source.close(); throw error; }
    const before = source.snapshot(project.project_id);
    source.close();

    // Offline backup: every product writer is closed. Restore to the original
    // absolute Home path because Catalog records deliberately retain DB paths.
    await cp(home, backup, { recursive: true, errorOnExist: true, force: false });
    await rename(home, join(directory, "offline-original"));
    await cp(backup, home, { recursive: true, errorOnExist: true, force: false });

    const restoredCatalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try { assert.deepEqual(restoredCatalog.getProject(project.project_id), project); }
    finally { restoredCatalog.close(); }
    const restoredHost = createMolisWorkLocalHost({ instanceId: "backup-restored" });
    try {
      const snapshot = await managementGoals(restoredHost.actionClient(reference, false), project.project_id).invoke(goalsActions.snapshot, {});
      assert.deepEqual(snapshot, before, "all Goal facts and event history survive, not only IDs");
      assert.equal(snapshot.goals.find(goal => goal.goal_id === "retained-goal")?.outcome, "恢复后继续工作");
    } finally { await restoredHost.close(); }
    const restored = new LocalProjectDatabase(project.database_path);
    try {
      const reader = new ArtifactsModule({ db: restored.db, appendEvent: event => restored.appendEvent(event), eventCursor: projectId => restored.eventCursor(projectId) });
      assert.deepEqual(reader.query.listArtifactVersions(project.project_id, "report").map(item => item.version).sort(), [1, 2]);
      for (const version of [1, 2]) assert.deepEqual(
        reader.query.getArtifactVersion(project.project_id, { artifact_id: "report", version })?.payload,
        { text: `第${version}版报告`, custom: [null, 7, "附件说明"] },
      );
    } finally { restored.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

