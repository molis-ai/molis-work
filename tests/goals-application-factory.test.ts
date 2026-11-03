import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filesActions } from "@molis-ai/molis-work-plugin-files";
import * as goals from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { initializeBoard } from "./fixtures/goals-board.js";

// The classes Goals composes for itself: how a goal tree's proposals are read, checked, decided and turned into Goal facts.
const INNER_CLASSES = ["GoalEventApplication", "GoalReadApplication", "GoalDecisionAttentionSync", "GoalTreeQueryApplication",
  "GoalTreeSubmissionApplication", "GoalTreeInputReader", "GoalTreeFactMaterializer", "GoalTreeMaterializationConflicts",
  "GoalTreeMaterializationApplication", "GoalTreeCheckApplication", "GoalTreeDecisionNormalizer", "GoalTreeDecisionFollowup",
  "GoalTreeDecisionApplication"];

test("PG094-07 Goals hands out the factory that composes its application, not the classes inside it", () => {
  assert.equal(typeof goals.createGoalsApplication, "function");
  for (const name of INNER_CLASSES) assert.equal(name in goals, false, `${name} stays inside the Goals package`);
});

test("PG094-07 a project's runtime and its plugin platform write through one pair of version stores", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-application-factory-"));
  await writeFile(join(home, "note.txt"), "固定\n");
  const workspace = { workspace_id: "fixture", canonical_path: await realpath(home), display_name: "Fixture", realpath_verified: true };
  // The runtime's pair keeps the Host's clock; a second pair inside the platform would stamp the machine's time instead.
  const fixed = new Date("2031-02-03T04:05:06.000Z");
  const host = new MolisWorkLocalHost({ homeDirectory: join(home, "molis-home"), completeText: null, clock: () => fixed, workspacesFor: async () => [workspace] });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project" });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: "project", audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private", "workspace:read"] };
  const bound = bindActionClient(host.actionClient(reference), () => caller);
  try {
    await initializeBoard(host, reference, { actor_id: caller.actor_id, idempotency_key: "init" });
    const opened = await bound.invoke(filesActions.open, { workspace_id: "fixture", path: ["note.txt"] });
    if (opened.result.outcome !== "text") throw new Error("expected text");
    // Files is a plugin on the project's platform; what it captures is a process item the platform writes.
    const captured = await bound.invoke(filesActions.capture, { workspace_id: "fixture", path: ["note.txt"], port: "before", fingerprint: opened.result.fingerprint });
    assert.equal(captured.saved.artifact.created_at, fixed.toISOString());
    const read = await host.withProject(reference, runtime => runtime.processItems.query.getArtifactVersion("project",
      { artifact_id: captured.saved.artifact.artifact_id, version: captured.saved.artifact.version }));
    assert.equal(read?.created_at, fixed.toISOString());
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
