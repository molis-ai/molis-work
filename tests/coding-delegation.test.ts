import assert from "node:assert/strict";
import test from "node:test";

import { projectCheckpoints, projectSubagents } from "@molis-ai/molis-work-plugin-coding";
import type {
  AgentCheckpoint,
  AgentSubagentView,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/** 执行终态归运行时，验收判断归插件——两者不能混。 */

const children: AgentSubagentView[] = [
  { subagent_id: "c1", parent_run: { run_id: "r", session_id: "s" }, role_id: "reader", task: "归类错误码", state: "completed", result: "三种", workspace_path: null },
  { subagent_id: "c2", parent_run: { run_id: "r", session_id: "s" }, role_id: "reader", task: "比对反馈", state: "running", result: null, workspace_path: null },
  { subagent_id: "c3", parent_run: { run_id: "r", session_id: "s" }, role_id: "reader", task: "查日志", state: "failed", result: null, workspace_path: null },
];

test("跑完 ≠ 验收通过：完成但没人判过的会被数出来", () => {
  const view = projectSubagents({ support: "supported", children, verdicts: {} });
  assert.equal(view.awaiting_acceptance, 1, "c1 跑完了但没人说好不好");
  assert.equal(view.rows.find((row) => row.subagent_id === "c1")?.acceptance, undefined);
  // 失败的不算「等验收」——它已经有结论了
  assert.equal(view.rows.find((row) => row.subagent_id === "c3")?.state, "failed");
});

test("用户的判断存在插件这边，不改运行时报的状态", () => {
  const view = projectSubagents({
    support: "supported", children,
    verdicts: { c1: { status: "needs-work", notes: "漏了端口占用那种" } },
  });
  const row = view.rows.find((entry) => entry.subagent_id === "c1");
  assert.equal(row?.acceptance, "needs-work");
  assert.equal(row?.acceptance_notes, "漏了端口占用那种");
  assert.equal(row?.state, "completed", "判成需返工，不会把运行时的「已完成」改掉");
  assert.equal(view.awaiting_acceptance, 0, "判过了就不再等");
});

test("只有还在跑的子代理能被取消", () => {
  const view = projectSubagents({ support: "supported", children, verdicts: {} });
  assert.equal(view.rows.find((row) => row.subagent_id === "c2")?.can_cancel, true);
  assert.equal(view.rows.find((row) => row.subagent_id === "c1")?.can_cancel, false);
  assert.equal(view.rows.find((row) => row.subagent_id === "c3")?.can_cancel, false);
});

test("运行时不支持子代理时如实说明", () => {
  const view = projectSubagents({ support: "unsupported", children, verdicts: {} });
  assert.equal(view.available, false);
  assert.match(view.unavailable_reason ?? "", /不支持子代理/);
  assert.deepEqual(view.rows, []);
});

const checkpoints: AgentCheckpoint[] = [
  { checkpoint_id: "cp1", session_id: "s", label: "改重试之前", created_at: "2026-09-19T14:00:00Z" },
  { checkpoint_id: "cp2", session_id: "s", label: "改文案之前", created_at: "2026-09-19T15:00:00Z" },
];

test("这一轮还在跑时不能回退——不能在 agent 脚下抽地板", () => {
  const view = projectCheckpoints({
    support: "supported", items: checkpoints, restored: [], run_in_flight: true,
  });
  assert.equal(view.can_rewind, false);
  assert.match(view.blocked_reason ?? "", /还在跑/);
  assert.equal(view.items.length, 2, "不能回退不等于看不到");
});

test("跑完之后可以回退，已回退过的会标出来", () => {
  const view = projectCheckpoints({
    support: "supported", items: checkpoints, restored: ["cp1"], run_in_flight: false,
  });
  assert.equal(view.can_rewind, true);
  assert.equal(view.phase, "ready");
  assert.equal(view.items.find((item) => item.checkpoint_id === "cp1")?.restored, true);
  assert.equal(view.items.find((item) => item.checkpoint_id === "cp2")?.restored, false);
});

test("一个检查点都没有时说清楚，而不是给个能点的空按钮", () => {
  const view = projectCheckpoints({
    support: "supported", items: [], restored: [], run_in_flight: false,
  });
  assert.equal(view.phase, "empty");
  assert.equal(view.can_rewind, false);
  assert.match(view.blocked_reason ?? "", /还没有检查点/);
});

test("运行时不支持检查点时如实说明", () => {
  const view = projectCheckpoints({
    support: "unsupported", items: checkpoints, restored: [], run_in_flight: false,
  });
  assert.equal(view.phase, "unavailable");
  assert.match(view.unavailable_reason ?? "", /不支持检查点/);
  assert.deepEqual(view.items, []);
});
