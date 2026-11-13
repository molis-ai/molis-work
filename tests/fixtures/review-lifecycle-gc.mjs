import assert from "node:assert/strict";
import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";

const queue = new AgentReviewQueue(), references = [];
async function create(id, finish) {
  const caller = { id }, execution = { id };
  references.push(new WeakRef(caller), new WeakRef(execution));
  queue.request({ review_id: id, project_id: "project", plugin_id: "plugin", run: null,
    operation: { kind: "git-worktree", operation_id: id, workspace_id: "workspace" }, kind: "tool-operation",
    document: { kind: "tool-operation", tool: "git-worktree-create", summary: "Test", fields: [] },
    requested_at: new Date().toISOString(), expires_at: finish === "expire" ? new Date(Date.now() + 20).toISOString() : null,
  }, { plugin_id: "plugin", install_id: "install", holds: () => caller.id === id });
  queue.registerDecisionHandler(id, async input => {
    assert.equal(execution.id, id);
    return queue.decide(input);
  });
  if (finish === "reject") await queue.respond({ review_id: id, decision: "reject", actor_id: "person" });
  else if (finish === "cancel") queue.cancel(id, "Cancelled");
  else if (finish !== "expire") {
    await queue.respond({ review_id: id, decision: "approve", actor_id: "person" });
    queue.consumeApproval(id);
    queue.settle(id, { ok: finish === "success", error: "Failed" });
  }
}
function cancelDuringPublication() {
  const caller = { id: "observed" };
  references.push(new WeakRef(caller));
  const stop = queue.observe(request => queue.cancel(request.review_id, "Withdrawn by observer"));
  queue.request({ review_id: "observed", project_id: "project", plugin_id: "plugin", run: null,
    operation: { kind: "git-worktree", operation_id: "observed", workspace_id: "workspace" }, kind: "tool-operation",
    document: { kind: "tool-operation", tool: "git-worktree-create", summary: "Test", fields: [] },
    requested_at: new Date().toISOString(), expires_at: null,
  }, { plugin_id: "plugin", install_id: "install", holds: () => caller.id === "observed" });
  stop();
}
try {
  for (const finish of ["reject", "cancel", "expire", "success", "failure"]) await create(finish, finish);
  cancelDuringPublication();
  // No list/receipt read occurs here: the real deadline timer must release the expired caller by itself.
  await delay(50);
  let collected = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await nextTurn(); globalThis.gc();
    if (references.every(reference => reference.deref() === undefined)) { collected = true; break; }
  }
  assert.ok(collected, "terminal reviews retain neither caller nor execution closures");
  assert.equal(queue.receipt("expire").status, "expired");
  assert.equal(queue.receipt("success").effect_settled, true);
  assert.equal(queue.receipt("failure").effect_error, "Failed");
} finally { queue.close(); }
