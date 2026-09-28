import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSessionMessage, AgentWait } from "@molis-ai/molis-work-contracts/services/agent-host";
import { delegationStateOf, delegationViewOf, isDelegation, letterBody } from "../plugins/native/coding/src/delegation-view.js";
import { holdReason, waitViewOf, wakeBodyOf, waitingFor } from "../plugins/native/coding/src/waits.js";

const letter = (overrides: Partial<AgentSessionMessage>): AgentSessionMessage => ({
  message_id: "m1", audience: "people", kind: "request", from_session: "rt-a", to_session: "rt-b", body: JSON.stringify({ title: "写报告", task: "整理" }),
  state: "queued", sent_at_ms: Date.UTC(2026, 8, 28, 1), history: [], attachments: [], ...overrides,
} as AgentSessionMessage);

test("a delegation's state follows its letter: started means committing, and a cancel says how it ended", () => {
  assert.equal(delegationStateOf("queued", []), "received");
  assert.equal(delegationStateOf("accepted", [{ event: "accepted" } as never]), "accepted");
  assert.equal(delegationStateOf("accepted", [{ event: "accepted" } as never, { event: "started" } as never]), "committing");
  assert.equal(delegationStateOf("cancelled", [{ event: "rejected", state: "cancelled" } as never]), "rejected");
  assert.equal(delegationStateOf("cancelled", [{ event: "failed", state: "cancelled" } as never]), "failed");
  assert.equal(delegationStateOf("expired", []), "failed");
});

test("the delegation view names both ends as this project's sessions and counts every step as its revision", () => {
  const request = letter({ state: "accepted", attachments: [{ kind: "artifact", id: "a1", version: 2 }] as never,
    history: [{ event: "sent", state: "queued", at_ms: 1, by: "u" }, { event: "accepted", state: "accepted", at_ms: 2, by: "u" }] as never });
  const reply = letter({ message_id: "r1", kind: "reply", in_reply_to: "m1", body: JSON.stringify({ kind: "changeset", run_id: "run-1", title: "改动" }),
    attachments: [{ kind: "artifact", id: "c1", version: 1 }] as never, history: [{ event: "accepted", state: "accepted", at_ms: 3, by: "u" }] as never });
  assert.equal(isDelegation(request), true);
  assert.equal(isDelegation(reply), false);
  const sides = { codingOf: (runtime: string) => runtime === "rt-a" ? "coding-a" : null, sideOf: (id: string | null) => id && { session_id: id } };
  const view = delegationViewOf(request, [request, reply], sides);
  assert.equal(view.from_session, "coding-a");
  assert.equal(view.to_session, null);
  assert.deepEqual(view.from, { session_id: "coding-a" });
  assert.deepEqual(view.materials, [{ artifact_id: "a1", version: 2 }]);
  assert.equal(view.revision, 3);
  assert.equal(view.receipts[0]?.event, "submitted");
  assert.equal(view.deliveries[0]?.kind, "changeset");
  assert.equal(view.deliveries[0]?.state, "accepted");
  assert.deepEqual(letterBody(letter({ body: "not json" })), {});
});

const wait = (overrides: Partial<AgentWait>): AgentWait => ({
  wait_id: "w1", session_id: "rt-a", by: "model", on: [{ kind: "command" }], waiting_on: "构建", reason: "等构建结束", state: "fired", created_at_ms: Date.UTC(2026, 8, 28, 2), ...overrides,
} as AgentWait);

test("a fired wait wakes the next round with what happened and the original task", () => {
  const woke = wakeBodyOf(wait({ fired: { kind: "command", outcome: "succeeded", text: "ok", at_ms: Date.UTC(2026, 8, 28, 3) } } as never), { actor_id: "web-user", origin_task: "修复登录", model: "m" });
  assert.equal((woke as Record<string, unknown>).model, "m");
  assert.equal((woke as Record<string, unknown>).actor_id, undefined);
  assert.match(String((woke as Record<string, unknown>).task), /后台命令结束了（成功）[\s\S]*请接着完成原来的任务：修复登录/);
  assert.match(String((wakeBodyOf(wait({}), {}, true) as Record<string, unknown>).task), /你决定不再等构建/);
  const app = wakeBodyOf(wait({ by: "app", data: { app: { body: { task: "下一件" } }, work_id: "work-1" } } as never), {});
  assert.deepEqual(app, { task: "下一件", queued_work_id: "work-1" });
});

test("a withdrawn reply or an unfinished app wait is held for the person; the page shows what it waits for", () => {
  assert.match(holdReason(wait({ on: [{ kind: "envelope" }], fired: { kind: "envelope", outcome: "withdrawn", text: "", at_ms: 0 } } as never)) ?? "", /请求已撤回或过期/);
  assert.match(holdReason(wait({ by: "app", fired: { kind: "app", outcome: "not-done", text: "", at_ms: 0 } } as never)) ?? "", /没有完成/);
  assert.equal(holdReason(wait({ fired: { kind: "command", outcome: "succeeded", text: "", at_ms: 0 } } as never)), undefined);
  assert.equal(waitingFor(wait({ on: [{ kind: "envelope" }] } as never)), "reply");
  assert.deepEqual(waitViewOf(wait({}), "等你决定"), { wait_id: "w1", after_title: "构建", waiting_for: "command", reason: "等构建结束", at: "2026-09-28T02:00:00.000Z", note: "等你决定" });
});
