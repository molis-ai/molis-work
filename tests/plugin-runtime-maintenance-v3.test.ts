import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

// ac-trust T1: the Home Runtime's store gains the consent ledger, the pinned publishers and the Host's evidence for each installation
// record, which makes it version 3. A version 2 store is refused, never upgraded in place; the offline maintenance is
// `tests/fixtures/plugin-runtime-maintenance-v3.sql`, and these cases are its rehearsal.
const maintenance = readFileSync(new URL("./fixtures/plugin-runtime-maintenance-v3.sql", import.meta.url), "utf8");
const current = readFileSync(new URL("./fixtures/home-store-schemas/plugin-runtime-v3.sql", import.meta.url), "utf8");
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
const storeOf = (home: string) => join(home, "plugin-runtime", "plugin-runtime.db");

function read(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, shape: describeSqliteSchema(db),
    installs: db.prepare("SELECT * FROM plugin_runtime_installs ORDER BY install_id").all().map(row => ({ ...row })),
    values: db.prepare("SELECT * FROM plugin_private_values ORDER BY install_id, item_key").all().map(row => ({ ...row })) }; }
  finally { db.close(); }
}
const apply = (file: string, sql = maintenance) => { const db = new DatabaseSync(file); try { db.exec(sql); } finally { db.close(); } };

/** A Home this build made, then taken back to what version 2 had: no trust column or tables, no evidence inside the records. */
async function versionTwoHome(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-runtime-maintenance-v3-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try { await host.homePlugins!.ready(); } finally { await host.homePlugins!.close(); await host.close(); }
  const db = new DatabaseSync(storeOf(home));
  try {
    const made = db.prepare("SELECT install_id, record_json, publisher_trust FROM plugin_runtime_installs ORDER BY install_id").all().map(row => ({ ...row }));
    db.exec("DROP TABLE plugin_consents; DROP TABLE plugin_publishers; ALTER TABLE plugin_runtime_installs DROP COLUMN publisher_trust");
    db.exec("UPDATE plugin_runtime_installs SET record_json = json_remove(record_json, '$.publisher_trust'); PRAGMA user_version = 2");
    db.prepare("INSERT INTO plugin_runtime_installs VALUES (?, ?)").run("sandboxed-install", JSON.stringify({ install_id: "sandboxed-install", plugin_id: "example.generated", execution: "sandbox", version: "1.0.0" }));
    return { home, made };
  } finally { db.close(); }
}

test("RAC-397: a version 2 Home Runtime store is refused untouched; the maintenance gives each record the evidence for its execution and this build opens the result", async t => {
  const { home, made } = await versionTwoHome(t), file = storeOf(home), original = read(file);
  assert.ok(made.length > 0 && made.every(row => row.publisher_trust === "host"), "the Home's own plugins are of the Host's build");
  assert.equal(original.version, 2);

  const refused = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try { await assert.rejects(refused.homePlugins!.ready(), { code: "storage.schema_version_mismatch" }); } finally { await refused.homePlugins!.close(); await refused.close(); }
  assert.deepEqual(read(file), original, "the refusal writes nothing");

  apply(file); const after = read(file);
  assert.equal(after.version, 3);
  assert.deepEqual(after.shape, shape(current), "table by table the same as a new store");
  assert.deepEqual(after.installs.map(row => [row.install_id, row.publisher_trust]),
    [...made.map(row => [row.install_id, "host"]), ["sandboxed-install", "unsigned"]].sort((a, b) => String(a[0]) < String(b[0]) ? -1 : 1));
  for (const row of after.installs) assert.equal(JSON.parse(row.record_json as string).publisher_trust, row.publisher_trust, "the record says what the column says");
  assert.deepEqual(after.installs.map(row => ({ ...JSON.parse(row.record_json as string), publisher_trust: undefined })),
    original.installs.map(row => ({ ...JSON.parse(row.record_json as string), publisher_trust: undefined })), "nothing else of a record changed");
  assert.deepEqual(after.values, original.values, "private values are not touched");

  const opened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try { await opened.homePlugins!.ready(); } finally { await opened.homePlugins!.close(); await opened.close(); }
  assert.equal(read(file).version, 3);
});

test("RAC-397: the Home Runtime maintenance stops and changes nothing unless the store is version 2 and every record's execution is one it can name", async t => {
  const { home } = await versionTwoHome(t), file = storeOf(home), original = read(file);
  const wrong = new DatabaseSync(file); wrong.exec("PRAGMA user_version = 1"); wrong.close();
  assert.throws(() => apply(file)); assert.deepEqual(read(file), { ...original, version: 1 });
  const reset = new DatabaseSync(file); reset.exec("PRAGMA user_version = 2"); reset.close();

  const unnamed = new DatabaseSync(file); unnamed.prepare("INSERT INTO plugin_runtime_installs VALUES (?, ?)").run("elsewhere", JSON.stringify({ install_id: "elsewhere", execution: "elsewhere" })); unnamed.close();
  const kept = read(file);
  assert.throws(() => apply(file), /NOT NULL/u, "a record of neither execution is refused, not guessed");
  assert.deepEqual(read(file), kept);

  const failing = new DatabaseSync(file); failing.exec("DELETE FROM plugin_runtime_installs WHERE install_id = 'elsewhere'"); failing.close();
  const unchanged = read(file), at = maintenance.lastIndexOf("COMMIT;");
  assert.throws(() => apply(file, `${maintenance.slice(0, at)}INSERT INTO maintenance_v3_guard VALUES (0);\n${maintenance.slice(at)}`));
  assert.deepEqual(read(file), unchanged, "a failure after the rebuild rolls the whole maintenance back");
});
