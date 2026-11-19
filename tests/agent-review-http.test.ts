import { reviewDecisionStorage } from "./fixtures/review-decision-storage.js";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { assistantServiceFor, ComputerDesk, ensureSystemAgentService, MolisWorkLocalHost, handleAgentReviewHttp, installHostUiText, resolveWebLocale, runWithLocale, WebSessions, webPageToken, withWebSessionRequest } from "@molis-ai/molis-work-app-local-host";
import type { AgentReviewRequest, AgentReviewDecisions } from "@molis-ai/molis-work-contracts/services/agent-host";

import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

/** 宿主的审查队列走 HTTP：只有宿主能决定，而且批准不等于已发生。 */

const BOARD = "board-a";
installHostUiText();

/** The Host whose action service carries the person's decisions (B9): one for this file, in a temporary Home. */
let reviewHost: Promise<MolisWorkLocalHost> | undefined;
const reviewHome = mkdtempSync(path.join(tmpdir(), "molis-review-host-"));
const hostForReviews = () => reviewHost ??= Promise.resolve(new MolisWorkLocalHost({ homeDirectory: reviewHome, completeText: null }));
after(async () => { await (await reviewHost)?.close(); rmSync(reviewHome, { recursive: true, force: true }); });

function pending(reviewId: string, projectId = BOARD): AgentReviewRequest {
  return {
    reference: { owner: { kind: "agent-review" as const, project_id: projectId, plugin_id: "io.molis.work.coding", install_id: "install" }, id: reviewId, version: "proposal-1" }, review_id: reviewId,
    run: { run_id: "run-1", session_id: "s-1" },
    project_id: projectId,
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

async function fixture(observeGitIndex?: import("@molis-ai/molis-work-app-local-host").AgentReviewHttpPorts["observeGitIndex"], entry: Pick<import("@molis-ai/molis-work-app-local-host").AgentReviewHttpPorts, "computerHolder" | "now" | "assertAccountCurrent"> = {}, sessions?: WebSessions) {
  const { AgentHost: Host } = await import("@molis-ai/molis-work-service-agent-host");
  const agentHost = new Host({ reviews: new AgentReviewQueue({ decisions: reviewDecisionStorage().store }) }), host = await hostForReviews();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    sessions?.bind(request, "review-fixture-control", response);
    if (sessions && url.pathname === "/") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ token: webPageToken(request) })); return; }
    void withWebSessionRequest(request, () => runWithLocale(resolveWebLocale(request.headers.cookie, request.headers["accept-language"]), () => handleAgentReviewHttp(request, response, url, {
      host, projectId: BOARD, agentHost, actorId: "user", observeGitIndex, ...entry,
    }))).then((handled) => {
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
    item.agentHost.reviews.registerDecisionHandler("r1", async (input, commit) => await commit());

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
      body: JSON.stringify({ review_id: "r1", version: "proposal-1", decision: "approve" }),
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
    item.agentHost.reviews.registerDecisionHandler("r1", async (input, commit) => await commit());
    const body = JSON.stringify({ review_id: "r1", version: "proposal-1", decision: "reject" });
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

test("review feedback is bounded, scoped to the actual decision and cannot replace the Host actor", async () => {
  const item = await fixture();
  try {
    item.agentHost.reviews.request(pending("feedback"));
    item.agentHost.reviews.registerDecisionHandler("feedback", async (input, commit) => await commit());
    const decide = (note: unknown) => fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ review_id: "feedback", version: "proposal-1", decision: "reject", note, actor_id: "forged" }) });
    for (const note of [42, "x".repeat(2001)]) assert.equal((await decide(note)).status, 400);
    assert.equal(item.agentHost.reviews.receipt("feedback")?.status, "pending");
    const result = await decide("第 2 行请保留原校验，不要删除。\n<script>原样反馈</script>");
    assert.equal(result.status, 200);
    const data = await result.json() as any;
    assert.equal(data.receipt.note, "第 2 行请保留原校验，不要删除。\n<script>原样反馈</script>");
    assert.equal(data.receipt.decided_by, "user");
    const view = await (await fetch(`${item.base}/api/agent/reviews?run_id=run-1`)).json() as any;
    assert.ok(view.html.includes("&lt;script&gt;")); assert.ok(!view.html.includes("<script>"));
  } finally { item.server.close(); }
});

test("不存在的待审返回 404，而不是假装决定成功", async () => {
  const item = await fixture();
  try {
    const response = await fetch(`${item.base}/api/agent/reviews/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ review_id: "nope", version: "proposal-1", decision: "approve" }),
    });
    assert.equal(response.status, 404);
  } finally {
    item.server.close();
  }
});

test("缺字段的请求被挡下", async () => {
  const item = await fixture();
  try {
    for (const body of [{}, { review_id: "r1" }, { review_id: "r1", decision: "approve" }, { review_id: "r1", version: "proposal-1", decision: "maybe" }]) {
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
    item.agentHost.reviews.request({ ...pending("foreign"), project_id: "board-b", reference: { ...pending("foreign").reference, owner: { ...pending("foreign").reference.owner, project_id: "board-b" } } });
    let calls = 0;
    item.agentHost.reviews.registerDecisionHandler("foreign", async (input, commit) => { calls++; return await commit(); });
    const response = await fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ review_id: "foreign", version: "proposal-1", decision: "approve" }) });
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
    assert.equal(item.agentHost.reviews.receipt("foreign")?.status, "pending");
  } finally { item.server.close(); }
});

test("an unconnected review owner cannot turn an HTTP approval into a false success", async () => {
  const item = await fixture();
  try {
    item.agentHost.reviews.request(pending("orphan"));
    const response = await fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ review_id: "orphan", version: "proposal-1", decision: "approve" }) });
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
    item.agentHost.reviews.registerDecisionHandler("scoped", async (_input, commit) => commit());
    await item.agentHost.reviews.respond({ review_id: "scoped", version: "proposal-1", decision: "approve", actor_id: "user" });
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

test("manual rewind reviews are scoped to the selected runtime session and current project", async () => {
  const item=await fixture();try {
    for(const [id,session,board] of [['mine','sdk-a',BOARD],['other-session','sdk-b',BOARD],['other-board','sdk-a','foreign']]) {
      item.agentHost.reviews.request({...pending(id, board),run:null,operation:{operation_id:id,session_id:session,kind:'checkpoint-rewind'},kind:'rewind',document:{kind:'rewind',checkpoint_id:'cp',files:[{path:'a',change:'restore',before_text:'now',after_text:'old'}]}});
    }
    item.agentHost.reviews.request(pending('run-review'));
    const manual=await (await fetch(`${item.base}/api/agent/reviews?session_id=sdk-a`)).json();assert.deepEqual(manual.reviews.map((row:any)=>row.request.review_id),['mine']);
    const combined=await (await fetch(`${item.base}/api/agent/reviews?session_id=sdk-a&run_id=run-1`)).json();assert.deepEqual(combined.reviews.map((row:any)=>row.request.review_id).sort(),['mine','run-review']);
    const runs=await (await fetch(`${item.base}/api/agent/reviews?run_id=run-1`)).json();assert.deepEqual(runs.reviews.map((row:any)=>row.request.review_id),['run-review']);
  } finally {item.server.close();}
});

test('Git recovery enforces project ownership, explicit confirmation and Host-owned evidence and identity', async () => {
  let reads = 0, resolves = 0, revokeWhileReading = false, accountCurrent = true;
  const original = "<script>unsafe</script>\"\n" + " 原始 Git 错误 ".repeat(300) + "Complete tail";
  const item = await fixture(async request => {
    reads++; assert.equal(request.review_id, 'mine');
    assert.equal(request.document.kind, 'text-edit', 'browser cannot replace the stored review');
    if (revokeWhileReading) accountCurrent = false;
    return { revision: 'host-version', observed_at: 'now', files: [], matches_before: true, matches_after: false };
  }, { assertAccountCurrent() { if (!accountCurrent) throw new ActionError("actions.forbidden", "original account revoked"); } });
  try {
    const queue = item.agentHost.reviews;
    queue.request(pending('mine')); queue.request(pending('foreign', 'other-project'));
    queue.registerRecoveryHandler('mine', {
      inspect: async observe => ({ review_id: 'mine', receipt: queue.receipt('mine')!, observation: await observe(), can_confirm_not_happened: false, message: original }),
      resolve: async (input, observe, control) => {
        assert.equal(input.actor_id, 'user'); assert.equal(input.reason, 'actual evidence');
        const observation = await observe(); assert.equal(observation.revision, 'host-version');
        await control.beforeEffect(); control.assertCurrent(); resolves++;
        return { review_id: 'mine', receipt: queue.receipt('mine')!, observation, can_confirm_not_happened: false, message: { owner: 'workbench', key: 'workbench.agent-review.recovery-settled' } };
      },
    });
    const post = (body: unknown) => fetch(`${item.base}/api/agent/reviews/recovery`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await fetch(`${item.base}/api/agent/reviews/recovery?review_id=foreign`)).status, 404);
    assert.equal((await post({ review_id: 'foreign', action: 'refresh' })).status, 404);
    for (const body of [{ action: 'success', confirmed: true }, { action: 'not-happened' }, { action: 'not-happened', confirmed: 'true' }]) {
      assert.equal((await post({ review_id: 'mine', ...body })).status, 409);
    }
    assert.equal(reads, 0); assert.equal(resolves, 0);
    const inspected = await (await fetch(`${item.base}/api/agent/reviews/recovery?review_id=mine`)).json();
    assert.equal(inspected.view.message, original);
    assert.match(inspected.html, /translate="no">&lt;script&gt;/); assert.doesNotMatch(inspected.html, /<script>/);
    assert.match(inspected.html, /Complete tail<\/p>/u);
    const english = await (await fetch(`${item.base}/api/agent/reviews/recovery?review_id=mine`, { headers: { "accept-language": "en" } })).json();
    assert.equal(english.view.message, original);
    assert.match(english.html, /Verify the original operation/);
    assert.match(english.html, /Complete tail<\/p>/u);
    const result = await post({ review_id: 'mine', action: 'not-happened', confirmed: true, actor_id: 'forged', reason: 'actual evidence', revision: 'host-version', observation: { matches_before: true }, document: { kind: 'git-index' } });
    assert.equal(result.status, 200); assert.equal(resolves, 1); assert.equal(reads, 3);
    revokeWhileReading = true;
    const refused = await post({ review_id: 'mine', action: 'not-happened', confirmed: true, reason: 'actual evidence', revision: 'host-version' });
    assert.equal(refused.status, 403); assert.match(await refused.text(), /original account revoked/u);
    assert.equal(reads, 4); assert.equal(resolves, 1);
  } finally { item.server.close(); }
});

test("BL-360: GET carries current decisions and POST rechecks an owner lost after display", async () => {
  const item = await fixture(); let live = true, calls = 0;
  try {
    const queue = item.agentHost.reviews;
    queue.request(pending("availability"));
    queue.registerDecisionHandler("availability", async (input, commit) => { calls++; return await commit(); }, async () => () => live);
    const before = await (await fetch(`${item.base}/api/agent/reviews`)).json() as { reviews: Array<{ decisions: { approve: { available: boolean } } }>; html: string };
    assert.equal(before.reviews[0]?.decisions.approve.available, true);
    assert.match(before.html, /data-agent-review-approve/);
    live = false;
    const response = await fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json", "accept-language": "en" },
      body: JSON.stringify({ review_id: "availability", version: "proposal-1", decision: "approve" }) });
    assert.equal(response.status, 409);
    assert.match(await response.text(), /original wait has ended/);
    const after = await (await fetch(`${item.base}/api/agent/reviews`)).json() as { html: string };
    assert.doesNotMatch(after.html, /data-agent-review-approve|data-agent-review-reject/);
    assert.equal(calls, 0); assert.equal(queue.receipt("availability")?.status, "pending");
  } finally { item.agentHost.reviews.close(); item.server.close(); }
});

test("BL-360: GET rereads receipts and reapplies the pending filter after all owner reads", async () => {
  const item = await fixture(), queue = item.agentHost.reviews;
  let entered!: () => void, release!: () => void;
  const read = new Promise<void>(resolve => { entered = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    queue.request(pending("raced"));
    queue.registerDecisionHandler("raced", async (_input, commit) => commit(), async () => { entered(); await waiting; return () => true; });
    const response = fetch(`${item.base}/api/agent/reviews?status=pending`);
    await read; queue.cancel("raced", "stopped"); release();
    const listed = await (await response).json() as { reviews: unknown[]; total: number; html: string };
    assert.deepEqual(listed.reviews, []); assert.equal(listed.total, 0);
    assert.doesNotMatch(listed.html, /data-agent-review-approve|data-agent-review-reject/);
    const all = await (await fetch(`${item.base}/api/agent/reviews`)).json() as { reviews: Array<{ receipt: { status: string }; decisions: { approve: { available: boolean }; reject: { available: boolean } } }> };
    assert.equal(all.reviews[0]!.receipt.status, "cancelled");
    assert.equal(all.reviews[0]!.decisions.approve.available, false); assert.equal(all.reviews[0]!.decisions.reject.available, false);
  } finally { release(); queue.close(); item.server.close(); }
});

test("BL-360: a computer injection during owner waiting cannot commit its own approval", async () => {
  const holder = { sessionId: "s-1", projectId: BOARD, lastInjectAt: null as number | null };
  const item = await fixture(undefined, { computerHolder: () => holder, now: () => 5_000 }), queue = item.agentHost.reviews;
  let entered!: () => void, release!: () => void, effects = 0;
  const read = new Promise<void>(resolve => { entered = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    queue.request(pending("injected"));
    queue.registerDecisionHandler("injected", async (_input, commit) => { entered(); await waiting; const receipt = await commit(); effects++; return receipt; });
    const response = fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ review_id: "injected", version: "proposal-1", decision: "approve" }) });
    await read; holder.lastInjectAt = 5_000; release();
    const refused = await response;
    assert.equal(refused.status, 409); assert.match(await refused.text(), /computer.self_approval/);
    assert.equal(effects, 0); assert.equal(queue.receipt("injected")?.status, "pending");
  } finally { release(); queue.close(); item.server.close(); }
});

for (const mode of ["expired", "closed"] as const) test(`BL-360: a Web session ${mode} during owner waiting cannot commit`, async () => {
  let now = 0;
  const sessions = new WebSessions("review-test-home", () => now, 60_000), item = await fixture(undefined, {}, sessions), queue = item.agentHost.reviews;
  let enter!: () => void, release!: () => void, finish!: () => void, effects = 0, refusal: unknown;
  const entered = new Promise<void>(resolve => { enter = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  try {
    const page = await fetch(item.base, { headers: { connection: "close" } }), cookie = page.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const { token } = await page.json() as { token: string };
    queue.request(pending("session-closed"));
    queue.registerDecisionHandler("session-closed", async (_input, commit) => {
      enter(); await waiting;
      try { const receipt = await commit(); effects++; return receipt; } catch (error) { refusal = error; throw error; } finally { finish(); }
    });
    const response = fetch(`${item.base}/api/agent/reviews/decide`, { method: "POST", headers: { "content-type": "application/json", connection: "close", cookie, "x-molis-work-page-session": token },
      body: JSON.stringify({ review_id: "session-closed", version: "proposal-1", decision: "approve" }) })
      .then(async value => ({ status: value.status, body: await value.text() }), error => ({ failure: error }));
    await Promise.race([entered, response.then(value => { throw new Error(`request ended before owner waiting: ${JSON.stringify(value)}`); })]);
    if (mode === "closed") sessions.close(); else now = 60_001;
    release(); await finished;
    const denied = await response;
    if (mode === "closed") assert.ok("failure" in denied, "closing the session also closes its HTTP response");
    else { assert.ok("status" in denied); assert.equal(denied.status, 403); assert.match(denied.body, /actions.forbidden/); }
    assert.equal((refusal as { code?: string })?.code, "actions.forbidden");
    assert.equal(effects, 0); assert.equal(queue.receipt("session-closed")?.status, "pending");
  } finally { release(); sessions.close(); queue.close(); item.server.close(); }
});

test("BL-360: a changed computer holder cannot return the previous project's pending rows", async () => {
  const holder = { sessionId: "s-1", projectId: "other-project", lastInjectAt: null };
  const item = await fixture(undefined, { computerHolder: () => holder }), queue = item.agentHost.reviews;
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    queue.request(pending("other", "other-project"));
    queue.registerDecisionHandler("other", async (_input, commit) => commit(), async () => { enter(); await waiting; return () => true; });
    const response = fetch(`${item.base}/api/agent/reviews?run_session_id=s-1&status=pending`);
    await entered; holder.sessionId = "replacement"; release();
    const read = await (await response).json() as { reviews: unknown[]; total: number; html: string };
    assert.deepEqual(read.reviews, []); assert.equal(read.total, 0); assert.doesNotMatch(read.html, /data-agent-review-approve/);
  } finally { release(); queue.close(); item.server.close(); }
});

// BL-360 / S-25 / S-page-entry-actions: real HTTP, Web session, Assistant work ownership and queue commit;
// only the execution owner's last read and the desktop input fact are controlled. No native desktop is operated.
for (const withdrawn of ["session", "computer", "work"] as const) test(`BL-360: Assistant approval refuses a changed ${withdrawn} after its execution owner waits`, { timeout: 30_000 }, async t => {
  let now = 0;
  const sessions = new WebSessions("assistant-review-entry", () => now, 60_000);
  const f = await serveHomeRuntime(t, {}, { webSessions: sessions });
  const agents = ensureSystemAgentService(f.host, f.home);
  // This held execution is a queue owner fixture, so the SDK is never started to invent a replacement waiter.
  t.mock.getter(agents, "ready", () => Promise.resolve());
  const { store } = assistantServiceFor({ localHost: f.host, homeDirectory: f.home, agentHost: agents.agentHost,
    agentReady: () => agents.ready, projectTitle: async () => null, pages: async () => [] });
  const work = store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: "原工作的待审操作", scope: { kind: "personal" }, origin: null });
  const sessionId = "original-session";
  store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { session_id: sessionId });
  const queue = agents.agentHost.reviews, entered = deferred(), release = deferred();
  const decisions = reviewDecisionStorage();
  queue.bindDecisionStore(decisions.store);
  t.after(() => { release.resolve(); sessions.close(); });
  let lastInjectAt: number | null = null, effects = 0;
  t.mock.method(ComputerDesk.prototype, "holding", () => ({ sessionId, projectId: null, lastInjectAt }));
  queue.request({ reference: { owner: { kind: "agent-review" as const, project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: "install" }, id: "original-review", version: "proposal-1" }, review_id: "original-review", project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID,
    run: { session_id: sessionId, run_id: "original-run" }, kind: "text-edit",
    document: { kind: "text-edit", target_path: "note.md", exists: true, before_text: "before", after_text: "after" },
    requested_at: new Date().toISOString(), expires_at: null });
  queue.registerDecisionHandler("original-review", async (_input, commit) => {
    entered.resolve(); await release.promise;
    const receipt = await commit(); effects++; return receipt;
  });
  const page = await fetch(f.origin), html = await page.text();
  assert.equal(page.status, 200);
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(proof);
  const cookie = page.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const response = f.request(`/api/assistant/works/${work.work_id}/reviews/original-review`, { method: "POST", authorized: false,
    headers: { cookie, "x-molis-work-page-session": proof }, body: { decision: "approve", version: "proposal-1" } });
  await Promise.race([entered.promise, response.then(async value => { throw new Error(`request ended before owner waiting: ${value.status} ${await value.clone().text()}`); })]);
  if (withdrawn === "session") now = 60_001;
  else if (withdrawn === "computer") lastInjectAt = Date.now();
  else store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { archived: true });
  release.resolve();
  const refused = await response, body = await refused.json() as { code: string };
  assert.equal(refused.status, withdrawn === "session" ? 403 : withdrawn === "computer" ? 409 : 403);
  assert.equal(body.code, withdrawn === "session" ? "actions.forbidden" : withdrawn === "computer" ? "computer.self_approval" : "assistant.scope");
  assert.equal(effects, 0, "the original owner gets no authorization and performs no effect");
  const receipt = queue.receipt("original-review");
  assert.equal(receipt?.status, "pending"); assert.equal(receipt?.decided_by, null); assert.equal(receipt?.effect_settled, false);
  assert.equal(await decisions.store.read(queue.get("original-review")!.reference), undefined);
});

// QEA-21: the queue owns actionable decisions; neither the HTTP projection nor a page guesses from pending alone.
test("QEA-21 a revoked live review only offers rejection, while a disconnected pending offers no decision", async () => {
  const item = await fixture();
  try {
    let held = true, effects = 0;
    const request: AgentReviewRequest = { ...pending("held-operation"), reference: { ...pending("held-operation").reference, owner: { ...pending("held-operation").reference.owner, install_id: "original" } }, run: null, kind: "tool-operation",
      operation: { kind: "git-operation", operation_id: "operation-held-123", workspace_id: "main" },
      document: { kind: "tool-operation", tool: "git-commit", summary: "Commit reviewed files", fields: [] } };
    item.agentHost.reviews.request(request, { plugin_id: request.plugin_id, install_id: "original", holds: () => held });
    item.agentHost.reviews.registerDecisionHandler(request.review_id, async (input, commit) => {
      const receipt = await commit();
      if (input.decision === "approve") { item.agentHost.reviews.consumeApproval(input.review_id); effects++; }
      return receipt;
    });
    type Listed = { html: string; reviews: Array<{ decisions: AgentReviewDecisions }> };
    const read = async (): Promise<Listed> => (await fetch(`${item.base}/api/agent/reviews?workspace_id=main`)).json() as Promise<Listed>;
    const decide = (decision: "approve" | "reject") => fetch(`${item.base}/api/agent/reviews/decide`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ review_id: request.review_id, version: request.reference.version, decision }),
    });
    assert.match((await read()).html, /data-agent-review-approve/);
    held = false;
    const revoked = await read();
    assert.doesNotMatch(revoked.html, /data-agent-review-approve/, "do not offer an approval that the owner refuses");
    assert.match(revoked.html, /data-agent-review-reject/);
    assert.equal(revoked.reviews[0]?.decisions.approve.code, "agent.review_not_permitted");
    assert.equal(revoked.reviews[0]?.decisions.reject.available, true);
    assert.equal(item.agentHost.reviews.receipt(request.review_id)?.status, "pending", "reading records no decision");
    const denied = await decide("approve");
    assert.equal(denied.status, 403, "the current HTTP boundary preserves the owner authority refusal");
    assert.equal((await denied.json() as { code: string }).code, "agent.review_not_permitted", "the owner rejects forged or stale approval");
    assert.equal(item.agentHost.reviews.receipt(request.review_id)?.status, "pending");
    assert.equal((await decide("reject")).status, 200);
    assert.equal(item.agentHost.reviews.receipt(request.review_id)?.status, "rejected");
    assert.equal((await read()).reviews[0]?.decisions.approve.available, false);
    assert.equal((await read()).reviews[0]?.decisions.reject.available, false);
    assert.equal(effects, 0);

    item.agentHost.reviews.restoreDecision({ ...request, reference: { ...request.reference, id: "no-execution" }, review_id: "no-execution", operation: { ...request.operation!, operation_id: "no-execution-123" } }, null);
    const disconnected = await read();
    assert.doesNotMatch(disconnected.html, /data-agent-review-(approve|reject)=/);
    assert.equal(disconnected.reviews[1]?.decisions.approve.available, false);
    assert.equal(disconnected.reviews[1]?.decisions.reject.code, "agent.capability_unavailable");
    await assert.rejects(item.agentHost.reviews.respond({ version: "proposal-1", review_id: "no-execution", decision: "reject", actor_id: "user" }), { code: "agent.capability_unavailable" });
    assert.equal(item.agentHost.reviews.receipt("no-execution")?.status, "pending");
    assert.equal(effects, 0);
  } finally { item.server.close(); }
});
