import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangActions as actions, lingguangContentActions as content, LINGGUANG_ACTION_PERMISSIONS, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

async function fixture(run: (f: { home: string; host: MolisWorkLocalHost; caller: ActionCallContext;
  client: ReturnType<MolisWorkLocalHost["actionClient"]>; bound: ReturnType<typeof bindActionClient>;
  ref: ReturnType<typeof molisWorkHostProjectReference> }) => Promise<void>, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "lingguang-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "a", projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  try { await run({ home, host, caller, client, ref, bound: bindActionClient(client, () => caller) }); }
  finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

test("all Lingguang business actions register before UI, enforce identity and share content writes", async () => {
  await fixture(async ({ home, client, caller, bound, host, ref }) => {
    const discovered = await client.discover(caller);
    for (const action of Object.values(actions)) assert.ok(discovered.some(row => row.capability_id === action.capability_id));
    const unavailable = discovered.find(row => row.capability_id === actions.message.capability_id)!;
    assert.equal(unavailable.availability.available, false);
    const { spark } = await bound.invoke(actions.create, { title: "First", body: "Original" });
    await assert.rejects(client.invoke({ ...caller, project_id: "b" }, actions.list, {}), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["lingguang:read"] }, actions.create, { title: "Forbidden" }), { code: "actions.forbidden" });
    await assert.rejects(bound.invoke(actions.create, { project_id: "b" } as never), { code: "actions.input_invalid" });
    const received = await bound.invoke(content.receive, { payload: { title: "Workflow", body: "Written via business action" }, context: { instance_id: "workflow-1", step: 1 } });
    assert.equal((await bound.invoke(actions.get, { id: received.item_id })).spark.body, "Written via business action");
    await assert.rejects(client.invoke({ ...caller, allowed_capability_ids: [content.receive.capability_id] }, content.receive,
      { payload: { title: "Bypass", body: "Must not write" }, context: { instance_id: "workflow-1", step: 2 } }), { code: "actions.forbidden" });
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
    const material = JSON.parse(prompts[0]!.split("\n").slice(1).join("\n"));
    assert.deepEqual(material, { sparks: [{ title: "Window", body: "Light at three o'clock" }], history: [], message: "What could I observe?" });
    await bound.invoke(actions.message, { id, body: "And tomorrow?" });
    const next = JSON.parse(prompts[1]!.split("\n").slice(1).join("\n"));
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
        : mode === "failure" ? /Fixture model failure/ : mode === "empty" ? { code: "lingguang.empty_reply" }
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

test("real HTTP canonical and legacy URLs share Host actions and reject project tampering", async () => {
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
    const path = `/projects/${project.project_id}/api/plugins/lingguang`;
    const { spark } = await http(path, { title: "Canonical", body: "Same data" });
    assert.equal((await http(`/api/plugins/lingguang?project_id=${project.project_id}`)).sparks[0].id, spark.id);
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    const bound = bindActionClient(host.actionClient(ref), () => ({ actor_id: "owner", project_id: project.project_id, audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS }));
    assert.equal((await bound.invoke(actions.get, { id: spark.id })).spark.body, "Same data");
    await http(`${path}?project_id=other`, { title: "Denied" }, 403);
    await http(path, { project_id: "other", title: "Denied" }, 403);
    await http(`/api/plugins/lingguang?project_id=${project.project_id}`, { project_id: "other", title: "Denied" }, 403);
    await http("/api/plugins/lingguang", { title: "Unbound" }, 400);
    const invalid = await fetch(origin + "/api/plugins/lingguang?project_id=does-not-exist");
    assert.notEqual(invalid.status, 200);
    const state = await http(`${path}/conversations`, { spark_ids: [spark.id] });
    await http(`${path}/conversations/${state.conversation.id}/messages`, { body: "No model" }, 400);
    assert.equal((await bound.invoke(actions.getConversation, { id: state.conversation.id })).messages.length, 0);
    assert.equal((await bound.invoke(actions.list, {})).sparks.length, 1);
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    catalog.close(); await host.close(); await rm(home, { recursive: true, force: true });
  }
});
