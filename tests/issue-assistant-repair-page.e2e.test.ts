import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// ISSUE-25: real HTTP / SDK / confirmation with the malformed input seen in the MiniMax journal.
test("ISSUE-25 a malformed suggestion receives its contract and is corrected in the same work, before any save", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { requests } = await issueModel(t, b.homeDirectory, { malformedCaptureOnce: true });
  const { origin, navigate, command, sessionId, click, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready==='true'");
  const issues = new DatabaseSync(join(b.homeDirectory, "issues", "issues.db")); t.after(() => issues.close());
  await click("[data-issue-new]");
  const description = "切换页面回来，刚才输入的文字丢失了。";
  await click("[name=description]"); await command("Input.insertText", { text: description }, sessionId);
  await click("[data-issue-organize]");
  await waitFor("!document.querySelector('[data-issue-save]').hidden && document.querySelector('[data-issue-save]').textContent==='确认并保存'", 15000);
  const turns = requests.filter(request => (request as { tools?: Array<{ name: string }> }).tools?.some(tool => tool.name === "suggest-action")) as Array<{
    tools: Array<{ name: string; input_schema: { properties: { input: { type: string[] } } } }>;
    messages: Array<{ role: string; content: Array<{ type: string; content?: string }> }>;
  }>;
  for (const name of ["suggest-action", "read-capability", "change-capability"]) {
    assert.deepEqual(turns[0]!.tools.find(tool => tool.name === name)!.input_schema.properties.input.type,
      ["object", "array", "string", "number", "boolean", "null"], "the wire contract explicitly describes JSON values instead of leaving input untyped");
  }
  const corrected = turns[2]!;
  const error = corrected.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === "tool_result").at(-1);
  assert.ok(error, "The next model round must see the invalid suggestion's error");
  const text = typeof error.content === "string" ? error.content : JSON.stringify(error.content);
  assert.match(text, /输入不符合能力合同/);
  assert.match(text, /^TOOL_ARGUMENTS_INVALID:/, "Use the SDK argument error, whose contract is not clipped as an unknown Host failure");
  // The old error only said '/ required' three times. A repair needs the real contract, not guessed values.
  assert.match(text, /"required":\["draft_id","title","type"\]/);
  assert.match(text, /"enum":\["bug","experience","feature"\]/);
  assert.match(text, /inside.*input/i);
  assert.equal(issues.prepare("SELECT COUNT(*) n FROM issues").get()!.n, 0);
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), description);
  assert.equal(await evaluate("document.querySelector('[name=title]').value"), "切换页面后输入内容丢失");
  assert.equal(await evaluate("document.querySelector('[name=type]').value"), "bug");
  // Only one click started this flow; no new work / request / draft is manufactured to retry it.
  const drafts = new Set(turns.map(request => JSON.stringify(request).match(/录入草稿 ([0-9a-f-]{36})/)?.[1]));
  assert.equal(drafts.size, 1); assert.ok(!drafts.has(undefined));
  const assistant = new DatabaseSync(homeSqlitePath(b.homeDirectory, "assistant"), { readOnly: true }); t.after(() => assistant.close());
  for (const table of ["assistant_works", "assistant_rounds", "assistant_cards"]) assert.equal(assistant.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n, 1, table);
  assert.equal(assistant.prepare("SELECT status FROM assistant_cards").get()!.status, "ready");
  await click("[data-issue-save]"); await waitFor("document.querySelector('[data-issue-note]').textContent==='已保存'");
  const saved = issues.prepare("SELECT title, type, description, entered_via FROM issues").all();
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), [{ title: "切换页面后输入内容丢失", type: "bug", description, entered_via: "assistant" }]);
  assert.equal(assistant.prepare("SELECT status FROM assistant_cards").get()!.status, "done");
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelectorAll('[data-issue-id]').length===1");
  assert.equal(issues.prepare("SELECT COUNT(*) n FROM issues").get()!.n, 1);
});
