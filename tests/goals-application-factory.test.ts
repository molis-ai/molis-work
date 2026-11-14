import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materialsActions, type MaterialsCaptureResult } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { createHash } from "node:crypto";
import * as goals from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { catalogPorts, catalogProject } from "./fixtures/catalog-host.js";
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
  const molisHome = join(home, "molis-home");
  const { projectId, reference, workspace } = await catalogProject(molisHome, { plugins: ["diff"], output: await realpath(home) });
  // The runtime's pair keeps the Host's clock; a second pair inside the platform would stamp the machine's time instead.
  const fixed = new Date("2031-02-03T04:05:06.000Z");
  const folders = catalogPorts(molisHome);
  const host = new MolisWorkLocalHost({ homeDirectory: molisHome, completeText: null, clock: () => fixed, ...folders.ports });
  folders.attach(host);
  const caller: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private", "workspace:read"] };
  const bound = bindActionClient(host.actionClient(reference), () => caller);
  try {
    await initializeBoard(host, reference, { actor_id: caller.actor_id, idempotency_key: "init" });
    // The materials service fixes the file as a process item and hands it on at Diff's port on the project's platform, in one commit.
    const captured = await bound.invoke(materialsActions.capture, { workspace_id: workspace.workspace_id, path: ["note.txt"], port: "before",
      fingerprint: createHash("sha256").update("固定\n").digest("hex") }) as MaterialsCaptureResult;
    const version = captured.ref.pin.mode === "snapshot" ? captured.ref.pin.version : assert.fail("a snapshot");
    const read = await host.withProject(reference, runtime => runtime.processItems.query.getArtifactVersion(projectId, version));
    assert.equal(read?.created_at, fixed.toISOString());
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
