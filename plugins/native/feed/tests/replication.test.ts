import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { bindDatabaseSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { createFeedRuleReplica, installFeedReplication } from "../src/replication.js";
import { FeedOutRuleStore } from "../src/out-rules.js";

const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
const projectId = "project-one";
const context = { spaceId: space.spaceId, projectId, title: "项目", authorize: () => {} };

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE boards(project_id TEXT PRIMARY KEY)");
  db.prepare("INSERT INTO boards(project_id) VALUES (?)").run(projectId);
  bindDatabaseSpace(db, space);
  installFeedReplication(db, projectId);
  const rules = new FeedOutRuleStore(db);
  const replica = createFeedRuleReplica(db, context);
  return { db, rules, replica, close: () => db.close() };
}

test("Feed capture rule transfers per project but is disabled until locally enabled", () => {
  const a = fixture(), b = fixture();
  try {
    const rule = a.rules.create(projectId, { name: "关注发布", match: { contains: "发布" }, enabled: true });
    const mutation = a.replica.next();
    assert.ok(mutation);
    assert.equal(mutation.key, JSON.stringify([projectId, "feed_rule", rule.rule_id]));
    b.replica.receive({ ...mutation, revision: 1 });
    assert.equal(b.rules.get(projectId, rule.rule_id).name, "关注发布");
    assert.equal(b.rules.get(projectId, rule.rule_id).enabled, false);
    assert.equal(b.replica.next(), null, "remote restore does not echo");
    a.replica.receive({ ...mutation, revision: 1 });
    assert.equal(a.rules.get(projectId, rule.rule_id).enabled, true, "receipt does not disable source");
    assert.equal(a.replica.next(), null);
  } finally { a.close(); b.close(); }
});

test("Feed rejects foreign or malformed envelopes and preserves an active local rule", () => {
  const a = fixture(), b = fixture();
  try {
    const rule = a.rules.create(projectId, { name: "关注发布", match: { contains: "发布" }, enabled: true });
    const mutation = a.replica.next();
    assert.ok(mutation);
    const bad = structuredClone(mutation.value) as { rule: { project_id: string } };
    bad.rule.project_id = "foreign-project";
    b.replica.receive({ ...mutation, value: bad, revision: 1 });
    assert.equal(b.replica.conflicts().length, 1);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM feed_out_rules").get()?.n, 0);
    assert.throws(() => b.replica.resolve(mutation.key, "remote"));

    const c = fixture();
    try {
      c.db.prepare(`INSERT INTO feed_out_rules
        (project_id,rule_id,name,enabled,match_json,created_at,updated_at,admission,judgment_json,revision)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(projectId, rule.rule_id, "本机活跃规则", 1, '{"contains":"本机"}',
        rule.created_at, rule.updated_at, "suggest", null, "local-revision");
      c.replica.receive({ ...mutation, revision: 1 });
      assert.equal(c.replica.conflicts().length, 1);
      assert.equal(c.rules.get(projectId, rule.rule_id).name, "本机活跃规则");
      assert.throws(() => c.replica.resolve(mutation.key, "remote"));
    } finally { c.close(); }
  } finally { a.close(); b.close(); }
});

test("Feed rule edits and deletion produce independent deltas", () => {
  const a = fixture(), b = fixture();
  try {
    const rule = a.rules.create(projectId, { name: "旧规则", match: { contains: "旧" }, enabled: false });
    const first = a.replica.next();
    assert.ok(first);
    b.replica.receive({ ...first, revision: 1 });
    a.replica.receive({ ...first, revision: 1 });
    const updated = a.rules.prepareUpdate(projectId, rule.rule_id, { name: "新规则" });
    a.rules.saveUpdate(updated, rule.revision);
    const second = a.replica.next();
    assert.ok(second);
    b.replica.receive({ ...second, revision: 2 });
    a.replica.receive({ ...second, revision: 2 });
    assert.equal(b.rules.get(projectId, rule.rule_id).name, "新规则");
    a.rules.delete(projectId, rule.rule_id);
    const deleted = a.replica.next();
    assert.ok(deleted);
    assert.equal(deleted.value, null);
    b.replica.receive({ ...deleted, revision: 3 });
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM feed_out_rules").get()?.n, 0);
    assert.equal(b.replica.next(), null);
  } finally { a.close(); b.close(); }
});

test("first Feed sync installation seeds rules created before the journal existed", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE boards(project_id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO boards(project_id) VALUES (?)").run(projectId);
    bindDatabaseSpace(db, space);
    const rule = new FeedOutRuleStore(db).create(projectId, { name: "旧设备上的规则", match: { contains: "消息" } });
    installFeedReplication(db, projectId);
    const replica = createFeedRuleReplica(db, context);
    assert.equal(replica.next()?.key, JSON.stringify([projectId, "feed_rule", rule.rule_id]));
  } finally { db.close(); }
});
