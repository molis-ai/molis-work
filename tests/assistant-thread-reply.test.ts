import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { createDesktopWebHost, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { AssistantStore, MolisWorkLocalHost, resolveWebControlToken, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { openHomeSqliteDatabase, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { PagesCommentThread, PagesRecord } from "@molis-ai/molis-work-plugin-pages/contract";
import { asideReply } from "./fixtures/ending-review.js";
import { isKnowledgeOrganize, organizedCard } from "./fixtures/knowledge-organize.js";

interface Status { work_id: string; revision: number; state: string; error?: string }

for (const race of ["reply-last-wait", "stop-post-start-reader"] as const)
test((race === "reply-last-wait" ? "PAS-10 S-18-102-02" : "PAS-10 S-18-102-03") + ": real thread " + race + " refuses the late write", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "thread-final-fence-"));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let current = true, armed = race === "reply-last-wait", intercepted = false, priorRounds = 0;
  const pending: ServerResponse[] = [];
  const model = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(streamed(review)); return; }
    if (race === "stop-post-start-reader" && armed) { pending.push(res); return; }
    res.writeHead(200, { "content-type": "text/event-stream" }); res.end(streamed("回复仍只属于原评论"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const originalClient = host.actionClient.bind(host);
  const observedClients = new WeakSet<object>();
  const readOwner = () => {
    const db = openHomeSqliteDatabase(home, "assistant");
    try {
      const store = new AssistantStore(db), work = store.list("web-user", { archived: "any", limit: -1 }).find(work => work.reply_target);
      return work ? { work, rounds: store.rounds(work.work_id) } : null;
    } finally { db.close(); }
  };
  t.mock.method(host, "actionClient", project => {
    const client = originalClient(project);
    if (observedClients.has(client)) return client;
    observedClients.add(client);
    const invoke = client.invoke.bind(client);
    const wrapped = async (...args: Parameters<typeof client.invoke>) => {
      const [caller, reference, input] = args;
      if (reference.capability_id === "assistant.threads.start") {
        return invoke({ ...caller, assert_authority_current: (ref, permissions) => {
          caller.assert_authority_current?.(ref, permissions);
          if (!current) throw new ActionError("actions.revoked", "Original thread caller revoked");
        } }, reference, input);
      }
      if (armed && race === "stop-post-start-reader" && reference.capability_id === "pages.comments.context" && !intercepted) {
        const owner = readOwner();
        if (owner && owner.rounds.length > priorRounds && owner.work.thread_round?.state === "starting") {
          intercepted = true; entered.resolve(); await release.promise;
        }
      }
      if (armed && race === "reply-last-wait" && reference.capability_id === "pages.comments.reply") {
        return invoke({ ...caller, validate_permissions: async permissions => {
          await caller.validate_permissions?.(permissions);
          if (!intercepted) { intercepted = true; entered.resolve(); await release.promise; }
        } }, reference, input);
      }
      return invoke(...args);
    };
    t.mock.method(client, "invoke", wrapped as typeof client.invoke);
    return client;
  });
  const factory = createDesktopWebHost({ ptyClientFilePath: () => "" });
  let server: ReturnType<typeof factory> | undefined;
  try {
    await runWithMolisWorkHome(home, async () => {
      const project = await withCatalog({ homeDirectory: home }, async catalog => {
        const project = await catalog.createProject({ display_name: "线程最后检查", actor_id: "owner" });
        await catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "pages", actor_id: "owner" });
        const endpoint = "http://127.0.0.1:" + address.port;
        const connection = withConnectorConnections(home, store => { const saved = store.createToken({ serviceId: "model-api", displayName: "fixture", token: randomUUID() }); store.assertTarget(saved.connection_id, "model-api", endpoint); return saved; });
        catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "fixture", display_name: "Fixture", base_url: endpoint, api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
        return project;
      });
      const token = resolveWebControlToken(home); server = factory({ homeDirectory: home, localHost: host, controlToken: token });
      await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
      const bound = server.address(); assert.ok(bound && typeof bound !== "string");
      const origin = "http://127.0.0.1:" + bound.port, prefix = origin + "/projects/" + project.project_id;
      const request = async (path: string, body?: object) => {
        const response = await fetch(prefix + path, { method: body ? "POST" : "GET", signal: AbortSignal.timeout(15_000),
          headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, body: await response.json() };
      };
      const made = await request("/api/plugins/io.molis.work.pages/pages", { title: "Original", markdown: "原文档保持原样。" });
      assert.equal(made.status, 200); const page = made.body.document as PagesRecord;
      const path = "/api/plugins/io.molis.work.pages/pages/" + page.id + "/comments";
      const first = await request(path, { thread_id: "discussion", request_id: "first", body: "请在这里回复", expected_version: page.version, anchor: { kind: "document" } });
      assert.equal(first.status, 200); let thread = first.body.thread as PagesCommentThread;
      const target = { provider_id: "io.molis.work.pages", subject_kind: "pages_document", subject_id: page.id, thread_id: thread.thread_id };
      const start = (message_id: string) => request("/api/assistant/threads/start", { target, message_id });
      if (race === "stop-post-start-reader") {
        const initial = await start(thread.messages[0]!.message_id); assert.equal(initial.status, 200);
        for (let n = 0; (await request("/api/assistant/threads/status", { target })).body.status?.state !== "delivered"; n++) {
          assert.ok(n < 100, "the first real reply did not finish"); await new Promise(resolve => setTimeout(resolve, 50));
        }
        priorRounds = readOwner()!.rounds.length;
        const next = await request(path, { thread_id: thread.thread_id, request_id: "next", body: "继续原线程" });
        assert.equal(next.status, 200); thread = next.body.thread; armed = true;
      }
      const before = (await request(path)).body.threads;
      const started = start(thread.messages.at(-1)!.message_id);
      const observedStart = started.then(value => value, error => ({ status: 0, body: { error: String(error) } }));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([entered.promise,
          observedStart.then(value => { if (value.status !== 200) throw new Error("Thread start refused before the barrier: " + JSON.stringify(value)); return new Promise<never>(() => {}); }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("the real thread barrier was not reached")), 15_000); })]);
      } finally { if (timer) clearTimeout(timer); }
      const accepted = readOwner()!; assert.ok(accepted.rounds.length > priorRounds);
      if (race === "reply-last-wait") current = false;
      else assert.equal((await request("/api/assistant/threads/stop", { work_id: accepted.work.work_id })).status, 200);
      release.resolve(); await observedStart;
      for (const res of pending) if (!res.destroyed) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(streamed("LATE_REPLY_MUST_NOT_COMMIT")); }
      await new Promise(resolve => setTimeout(resolve, 700));
      assert.deepEqual((await request(path)).body.threads, before, "the real Pages reply owner commits no late message");
      if (race === "stop-post-start-reader") {
        const after = readOwner()!; assert.equal(after.work.thread_round?.state, "stopped");
        const detail = await request("/api/assistant/works/" + after.work.work_id);
        assert.ok(["stopped", "completed"].includes(detail.body.work.state), "the accepted execution is explicitly stopped or already terminal");
      }
    });
  } finally {
    release.resolve(); for (const res of pending) res.destroy();
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    await host.close(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
const streamed = (text: string): string => [
  ["message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } }],
  ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { index: 0, delta: { type: "text_delta", text } }],
  ["content_block_stop", { index: 0 }],
  ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } }],
  ["message_stop", {}],
].map(([type, value]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...value as object })}\n\n`).join("");
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 150; i++) { const value = await read();if (accept(value)) return value;await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("expected thread state was not reached");
}

test("PAS-04 PAS-05 PAS-10: real Host and Prologue keep replies in the original thread; delivery retries do not call the model twice; stop prevents late comments", { timeout: 120000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "assistant-thread-"));
  const requests: string[] = [];let hold = false;let pending: ServerResponse | null = null;
  const model = createServer(async (req, res) => {
    let text = "";for await (const chunk of req) text += String(chunk);
    if (isKnowledgeOrganize(text)) { res.writeHead(200, { "content-type": "text/event-stream" });res.end(streamed(organizedCard));return; }
    requests.push(text);
    if (hold) { pending = res;return; }
    res.writeHead(200, { "content-type": "text/event-stream" });res.end(streamed("只在原评论里的答复"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  const address = model.address();assert.ok(address && typeof address !== "string");
  const factory = createDesktopWebHost({ ptyClientFilePath: () => "" });
  let server: ReturnType<typeof factory> | undefined;
  try { await runWithMolisWorkHome(home, async () => {
    const project = await withCatalog({ homeDirectory: home }, async catalog => {
      const p = await catalog.createProject({ display_name: "评论联动", actor_id: "owner" });
      await catalog.addProjectPlugin({ project_id: p.project_id, plugin_id: "pages", actor_id: "owner" });
      return p;
    });
    const configureModel = () => withCatalog({ homeDirectory: home }, catalog => {
      const endpoint = `http://127.0.0.1:${address.port}`;
      const connection = withConnectorConnections(home, store => { const value = store.createToken({ serviceId: "model-api", displayName: "fixture", token: randomUUID() });store.assertTarget(value.connection_id, "model-api", endpoint);return value; });
      catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "fixture", display_name: "Fixture", base_url: endpoint, api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
    });
    const token = resolveWebControlToken({ homeDirectory: home });
    server = factory({ homeDirectory: home, controlToken: token });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const bound = server.address();assert.ok(bound && typeof bound !== "string");
    let origin = `http://127.0.0.1:${bound.port}`, prefix = origin + `/projects/${project.project_id}`;
    const api = async <T>(path: string, body?: unknown): Promise<T> => {
      const response = await fetch(prefix + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin,
        "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const value = await response.json();assert.equal(response.status, 200, JSON.stringify(value));return (path === "/api/assistant/threads/status" ? value.status : value) as T;
    };
    const create = async (title: string) => (await api<{ document: PagesRecord }>("/api/plugins/io.molis.work.pages/pages", { title, markdown: "# 专属上下文\n\n这篇正文必须保留。" })).document;
    const a = await create("原文档 A"), b = await create("另一个文档 B");
    const path = (id: string) => `/api/plugins/io.molis.work.pages/pages/${id}/comments`;
    const { thread } = await api<{ thread: PagesCommentThread }>(path(a.id), { thread_id: "discussion", request_id: "first", body: "请回答 A 的问题", expected_version: a.version, anchor: { kind: "document" } });
    assert.equal(requests.length, 0, "ordinary comments never start a model");
    const target = { provider_id: "io.molis.work.pages", subject_kind: "pages_document", subject_id: a.id, thread_id: thread.thread_id };
    assert.equal(await api<Status | null>("/api/assistant/threads/status", { target }), null, "a plain comment has no phantom assistant run");
    const start = { target, message_id: thread.messages[0]!.message_id, draft: { text: "只属于 A 的明确未保存草稿", revision: String(a.version) } };
    const db = openHomeSqliteDatabase(home, "pages");
    try {
      db.exec("CREATE TRIGGER refuse_reply BEFORE UPDATE ON page_comments BEGIN SELECT RAISE(ABORT, 'delivery fixture refuses'); END");
      const missing = await fetch(prefix + "/api/assistant/threads/start", { method: "POST", headers: { "content-type": "application/json", origin,
        "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(start) });
      assert.equal(missing.ok, false);await missing.json();
      assert.equal((await api<Status>("/api/assistant/threads/status", { target })).state, "failed", "a missing model leaves a retryable failure, never an ambiguous launch");
      assert.equal(requests.length, 0);await configureModel();
      const started = await api<Status>("/api/assistant/threads/start", start);
      assert.equal((await api<Status>("/api/assistant/threads/start", start)).work_id, started.work_id);
      let status = await until(() => api<Status>("/api/assistant/threads/status", { target }), value => value.state === "delivery-pending" && !!value.error);
      assert.equal(requests.length, 1);assert.match(requests[0]!, /原文档 A/);assert.match(requests[0]!, /只属于 A 的明确未保存草稿/);assert.doesNotMatch(requests[0]!, /另一个文档 B/);
      const sent = JSON.parse(requests[0]!) as { tools?: unknown[] };assert.equal(sent.tools?.length ?? 0, 0, "comment role has no editing or global assistant tools");
      assert.equal((await api<{ threads: PagesCommentThread[] }>(path(a.id))).threads[0]!.messages.length, 1);
      server!.closeAllConnections();await new Promise<void>(resolve => server!.close(() => resolve()));
      server = factory({ homeDirectory: home, controlToken: token });
      await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
      const restarted = server.address();assert.ok(restarted && typeof restarted !== "string");
      origin = `http://127.0.0.1:${restarted.port}`;prefix = origin + `/projects/${project.project_id}`;
      status = await api<Status>("/api/assistant/threads/status", { target });
      assert.equal(status.state, "delivery-pending", "Host restart keeps the completed run and fixed delivery destination");
      db.exec("DROP TRIGGER refuse_reply");
      await api<Status>("/api/assistant/threads/retry", { work_id: status.work_id, revision: status.revision });
      await until(() => api<Status>("/api/assistant/threads/status", { target }), value => value.state === "delivered");
      const delivered = (await api<{ threads: PagesCommentThread[] }>(path(a.id))).threads[0]!;
      assert.equal(delivered.messages.length, 2);assert.equal(delivered.messages[1]!.body, "只在原评论里的答复");
      assert.deepEqual((await api<{ threads: PagesCommentThread[] }>(path(b.id))).threads, []);assert.equal(requests.length, 1);
      const next = await api<{ thread: PagesCommentThread }>(path(a.id), { thread_id: thread.thread_id, request_id: "next", body: "继续解释这一点", reply_to: delivered.messages[1]!.message_id });
      hold = true;
      await api<Status>("/api/assistant/threads/start", { target, message_id: next.thread.messages.at(-1)!.message_id });
      await until(async () => pending !== null, Boolean);
      await api<Status>("/api/assistant/threads/stop", { work_id: started.work_id });
      const response = pending as ServerResponse | null;
      response?.writeHead(200, { "content-type": "text/event-stream" });response?.end(streamed("停止之后不应出现"));
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.equal((await api<Status>("/api/assistant/threads/status", { target })).state, "stopped");
      assert.equal((await api<{ threads: PagesCommentThread[] }>(path(a.id))).threads[0]!.messages.length, 3);
      assert.equal((await api<{ document: PagesRecord }>(`/api/plugins/io.molis.work.pages/pages/${a.id}`)).document.version, a.version);
    } finally { db.close(); }
  }); } finally {
    if (server) { server.closeAllConnections();await new Promise<void>(resolve => server!.close(() => resolve())); }
    model.closeAllConnections();await new Promise<void>(resolve => model.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
