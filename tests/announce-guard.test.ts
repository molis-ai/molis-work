import assert from "node:assert/strict";
import test from "node:test";
import { announcesWithoutActing } from "../horizontal/agent-host/src/adapters/announce-guard.js";

test("an ending that only announces the next step is recognised; results, questions and blockers are not", () => {
  // Seen from MiniMax-M3 in real Coding rounds that then ended with nothing done.
  for (const text of ["calc.js 状态确认。现在分别给三个函数加 JSDoc，再新建 README.md，最后跑 npm test。", "继续。先把 calc.js 改成带 JSDoc 的版本。",
    "现在同时改 calc.js（加 JSDoc）和新建 README.md。", "我来分别修改两个文件，然后跑 npm test 验证。", "Let me update the README next."]) {
    assert.equal(announcesWithoutActing(text), true, text);
  }
  for (const text of ["完成。改动与结果：\n- calc.js 新增 multiply\n- npm test：exit 0，三条断言全部通过。", "calc.js 已落盘。", "要把这段替换进文档吗？",
    "当前没有可用的日历能力，无法创建事项。", "下面是需要留意的边界情况：\n1. 没有类型校验\n2. 浮点精度", "现在测试全部通过。", "", "I'll wait for your decision on which option to use?"]) {
    assert.equal(announcesWithoutActing(text), false, text);
  }
});
