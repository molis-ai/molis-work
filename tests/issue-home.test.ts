import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openPluginDatabase } from "@molis-ai/molis-work-app-local-host";
import { IssueStore, ISSUES_DATABASE, issuesActions } from "@molis-ai/molis-work-plugin-issues";
import { actionReachesAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";

const caller: ActionExecutionContext = { actor_id: "external-client", project_id: null, audience: "mcp", permissions: ["issues:read", "issues:write"], beforeEffect: async () => {} };
const picture = { name: "截图.png", data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=" };
const original = { title: "记录窗口切换问题", type: "experience" as const, description: "  原话\n第二行\n", images: [picture] };

test("ISSUE-03 actions explicitly declare read, write and irreversible effects", () => {
  for (const action of [issuesActions.list, issuesActions.read]) assert.equal(action.action.effect, "read");
  for (const action of [issuesActions.create, issuesActions.update]) assert.equal(action.action.effect, "write");
  assert.equal(issuesActions.delete.action.effect, "irreversible");
  assert.equal(actionReachesAudience(issuesActions.delete.action, "issues.delete", "plugin"), false);
});

test("ISSUE-09 images persist with the issue, unrelated edits preserve them, and lists omit image bodies", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-images-")), connection = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { connection.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(connection.client, "owner"), saved = await store.create(original, caller);
  assert.deepEqual(saved.images, [picture]); assert.equal(saved.image_count, 1);
  assert.equal("supplement" in saved.context, false);
  assert.equal("images" in store.list({}).items[0]!, false);
  assert.equal(JSON.stringify(store.list({})).includes("base64"), false);
  await store.update({ id: saved.id, expected_version: 1, title: "只改标题" }, caller);
  assert.deepEqual(store.read(saved.id).images, [picture]);
  await store.update({ id: saved.id, expected_version: 2, images: [{ ...picture, name: "新截图.png" }] }, caller);
  assert.equal(store.read(saved.id).images[0]!.name, "新截图.png");
  await assert.rejects(store.update({ id: saved.id, expected_version: 2, images: [] }, caller), { code: "actions.conflict" });
  assert.equal(store.read(saved.id).image_count, 1);
  await store.update({ id: saved.id, expected_version: 3, images: [] }, caller);
  assert.deepEqual(store.read(saved.id).images, []);
  assert.equal(store.read(saved.id).context.recorded_at, saved.context.recorded_at);
  await store.delete({id:saved.id,expected_version:4},caller);
  assert.equal(connection.client.get("SELECT count(*) AS n FROM issues")!.n, 0);
});

test("ISSUE-09 image type, payload and count limits reject the whole write and preserve existing content", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-images-invalid-")), connection = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { connection.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(connection.client, "owner"), saved = await store.create(original, caller);
  const invalid = [
    [{...picture,data_url:"https://example.com/image.png"}],
    [{...picture,data_url:"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="}],
    [{...picture,data_url:"data:image/png;base64,SGVsbG8="}],
    [{...picture,data_url:picture.data_url.replace("image/png","image/jpeg")}],
    [{...picture,data_url:"data:image/png;base64,"+"A".repeat(3*1024*1024)}],
    Array.from({length:7},()=>picture),
  ];
  for (const images of invalid) {
    await assert.rejects(store.update({id:saved.id,expected_version:1,title:"must not persist",images},caller),{code:"actions.input_invalid"});
    assert.deepEqual(store.read(saved.id),saved);
  }
  const large = Buffer.alloc(2*1024*1024); Buffer.from(picture.data_url.split(",")[1]!,"base64").copy(large);
  await assert.rejects(store.create({...original,images:Array.from({length:5},()=>({...picture,data_url:"data:image/png;base64,"+large.toString("base64")}))},caller),{code:"actions.input_invalid"});
  assert.equal(store.list({}).items.length,1);
});

test("ISSUE-03 ISSUE-04 store preserves original words, persists versions and rejects stale changes across connections", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-store-"));
  const one = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" }), two = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
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
  const home = await mkdtemp(join(tmpdir(), "issue-pages-")), connection = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
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
  const connection = openPluginDatabase(home, ISSUES_DATABASE, () => { if (!granted) throw new Error("revoked"); }, { install_id: "issues-test", installation_generation: "1" });
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
  const initial = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  const saved = await new IssueStore(initial.client, "owner").create(original, caller); initial.close();
  const reopened = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" }), isolated = openPluginDatabase(other, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  assert.equal(new IssueStore(reopened.client, "owner").read(saved.id).description, original.description);
  assert.deepEqual(new IssueStore(reopened.client, "owner").read(saved.id).images, original.images);
  assert.deepEqual(new IssueStore(isolated.client, "owner").list({}).items, []);
  reopened.close(); isolated.close();
  const path = join(home, "issues", "issues.db"), raw = new DatabaseSync(path);
  raw.exec("PRAGMA user_version = 9"); raw.close();
  assert.throws(() => openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" }), { code: "storage.schema_version_mismatch" });
  const check = new DatabaseSync(path, { readOnly: true });
  assert.equal(check.prepare("PRAGMA user_version").get()!.user_version, 9);
  assert.equal(check.prepare("SELECT description FROM issues WHERE id=?").get(saved.id)!.description, original.description);
  check.close();
});
test("RAC-1662 an issue's title, description and image name are counted in Unicode characters: 200, 100000 and 200 🟢 are kept on create and update; one more is refused and nothing is written", async t => {
  // The action schema (src/actions.ts) and the table's CHECKs (src/database.ts) count characters; one 🟢 is one character but two UTF-16 units.
  const home = await mkdtemp(join(tmpdir(), "issue-wide-")), connection = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { connection.close(); await rm(home, { recursive: true, force: true }); });
  const wide = (count: number) => "🟢".repeat(count);
  const store = new IssueStore(connection.client, "owner");
  const created = await store.create({ title: wide(200), type: "bug", description: wide(100_000), images: [{ ...picture, name: wide(200) }] }, caller);
  assert.deepEqual([created.title, created.description, created.images[0]!.name], [wide(200), wide(100_000), wide(200)], "create keeps all three at the limit");
  const short = await store.create(original, caller);
  const updated = await store.update({ id: short.id, expected_version: 1, title: wide(200), description: wide(100_000), images: [{ ...picture, name: wide(200) }] }, caller);
  assert.deepEqual([updated.title, updated.description, updated.images[0]!.name], [wide(200), wide(100_000), wide(200)], "update keeps all three at the limit");
  await assert.rejects(store.create({ title: wide(201), type: "bug", description: "原文" }, caller),
    { code: "actions.input_invalid", message: "标题格式不正确或太长" }, "a 201-character title is still past the limit");
  await assert.rejects(store.create({ title: "描述太长", type: "bug", description: wide(100_001) }, caller),
    { code: "actions.input_invalid", message: "描述格式不正确或太长" }, "100001 characters of description is still past the limit");
  await assert.rejects(store.update({ id: updated.id, expected_version: 2, title: wide(201) }, caller),
    { code: "actions.input_invalid", message: "标题格式不正确或太长" }, "update is held to the same title limit");
  await assert.rejects(store.update({ id: updated.id, expected_version: 2, description: wide(100_001) }, caller),
    { code: "actions.input_invalid", message: "描述格式不正确或太长" }, "update is held to the same description limit");
  await assert.rejects(store.update({ id: updated.id, expected_version: 2, images: [{ ...picture, name: wide(201) }] }, caller),
    { code: "actions.input_invalid", message: "图片名称或大小不正确，单张最多 2 MiB" }, "a 201-character image name is still past the limit");
  assert.deepEqual(store.read(updated.id), updated, "no refused update changed the record");
  assert.equal(store.list({}).items.length, 2, "no refused create wrote a record");
});
