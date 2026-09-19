import assert from "node:assert/strict";
import test from "node:test";

import {
  isDecidable,
  renderAgentReviewSurface,
  reviewPhase,
  type AgentReviewPrimitives,
  type AgentReviewRow,
} from "@molis-ai/molis-work-app-workbench";

/** C4 的验收：批准不等于已发生，已决定的不能再决定一次。 */

const p: AgentReviewPrimitives = {
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  formatDate: (value) => value.slice(0, 10),
};

function row(overrides: Partial<AgentReviewRow> = {}): AgentReviewRow {
  return {
    request: {
      review_id: "r1",
      run: { run_id: "run-1", session_id: "s-1" },
      board_id: "board-a",
      plugin_id: "io.molis.work.coding",
      kind: "text-edit",
      document: {
        kind: "text-edit",
        target_path: "apps/local-host/src/connect.ts",
        exists: true,
        before_text: "old",
        after_text: "new",
      },
      requested_at: "2026-09-19T14:00:00Z",
      expires_at: null,
    },
    ...overrides,
  };
}

function receipt(overrides: Partial<AgentReviewRow["receipt"] & object> = {}) {
  return {
    review_id: "r1",
    status: "approved" as const,
    decided_by: "user",
    decided_at: "2026-09-19T14:05:00Z",
    note: null,
    effect_settled: false,
    effect_error: null,
    ...overrides,
  };
}

test("批准之后、真实回执之前，是「已批准，尚未发生」，不是「已完成」", () => {
  const approved = row({ receipt: receipt() });
  assert.equal(reviewPhase(approved), "approved");
  const html = renderAgentReviewSurface({ rows: [approved], primitives: p });
  assert.match(html, /已批准，尚未发生/);
  assert.doesNotMatch(html, /已完成/);
});

test("拿到真实回执才是已完成", () => {
  const done = row({ receipt: receipt({ effect_settled: true }) });
  assert.equal(reviewPhase(done), "done");
  assert.match(renderAgentReviewSurface({ rows: [done], primitives: p }), /已完成/);
});

test("批准了但执行失败，如实显示失败而不是成功", () => {
  const failed = row({ receipt: receipt({ effect_error: "磁盘只读" }) });
  assert.equal(reviewPhase(failed), "failed");
  const html = renderAgentReviewSurface({ rows: [failed], primitives: p });
  assert.match(html, /已批准，但执行失败/);
  assert.match(html, /磁盘只读/);
});

test("只有待决定的条目才给动作按钮：已决定的不能换个入口再批一次", () => {
  const pending = row();
  assert.equal(isDecidable(pending), true);
  assert.match(renderAgentReviewSurface({ rows: [pending], primitives: p }), /data-agent-review-approve="r1"/);

  for (const status of ["approved", "rejected", "cancelled", "expired"] as const) {
    const settled = row({ receipt: receipt({ status }) });
    assert.equal(isDecidable(settled), false, `${status} 不该还能决定`);
    const html = renderAgentReviewSurface({ rows: [settled], primitives: p });
    assert.doesNotMatch(html, /data-agent-review-approve/, `${status} 不该有批准按钮`);
    assert.doesNotMatch(html, /data-agent-review-reject/, `${status} 不该有拒绝按钮`);
  }
});

test("待审内容里的标记被转义", () => {
  const nasty = row();
  nasty.request.document = {
    kind: "text-edit",
    target_path: "<script>x</script>.ts",
    exists: false,
    before_text: null,
    after_text: '<img src=x onerror="alert(1)">',
  };
  const html = renderAgentReviewSurface({ rows: [nasty], primitives: p });
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<script>x</script>"), false);
  assert.match(html, /&lt;img src=x/);
});

test("展不开的操作类型照样列出来，不会被悄悄丢掉", () => {
  const unknown = row();
  unknown.request.document = { kind: "rewind" } as never;
  const html = renderAgentReviewSurface({ rows: [unknown], primitives: p });
  assert.match(html, /data-agent-review-kind="rewind"/);
  assert.match(html, /批准前请先确认/);
});

test("没有待决定的操作时给出干净的空状态", () => {
  assert.match(renderAgentReviewSurface({ rows: [], primitives: p }), /没有待决定的操作/);
});
