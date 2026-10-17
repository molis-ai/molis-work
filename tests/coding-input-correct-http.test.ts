import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { codingToolResponse } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

type Controlled = { receipt: { input_id: string; delivered: "run" | "queued" }; withdrawn: { input_id: string; from: "run" | "queued" }; code?: string };

// Stage 3b-2a of specs/ai-input-receipts (§4.6, D34): Coding's page takes back a supplement and sends a correction
// through coding.runs.control v6, which calls agent.inputs.withdraw and agent.inputs.send on the installed runtime.
test("RCPT-322: through Coding's control, a supplement the round has not read is taken back, and a correction names the input it corrects", { timeout: 90_000 }, async t => {
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const f = await codingProductHost(t, async (_request, turn) => {
    if (turn === 1) { await held; return codingToolResponse("read", { path: "note" }); }
    return cogniaModelResponse("好的。");
  });
  await writeFile(join(f.directory, "note"), "login uses the old endpoint\n");
  const project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const session = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", {});
  const control = (body: Record<string, unknown>) => f.call<Controlled>(project, coding + `/sessions/${session.body.session.session_id}/control`, body);
  const first = await f.call<{ run: { ref: AgentRunRef } }>(project, coding + `/sessions/${session.body.session.session_id}/runs`, {
    task: "把登录改到新接口", intent: "edit", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const run = first.body.run.ref.run_id, deadline = Date.now() + 15_000;
  while (!f.requests.length) { assert.ok(Date.now() < deadline, "the first model request was sent"); await new Promise(resolve => setTimeout(resolve, 20)); }

  const dropped = await control({ kind: "steer", run_id: run, text: "不要动数据库", key: "send.c1" });
  const kept = await control({ kind: "steer", run_id: run, text: "错误提示用中文", key: "send.c2" });
  assert.equal(dropped.status, 200, JSON.stringify(dropped.body));
  const taken = await control({ kind: "withdraw", run_id: run, input_id: dropped.body.receipt.input_id });
  assert.equal(taken.status, 200, JSON.stringify(taken.body));
  assert.deepEqual(taken.body.withdrawn, { input_id: dropped.body.receipt.input_id, from: "run" }, "RCPT-322 the round gave it back");
  const corrected = await control({ kind: "steer", run_id: run, text: "错误提示只改登录页的", key: "send.c3", about: kept.body.receipt.input_id });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal((await control({ kind: "withdraw", run_id: run })).status, 400, "RCPT-322 a withdrawal names the input");

  release();
  const ended: AgentRunView = await f.ended(first.body.run.ref);
  assert.equal(ended.phase, "completed", ended.stop_reason ?? "");
  const steer = (text: string) => ended.turns.find(turn => turn.text === text)?.steer;
  assert.equal(steer("不要动数据库")?.state, "withdrawn");
  assert.equal(steer("错误提示只改登录页的")?.about, kept.body.receipt.input_id, "RCPT-322 the correction's receipt names what it corrects");
  assert.ok(JSON.stringify(f.requests[0]).includes("把登录改到新接口"), "the kept requests are the ones sent");
  assert.ok(f.requests.every(request => !JSON.stringify(request).includes("不要动数据库")), "RCPT-322 what was taken back never reached the model");
  const refused = await control({ kind: "withdraw", run_id: run, input_id: kept.body.receipt.input_id });
  assert.deepEqual([refused.status, refused.body.code], [409, "agent.input_applied"], "RCPT-322 one the model read cannot be taken back");

  const late = await control({ kind: "steer", run_id: run, text: "提示文案再短一点", key: "send.c4", about: kept.body.receipt.input_id });
  assert.equal(late.body.receipt.delivered, "queued", "RCPT-322 a correction to an ended round waits for the next round");
  const back = await control({ kind: "withdraw", run_id: run, input_id: late.body.receipt.input_id });
  assert.deepEqual(back.body.withdrawn, { input_id: late.body.receipt.input_id, from: "queued" }, "RCPT-322 and is taken back from the session");
});
