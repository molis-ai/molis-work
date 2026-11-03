import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { initializeBoard } from "./fixtures/goals-board.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";

const PROJECT = "project";
const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: ["inbox:read"] };

test("PG094-08 Goals settles a decision reminder when it writes and catches up once when the project opens, not on each read", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-decision-attention-open-"));
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: PROJECT });
  // Goal-decision reminders are Goals' own entries (Inbox lists the unassigned ones), so they are read where Attention keeps them. The
  // catch-up is the installation's own job after the project opens; a Goals call waits for it, so the first read of a reopened project is one.
  const decisions = async (host: MolisWorkLocalHost) => {
    await bindActionClient(host.actionClient(reference), () => ({ ...caller, permissions: ["goals:read"] })).invoke(goalsActions.list, {});
    return host.withProject(reference, runtime => runtime.store.db.prepare(
      "SELECT subject_id, status FROM inbox_entries WHERE project_id = ? AND owner_plugin_id = ? AND subject_type = 'goal_decision' ORDER BY subject_id").all(PROJECT, GOALS_PLUGIN_ID)
      .map(row => ({ ...(row as { subject_id: string; status: string }) })));
  };
  const first = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let second: MolisWorkLocalHost | undefined;
  try {
    // The project opens before Goals has a board; the catch-up has nothing to read yet and the project still opens.
    await initializeBoard(first, reference, { actor_id: "web-user", idempotency_key: "init" });
    await first.withProject(reference, runtime => {
      goalApplicationOf(runtime).goalEvents.createIntent({ project_id: PROJECT, goal_id: "root", title: "根目标", outcome: "保留待判断",
        actor_id: "web-user", actor_kind: "user", idempotency_key: "root-intent", source_kind: "web" });
      goalApplicationOf(runtime).goalTreeSubmission.submitGoalTreeProposal({ project_id: PROJECT, actor_id: "runtime:test:session", root_goal_id: "root",
        summary: "新增子目标", items: [{ item_id: "child-item", kind: "goal", operation: "create", payload: { goal_id: "child", title: "子目标", outcome: "子目标结果" },
          source_refs: ["runtime"], reason: "用户确认后创建", confidence: 1 }], idempotency_key: "propose" });
    });
    // The submission itself opened the reminder.
    assert.deepEqual(await decisions(first), [{ subject_id: "root", status: "open" }]);
    // A reminder lost outside Goals' writes stays lost while the project is open: reading Inbox does not reconcile.
    await first.withProject(reference, runtime => runtime.store.db.prepare("DELETE FROM inbox_entries WHERE project_id = ? AND subject_type = 'goal_decision'").run(PROJECT));
    assert.deepEqual(await decisions(first), []);
    await first.close();
    // The next time the project opens, Goals catches it up once.
    second = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    assert.deepEqual(await decisions(second), [{ subject_id: "root", status: "open" }]);
  } finally {
    await first.close();
    await second?.close();
    await rm(home, { recursive: true, force: true });
  }
});
