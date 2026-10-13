import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
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

test("ISSUE-34 ISSUE-37 a question keeps the words and pictures, retires the asking work, and saves only after the new capture", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const behavior: Parameters<typeof issueModel>[2] = { question: "free-text" };
  const { requests } = await issueModel(t, b.homeDirectory, behavior);
  const v = await capture(b, "111");
  await v.until("$('[data-state=attention]')?.textContent.includes('需要补充：')", 20_000);
  const [initial] = (await v.assistant(true)).works;
  assert.equal(initial!.cards.length, 0); assert.equal(initial!.rounds[0]!.awaiting_input.length, 1);
  assert.equal(initial!.rounds[0]!.activity.filter(action => action.verb === "ask").length, 1);
  assert.equal(requests.length, 1, "one real SDK ask with no discovery round, then the runtime waits");
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
  const views = (await v.assistant(true)).works;
  assert.equal(views.some(view => view.work.state === "waiting-input"), false, "the asking works were stopped once answered here");
  const stale = await b.evaluate<{ ok: boolean; code: string }>(`fetch('/api/assistant/works/${initial!.work.work_id}/answer', { method: 'POST', headers: globalThis.molisWorkControlHeaders(),
    body: JSON.stringify(${JSON.stringify({ run_id: initial!.rounds[0]!.run_id, pending_id: initial!.rounds[0]!.awaiting_input[0]!.pending_id, pending_revision: initial!.rounds[0]!.awaiting_input[0]!.pending_revision, text: "迟到回答" })}) }).then(async r => ({ ok: r.ok, code: (await r.json()).code }))`);
  assert.equal(stale.ok, false, "an answer to a retired question cannot restart it"); assert.equal(stale.code, "assistant.stale");
  assert.equal((await v.list()).items.length, 1);
});

for (const question of ["correct-once", "never-correct"] as const) {
  test(`ISSUE-34 SDK ask-user contract and one parameter correction: ${question}`, { timeout: 60_000 }, async t => {
    const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
    const { requests } = await issueModel(t, b.homeDirectory, { question });
    const v = await capture(b, "111");
    await v.until(`$('[data-state=attention]')?.textContent.includes(${JSON.stringify(question === "correct-once" ? "在哪个页面点击保存" : "没能自动整理")})`, 20_000);
    const [view] = (await v.assistant(true)).works as AssistantWorkView[];
    const asks = view!.rounds[0]!.activity.filter(action => action.verb === "ask");
    assert.equal(asks.length, 2, "one failed attempt plus one correction, never six repeated failures");
    assert.equal(asks.filter(action => action.state === "failed").length, question === "correct-once" ? 1 : 2);
    const wire = requests as Array<{ tools: Array<{ name: string; input_schema: { properties: { questions: { items: { properties: { options: unknown } } } } } }>; messages: unknown }>;
    assert.deepEqual(wire[0]!.tools.find(tool => tool.name === "ask-user")!.input_schema.properties.questions.items.properties.options, {
      type: "array", items: { type: "string" }, description: "Frozen choices. The answer is taken from these labels.",
    }, "the model really receives a string-array contract, not the display question shape");
    assert.match(JSON.stringify(wire[1]!.messages), /Question options are plain labels/);
    assert.match(JSON.stringify(wire[1]!.messages), /description.*补充具体问题后再生成/, "provider parsing retains the original malformed object, without silently converting it");
    assert.equal(requests.length, 2, "no third model call after the second failed receipt or while awaiting input");
    assert.equal(view!.cards.length, 0);
    if (question === "correct-once") {
      assert.deepEqual(view!.rounds[0]!.awaiting_input[0]!.questions?.[0]?.options.map(option => option.label), ["首页", "项目页"]);
    } else {
      assert.equal(view!.work.state, "stopped"); assert.equal(view!.rounds[0]!.awaiting_input.length, 0);
      assert.equal(await v.ask("$('[data-state=attention]').textContent.includes('TOOL_ARGUMENTS_INVALID')"), false);
    }
    assert.equal((await v.list()).items.length, 0);
  });
}

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
