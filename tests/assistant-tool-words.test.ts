import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { withPageText } from "./fixtures/page-text.js";
import { applyRunEvent, emptyPrologueStreamState, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";
import { GUARDED_TOOL_NAMES } from "../horizontal/agent-host/dist/adapters/announce-guard.js";
import { presentActivity } from "../apps/local-host/src/assistant/assistant-service.js";
import { ASSISTANT_PROCESS_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/assistant-process.js";

// A tool added to business rounds (the side panel's browser was the last) must not reach the panel under its own name.
test("every tool a business round can be given reads in the person's words in the panel, or is left out", () => {
  for (const name of GUARDED_TOOL_NAMES) {
    const [shown] = presentActivity([{ call_id: "c", name, target: "", state: "completed", summary: "", at: null }], undefined);
    if (!shown) continue;
    assert.notEqual(shown.verb, name, `${name} reaches the panel under its own name`);
    const key = shown.verb.includes("-") ? `"${shown.verb}"` : shown.verb;
    assert.ok(new RegExp(`[\\s{,]${key}:`).test(ASSISTANT_PROCESS_FACTORY_SCRIPT), `the panel has no words for ${shown.verb} (${name})`);
  }
});

function played(events: PrologueEvent[]) {
  const state = emptyPrologueStreamState();
  for (const event of events) applyRunEvent(state, event, "2026-10-10T00:00:00.000Z");
  return presentActivity(state.activity, undefined);
}

// Business receipt semantics are projected after the same production tool event pipeline, not inferred from returned transport.
function memoryReceipt(name: string, text: string, outcome: "returned" | "failed" = "returned") {
  return played([{ type: "tool-call", call: { id: "memory-result", name, input: {} } },
    { type: "tool-result", callId: "memory-result", name, text, outcome }])[0]!;
}

test("Memory candidate and false/true receipts retain their distinct business result", () => {
  const pending = memoryReceipt("remember", JSON.stringify({ memory_id: "", candidate_id: "candidate", scope: "project", applies: "本项目" }));
  assert.deepEqual([pending.verb, pending.target, pending.state, pending.detail], ["memory-suggest", "", "completed", undefined]);
  const untouched = memoryReceipt("forget-memory", JSON.stringify({ forgotten: false }));
  assert.equal(untouched.state, "failed"); assert.match(untouched.detail ?? "", /没有停用/);
  assert.equal(untouched.reason, undefined, "false does not by itself prove why the item is unavailable");
  const disabled = memoryReceipt("forget-memory", JSON.stringify({ forgotten: true }));
  assert.deepEqual([disabled.verb, disabled.state, disabled.detail], ["memory-forget", "completed", undefined]);
  const emptyApplies = memoryReceipt("remember", JSON.stringify({ memory_id: "memory", scope: "personal", applies: "" }));
  assert.deepEqual([emptyApplies.verb, emptyApplies.state], ["memory-keep", "completed"], "the existing contract permits an empty applies string");
});

test("Memory exceptions and missing, truncated or incomplete receipts never become a successful change", () => {
  const failed = memoryReceipt("forget-memory", "memory.forbidden: current access is withdrawn", "failed");
  assert.equal(failed.state, "failed");
  const absent = presentActivity([{ call_id: "missing", name: "remember", target: "", state: "completed", summary: "", at: null }], undefined)[0]!;
  assert.equal(absent.state, "unknown");
  for (const text of ["not JSON", JSON.stringify({ forgotten: "true" }), JSON.stringify({}),
    JSON.stringify({ forgotten: true, note: "x".repeat(17_000) })]) {
    assert.equal(memoryReceipt("forget-memory", text).state, "unknown", "invalid or clipped output cannot authorize a success label");
  }
  assert.equal(memoryReceipt("remember", JSON.stringify({ memory_id: "memory" })).state, "unknown", "an incomplete saved-memory receipt is unknown");
});

test("a successful desktop action reads as operating an app, and the same browser receipt stays a web action", () => {
  const desktop = played([
    { type: "tool-call", call: { id: "list", name: "surface-list", input: {} } },
    { type: "tool-result", callId: "list", name: "surface-list", outcome: "returned", text: "desk-1 — desktop, open\nbrowser-1 — browser, open" },
    { type: "tool-call", call: { id: "look", name: "surface-observe", input: { target: "desk-1", kind: "accessibility-tree" } } },
    { type: "tool-result", callId: "look", name: "surface-observe", outcome: "returned", text: "observation obs-desk (accessibility-tree)\n应用：TextEdit" },
    { type: "tool-call", call: { id: "act", name: "surface-act", input: { observation: "obs-desk", do: "pointer" } } },
    { type: "tool-result", callId: "act", name: "surface-act", outcome: "returned", text: "committed; 1 action(s) performed" },
  ]);
  const act = desktop.find(item => item.call_id === "act");
  assert.equal(act?.verb, "computer-act");
  assert.equal(act?.target, "");
  const browser = played([
    { type: "tool-call", call: { id: "list", name: "surface-list", input: {} } },
    { type: "tool-result", callId: "list", name: "surface-list", outcome: "returned", text: "browser-1 — browser, open" },
    { type: "tool-call", call: { id: "look", name: "surface-observe", input: { target: "browser-1", kind: "accessibility-tree" } } },
    { type: "tool-result", callId: "look", name: "surface-observe", outcome: "returned", text: "observation obs-web (accessibility-tree)" },
    { type: "tool-call", call: { id: "act", name: "surface-act", input: { observation: "obs-web", do: "pointer" } } },
    { type: "tool-result", callId: "act", name: "surface-act", outcome: "returned", text: "committed; 1 action(s) performed" },
  ]);
  assert.equal(browser.find(item => item.call_id === "act")?.verb, "browser-act");
  // Each verb is written whole in its three forms (as said, under way, done; specs/visual-ui-experience slice 67).
  assert.match(ASSISTANT_PROCESS_FACTORY_SCRIPT, /"computer-act": \["workbench\.assistant-process\.computer-act\.bare", "workbench\.assistant-process\.computer-act\.started", "workbench\.assistant-process\.computer-act\.completed"\]/);
  assert.match(ASSISTANT_PROCESS_FACTORY_SCRIPT, /"browser-act": \["workbench\.assistant-process\.browser-act\.bare", "workbench\.assistant-process\.browser-act\.started", "workbench\.assistant-process\.browser-act\.completed"\]/);
});

// User 2026-10-23 ⑤: a refused step carries what sort of failure it was and which fields broke which rule, never values.
test("a refused step is classified from the platform code its text carries, with the fields a contract refusal named", () => {
  const failed = (output: string) => presentActivity([{ call_id: "c", name: "change-reversible", target: "", state: "failed", summary: "", output, at: null }], undefined)[0];
  assert.deepEqual(failed('Hook "molis-action-gateway-pages" blocked "change-reversible": actions.input_invalid: 输入不符合能力合同：/ additionalProperties, /title type')?.failure,
    { kind: "invalid", fields: [{ path: "/", rule: "additionalProperties" }, { path: "/title", rule: "type" }] });
  assert.deepEqual(failed("actions.forbidden: 不能这样做")?.failure, { kind: "forbidden" });
  assert.deepEqual(failed("TOOL_ARGUMENTS_INVALID: 输入不符合能力合同。The input must be a JSON value matching this schema: {\"type\":\"object\"}")?.failure, { kind: "invalid" });
  assert.equal(failed("todo.item_locked: 这条待办正被别人改")?.failure, undefined, "an owner's own code is shown as its text");
  assert.equal(failed('Hook "molis-action-gateway-pages" blocked "change-reversible": actions.input_invalid: 输入不符合能力合同：/ additionalProperties')?.detail?.includes("Hook"), true, "the text itself is kept for the fold");
});

test("a professional Agent's own steps read as file and command work, never as business capabilities", () => {
  assert.deepEqual(presentActivity([
    { call_id: "a", name: "list", target: ".", state: "completed", summary: "list", at: null },
    { call_id: "b", name: "edit", target: "calc.js", state: "completed", summary: "edit", at: null },
    { call_id: "c", name: "run-command", target: "npm test", state: "started", summary: "run-command", at: null },
  ], undefined), [
    { call_id: "a", verb: "file-list", target: ".", state: "completed" },
    { call_id: "b", verb: "file-change", target: "calc.js", state: "completed" },
    { call_id: "c", verb: "command", target: "npm test", state: "started" },
  ]);
  // Stopped while an edit waited for approval: the one never closed has no recorded outcome; the cancelled one did not run.
  assert.deepEqual(presentActivity([
    { call_id: "d", name: "write", target: "calc.js", state: "started", summary: "write", at: null },
    { call_id: "e", name: "write", target: "README.md", state: "failed", summary: "write · TOOL_INTERRUPTED", output: "TOOL_INTERRUPTED: this run was cancelled before the tool ran.", at: null },
  ], undefined, true), [
    { call_id: "d", verb: "file-change", target: "calc.js", state: "unknown" },
    { call_id: "e", verb: "file-change", target: "README.md", state: "failed", reason: "interrupted", detail: "this run was cancelled before the tool ran." },
  ]);
});

// BL-100: a write still waiting for an approval when the round ended was never dispatched, so it reads as not executed.
test("a call whose approval never came when the round ended reads as not executed", () => {
  assert.deepEqual(presentActivity([
    { call_id: "c", name: "edit", target: "report.md", state: "failed", summary: "edit · 等待批准时这一轮结束，没有执行", at: null },
  ], undefined, true), [
    { call_id: "c", verb: "file-change", target: "report.md", state: "failed", reason: "interrupted" },
  ]);
});

// FSS-36/39: the prior complete forms, independently retained from the original step copy, cover every existing verb.
const STEP_WORDS = [
  ["lookup", ["查找能力", "正在查找能力", "已查找能力"], ["look up capabilities", "Looking up capabilities", "Looked up capabilities"]],
  ["read", ["读取", "正在读取", "已读取"], ["read", "Reading", "Read"]],
  ["change", ["修改", "正在修改", "已修改"], ["change", "Changing", "Edited"]],
  ["suggest", ["准备操作卡", "正在准备操作卡", "已准备操作卡"], ["prepare an action card", "Preparing an action card", "Prepared an action card"]],
  ["ask", ["向你提问", "正在向你提问", "已向你提问"], ["ask you", "Asking you", "Asked you"]],
  ["todo", ["更新工作步骤", "正在更新工作步骤", "已更新工作步骤"], ["update the work steps", "Updating the work steps", "Updated the work steps"]],
  ["lookup-tools", ["查找工具", "正在查找工具", "已查找工具"], ["look up tools", "Looking up tools", "Looked up tools"]],
  ["delegate", ["委托子任务", "正在委托子任务", "已委托子任务"], ["delegate a sub-task", "Delegating a sub-task", "Delegated a sub-task"]],
  ["delegate-check", ["查看子任务", "正在查看子任务", "已查看子任务"], ["check sub-tasks", "Checking sub-tasks", "Checked sub-tasks"]],
  ["delegate-follow-up", ["让子任务补改", "正在让子任务补改", "已让子任务补改"], ["ask a sub-task to fix", "Asking a sub-task to fix", "Asked a sub-task to fix"]],
  ["delegate-stop", ["停止子任务", "正在停止子任务", "已停止子任务"], ["stop a sub-task", "Stopping a sub-task", "Stopped a sub-task"]],
  ["memory-keep", ["记下你的要求", "正在记下你的要求", "已记下你的要求"], ["keep what you asked", "Keeping what you asked", "Kept what you asked"]],
  ["memory-list", ["查看记住的事", "正在查看记住的事", "已查看记住的事"], ["look at what is remembered", "Looking at what is remembered", "Looked at what is remembered"]],
  ["memory-forget", ["删除一条记忆", "正在删除一条记忆", "已删除一条记忆"], ["delete a memory", "Deleting a memory", "Deleted a memory"]],
  ["memory-suggest", ["建议记住一条", "正在建议记住一条", "已建议记住一条"], ["suggest something to keep", "Suggesting something to keep", "Suggested something to keep"]],
  ["file-read", ["读取文件", "正在读取文件", "已读取文件"], ["read", "Reading", "Read"]],
  ["file-list", ["查看目录", "正在查看目录", "已查看目录"], ["list", "Listing", "Listed"]],
  ["file-search", ["搜索代码", "正在搜索代码", "已搜索代码"], ["search code for", "Searching code for", "Searched code for"]],
  ["file-change", ["修改文件", "正在修改文件", "已修改文件"], ["edit", "Editing", "Edited"]],
  ["command", ["运行命令", "正在运行命令", "已运行命令"], ["run", "Running", "Ran"]],
  ["command-output", ["查看命令输出", "正在查看命令输出", "已查看命令输出"], ["check output of", "Checking output of", "Checked output of"]],
  ["auto-continue", ["自动续做", "正在自动续做", "已自动续做"], ["continue automatically", "Continuing automatically", "Continued automatically"]],
  ["compact", ["整理上下文", "正在整理上下文", "已整理上下文"], ["compact the context", "Compacting the context", "Compacted the context"]],
  ["browser-list", ["找到侧栏浏览器", "正在找到侧栏浏览器", "已找到侧栏浏览器"], ["find the side browser", "Finding the side browser", "Found the side browser"]],
  ["browser-look", ["查看网页", "正在查看网页", "已查看网页"], ["look at the page", "Looking at the page", "Looked at the page"]],
  ["browser-act", ["操作网页", "正在操作网页", "已操作网页"], ["act on the page", "Acting on the page", "Acted on the page"]],
  ["computer-list", ["查看可操作的应用", "正在查看可操作的应用", "已查看可操作的应用"], ["look at which apps it can use", "Looking at which apps it can use", "Looked at which apps it can use"]],
  ["computer-look", ["查看应用窗口", "正在查看应用窗口", "已查看应用窗口"], ["look at the app’s window", "Looking at the app’s window", "Looked at the app’s window"]],
  ["computer-act", ["操作应用", "正在操作应用", "已操作应用"], ["act on the app", "Acting on the app", "Acted on the app"]],
  ["ended-on-promise", ["收尾", "正在收尾", "已收尾"], ["wrap up", "Wrapping up", "Wrapped up"]],
] as const;

test("FSS-36 FSS-39: each Assistant verb keeps its bare, started and completed meaning in both languages", () => {
  const factory = vm.runInNewContext(`(${ASSISTANT_PROCESS_FACTORY_SCRIPT})`, { t: uiText }) as (input: object) => { activityLine(item: object): string };
  const process = factory({});
  for (const locale of ["zh", "en"] as const) withPageText(locale, [], () => {
    for (const [verb, zh, en] of STEP_WORDS) {
      const words = locale === "zh" ? zh : en, target = "原文 <x> & ‘read’";
      const suffix = (verb === "ask" ? "：" : " ") + target;
      assert.equal(process.activityLine({ verb, target, state: "started" }), words[1] + suffix, verb + ":started:" + locale);
      assert.equal(process.activityLine({ verb, target, state: "completed" }), words[2] + suffix, verb + ":completed:" + locale);
      assert.equal(process.activityLine({ verb, target, state: "failed", reason: "not-authorized" }),
        words[0].charAt(0).toUpperCase() + words[0].slice(1) + suffix + " — " + (locale === "zh" ? "未获授权，没有执行" : "not authorized, nothing done"), verb + ":bare:" + locale);
    }
    assert.equal(process.activityLine({ verb: "external-tool", target: "原文", state: "unknown" }),
      "External-tool 原文 — " + (locale === "zh" ? "结果未确认" : "Result unconfirmed"));
  });
});
