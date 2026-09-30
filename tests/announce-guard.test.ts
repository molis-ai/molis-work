import assert from "node:assert/strict";
import test from "node:test";
import { announcesWithoutActing, claimsButton, claimsMemoryChange, writesToolCallAsText } from "../horizontal/agent-host/src/adapters/announce-guard.js";

test("an ending that only announces the next step is recognised; results, questions and blockers are not", () => {
  // Seen from MiniMax-M3 in real Coding rounds that then ended with nothing done.
  for (const text of ["calc.js 状态确认。现在分别给三个函数加 JSDoc，再新建 README.md，最后跑 npm test。", "继续。先把 calc.js 改成带 JSDoc 的版本。",
    "现在同时改 calc.js（加 JSDoc）和新建 README.md。", "我来分别修改两个文件，然后跑 npm test 验证。", "Let me update the README next.",
    // Seen from MiniMax-M3 in an Assistant round that then ended without following up the sub-task.
    "我把要求改成 13 字，让同一个子任务再试一次。"]) {
    assert.equal(announcesWithoutActing(text), true, text);
  }
  for (const text of ["完成。改动与结果：\n- calc.js 新增 multiply\n- npm test：exit 0，三条断言全部通过。", "calc.js 已落盘。", "要把这段替换进文档吗？",
    "当前没有可用的日历能力，无法创建事项。", "下面是需要留意的边界情况：\n1. 没有类型校验\n2. 浮点精度", "现在测试全部通过。", "", "I'll wait for your decision on which option to use?",
    // A plain fact that happens to start with 现在/开始 (seen from MiniMax-M3 answering a timed round).
    "现在是 **19:04**（洛杉矶时区）。", "现在有 3 个目标还没开始。", "开始时间是下周一。",
    // Something done, said with 我把: not an announcement.
    "我把结果整理好了。", "我把三条都核对过，没有问题。"]) {
    assert.equal(announcesWithoutActing(text), false, text);
  }
});

test("a reply that claims a memory was kept or forgotten is recognised; saying it was not is not a claim", () => {
  // Seen from MiniMax-M3: it listed the memories, then answered as if it had kept the new one.
  assert.equal(claimsMemoryChange("记下了：**Q4 plan 项目的周会固定在周三下午两点**。这条只在本项目里生效。"), "keep");
  assert.equal(claimsMemoryChange("已记住你的偏好：回答用要点列表。"), "keep");
  assert.equal(claimsMemoryChange("- 已删除，现在没有保留的记忆"), "forget");
  assert.equal(claimsMemoryChange("没有记下：这是个人工作，不能记为项目记忆。"), null);
  assert.equal(claimsMemoryChange("要我把这条记下来吗？"), null);
  assert.equal(claimsMemoryChange("会议安排如下：周三下午两点。"), null);
  // Business changes in the same words are not memory claims.
  assert.equal(claimsMemoryChange("已记下会议要点到「周会纪要」。"), null);
  assert.equal(claimsMemoryChange("已删除文档「草稿」。"), null);
});

test("a reply that writes a tool call out as text is recognised; talking about capabilities in words is not", () => {
  // Seen from MiniMax-M3 when asked for buttons.
  assert.equal(writesToolCallAsText("下面两个按钮：\n\n[suggest-action]\ntitle: 新建「Q4 复盘草稿」文档\ncapability_id: pages.create\nversion: 1\n[/suggest-action]"), true);
  assert.equal(writesToolCallAsText("<change-capability>{\"input\": {}}</change-capability>"), true);
  assert.equal(writesToolCallAsText("我准备这样调用：{\"capability_id\": \"todo.items.create\", \"input\": {}}"), true);
  assert.equal(writesToolCallAsText("provider_id: io.molis.work.pages"), true);
  assert.equal(writesToolCallAsText("已记到待办：准备季度复盘，截止 10/05。可以在工作面板撤销。"), false);
  assert.equal(writesToolCallAsText("我可以用 Pages 的“新建文档”帮你建一篇，要我建吗？"), false);
  assert.equal(writesToolCallAsText("需要先在设置里打开“建议操作”（suggest-action）这项能力。"), false);
});

test("a reply that says a button is ready is recognised; one that says none was made, or talks of other things, is not", () => {
  // Seen from MiniMax-M3: the fields listed and “等你点”, with no suggest-action call behind it.
  for (const text of ["按钮准备好了，等你点：\n\n- 标题：喝水\n- 提醒时间：2026-09-29 21:05", "卡片在上面，点一下就会创建。", "The button is ready — click it to add the todo."]) {
    assert.equal(claimsButton(text), true, text);
  }
  for (const text of ["没有准备按钮：这个能力现在不可用。", "我把报告写进了文档，可以在 Pages 里打开。", "要不要我给你一个按钮？"]) {
    assert.equal(claimsButton(text), false, text);
  }
});
