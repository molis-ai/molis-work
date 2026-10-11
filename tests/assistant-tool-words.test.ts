import assert from "node:assert/strict";
import test from "node:test";
import { applyPrologueEvent, emptyPrologueStreamState, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";
import { GUARDED_TOOL_NAMES } from "../horizontal/agent-host/src/adapters/announce-guard.js";
import { presentActivity } from "../apps/local-host/src/assistant/assistant-service.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/assistant-island.js";

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
  for (const event of events) applyPrologueEvent(state, event, "2026-10-10T00:00:00.000Z");
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
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /"computer-act": "操作应用"/);
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /"browser-act": "操作网页"/);
});
