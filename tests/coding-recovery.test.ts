import assert from "node:assert/strict";
import test from "node:test";

import { projectRecovery, type RecoverableRun } from "@molis-ai/molis-work-plugin-coding";
import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

/** 中断之后能捡回什么——捡不回的要说出来，草稿只来自本地存的意图。 */

const runs: RecoverableRun[] = [
  { run_id: "r1", phase: "awaiting-input", started_at: "2026-09-19T14:00:00Z" },
  { run_id: "r2", phase: "completed", started_at: "2026-09-19T13:00:00Z" },
];

function review(id: string, expires: string | null): AgentReviewRequest {
  return {
    review_id: id,
    run: { run_id: "r1", session_id: "s1" },
    board_id: "b", plugin_id: "io.molis.work.coding", kind: "text-edit",
    document: { kind: "text-edit", target_path: "a.ts", exists: true, before_text: null, after_text: "x" },
    requested_at: "2026-09-19T14:00:00Z",
    expires_at: expires,
  };
}

const base = {
  supports_resume: true,
  runs,
  reviews: [] as AgentReviewRequest[],
  stored_intent: null,
  lost_run_ids: [] as string[],
  unsettled_effect_ids: [] as string[],
};

test("能继续的只有还活着的轮次；已完成的不算", () => {
  const view = projectRecovery(base);
  assert.equal(view.phase, "ready");
  assert.equal(view.can_resume, true, "r1 停在等输入，可以继续");

  const onlyDone = projectRecovery({ ...base, runs: [runs[1]!] });
  assert.equal(onlyDone.can_resume, false, "已完成的轮次没什么可继续的");
});

test("运行时那边丢掉的轮次会被列成缺口，而不是当作没发生过", () => {
  const view = projectRecovery({ ...base, lost_run_ids: ["r1"] });
  assert.equal(view.gaps.length, 1);
  assert.equal(view.gaps[0]?.kind, "run");
  assert.match(view.gaps[0]?.message ?? "", /r1/);
  assert.equal(view.runs.find((run) => run.run_id === "r1"), undefined, "丢了的就不再列为可继续");
});

test("批准过但没有回执的副作用，明确说「无法确定是否发生」", () => {
  const view = projectRecovery({ ...base, unsettled_effect_ids: ["e1"] });
  const gap = view.gaps.find((entry) => entry.kind === "effect");
  assert.match(gap?.message ?? "", /无法确定它是否发生/,
    "中断之后这件事不能往任何一边假设");
});

test("过期的待审列为缺口，需要重新提出", () => {
  const view = projectRecovery({
    ...base,
    reviews: [review("rev1", "2020-01-01T00:00:00Z"), review("rev2", null)],
  });
  const pending = view.gaps.filter((entry) => entry.kind === "pending");
  assert.equal(pending.length, 1);
  assert.match(pending[0]?.message ?? "", /rev1/);
  assert.equal(view.reviews.length, 2, "列为缺口不等于从列表里抹掉");
});

test("草稿只来自本地存的意图，运行时不支持恢复时也还在", () => {
  const view = projectRecovery({
    ...base, supports_resume: false, stored_intent: "把重试次数改成 3",
  });
  assert.equal(view.phase, "unavailable");
  assert.match(view.unavailable_reason ?? "", /不支持恢复会话/);
  assert.equal(view.draft, "把重试次数改成 3", "草稿是我们自己的，不依赖运行时");
  assert.equal(view.can_resume, false);
  assert.deepEqual(view.runs, []);
});

test("没存过意图就没有草稿——不凭空造一个用户没写过的", () => {
  assert.equal(projectRecovery(base).draft, null);
});

test("什么都没有时如实说没得可恢复", () => {
  const view = projectRecovery({ ...base, runs: [] });
  assert.equal(view.phase, "nothing-to-recover");
  assert.equal(view.can_resume, false);
});
