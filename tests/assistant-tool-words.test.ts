import assert from "node:assert/strict";
import test from "node:test";
import { applyRunEvent, emptyPrologueStreamState, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";
import { GUARDED_TOOL_NAMES } from "../horizontal/agent-host/dist/adapters/announce-guard.js";
import { presentActivity } from "../apps/local-host/src/assistant/assistant-service.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/assistant-island.js";

// A tool added to business rounds (the side panel's browser was the last) must not reach the panel under its own name.
test("every tool a business round can be given reads in the person's words in the panel, or is left out", () => {
  for (const name of GUARDED_TOOL_NAMES) {
    const [shown] = presentActivity([{ call_id: "c", name, target: "", state: "completed", summary: "", at: null }], undefined);
    if (!shown) continue;
    assert.notEqual(shown.verb, name, `${name} reaches the panel under its own name`);
    const key = shown.verb.includes("-") ? `"${shown.verb}"` : shown.verb;
    assert.ok(new RegExp(`[\\s{,]${key}:`).test(ASSISTANT_ISLAND_FACTORY_SCRIPT), `the panel has no words for ${shown.verb} (${name})`);
  }
});

function played(events: PrologueEvent[]) {
  const state = emptyPrologueStreamState();
  for (const event of events) applyRunEvent(state, event, "2026-10-10T00:00:00.000Z");
  return presentActivity(state.activity, undefined);
}

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
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /"computer-act": \["操作应用", "正在操作应用", "已操作应用"\]/);
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /"browser-act": \["操作网页", "正在操作网页", "已操作网页"\]/);
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
