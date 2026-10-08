import assert from "node:assert/strict";
import test from "node:test";
import { GUARDED_TOOL_NAMES, announcesWithoutActing, claimsButton, claimsMemoryChange, claimsSavedChange, internalIdsHeld, mentionsInternalIds, writesToolCallAsText } from "../horizontal/agent-host/src/adapters/announce-guard.js";

test("an ending that only announces the next step is recognised; results, questions and blockers are not", () => {
  // Seen from MiniMax-M3 in real Coding rounds that then ended with nothing done.
  for (const text of ["calc.js 状态确认。现在分别给三个函数加 JSDoc，再新建 README.md，最后跑 npm test。", "继续。先把 calc.js 改成带 JSDoc 的版本。",
    "现在同时改 calc.js（加 JSDoc）和新建 README.md。", "我来分别修改两个文件，然后跑 npm test 验证。", "Let me update the README next.",
    // Seen from MiniMax-M3 in an Assistant round that then ended without following up the sub-task.
    "我把要求改成 13 字，让同一个子任务再试一次。",
    // Seen from MiniMax-M3 asked to read saved to-dos back: this one line was the whole reply, and nothing was read.
    "调用「会议待办」的列表能力读回保存的提炼记录，核对刚才三条。", "读回刚才保存的三条待办并逐条核对。",
    // The same with the side panel browser: a line that only names the click or the typing, and nothing done.
    "点击页面上的 Learn more 链接。", "输入 tomsmith 到 Username 输入框。",
    // Seen from MiniMax-M3 after a refused edit: nothing was sent and there was nothing to confirm.
    "我用确认流程再试一次，由你确认后落地。", "我再试一次。", "我重新提交一次修改。", "再试一次：把截止日期改成下周二。",
    "我直接给文档加一节「风险」，两条按你的措辞写。", "我用 Pages 的「撤销新建文档」删掉它。当前文档没被改过，版本还是 1，可以撤。"]) {
    assert.equal(announcesWithoutActing(text), true, text);
  }
  for (const text of ["完成。改动与结果：\n- calc.js 新增 multiply\n- npm test：exit 0，三条断言全部通过。", "calc.js 已落盘。", "要把这段替换进文档吗？",
    // An answer that says how it is put, not a step still to take.
    "我用三句话总结：交付按计划推进。风险在预算与评审。三项行动已分派。", "我用表格整理好了。",
    "当前没有可用的日历能力，无法创建事项。", "下面是需要留意的边界情况：\n1. 没有类型校验\n2. 浮点精度", "现在测试全部通过。", "", "I'll wait for your decision on which option to use?",
    // A plain fact that happens to start with 现在/开始 (seen from MiniMax-M3 answering a timed round).
    "现在是 **19:04**（洛杉矶时区）。", "现在有 3 个目标还没开始。", "开始时间是下周一。",
    // Something done, said with 我把: not an announcement.
    "我把结果整理好了。", "我把三条都核对过，没有问题。",
    // A one-line reply that opens with the verb but reports what came of it.
    // Steps for the person to take are not the round's own next step (seen from MiniMax-M3 with memory switched off).
    "要去长期记住的话，请在「设置 · 助理 · 记忆与偏好」里打开「允许记住」，然后告诉我「记住：以后周报标题都加日期」。",
    "核对完毕，三条都在。", "检查结果：三条都在。", "读取到 3 条待办，和刚才一致。", "查看了一下，没有问题。", "保存成功。",
    "点击了 Learn more，新页面的标题是 Example Domains。", "输入完成，Username 里现在是 tomsmith。",
    "调用「会议待办」读回的三条：\n- 小张整理用户访谈\n- 老李联系场地"]) {
    assert.equal(announcesWithoutActing(text), false, text);
  }
});

test("a reply that claims a memory was kept or forgotten is recognised; saying it was not is not a claim", () => {
  // Seen from MiniMax-M3: it listed the memories, then answered as if it had kept the new one.
  assert.equal(claimsMemoryChange("记下了：**Q4 plan 项目的周会固定在周三下午两点**。这条只在本项目里生效。"), "keep");
  assert.equal(claimsMemoryChange("已记住你的偏好：回答用要点列表。"), "keep");
  assert.equal(claimsMemoryChange("- 已删除，现在没有保留的记忆"), "forget");
  // Forgetting switches a memory off: saying so is the same kind of claim.
  assert.equal(claimsMemoryChange("已停用那条记忆，以后不会再用到；想彻底删除可以去设置里删。"), "forget");
  assert.equal(claimsMemoryChange("没有停用那条记忆：找不到它。"), null);
  assert.equal(claimsMemoryChange("已停用该插件。"), null);
  assert.equal(claimsMemoryChange("没有记下：这是个人工作，不能记为项目记忆。"), null);
  assert.equal(claimsMemoryChange("要我把这条记下来吗？"), null);
  assert.equal(claimsMemoryChange("会议安排如下：周三下午两点。"), null);
  // Business changes in the same words are not memory claims.
  assert.equal(claimsMemoryChange("已记下会议要点到「周会纪要」。"), null);
  assert.equal(claimsMemoryChange("已删除文档「草稿」。"), null);
  // Seen from MiniMax-M3 with forming memories switched off: it named the tool it did not have.
  assert.equal(claimsMemoryChange("「以后周报都用表格」是长期规则，我用 remember 记到项目「Q4 plan」里：从今以后做周报默认用表格呈现。"), "keep");
  assert.equal(claimsMemoryChange("已把会议要点记到项目笔记里，以后可以随时查。"), null);
});

test("a reply that says something was saved somewhere is recognised; offers, refusals and pending confirmations are not", () => {
  // Seen from MiniMax M3.1: asked to note an idea, it answered this with no call at all.
  for (const text of ["记下了：发布会可以用倒计时海报提前预热，作为「第四季度发布筹备后续建议」项目里的一条灵感，已经存到 Jelly 灵感里。",
    "已记到待办：准备季度复盘，截止 10/05。", "已新建文档「Q4 复盘」。", "建好了，在日历里 10 月 2 日下午三点。"]) {
    assert.equal(claimsSavedChange(text), true, text);
  }
  for (const text of ["要不要我把它记到待办？", "确认后会存到 Jelly 灵感里。", "没能保存到笔记：这个能力现在不可用。", "已提交，等你确认。",
    "已记住你的偏好：回答用要点列表。", "下面是待办列表：\n- 准备季度复盘", "你可以在待办里找到它。", ""]) {
    assert.equal(claimsSavedChange(text), false, text);
  }
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
  for (const text of ["没有准备按钮：这个能力现在不可用。", "我把报告写进了文档，可以在 Pages 里打开。", "要不要我给你一个按钮？",
    // Seen from MiniMax M3.1 in the side panel browser: the page's own button, and “here” said of where it stopped.
    "我停在这里了。\n\n我先点了输入框右侧的「清除」按钮想把它清空——第一次点击没生效（页面位置变了）。\n我再次点击「清除」时，被拒绝了，这一步没有执行。"]) {
    assert.equal(claimsButton(text), false, text);
  }
});

test("a reply that shows internal identifiers is recognised; titles, file names and ordinary words are not", () => {
  const known = new Set(["pages.create", "todo.items.create", "x", "io.molis.work.pages"]);
  assert.deepEqual(mentionsInternalIds("用 pages.create 建好了「Q4 复盘」。", known), ["pages.create"]);
  assert.deepEqual(mentionsInternalIds("我调用了 change-capability，已新建待办。", known), ["change-capability"]);
  assert.deepEqual(mentionsInternalIds("文档 ID 是 3f2a9c1e-7b4d-4e2a-9f10-2c3d4e5f6a7b。", known), ["3f2a9c1e-7b4d-4e2a-9f10-2c3d4e5f6a7b"]);
  assert.deepEqual(mentionsInternalIds("没能保存（actions.outcome_unknown），请先确认一下。", known), ["actions.outcome_unknown"]);
  assert.deepEqual(mentionsInternalIds("Pages 插件（io.molis.work.pages）里已新建。", known), ["io.molis.work.pages"]);
  // Titles, plugin names, file names and ordinary words that happen to share a tool's spelling are not identifiers.
  for (const text of ["已在 Pages 里新建文档「Q4 复盘草稿」，可以在工作面板撤销。", "calc.js 已加上 JSDoc，npm test 通过。",
    "我会记住（remember）这条偏好吗？需要你确认。", "按 x 轴排列的图表已经更新。", "pages.create.v2 是另一回事", "见 docs/ask-user-guide.md。",
    "版本 1.2.3-beta 已发布。"]) {
    assert.deepEqual(mentionsInternalIds(text, known), [], text);
  }
  // A field's own name is ours too; a file name, an address or a path that happens to use underscores is not.
  assert.deepEqual(mentionsInternalIds("要不要我帮你把它标上 due_date？"), ["due_date"]);
  assert.deepEqual(mentionsInternalIds("已把 expected_revision 改成 2。"), ["expected_revision"]);
  for (const text of ["附件 q4_report.xlsx 已上传。", "见 https://example.com/a_b/c_d 。", "路径是 docs/q4_plan/readme.md。", "抄送 li_lei@example.com。", "Use `snake_case` style? 不是这个意思。"]) {
    assert.deepEqual(mentionsInternalIds(text).filter(id => !id.includes("snake")), [], text);
  }
  assert.match(internalIdsHeld(["pages.create"]), /pages\.create/);
});

test("the guards know every tool a business round can be given, the side panel's browser and the runtime's own included", () => {
  for (const name of ["surface-list", "surface-observe", "surface-act", "find-tools", "context-remaining", "stop-delegated-work", "change-reversible", "suggest-memory"]) {
    assert.ok(GUARDED_TOOL_NAMES.includes(name), name);
  }
  assert.deepEqual(mentionsInternalIds("我用 surface-act 在侧栏里点了“提交”。"), ["surface-act"]);
  assert.deepEqual(mentionsInternalIds("先用 surface-observe 看了一眼页面，表单已经填好。"), ["surface-observe"]);
  assert.equal(writesToolCallAsText("[surface-act]\naction: click\n[/surface-act]"), true);
  // Words about the browser are not identifiers.
  assert.deepEqual(mentionsInternalIds("我在侧栏浏览器里查看了这个网页，还没有点任何按钮。"), []);
});
