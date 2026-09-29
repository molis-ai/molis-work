import assert from "node:assert/strict";
import test from "node:test";
import { announcesWithoutActing, claimsMemoryChange } from "../horizontal/agent-host/src/adapters/announce-guard.js";

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
