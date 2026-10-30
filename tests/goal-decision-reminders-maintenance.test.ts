import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { GoalProjectApplication } from "./fixtures/goal-application.js";
import { inspectGoalDecisionReminders } from "./fixtures/goal-decision-reminders-maintenance.mjs";

test("RAC-2333 reminder preflight classifies real pending decisions, duplicates, settled and unknown Goals without reading or changing their text", t => {
  const home = mkdtempSync(join(tmpdir(), "goal-reminder-preflight-")), file = join(home, "project.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new LocalProjectDatabase(file), app = new GoalProjectApplication(store);
  // The old orphan is intentional; current subject validation would refuse creating that historical row.
  const attention = new AttentionModule(store.db, { exists: () => true }, { eventSink: () => undefined });
  app.initializeBoard({ project_id: "project", actor_id: "owner", idempotency_key: "init" });
  for (const id of ["pending", "settled"]) app.goalEvents.createIntent({ project_id: "project", goal_id: id, title: "private title must not be returned", outcome: "private outcome", actor_id: "owner", actor_kind: "user", idempotency_key: id, source_kind: "web" });
  app.goalTreeSubmission.submitGoalTreeProposal({ project_id: "project", root_goal_id: "pending", actor_id: "runtime:test:session", summary: "private proposal text", idempotency_key: "proposal",
    items: [{ item_id: "item", kind: "goal", operation: "create", payload: { goal_id: "child", title: "private child", outcome: "private child outcome" }, source_refs: ["runtime"], reason: "private reason", confidence: 1 }] });
  for (const id of ["pending", "settled", "unknown"]) attention.commands.create({ project_id: "project", subject_type: "goal_decision", subject_id: id, reason: "goal_decision" });
  store.close(); const before = readFileSync(file), result = inspectGoalDecisionReminders(file);
  assert.deepEqual(result, { version: 11, unowned: 3, already_owned: 1, assign: 0, duplicate: 1, settled: 1, unknown_subject: 1, unexpected_reason: 0, dismissed_pending: 0 });
  assert.deepEqual(readFileSync(file), before); assert.doesNotMatch(JSON.stringify(result), /private|runtime:test|child|proposal text/u);
});
