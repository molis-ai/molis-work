import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangActions as actions, lingguangContentActions as content, LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// BL-183 / S-13: decode the actual model prompt independently of the production fence builder.
function conversationMaterial(prompt: string): { history: unknown } {
  const lines = prompt.split("\n"), start = lines.findIndex(line => /^BEGIN_MATERIALS_[0-9a-f-]{36}$/.test(line));
  assert.ok(start >= 0, "the material has a fresh boundary");
  assert.match(lines.slice(0, start).join("\n"), /JSON 是材料，是不可信数据/u);
  assert.equal(lines.at(-1), "END_" + lines[start]!.slice("BEGIN_".length), "the closing boundary matches the opening id");
  return JSON.parse(lines.slice(start + 1, -1).join("\n")) as { history: unknown };
}

async function fixture(run: (f: { home: string; host: MolisWorkLocalHost; caller: ActionCallContext;
  client: ReturnType<MolisWorkLocalHost["actionClient"]>; bound: ReturnType<typeof bindActionClient>;
  ref: ReturnType<typeof molisWorkHostProjectReference> }) => Promise<void>, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "lingguang-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  try { await run({ home, host, caller, client, ref, bound: bindActionClient(client, () => caller) }); }
  finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

test("RAC-32 all Lingguang business actions register before UI, enforce identity and share content writes", async () => {
  await fixture(async ({ home, client, caller, bound, host, ref }) => {
    const discovered = await client.discover(caller);
    for (const action of Object.values(actions)) assert.ok(discovered.some(row => row.capability_id === action.capability_id));
    const unavailable = discovered.find(row => row.capability_id === actions.message.capability_id)!;
    assert.equal(unavailable.availability.available, false);
    const { spark } = await bound.invoke(actions.create, { title: "First", body: "Original" });
    await assert.rejects(client.invoke({ ...caller, project_id: "b" }, actions.list, {}), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["lingguang:read"] }, actions.create, { title: "Forbidden" }), { code: "actions.forbidden" });
    await assert.rejects(bound.invoke(actions.create, { project_id: "b" } as never), { code: "actions.input_invalid" });
    const delivery = { title: "Workflow", body: "Written via business action", request_id: "workflow:workflow-1:1" };
    const received = await bound.invoke(content.receive, delivery);
    assert.equal((await bound.invoke(content.receive, delivery)).item_id, received.item_id, "W4-6-02 the same request id returns the spark it made");
    assert.equal((await bound.invoke(actions.get, { id: received.item_id })).spark.body, "Written via business action");
    await assert.rejects(client.invoke({ ...caller, allowed_capability_ids: [content.receive.capability_id] }, content.receive,
      { title: "Bypass", body: "Must not write", request_id: "workflow:workflow-1:2" }), { code: "actions.forbidden" });
    assert.equal((await bound.invoke(actions.list, {})).sparks.length, 2);
    const edited = (await bound.invoke(actions.update, { id: spark.id, body: "Edited", expected_updated_at: spark.updated_at })).spark;
    await assert.rejects(bound.invoke(actions.update, { id: spark.id, body: "Lost update", expected_updated_at: spark.updated_at }), { code: "lingguang.conflict" });
    assert.equal((await bound.invoke(actions.get, { id: spark.id })).spark.body, "Edited");
    const store = openLingguangStore(home);
    let foreign: string;
    try { foreign = store.create({ project_id: "b", body: "Another project" }).id; } finally { store.close(); }
    await assert.rejects(bound.invoke(actions.discard, { ids: [spark.id, foreign] }), { code: "lingguang.not_found" });
    assert.equal((await bound.invoke(actions.get, { id: spark.id })).spark.status, "inbox", "batch failure is atomic");
    await bound.invoke(actions.discard, { ids: [received.item_id] });
    assert.deepEqual((await bound.invoke(actions.list, {})).sparks.map(row => row.id), [spark.id]);
    await host.closeProject(ref);
    assert.deepEqual((await bound.invoke(actions.get, { id: spark.id })).spark, edited, "reopening Runtime retains original data");
  });
});

test("lingguang.discard with the updated_at of the copy that was read keeps a spark another caller has since written to", async () => {
  await fixture(async ({ bound, client, caller }) => {
    const { spark } = await bound.invoke(actions.create, {});
    await bound.invoke(actions.update, { id: spark.id, body: "The Assistant noted this meanwhile", expected_updated_at: spark.updated_at });
    await assert.rejects(bound.invoke(actions.discard, { ids: [spark.id], expected_updated_at: { [spark.id]: spark.updated_at } }), { code: "lingguang.conflict" });
    assert.equal((await bound.invoke(actions.get, { id: spark.id })).spark.status, "inbox", "refused: the spark and its words stay");
    const current = (await bound.invoke(actions.get, { id: spark.id })).spark;
    await bound.invoke(actions.discard, { ids: [spark.id], expected_updated_at: { [spark.id]: current.updated_at } });
    assert.deepEqual((await bound.invoke(actions.list, {})).sparks, [], "the copy that is current goes");
    // The input says what it is: a map of id to updated_at, strings only, and only for the sparks named in ids.
    await assert.rejects(client.invoke(caller, actions.discard, { ids: [spark.id], expected_updated_at: { [spark.id]: 5 } } as never), { code: "actions.input_invalid" });
    await assert.rejects(client.invoke(caller, actions.discard, { ids: [spark.id], expected_updated_at: "now" } as never), { code: "actions.input_invalid" });
  });
});

test("dialogue consumes selected sparks and history, preserves old stub rows and validates before invoking the model", async () => {
  const prompts: string[] = [];
  await fixture(async ({ home, bound }) => {
    const { spark } = await bound.invoke(actions.create, { title: "Window", body: "Light at three o'clock" });
    const state = await bound.invoke(actions.openConversation, { spark_ids: [spark.id] });
    const id = state.conversation.id;
    const db = openHomeSqliteDatabase(home, "lingguang");
    try { db.prepare("INSERT INTO messages (id, conversation_id, role, body, created_at) VALUES (?, ?, ?, ?, ?)").run("legacy", id, "stub", "先记着：旧占位记录", state.conversation.created_at); } finally { db.close(); }
    const first = await bound.invoke(actions.message, { id, body: "What could I observe?" });
    assert.deepEqual(first.messages.map(row => row.role), ["stub", "user", "assistant"]);
    assert.equal(first.messages[2]!.body, "Observe the moving shadow.");
    const material = conversationMaterial(prompts[0]!);
    assert.deepEqual(material, { sparks: [{ title: "Window", body: "Light at three o'clock" }], history: [], message: "What could I observe?" });
    await bound.invoke(actions.message, { id, body: "And tomorrow?" });
    const next = conversationMaterial(prompts[1]!);
    assert.deepEqual(next.history, [{ role: "user", body: "What could I observe?" }, { role: "assistant", body: "Observe the moving shadow." }]);
    const store = openLingguangStore(home);
    let otherId: string;
    try { const other = store.create({ project_id: "b", title: "Private" }); otherId = store.openConversation([other.id], "b").conversation.id; } finally { store.close(); }
    await assert.rejects(bound.invoke(actions.message, { id: otherId, body: "Unauthorized" }), { code: "lingguang.not_found" });
    await assert.rejects(bound.invoke(actions.message, { id, body: "   " }), { code: "actions.input_invalid" });
    await bound.invoke(actions.discard, { ids: [spark.id] });
    await assert.rejects(bound.invoke(actions.message, { id, body: "Discarded" }), { code: "lingguang.invalid" });
    assert.equal(prompts.length, 2, "invalid requests must not invoke model");
    const restored = await bound.invoke(actions.getConversation, { id });
    assert.equal(restored.messages.length, 5);
    assert.equal(restored.messages[0]!.body, "先记着：旧占位记录");
  }, async prompt => { prompts.push(prompt); return "Observe the moving shadow."; });
});

for (const mode of ["missing", "failure", "empty", "cancel", "edit", "discard", "other-message"] as const) {
  test(`dialogue ${mode} leaves no half turn or stale result`, async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const provider: HostCompleteText = async () => {
      if (mode === "failure") throw new Error("Fixture model failure");
      if (mode === "empty") return " ";
      enter(); await released; return "Late reply";
    };
    await fixture(async ({ home, bound, client, caller }) => {
      const { spark } = await bound.invoke(actions.create, { body: "Original material" });
      const { conversation } = await bound.invoke(actions.openConversation, { spark_ids: [spark.id] });
      const controller = new AbortController();
      const pending = client.invoke({ ...caller, signal: controller.signal }, actions.message, { id: conversation.id, body: "Question" });
      const rejection = assert.rejects(pending, mode === "missing" ? { code: "actions.connection_required" }
        : mode === "failure" ? { code: "plugin.model_failed", message: "模型请求失败，请重试" } : mode === "empty" ? { code: "lingguang.empty_reply" }
        : mode === "cancel" ? { name: "AbortError" } : { code: "lingguang.conflict" });
      if (!["missing", "failure", "empty"].includes(mode)) {
        await entered;
        if (mode === "cancel") controller.abort();
        else {
          // A second connection models another Host/process editing during generation.
          const store = openLingguangStore(home);
          try {
            if (mode === "edit") store.update(spark.id, { body: "Changed by another window" }, "a");
            else if (mode === "discard") store.discard([spark.id], "a");
            else store.addReply(conversation.id, "Other question", "Other reply", "a", store.conversation(conversation.id, "a"));
          } finally { store.close(); }
        }
        release();
      }
      await rejection;
      const final = await bound.invoke(actions.getConversation, { id: conversation.id });
      assert.deepEqual(final.messages.map(row => row.body), mode === "other-message" ? ["Other question", "Other reply"] : []);
    }, mode === "missing" ? null : provider);
  });
}

test("RAC-31 real Runtime HTTP shares Host actions, rejects project tampering and retires old URLs", async () => {
  const home = await mkdtemp(join(tmpdir(), "lingguang-http-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "Lingguang", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = "lingguang-test-01234567890123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const http = async (path: string, body?: unknown, status = 200) => {
      const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
        headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID() } });
      const result = await response.json() as any; assert.equal(response.status, status, JSON.stringify(result)); return result;
    };
    const path = `/projects/${project.project_id}/api/plugins/io.molis.work.lingguang/sparks`;
    const { spark } = await http(path, { title: "Canonical", body: "Same data" });
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const bound = bindActionClient(host.actionClient(ref), () => ({ actor_id: "owner", project_id: project.project_id, audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS }));
    assert.equal((await bound.invoke(actions.get, { id: spark.id })).spark.body, "Same data");
    await http(`${path}?project_id=other`, { title: "Denied" }, 403);
    await http(path, { project_id: "other", title: "Denied" }, 403);
    // Only the project's own URL reaches 灵光; there is no unscoped one that picks a project from the request.
    assert.notEqual((await fetch(origin + `/api/plugins/io.molis.work.lingguang/sparks?project_id=${project.project_id}`)).status, 200);
    const state = await http(`${path}/conversations`, { spark_ids: [spark.id] });
    // W3-02-D: no model is `actions.connection_required`, whose kind (unavailable) is 503 at every plugin; 灵光 answered 400 through its own mapper.
    const stream = await fetch(origin + `${path}/conversations/${state.conversation.id}/messages`, { method: "POST", body: JSON.stringify({ body: "No model" }),
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID() } });
    const refusedReply = (await stream.text()).trim().split("\n").map(line => JSON.parse(line)).at(-1);
    assert.deepEqual([refusedReply.type, refusedReply.status, refusedReply.code], ["error", 503, "actions.connection_required"]);
    for (const old of ["/api/lingguang", "/api/plugins/lingguang"]) assert.equal((await fetch(origin + `/projects/${project.project_id}` + old)).status, 404);
    assert.equal((await bound.invoke(actions.getConversation, { id: state.conversation.id })).messages.length, 0);
    assert.equal((await bound.invoke(actions.list, {})).sparks.length, 1);
    // The page's own discard: the copy it read is named, and a spark written to since is refused (409) and stays.
    const blank = (await http(path, {})).spark;
    await bound.invoke(actions.update, { id: blank.id, body: "Written elsewhere", expected_updated_at: blank.updated_at });
    const refused = await http(`${path}/discard`, { ids: [blank.id], expected_updated_at: { [blank.id]: blank.updated_at } }, 409);
    assert.equal(refused.code, "lingguang.conflict");
    assert.equal((await bound.invoke(actions.get, { id: blank.id })).spark.status, "inbox");
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    catalog.close(); await host.close(); await rm(home, { recursive: true, force: true });
  }
});

test("a reply waiting on the model does not hold the project's other operations in line", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  await fixture(async ({ bound }) => {
    const { spark } = await bound.invoke(actions.create, { title: "Queue", body: "Waiting on a model" });
    const { conversation } = await bound.invoke(actions.openConversation, { spark_ids: [spark.id] });
    const reply = bound.invoke(actions.message, { id: conversation.id, body: "继续" });
    await entered.promise;
    try {
      // While the model has not answered, reads and writes of the same project still complete.
      const listed = await Promise.race([bound.invoke(actions.list, {}), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("held in line")), 2000))]);
      assert.equal(listed.sparks.length, 1);
      await bound.invoke(actions.create, { title: "Meanwhile" });
    } finally { release.resolve(); }
    const state = await reply;
    assert.equal(state.messages.at(-1)?.body, "模型的回应");
  }, async () => { entered.resolve(); await release.promise; return "模型的回应"; });
});

test("a spark reads back by the shared subject protocol: what it says now, its revision and where to open it", async () => {
  await fixture(async ({ bound }) => {
    const { spark } = await bound.invoke(actions.create, { title: "周会改到周三", body: "下午两点，线上" });
    const context = await bound.invoke(actions.subject, { subject_id: spark.id });
    assert.deepEqual([context.subject, context.title, context.content, context.revision, context.open], [{ kind: "lingguang_spark", id: spark.id }, "周会改到周三", "下午两点，线上", `${spark.updated_at}:inbox`, { surface: "lingguang", id: spark.id }]);
    const edited = await bound.invoke(actions.update, { id: spark.id, body: "下午三点" });
    assert.equal((await bound.invoke(actions.subject, { subject_id: spark.id })).revision, `${edited.spark.updated_at}:inbox`, "an edit shows as a new revision");
  });
  // The page names the spark it shows by the same revision, or a work started there reads as changed at once.
  const browser = ["editor.ts", "chat.ts", "list.ts", "load.ts", "commands.ts", "material.ts", "page.ts"].map(file => readFileSync(new URL(`../plugins/native/lingguang/src/browser/${file}`, import.meta.url), "utf8")).join("\n");
  assert.equal(browser.match(/version: [\w.]+\.updated_at \+ ":" \+ \([\w.]+\.status \|\| "inbox"\)/g)?.length, 2, "the context it publishes and the hand-over to the Assistant");
  assert.equal(browser.match(/version: [\w.]+\.updated_at/g)?.length, 2, "no other place names it by its time alone");
});

// specs/prologue-adoption §4.5 (item 10): a reply streams its text as a preview over the same Host action; closing the
// request stops the call and saves nothing; a finished reply is saved only after its checks.
test("a streamed reply shows the model's text as it comes; closing the request saves nothing; a finished one is saved", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "lingguang-stream-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "Lingguang", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const halfway = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  let calls = 0, stopped = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async (_prompt, options) => {
    calls++;
    await options?.beforeDispatch?.();
    options?.onProgress?.({ type: "text-delta", text: "第一句，" } as never);
    if (calls === 1) {
      halfway.resolve();
      // Held until the page goes away; the call then sees its cancellation.
      await new Promise<void>(resolve => options?.signal?.addEventListener("abort", () => { stopped = true; resolve(); }, { once: true }));
      options?.signal?.throwIfAborted();
    }
    await finish.promise;
    options?.onProgress?.({ type: "text-delta", text: "第二句。" } as never);
    return "第一句，第二句。";
  } });
  const token = "lingguang-test-01234567890123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const headers = { origin, "content-type": "application/json", "x-molis-work-control-token": token };
    const post = (path: string, body: unknown, signal?: AbortSignal) => fetch(origin + path, { method: "POST", body: JSON.stringify(body), signal,
      headers: { ...headers, "x-molis-work-idempotency-key": crypto.randomUUID() } });
    const path = `/projects/${project.project_id}/api/plugins/io.molis.work.lingguang/sparks`;
    const { spark } = await (await post(path, { title: "Stream", body: "A thought" })).json() as { spark: { id: string } };
    const { conversation } = await (await post(`${path}/conversations`, { spark_ids: [spark.id] })).json() as { conversation: { id: string } };
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const bound = bindActionClient(host.actionClient(ref), () => ({ actor_id: "owner", project_id: project.project_id, audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS }));
    // Stopped: the page reads the first words, then closes the request.
    const controller = new AbortController();
    const first = await post(`${path}/conversations/${conversation.id}/messages`, { body: "继续" }, controller.signal);
    assert.match(first.headers.get("content-type") ?? "", /ndjson/);
    const reader = first.body!.getReader(), decoder = new TextDecoder();
    let seen = "";
    await halfway.promise;
    while (!seen.includes("第一句")) seen += decoder.decode((await reader.read()).value, { stream: true });
    assert.match(seen, /"text_delta":"第一句，"/, "the model's words reach the page as they are written");
    controller.abort();
    for (let i = 0; i < 200 && !stopped; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(stopped, true, "closing the request stops the call");
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal((await bound.invoke(actions.getConversation, { id: conversation.id })).messages.length, 0, "a stopped reply saves nothing");
    // Finished: the preview lines, then the saved state.
    finish.resolve();
    const lines = (await (await post(`${path}/conversations/${conversation.id}/messages`, { body: "继续" })).text()).trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(lines.filter(line => line.type === "progress" && line.text_delta).map(line => line.text_delta), ["第一句，", "第二句。"]);
    const result = lines.find(line => line.type === "result");
    assert.equal(result.result.messages.at(-1).body, "第一句，第二句。");
    assert.deepEqual((await bound.invoke(actions.getConversation, { id: conversation.id })).messages.map((message: { body: string }) => message.body), ["继续", "第一句，第二句。"]);
    const hostSource = readFileSync(new URL("../apps/local-host/src/plugin-route-stream.ts", import.meta.url), "utf8");
    for (const word of ["waiting", "extracting", "writing"]) assert.equal(hostSource.includes(word), false, `the host still names ${word}`);
    const client = readFileSync(new URL("../plugins/native/lingguang/src/browser/chat.ts", import.meta.url), "utf8");
    const submit = client.slice(client.indexOf('el.chatForm.addEventListener("submit"'), client.indexOf('el.chatForm.addEventListener("keydown"'));
    assert.ok(submit.length > 200, "the submit handler is found");
    const caught = submit.slice(submit.indexOf("} catch"), submit.indexOf("} finally"));
    assert.ok(caught.length > 50, "the failure branch is found");
    assert.equal(caught.includes("chatInput.value"), false, "closing the request leaves the typed input in the box");
    // Cleared only when the box still holds what was sent; the emptied box is fitted again (VUX-16, data-fit).
    assert.match(submit, /if \(el\.chatInput\.value === body\) \{ el\.chatInput\.value = ""; window\.molisFit\?\.\(el\.chatInput\); \}/);
  } finally {
    finish.resolve();
    if (server.listening) await new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); });
    catalog.close(); await host.close(); await rm(home, { recursive: true, force: true });
  }
});

// W4-1 LG-REVERT-01 (specs/context-program §21.5): 记下灵光 is taken back by `lingguang.revert`, which goes through the same store
// function and version check as `lingguang.discard` and needs the same permission. Changed since it was noted, it is refused and
// nothing changes; unchanged, it leaves the list and the record is kept.
test("LG-REVERT-01 lingguang.revert refuses a spark changed since it was noted and changes nothing; an unchanged one leaves the list", async () => {
  await fixture(async ({ bound, client, caller }) => {
    const { spark } = await bound.invoke(actions.create, { title: "Noted", body: "As noted" });
    const edited = (await bound.invoke(actions.update, { id: spark.id, title: "Edited elsewhere", expected_updated_at: spark.updated_at })).spark;
    await assert.rejects(bound.invoke(actions.revert, { id: spark.id, expected_updated_at: spark.updated_at }), { code: "lingguang.conflict" });
    assert.deepEqual((await bound.invoke(actions.get, { id: spark.id })).spark, edited, "neither discarded nor changed");
    await assert.rejects(client.invoke({ ...caller, permissions: ["lingguang:read"] }, actions.revert, { id: spark.id, expected_updated_at: edited.updated_at }),
      { code: "actions.forbidden" }, "the same permission as discard");
    assert.deepEqual(actions.revert.action.permissions, actions.discard.action.permissions);
    await bound.invoke(actions.revert, { id: spark.id, expected_updated_at: edited.updated_at });
    assert.deepEqual((await bound.invoke(actions.list, {})).sparks.map(row => row.id), [], "out of the list");
    assert.equal((await bound.invoke(actions.get, { id: spark.id })).spark.status, "discarded", "the record is kept");
  });
});
test("RAC-1620: 灵光 counts a spark's title and body in Unicode characters, as its action schemas do", async () => {
  // create/update in src/actions.ts allow an 80-character title and a 200000-character body (LINGGUANG_BODY_LIMIT in src/contract.ts);
  // one 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const { spark } = await bound.invoke(actions.create, { title: wide(80), body: "想法" });
    assert.equal(spark.title, wide(80), "create keeps an 80-character title");
    const written = (await bound.invoke(actions.update, { id: spark.id, body: wide(200_000) })).spark;
    assert.equal(written.body, wide(200_000), "update keeps a 200000-character body");
    await assert.rejects(bound.invoke(actions.update, { id: spark.id, title: wide(81) }), { code: "actions.input_invalid" }, "81 characters is still past the schema");
  });
});

test("RAC-1621: a spark without a title takes the first 80 whole characters of its body's first line, never half of one", async () => {
  // normalizeTitle in src/store.ts falls back to the body's first line; a cut by UTF-16 units would end inside a 🟢.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const { spark } = await bound.invoke(actions.create, { body: "灵" + wide(80) + "\n第二行" });
    assert.equal(spark.title, "灵" + wide(79), "create titles it with 80 whole characters");
    const retitled = (await bound.invoke(actions.update, { id: spark.id, title: "", body: "感" + wide(80) })).spark;
    assert.equal(retitled.title, "感" + wide(79), "an update that empties the title does the same");
  });
});

test("RAC-1622: a brainstorm message of 2000 Unicode characters is kept with the reply the model wrote for it", async () => {
  // conversation.message in src/actions.ts allows a 2000-character body; the store checks it again only after the model has answered.
  const prompts: string[] = [];
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const { spark } = await bound.invoke(actions.create, { title: "长句", body: "想法" });
    const { conversation } = await bound.invoke(actions.openConversation, { spark_ids: [spark.id] });
    const state = await bound.invoke(actions.message, { id: conversation.id, body: wide(2000) });
    assert.deepEqual(state.messages.map(row => row.body), [wide(2000), "回应"], "the 2000-character message and its reply are both kept");
    await assert.rejects(bound.invoke(actions.message, { id: conversation.id, body: wide(2001) }), { code: "actions.input_invalid" }, "2001 characters is still past the schema");
    assert.equal(prompts.length, 1, "the model was asked once, for the message that was kept");
  }, async prompt => { prompts.push(prompt); return "回应"; });
});

test("RAC-1686: a conversation gets each spark's first 12000 UTF-16 units, never half a character, and is told when the rest was left out", async () => {
  // conversationPrompt (src/actions.ts) keeps SPARK_IN_PROMPT = 12000 UTF-16 units of a spark's body, its share of the prompt's 180000 units. One 🟢 is one character but
  // two UTF-16 units: a spark of exactly 12000 units is whole; one of 12001 ("灵" and 6000 🟢) keeps "灵" and 5999 🟢, since the 6000th would end past unit 12000.
  // The 12001-unit spark "边" (6000 🟢 then "灵") ends the 6000th 🟢 exactly at unit 12000, so it keeps all 6000 and says the rest was left out.
  // The conversation lists its sparks in the order of their ids (store.ts:219 sorts spark_ids, :238 reads them back in that order), and ids are random, so the expected
  // list follows the ids.
  const prompts: string[] = [];
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const whole = (await bound.invoke(actions.create, { title: "整", body: wide(6_000) })).spark;
    const long = (await bound.invoke(actions.create, { title: "长", body: "灵" + wide(6_000) })).spark;
    const edge = (await bound.invoke(actions.create, { title: "边", body: wide(6_000) + "灵" })).spark;
    const { conversation } = await bound.invoke(actions.openConversation, { spark_ids: [whole.id, long.id, edge.id] });
    await bound.invoke(actions.message, { id: conversation.id, body: "接着想" });
    const shown = new Map([[whole.id, { title: "整", body: wide(6_000) }], [long.id, { title: "长", body: "灵" + wide(5_999) + "\n（以下省略）" }],
      [edge.id, { title: "边", body: wide(6_000) + "\n（以下省略）" }]]);
    assert.deepEqual(conversationMaterial(prompts[0]!), { sparks: [whole.id, long.id, edge.id].sort().map(id => shown.get(id)!), history: [], message: "接着想" },
      "the 12000-unit spark is whole, the 12001-unit ones keep their whole characters within 12000 units and say so");
  }, async prompt => { prompts.push(prompt); return "回应"; });
});
