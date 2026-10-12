import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const note = "document.querySelector('[data-issue-assistant-note]')";
const works = "fetch('/api/assistant/works').then(r=>r.json()).then(r=>Promise.all(r.works.map(w=>fetch('/api/assistant/works/'+w.work_id).then(r=>r.json()))))";

async function openDraft(b: Browser, description = "111") {
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/plugins/issues" }, b.sessionId));
  await b.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready==='true'");
  await b.click("[data-issue-new]"); await b.click("[name=description]");
  await b.command("Input.insertText", { text: description }, b.sessionId);
}

test("ISSUE-34 structured clarification keeps source, revokes the old work and requires a new confirmation to save", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const behavior: Parameters<typeof issueModel>[2] = { question: "free-text" };
  const { requests } = await issueModel(t, b.homeDirectory, behavior);
  await openDraft(b); await b.click("[data-issue-organize]");
  await b.waitFor(`${note}.textContent.startsWith('还需要一点具体信息：')`, 15000);
  assert.equal(await b.evaluate(`${note}.classList.contains('is-error')`), false);
  assert.equal(await b.evaluate("document.querySelector('[data-issue-revise]').textContent"), "补充描述");
  assert.equal(await b.evaluate("document.querySelector('[data-issue-revise]').classList.contains('mw-btn--primary')"), true);
  assert.equal(await b.evaluate("document.querySelector('[data-issue-retry]').hidden"), true);
  assert.equal(await b.evaluate("document.querySelector('[data-issue-manual]').hidden"), false);
  assert.equal(await b.evaluate("document.querySelector('[name=title]').value+document.querySelector('[name=type]').value"), "");
  const initial = (await b.evaluate<AssistantWorkView[]>(works))[0]!;
  assert.equal(initial.cards.length, 0); assert.equal(initial.rounds[0]!.awaiting_input.length, 1);
  assert.equal(initial.rounds[0]!.activity.filter(a => a.verb === "ask").length, 1);
  assert.equal(requests.length, 2, "one discovery and one real SDK ask, then the runtime waits");
  const db = new DatabaseSync(join(b.homeDirectory, "issues", "issues.db"), { readOnly: true }); t.after(() => db.close());
  const count = () => db.prepare("SELECT count(*) n FROM issues").get()!.n;
  assert.equal(count(), 0);
  await b.click("[data-issue-revise]");
  await b.waitFor("!document.querySelector('[name=description]').readOnly");
  assert.equal(await b.evaluate("document.querySelector('[name=description]').value"), "111");
  assert.equal(await b.evaluate("document.activeElement.matches('[name=description]')"), true);
  await b.command("Input.insertText", { text: "；点保存没反应" }, b.sessionId);
  await b.evaluate("(()=>{const c=document.createElement('canvas');c.width=30;c.height=20;const data=c.toDataURL('image/png'),dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(data.split(',')[1]),x=>x.charCodeAt(0))],'现场.png',{type:'image/png'}));document.querySelector('[data-issue-drop]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));})()");
  await b.waitFor("document.querySelectorAll('[data-issue-images] img').length===1 && !document.querySelector('[data-issue-organize]').disabled");
  const source = await b.evaluate("({description:document.querySelector('[name=description]').value,image:document.querySelector('[data-issue-images] img').src})");
  // A second clarification must retain images as well as text when returning to edit.
  await b.click("[data-issue-organize]"); await b.waitFor(`${note}.textContent.startsWith('还需要一点具体信息：')`, 15000);
  await b.click("[data-issue-revise]"); await b.waitFor("!document.querySelector('[name=description]').readOnly");
  assert.deepEqual(await b.evaluate("({description:document.querySelector('[name=description]').value,image:document.querySelector('[data-issue-images] img').src})"), source);
  behavior.question = undefined;
  await b.click("[data-issue-organize]");
  await b.waitFor("document.querySelector('[data-issue-save]').textContent==='确认并保存'", 15000);
  assert.equal(count(), 0); assert.equal(await b.evaluate("document.querySelector('[name=title]').disabled"), false);
  await b.click("[data-issue-save]"); await b.waitFor("document.querySelector('[data-issue-note]').textContent==='已保存'");
  assert.equal(count(), 1);
  const row = db.prepare("SELECT description FROM issues").get()!;
  assert.equal(row.description, (source as { description: string }).description);
  assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>fetch('/api/plugins/io.molis.work.issues/read?id='+r.items[0].id)).then(r=>r.json()).then(r=>r.images[0].data_url)"), (source as { image: string }).image);
  const original = (await b.evaluate<AssistantWorkView[]>(works)).find(w => w.work.work_id === initial.work.work_id)!;
  assert.equal(original.work.state, "stopped");
  // The runtime keeps unanswered questions as history; they cannot restart a stopped run.
  assert.ok(original.rounds[0]!.awaiting_input.every(question => question.answerable === false));
  const pending = initial.rounds[0]!.awaiting_input[0]!;
  const before = requests.length;
  const rejected = await b.evaluate<{ ok: boolean; code: string }>(`fetch('/api/assistant/works/${initial.work.work_id}/answer', {method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify(${JSON.stringify({ run_id: initial.rounds[0]!.run_id, pending_id: pending.pending_id, pending_revision: pending.pending_revision, text: "迟到回答" })})}).then(async r=>({ok:r.ok,code:(await r.json()).code}))`);
  assert.equal(rejected.ok, false); assert.equal(rejected.code, "assistant.stale");
  assert.equal(requests.length, before); assert.equal(count(), 1);
});

for (const question of ["correct-once", "never-correct"] as const) {
  test(`ISSUE-34 SDK ask-user contract and one parameter correction: ${question}`, { timeout: 60_000 }, async t => {
    const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
    const { requests } = await issueModel(t, b.homeDirectory, { question });
    await openDraft(b); await b.click("[data-issue-organize]");
    await b.waitFor(`${note}.textContent.includes('${question === "correct-once" ? "在哪个页面点击保存" : "未获得有效整理结果"}')`, 15000);
    const view = (await b.evaluate<AssistantWorkView[]>(works))[0]!;
    const asks = view.rounds[0]!.activity.filter(a => a.verb === "ask");
    assert.equal(asks.length, 2, "one failed attempt plus one correction, never six repeated failures");
    assert.equal(asks.filter(a => a.state === "failed").length, question === "correct-once" ? 1 : 2);
    const wire = requests as Array<{ tools: Array<{ name: string; input_schema: { properties: { questions: { items: { properties: { options: unknown } } } } } }>; messages: unknown }>;
    const offered = wire[0]!.tools.find(tool => tool.name === "ask-user")!;
    assert.deepEqual(offered.input_schema.properties.questions.items.properties.options, {
      type: "array", items: { type: "string" }, description: "Frozen choices. The answer is taken from these labels.",
    }, "the model really receives a string-array contract, not the display question shape");
    assert.match(JSON.stringify(wire[2]!.messages), /Question options are plain labels/);
    assert.match(JSON.stringify(wire[2]!.messages), /description.*补充具体问题后再生成/, "provider parsing retains the original malformed object, without silently converting it");
    assert.equal(requests.length, 3, "no fourth model call after the second failed receipt or while awaiting input");
    assert.equal(view.cards.length, 0);
    if (question === "correct-once") {
      assert.equal(view.rounds[0]!.awaiting_input.length, 1);
      assert.deepEqual(view.rounds[0]!.awaiting_input[0]!.questions?.[0]?.options.map(o => o.label), ["首页", "项目页"]);
      assert.equal(await b.evaluate(`${note}.classList.contains('is-error')`), false);
    } else {
      assert.equal(view.work.state, "stopped");
      assert.equal(view.rounds[0]!.awaiting_input.length, 0);
      assert.equal(await b.evaluate(`${note}.textContent.includes('TOOL_ARGUMENTS_INVALID')`), false);
      assert.equal(await b.evaluate("document.querySelector('[data-issue-retry]').hidden"), false);
    }
    assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length)"), 0);
  });
}

test("ISSUE-34 repeated malformed confirmation stops after one correction without a card or write", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { requests } = await issueModel(t, b.homeDirectory, { malformedCaptureAlways: true });
  await openDraft(b, "点保存没反应"); await b.click("[data-issue-organize]");
  await b.waitFor(`${note}.textContent.includes('未获得有效整理结果')`, 15000);
  const view = (await b.evaluate<AssistantWorkView[]>(works))[0]!;
  assert.equal(view.rounds[0]!.activity.filter(a => a.verb === "suggest" && a.state === "failed").length, 2);
  assert.equal(requests.length, 3); assert.equal(view.work.state, "stopped"); assert.equal(view.cards.length, 0);
  assert.equal(await b.evaluate("document.querySelector('[name=description]').value"), "点保存没反应");
  assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length)"), 0);
});

test("ISSUE-34 unavailable model and organizing timeout keep input and recover without stale results", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const behavior: Parameters<typeof issueModel>[2] = { unavailable: true };
  await issueModel(t, b.homeDirectory, behavior); await openDraft(b, "点保存没反应");
  await b.click("[data-issue-organize]");
  await b.waitFor(`${note}.textContent.includes('检查模型设置或连接')`, 20000);
  assert.equal(await b.evaluate(`${note}.classList.contains('is-error')`), true);
  assert.equal(await b.evaluate("document.querySelector('[name=description]').value"), "点保存没反应");
  behavior.unavailable = false;
  let finish!: () => void; behavior.firstReply = new Promise<void>(resolve => { finish = resolve; }); t.after(() => finish());
  await b.click("[data-issue-retry]"); await b.waitFor(`${note}.textContent.includes('正在整理')`);
  await b.evaluate("window.issueOriginalNow=Date.now;Date.now=()=>window.issueOriginalNow()+121000");
  await b.waitFor(`${note}.textContent.includes('整理超时')`);
  await b.evaluate("Date.now=window.issueOriginalNow");
  await b.click("[data-issue-revise]"); await b.waitFor("!document.querySelector('[name=description]').readOnly");
  finish(); behavior.firstReply = undefined;
  await b.click("[name=description]"); await b.command("Input.insertText", { text: "，这是补充后的新描述" }, b.sessionId);
  await b.click("[data-issue-organize]");
  await b.waitFor("document.querySelector('[data-issue-save]').textContent==='确认并保存'", 15000);
  assert.equal(await b.evaluate("document.querySelector('[name=description]').value"), "点保存没反应，这是补充后的新描述");
  assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length)"), 0);
  await b.click("[data-issue-revise]"); await b.waitFor("!document.querySelector('[name=description]').readOnly");
  const views = await b.evaluate<AssistantWorkView[]>(works);
  assert.equal(views.flatMap(view => view.cards).filter(card => card.status === "ready" || card.status === "done").length, 0, "no cancelled suggestion remains executable");
});
