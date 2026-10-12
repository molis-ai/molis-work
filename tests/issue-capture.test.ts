import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPluginDatabase } from "@molis-ai/molis-work-app-local-host";
import { IssueStore, IssueCaptures, ISSUES_DATABASE, issuesActions } from "@molis-ai/molis-work-plugin-issues";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
const caller: ActionExecutionContext = { actor_id: "owner", project_id: null, audience: "agent", permissions: ["issues:read", "issues:write"], beforeEffect: async () => {} };
const image = { name: "截图.png", data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=" };

test("ISSUE-14 ISSUE-15 drafts preserve six images and original words; concurrent confirmation creates exactly once", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-capture-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store), draft_id = crypto.randomUUID();
  const original = { draft_id, description: "  切换页面以后，输入没了。\n", images: Array.from({ length: 6 }, (_, index) => ({ ...image, name: `${index}.png` })) };
  await drafts.prepare(original, caller); assert.equal(store.list({}).items.length, 0);
  const capture = { draft_id, title: "切换页面后输入内容丢失", type: "bug" as const };
  const result = await Promise.all([drafts.capture(capture, caller), drafts.capture(capture, caller)]);
  assert.equal(result[0]!.id, result[1]!.id); assert.equal(store.list({}).items.length, 1);
  const saved = store.read(draft_id); assert.deepEqual(saved.images, original.images); assert.equal(saved.description, original.description);
  assert.equal(saved.title, capture.title); assert.equal(saved.entered_via, "assistant");
  assert.equal((await drafts.capture(capture, caller)).version, 1);
  assert.deepEqual(await drafts.cancel(draft_id, caller), { saved_id: draft_id });
  assert.deepEqual(issuesActions.prepare.action.audiences, ["user"]); assert.deepEqual(issuesActions.cancel.action.audiences, ["user"]);
});

test("ISSUE-15 cancelling while confirmation waits or restarting an activation rejects the stale draft", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-cancel-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store), draft_id = crypto.randomUUID();
  await drafts.prepare({ draft_id, description: "原文", images: [image] }, caller);
  const waiting = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const capture = { draft_id, title: "建议标题", type: "experience" as const };
  const pending = drafts.capture(capture, { ...caller, beforeEffect: async () => { entered.resolve(); await waiting.promise; } });
  const rejected = assert.rejects(pending, { code: "actions.conflict" });
  await entered.promise; await drafts.cancel(draft_id, caller); waiting.resolve(); await rejected;
  assert.equal(store.list({}).items.length, 0);
  await drafts.prepare({ draft_id: crypto.randomUUID(), description: "重新输入" }, caller);
  await assert.rejects(new IssueCaptures(store).capture(capture, caller), { code: "actions.conflict" });
  assert.equal(db.client.get("SELECT count(*) AS n FROM issues")!.n, 0);
});

test("ISSUE-19 an edit capture updates its bound record exactly once and preserves original input and creation metadata", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-edit-capture-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store);
  const original = await store.create({ title: "原标题", type: "experience", description: "原文", images: [image] }, { ...caller, audience: "user" });
  const draft_id = crypto.randomUUID(), description = "  修改后的描述\n保留原话。";
  await drafts.prepare({ draft_id, target: { id: original.id, expected_version: 1 }, description, images: [] }, caller);
  assert.deepEqual(store.read(original.id), original);
  const input = { draft_id, title: "新建议标题", type: "bug" as const };
  const results = await Promise.all([drafts.capture(input, caller), drafts.capture(input, caller)]);
  assert.deepEqual(results[0], results[1]); assert.equal(results[0]!.id, original.id); assert.equal(results[0]!.version, 2);
  assert.equal(store.list({}).items.length, 1); assert.equal(results[0]!.description, description); assert.deepEqual(results[0]!.images, []);
  assert.equal(results[0]!.entered_via, "manual"); assert.deepEqual(results[0]!.context, original.context);
  assert.equal((await drafts.capture({ ...input, title: "不能重复覆盖" }, caller)).title, "新建议标题");
  assert.deepEqual(await drafts.cancel(draft_id, caller), { saved_id: original.id });
});

test("ISSUE-19 cancelled edits and stale target versions cannot change an existing record", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-edit-cancel-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store);
  const original = await store.create({ title: "原记录", type: "bug", description: "原文", images: [image] }, caller);
  const draft_id = crypto.randomUUID(), target = { id: original.id, expected_version: 1 };
  await drafts.prepare({ draft_id, target, description: "未保存的编辑", images: [] }, caller);
  const waiting = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const input = { draft_id, title: "建议标题", type: "experience" as const };
  const pending = drafts.capture(input, { ...caller, beforeEffect: async () => { entered.resolve(); await waiting.promise; } });
  const rejected = assert.rejects(pending, { code: "actions.conflict" });
  await entered.promise; assert.deepEqual(await drafts.cancel(draft_id, caller), { saved_id: null }); waiting.resolve(); await rejected;
  assert.deepEqual(store.read(original.id), original);
  const next = crypto.randomUUID(); await drafts.prepare({ draft_id: next, target, description: "待核对草稿" }, caller);
  const external = await store.update({ ...target, title: "其他入口改过的标题" }, caller);
  await assert.rejects(drafts.capture({ ...input, draft_id: next }, caller), { code: "actions.conflict" });
  await assert.rejects(drafts.prepare({ draft_id: crypto.randomUUID(), target, description: "过期读取" }, caller), { code: "actions.conflict" });
  assert.deepEqual(store.read(original.id), external); assert.equal(store.list({}).items.length, 1);
});
