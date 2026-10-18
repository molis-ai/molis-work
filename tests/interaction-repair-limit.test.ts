import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostQuestionTypes, hostReferenceKinds } from "@molis-ai/molis-work-app-local-host";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

// A question the runtime refuses twice ends the round before a third model call (withInteractionRepairLimit). The Host stopped
// it, not the person, so the round says why, while it is live and after the Host reopens.

// The id breaks the questionnaire's id format, so ask-user refuses it with TOOL_ARGUMENTS_INVALID.
const MALFORMED = { why: "选一个 YAML 解析库", questions: [{ id: "yaml-lib", type: "text", prompt: "用哪个库" }] };
const owner = { project_id: "repair-limit", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
const REASON = /^要向你提的问题连续两次格式不合格，没能交给你，这一轮先停在这里；已完成的保留，可以说明怎么调整后继续$/;

test("a question refused twice stops the round, and the round says so live and after the Host reopens", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "interaction-repair-limit-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => ++requests <= 2 ? cogniaScriptedResponse({ name: "ask-user", input: MALFORMED }) : cogniaModelResponse("不该有第三次调用。"));
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.interaction-repair-limit-test", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), questionTypes: hostQuestionTypes(), referenceKinds: hostReferenceKinds(), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });

  let adapter = await open();
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Repair limit" });
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "让 src/config.js 也能读 YAML，先问我用哪个库" });
  const deadline = Date.now() + 40_000;
  let live = await adapter.read(handle.ref);
  while (!["completed", "failed", "stopped", "cancelled"].includes(live.phase)) {
    assert.ok(Date.now() < deadline, "the round did not end after the second refusal");
    await new Promise(resolve => setTimeout(resolve, 10));
    live = await adapter.read(handle.ref);
  }
  assert.equal(live.phase, "stopped");
  assert.match(live.stop_reason ?? "", REASON, "the live round says which interaction was refused twice");
  assert.equal(requests, 2, "no third model call after the second refusal");
  assert.equal(live.activity.filter(item => item.name === "ask-user" && item.state === "failed").length, 2);

  await adapter.close();
  adapter = await open();
  t.after(() => adapter.close());
  const restored = (await adapter.readSession(session)).latest_run;
  assert.equal(restored?.phase, "stopped", "after reopening it still reads as stopped, not as cancelled");
  assert.equal(restored?.stop_reason, live.stop_reason, "and keeps the same reason");
  assert.equal(requests, 2);
});
