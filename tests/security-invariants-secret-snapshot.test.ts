import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import * as storage from "@molis-ai/molis-work-storage";

function inspector() {
  const inspect = Reflect.get(storage, "inspectSealedSecretsSnapshot");
  assert.equal(typeof inspect, "function", "the SecretStore owns read-only snapshot validation");
  return inspect as (home: string, contents: string) => { version: number; backend: string; entries: number; key_reference: { location: string; sha256: string } | null };
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "molis-secret-snapshot-")), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(home);
  const secret = randomBytes(32).toString("hex");
  storage.createLazyFileSecretStore(home).put("snapshot-test", secret);
  rmSync(join(home, "feed", "secrets.lock.sqlite"), { force: true });
  const file = join(home, "feed", "secrets.json"), key = join(home, "feed", "secrets.key");
  return { home, secret, file, key, contents: readFileSync(file, "utf8") };
}

function unchanged(home: string) {
  return Object.fromEntries(readdirSync(home, { recursive: true }).map(String).sort().map(name => {
    const file = join(home, name), stat = lstatSync(file);
    return [name, { mode: stat.mode, modified: stat.mtimeMs, bytes: stat.isFile() ? readFileSync(file) : null }];
  }));
}

test("S-12 RAC-104: sealed snapshot validation uses the original Home key and never modifies that Home", t => {
  const f = fixture(t), inspect = inspector(), before = unchanged(f.home), result = inspect(f.home, f.contents);
  assert.deepEqual(result, { version: 1, backend: "aes-gcm-file", entries: 1, key_reference: { location: "home:feed/secrets.key",
    sha256: createHash("sha256").update(Buffer.from(readFileSync(f.key, "utf8").trim(), "base64")).digest("hex") } });
  assert.deepEqual(unchanged(f.home), before);
  assert.equal(JSON.stringify(result).includes(f.secret), false);
  assert.equal(JSON.stringify(result).includes(readFileSync(f.key, "utf8").trim()), false);
  // Restoring a healthy vault must not depend on being able to parse the damaged live vault first.
  writeFileSync(f.file, "damaged current vault"); const damaged = unchanged(f.home);
  assert.deepEqual(inspect(f.home, f.contents), result);
  assert.deepEqual(unchanged(f.home), damaged);
});

test("S-12 RAC-104: empty plaintext is authenticated data; missing ciphertext, invalid nonce or tag and a wrong key still refuse without writes", t => {
  const f = fixture(t), store = storage.createLazyFileSecretStore(f.home);
  store.put("empty-entry", "");
  const contents = readFileSync(f.file, "utf8"), parsed = JSON.parse(contents), inspect = inspector();
  assert.equal(store.get("empty-entry"), "");
  assert.equal(storage.readExistingSecret(f.home, "empty-entry"), "");
  assert.equal(storage.readSealedSecretSnapshotEntry(f.home, contents, "empty-entry"), "");
  assert.equal(inspect(f.home, contents).entries, 2);
  for (const fault of ["missing-ciphertext", "nonstring-ciphertext", "missing-tag", "short-tag", "altered-tag", "invalid-nonce", "wrong-key"]) {
    const altered = JSON.parse(contents), envelope = JSON.parse(Buffer.from(parsed.entries["empty-entry"], "base64").toString("utf8"));
    if (fault === "missing-ciphertext") delete envelope.ct;
    if (fault === "nonstring-ciphertext") envelope.ct = null;
    if (fault === "missing-tag") delete envelope.tag;
    if (fault === "short-tag") envelope.tag = Buffer.from(envelope.tag, "base64").subarray(0, 8).toString("base64");
    if (fault === "altered-tag") { const tag = Buffer.from(envelope.tag, "base64"); tag[0] = tag[0]! ^ 1; envelope.tag = tag.toString("base64"); }
    if (fault === "invalid-nonce") envelope.iv = Buffer.alloc(11).toString("base64");
    if (fault === "wrong-key") writeFileSync(f.key, randomBytes(32).toString("base64"));
    altered.entries["empty-entry"] = Buffer.from(JSON.stringify(envelope)).toString("base64");
    const before = unchanged(f.home);
    assert.throws(() => inspect(f.home, JSON.stringify(altered)));
    assert.deepEqual(unchanged(f.home), before);
  }
});

test("S-12 RAC-104: a missing or wrong key and invalid snapshots fail before any directory, lock or replacement key is written", t => {
  for (const fault of ["missing-key", "wrong-key", "hardlink-key", "symlink-key", "symlink-feed", "version", "backend", "ciphertext"]) {
    const f = fixture(t), inspect = inspector(), parsed = JSON.parse(f.contents);
    if (fault === "missing-key") unlinkSync(f.key);
    if (fault === "wrong-key") writeFileSync(f.key, randomBytes(32).toString("base64"));
    if (fault === "hardlink-key") linkSync(f.key, f.key + ".extra");
    if (fault === "symlink-key") { renameSync(f.key, f.key + ".original"); symlinkSync(f.key + ".original", f.key); }
    if (fault === "symlink-feed") { renameSync(join(f.home, "feed"), join(f.home, "feed-original")); symlinkSync(join(f.home, "feed-original"), join(f.home, "feed")); }
    if (fault === "version") parsed.version = 3;
    if (fault === "backend") parsed.backend = "unregistered";
    if (fault === "ciphertext") parsed.entries["snapshot-test"] = Buffer.from('{"v":2,"alg":"aes-256-gcm","ct":"altered"}').toString("base64");
    const before = unchanged(f.home);
    assert.throws(() => inspect(f.home, JSON.stringify(parsed)));
    assert.deepEqual(unchanged(f.home), before);
    if (fault === "missing-key") assert.equal(existsSync(f.key), false);
  }
});

test("S-12 RAC-104: an empty sealed vault has no key dependency and does not create a missing Home", t => {
  const root = mkdtempSync(join(tmpdir(), "molis-empty-secret-snapshot-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "missing"), result = inspector()(home, JSON.stringify({ version: 1, backend: "aes-gcm-file", entries: {} }));
  assert.deepEqual(result, { version: 1, backend: "aes-gcm-file", entries: 0, key_reference: null });
  assert.equal(existsSync(home), false);
});
