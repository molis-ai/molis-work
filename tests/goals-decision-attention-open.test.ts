import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

const PROJECT = "project";
const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: ["inbox:read"] };

test("PG094-08 Goals settles a decision reminder when it writes and catches up once when the project opens, not on each read", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-decision-attention-open-"));
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: PROJECT });
  const decisions = async (host: MolisWorkLocalHost) => (await bindActionClient(host.actionClient(reference), () => caller).invoke(inboxActions.list, {}))
    .entries.filter(entry => entry.subject_type === "goal_decision").map(entry => ({ subject_id: entry.subject_id, status: entry.status }));
  const first = new MolisWorkLocalHost({ completeText: null });
  let second: MolisWorkLocalHost | undefined;
  try {
    // The project opens before Goals has a board; the catch-up has nothing to read yet and the project still opens.
    await first.withProject(reference, runtime => runtime.coordinator.initializeBoard({ project_id: PROJECT, actor_id: "web-user", idempotency_key: "init" }));
    await first.withProject(reference, runtime => {
      runtime.coordinator.goalEvents.createIntent({ project_id: PROJECT, goal_id: "root", title: "根目标", outcome: "保留待判断",
        actor_id: "web-user", actor_kind: "user", idempotency_key: "root-intent", source_kind: "web" });
      runtime.coordinator.goalTreeSubmission.submitGoalTreeProposal({ project_id: PROJECT, actor_id: "runtime:test:session", root_goal_id: "root",
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
    second = new MolisWorkLocalHost({ completeText: null });
    assert.deepEqual(await decisions(second), [{ subject_id: "root", status: "open" }]);
  } finally {
    await first.close();
    await second?.close();
    await rm(home, { recursive: true, force: true });
  }
});
