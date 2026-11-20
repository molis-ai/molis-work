import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { managementGoals } from "./goal-management-caller.js";
import { createStandaloneProject } from "./fixtures/standalone-project.js";

test("PG094-CLI-02 PG094-CLI-03 a Home-free project runs Goals and creates no substitute Home", async t => {
  const root = await mkdtemp(join(tmpdir(), "cli-personal-unavailable-")), home = join(root, "unused-home"), database = join(root, "standalone", "project.db");
  const host = createMolisWorkLocalHost({ completeText: null }), projectId = "no-home-personal";
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  await createStandaloneProject(database, projectId);
  const reference = molisWorkHostProjectReference({ databasePath: database, projectId });
  const actions = managementGoals(host.actionClient(reference), projectId);
  await actions.invoke(goalsActions.initialize, { idempotency_key: "initialize" });
  await actions.invoke(goalsActions.create, { goal_id: "retained", title: "Keep this project fact", idempotency_key: "retained" });
  assert.ok((await actions.invoke(goalsActions.snapshot, {})).goals.some(goal => goal.goal_id === "retained"));
  await assert.rejects(stat(home), { code: "ENOENT" }, "no substitute Home was created");
});
