import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createDesktopWebHost, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, resolveWebControlToken, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { ISSUES_PLUGIN_ID, type Issue, type IssueListResult } from "@molis-ai/molis-work-plugin-issues";

function reply(tool?: { name: string; input: unknown }): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: randomUUID(), type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: randomUUID(), name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text: "已按操作回执完成这一轮。" } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

/** A Home with the real Assistant, Prologue, action directory and SQLite; only the model's replies are scripted. */
async function assistantHome(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "issue-assistant-"));
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const replies: string[] = [], requests: unknown[] = [];
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(replies.shift() ?? reply());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  const modelAddress = model.address(); assert.ok(modelAddress && typeof modelAddress === "object");
  await runWithMolisWorkHome(home, () => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const base = `http://127.0.0.1:${modelAddress.port}`;
    const connection = withConnectorConnections(home, store => {
      const result = store.createToken({ serviceId: "model-api", displayName: "Issue fixture", token: "fixture-local-model-key" });
      store.assertTarget(result.connection_id, "model-api", base); return result;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "issue-fixture", display_name: "Issue 本机测试", base_url: base,
      api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
  }));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), token = resolveWebControlToken({ homeDirectory: home });
  const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: { origin, "content-type": "application/json",
      "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, 200, await response.clone().text()); return await response.json() as T;
  };
  const list = () => request<IssueListResult>(`/api/plugins/${ISSUES_PLUGIN_ID}/list`);
  const state = async (id: string, predicate: (view: AssistantWorkView) => boolean) => {
    let last: AssistantWorkView | undefined;
    for (let attempt = 0; attempt < 250; attempt++) {
      last = await request<AssistantWorkView>(`/api/assistant/works/${id}`);
      if (predicate(last)) return last;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error(`Assistant state not reached: ${JSON.stringify(last)}`);
  };
  const send = async (text: string, extra: Record<string, unknown> = {}) => request<AssistantSendResult>("/api/assistant/send", { text, request_id: randomUUID(),
    context: { source: { surface: "issues", title: "Issue 页面" }, captured_at: new Date().toISOString() }, ...extra });
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close();
    model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); await rm(home, { recursive: true, force: true });
  });
  return { replies, requests, request, list, state, send };
}

/** The model replies are scripted; HTTP, Prologue, confirmation, Action Host and SQLite are real. */
test("ISSUE-07 assistant discovers Home Issue and confirms exact writes; refusal and stale versions do not write", { timeout: 120_000 }, async t => {
  const { replies, requests, request, list, state, send } = await assistantHome(t);
  const change = (capability_id: string, input: unknown) => reply({ name: "change-capability", input: { capability_id, version: capability_id === "issues.delete" ? 1 : 2, provider_id: ISSUES_PLUGIN_ID, input } });
  const input = { title: "按确认标题记录", type: "experience", description: "  我的原话\n第二行。\n" };
  const decide = (id: string, view: AssistantWorkView, decision: "approve" | "reject") => request(`/api/assistant/works/${id}/reviews/${view.reviews[0]!.review_id}`, { decision });
  {
    replies.push(reply({ name: "find-capabilities", input: { query: "Issue" } }), change("issues.create", input), reply());
    const sent = await send("录入体验问题，标题是按确认标题记录，原文保持不变。");
    assert.equal(sent.outcome, "started"); assert.equal(sent.work.scope.kind, "personal");
    const review = await state(sent.work.work_id, view => view.reviews.length > 0);
    assert.equal((await list()).items.length, 0, "no business write before approval");
    assert.ok(JSON.stringify(review.reviews[0]).includes(input.title));
    assert.ok(JSON.stringify(requests).includes("issues.create"));
    await decide(sent.work.work_id, review, "approve");
    await state(sent.work.work_id, view => view.work.state === "completed");
    const saved = (await list()).items[0]!;
    assert.equal(saved.description, input.description); assert.equal(saved.entered_via, "assistant"); assert.equal(saved.submitter_id, "web-user");
    assert.equal(saved.context.page?.title, "Issue 页面"); assert.equal(saved.context.page?.provenance, "client_reported");

    replies.push(change("issues.create", { ...input, title: "不要保存" }), reply());
    const rejected = await send("先准备一条问题供我确认。");
    const refusal = await state(rejected.work.work_id, view => view.reviews.length > 0);
    await decide(rejected.work.work_id, refusal, "reject");
    await state(rejected.work.work_id, view => ["completed", "failed"].includes(view.work.state));
    assert.equal((await list()).items.length, 1, "refusing never creates the record");

    replies.push(reply({ name: "read-capability", input: { capability_id: "issues.read", version: 2, provider_id: ISSUES_PLUGIN_ID, input: { id: saved.id } } }),
      change("issues.update", { id: saved.id, expected_version: 1, title: "助理准备的修改" }), reply());
    const edit = await send("把刚才那条问题的标题改成助理准备的修改。");
    const stale = await state(edit.work.work_id, view => view.reviews.length > 0);
    await request<Issue>(`/api/plugins/${ISSUES_PLUGIN_ID}/update`, { id: saved.id, expected_version: 1, title: "页面已先修改" });
    await decide(edit.work.work_id, stale, "approve");
    const ended = await state(edit.work.work_id, view => ["completed", "failed"].includes(view.work.state));
    assert.ok(ended.rounds.some(round => round.activity.some(action => action.capability_id === "issues.update" && action.state === "failed")));
    const actual = (await list()).items[0]!; assert.equal(actual.title, "页面已先修改"); assert.equal(actual.version, 2);

    replies.push(reply({ name: "read-capability", input: { capability_id: "issues.read", version: 2, provider_id: ISSUES_PLUGIN_ID, input: { id: saved.id } } }),
      change("issues.update", { id: saved.id, expected_version: 2, title: "核对后确认的标题" }), reply());
    const fresh = await send("重新读取后，把标题改成核对后确认的标题。");
    const freshReview = await state(fresh.work.work_id, view => view.reviews.length > 0);
    assert.equal((await list()).items[0]!.version, 2);
    await decide(fresh.work.work_id, freshReview, "approve");
    await state(fresh.work.work_id, view => view.work.state === "completed");
    const updated = (await list()).items[0]!;
    assert.equal(updated.title, "核对后确认的标题"); assert.equal(updated.version, 3); assert.equal(updated.description, input.description);

    replies.push(reply({ name: "read-capability", input: { capability_id: "issues.list", version: 2, provider_id: ISSUES_PLUGIN_ID, input: {} } }),
      change("issues.delete", { id: saved.id, expected_version: 3 }), reply());
    const deletion = await send("查看列表，删除刚才核对过的那条问题。");
    const deleteReview = await state(deletion.work.work_id, view => view.reviews.length > 0);
    assert.equal((await list()).items.length, 1);
    await decide(deletion.work.work_id, deleteReview, "approve");
    await state(deletion.work.work_id, view => view.work.state === "completed");
    assert.equal((await list()).items.length, 0, "confirmed assistant deletion removes the persisted record");
  }
});

test("ISSUE-36 ISSUE-38 asked to record, the Assistant saves a page draft or a spoken issue directly, and its undo takes the new record back", { timeout: 120_000 }, async t => {
  const { replies, requests, request, list, state, send } = await assistantHome(t);
  const draft_id = randomUUID(), page = { url: "/projects/p-1/", title: "Goals · Molis" };
  await request(`/api/plugins/${ISSUES_PLUGIN_ID}/prepare`, { draft_id, description: "  点保存没反应\n", page });
  const direct = (capability_id: string, version: number, input: unknown) => reply({ name: "change-reversible", input: { capability_id, version, provider_id: ISSUES_PLUGIN_ID, input } });
  replies.push(direct("issues.capture", 1, { draft_id, title: "Goals 里点保存没有反应", type: "bug" }), reply());
  const sent = await send(`记录 Issue：点保存没反应\n录入草稿 ${draft_id}。请按 Issue 方法处理。`, {
    materials: [{ material_id: "issue-method", kind: "method", title: "Issue", explicit: true, method: { method_id: `${ISSUES_PLUGIN_ID}/issues-capture` } }] });
  const done = await state(sent.work.work_id, view => view.work.state === "completed");
  assert.equal(done.reviews.length, 0, "no confirmation: the save says how it is undone"); assert.equal(done.cards.length, 0);
  const saved = (await list()).items[0]!;
  assert.deepEqual([saved.id, saved.title, saved.entered_via, saved.description], [draft_id, "Goals 里点保存没有反应", "assistant", "  点保存没反应\n"]);
  assert.deepEqual(saved.context.page, { ...page, provenance: "client_reported" }, "the page the person reported, not the Assistant's");
  // The method the model reads: one direct save, no discovery round, and the title rules.
  const method = JSON.stringify(requests[0]);
  for (const rule of ["直接用 change-reversible", "不要 find-capabilities", "记录时所在页面", "依据不足"]) assert.ok(method.includes(rule), rule);
  const undoable = (done as AssistantWorkView & { undoable?: Array<{ undo_id: string; state: string; capability_id?: string }> }).undoable ?? [];
  assert.equal(undoable.length, 1); assert.equal(undoable[0]!.capability_id, "issues.discard");
  await request(`/api/assistant/works/${sent.work.work_id}/undo/${undoable[0]!.undo_id}`, {});
  assert.equal((await list()).items.length, 0, "the work's undo takes the new record back");
  // Spoken in the resident composer, an issue is recorded the same way, with the person's words kept.
  replies.push(direct("issues.create", 2, { title: "切换项目后草稿丢失", type: "bug", description: "记个 issue：切换项目后草稿丢失" }), reply());
  const spoken = await send("记个 issue：切换项目后草稿丢失");
  await state(spoken.work.work_id, view => view.work.state === "completed");
  const recorded = (await list()).items[0]!;
  assert.deepEqual([recorded.title, recorded.entered_via, recorded.context.page?.title], ["切换项目后草稿丢失", "assistant", "Issue 页面"]);
});
