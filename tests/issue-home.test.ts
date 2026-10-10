import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openPluginDatabase } from "@molis-ai/molis-work-app-local-host";
import { IssueStore, ISSUES_DATABASE } from "@molis-ai/molis-work-plugin-issues";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";

const caller: ActionExecutionContext = { actor_id: "external-client", project_id: null, audience: "mcp", permissions: ["issues:read", "issues:write"], beforeEffect: async () => {} };
const original = { title: "记录窗口切换问题", type: "experience" as const, description: "  原话\n第二行\n", supplement: "在输入过程中发生" };

test("ISSUE-03 ISSUE-04 store preserves original words, persists versions and rejects stale changes across connections", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-store-"));
  const one = openPluginDatabase(home, ISSUES_DATABASE, () => {}), two = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  t.after(async () => { one.close(); two.close(); await rm(home, { recursive: true, force: true }); });
  const first = new IssueStore(one.client, "home-owner"), second = new IssueStore(two.client, "home-owner");
  const issue = await first.create(original, caller);
  assert.equal(issue.description, "  原话\n第二行\n"); assert.equal(issue.version, 1); assert.equal(issue.submitter_id, "home-owner");
  assert.equal(issue.entered_via, "mcp"); assert.equal(issue.context.caller.actor_id, "external-client"); assert.equal(issue.context.page, null);
  assert.equal(second.read(issue.id).title, original.title);
  const waiting = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const delayed = first.update({ id: issue.id, expected_version: 1, title: "晚到的修改" }, { ...caller,
    beforeEffect: async () => { entered.resolve(); await waiting.promise; } });
  const refusal = assert.rejects(delayed, { code: "actions.conflict" });
  await entered.promise;
  const saved = await second.update({ id: issue.id, expected_version: 1, title: "另一窗口的修改" }, caller);
  waiting.resolve(); await refusal;
  assert.equal(saved.version, 2); assert.equal(first.read(issue.id).title, "另一窗口的修改");
  await assert.rejects(first.delete({ id: issue.id, expected_version: 1 }, caller), { code: "actions.conflict" });
  assert.equal(second.read(issue.id).description, original.description);
  assert.equal(new IssueStore(two.client, "another-owner").list({}).items.length, 0);
  assert.throws(() => new IssueStore(two.client, "another-owner").read(issue.id), { code: "actions.missing" });
  await first.delete({ id: issue.id, expected_version: 2 }, caller);
  assert.throws(() => second.read(issue.id), { code: "actions.missing" });
});

test("ISSUE-03 list pagination is bounded and stable when a newer record arrives", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-pages-")), connection = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  t.after(async () => { connection.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(connection.client, "owner");
  for (let n = 0; n < 5; n++) await store.create({ ...original, title: String(n) }, caller);
  const before = store.list({ limit: 5 }).items.map(item => item.id);
  const page = store.list({ limit: 2 });
  await new Promise(resolve => setTimeout(resolve, 2));
  await store.create({ ...original, title: "newer" }, caller);
  const rest = store.list({ limit: 5, cursor: page.next_cursor! });
  assert.deepEqual([...page.items, ...rest.items].map(item => item.id), before);
  assert.throws(() => store.list({ limit: 101 }), { code: "actions.input_invalid" });
  await assert.rejects(store.create({ ...original, title: " \n" }, caller), { code: "actions.input_invalid" });
});

test("ISSUE-04 ISSUE-05 cancellation, revocation, async bodies and failures leave no business writes", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-transaction-"));
  let granted = true;
  const connection = openPluginDatabase(home, ISSUES_DATABASE, () => { if (!granted) throw new Error("revoked"); });
  t.after(async () => { connection.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(connection.client, "owner");
  await assert.rejects(store.create(original, { ...caller, beforeEffect: async () => { throw new Error("cancelled"); } }), /cancelled/u);
  await assert.rejects(store.create(original, { ...caller, beforeEffect: async () => { granted = false; } }), /revoked/u);
  granted = true; assert.equal(store.list({}).items.length, 0);
  const issue = await store.create(original, caller);
  await assert.rejects(connection.client.transaction(caller.beforeEffect, tx => {
    tx.run("UPDATE issues SET title='rollback' WHERE id=?", [issue.id]); throw new Error("rollback requested");
  }), /rollback requested/u);
  let escaped: PluginDatabaseTransaction | undefined;
  const resume = Promise.withResolvers<void>();
  await assert.rejects(connection.client.transaction(caller.beforeEffect, async tx => {
    escaped = tx; tx.run("UPDATE issues SET title='async' WHERE id=?", [issue.id]); await resume.promise;
    tx.run("DELETE FROM issues WHERE id=?", [issue.id]);
  }), { code: "actions.async_required" });
  assert.throws(() => escaped!.run("DELETE FROM issues WHERE id=?", [issue.id]), /事务已结束/u);
  resume.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(store.read(issue.id).title, original.title);
  assert.throws(() => connection.client.get("UPDATE issues SET title='bypass' RETURNING id"), /读取仅接受/u);
  assert.throws(() => connection.client.all("ATTACH DATABASE ':memory:' AS other"), /跨库/u);
  assert.equal(store.read(issue.id).title, original.title);
  connection.close(); assert.throws(() => store.read(issue.id), { code: "actions.plugin_unavailable" });
});

test("ISSUE-01 ISSUE-05 persistence survives reopening, another Home is empty, wrong schema is preserved", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-reopen-")), other = await mkdtemp(join(tmpdir(), "issue-other-"));
  t.after(async () => { await rm(home, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); });
  const initial = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  const saved = await new IssueStore(initial.client, "owner").create(original, caller); initial.close();
  const reopened = openPluginDatabase(home, ISSUES_DATABASE, () => {}), isolated = openPluginDatabase(other, ISSUES_DATABASE, () => {});
  assert.equal(new IssueStore(reopened.client, "owner").read(saved.id).description, original.description);
  assert.deepEqual(new IssueStore(isolated.client, "owner").list({}).items, []);
  reopened.close(); isolated.close();
  const path = join(home, "issues", "issues.db"), raw = new DatabaseSync(path);
  raw.exec("PRAGMA user_version = 9"); raw.close();
  assert.throws(() => openPluginDatabase(home, ISSUES_DATABASE, () => {}), { code: "storage.schema_version_mismatch" });
  const check = new DatabaseSync(path, { readOnly: true });
  assert.equal(check.prepare("PRAGMA user_version").get()!.user_version, 9);
  assert.equal(check.prepare("SELECT description FROM issues WHERE id=?").get(saved.id)!.description, original.description);
  check.close();
});
