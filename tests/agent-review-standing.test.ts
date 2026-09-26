import assert from "node:assert/strict";
import test from "node:test";
import type { AgentReviewDocument, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";

const BOARD = "board-coding", PLUGIN = "io.molis.work.coding", AT = "2026-09-24T00:00:00.000Z";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function harness() {
  const queue = new AgentReviewQueue({ now: () => new Date(AT) });
  const executed: string[] = [];
  const ask = (review_id: string, session: string, document: AgentReviewDocument, kind: AgentReviewRequest["kind"] = "command") => {
    queue.request({ review_id, run: { run_id: `run-${session}`, session_id: session }, board_id: BOARD, plugin_id: PLUGIN, kind, document, requested_at: AT, expires_at: null });
    // The execution owner: the only path from a decision to an effect, shared by clicks and rules.
    queue.registerDecisionHandler(review_id, async input => {
      const receipt = queue.decide(input);
      if (input.decision === "approve") { queue.consumeApproval(review_id); executed.push(review_id); }
      return receipt;
    });
  };
  const command = (args: string[], escalate: boolean | "absent" = false): AgentReviewDocument =>
    ({ kind: "command", command: "npm", args, cwd: ".", timeout_ms: 30000, env_allowlist: ["PATH"], ...(escalate === "absent" ? {} : { escalate }) });
  return { queue, executed, ask, command };
}

test("a person can allow an in-boundary command for this session; exact repeats go through the same decision path", async () => {
  const { queue, executed, ask, command } = harness();
  ask("r1", "s1", command(["test"]));
  const first = await queue.respond({ review_id: "r1", decision: "approve", actor_id: "alice", remember: "session" });
  assert.equal(first.status, "approved"); assert.equal(first.standing_rule, undefined, "the first approval is the person's own click");
  ask("r2", "s1", command(["test"]));
  await tick();
  const repeat = queue.receipt("r2")!;
  assert.equal(repeat.status, "approved"); assert.equal(repeat.decided_by, "alice");
  assert.deepEqual(repeat.standing_rule, { set_by: "alice", set_at: AT });
  assert.match(repeat.note ?? "", /按本会话规则批准/);
  assert.deepEqual(executed, ["r1", "r2"]);
  ask("r3", "s1", command(["test", "--", "--watch"]));
  ask("r4", "s2", command(["test"]));
  await tick();
  assert.equal(queue.receipt("r3")!.status, "pending", "different arguments are a different command");
  assert.equal(queue.receipt("r4")!.status, "pending", "another session never inherits the rule");
});

test("out-of-boundary commands, file edits and rejections cannot become standing rules", async () => {
  const { queue, executed, ask, command } = harness();
  ask("escalated", "s1", command(["publish"], true));
  await assert.rejects(queue.respond({ review_id: "escalated", decision: "approve", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  ask("unspecified", "s1", command(["run", "x"], "absent"));
  await assert.rejects(queue.respond({ review_id: "unspecified", decision: "approve", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  ask("edit", "s1", { kind: "text-edit", target_path: "a.ts", exists: true, before_text: "a", after_text: "b" }, "text-edit");
  await assert.rejects(queue.respond({ review_id: "edit", decision: "approve", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  ask("rejected", "s1", command(["test"]));
  await assert.rejects(queue.respond({ review_id: "rejected", decision: "reject", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  assert.deepEqual(executed, [], "a refused rule request grants nothing, not even the single approval");
  for (const id of ["escalated", "unspecified", "edit", "rejected"]) assert.equal(queue.receipt(id)!.status, "pending");
  ask("again", "s1", command(["test"]));
  await tick();
  assert.equal(queue.receipt("again")!.status, "pending");
});
