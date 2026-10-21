import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunControl, AgentRunRef, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { PrologueAgentAdapter, type PrologueEvent, type PrologueRuntimePort } from "@molis-ai/molis-work-service-agent-host";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createPrologueError } = await import(requireSdk.resolve("@prologue/sdk")) as { createPrologueError(code: string, message: string): Error & { code: string } };

/**
 * A run control's failure reaches the caller in Agent words: the SDK's own codes are mapped in one place, an unmapped one is
 * `agent.control_failed`, and a Molis refusal passes through as it is. `details.runtime_code` is for diagnostics only.
 */

type Answer = (run: AgentRunRef, answer: Extract<AgentRunControl, { kind: "answer" }>) => Promise<"delivered" | "queued">;

async function adapterFor(options: { answer?: Answer; stop?: () => void } = {}) {
  const listeners = new Set<(event: PrologueEvent) => void>();
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => ({ ref: { id: "session-1" } }) },
    async startAgentRun() {
      return {
        run: { ref: { id: "run-1" }, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, async cancel() {} },
        control: {
          state: "running",
          stop() { options.stop?.(); }, pause() {}, resume() {}, async steer() { return { steerId: "steer-1", replayed: false }; },
          subscribe() { return () => {}; },
        },
      };
    },
    async shutdown() { return {}; },
  };
  const adapter = new PrologueAgentAdapter({
    runtime,
    modelConfiguration: async () => ({ protocol: "anthropic-messages", endpoint: "https://x.test", model: "m", credential_ref: "c" }),
    ...(options.answer ? { answerPending: options.answer } : {}),
  });
  await adapter.createSession({ title: "t" });
  const handle = await adapter.start({
    plugin_id: "io.molis.work.coding", session: { session_id: "session-1", runtime_id: "prologue" }, task: "看看这段代码", role_id: "reader",
    directory: { canonical_path: "/tmp/ws", realpath_verified: true },
    role: { role_id: "reader", version: 1, execution: "read-only", prompts: [{ prompt_id: "p", version: 1, body: "b" }], host_tools: [] },
  } as AgentStartRequest);
  for (const listener of listeners) listener({ type: "awaiting-input", pendingRef: { id: "q1", revision: 1 }, kind: "text", why: "重试几次？" });
  return { adapter, ref: handle.ref };
}

const answer = { kind: "answer" as const, pending_id: "q1", pending_revision: 1, text: "三次" };
const refusal = async (control: Promise<void>) => { try { await control; } catch (error) { return error as ActionError; } assert.fail("the control was expected to be refused"); };

test("a raw SDK PENDING_* code never reaches the caller: a closed or expired question is agent.pending_not_open", async () => {
  const codes = ["PENDING_ALREADY_SETTLED", "PENDING_EXPIRED", "PENDING_KIND_MISMATCH"];
  for (const code of codes) {
    const sdkError = createPrologueError(code, "sdk words");
    const item = await adapterFor({ answer: async () => { throw sdkError; } });
    const error = await refusal(item.adapter.control(item.ref, answer));
    assert.ok(error instanceof ActionError, code);
    assert.match(error.code, /^agent\./, `${code} reaches the caller as an Agent code`);
    assert.equal(error.details?.runtime_code, code, "the SDK code is kept for diagnostics");
    assert.equal(error.cause, sdkError);
    if (code !== "PENDING_KIND_MISMATCH") assert.equal(error.code, "agent.pending_not_open", code);
  }
});

test("BL-156: the three refusals of a round parked at a restart reach the caller as agent.session_busy, in the person's words", async () => {
  const words: Record<string, string> = {
    SESSION_RECOVERY_BUSY: "这个会话正在恢复，请稍后再试",
    SESSION_RUN_PARKED: "这个会话停在一道等你回答的问题上：先回答它，或结束那一轮",
    SESSION_HISTORY_UNAVAILABLE: "这个会话的运行记录暂时读不出来，请稍后再试",
  };
  for (const [code, message] of Object.entries(words)) {
    const sdkError = createPrologueError(code, "sdk words");
    const item = await adapterFor({ answer: async () => { throw sdkError; } });
    const error = await refusal(item.adapter.control(item.ref, answer));
    assert.equal(error.code, "agent.session_busy", code);
    assert.equal(error.message, message, `${code} is said in the person's words, not the SDK's`);
    assert.equal(error.details?.runtime_code, code);
  }
});

test("an SDK error the table does not list, or a plain failure, reaches the caller as agent.control_failed", async () => {
  const sdkError = createPrologueError("RUNTIME_NOT_READY", "not ready");
  const sdk = await adapterFor({ answer: async () => { throw sdkError; } });
  const unlisted = await refusal(sdk.adapter.control(sdk.ref, answer));
  assert.equal(unlisted.code, "agent.control_failed");
  assert.equal(unlisted.kind, "internal");
  assert.equal(unlisted.cause, sdkError);
  assert.equal(unlisted.details?.runtime_code, "RUNTIME_NOT_READY");

  const plain = new Error("socket closed");
  const item = await adapterFor({ stop: () => { throw plain; } });
  const stopped = await refusal(item.adapter.control(item.ref, { kind: "stop" }));
  assert.equal(stopped.code, "agent.control_failed", "every control maps once, not only the answer");
  assert.equal(stopped.message, "执行器没能完成这次操作，请刷新后按当前状态再试", "a plain failure's words are not shown to the person");
  assert.equal(stopped.cause, plain);
  assert.equal(stopped.details, undefined, "a failure that is not the SDK's carries no runtime code");
});

test("a Molis refusal passes through unchanged", async () => {
  const own = new ActionError("agent.answer_invalid", "请填写原问题的文字回答", { kind: "invalid" });
  const item = await adapterFor({ answer: async () => { throw own; } });
  assert.equal(await refusal(item.adapter.control(item.ref, answer)), own);
  const unwired = await adapterFor();
  assert.equal((await refusal(unwired.adapter.control(unwired.ref, answer))).code, "agent.capability_unavailable");
});
