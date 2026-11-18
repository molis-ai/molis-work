import { reviewDecisionStorage } from "./fixtures/review-decision-storage.js";
// S-22 (PA-22): base SDK adoption behavior and retained review/budget boundaries.
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentReviewDocument, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";

const BOARD = "board-coding", PLUGIN = "io.molis.work.coding", AT = "2026-09-24T00:00:00.000Z";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function harness() {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date(AT) });
  const executed: string[] = [];
  const ask = (review_id: string, session: string, document: AgentReviewDocument, kind: AgentReviewRequest["kind"] = "command") => {
    queue.request({ review_id, reference: { owner: { kind: "agent-review", project_id: BOARD, plugin_id: PLUGIN, install_id: "install" }, id: review_id, version: "proposal-1" }, run: { run_id: `run-${session}`, session_id: session }, project_id: BOARD, plugin_id: PLUGIN, kind, document, requested_at: AT, expires_at: null });
    // The execution owner: the only path from a decision to an effect, shared by clicks and rules.
    queue.registerDecisionHandler(review_id, async (input, commit) => {
      const receipt = await commit();
      if (input.decision === "approve") { queue.consumeApproval(review_id); executed.push(review_id); }
      return receipt;
    });
  };
  const command = (args: string[], escalate: boolean | "absent" = false): AgentReviewDocument =>
    ({ kind: "command", command: "npm", args, cwd: ".", timeout_ms: 30000, env_allowlist: ["PATH"], ...(escalate === "absent" ? {} : { escalate }) });
  return { queue, executed, ask, command };
}

// specs/ai-interaction-experience AC-09 (Coding's command review): a command runs after a person's decision, and a rule only repeats it.
test("AC-09: a person can allow an in-boundary command for this session; exact repeats go through the same decision path", async () => {
  const { queue, executed, ask, command } = harness();
  ask("r1", "s1", command(["test"]));
  const first = await queue.respond({ review_id: "r1", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" });
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
  await assert.rejects(queue.respond({ review_id: "escalated", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  ask("unspecified", "s1", command(["run", "x"], "absent"));
  await assert.rejects(queue.respond({ review_id: "unspecified", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  ask("edit", "s1", { kind: "text-edit", target_path: "a.ts", exists: true, before_text: "a", after_text: "b" }, "text-edit");
  await assert.rejects(queue.respond({ review_id: "edit", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  ask("rejected", "s1", command(["test"]));
  await assert.rejects(queue.respond({ review_id: "rejected", version: "proposal-1", decision: "reject", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  assert.deepEqual(executed, [], "a refused rule request grants nothing, not even the single approval");
  for (const id of ["escalated", "unspecified", "edit", "rejected"]) assert.equal(queue.receipt(id)!.status, "pending");
  ask("again", "s1", command(["test"]));
  await tick();
  assert.equal(queue.receipt("again")!.status, "pending");
});

test("a command that names extra paths or the network is approved once, never as a standing rule, and a rule never covers it", async () => {
  const { queue, executed, ask, command } = harness();
  const widened = { ...command(["install"]), grants: { paths: [{ path: "/Users/me/.npmrc", access: "read" as const }], network: true } };
  ask("granted", "s1", widened);
  await assert.rejects(queue.respond({ review_id: "granted", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" }), /执行边界内的命令/);
  assert.equal(queue.receipt("granted")!.status, "pending");
  assert.equal((await queue.respond({ review_id: "granted", version: "proposal-1", decision: "approve", actor_id: "alice" })).status, "approved");
  // The same command without the extra access, allowed for the session, does not let the widened one through.
  ask("plain", "s1", command(["install"]));
  await queue.respond({ review_id: "plain", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" });
  ask("widened-again", "s1", widened);
  await tick();
  assert.equal(queue.receipt("widened-again")!.status, "pending", "the extra access is asked for again");
  assert.deepEqual(executed, ["granted", "plain"]);
});

test("SAI-06/08: revocation after acceptance retains the decision without establishing session approval", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date(AT) });
  let current = true;
  const ask = (review_id: string) => queue.request({ review_id, reference: { owner: { kind: "agent-review", project_id: BOARD, plugin_id: PLUGIN, install_id: "install" }, id: review_id, version: "proposal-1" }, project_id: BOARD, plugin_id: PLUGIN,
    run: { run_id: "run-s1", session_id: "s1" }, kind: "command", requested_at: AT, expires_at: null,
    document: { kind: "command", command: "npm", args: ["test"], cwd: ".", timeout_ms: 30000, env_allowlist: ["PATH"], escalate: false } });
  ask("accepted");
  queue.registerDecisionHandler("accepted", async (_input, commit) => { const receipt = await commit(); current = false; return receipt; });
  const receipt = await queue.respond({ review_id: "accepted", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" },
    { async beforeEffect() {}, assertCurrent() { assert.ok(current, "original authority revoked"); } });
  assert.equal(receipt.status, "approved"); assert.ok(!receipt.delivery_error); assert.ok(receipt.remember_error);
  ask("later"); queue.registerDecisionHandler("later", async (_input, commit) => commit()); await tick();
  assert.equal(queue.receipt("later")!.status, "pending", "revocation prevents a future grant, not the accepted receipt");
});

test("SAI-06/08: a decision with uncertain delivery cannot establish automatic session approval", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date(AT) });
  const ask = (review_id: string) => queue.request({ review_id, reference: { owner: { kind: "agent-review", project_id: BOARD, plugin_id: PLUGIN, install_id: "install" }, id: review_id, version: "proposal-1" }, project_id: BOARD, plugin_id: PLUGIN,
    run: { run_id: "run-s1", session_id: "s1" }, kind: "command", requested_at: AT, expires_at: null,
    document: { kind: "command", command: "npm", args: ["test"], cwd: ".", timeout_ms: 30000, env_allowlist: ["PATH"], escalate: false } });
  ask("uncertain");
  queue.registerDecisionHandler("uncertain", async (input, commit) => {
    await commit(); return queue.deliveryFailed(input.review_id, "Original owner did not confirm acceptance");
  });
  const result = await queue.respond({ review_id: "uncertain", version: "proposal-1", decision: "approve", actor_id: "alice", remember: "session" }, { async beforeEffect() {}, assertCurrent() {} });
  assert.ok(result.delivery_error); assert.equal(result.status, "approved", "the original decision is retained for reconciliation");
  ask("later"); queue.registerDecisionHandler("later", async (_input, commit) => commit()); await tick();
  assert.equal(queue.receipt("later")!.status, "pending", "uncertainty grants no standing authority");
});
