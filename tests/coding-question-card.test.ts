import assert from "node:assert/strict";
import test from "node:test";

import { agentQuestionHtml } from "@molis-ai/molis-work-app-local-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/**
 * 设计 §6：单选/自由输入都支持，**不代填答案**，离开不等于取消。Coding 的待答问题与助理用同一张问卷卡，由宿主画
 * （specs/ai-interaction-experience A2）；这些规则原来钉在 Coding 自己的卡上，现在钉在这张共享的卡上。
 */

const say = (text: string) => text;

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
  const html = agentQuestionHtml(choice, say);
  assert.match(html, /连接失败时应该重试三次还是立刻报错？/);
  assert.match(html, /data-ix-option="retry"/);
  assert.match(html, /data-ix-option="fail"/);
  // 这是硬边界：预填的答案是用户没给过的答案，而执行会照它动作
  assert.doesNotMatch(html, /aria-checked="true"|aria-pressed="true"|\schecked[\s>=]|\sselected[\s>=]/, "任何选项都不能预选");
});

test("不提供关闭/忽略——离开不等于取消", () => {
  const html = agentQuestionHtml(choice, say);
  for (const forbidden of [/忽略/, /跳过/, /稍后再说/, /data-ix-action="(?!answer")/]) {
    assert.doesNotMatch(html, forbidden, `不该出现 ${forbidden}`);
  }
  assert.match(html, /data-ix-action="answer"/, "只有一个出口：提交回答");
});

test("运行时不接受自由输入时，就不给输入框", () => {
  const optionsOnly: AgentPendingQuestion = { ...choice, allows_free_text: false };
  const html = agentQuestionHtml(optionsOnly, say);
  assert.doesNotMatch(html, /<textarea/, "不接受的输入不该邀请用户去填");
  assert.match(html, /data-ix-option="retry"/);
});

test("没有选项时是纯自由输入，不画一个空的选项组", () => {
  const free: AgentPendingQuestion = {
    pending_id: "q2", kind: "clarify", prompt: "你想先修哪一个？", options: [], allows_free_text: true,
  };
  const html = agentQuestionHtml(free, say);
  assert.match(html, /<textarea/);
  assert.doesNotMatch(html, /data-ix-options/, "没有选项就不该有选项组");
  assert.match(html, /写下回答/);
});

test("多条问题各自成卡，id 不串", () => {
  const second: AgentPendingQuestion = { ...choice, pending_id: "q2", prompt: "另一个问题" };
  const first = agentQuestionHtml(choice, say), other = agentQuestionHtml(second, say);
  assert.match(first, /data-ix-question="q-q1"/);
  assert.match(other, /data-ix-question="q-q2"/);
  const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map(found => found[1]);
  assert.equal(ids(first).filter(id => ids(other).includes(id)).length, 0, "两张卡的元素 id 不重");
});

test("问题与选项里的标记被转义", () => {
  const nasty: AgentPendingQuestion = {
    pending_id: "q1", kind: "clarify",
    prompt: '<img src=x onerror="alert(1)">',
    options: [{ value: "<script>", label: "<b>粗体</b>" }],
    allows_free_text: false,
  };
  const html = agentQuestionHtml(nasty, say);
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<b>粗体</b>"), false);
  assert.match(html, /&lt;img src=x/);
});
