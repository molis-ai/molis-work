import assert from "node:assert/strict";
import test from "node:test";
import { ENDING_REVIEW, GUARDED_TOOL_NAMES, actedThisRound, emptyRoundFacts, endingClaims, internalIdsHeld, mentionsInternalIds, noteRoundEvent, writesToolCallAsText } from "../horizontal/agent-host/src/adapters/announce-guard.js";

test("a reply that writes a tool call out as text is recognised; talking about capabilities in words is not", () => {
  // Seen from MiniMax-M3 when asked for buttons: our own call syntax, which the Host can see by itself.
  assert.equal(writesToolCallAsText("下面两个按钮：\n\n[suggest-action]\ntitle: 新建「Q4 复盘草稿」文档\ncapability_id: pages.create\nversion: 1\n[/suggest-action]"), true);
  assert.equal(writesToolCallAsText("<change-capability>{\"input\": {}}</change-capability>"), true);
  assert.equal(writesToolCallAsText("我准备这样调用：{\"capability_id\": \"todo.items.create\", \"input\": {}}"), true);
  assert.equal(writesToolCallAsText("provider_id: io.molis.work.pages"), true);
  assert.equal(writesToolCallAsText("已记到待办：准备季度复盘，截止 10/05。可以在工作面板撤销。"), false);
  assert.equal(writesToolCallAsText("我可以用 Pages 的“新建文档”帮你建一篇，要我建吗？"), false);
  assert.equal(writesToolCallAsText("需要先在设置里打开“建议操作”（suggest-action）这项能力。"), false);
});

test("only identifiers the Host handed the model count as internal: no pattern guesses what looks like one (D1②, ADH-17)", () => {
  const given = ["pages.create", "todo.items.create", "x", "io.molis.work.pages", "due_date", "3f2a9c1e-7b4d-4e2a-9f10-2c3d4e5f6a7b", "actions.outcome_unknown"];
  assert.deepEqual(mentionsInternalIds("用 pages.create 建好了「Q4 复盘」。", given), ["pages.create"]);
  assert.deepEqual(mentionsInternalIds("我调用了 change-capability，已新建待办。", given), ["change-capability"]);
  assert.deepEqual(mentionsInternalIds("文档 ID 是 3f2a9c1e-7b4d-4e2a-9f10-2c3d4e5f6a7b。", given), ["3f2a9c1e-7b4d-4e2a-9f10-2c3d4e5f6a7b"]);
  assert.deepEqual(mentionsInternalIds("没能保存（actions.outcome_unknown），请先确认一下。", given), ["actions.outcome_unknown"]);
  assert.deepEqual(mentionsInternalIds("要不要我帮你把它标上 due_date？", given), ["due_date"]);
  // Not handed out by the Host this round: not ours, whatever it looks like.
  for (const text of ["文档 ID 是 9e8d7c6b-1111-4e2a-9f10-2c3d4e5f6a7b。", "已把 expected_revision 改成 2。", "附件 q4_report.xlsx 已上传。", "抄送 li_lei@example.com。"]) {
    assert.deepEqual(mentionsInternalIds(text, given), [], text);
  }
  // Titles, file names and words that share a spelling are not identifiers; nor is one the person wrote themselves.
  for (const text of ["已在 Pages 里新建文档「Q4 复盘草稿」，可以在工作面板撤销。", "calc.js 已加上 JSDoc，npm test 通过。", "按 x 轴排列的图表已经更新。",
    "pages.create.v2 是另一回事", "见 docs/ask-user-guide.md。", "版本 1.2.3-beta 已发布。"]) {
    assert.deepEqual(mentionsInternalIds(text, given), [], text);
  }
  assert.deepEqual(mentionsInternalIds("io.molis.work.pages 里已经新建。", given, "在 io.molis.work.pages 里建一篇"), []);
  assert.match(internalIdsHeld(["pages.create"]), /pages\.create/);
});

// ADH-16: the facts the ending is reviewed against come from the round's own events.
test("a round's facts come from its events: each call and how it ended, and the identifiers its results named", () => {
  const facts = emptyRoundFacts();
  noteRoundEvent(facts, { type: "text-delta", text: "我先查一下。" });
  noteRoundEvent(facts, { type: "tool-call", call: { id: "a", name: "find-capabilities", input: {} } });
  noteRoundEvent(facts, { type: "tool-result", callId: "a", name: "find-capabilities", outcome: "returned",
    text: JSON.stringify({ capabilities: [{ capability_id: "todo.items.create", provider_id: "io.molis.work.todo", title: "新建待办", input: { properties: { due_date: {}, title: {} } } }] }) });
  noteRoundEvent(facts, { type: "tool-call", call: { id: "b", name: "change-capability", input: {} } });
  noteRoundEvent(facts, { type: "tool-result", callId: "b", name: "change-capability", outcome: "failed", errorCode: "actions.review_rejected", text: "rejected" });
  assert.deepEqual(facts.calls.map(call => [call.tool, call.ended]), [["find-capabilities", "returned"], ["change-capability", "failed"]]);
  for (const id of ["todo.items.create", "io.molis.work.todo", "due_date", "capability_id", "actions.review_rejected"]) assert.ok(facts.ids.has(id), id);
  assert.ok(!facts.ids.has("新建待办") && !facts.ids.has("title"), "titles and plain words are not identifiers");
  assert.equal(facts.said, "我先查一下。");
  // Reads and a refused change did nothing; a returned Host-governed record (a card, a sub-task, a memory proposal) did.
  assert.equal(actedThisRound(facts), false);
  noteRoundEvent(facts, { type: "tool-call", call: { id: "c", name: "suggest-action", input: {} } });
  noteRoundEvent(facts, { type: "tool-result", callId: "c", name: "suggest-action", outcome: "returned", text: "{}" });
  assert.equal(actedThisRound(facts), true);
});

// ADH-16: only what the review was asked is read; anything else lets the ending through.
test("the review's answer is read only for what it was asked: how the ending reads, and a sentence per kind of change; anything else reads as none", () => {
  assert.deepEqual(endingClaims('{"last":"next_step","changed":"已保存。","kept":"","forgot":"","button":""}'), ["changed", "will_do"]);
  assert.deepEqual(endingClaims('```json\n{"last":"result","kept":"记住了。"}\n```'), ["kept"]);
  assert.deepEqual(endingClaims('{"last":"question","changed":"  ","button":123}'), []);
  // The shape of an earlier draft, or no JSON at all, finds nothing: the ending is let through.
  assert.deepEqual(endingClaims('{"claims":["kept"]}'), []);
  assert.deepEqual(endingClaims("没有发现问题"), []);
  // The instructions are versioned: a change to them is measured before and after (handbook §16.3).
  assert.equal(ENDING_REVIEW.version, 1);
  for (const name of ["next_step", "changed", "kept", "forgot", "button"]) assert.match(ENDING_REVIEW.body, new RegExp(`- ${name}：`));
});

test("the guards know every tool a business round can be given, the side panel's browser and the runtime's own included", () => {
  for (const name of ["surface-list", "surface-observe", "surface-act", "find-tools", "context-remaining", "stop-delegated-work", "change-reversible", "suggest-memory"]) {
    assert.ok(GUARDED_TOOL_NAMES.includes(name), name);
  }
  assert.deepEqual(mentionsInternalIds("我用 surface-act 在侧栏里点了“提交”。", []), ["surface-act"]);
  assert.deepEqual(mentionsInternalIds("先用 surface-observe 看了一眼页面，表单已经填好。", []), ["surface-observe"]);
  assert.equal(writesToolCallAsText("[surface-act]\naction: click\n[/surface-act]"), true);
  // Words about the browser are not identifiers.
  assert.deepEqual(mentionsInternalIds("我在侧栏浏览器里查看了这个网页，还没有点任何按钮。", []), []);
});
