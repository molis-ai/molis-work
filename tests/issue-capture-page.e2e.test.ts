import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { FIXTURE_TITLE, issueModel } from "./fixtures/issue-model.js";
import { issueView } from "./fixtures/issue-browser.js";

const button = "document.querySelector('[data-side-plugin-open]')";

test("ISSUE-35 ISSUE-36 ISSUE-39 ISSUE-40 a chord, a sentence and ⌘↵ record an Issue the Assistant names in the background", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  let release!: () => void; const firstReply = new Promise<void>(resolve => { release = resolve; }); t.after(() => release());
  const { requests } = await issueModel(t, b.homeDirectory, { firstReply });
  const v = issueView(b);
  await v.viewport(1440); await v.go("/");
  // A tool with a chord is loaded while the page is idle, so the first press shows a ready view.
  await b.waitFor(`'loaded' in (document.querySelector('[data-side-body="plugin:issues/capture"] iframe')?.dataset ?? {})`, 10_000);
  await v.chord(); await v.composerFocused();
  await v.type("  切换页面以后，输入没了。\n"); await v.paste();
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 1 && !$('[data-issue-submit]').disabled");
  await v.send();
  // Sent at once: the composer is empty and keeps the keyboard; the record is on its way, not yet written.
  await v.until("$('[data-issue-list] [data-state=organizing]') && $('[data-issue-composer] [name=description]').value === '' && d.activeElement === $('[data-issue-composer] [name=description]')");
  assert.equal(await v.ask("d.querySelectorAll('[data-issue-thumbs] img').length"), 0);
  assert.equal((await v.list()).items.length, 0, "nothing is written before the Assistant names it");
  await v.shot("capture-organizing");
  // The person goes back to work; the tool says it is busy while closed.
  await v.escape(); await b.waitFor("document.body.dataset.sideOpen === 'false'");
  assert.equal(await b.evaluate(`${button}.dataset.sideBusy`), "busy");
  release();
  await b.waitFor(`!${button}.dataset.sideBusy`, 20_000);
  const [saved] = (await v.list()).items;
  assert.equal(saved!.title, FIXTURE_TITLE); assert.equal(saved!.type, "bug"); assert.equal(saved!.entered_via, "assistant");
  const issue = await v.read(saved!.id);
  assert.equal(issue.description, "  切换页面以后，输入没了。\n", "the person's words are kept as written"); assert.equal(issue.images.length, 1);
  assert.deepEqual(issue.context.page, { url: "/", title: "首页", provenance: "client_reported" });
  // One model turn names it: no discovery round, no confirmation card.
  const turns = (requests as Array<{ messages: unknown }>).filter(body => JSON.stringify(body).includes(saved!.id));
  assert.equal(turns.length, 2, "the save call and the closing sentence");
  assert.match(JSON.stringify(turns[0]), /记录时所在页面：首页/);
  const { works, notices } = await v.assistant();
  assert.equal(works.some(view => view.work.title.startsWith("记录 Issue")), false, "a finished capture is filed away, not left in the Assistant's list");
  assert.equal(notices.some(notice => notice.work_title.startsWith("记录 Issue")), false);
  await v.chord(); await v.composerFocused();
  await v.until(`$('[data-issue-list] .issues-row')?.textContent.includes(${JSON.stringify(FIXTURE_TITLE)}) && /Bug · .* · 1 张截图/.test($('[data-issue-list] .issues-row').textContent)`);
  await v.shot("capture-saved");
  // Pressed again from inside the tool, the chord puts it away.
  await v.chord(); await b.waitFor("document.body.dataset.sideOpen === 'false'");
});

test("ISSUE-38 undo takes a new record back and returns the words to an empty composer", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory);
  const v = issueView(b);
  await v.viewport(1440); await v.go("/");
  await v.chord(); await v.composerFocused();
  await v.type("保存按钮点了没反应"); await v.send();
  await v.until("!$('[data-issue-toast]').hidden && $('[data-issue-toast-action]').textContent === '撤销'", 20_000);
  assert.equal((await v.list()).items.length, 1);
  await v.press("[data-issue-toast-action]");
  await v.until("$('[data-issue-toast] span').textContent === '已撤销，内容放回了输入框'");
  assert.equal((await v.list()).items.length, 0);
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "保存按钮点了没反应");
  // A record changed after it was made is not taken back by an undo.
  await v.send(); await v.until("$('[data-issue-toast-action]').textContent === '撤销'", 20_000);
  const [record] = (await v.list()).items;
  await v.api("/api/plugins/io.molis.work.issues/update", { id: record!.id, expected_version: 1, title: "后来改过" });
  await v.press("[data-issue-toast-action]");
  await v.until("/记录后已修改/.test($('[data-issue-toast] span').textContent)");
  assert.equal((await v.list()).items[0]!.title, "后来改过");
});

test("ISSUE-37 a capture the Assistant cannot finish stays at the top and opens with nothing lost", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const behavior: Parameters<typeof issueModel>[2] = { question: "free-text" };
  await issueModel(t, b.homeDirectory, behavior);
  const v = issueView(b);
  await v.viewport(1440); await v.go("/");
  await v.chord(); await v.composerFocused();
  await v.type("111"); await v.paste(); await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 1");
  await v.send();
  await v.until("$('[data-state=attention]')?.textContent.includes('需要补充：你在哪个页面做了什么')", 20_000);
  await b.waitFor(`${button}.dataset.sideBusy === 'attention'`, 5_000);
  // The row is the one place to continue: nothing waits on the same question in the Assistant.
  for (let tries = 0; ; tries++) {
    const { works, notices } = await v.assistant();
    if (!notices.length && !works.some(view => view.work.state === "waiting-input")) break;
    assert.ok(tries < 50, "the asking work still waits in the Assistant"); await new Promise(done => setTimeout(done, 100));
  }
  await v.press("[data-state=attention]");
  // Asked for a fact: the words come first, and trying again is the main step.
  await v.until("!$('[data-issue-editor]').hidden && d.activeElement === $('[data-issue-editor] [name=description]')");
  assert.deepEqual(await v.ask("({ text: $('[data-issue-editor] [name=description]').value, shots: d.querySelectorAll('[data-issue-edit-shots] img').length, flag: $('[data-issue-flag]').textContent, redo: $('[data-issue-redo]').className.includes('primary') })"),
    { text: "111", shots: 1, flag: "需要补充：你在哪个页面做了什么，出现了什么问题？也可以补充截图。", redo: true });
  await v.shot("capture-question");
  await v.type("：首页点“让助理起草目标”没反应"); behavior.question = undefined;
  await v.press("[data-issue-redo]");
  await v.until("$('[data-issue-detail]').hidden && !$('[data-state]') && $('[data-issue-list] .issues-row')", 20_000);
  const [saved] = (await v.list()).items;
  assert.equal((await v.read(saved!.id)).description, "111：首页点“让助理起草目标”没反应"); assert.equal(saved!.image_count, 1);
  const { works, notices } = await v.assistant();
  assert.equal(works.filter(view => ["waiting-input", "running"].includes(view.work.state)).length, 0, "the asking work was stopped once answered here");
  assert.equal(notices.length, 0);

  // The model is down: the capture says so and is saved by hand, with the page it was written on.
  behavior.unavailable = true;
  await v.press("[data-issue-composer] [name=description]"); await v.type("保存按钮点了没反应"); await v.send();
  await v.until("$('[data-state=attention]')?.textContent.includes('模型暂时不可用')", 30_000);
  await v.press("[data-state=attention]"); await v.until("d.activeElement === $('[data-issue-editor] [name=title]')");
  assert.equal(await v.ask("!!$('[data-issue-flag] a[href=\"/settings/models\"]')"), true, "the note leads to the model settings");
  await v.press("[data-issue-save]"); await v.until("$('[data-issue-flag]').textContent === '写个标题并选一个类型再保存。'");
  await v.type("保存按钮没反应"); await v.press("[data-issue-editor] [data-type=bug]"); await v.press("[data-issue-save]");
  await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')", 10_000);
  const manual = (await v.list()).items[0]!;
  assert.deepEqual([manual.title, manual.type, manual.entered_via, manual.context.page?.title], ["保存按钮没反应", "bug", "manual", "首页"]);
  assert.equal((await v.list()).items.length, 2);
});

test("ISSUE-37 a person who confirms every save gets a prefilled editor, and the draft saves once", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory, { suggest: true });
  const v = issueView(b);
  await v.viewport(1440); await v.go("/");
  await v.api("/api/assistant/capabilities", { capability_id: "issues.capture", version: 1, provider_id: "io.molis.work.issues", confirm_always: true });
  await v.chord(); await v.composerFocused();
  await v.type("切换页面以后，输入没了。"); await v.send();
  await v.until("$('[data-state=attention]')?.textContent.includes('请确认标题和类型后保存')", 20_000);
  assert.equal((await v.list()).items.length, 0, "a refused direct save writes nothing");
  await v.press("[data-state=attention]");
  assert.deepEqual(await v.ask("({ title: $('[data-issue-editor] [name=title]').value, type: $('[data-issue-editor]').dataset.type })"), { title: FIXTURE_TITLE, type: "bug" });
  await v.press("[data-issue-save]");
  await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')", 10_000);
  const { items } = await v.list(); assert.equal(items.length, 1); assert.equal(items[0]!.title, FIXTURE_TITLE);
  // Abandoning a capture keeps nothing and leaves no waiting work behind.
  await v.press("[data-issue-composer] [name=description]"); await v.type("这条不要了"); await v.send();
  await v.until("$('[data-state=attention]')", 20_000); await v.press("[data-state=attention]"); await v.press("[data-issue-cancel]");
  await v.until("$('[data-issue-dialog]').open");
  await v.press("[data-issue-dialog] [value=confirm]");
  await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')");
  assert.equal((await v.list()).items.length, 1);
  assert.equal((await v.assistant()).works.filter(view => ["waiting-review", "running"].includes(view.work.state)).length, 0);
});

test("ISSUE-37 an unfinished capture survives leaving the page and saves once from where it was left", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory, { unavailable: true });
  const v = issueView(b);
  await v.viewport(1440); await v.go("/");
  await v.chord(); await v.composerFocused();
  await v.type("离开页面前没整理完的一条"); await v.paste(); await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 1");
  await v.send();
  await v.until("$('[data-state=attention]')?.textContent.includes('模型暂时不可用')", 30_000);
  // A full navigation: the words and why it is waiting come back with the page that opens next; the picture has to be added again.
  await v.go(`/projects/${b.projectId}/?desktop=1`);
  await v.chord(); await v.composerFocused();
  await v.until("$('[data-state=attention]')?.textContent.includes('模型暂时不可用，点开手动保存，或检查模型设置（截图要重新添加）')");
  // The dot comes from the view's status message to the shell, a moment after the row is drawn.
  await b.waitFor(`document.querySelector('[data-side-plugin-open]').dataset.sideBusy === 'attention'`, 5_000);
  await v.press("[data-state=attention]");
  assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), "离开页面前没整理完的一条");
  await v.type("离开页面后补记"); await v.press("[data-issue-editor] [data-type=bug]"); await v.press("[data-issue-save]");
  await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')");
  const { items } = await v.list();
  assert.equal(items.length, 1); assert.equal(items[0]!.title, "离开页面后补记");
  assert.equal(await b.evaluate("localStorage.getItem('molis:issue-unsent')"), "[]", "nothing unfinished is left on the device");
  assert.equal((await v.assistant()).notices.length, 0, "the failed capture's work was filed away once it was settled here");
});


test("ISSUE-36 while an input method is composing, ⌘↵ and the IME's own Enter send nothing; what is sent is exactly what the composer holds", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory);
  const v = issueView(b);
  await v.viewport(1440); await v.go("/");
  await v.chord(); await v.composerFocused();
  await v.type("登录页");
  await b.command("Input.imeSetComposition", { text: "jietu", selectionStart: 5, selectionEnd: 5 }, b.sessionId);
  // ⌘↵ and the IME's commit key arrive while the pinyin is still being composed (key code 229). Whether this Chrome
  // then commits the pinyin itself is the browser's business; sending is the page's, and it must not happen.
  // 229 is the virtual IME key code. Passing it as a macOS native key code stalls Chrome even in an empty iframe.
  for (const modifiers of [4, 0]) for (const type of ["rawKeyDown", "keyUp"])
    await b.command("Input.dispatchKeyEvent", { type, modifiers, key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 }, b.sessionId);
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(await v.ask("d.querySelectorAll('[data-issue-list] [data-state]').length"), 0, "nothing is sent while composing");
  assert.equal((await v.list()).items.length, 0);
  await b.command("Input.insertText", { text: "截图" }, b.sessionId);
  await v.until("$('[data-issue-composer] [name=description]').value.endsWith('截图')");
  const held = await v.ask<string>("$('[data-issue-composer] [name=description]').value");
  assert.match(held, /^登录页.*截图$/);
  await v.send();
  await v.until("$('[data-issue-composer] [name=description]').value === ''");
  await v.until("!$('[data-issue-list] [data-state]') && $('[data-issue-list] .issues-row')", 20_000);
  const { items } = await v.list(); assert.equal(items.length, 1, "one ⌘↵ after the composition sends once");
  assert.equal((await v.read(items[0]!.id)).description, held);
});
