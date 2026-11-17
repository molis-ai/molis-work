import { reviewDecisionStorage } from "./fixtures/review-decision-storage.js";
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

const request = (id: string, expires_at: string | null = null): AgentReviewRequest => ({
  review_id: id, reference: { owner: { kind: "agent-review", project_id: "project", plugin_id: "review-plugin", install_id: "install" }, id, version: "proposal-1" }, project_id: "project", plugin_id: "review-plugin", run: null,
  operation: { kind: "git-worktree", operation_id: id, workspace_id: "workspace" }, kind: "tool-operation",
  document: { kind: "tool-operation", tool: "git-worktree-create", summary: "Create a worktree", fields: [] },
  requested_at: new Date().toISOString(), expires_at,
});

function ask(queue: AgentReviewQueue, id: string, expires: string | null = null, holds = () => true) {
  queue.request(request(id, expires), { plugin_id: "review-plugin", install_id: "install", holds });
  let calls = 0;
  queue.registerDecisionHandler(id, async (input, commit) => { calls++; return await commit(); });
  return () => calls;
}

test("BL-359 APR-07: terminal reviews cannot dispatch their old handler, be registered again or consume twice", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store });
  try {
    for (const kind of ["reject", "cancel", "approve"] as const) {
      const calls = ask(queue, kind);
      if (kind === "cancel") queue.cancel(kind, "Stopped");
      else await queue.respond({ review_id: kind, version: "proposal-1", decision: kind, actor_id: "person" });
      await assert.rejects(queue.respond({ review_id: kind, version: "proposal-1", decision: "approve", actor_id: "other" }), { code: "agent.review_already_decided" });
      assert.throws(() => queue.registerDecisionHandler(kind, async (input, commit) => await commit()), { code: "agent.review_already_decided" });
      assert.equal(calls(), kind === "cancel" ? 0 : 1);
      if (kind === "approve") queue.consumeApproval(kind);
      assert.throws(() => queue.consumeApproval(kind), { code: "agent.review_not_approved" });
    }
  } finally { queue.close(); }
});

test("BL-359: expiration happens without opening the review surface and remains an expired refusal", async t => {
  const now = new Date("2026-11-13T00:00:00Z");
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now });
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store });
  try {
    const calls = ask(queue, "expires", new Date(now.getTime() + 100).toISOString());
    ask(queue, "later", new Date(now.getTime() + 200).toISOString());
    t.mock.timers.tick(100);
    await assert.rejects(queue.respond({ review_id: "expires", version: "proposal-1", decision: "reject", actor_id: "person" }), { code: "agent.review_expired" });
    assert.throws(() => queue.registerDecisionHandler("expires", async (input, commit) => await commit()), { code: "agent.review_expired" });
    assert.equal(calls(), 0);
    assert.equal(queue.receipt("expires")?.decided_by, null, "a deadline is not a person's decision");
    assert.equal(queue.receipt("later")?.status, "pending");
    t.mock.timers.tick(100);
    assert.equal(queue.receipt("later")?.status, "expired");
  } finally { queue.close(); }
});

test("BL-359 S-50: unknown and delivery failure retain original settlement provenance until the real outcome", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store });
  const events: Array<{ id: string; outcome: string; recipient: string | null }> = [];
  queue.observeSettlement((review, receipt, origin) => events.push({ id: review.review_id,
    outcome: receipt.effect_uncertain ? "unknown" : receipt.effect_settled ? "succeeded" : "failed",
    recipient: origin?.holds() ? origin.install_id : null }));
  try {
    for (const ok of [true, false]) {
      const id = String(ok); let active = true;
      ask(queue, id, null, () => active);
      await queue.respond({ review_id: id, version: "proposal-1", decision: "approve", actor_id: "person" });
      queue.consumeApproval(id);
      queue.deliveryFailed(id, "Answer receipt is uncertain");
      queue.uncertain(id, "Read the actual operation");
      assert.equal(events.at(-1)?.recipient, "install");
      active = ok; // A stopped activation is not replaced by a new activation with the same installation id.
      queue.settle(id, { ok, error: ok ? undefined : "Failed" });
      const count = events.length;
      queue.settle(id, { ok, error: ok ? undefined : "Failed" });
      assert.equal(events.length, count, "a repeated settlement does not notify twice");
      assert.deepEqual(events.at(-1), { id, outcome: ok ? "succeeded" : "failed", recipient: ok ? "install" : null });
    }
    queue.restoreDecision(request("history"), { status: "approved", decided_by: "person", decided_at: new Date().toISOString(), note: null });
    const count = events.length;
    queue.settle("history", { ok: true }, { restored: true });
    assert.equal(events.length, count, "restoration does not announce a new operation");
  } finally { queue.close(); }
});

test("BL-359: closing a queue withdraws pending decisions and refuses a new request", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store });
  ask(queue, "pending", new Date(Date.now() + 60_000).toISOString());
  queue.close(); queue.close();
  assert.equal(queue.receipt("pending")?.status, "cancelled");
  await assert.rejects(queue.respond({ review_id: "pending", version: "proposal-1", decision: "approve", actor_id: "person" }), { code: "agent.review_already_decided" });
  assert.throws(() => ask(queue, "new"), { code: "agent.capability_unavailable" });
});

test("BL-359 S-50: observers see the original authority and cannot leave one attached after synchronous cancellation", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store });
  try {
    let responding: Promise<unknown> | undefined;
    queue.observe(review => {
      if (review.review_id === "cancelled-in-observer") queue.cancel(review.review_id, "Withdrawn during publication");
      else {
        queue.registerDecisionHandler(review.review_id, async (_input, commit) => commit());
        responding = queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" });
      }
    });
    const authority = { plugin_id: "review-plugin", install_id: "install", holds: () => true };
    queue.request(request("approved-in-observer"), authority);
    await responding;
    assert.equal(queue.receipt("approved-in-observer")?.status, "approved");
    queue.consumeApproval("approved-in-observer");
    queue.request(request("cancelled-in-observer"), authority);
    assert.equal(queue.receipt("cancelled-in-observer")?.status, "cancelled");
    assert.throws(() => queue.registerDecisionHandler("cancelled-in-observer", async (input, commit) => await commit()), { code: "agent.review_already_decided" });
  } finally { queue.close(); }
});

test("BL-359: terminal queue entries release execution closures without discarding the receipt", () => {
  execFileSync(process.execPath, ["--expose-gc", new URL("./fixtures/review-lifecycle-gc.mjs", import.meta.url).pathname], { timeout: 20_000 });
});

test("BL-359 S-50: an unknown review releases the stopped Host caller and never targets its replacement", () => {
  execFileSync(process.execPath, ["--expose-gc", new URL("./fixtures/review-caller-gc.mjs", import.meta.url).pathname], { timeout: 40_000 });
});
