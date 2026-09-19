import assert from "node:assert/strict";
import test from "node:test";

import {
  renderPendingReviewCard,
  type CodingPendingReview,
  type CodingUiPrimitives,
} from "@molis-ai/molis-work-plugin-coding";

const p: CodingUiPrimitives = {
  L: (text) => text,
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value) => value,
  formatDate: (value) => value.slice(0, 10),
};

const pending: CodingPendingReview[] = [
  { review_id: "r1", kind: "text-edit", summary: "把 connect.ts 的重试次数从 0 改成 3" },
  { review_id: "r2", kind: "command", summary: "运行 pnpm test" },
];

test("卡片只做摘要和引路，不提供任何就地放行", () => {
  const html = renderPendingReviewCard({ pending, review_href: "/reviews", primitives: p });
  assert.match(html, /2 项操作等你决定/);
  assert.match(html, /查看并处理/);
  assert.match(html, /href="\/reviews"/);
  // 硬边界查的是**控件**，不是文字——说明里出现「批准」两个字是应该的
  const controls = html.match(/<(button|input)\b[^>]*>/g) ?? [];
  assert.deepEqual(controls, [], "卡片上不能有任何按钮或输入控件");
  const links = html.match(/<a\b[^>]*>/g) ?? [];
  assert.equal(links.length, 1, "只有一条出口：去宿主审查面");
  assert.match(links[0]!, /href="\/reviews"/);
  for (const forbidden of [/data-approve/, /data-reject/, /全部放行/, /下次不再询问/]) {
    assert.doesNotMatch(html, forbidden, `卡片上不该出现 ${forbidden}`);
  }
  assert.match(html, /在你批准之前，这些操作不会发生/);
});

test("没有待审时什么都不画，不在对话中间插一句「没有待办」", () => {
  assert.equal(renderPendingReviewCard({ pending: [], review_href: "/reviews", primitives: p }), "");
});

test("超过三项时如实说还有多少，不悄悄截断", () => {
  const many = Array.from({ length: 7 }, (_, index): CodingPendingReview => ({
    review_id: `r${index}`, kind: "text-edit", summary: `改动 ${index}`,
  }));
  const html = renderPendingReviewCard({ pending: many, review_href: "/reviews", primitives: p });
  assert.match(html, /7 项操作等你决定/);
  assert.match(html, /还有 4 项/);
});

test("摘要里的标记被转义", () => {
  const nasty: CodingPendingReview[] = [
    { review_id: "r1", kind: "command", summary: '<img src=x onerror="alert(1)">' },
  ];
  const html = renderPendingReviewCard({ pending: nasty, review_href: "/reviews", primitives: p });
  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /&lt;img src=x/);
});

test("每种操作类型都有中文说法，不直接把内部 kind 甩给用户", () => {
  const kinds: CodingPendingReview["kind"][] = ["text-edit", "command", "tool-operation", "mcp", "rewind"];
  for (const kind of kinds) {
    const html = renderPendingReviewCard({
      pending: [{ review_id: "r", kind, summary: "x" }], review_href: "/r", primitives: p,
    });
    assert.doesNotMatch(html, new RegExp(`coding-review-kind">${kind}<`), `${kind} 不该原样显示`);
  }
});
