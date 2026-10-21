import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AssistantService, AssistantStore } from "@molis-ai/molis-work-app-local-host";

const REQUIRED = ["archived", "created_at", "draft", "executor", "origin", "revision", "scope", "session_id", "state", "title", "updated_at", "work_id"];

function fixture(t: test.TestContext) {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => { throw new Error("no runtime in this test"); }, authority: async () => { throw new Error("no authority in this test"); } }, "web-user");
  t.after(() => db.close());
  /** Writes a work's body as an older version, or a key no version reads, could have left it. */
  const storeBody = (workId: string, extra: Record<string, unknown>) => {
    const row = db.prepare("SELECT body FROM assistant_works WHERE work_id=?").get(workId) as { body: string };
    db.prepare("UPDATE assistant_works SET body=? WHERE work_id=?").run(JSON.stringify({ ...JSON.parse(row.body), ...extra }), workId);
  };
  return { store, service, storeBody };
}

// W2-18-A4-VIEW-01: the view is the contract's fields taken by name; nothing else a stored body holds reaches it.
test("W2-18-A4-VIEW-01 a work's view holds exactly the AssistantWork fields, whatever its stored body carries", t => {
  const { store, service, storeBody } = fixture(t);
  const project_ref = { project_id: "p1", storage_key: "p1" };
  const plain = store.create({ actor_id: "web-user", title: "整理周报", scope: { kind: "project", project_id: "p1" }, origin: null, project_ref });
  storeBody(plain.work_id, { handed_back_run: "run-1", hand_back_held: true, some_later_key: { kept: "no" }, graph_id: "graph-plain",
    handover_brief: "交接", question_drafts: { q1: { a: 1 } }, thread_round: { provider_id: "x" } });
  const view = service.saveDraft(plain.work_id, "草稿");
  assert.deepEqual(Object.keys(view).sort(), REQUIRED, "no stored key outside the contract, and no absent optional field written as undefined");
  assert.equal(view.draft, "草稿");
  assert.equal(view.state, "idle");

  // Every optional field the contract names comes through when the work has it, a delegated part's asker read from its graph.
  const parent = store.create({ actor_id: "web-user", title: "季度计划", scope: { kind: "personal" }, origin: null });
  storeBody(parent.work_id, { graph_id: "graph-parent" });
  const part = store.create({ actor_id: "web-user", title: "查数据", scope: { kind: "personal" }, origin: null,
    delegated_by: { graph_id: "graph-parent", node_id: "p-1", title: "季度计划", acceptance: "列出三项" } });
  const reply_target = { provider_id: "pages", subject_kind: "page", subject_id: "s1", thread_id: "t1", title: "讨论" };
  const character = { artifact_id: "a1", version: 2, title: "分析师" };
  // Its `delegated_by` also carries a key the current shape does not have: the asker is still the one its graph names.
  storeBody(part.work_id, { reply_target, scope_title: "个人", character, budget_tokens: 5000, handed_back_run: "run-2",
    delegated_by: { ...store.get("web-user", part.work_id).delegated_by, work_id: "work-elsewhere", owed: 1 } });
  const full = service.saveDraft(part.work_id, "");
  assert.deepEqual(Object.keys(full).sort(), [...REQUIRED, "budget_tokens", "character", "delegated_by", "reply_target", "scope_title"].sort());
  assert.deepEqual(full.delegated_by, { work_id: parent.work_id, title: "季度计划", acceptance: "列出三项" }, "which work asked, never the graph's own ids");
  assert.deepEqual([full.reply_target, full.scope_title, full.character, full.budget_tokens], [reply_target, "个人", character, 5000]);
});
