import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { cogniaScriptedResponse } from "./cognia-model-response.ts";

// A separate process is necessary: an unknown final close deliberately retains the original storage borrow until restart.
const root = process.argv[2], phase = process.argv[3], requireSdk = createRequire(new URL("../../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const inspector = createNodeHost({ storageRoot: root }), prototype = Object.getPrototypeOf(inspector.storage), commit = prototype.commitBatch, list = prototype.list;
let armed = false, lost = 0, unsubscribed = 0, inputs = 0, turn = 0, confirmedCancellations = 0;
const lostReply = new Error(`Accepted original Surface ${phase} lost its reply`);
const unreadable = new Error("Original record readback is unavailable");
prototype.commitBatch = async function (records) {
  const result = await commit.call(this, records);
  if (armed && records.some(record => record.kind === "io.molis.work.surface-unknown-close~effects")) { armed = false; lost++; throw lostReply; }
  confirmedCancellations += records.filter(record => record.kind === "io.molis.work.surface-unknown-close~effects" && record.metadata.state === "cancelled").length;
  return result;
};
prototype.list = function (input) {
  // Without the original readback, retry must keep the original version conflict instead of inferring success.
  if (phase === "cancel-unresolved" && lost && /~(?:effects|pendings)$/u.test(input.kind)) return Promise.reject(unreadable);
  return list.call(this, input);
};
const surface = {
  kind: "desktop", identity: async () => "original-window", scope: async () => "com.example.Editor",
  observe: async () => new TextEncoder().encode("Original editor"), perform: async () => { inputs++; },
  masked: () => false, release: async () => {}, close: async () => {},
  assess: async () => { if (phase === "prepare") armed = true; return { irreversible: false }; },
};
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body));
  const result = JSON.stringify(body.messages.filter(message => message.role === "user").flatMap(message => message.content ?? []).filter(part => part.type === "tool_result").at(-1)?.content);
  if (turn++ === 0) return cogniaScriptedResponse({ name: "surface-list", input: {} });
  if (turn === 2) {
    const target = /([A-Za-z0-9_-]+) — desktop/u.exec(result)?.[1]; assert.ok(target);
    return cogniaScriptedResponse({ name: "surface-observe", input: { target, kind: "accessibility-tree" } });
  }
  if (turn === 3) {
    const observation = /observation ([A-Za-z0-9_-]+)/u.exec(result)?.[1]; assert.ok(observation);
    return cogniaScriptedResponse({ name: "surface-act", input: { observation, do: "key", keys: ["Enter"] } });
  }
  return cogniaScriptedResponse();
};
const app = { appId: "io.molis.work.surface-unknown-close", appVersion: "1.0.0" }, queue = new AgentReviewQueue();
const adapter = await createPrologueNodeAdapter({ app, storageRoot: root, reviewQueue: queue,
  modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
  resolveCredential: () => "test-only", subscribeMcpConnections: () => () => { unsubscribed++; },
  surfaces: { driverFor: () => null, desktop: () => surface, siteDecisions: () => [] },
});
const owner = { project_id: "project", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "helper", title: "Unknown original prepare" });
const run = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", task: "Use the attached editor.",
  role: { role_id: "helper", version: 1, workspace: "business", execution: "operate", prompts: [], host_tools: [] }, budget: { max_turns: 5 } });
for (const limit = Date.now() + 10_000; ;) {
  const view = await adapter.read(run.ref);
  if (phase === "prepare" ? lost === 1 : queue.list(owner.project_id, "pending").length === 1) break;
  assert.ok(Date.now() < limit, `original prepare did not reach fault: phase=${view.phase}, turns=${turn}, armed=${armed}, lost=${lost}`); await new Promise(resolve => setTimeout(resolve, 5));
}
if (phase !== "prepare") armed = true;
assert.equal(inputs, 0);
const unknown = error => error === lostReply || ["STORAGE_RECONCILE_REQUIRED", "STORAGE_CONFLICT"].includes(error?.code) || error instanceof AggregateError && error.errors.some(unknown);
const firstFailure = await adapter.close().then(() => assert.fail("original unknown close must fail"), error => error);
assert.ok(unknown(firstFailure));
const leaves = error => error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
if (phase === "cancel-unresolved") assert.ok(leaves(firstFailure).includes(unreadable), "the original pending readback refuses before final drain");
assert.equal(adapter.diagnostics().state, phase === "cancel-unresolved" ? "failed" : "stopped");
assert.equal(unsubscribed, 1);
assert.equal(lost, 1);
const busy = createPrologueNodeAdapter({ app, storageRoot: root, modelConfiguration: async () => { throw new Error("No model needed"); } });
await assert.rejects(busy, { code: "agent.storage_busy" }); await busy.close();
if (phase === "cancel") {
  assert.equal(confirmedCancellations, 1, "the original SDK must read back and acknowledge its original cancellation before cleanup can succeed");
  await adapter.close();
  const reopened = await createPrologueNodeAdapter({ app, storageRoot: root, modelConfiguration: async () => { throw new Error("Cleanup must not call a model"); } });
  await reopened.close();
} else {
  assert.equal(confirmedCancellations, 0); await assert.rejects(adapter.close(), unknown);
}
assert.equal(unsubscribed, 1); assert.equal(lost, 1); assert.equal(inputs, 0);
prototype.commitBatch = commit; prototype.list = list;
process.stdout.write(JSON.stringify({ state: adapter.diagnostics().state, lost, inputs, unsubscribed, ownerRetained: phase !== "cancel", confirmedCancellations }), () => process.exit(0));
