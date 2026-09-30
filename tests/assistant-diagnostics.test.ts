import assert from "node:assert/strict";
import test from "node:test";
import { runtimeDiagnostics } from "../horizontal/agent-host/src/adapters/prologue-node.js";
import { AGENT_DIAGNOSTICS_CLIENT_SCRIPT, renderAgentDiagnostics } from "../apps/workbench/src/settings-agent-diagnostics.js";

test("the runtime's own receipts become the diagnostics page's account: slots, missing machine capabilities, unkept records", () => {
  const view = runtimeDiagnostics({
    identity: { app: { appId: "io.molis.work", appVersion: "1.2.3" }, ownerSubjectId: "person-secret", runtimeInstanceId: "instance" },
    state: "ready",
    assembly: { fingerprint: "fp-1", slots: {
      "model-protocol": { state: "ready", implementation: "anthropic", version: "1", why: undefined, usedFallback: false },
      guardrail: { state: "unavailable", implementation: undefined, version: undefined, why: "没有实现", usedFallback: false },
    } as never },
    capabilityReport: { requested: ["network", "clock"], effective: ["network"], actual: { network: "present", clock: "undetermined", "process.spawn": "absent" } as never },
    ledgerFailures: [{ kind: "run-completed", seq: 7, code: "ledger.write_failed" }] as never,
  });
  assert.deepEqual(view.app, { app_id: "io.molis.work", app_version: "1.2.3" });
  assert.equal(view.fingerprint, "fp-1");
  assert.deepEqual(view.slots.map(slot => [slot.slot, slot.state, slot.why]), [["model-protocol", "ready", null], ["guardrail", "unavailable", "没有实现"]]);
  assert.deepEqual(view.host.not_present, [{ capability: "clock", state: "undetermined" }, { capability: "process.spawn", state: "absent" }]);
  assert.deepEqual(view.ledger_failures, [{ kind: "run-completed", seq: 7, code: "ledger.write_failed", detail: null }]);
  // Who owns the runtime is not the page's business.
  assert.doesNotMatch(JSON.stringify(view), /person-secret/);
});

test("the diagnostics section is a closed disclosure that reads only when opened, and its script parses", () => {
  const html = renderAgentDiagnostics({ L: text => text });
  assert.match(html, /<details[^>]*data-agent-diagnostics/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.doesNotThrow(() => new Function(AGENT_DIAGNOSTICS_CLIENT_SCRIPT.replace("globalThis.molisWorkBindAgentDiagnostics(document);", "")));
  assert.match(AGENT_DIAGNOSTICS_CLIENT_SCRIPT, /\/api\/assistant\/diagnostics/);
});
