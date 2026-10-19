import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { issueView } from "./fixtures/issue-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

async function capture(b: Browser, description: string) {
  const v = issueView(b);
  await v.viewport(1280); await v.go("/plugins/issues"); await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press("[data-issue-composer] [name=description]"); await v.type(description); await v.send();
  return v;
}

test("ISSUE-34 ISSUE-37 ISSUE-50 a question keeps the words and pictures and saves only after the new capture", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const behavior: Parameters<typeof issueModel>[2] = { question: "free-text" };
  const { namings } = await issueModel(t, b.homeDirectory, behavior);
  const v = await capture(b, "111");
  await v.until("$('[data-state=attention]')?.textContent.includes('需要补充：')", 20_000);
  assert.equal(namings.length, 1, "one bounded call, then the question is the person's");
  assert.equal((await v.list()).items.length, 0);
  await v.press("[data-state=attention]");
  await v.until("d.activeElement === $('[data-issue-editor] [name=description]')");
  await v.type("；点保存没反应"); await v.paste("现场.png", 30);
  await v.until("d.querySelectorAll('[data-issue-edit-shots] img').length === 1");
  const source = await v.ask("({ text: $('[data-issue-editor] [name=description]').value, image: $('[data-issue-edit-shots] img').src })");
  // A second question keeps both the words and the picture.
  await v.press("[data-issue-redo]"); await v.until("$('[data-state=attention]')?.textContent.includes('需要补充：')", 20_000);
  await v.press("[data-state=attention]");
  assert.deepEqual(await v.ask("({ text: $('[data-issue-editor] [name=description]').value, image: $('[data-issue-edit-shots] img').src })"), source);
  behavior.question = undefined;
  await v.press("[data-issue-redo]");
  await v.until("$('[data-issue-detail]').hidden && !$('[data-state]') && $('.issues-row')", 20_000);
  const [saved] = (await v.list()).items;
  const issue = await v.read(saved!.id);
  assert.equal(issue.description, "111；点保存没反应"); assert.equal(issue.images[0]!.data_url, (source as { image: string }).image);
  assert.equal((await v.list()).items.length, 1, "neither question left a record behind");
  assert.equal(namings.length, 3);
});

test("ISSUE-37 ISSUE-50 an answer Issue cannot use, or one that is not JSON, writes nothing and opens with the words kept", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const behavior: Parameters<typeof issueModel>[2] = { unusable: true };
  await issueModel(t, b.homeDirectory, behavior);
  const v = await capture(b, "点保存没反应");
  await v.until("$('[data-state=attention]')?.textContent.includes('模型没有给出可用的标题和类型')", 20_000);
  behavior.unusable = false; behavior.replyText = "保存按钮没反应";
  await v.press("[data-issue-composer] [name=description]"); await v.type("切换页面后输入丢失"); await v.send();
  await v.until("[...d.querySelectorAll('[data-state=attention]')].some(row => row.textContent.includes('没能自动整理'))", 20_000);
  assert.equal(await v.ask("[...d.querySelectorAll('[data-state=attention]')].some(row => /plugin\\.|model_output|JSON/.test(row.textContent))"), false, "no internal error text reaches the list");
  assert.equal((await v.list()).items.length, 0);
  await v.press("[data-state=attention]");
  assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), "切换页面后输入丢失");
});

test("ISSUE-34 ISSUE-37 an unavailable model and an organizing timeout keep the input, and a late answer cannot save beside a manual one", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const behavior: Parameters<typeof issueModel>[2] = { unavailable: true };
  await issueModel(t, b.homeDirectory, behavior);
  const v = await capture(b, "点保存没反应");
  await v.until("$('[data-state=attention]')?.textContent.includes('模型暂时不可用')", 30_000);
  behavior.unavailable = false;
  let finish!: () => void; behavior.firstReply = new Promise<void>(resolve => { finish = resolve; }); t.after(() => finish());
  await v.press("[data-state=attention]"); await v.press("[data-issue-redo]");
  await v.until("$('[data-state=organizing]')");
  await v.ask("(d.defaultView.issueNow = d.defaultView.Date.now, d.defaultView.Date.now = () => d.defaultView.issueNow() + 121000, true)");
  await v.until("$('[data-state=attention]')?.textContent.includes('整理超时')", 10_000);
  await v.ask("(d.defaultView.Date.now = d.defaultView.issueNow, true)");
  finish(); behavior.firstReply = undefined;
  // The answer that arrives after the timeout finds its draft retired: nothing is saved behind the person's back.
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal((await v.list()).items.length, 0);
  await v.press("[data-state=attention]");
  assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), "点保存没反应");
  await v.press("[data-issue-editor] [name=title]"); await v.type("保存按钮没反应"); await v.press("[data-issue-editor] [data-type=bug]");
  await v.press("[data-issue-save]"); await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')");
  const { items } = await v.list(); assert.equal(items.length, 1); assert.equal(items[0]!.entered_via, "manual");
});
