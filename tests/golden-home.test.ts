// Golden Homes (specs/upgrade-continuity/golden-replay-design.md §2-§4): the dumper, the two scripts, and that each one refuses what it has to.
// One generation in a temporary directory, compared with a second and replayed; the tampered copies then each have to fail at their own step.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as netConnect, type AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after, before, describe } from "node:test";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import { CATALOG_VERSION_ACCESS, countSqliteRows, dumpSqliteText } from "@molis-ai/molis-work-storage";
import { CATALOG_SCHEMA_VERSION } from "@molis-ai/molis-work-app-local-host";
import { assertTemporaryHome, compareGoldens, filePayload, goldenEnvironment, restoreGolden, withFixedSandboxEntries } from "../scripts/golden/layout.mjs";
import { MODULE_SOURCES_DIRECTORY, RELEASE_MANIFESTS_DIRECTORY, releasePayloadReader, withoutReleasePayloads, withReleasePayloads, writeReleasePayloads } from "../scripts/golden/release-payloads.mjs";
import { assertRecordedVersions, PERSISTENT_FORMAT_LOCATIONS } from "../scripts/golden/formats.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_SCRIPT = path.join(root, "scripts/golden-home.mjs"), REPLAY_SCRIPT = path.join(root, "scripts/replay-golden-homes.mjs");
const PRETEND_LINUX = path.join(root, "tests/fixtures/pretend-linux.mjs");
const VERSION = "9.9.9-dev.1", GENERATED_TEXT = "金样";

interface Run { readonly status: number | null; readonly stdout: string; readonly output: string }
function runWith(nodeArguments: string[], script: string, ...args: string[]): Run {
  const result = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", ...nodeArguments, script, ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout, output: `${result.stdout}${result.stderr}` };
}
const run = (script: string, ...args: string[]) => runWith([], script, ...args);
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

test("a process a generation forks runs on the generation's clock, or the deadlines it is given are months past (the statement process of a Home library)", () => {
  const forked = run(path.join(root, "tests/fixtures/golden-forked-clock.mjs"));
  assert.equal(forked.status, 0, forked.output);
  const { parent, child } = JSON.parse(forked.stdout);
  assert.equal(child, parent);
  assert.equal(new Date(parent).toISOString(), "2026-01-15T09:00:00.000Z");
});

describe("what a dump holds in place of what cannot stay in it", () => {
  const code = `export const q = "it's $& \\\\ \\"quoted\\" 金样";`;
  const stored = (source: string, plugin: string) => `INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","artifact_json") VALUES('${plugin}','${JSON.stringify({ plugin_id: plugin, manifest: { name: "it's", nested: { reason: "quoted \" $& 金样" } }, module_source: source }).replaceAll("'", "''")}');`;

  test("a release's Manifest and code each become one digest however many rows hold them, and come back to the same bytes", t => {
    const dump = ["BEGIN;", stored(code, "a"), stored(code, "b"), stored(`${code} `, "c"), `INSERT INTO "other"("x") VALUES('"module_source":"kept"');`, "COMMIT;"].join("\n");
    const payloads = { sources: new Map<string, string>(), manifests: new Map<string, string>() }, stripped = withoutReleasePayloads(dump, payloads);
    assert.equal(payloads.sources.size, 2);
    assert.equal(payloads.manifests.size, 1);
    assert.equal(stripped.includes("quoted"), false);
    assert.equal(stripped.includes(`"module_source":"kept"`), true);
    assert.equal(stripped.match(/"manifest":"sha256:[0-9a-f]{64}"/gu)?.length, 3);
    assert.equal(withReleasePayloads(stripped, (directory: string, digest: string) => (directory === MODULE_SOURCES_DIRECTORY ? payloads.sources : payloads.manifests).get(digest)!), dump);

    const directory = scratch(t), written = writeReleasePayloads(directory, MODULE_SOURCES_DIRECTORY, payloads.sources), manifests = writeReleasePayloads(directory, RELEASE_MANIFESTS_DIRECTORY, payloads.manifests);
    assert.deepEqual(written.map((item: { bytes: number }) => item.bytes).sort(), [...payloads.sources.values()].map(source => Buffer.byteLength(source)).sort());
    assert.equal(withReleasePayloads(stripped, releasePayloadReader(directory)), dump);
    // A copy that is not what its name says is a damaged golden, not a finding about the plugin, whichever of the two it is.
    for (const [from, kind] of [[MODULE_SOURCES_DIRECTORY, written], [RELEASE_MANIFESTS_DIRECTORY, manifests]] as const) {
      const [first] = kind as { digest: string; payload: string }[];
      writeFileSync(path.join(directory, first!.payload), "damaged");
      assert.throws(() => releasePayloadReader(directory)(from, first!.digest), (error: { code?: string }) => error.code === "golden.payload_digest_mismatch");
    }
  });

  test("a row whose Manifest does not sit just before its code is refused, not half-stored", () => {
    const backwards = `INSERT INTO "plugin_runtime_release_artifacts"("artifact_json") VALUES('${JSON.stringify({ module_source: code, manifest: {} }).replaceAll("'", "''")}');`;
    assert.throws(() => withoutReleasePayloads(backwards, { sources: new Map(), manifests: new Map() }), (error: { code?: string }) => error.code === "golden.release_payload_shape");
  });

  for (const directory of [MODULE_SOURCES_DIRECTORY, RELEASE_MANIFESTS_DIRECTORY]) test(`a compressed copy in ${directory} is compared as what it holds: another Node's compressor changes no finding, and other contents still do`, t => {
    const generation = (name: string, quality: number, source: string) => {
      const at = path.join(scratch(t), name), file = path.join(at, directory, "a.br");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }));
      return { at, file };
    };
    const source = code.repeat(500), best = generation("best", 11, source), fast = generation("fast", 1, source);
    assert.notDeepEqual(readFileSync(best.file), readFileSync(fast.file));
    assert.deepEqual(compareGoldens(best.at, fast.at), []);
    assert.deepEqual((compareGoldens(best.at, generation("other", 11, `${source} `).at) as { reason: string }[]).map(item => item.reason), ["differs"]);
  });

  test("an installed package's code goes in as data, and everything else under its own name", () => {
    for (const code of ["plugin-packages/a/plugin.mjs", "x/a.js", "x/a.cjs", "x/a.ts", "x/a.tsx"]) assert.equal(filePayload(code), `files/${code}.data`);
    for (const other of ["plugin-packages/a/manifest.json", "config/onboarding.json", "shelf/files/a/note.md"]) assert.equal(filePayload(other), `files/${other}`);
  });

  test("the sample's sandbox entries get fixed fields in their own row, and the same text in any other row stays", () => {
    const value = '[["item:i20261107130700936-t4wkwf",{"id":"i20261107130700936-t4wkwf","text":"周五整理资料","created_at":"2026-11-07T13:07:00.936Z"}]]';
    const row = (key: string) => `INSERT INTO "plugin_private_values"("install_id","item_key","item_value") VALUES('plugin-install-1','${key}','${value}');`;
    const fixed = withFixedSandboxEntries(`${row("sandbox:entries")}\n${row("other")}`).split("\n");
    assert.equal(fixed[0], row("sandbox:entries").replaceAll("i20261107130700936-t4wkwf", "i20260115090000000-golden").replace("2026-11-07T13:07:00.936Z", "2026-01-15T09:00:00.000Z"));
    assert.equal(fixed[1], row("other"));
  });
});

test("UPG2-03 a Golden HTTP write failure reports its owner and fixed transport code without its contents", () => {
  const preload = `
    const real = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input?.url ?? input));
      if (url.hostname !== "127.0.0.1" || url.pathname !== "/api/onboarding/context" || init?.method !== "POST") return real(input, init);
      const cause = Object.assign(new Error("golden-cause-message-sentinel"), {
        code: "UND_ERR_SOCKET", body: "golden-response-body-sentinel", address: "golden-address-sentinel",
      });
      throw new TypeError("golden-fetch-message-sentinel", { cause });
    };`;
  const injected = `data:text/javascript;base64,${Buffer.from(preload).toString("base64")}`;
  const replay = runWith(["--import", injected], REPLAY_SCRIPT, "--latest", "1");
  assert.equal(replay.status, 1);
  assert.match(replay.stdout.trim(), /^FAIL \S+ write root\/write\/context-onboarding golden\.http_request_socket_closed$/u);
  assert.doesNotMatch(replay.output, /golden-(?:cause-message|response-body|address|fetch-message)-sentinel/u);
});

test("UPG2-03 the Golden HTTP client keeps a failed request, body, or decode distinct", async t => {
  const { openGoldenHost } = await import("../scripts/golden/session.mjs");
  const home = scratch(t), originalFetch = globalThis.fetch;
  const savedEnvironment = Object.keys(goldenEnvironment(home)).map(name => [name, process.env[name]] as const);
  let session: Awaited<ReturnType<typeof openGoldenHost>> | undefined;
  try {
    session = await openGoldenHost(home);
    const route = "/api/onboarding/context";
    const cause = Object.assign(new Error("golden-body-cause-sentinel"), { code: "ECONNRESET" });
    const bodyFailure = new TypeError("golden-body-error-sentinel", { cause });
    const unknown = new TypeError("golden-unknown-message-sentinel", { cause: { code: "golden-unknown-cause-sentinel" } });
    const refused = new TypeError("golden-network-message-sentinel", { cause: { code: "golden.network_refused", where: "golden-network-host-sentinel" } });
    const cases = [
      { outcome: () => new Response(new ReadableStream({ start(controller) { controller.error(bodyFailure); } })),
        code: "golden.http_body_connection_reset", where: "http/body", original: bodyFailure },
      { outcome: () => new Response("golden-json-body-sentinel", { headers: { "content-type": "application/json" } }),
        code: "golden.http_json_invalid", where: "http/decode" },
      { outcome: () => { throw unknown; }, code: "golden.http_request_failed", where: "http/request", original: unknown },
      { outcome: () => { throw refused; }, code: "golden.network_refused", where: "http/request", original: refused },
      { outcome: () => new Response("golden-400-body-sentinel", { status: 400 }), code: "golden.http_400", where: route },
    ];
    for (const { outcome, code, where, original } of cases) {
      let requests = 0;
      globalThis.fetch = async () => { requests++; return outcome(); };
      await assert.rejects(session.http(route), (error: { code?: string; where?: string; cause?: unknown }) => {
        assert.equal(error.code, code);
        assert.equal(error.where, where);
        if (original) assert.equal(error.cause, original);
        if (code === "golden.http_json_invalid") assert.ok(error.cause instanceof SyntaxError);
        assert.doesNotMatch(JSON.stringify(error), /-sentinel/u);
        return true;
      });
      assert.equal(requests, 1);
    }
    globalThis.fetch = async () => new Response('{"saved":true}', { headers: { "content-type": "application/json" } });
    assert.deepEqual(await session.http(route), { saved: true });
  } finally {
    globalThis.fetch = originalFetch;
    try { await session?.close(); }
    finally {
      for (const [name, value] of savedEnvironment) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }
});

describe("what the scripts refuse without generating anything", () => {
  test("UPG2-01: the real Home and anything outside the temporary directory are refused", t => {
    const refused = (home: string) => assert.throws(() => assertTemporaryHome(home), (error: { code?: string }) => error.code === "golden.real_home_refused");
    refused(homedir());
    const real = path.join(homedir(), ".molis-work");
    if (existsSync(real)) refused(real);
    assert.equal(assertTemporaryHome(scratch(t)).startsWith(realpathSync(tmpdir())), true);
  });

  test("UPG2-06: an address other than this machine is refused and remembered whichever client asks, and the machine itself is not", async () => {
    const { refuseNetwork, refusedNetwork } = await import("../scripts/golden/session.mjs");
    const server = createServer((_request, response) => response.end("ok"));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const off = refuseNetwork();
    const refusal = (error: { code?: string }) => error.code === "golden.network_refused";
    try {
      await assert.rejects(fetch("https://models.invalid/v1"), (error: { cause?: { code?: string } }) => refusal(error.cause ?? {}));
      assert.throws(() => httpsRequest("https://models.invalid/v1"), refusal);
      assert.throws(() => httpRequest("http://models.invalid/v1"), refusal);
      assert.throws(() => netConnect(443, "models.invalid"), refusal);
      assert.deepEqual(refusedNetwork(), Array(4).fill("models.invalid"));
      assert.equal(await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)).text(), "ok");
    } finally {
      off();
      server.close();
    }
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
  type StoreEntry = { path: string; tables: Record<string, number>; schema_version: number };
  function tampered(name: string, change: (sql: string, entry: StoreEntry) => string, pick: (entry: StoreEntry) => boolean): string {
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

  test("UPG2-02: a machine slow enough for the Host's rounds to come due gives the same bytes", () => {
    const slow = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", GOLDEN_SCRIPT, "check", "--version", VERSION, "--dir", golden], {
      cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: `--import=${path.join(root, "tests/fixtures/long-periods-come-due.mjs")}` },
    });
    assert.equal(slow.status, 0, `${slow.stdout}${slow.stderr}`);
    assert.match(slow.stdout, /identical/u);
  }, { timeout: 600_000 });

  test("UPG2-02: `check` says which table differs, and does not say what is in it", () => {
    const parent = tampered("changed", sql => sql.replace(GENERATED_TEXT, "改过的金样内容"),
      entry => readFileSync(path.join(golden, `stores/${entry.path}.sql`), "utf8").includes(GENERATED_TEXT));
    const result = run(GOLDEN_SCRIPT, "check", "--version", VERSION, "--dir", path.join(parent, VERSION));
    assert.equal(result.status, 1);
    assert.match(result.output, /golden\.differs/u);
    assert.doesNotMatch(result.output, /改过的/u);
  }, { timeout: 600_000 });

  test("the recorded commit is not part of what `check` compares, and anything else in the manifest is: a golden goes in with the commit after the one it records", () => {
    const parent = path.join(directory, "other-commit"), copy = path.join(parent, VERSION);
    cpSync(golden, copy, { recursive: true });
    const recorded = manifest(copy);
    writeFileSync(path.join(copy, "manifest.json"), `${JSON.stringify({ ...recorded, commit: "0".repeat(40) }, null, 2)}\n`);
    assert.deepEqual(compareGoldens(golden, copy), []);
    writeFileSync(path.join(copy, "manifest.json"), `${JSON.stringify({ ...recorded, product_version: "0.0.0" }, null, 2)}\n`);
    assert.deepEqual((compareGoldens(golden, copy) as { path: string }[]).map(item => item.path), ["manifest.json"]);
  });

  test("a restored library dumps to what was recorded, code and all, so holding the code once loses nothing", t => {
    const recorded = manifest(), restored = path.join(scratch(t), "home");
    mkdirSync(restored, { mode: 0o700 });
    restoreGolden(golden, recorded, restored);
    const withCode = recorded.stores.filter((entry: { expanded_sha256?: string }) => entry.expanded_sha256);
    assert.ok(withCode.length > 0);
    assert.ok(recorded.module_sources.length > 0);
    for (const entry of recorded.stores) {
      const db = new DatabaseSync(path.join(restored, entry.path), { readOnly: true });
      try { assert.equal(sha256(dumpSqliteText(db, entry.path).sql), entry.expanded_sha256 ?? entry.sha256, entry.path); } finally { db.close(); }
    }
    // The dump itself keeps only the digest.
    const dumped = readFileSync(path.join(golden, withCode[0].payload), "utf8");
    assert.equal(dumped.includes('"module_source":"sha256:'), true);
    assert.equal(dumped.includes('"manifest":"sha256:'), true);
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
    assert.equal(results[0].steps.home_library, "absent");
    assert.deepEqual(results[0].not_run, []);
    assert.ok(results[0].steps.versioned_files > 0);
    // UPG2-05: the Host was restarted and the structure check and every read ran again. The result names the restart steps, so a replay that
    // dropped either one of them (or did not complete it) cannot still say `ok` and pass here. `restart_reads` is the second read count.
    assert.deepEqual(results[0].steps.restarts, ["restart-structure", "restart-read"]);
    assert.ok(results[0].steps.restart_reads > 0);
  }, { timeout: 600_000 });

  test("where the sandbox cannot run, a golden with an installed plugin is replayed without that step, and the result says it did not run and is not a pass", async () => {
    const { thirdPartySample } = await import("../scripts/golden/populate.mjs");
    const { homeLibrarySample } = await import("../scripts/golden/home-library-sample.mjs");
    const parent = path.join(directory, "linux"), copy = path.join(parent, VERSION);
    cpSync(golden, copy, { recursive: true });
    writeFileSync(path.join(copy, "manifest.json"), `${JSON.stringify({ ...manifest(copy), third_party: thirdPartySample().id, home_library: homeLibrarySample().id }, null, 2)}\n`);
    const replayed = runWith(["--import", PRETEND_LINUX], REPLAY_SCRIPT, "--dir", parent);
    assert.equal(replayed.status, 0, replayed.output);
    assert.match(replayed.stdout, /third-party: not run on linux, not a pass, home library: not run on linux, not a pass/u);
  }, { timeout: 600_000 });

  test("UPG2-03: a library at another version fails at the upgrade with its code, and the output has only the place and the code", () => {
    // A golden of a library at 999 records 999, so the replay's reading of the recorded versions lets it through to the upgrade.
    const parent = tampered("version", (sql, entry) => {
      assert.match(sql, /PRAGMA user_version=\d+;/u);
      entry.schema_version = 999;
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
    assert.match(result.output, /^FAIL 9\.9\.9-dev\.1 rows-after-upgrade \S+#todo\S* golden\.rows_decreased$/mu);
    assert.doesNotMatch(result.output, new RegExp(GENERATED_TEXT, "u"));
  }, { timeout: 600_000 });

  test("UPG2-03: a knowledge card an upgrade lost is caught before any read, because the wait for the index would bring it back", () => {
    const card = /^INSERT INTO "knowledge_cards"\(.*$/mu;
    const parent = tampered("card", sql => {
      assert.match(sql, card);
      return sql.replace(card, "");
    }, entry => entry.path === "knowledge/knowledge.db");
    const result = run(REPLAY_SCRIPT, "--dir", parent);
    assert.equal(result.status, 1);
    assert.match(result.output, /^FAIL 9\.9\.9-dev\.1 rows-after-upgrade knowledge\/knowledge\.db#knowledge_cards golden\.rows_decreased$/mu);
  }, { timeout: 600_000 });

  // The sync library's baseline is version 1, so there is no older version with steps to test: 0 is the only version below it.
  for (const [found, code] of [[999, "store_too_new"], [0, "schema_version_mismatch"]] as const) {
    test(`UPG2-06: the account Home's sync library at version ${found} fails the structure check with ${code}, though nothing else opens it`, () => {
      const parent = tampered(`sync-${found}`, (sql, entry) => {
        assert.match(sql, /PRAGMA user_version=\d+;/u);
        entry.schema_version = found;
        return sql.replace(/PRAGMA user_version=\d+;/u, `PRAGMA user_version=${found};`);
      }, entry => entry.path.endsWith("/sync/sync.db"));
      const result = run(REPLAY_SCRIPT, "--dir", parent);
      assert.equal(result.status, 1);
      assert.match(result.output, new RegExp(`^FAIL 9\\.9\\.9-dev\\.1 structure \\S+ storage\\.${code}$`, "mu"), result.output);
    }, { timeout: 600_000 });
  }

  test("a payload that does not match the manifest is reported as a damaged golden, not as a finding about the code", () => {
    const parent = path.join(directory, "digest"), copy = path.join(parent, VERSION);
    cpSync(golden, copy, { recursive: true });
    const [entry] = manifest(copy).stores;
    writeFileSync(path.join(copy, entry.payload), "-- damaged\n");
    const result = run(REPLAY_SCRIPT, "--dir", parent);
    assert.equal(result.status, 1);
    assert.match(result.output, /^FAIL 9\.9\.9-dev\.1 restore .* golden\.payload_digest_mismatch$/mu);
  });

  test("UPG2-07 a golden going into the repository is refused on any Node but the locked one, and a manifest says which Node made it", () => {
    assert.equal(manifest().node, process.version);
    const version = "9.9.8-dev.1", out = path.join(root, "tests/fixtures/golden-homes", version);
    const refused = runWith(["--import", 'data:text/javascript,Object.defineProperty(process,"version",{value:"v1.2.3"})'], GOLDEN_SCRIPT, "create", "--version", version, "--without-third-party");
    assert.equal(refused.status, 1, refused.output);
    assert.match(refused.output, /^FAIL 9\.9\.8-dev\.1 golden\.node_not_locked$/mu);
    assert.equal(existsSync(out), false);
  });

  // UPG-01 and the unified-origin check read these back (scripts/gates/store-schemas.mjs, initial-versions.mjs), so they are what each owner keeps.
  test("UPG-01: it records each library's version where its owner keeps it, each plugin's project tables, and the persistent formats it holds", () => {
    const recorded = manifest(), account = recorded.homes[1].path as string;
    type Store = { path: string; schema_version: number; plugin_tables?: Record<string, number> };
    for (const entry of recorded.stores as Store[]) assert.ok(Number.isInteger(entry.schema_version) && entry.schema_version >= 1, `${entry.path} records a real version, not 0`);
    for (const prefix of ["", `${account}/`]) assert.equal((recorded.stores as Store[]).find(entry => entry.path === `${prefix}projects/catalog.db`)?.schema_version, CATALOG_SCHEMA_VERSION, `${prefix}the catalog's catalog_meta`);
    const project = (recorded.stores as Store[]).find(entry => entry.path === `projects/${recorded.homes[0].projects.primary.project_id}/molis-work.db`);
    assert.deepEqual(project?.plugin_tables, { "io.molis.work.coding": 1, "io.molis.work.feed": 1, "io.molis.work.goals": 1, "io.molis.work.inbox": 1, "io.molis.work.schedule": 1 });
    type Format = { entry: string; path: string; version: number };
    const formats = recorded.formats as Format[];
    // A golden made now holds every format at this build's version: the catalog has had its first upgrade step (05②), the rest are at 1.
    for (const item of formats) assert.equal(item.version, item.entry === "database.home.catalog" ? CATALOG_SCHEMA_VERSION : 1, `${item.entry} at ${item.path}`);
    assert.ok(formats.some(item => item.entry === "database.home.catalog" && item.path === `${account}/projects/catalog.db`), "the account Home's copy too");
    // The two the snapshot cannot hold, and the computer's two files the generation does not write yet (BL-golden-computer-settings).
    const absent = new Set(["format.home.installation", "database.search.text-index", "format.computer.settings", "format.computer.record"]);
    assert.deepEqual([...new Set(formats.map(item => item.entry))].sort(), Object.keys(PERSISTENT_FORMAT_LOCATIONS).filter(entry => !absent.has(entry)).sort());
  });

  // The gates believe the manifest (UPG-01, the unified-origin check), so the replay reads each recorded version again from what it restored,
  // before the Host opens and upgrades anything. Each of these changes only the manifest, which no checksum covers, and each makes the
  // manifest claim a version the Home does not hold.
  type Manifest = { homes: { projects: { primary: { project_id: string } } }[]; stores: (StoreEntry & { plugin_tables?: Record<string, number> })[]; formats: { entry: string; path: string; version: number }[] };
  const edits: [string, (recorded: Manifest) => string][] = [
    ["a library's version raised", recorded => {
      const entry = recorded.stores.find(item => item.path === "projects/catalog.db");
      assert.equal(entry?.schema_version, CATALOG_SCHEMA_VERSION);
      entry!.schema_version = CATALOG_SCHEMA_VERSION + 1;
      return "projects/catalog.db";
    }],
    ["a plugin's project tables raised", recorded => {
      const at = `projects/${recorded.homes[0].projects.primary.project_id}/molis-work.db`, entry = recorded.stores.find(item => item.path === at);
      assert.equal(entry?.plugin_tables?.["io.molis.work.goals"], 1);
      entry!.plugin_tables!["io.molis.work.goals"] = 2;
      return `${at}#plugin_tables`;
    }],
    ["a format's version raised", recorded => {
      const item = recorded.formats.find(format => format.entry === "format.shelf.catalog" && format.path === "shelf/catalog.json");
      assert.equal(item?.version, 1);
      item!.version = 2;
      return "shelf/catalog.json#format.shelf.catalog";
    }],
    ["a format added that the Home does not have", recorded => {
      recorded.formats.push({ entry: "format.computer.settings", path: "computer/settings.json", version: 1 });
      return "computer/settings.json#format.computer.settings";
    }],
  ];
  for (const [what, edit] of edits) {
    test(`UPG-01: a manifest with ${what} fails the replay at the recorded versions, before anything opens it`, () => {
      const parent = path.join(directory, `recorded-${what.replaceAll(/\W+/gu, "-")}`), copy = path.join(parent, VERSION);
      cpSync(golden, copy, { recursive: true });
      const recorded = manifest(copy) as Manifest, where = edit(recorded);
      writeFileSync(path.join(copy, "manifest.json"), `${JSON.stringify(recorded, null, 2)}\n`);
      const result = run(REPLAY_SCRIPT, "--dir", parent);
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, new RegExp(`^FAIL 9\\.9\\.9-dev\\.1 recorded-versions ${where.replaceAll(".", "\\.")} golden\\.recorded_version_mismatch$`, "mu"));
    }, { timeout: 600_000 });
  }

  // Only what the manifest records is checked. The gates count held versions from `formats` alone, so a format left out makes them stricter,
  // never looser; a generator that leaves one out is caught where it generates (the UPG-01 test above, and `check`).
  test("UPG-01: a manifest that leaves a format out still replays, since leaving one out claims nothing the gates could count", () => {
    const parent = path.join(directory, "recorded-format-left-out"), copy = path.join(parent, VERSION);
    cpSync(golden, copy, { recursive: true });
    const recorded = manifest(copy) as Manifest, at = recorded.formats.findIndex(format => format.entry === "database.home.catalog" && format.path === "projects/catalog.db");
    assert.ok(at >= 0);
    recorded.formats.splice(at, 1);
    writeFileSync(path.join(copy, "manifest.json"), `${JSON.stringify(recorded, null, 2)}\n`);
    const result = run(REPLAY_SCRIPT, "--dir", parent);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /^ok {3}9\.9\.9-dev\.1 /mu);
  }, { timeout: 600_000 });

  // The table of formats is this build's, and it reads goldens of earlier releases. An entry added later, in a library or file an older golden
  // already has, is not in that golden's manifest, and the golden still replays: `golden-replay` gates every merge and an old golden cannot be
  // made again. An entry that moves or is renamed is the opposite case on purpose: what an old golden recorded has to stay readable.
  test("UPG-01: a format added to the table after a golden was made does not fail it, and one the golden records but the table lost does", t => {
    const recorded = manifest() as Manifest, restored = path.join(scratch(t), "home");
    mkdirSync(restored, { mode: 0o700 });
    restoreGolden(golden, recorded, restored);
    const storage = { CATALOG_VERSION_ACCESS };
    const later = {
      ...PERSISTENT_FORMAT_LOCATIONS,
      "format.later.rows": { store: "jelly/jelly.db", rows: "SELECT version FROM a_table_this_golden_does_not_have" },
      "format.later.file": { file: "config/onboarding.json", field: "a_field_this_golden_does_not_have" },
    };
    assert.doesNotThrow(() => assertRecordedVersions(storage, recorded, restored, later));
    const { "format.shelf.catalog": renamed, ...lost } = PERSISTENT_FORMAT_LOCATIONS;
    assert.ok(renamed);
    assert.throws(() => assertRecordedVersions(storage, recorded, restored, lost),
      (error: { code?: string; where?: string }) => error.code === "golden.recorded_version_mismatch" && error.where === "shelf/catalog.json#format.shelf.catalog");
  });

  test("the generation's directory holds a dump for every recorded store and nothing it does not record", () => {
    const recorded = manifest();
    for (const entry of recorded.stores) assert.equal(sha256(readFileSync(path.join(golden, entry.payload))), entry.sha256);
    const listed = new Set([...recorded.stores, ...recorded.files, ...recorded.module_sources, ...recorded.release_manifests].map((entry: { payload: string }) => entry.payload));
    const walk = (at: string): string[] => readdirSync(path.join(golden, at), { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(at, item.name)) : [path.join(at, item.name)]);
    for (const file of [...walk("stores"), ...walk("files")]) assert.ok(listed.has(file), file);
  });
});
