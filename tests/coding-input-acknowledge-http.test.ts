import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { codingToolResponse } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// Stage 3e-0b of specs/ai-input-receipts: Coding's roles list acknowledge-inputs themselves (they are workspace roles, not
// business ones). The runtime shows the round each supplement's id only when it lists the tool, and keeps what the round
// says as the AI's claim; the ledger's own state stays the ledger's.
test("RCPT-364, 3e-0b: a Coding round is offered acknowledge-inputs, sees the supplement's id, and what it says lands on the receipt as its claim", { timeout: 90_000 }, async t => {
  let release = () => {}, seen = "";
  const held = new Promise<void>(resolve => { release = resolve; });
  const tools = (body: unknown) => ((body as { tools?: Array<{ name: string }> }).tools ?? []).map(tool => tool.name);
  const f = await codingProductHost(t, async (request, turn) => {
    if (turn === 1) { await held; return codingToolResponse("read", { path: "note" }); }
    if (turn === 2) {
      seen = JSON.stringify(request).match(/steer-[0-9a-z]+-[0-9a-z]+/)?.[0] ?? "";
      return codingToolResponse("acknowledge-inputs", { items: [{ input: seen, treatment: "apply-now", kind: "constraint", impacts: ["constraint"], note: "不动数据库" }] });
    }
    return cogniaModelResponse("好的。");
  });
  await writeFile(join(f.directory, "note"), "login uses the old endpoint\n");
  const project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const session = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", {});
  const first = await f.call<{ run: { ref: AgentRunRef } }>(project, coding + `/sessions/${session.body.session.session_id}/runs`, {
    task: "把登录改到新接口", intent: "edit", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const deadline = Date.now() + 15_000;
  while (!f.requests.length) { assert.ok(Date.now() < deadline, "the first model request was sent"); await new Promise(resolve => setTimeout(resolve, 20)); }
  const sent = await f.call<{ receipt: { input_id: string } }>(project, coding + `/sessions/${session.body.session.session_id}/control`,
    { kind: "steer", run_id: first.body.run.ref.run_id, text: "不要动数据库", key: "send.k1" });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));

  release();
  const ended: AgentRunView = await f.ended(first.body.run.ref);
  assert.equal(ended.phase, "completed", ended.stop_reason ?? "");
  assert.ok(tools(f.requests[0]).includes("acknowledge-inputs"), `RCPT-364 the Coding round lists it: ${tools(f.requests[0])}`);
  const steer = ended.turns.find(turn => turn.text === "不要动数据库")?.steer;
  assert.ok(steer, "the supplement has its receipt");
  assert.equal(seen, sent.body.receipt.input_id, "RCPT-364 the model saw the supplement's id, as the runtime gave it");
  assert.equal(steer.id, seen);
  assert.deepEqual([steer.model_claim?.treatment, steer.model_claim?.kind, steer.model_claim?.impacts], ["apply-now", "constraint", ["constraint"]], "RCPT-364 kept as the AI's own claim");
  assert.equal(steer.state, "read", "the ledger's fact stays the ledger's");
});
