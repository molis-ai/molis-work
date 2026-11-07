// Golden Homes (specs/upgrade-continuity/golden-replay-design.md §2-§4): the dumper, the two scripts, and that each one refuses what it has to.
// One generation in a temporary directory, compared with a second and replayed; the tampered copies then each have to fail at their own step.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after, before, describe } from "node:test";
import { fileURLToPath } from "node:url";
import { countSqliteRows, dumpSqliteText } from "@molis-ai/molis-work-storage";
import { assertTemporaryHome, compareGoldens, restoreGolden } from "../scripts/golden/layout.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_SCRIPT = path.join(root, "scripts/golden-home.mjs"), REPLAY_SCRIPT = path.join(root, "scripts/replay-golden-homes.mjs");
const VERSION = "9.9.9-dev.1", GENERATED_TEXT = "金样";

interface Run { readonly status: number | null; readonly stdout: string; readonly output: string }
function run(script: string, ...args: string[]): Run {
  const result = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", script, ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout, output: `${result.stdout}${result.stderr}` };
}
const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

function scratch(t: { after(fn: () => void): void }): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-home-test-")));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function library(file: string, fill: (db: DatabaseSync) => void): string {
  const db = new DatabaseSync(file);
  try { fill(db); return dumpSqliteText(db, path.basename(file)).sql; } finally { db.close(); }
}

const FULL_SCHEMA = `
  CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT, big INTEGER, data BLOB, note TEXT, doubled INTEGER GENERATED ALWAYS AS (big * 2) VIRTUAL);
  CREATE INDEX items_note ON items(note);
  CREATE VIEW item_notes AS SELECT note FROM items;
  CREATE TABLE audit(item INTEGER);
  CREATE TRIGGER items_audit AFTER INSERT ON items BEGIN INSERT INTO audit VALUES(new.id); END;
  CREATE VIRTUAL TABLE pages USING fts5(body);
  PRAGMA user_version=7;`;

describe("the dumper", () => {
  test("a dump loaded into an empty library dumps to the same bytes, with 64-bit integers, blobs, NUL, FTS and sequences intact", t => {
    const directory = scratch(t);
    const first = library(path.join(directory, "a.db"), db => {
      db.exec(FULL_SCHEMA);
      db.exec("INSERT INTO items(big,data,note) VALUES(9007199254740993,x'00ff10','it''s'),(-9223372036854775808,NULL,char(97,0,98)),(1,x'',NULL)");
      db.exec("DELETE FROM items WHERE big=1");
      db.exec("INSERT INTO pages(body) VALUES('golden words live here')");
    });
    const restored = path.join(directory, "b.db");
    const db = new DatabaseSync(restored, { defensive: false });
    try {
      db.exec(first);
      assert.equal(dumpSqliteText(db, "a.db").sql, first);
      const big = db.prepare("SELECT CAST(big AS TEXT) AS big FROM items WHERE id=1").get() as { big: string };
      assert.equal(big.big, "9007199254740993");
      assert.equal(Buffer.from((db.prepare("SELECT data FROM items WHERE id=1").get() as { data: Uint8Array }).data).toString("hex"), "00ff10");
      assert.equal((db.prepare("SELECT length(CAST(note AS BLOB)) AS n FROM items WHERE id=2").get() as { n: number }).n, 3);
      assert.equal((db.prepare("SELECT count(*) AS n FROM pages WHERE pages MATCH 'golden'").get() as { n: number }).n, 1);
      assert.equal((db.prepare("SELECT seq FROM sqlite_sequence WHERE name='items'").get() as { seq: number }).seq, 3);
      assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 7);
      // The trigger comes after the rows: loading records nothing a second time.
      assert.equal((db.prepare("SELECT count(*) AS n FROM audit").get() as { n: number }).n, 3);
    } finally { db.close(); }
  });

  test("insertion order, freelist and the planner's statistics do not enter the text", t => {
    const directory = scratch(t);
    const rows = ["'a'", "'b'", "'c'"];
    const fill = (order: string[]) => (db: DatabaseSync) => {
      db.exec("CREATE TABLE t(name TEXT PRIMARY KEY) WITHOUT ROWID");
      for (const name of order) db.exec(`INSERT INTO t VALUES(${name})`);
    };
    const plain = library(path.join(directory, "plain.db"), fill(rows));
    const churned = library(path.join(directory, "churned.db"), db => {
      fill([...rows].reverse())(db);
      db.exec("CREATE TABLE gone(x); INSERT INTO gone VALUES(randomblob(4096)); DROP TABLE gone; ANALYZE;");
    });
    assert.equal(churned.replaceAll("churned.db", "plain.db"), plain);
    assert.doesNotMatch(churned, /sqlite_stat1/u);
  });

  test("shadow tables are dumped but not counted, so a merge of the index is not a lost row", t => {
    const directory = scratch(t), db = new DatabaseSync(path.join(directory, "fts.db"));
    try {
      db.exec("CREATE VIRTUAL TABLE pages USING fts5(body); CREATE TABLE kept(x); INSERT INTO kept VALUES(1); INSERT INTO pages(body) VALUES('one');");
      const dump = dumpSqliteText(db, "fts.db");
      assert.match(dump.sql, /INSERT INTO "pages_data"/u);
      assert.deepEqual(dump.tables, { kept: 1 });
      assert.deepEqual(countSqliteRows(db), { kept: 1 });
    } finally { db.close(); }
  });

  test("UPG2-02: a column on the normalization list gets one value per file and table; a random column anywhere else stays different and is found", t => {
    const directory = scratch(t);
    const generation = (name: string) => {
      const at = path.join(directory, name);
      mkdirSync(path.join(at, "stores"), { recursive: true });
      writeFileSync(path.join(at, "manifest.json"), "{}\n");
      return at;
    };
    const fill = (other: string) => (db: DatabaseSync) => db.exec(`CREATE TABLE replica_state(device TEXT); INSERT INTO replica_state VALUES(hex(randomblob(16)));
      CREATE TABLE secrets_of_a_row(token TEXT); INSERT INTO secrets_of_a_row VALUES(${other});`);
    const same = "'same'";
    const one = library(path.join(directory, "same.db"), fill(same));
    rmSync(path.join(directory, "same.db"));
    const again = library(path.join(directory, "same.db"), fill(same));
    assert.equal(one, again);

    const left = generation("left"), right = generation("right");
    // The same relative path in both generations, as for a real library: the normalized value follows the path.
    writeFileSync(path.join(left, "stores/lib.db.sql"), library(path.join(left, "lib.db"), fill("hex(randomblob(16))")));
    writeFileSync(path.join(right, "stores/lib.db.sql"), library(path.join(right, "lib.db"), fill("hex(randomblob(16))")));
    rmSync(path.join(left, "lib.db"));
    rmSync(path.join(right, "lib.db"));
    const differences = compareGoldens(left, right) as { path: string; table?: string; reason: string }[];
    assert.equal(differences.length, 1);
    assert.equal(differences[0]!.path, "stores/lib.db.sql");
    assert.equal(differences[0]!.table, "secrets_of_a_row");
    // Where to look, and never what was there.
    assert.doesNotMatch(JSON.stringify(differences), /[0-9A-F]{32}/u);
  });
});

describe("what the scripts refuse without generating anything", () => {
  test("UPG2-01: the real Home and anything outside the temporary directory are refused", t => {
    const refused = (home: string) => assert.throws(() => assertTemporaryHome(home), (error: { code?: string }) => error.code === "golden.real_home_refused");
    refused(homedir());
    const real = path.join(homedir(), ".molis-work");
    if (existsSync(real)) refused(real);
    assert.equal(assertTemporaryHome(scratch(t)).startsWith(realpathSync(tmpdir())), true);
  });

  test("UPG2-06: an address other than this machine is refused and remembered, and the machine itself is not", async () => {
    const original = globalThis.fetch;
    const reached: string[] = [];
    globalThis.fetch = (async (input: string) => { reached.push(String(input)); return new Response("ok"); }) as typeof fetch;
    try {
      const { refuseNetwork, refusedNetwork } = await import("../scripts/golden/session.mjs");
      refuseNetwork();
      await assert.rejects(fetch("https://models.invalid/v1"), (error: { code?: string }) => error.code === "golden.network_refused");
      assert.deepEqual(refusedNetwork(), ["models.invalid"]);
      assert.equal((await fetch("http://127.0.0.1:9/")).ok, true);
      assert.deepEqual(reached, ["http://127.0.0.1:9/"]);
    } finally { globalThis.fetch = original; }
  });

  test("a version name that could be a path, a destination that exists and an unknown command each fail with their code", t => {
    const directory = scratch(t);
    assert.match(run(GOLDEN_SCRIPT, "create", "--version", "../x", "--out", path.join(directory, "new"), "--without-third-party").output, /golden\.version_name_invalid/u);
    assert.equal(existsSync(path.join(directory, "new")), false);
    const exists = run(GOLDEN_SCRIPT, "create", "--version", VERSION, "--out", directory, "--without-third-party");
    assert.equal(exists.status, 1);
    assert.match(exists.output, /golden\.destination_exists/u);
    assert.match(run(GOLDEN_SCRIPT, "nonsense").output, /golden\.command_unknown/u);
  });

  test("a damaged payload stops the restore at the checksum", t => {
    const directory = scratch(t);
    mkdirSync(path.join(directory, "stores"));
    writeFileSync(path.join(directory, "stores/a.sql"), "BEGIN;COMMIT;");
    const manifest = { directories: [], files: [], stores: [{ path: "a.db", payload: "stores/a.sql", mode: 0o600, sha256: "0".repeat(64) }] };
    assert.throws(() => restoreGolden(directory, manifest, path.join(directory)), (error: { code?: string; where?: string }) => error.code === "golden.payload_digest_mismatch" && error.where === "a.db");
  });

  test("with no goldens there is nothing to replay, and that is not a failure", t => {
    const empty = run(REPLAY_SCRIPT, "--dir", scratch(t));
    assert.equal(empty.status, 0);
    assert.match(empty.output, /no golden Homes to replay/u);
  });
});

describe("a generated golden Home", { concurrency: false }, () => {
  let directory: string, golden: string;
  const manifest = (at = golden) => JSON.parse(readFileSync(path.join(at, "manifest.json"), "utf8"));

  /** A copy under its own directory, with one store's dump changed and its checksum made right again, so only the code under test can object. */
  function tampered(name: string, change: (sql: string, entry: { path: string; tables: Record<string, number> }) => string, pick: (entry: { path: string; tables: Record<string, number> }) => boolean): string {
    const parent = path.join(directory, name), copy = path.join(parent, VERSION);
    cpSync(golden, copy, { recursive: true });
    const recorded = manifest(copy), entry = recorded.stores.find(pick);
    assert.ok(entry, `${name}: nothing to tamper with`);
    const file = path.join(copy, entry.payload), text = change(readFileSync(file, "utf8"), entry);
    writeFileSync(file, text);
    entry.sha256 = sha256(text);
    writeFileSync(path.join(copy, "manifest.json"), `${JSON.stringify(recorded, null, 2)}\n`);
    return parent;
  }

  before(() => {
    directory = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-home-test-")));
    golden = path.join(directory, "generated", VERSION);
    mkdirSync(path.dirname(golden));
    const created = run(GOLDEN_SCRIPT, "create", "--version", VERSION, "--out", golden, "--without-third-party");
    assert.equal(created.status, 0, created.output);
  }, { timeout: 600_000 });
  after(() => rmSync(directory, { recursive: true, force: true }));

  test("UPG2-06: it holds both Homes at their own paths, no account credential, no path of the generating Home, and says the plugin was skipped", () => {
    const recorded = manifest();
    assert.deepEqual(recorded.homes.map((home: { space: { kind: string } }) => home.space.kind), ["local", "personal"]);
    const account = recorded.homes[1].path as string;
    assert.match(account, /^spaces\/space_/u);
    assert.equal(recorded.third_party, null);
    assert.equal(recorded.synthetic, true);
    const paths = [...recorded.stores, ...recorded.files].map((entry: { path: string }) => entry.path);
    assert.ok(paths.includes(`${account}/sync/sync.db`));
    // The owner rebuilt the cards at the end of the generation; they are still there, in both Homes.
    for (const prefix of ["", `${account}/`]) {
      const cards = recorded.stores.find((entry: { path: string }) => entry.path === `${prefix}knowledge/knowledge.db`);
      assert.ok(cards.tables.knowledge_cards > 0, prefix);
    }
    assert.ok(paths.some(item => item.startsWith("projects/goalboard-v1-demo/")));
    assert.equal(paths.some(item => item.endsWith("config/native-session-token")), false);
    assert.equal(JSON.stringify(recorded).includes(tmpdir()), false);
    assert.equal(JSON.stringify(recorded).includes(realpathSync(tmpdir())), false);
  });

  test("UPG2-02: generating it again on this commit gives the same bytes", () => {
    const again = run(GOLDEN_SCRIPT, "check", "--version", VERSION, "--dir", golden);
    assert.equal(again.status, 0, again.output);
    assert.match(again.output, /identical/u);
  }, { timeout: 600_000 });

  test("UPG2-02: `check` says which table differs, and does not say what is in it", () => {
    const parent = tampered("changed", sql => sql.replace(GENERATED_TEXT, "改过的金样内容"),
      entry => readFileSync(path.join(golden, `stores/${entry.path}.sql`), "utf8").includes(GENERATED_TEXT));
    const result = run(GOLDEN_SCRIPT, "check", "--version", VERSION, "--dir", path.join(parent, VERSION));
    assert.equal(result.status, 1);
    assert.match(result.output, /golden\.differs/u);
    assert.doesNotMatch(result.output, /改过的/u);
  }, { timeout: 600_000 });

  test("`check` refuses a golden made on another commit: other code may rightly write other bytes", () => {
    const parent = path.join(directory, "other-commit"), copy = path.join(parent, VERSION);
    cpSync(golden, copy, { recursive: true });
    const recorded = manifest(copy);
    writeFileSync(path.join(copy, "manifest.json"), JSON.stringify({ ...recorded, commit: "0".repeat(40) }));
    const result = run(GOLDEN_SCRIPT, "check", "--version", VERSION, "--dir", copy);
    assert.equal(result.status, 1);
    assert.match(result.output, /golden\.check_other_commit/u);
  });

  test("UPG2-01, UPG2-05, UPG2-06: both Homes are restored, opened, read, written to, restarted and read again, under a Home that is not the real one", () => {
    const replayed = run(REPLAY_SCRIPT, "--dir", path.dirname(golden), "--json");
    assert.equal(replayed.status, 0, replayed.output);
    const { results } = JSON.parse(replayed.stdout);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);
    assert.ok(results[0].steps.reads > 0);
    assert.ok(results[0].steps.writes > 0);
    assert.equal(results[0].steps.third_party, "absent");
  }, { timeout: 600_000 });

  test("UPG2-03: a library at another version fails at the upgrade with its code, and the output has only the place and the code", () => {
    const parent = tampered("version", sql => {
      assert.match(sql, /PRAGMA user_version=\d+;/u);
      return sql.replace(/PRAGMA user_version=\d+;/u, "PRAGMA user_version=999;");
    }, entry => entry.path.endsWith("knowledge/knowledge.db"));
    const result = run(REPLAY_SCRIPT, "--dir", parent);
    assert.equal(result.status, 1);
    const [line] = result.output.split("\n").filter(item => item.startsWith("FAIL"));
    assert.match(line ?? "", /^FAIL 9\.9\.9-dev\.1 upgrade \S+ \S+\.\S+$/u, result.output);
    assert.doesNotMatch(result.output, new RegExp(GENERATED_TEXT, "u"));
  }, { timeout: 600_000 });

  test("UPG2-03: a recorded row that is gone fails the row check at that table, without its contents", () => {
    const seeded = /^INSERT INTO "todo[^"]*"\(.*金样.*$/mu;
    const parent = tampered("rows", sql => {
      assert.match(sql, seeded);
      return sql.replace(seeded, "");
    }, entry => seeded.test(readFileSync(path.join(golden, `stores/${entry.path}.sql`), "utf8")));
    const result = run(REPLAY_SCRIPT, "--dir", parent);
    assert.equal(result.status, 1);
    assert.match(result.output, /^FAIL 9\.9\.9-dev\.1 rows \S+#todo\S* golden\.rows_decreased$/mu);
    assert.doesNotMatch(result.output, new RegExp(GENERATED_TEXT, "u"));
  }, { timeout: 600_000 });

  test("a payload that does not match the manifest is reported as a damaged golden, not as a finding about the code", () => {
    const parent = path.join(directory, "digest"), copy = path.join(parent, VERSION);
    cpSync(golden, copy, { recursive: true });
    const [entry] = manifest(copy).stores;
    writeFileSync(path.join(copy, entry.payload), "-- damaged\n");
    const result = run(REPLAY_SCRIPT, "--dir", parent);
    assert.equal(result.status, 1);
    assert.match(result.output, /^FAIL 9\.9\.9-dev\.1 restore .* golden\.payload_digest_mismatch$/mu);
  });

  test("the generation's directory holds a dump for every recorded store and nothing it does not record", () => {
    const recorded = manifest();
    for (const entry of recorded.stores) assert.equal(sha256(readFileSync(path.join(golden, entry.payload))), entry.sha256);
    const listed = new Set([...recorded.stores, ...recorded.files].map((entry: { payload: string }) => entry.payload));
    const walk = (at: string): string[] => readdirSync(path.join(golden, at), { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(at, item.name)) : [path.join(at, item.name)]);
    for (const file of [...walk("stores"), ...walk("files")]) assert.ok(listed.has(file), file);
  });
});
