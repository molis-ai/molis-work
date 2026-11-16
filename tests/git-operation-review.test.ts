import assert from "node:assert/strict";
import test from "node:test";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";

test("the review queue takes a Git operation only as a Host operation with a known tool, asked by the installation that holds its kind", () => {
  const queue = new AgentReviewQueue();
  const base = { review_id: "r1", run: null, project_id: "b", plugin_id: "io.molis.work.git", kind: "tool-operation" as const,
    operation: { kind: "git-operation" as const, operation_id: "op-12345678", workspace_id: "w" },
    document: { kind: "tool-operation" as const, tool: "git-commit", summary: "提交暂存区的 1 个文件", fields: [] }, requested_at: "2026-09-25T00:00:00Z", expires_at: null };
  const held = { plugin_id: "io.molis.work.git", install_id: "i", holds: () => true };
  assert.equal(queue.request(base, held).review_id, "r1");
  assert.throws(() => queue.request({ ...base, review_id: "r2", plugin_id: "io.molis.work.coding" }, held), { code: "agent.review_not_permitted" }, "the review names the installation that asked");
  assert.throws(() => queue.request({ ...base, review_id: "r3", document: { ...base.document, tool: "git-reset-hard" } }, held), /审查必须属于/, "only the tools the Host implements");
  assert.throws(() => queue.request({ ...base, review_id: "r4", operation: { ...base.operation, workspace_id: "" } }, held), /审查必须属于/);
});


test("QEA-21 review choices follow current owner facts without writing decisions or granting execution", async () => {
  let now = new Date("2026-11-16T10:00:00Z"), held = true, effects = 0;
  const queue = new AgentReviewQueue({ now: () => now });
  const request = { review_id: "current", run: null, project_id: "project", plugin_id: "example.git", kind: "tool-operation" as const,
    operation: { kind: "git-operation" as const, operation_id: "operation-123", workspace_id: "main" },
    document: { kind: "tool-operation" as const, tool: "git-commit", summary: "Commit", fields: [] },
    requested_at: now.toISOString(), expires_at: "2026-11-16T10:10:00Z" };
  queue.request(request, { plugin_id: request.plugin_id, install_id: "original", holds: () => held });
  assert.deepEqual(queue.decisionOptions(request.review_id), { decisions: [], blocked_reason: "execution-unavailable" });
  queue.registerDecisionHandler(request.review_id, async input => {
    const receipt = queue.decide(input);
    if (input.decision === "approve") { queue.consumeApproval(input.review_id); effects++; }
    return receipt;
  });
  assert.deepEqual(queue.decisionOptions(request.review_id), { decisions: ["approve", "reject"], blocked_reason: null });
  held = false;
  assert.deepEqual(queue.decisionOptions(request.review_id), { decisions: ["reject"], blocked_reason: "authority-unavailable" });
  assert.equal(queue.receipt(request.review_id)?.status, "pending");
  assert.equal(effects, 0);
  await assert.rejects(queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "user" }), { code: "agent.review_not_permitted" });
  now = new Date("2026-11-16T10:10:00Z");
  assert.deepEqual(queue.decisionOptions(request.review_id), { decisions: [], blocked_reason: null });
  assert.equal(queue.receipt(request.review_id)?.status, "expired");
  await assert.rejects(queue.respond({ review_id: request.review_id, decision: "reject", actor_id: "user" }), { code: "agent.review_expired" });
  assert.equal(effects, 0);
  assert.equal(queue.decisionOptions("missing"), null);

  held = true;
  const next = { ...request, review_id: "next", expires_at: null };
  queue.request(next, { plugin_id: request.plugin_id, install_id: "next", holds: () => held });
  queue.registerDecisionHandler(next.review_id, async input => {
    const receipt = queue.decide(input); queue.consumeApproval(input.review_id); effects++; return receipt;
  });
  await queue.respond({ review_id: next.review_id, decision: "approve", actor_id: "user" });
  assert.deepEqual(queue.decisionOptions(next.review_id), { decisions: [], blocked_reason: null });
  assert.equal(effects, 1);
  await assert.rejects(queue.respond({ review_id: next.review_id, decision: "approve", actor_id: "user" }), { code: "agent.review_already_decided" });
  assert.equal(effects, 1);
  const cancelled = { ...request, review_id: "cancelled", expires_at: null };
  queue.request(cancelled, { plugin_id: request.plugin_id, install_id: "next", holds: () => held });
  queue.cancel(cancelled.review_id, "Stopped by owner");
  assert.deepEqual(queue.decisionOptions(cancelled.review_id), { decisions: [], blocked_reason: null });
});
