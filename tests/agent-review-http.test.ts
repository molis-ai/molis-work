import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { AgentHost, handleAgentReviewHttp } from "@molis-ai/molis-work-app-local-host";
import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

/** 宿主的审查队列走 HTTP：只有宿主能决定，而且批准不等于已发生。 */

const BOARD = "board-a";

function pending(reviewId: string): AgentReviewRequest {
  return {
    review_id: reviewId,
    run: { run_id: "run-1", session_id: "s-1" },
    board_id: BOARD,
    plugin_id: "io.molis.work.coding",
    kind: "text-edit",
    document: {
      kind: "text-edit", target_path: "a.ts", exists: true,
      before_text: "old", after_text: "new",
    },
    requested_at: "2026-09-19T14:00:00Z",
    expires_at: null,
  };
}

async function fixture() {
  const { AgentHost: Host } = await import("@molis-ai/molis-work-service-agent-host");
  const agentHost = new Host();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    void handleAgentReviewHttp(request, response, url, {
      boardId: BOARD, agentHost, actorId: "user",
    }).then((handled) => {
      if (!handled) { response.writeHead(404); response.end(); }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { agentHost, server, base: `http://127.0.0.1:${port}` };
}

test("待审列表读得到，批准之后回执说「还没发生」", async () => {
  const item = await fixture();
  try {
    item.agentHost.reviews.request(pending("r1"));
    item.agentHost.reviews.registerDecisionHandler("r1", async input => item.agentHost.reviews.decide(input));

    const listed = await (await fetch(`${item.base}/api/agent/reviews?status=pending`)).json() as
      { reviews: Array<{ request: { review_id: string }; receipt: { status: string; decided_by: string | null; effect_settled: boolean } }> };
    assert.deepEqual(listed.reviews.map((row) => row.request.review_id), ["r1"]);
    // 回执总是在，它描述的是当前处境；待审时没有决定人，也谈不上已发生
    assert.equal(listed.reviews[0]?.receipt.status, "pending");
    assert.equal(listed.reviews[0]?.receipt.decided_by, null);
    assert.equal(listed.reviews[0]?.receipt.effect_settled, false);

    const decided = await fetch(`${item.base}/api/agent/reviews/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ review_id: "r1", decision: "approve" }),
    });
    assert.equal(decided.status, 200);
    const { receipt } = await decided.json() as { receipt: { status: string; effect_settled: boolean } };
    assert.equal(receipt.status, "approved");
    assert.equal(receipt.effect_settled, false,
      "批准只是允许它发生，不是它已经发生");
  } finally {
    item.server.close();
  }
});

test("同一条不能决定两次——换个入口重放也不行", async () => {
  const item = await fixture();
  try {
    item.agentHost.reviews.request(pending("r1"));
    item.agentHost.reviews.registerDecisionHandler("r1", async input => item.agentHost.reviews.decide(input));
    const body = JSON.stringify({ review_id: "r1", decision: "reject" });
    const headers = { "content-type": "application/json" };

    const first = await fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers, body });
    assert.equal(first.status, 200);

    const second = await fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers, body });
    assert.equal(second.status, 409, "重放必须是冲突，不能当成又一次成功");
    const payload = await second.json() as { error: string };
    assert.equal(typeof payload.error, "string");
  } finally {
    item.server.close();
  }
});

test("不存在的待审返回 404，而不是假装决定成功", async () => {
  const item = await fixture();
  try {
    const response = await fetch(`${item.base}/api/agent/reviews/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ review_id: "nope", decision: "approve" }),
    });
    assert.equal(response.status, 404);
  } finally {
    item.server.close();
  }
});

test("缺字段的请求被挡下", async () => {
  const item = await fixture();
  try {
    for (const body of [{}, { review_id: "r1" }, { review_id: "r1", decision: "maybe" }]) {
      const response = await fetch(`${item.base}/api/agent/reviews/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, `${JSON.stringify(body)} 应当被拒`);
    }
  } finally {
    item.server.close();
  }
});


test("another project's review cannot be decided even with a known review id", async () => {
  const item = await fixture();
  try {
    item.agentHost.reviews.request({ ...pending("foreign"), board_id: "board-b" });
    let calls = 0;
    item.agentHost.reviews.registerDecisionHandler("foreign", async input => { calls++; return item.agentHost.reviews.decide(input); });
    const response = await fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ review_id: "foreign", decision: "approve" }) });
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
    assert.equal(item.agentHost.reviews.receipt("foreign")?.status, "pending");
  } finally { item.server.close(); }
});

test("an unconnected review owner cannot turn an HTTP approval into a false success", async () => {
  const item = await fixture();
  try {
    item.agentHost.reviews.request(pending("orphan"));
    const response = await fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ review_id: "orphan", decision: "approve" }) });
    assert.equal(response.status, 409);
    assert.equal(item.agentHost.reviews.receipt("orphan")?.status, "pending");
  } finally { item.server.close(); }
});

test("Host review refresh reads owner receipts and renders only the requested run with escaped content", async () => {
  const item = await fixture();
  try {
    const first = pending("scoped"); first.document = { kind: "text-edit", target_path: "src/<unsafe>.js", exists: true, before_text: "old", after_text: "<script>attack()</script>" };
    item.agentHost.reviews.request(first);
    item.agentHost.reviews.request({ ...pending("other"), run: { session_id: "s-2", run_id: "run-2" } });
    item.agentHost.reviews.decide({ review_id: "scoped", decision: "approve", actor_id: "user" });
    item.agentHost.reviews.consumeApproval("scoped");
    const detach = item.agentHost.reviews.registerRefresh(async board => {
      assert.equal(board, BOARD);
      item.agentHost.reviews.settle("scoped", { ok: true });
    });
    const data = await (await fetch(`${item.base}/api/agent/reviews?run_id=run-1`)).json() as { html: string; reviews: Array<{request: {review_id:string};receipt:{effect_settled:boolean}}> };
    assert.deepEqual(data.reviews.map(row=>row.request.review_id), ["scoped"]);
    assert.equal(data.reviews[0]?.receipt.effect_settled, true);
    assert.ok(data.html.includes("&lt;script&gt;attack()&lt;/script&gt;"));
    assert.ok(!data.html.includes("<script>"));
    assert.ok(!data.html.includes('data-agent-review-approve='));
    detach();
  } finally { await new Promise<void>(resolve => item.server.close(() => resolve())); }
});
