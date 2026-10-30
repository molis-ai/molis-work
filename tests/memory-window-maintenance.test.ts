import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { describeSqliteBaseline, describeSqliteSchema, MEMORY_LEDGER_BASELINE, inspectMemoryLedgerAdoption, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { maintainMemoryPreferences, maintainMemorySdk } from "./fixtures/memory-window-maintenance.mjs";
import { currentMemoryOptions } from "./fixtures/current-memory.ts";

const app = { appId: "io.molis.work", appVersion: "1.0.0" }, scope = { scope: "user", owner: LOCAL_PERSON_ACTOR_ID } as const;
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
function fixture(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "memory-window-")); mkdirSync(join(home, "memory"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = join(home, "memory", "memory.db"), db = new DatabaseSync(file);
  db.exec(readFileSync(new URL("./fixtures/home-store-schemas/memory.sql", import.meta.url), "utf8")); db.exec("PRAGMA user_version=2");
  db.prepare("INSERT INTO memory_revisions VALUES(?,?,?)").run("kept", 2, '{"text":"history body is retained"}'); db.close();
  return { home, file };
}
function read(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return { version: Number(db.prepare("PRAGMA user_version").get()!.user_version), schema: describeSqliteSchema(db),
    prefs: new Map(db.prepare("SELECT key,body FROM memory_prefs ORDER BY key").all().map(row => [row.key, JSON.parse(String(row.body))])),
    history: db.prepare("SELECT * FROM memory_revisions").all(), integrity: db.prepare("PRAGMA integrity_check").get()!.integrity_check, foreignKeys: db.prepare("PRAGMA foreign_key_check").all() }; }
  finally { db.close(); }
}
// Independent expected old defaults: this assertion never calls the implementation's preference calculator.
const personal = { form: true, auto: true, learn_from_work: true, learn_from_ui: true,
  consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: false }, plugins: {} };
const project = { ...personal, consumers: { ...personal.consumers, mcp: true } };

test("RAC-2336 v2 adoption materializes the exact old effective defaults and project inheritance without resetting saved restrictions", t => {
  const f = fixture(t), db = new DatabaseSync(f.file), before = read(f.file);
  try {
    const insert = db.prepare("INSERT INTO memory_prefs VALUES(?,?,?)");
    insert.run(LOCAL_PERSON_ACTOR_ID, "personal", JSON.stringify({ auto: false, consumers: { assistant: false } }));
    insert.run(LOCAL_PERSON_ACTOR_ID, "project-default", JSON.stringify({ learn_from_work: false, plugins: { limited: { allowed: false, kinds: ["convention"] } } }));
    insert.run(LOCAL_PERSON_ACTOR_ID, "project:one", JSON.stringify({ form: false, consumers: { mcp: false }, plugins: { extra: { allowed: true } } }));
  } finally { db.close(); }
  const bytes = readFileSync(f.file), listed = maintainMemoryPreferences(f.home);
  assert.equal(listed.preferences_inserted, 0); assert.equal(listed.preferences_materialized, 3); assert.deepEqual(readFileSync(f.file), bytes);
  assert.doesNotMatch(JSON.stringify(listed), /limited|extra|history body|personal|project:one/u);
  maintainMemoryPreferences(f.home, true);
  const result = read(f.file), limit = { limited: { allowed: false, kinds: ["convention"] } };
  assert.deepEqual(result.prefs.get("personal"), { ...personal, auto: false, consumers: { ...personal.consumers, assistant: false } });
  assert.deepEqual(result.prefs.get("project-default"), { ...project, learn_from_work: false, plugins: limit });
  assert.deepEqual(result.prefs.get("project:one"), { ...project, form: false, learn_from_work: false, consumers: { ...project.consumers, mcp: false },
    plugins: { ...limit, extra: { allowed: true, kinds: ["preference", "convention"] } } });
  assert.equal(result.version, 3); assert.equal(result.integrity, "ok"); assert.deepEqual(result.foreignKeys, []);
  assert.deepEqual(result.schema, describeSqliteBaseline(MEMORY_LEDGER_BASELINE)); assert.deepEqual(result.history, before.history);
  assert.equal(inspectMemoryLedgerAdoption({ homeDirectory: f.home }).adoptions.length, 1);
});

test("RAC-2336 wrong version, full structure, unknown preferences and a mid-write fault leave the complete v2 database unchanged", t => {
  for (const kind of ["version", "shape", "unknown", "identity", "fault"] as const) {
    const f = fixture(t), db = new DatabaseSync(f.file);
    try {
      if (kind === "version") db.exec("PRAGMA user_version=3");
      if (kind === "shape") db.exec("CREATE TABLE unexpected(value TEXT)");
      if (kind === "unknown") db.prepare("INSERT INTO memory_prefs VALUES(?,?,?)").run(LOCAL_PERSON_ACTOR_ID, "personal", '{"enabled":false}');
      if (kind === "identity") db.prepare("INSERT INTO memory_prefs VALUES(?,?,?)").run("unrecognized-actor", "personal", '{}');
    } finally { db.close(); }
    const bytes = readFileSync(f.file), prepare = DatabaseSync.prototype.prepare;
    if (kind === "fault") DatabaseSync.prototype.prepare = function (sql) {
      if (String(sql).startsWith("INSERT INTO memory_markers")) throw new Error("injected marker failure after preference writes");
      return prepare.call(this, sql);
    };
    try { assert.throws(() => maintainMemoryPreferences(f.home, true), /version|structure|pre-adoption|identity|injected marker/u, kind); }
    finally { DatabaseSync.prototype.prepare = prepare; }
    assert.deepEqual(readFileSync(f.file), bytes, kind);
  }
});

test("RAC-2337 real SDK encrypted old records survive the entire v2 -> 3 -> 4 route and are readable after the owner is released", async t => {
  const f = fixture(t), storageRoot = join(f.home, "agent-runtime"), initial = read(f.file);
  const value = { id: "old.record", ...scope, version: 4, text: "Keep the approved order.", origin: "person-statement", tags: ["kept"], tombstoned: false,
    meta: { kind: "convention", source: "said", basis: "explicit" }, createdAtMs: 100, updatedAtMs: 200 };
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot }) });
  try {
    const owner = `owner.user-${encodeURIComponent(scope.owner).replaceAll("%", "_")}`;
    await runtime.store.commit({ kind: "memories", id: `${owner}.${value.id}.v1`, expectedVersion: 0,
      metadata: { scope: owner, rowId: value.id, version: 1, state: "active", shape: 2 }, secureBody: new TextEncoder().encode(JSON.stringify(value)) });
  } finally { await runtime.shutdown(); }
  assert.equal(maintainMemoryPreferences(f.home).preferences_inserted, 2);
  maintainMemoryPreferences(f.home, true); assert.deepEqual(read(f.file).prefs.get("personal"), personal); assert.deepEqual(read(f.file).prefs.get("project-default"), project);
  const result = await maintainMemorySdk(f.home);
  assert.equal(result.outcome, "completed"); assert.equal(result.verification, "complete"); assert.equal(result.items.adopted, 1);
  const current = read(f.file); assert.equal(current.version, 4); assert.deepEqual(current.history, initial.history);
  assert.deepEqual(current.schema, describeSqliteBaseline(MEMORY_LEDGER_BASELINE)); assert.equal(current.integrity, "ok"); assert.deepEqual(current.foreignKeys, []);
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try { assert.deepEqual(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal"), { enabled: true, task_recall: true, ...personal }); } finally { ledger.close(); }
  const adapter = await createPrologueNodeAdapter({ app, storageRoot, memory: currentMemoryOptions({ appId: app.appId, scopesFor: () => [scope] }),
    modelConfiguration: async () => { assert.fail("offline adoption and reads must not resolve a model"); } });
  try {
    const entries = await adapter.memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", current_scene: "coding", purpose: "management", person: true }).list(scope.scope, scope.owner);
    assert.equal(entries.length, 1); assert.equal(entries[0]!.memory_id, value.id); assert.equal(entries[0]!.text, value.text); assert.equal(entries[0]!.version, 4);
  } finally { await adapter.close(); }
});
