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
