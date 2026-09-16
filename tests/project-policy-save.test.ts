import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalsModule, DEFAULT_GOAL_POLICY } from "@molis-ai/molis-work-module-goals";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("project policy saves atomically replace history, replay lost responses, and reject invalid or unconfirmed changes", t => {
  const directory = mkdtempSync(join(tmpdir(), "project-policy-"));
  const store = new LocalProjectDatabase(join(directory, "project.sqlite"));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const goals = new GoalsModule(store.db, {});
  goals.commands.initializeBoard({ board_id: "project", title: "项目规则", actor_id: "user", idempotency_key: "init" });
  const input = { board_id: "project", actor_id: "user", reason: "执行前说明目标", user_confirmed: true,
    policy: { ...DEFAULT_GOAL_POLICY, goal_mode: "required" as const }, idempotency_key: "save-one" };
  const first = goals.commands.saveProjectPolicy(input);
  const replay = goals.commands.saveProjectPolicy(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.policy_binding_id, first.policy_binding_id);
  assert.equal(replay.observed_event_cursor, first.observed_event_cursor);
  assert.equal(goals.query.listPolicyHistory("project").length, 1);
  const second = goals.commands.saveProjectPolicy({ ...input, idempotency_key: "save-two", reason: "增加独立复核", policy: { ...input.policy, cross_reviewers: 2 } });
  const history = goals.query.listPolicyHistory("project");
  assert.equal(history.find(row => row.policy_binding_id === first.policy_binding_id)?.state, "replaced");
  const active = history.find(row => row.policy_binding_id === second.policy_binding_id)!;
  assert.equal(active.state, "active");
  assert.equal(active.policy.cross_reviewers, 2);
  assert.equal(active.reason, "增加独立复核");
  const beforeEvents = store.snapshot("project").cursor;
  for (const invalid of [
    { ...input, user_confirmed: false },
    { ...input, reason: " " },
    { ...input, policy: { ...input.policy, cross_reviewers: -1 } },
    { ...input, policy: { ...input.policy, max_lease_seconds: 0 } },
    { ...input, policy: { ...input.policy, human_approval: "false" as unknown as boolean } },
  ]) {
    assert.throws(() => goals.commands.saveProjectPolicy({ ...invalid, idempotency_key: "invalid" }));
  }
  assert.throws(() => goals.commands.saveProjectPolicy({ ...input, policy: { ...input.policy, max_lease_seconds: 99 } }), /幂等键/);
  assert.deepEqual(goals.query.listPolicyHistory("project"), history);
  assert.equal(store.snapshot("project").cursor, beforeEvents);
});
