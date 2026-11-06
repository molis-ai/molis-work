import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createFileSecretStore, createLazyFileSecretStore, inspectSealedSecretsSnapshot, resetSecretStoreCache, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";

// Only the current AES-GCM file (format 1) is read. An older secrets file, such as the v0.3 flat map of reversible
// envelopes, is refused rather than upgraded, and nothing is written over it (repository-anti-corruption §9.5 #4).
test("an older secrets file is refused rather than upgraded, and is left as it was", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-secret-format-"));
  const old = { backend: process.env.MOLIS_WORK_SECRET_BACKEND, key: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  t.after(() => {
    for (const [name, value] of [["MOLIS_WORK_SECRET_BACKEND", old.backend], ["MOLIS_WORK_ENCRYPTION_KEY", old.key]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetSecretStoreCache();
    rmSync(home, { recursive: true, force: true });
  });
  process.env.MOLIS_WORK_SECRET_BACKEND = "env";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  mkdirSync(join(home, "feed"), { recursive: true });
  const file = join(home, "feed", "secrets.json");
  const reversible = Buffer.from(JSON.stringify({ v: Buffer.from("old credential").toString("base64") })).toString("base64");
  for (const older of [{ "model:text:api_key": reversible }, { version: 2, backend: "aes-gcm-file", entries: { "model:text:api_key": reversible } }]) {
    writeFileSync(file, JSON.stringify(older));
    for (const use of [(store: SecretStore) => store.get("model:text:api_key"), (store: SecretStore) => store.put("new", "value")]) {
      resetSecretStoreCache();
      assert.throws(() => runWithMolisWorkHome(home, () => use(createFileSecretStore())), /invalid structure|not supported/);
    }
    assert.equal(readFileSync(file, "utf8"), JSON.stringify(older));
  }
  // The current format still works in the same Home.
  writeFileSync(file, JSON.stringify({ version: 1, backend: "env-key+aes-gcm", entries: {} }));
  resetSecretStoreCache();
  const store = runWithMolisWorkHome(home, () => createFileSecretStore());
  runWithMolisWorkHome(home, () => store.put("new", "value"));
  assert.equal(runWithMolisWorkHome(home, () => store.get("new")), "value");
});

const NOT_SEALED_ENVELOPE = Buffer.from(JSON.stringify({ v: 2, alg: "aes-256-gcm", ct: "not-sealed envelope" })).toString("base64");
const VALID_ENVELOPE_SHAPE = { v: 1, alg: "aes-256-gcm", iv: Buffer.alloc(12).toString("base64"), tag: Buffer.alloc(16).toString("base64"), ct: "" };
// The first is the existing S-12 snapshot fault. Each remaining shape isolates one required field or byte length.
const BAD_ENVELOPE_SHAPES = [
  { v: 1, alg: "aes-256-gcm", ct: "altered" },
  { ...VALID_ENVELOPE_SHAPE, iv: undefined },
  { ...VALID_ENVELOPE_SHAPE, tag: undefined },
  { ...VALID_ENVELOPE_SHAPE, ct: undefined },
  { ...VALID_ENVELOPE_SHAPE, iv: null },
  { ...VALID_ENVELOPE_SHAPE, tag: null },
  { ...VALID_ENVELOPE_SHAPE, ct: null },
  { ...VALID_ENVELOPE_SHAPE, iv: Buffer.alloc(11).toString("base64") },
  { ...VALID_ENVELOPE_SHAPE, tag: Buffer.alloc(8).toString("base64") },
].map(shape => Buffer.from(JSON.stringify(shape)).toString("base64"));
const BAD_ENTRIES = [NOT_SEALED_ENVELOPE, "", ...BAD_ENVELOPE_SHAPES];

/** The env backend for one test, with its environment and cache restored afterwards. */
function envBackend(t: TestContext) {
  const old = { backend: process.env.MOLIS_WORK_SECRET_BACKEND, key: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  t.after(() => {
    for (const [name, value] of [["MOLIS_WORK_SECRET_BACKEND", old.backend], ["MOLIS_WORK_ENCRYPTION_KEY", old.key]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetSecretStoreCache();
  });
  process.env.MOLIS_WORK_SECRET_BACKEND = "env";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
}

/** A Home whose current-format secrets file holds one healthy entry and one legal string that is not a sealed envelope. */
function nonSealedFile(t: TestContext, bad = NOT_SEALED_ENVELOPE) {
  const home = mkdtempSync(join(tmpdir(), "molis-secret-bad-entry-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, "feed"), { recursive: true });
  const file = join(home, "feed", "secrets.json");
  createLazyFileSecretStore(home).put("good", "good-plaintext");
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  parsed.entries.bad = bad;
  writeFileSync(file, JSON.stringify(parsed));
  resetSecretStoreCache();
  return { home, file };
}

// RAC-2721 T-347 / clean-Home batch 6: one secrets file entry that is a string but not a sealed envelope — including the empty
// string, which a truthiness check would call missing — is refused by the snapshot, by a read and by the writes that would carry
// the file forward. The write for another key leaves the file byte for byte.
test("RAC-2721 the snapshot, a read and a write meet a non-sealed envelope secrets entry the same way", t => {
  envBackend(t);
  for (const bad of BAD_ENTRIES) {
    const f = nonSealedFile(t, bad);
    assert.throws(() => inspectSealedSecretsSnapshot(f.home, readFileSync(f.file, "utf8")), { code: "storage.secrets_snapshot.integrity_failed" });
    const store = createLazyFileSecretStore(f.home);
    assert.throws(() => store.get("bad"), /secret not AES-GCM sealed/, "a bad entry is refused, not reported as missing");
    const before = readFileSync(f.file, "utf8");
    assert.throws(() => store.put("another", "another-value"), /secret not AES-GCM sealed/, "a write meets the same bad entry the same way");
    assert.equal(readFileSync(f.file, "utf8"), before, "a refused write leaves the secrets file byte for byte");
    assert.equal(createLazyFileSecretStore(f.home).get("good"), "good-plaintext");
  }
});

// RAC-2722 T-347 coordinator answer: the read refuses a non-sealed envelope entry, and every write that would carry the file forward
// (put, createIfAbsent, deleteIfPresent) refuses it too, leaving the file byte for byte.
test("RAC-2722 a bad entry is refused by a read and by put, createIfAbsent and deleteIfPresent, and the file stays as it was", t => {
  envBackend(t);
  for (const bad of BAD_ENTRIES) {
    const f = nonSealedFile(t, bad), store = createLazyFileSecretStore(f.home), before = readFileSync(f.file, "utf8");
    assert.throws(() => store.get("bad"), /secret not AES-GCM sealed/, "a read refuses the bad entry");
    for (const write of [() => store.put("another", "another-value"), () => store.createIfAbsent("another", "another-value"), () => store.deleteIfPresent("good")]) {
      assert.throws(write, /secret not AES-GCM sealed/);
      assert.equal(readFileSync(f.file, "utf8"), before, "a refused write leaves the secrets file byte for byte");
    }
    assert.equal(store.get("never-written"), null, "a reference that is really absent still reads as null");
    assert.equal(createLazyFileSecretStore(f.home).get("good"), "good-plaintext", "healthy entries still read");
  }
});

// RAC-2722 T-347: deleting the bad entry itself is the one way a vault with one gets clean again; the other entries' ciphertext
// is left exactly as it was. A legal sealed envelope entry with empty plaintext still reads as "" once the vault is clean.
test("RAC-2722 deleting the bad entry itself is allowed and keeps the other entries' bytes", t => {
  envBackend(t);
  for (const bad of BAD_ENTRIES) {
    const f = nonSealedFile(t, bad), before = JSON.parse(readFileSync(f.file, "utf8")) as { entries: Record<string, string> };
    const store = createLazyFileSecretStore(f.home);
    store.delete("bad");
    const after = JSON.parse(readFileSync(f.file, "utf8")) as { entries: Record<string, string> };
    assert.deepEqual(Object.keys(after.entries), ["good"], "the bad entry is gone and nothing else was added");
    assert.equal(after.entries.good, before.entries.good, "the healthy entry's ciphertext is unchanged");
    const reopened = createLazyFileSecretStore(f.home);
    assert.equal(reopened.get("good"), "good-plaintext");
    reopened.put("empty", "");
    assert.equal(createLazyFileSecretStore(f.home).get("empty"), "", "a legal sealed envelope entry with empty plaintext still reads as the empty string");
  }
});

// RAC-2722 T-347: deleting a healthy entry while another bad entry stays would write the bad entry forward again, so it is refused.
test("RAC-2722 deleting a healthy entry while another bad entry stays is refused and the file stays as it was", t => {
  envBackend(t);
  for (const bad of BAD_ENTRIES) {
    const f = nonSealedFile(t, bad), before = readFileSync(f.file, "utf8");
    assert.throws(() => createLazyFileSecretStore(f.home).delete("good"), /secret not AES-GCM sealed/);
    assert.equal(readFileSync(f.file, "utf8"), before, "a refused delete leaves the secrets file byte for byte");
    assert.equal(createLazyFileSecretStore(f.home).get("good"), "good-plaintext");
  }
});

// N34-VS-02: the same real ciphertext is rejected by version alone; authentication and original bytes stay intact.
test("N34-VS-02 a complete current seal writes v1 and refuses the identical ciphertext marked v2", t => {
  envBackend(t);
  const home = mkdtempSync(join(tmpdir(), "molis-secret-envelope-version-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = createLazyFileSecretStore(home);
  store.put("sample", "isolated-test-value");
  const file = join(home, "feed", "secrets.json"), body = JSON.parse(readFileSync(file, "utf8"));
  const seal = JSON.parse(Buffer.from(body.entries.sample, "base64").toString("utf8"));
  assert.equal(seal.v, 1);
  assert.equal(store.get("sample"), "isolated-test-value");
  seal.v = 2;
  body.entries.sample = Buffer.from(JSON.stringify(seal)).toString("base64");
  writeFileSync(file, JSON.stringify(body));
  resetSecretStoreCache();
  const before = readFileSync(file);
  assert.throws(() => createLazyFileSecretStore(home).get("sample"), /secret not AES-GCM sealed/);
  assert.deepEqual(readFileSync(file), before);
});
