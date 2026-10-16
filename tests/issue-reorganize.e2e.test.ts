import assert from "node:assert/strict";
import test from "node:test";
import type { Issue } from "@molis-ai/molis-work-plugin-issues";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { issueView } from "./fixtures/issue-browser.js";

const editor = '[data-issue-editor]';
async function setup(t: Parameters<typeof openGoalBrowser>[0], behavior: Parameters<typeof issueModel>[2]) {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const model = await issueModel(t, b.homeDirectory, behavior), v = issueView(b, "issue-reorganize");
  await v.viewport(1280); await v.go("/plugins/issues"); await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  const issue = await v.api<Issue>("/api/plugins/io.molis.work.issues/create", { title: "旧标题", type: "feature", description: "原来的说明" });
  await v.go("/plugins/issues"); await v.until("$('.issues-row')"); await v.press(".issues-row"); await v.press("[data-issue-edit]");
  return { b, v, issue, ...model };
}

test("ISSUE-48 current text and screenshots produce a review, then Save updates the same record and survives reopen", { timeout: 90_000 }, async t => {
  const s = await setup(t, { title: "保存按钮点击后没有反应", type: "bug" }); if (!s) return;
  const { v, issue, requests } = s;
  await v.press(editor + " [name=description]"); await v.type("；补充：点击保存无反应"); await v.paste("新现场.png", 40);
  await v.until("d.querySelectorAll('[data-issue-edit-shots] img').length === 1");
  const description = await v.ask<string>("$('[data-issue-editor] [name=description]').value");
  const image = await v.ask<string>("$('[data-issue-edit-shots] img').src");
  await v.press("[data-issue-redo]"); await v.until("$('[data-issue-flag]').textContent.includes('确认后保存')", 25_000);
  assert.deepEqual(await v.read(issue.id), issue, "suggestion never mutates the saved record");
  assert.equal(await v.ask("$('[data-issue-editor] [name=title]').value"), "保存按钮点击后没有反应");
  assert.equal(await v.ask("$('[data-issue-editor]').dataset.type"), "bug");
  assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), description);
  assert.equal(await v.ask("$('[data-issue-edit-shots] img').src"), image);
  assert.match(JSON.stringify(requests), /补充：点击保存无反应/);
  assert.match(JSON.stringify(requests), /image/);
  for (const theme of ["light", "dark"]) for (const width of [1440, 1024, 390]) {
    await v.ask("(d.documentElement.dataset.theme = d.documentElement.dataset.resolvedTheme = " + JSON.stringify(theme) + ", true)"); await v.viewport(width, 1000);
    await v.shot(theme + "-" + width);
    assert.equal(await v.ask("(() => { const b = $('[data-issue-redo]').getBoundingClientRect(); return b.left >= 0 && b.right <= d.defaultView.innerWidth; })()"), true);
  }
  await v.press("[data-issue-save]"); await v.until("!$('[data-issue-view]').hidden");
  const saved = await v.read(issue.id); assert.equal(saved.version, 2); assert.equal(saved.description, description);
  assert.deepEqual(saved.images, [{ name: "新现场.png", data_url: image }]);
  assert.equal(saved.title, "保存按钮点击后没有反应"); assert.equal(saved.type, "bug"); assert.equal((await v.list()).items.length, 1);
  await v.go("/plugins/issues"); await v.until("$('.issues-row')"); await v.press(".issues-row");
  await v.until("!$('[data-issue-detail]').hidden && !$('[data-issue-view]').hidden");
  assert.equal(await v.ask("$('[data-issue-title]').textContent"), saved.title);
  assert.deepEqual(await v.read(issue.id), saved);
});

test("ISSUE-49 failure, continued editing, cancellation and version conflicts preserve the person's changes", { timeout: 120_000 }, async t => {
  const behavior: Parameters<typeof issueModel>[2] = { replyText: "无法整理" };
  const s = await setup(t, behavior); if (!s) return;
  const { v, issue } = s;
  await v.press(editor + " [name=description]"); await v.type("；我的补充");
  await v.press("[data-issue-redo]"); await v.until("$('[data-issue-flag]').textContent.includes('修改已保留')", 20_000);
  const text = await v.ask<string>("$('[data-issue-editor] [name=description]').value");
  assert.equal((await v.read(issue.id)).version, 1);
  behavior.replyText = undefined; behavior.title = "整理期间继续输入";
  let finish!: () => void; behavior.firstReply = new Promise<void>(resolve => { finish = resolve; }); t.after(() => finish());
  await v.press("[data-issue-redo]"); await v.until("$('[data-issue-redo]').disabled");
  await v.press(editor + " [name=description]"); await v.type("；继续输入"); finish();
  await v.until("$('[data-issue-flag]').textContent.includes('内容已变化')", 20_000);
  assert.equal(await v.ask("$('[data-issue-editor] [name=title]').value"), issue.title);
  assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), text + "；继续输入");
  behavior.title = "取消后的旧结果"; behavior.firstReply = new Promise<void>(resolve => { finish = resolve; });
  await v.press("[data-issue-redo]"); await v.until("$('[data-issue-redo]').disabled"); await v.press("[data-issue-cancel]"); finish();
  await v.press("[data-issue-edit]"); behavior.firstReply = undefined; behavior.title = "有效的重新整理建议";
  await v.press(editor + " [name=description]"); await v.type("；保留本次修改");
  await v.press("[data-issue-redo]"); await v.until("$('[data-issue-flag]').textContent.includes('确认后保存')", 20_000);
  assert.equal(await v.ask("$('[data-issue-editor] [name=title]').value"), behavior.title);
  await v.api("/api/plugins/io.molis.work.issues/update", { id: issue.id, expected_version: 1, title: "其他窗口的新标题" });
  await v.press("[data-issue-save]"); await v.until("$('[data-issue-flag]').textContent.includes('核对后再保存')");
  assert.equal((await v.read(issue.id)).title, "其他窗口的新标题");
  assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), "原来的说明；保留本次修改");
  await v.press("[data-issue-save]"); await v.until("!$('[data-issue-view]').hidden");
  const saved = await v.read(issue.id); assert.equal(saved.title, behavior.title); assert.equal(saved.version, 3);
  assert.equal((await v.list()).items.length, 1);
});

test("ISSUE-49 clarification and timeout keep edited text and pictures; late completion cannot affect another record", { timeout: 90_000 }, async t => {
  const behavior: Parameters<typeof issueModel>[2] = { question: "free-text" };
  const s = await setup(t, behavior); if (!s) return;
  const { v, issue } = s;
  await v.press(editor + " [name=description]"); await v.type("；还有截图"); await v.paste("补充.png", 40);
  await v.until("d.querySelectorAll('[data-issue-edit-shots] img').length === 1");
  const source = await v.ask("({ text: $('[data-issue-editor] [name=description]').value, image: $('[data-issue-edit-shots] img').src })");
  await v.press("[data-issue-redo]"); await v.until("$('[data-issue-flag]').textContent.includes('需要补充')", 20_000);
  assert.deepEqual(await v.ask("({ text: $('[data-issue-editor] [name=description]').value, image: $('[data-issue-edit-shots] img').src })"), source);
  behavior.question = undefined; behavior.title = "超时的整理";
  let finish!: () => void; behavior.firstReply = new Promise<void>(resolve => { finish = resolve; }); t.after(() => finish());
  await v.press("[data-issue-redo]"); await v.until("$('[data-issue-redo]').disabled");
  await v.ask("(d.defaultView.issueNow = d.defaultView.Date.now, d.defaultView.Date.now = () => d.defaultView.issueNow() + 121000, true)");
  await v.until("$('[data-issue-flag]').textContent.includes('修改已保留')", 15_000);
  await v.ask("(d.defaultView.Date.now = d.defaultView.issueNow, true)");
  assert.deepEqual(await v.ask("({ text: $('[data-issue-editor] [name=description]').value, image: $('[data-issue-edit-shots] img').src })"), source);
  await v.press("[data-issue-save]"); await v.until("!$('[data-issue-view]').hidden");
  const saved = await v.read(issue.id); assert.equal(saved.title, issue.title); assert.equal(saved.version, 2);
  const other = await v.api<Issue>("/api/plugins/io.molis.work.issues/create", { title: "另一条问题", type: "experience", description: "另一条原文" });
  await v.go("/plugins/issues"); await v.until("d.querySelectorAll('.issues-row').length === 2");
  await v.press('[data-issue-id="' + other.id + '"]'); await v.press("[data-issue-edit]");
  finish();
  const retired = (await v.assistant(true)).works;
  assert.ok(retired.length >= 2);
  assert.ok(retired.every(view => view.work.archived && view.work.state !== "running"), "retired reviews cannot resume after the model replies");
  assert.equal(await v.ask("$('[data-issue-editor] [name=title]').value"), "另一条问题");
  assert.deepEqual(await v.read(other.id), other); assert.deepEqual(await v.read(issue.id), saved);
});
