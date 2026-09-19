import assert from "node:assert/strict";
import test from "node:test";

import { renderPendingQuestionCard, type CodingUiPrimitives } from "@molis-ai/molis-work-plugin-coding";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-host";

/** 设计 §6：单选/自由输入都支持，**不代填答案**，离开不等于取消。 */

const p: CodingUiPrimitives = {
  L: (text) => text,
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value) => value,
  formatDate: (value) => value.slice(0, 10),
};

const choice: AgentPendingQuestion = {
  pending_id: "q1",
  kind: "plan-choice",
  prompt: "连接失败时应该重试三次还是立刻报错？",
  options: [
    { value: "retry", label: "重试三次" },
    { value: "fail", label: "立刻报错" },
  ],
  allows_free_text: true,
};

test("问题原样显示，选项都在，而且一个都没预选", () => {
  const html = renderPendingQuestionCard({ questions: [choice], primitives: p });
  assert.match(html, /连接失败时应该重试三次还是立刻报错？/);
  assert.match(html, /value="retry"/);
  assert.match(html, /value="fail"/);
  // 这是硬边界：预填的答案是用户没给过的答案，而执行会照它动作
  assert.doesNotMatch(html, /checked/, "任何选项都不能预选");
  assert.doesNotMatch(html, /selected/, "任何选项都不能预选");
});

test("不提供关闭/忽略——离开不等于取消", () => {
  const html = renderPendingQuestionCard({ questions: [choice], primitives: p });
  for (const forbidden of [/data-coding-question-dismiss/, /忽略/, /跳过/, /稍后再说/]) {
    assert.doesNotMatch(html, forbidden, `不该出现 ${forbidden}`);
  }
  assert.match(html, /data-coding-answer-submit="q1"/, "只有一个出口：提交回答");
});

test("运行时不接受自由输入时，就不给输入框", () => {
  const optionsOnly: AgentPendingQuestion = { ...choice, allows_free_text: false };
  const html = renderPendingQuestionCard({ questions: [optionsOnly], primitives: p });
  assert.doesNotMatch(html, /<textarea/, "不接受的输入不该邀请用户去填");
  assert.match(html, /value="retry"/);
});

test("没有选项时是纯自由输入，不画一个空的选项组", () => {
  const free: AgentPendingQuestion = {
    pending_id: "q2", kind: "clarify", prompt: "你想先修哪一个？", options: [], allows_free_text: true,
  };
  const html = renderPendingQuestionCard({ questions: [free], primitives: p });
  assert.match(html, /<textarea/);
  assert.doesNotMatch(html, /<fieldset/, "没有选项就不该有选项组");
  assert.match(html, /你的回答/);
});

test("多条问题各自成卡，id 不串", () => {
  const second: AgentPendingQuestion = { ...choice, pending_id: "q2", prompt: "另一个问题" };
  const html = renderPendingQuestionCard({ questions: [choice, second], primitives: p });
  assert.match(html, /data-coding-question="q1"/);
  assert.match(html, /data-coding-question="q2"/);
  assert.match(html, /name="coding-answer-q1"/);
  assert.match(html, /name="coding-answer-q2"/);
});

test("没有待答问题时什么都不画", () => {
  assert.equal(renderPendingQuestionCard({ questions: [], primitives: p }), "");
});

test("问题与选项里的标记被转义", () => {
  const nasty: AgentPendingQuestion = {
    pending_id: "q1", kind: "clarify",
    prompt: '<img src=x onerror="alert(1)">',
    options: [{ value: "<script>", label: "<b>粗体</b>" }],
    allows_free_text: false,
  };
  const html = renderPendingQuestionCard({ questions: [nasty], primitives: p });
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<b>粗体</b>"), false);
  assert.match(html, /&lt;img src=x/);
});
