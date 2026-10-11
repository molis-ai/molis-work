import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { FIXTURE_TITLE, issueModel } from "./fixtures/issue-model.js";
import { issueView } from "./fixtures/issue-browser.js";

type Turn = { tools: Array<{ name: string; input_schema: { properties: { input: { type: string[] } } } }>; messages: Array<{ role: string; content: Array<{ type: string; content?: unknown }> }> };

// ISSUE-25 / ISSUE-36: real HTTP, SDK and gateway with the malformed input seen in the MiniMax journal, on the direct save.
test("ISSUE-25 ISSUE-36 a malformed save receives its contract and is corrected in the same work, saving exactly once", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { requests } = await issueModel(t, b.homeDirectory, { malformedCaptureOnce: true });
  const v = issueView(b);
  await v.viewport(1440, 1000); await v.go("/plugins/issues");
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  const issues = new DatabaseSync(join(b.homeDirectory, "issues", "issues.db")); t.after(() => issues.close());
  const description = "切换页面回来，刚才输入的文字丢失了。";
  await v.press("[data-issue-composer] [name=description]"); await v.type(description); await v.send();
  await v.until("$('[data-issue-list] .issues-row:not([data-state])')", 20_000);
  const turns = requests as Turn[];
  for (const name of ["change-reversible", "suggest-action", "read-capability", "change-capability"]) {
    assert.deepEqual(turns[0]!.tools.find(tool => tool.name === name)!.input_schema.properties.input.type,
      ["object", "array", "string", "number", "boolean", "null"], "the wire contract explicitly describes JSON values instead of leaving input untyped");
  }
  assert.equal(turns[0]!.tools.some(tool => tool.name === "find-capabilities"), true, "discovery stays available; the method just does not need it");
  const error = turns[1]!.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === "tool_result").at(-1);
  assert.ok(error, "the next model round sees why the save was refused");
  const text = typeof error.content === "string" ? error.content : JSON.stringify(error.content);
  // A direct change is checked before it runs: the refusal names the whole contract, unclipped, and says nothing ran.
  assert.match(text, /输入不符合能力合同/); assert.match(text, /Nothing was executed/);
  assert.match(text, /"required":\["draft_id","title","type"\]/); assert.match(text, /"enum":\["bug","experience","feature"\]/);
  assert.equal(turns.length, 3, "the refused call, the corrected one, and the closing sentence");
  const saved = issues.prepare("SELECT title, type, description, entered_via FROM issues").all();
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), [{ title: FIXTURE_TITLE, type: "bug", description, entered_via: "assistant" }]);
  // One send started this: no second work, round or draft is made to retry it, and no card asks to confirm it.
  const drafts = new Set(turns.map(request => JSON.stringify(request).match(/录入草稿 ([0-9a-f-]{36})/)?.[1]));
  assert.equal(drafts.size, 1); assert.ok(!drafts.has(undefined));
  const assistant = new DatabaseSync(homeSqlitePath(b.homeDirectory, "assistant"), { readOnly: true }); t.after(() => assistant.close());
  for (const table of ["assistant_works", "assistant_rounds"]) assert.equal(assistant.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n, 1, table);
  assert.equal(assistant.prepare("SELECT COUNT(*) n FROM assistant_cards").get()!.n, 0);
  await v.go("/plugins/issues"); await v.until("d.querySelectorAll('.issues-row').length === 1");
  assert.equal(issues.prepare("SELECT COUNT(*) n FROM issues").get()!.n, 1);
});

test("ISSUE-34 ISSUE-37 a save that stays malformed ends at the runtime's repeat guard and waits for the person, writing nothing", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { requests } = await issueModel(t, b.homeDirectory, { malformedCaptureAlways: true });
  const v = issueView(b);
  await v.viewport(1280); await v.go("/plugins/issues"); await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press("[data-issue-composer] [name=description]"); await v.type("点保存没反应"); await v.send();
  await v.until("$('[data-state=attention]')?.textContent.includes('没能自动整理')", 20_000);
  const { works } = await v.assistant();
  assert.equal(works.length, 1); const [view] = works;
  // The one-correction rule covers asking and suggesting; a repeated direct change is ended by the repeat guard instead.
  const failed = view!.rounds[0]!.activity.filter(action => action.verb === "change" && action.state === "failed").length;
  assert.ok(failed >= 2 && failed <= 4, `bounded attempts: ${failed}`); assert.equal(requests.length, failed);
  assert.equal(view!.work.state, "stopped"); assert.equal(view!.cards.length, 0);
  assert.match(String((view!.rounds[0] as { stop_reason?: string }).stop_reason), /重复/);
  assert.equal(await v.ask("$('[data-state=attention]').textContent.includes('TOOL_ARGUMENTS_INVALID')"), false, "no internal error text reaches the list");
  assert.equal((await v.list()).items.length, 0);
  await v.press("[data-state=attention]");
  assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), "点保存没反应");
});
