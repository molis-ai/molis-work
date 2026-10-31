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

// RAC-2721 T-347 / clean-Home batch 6: one secrets file entry that is a string but not a sealV2 envelope is refused by the
// snapshot precheck (#1633, RAC-2377); the store must not answer that same entry differently — as "missing" on read, or by
// keeping it quietly when another key is written. The snapshot, a read and a write agree on the one bad entry.
test("RAC-2721 the snapshot, a read and a write meet a non-sealV2 secrets entry the same way", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-secret-bad-entry-"));
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
  createLazyFileSecretStore(home).put("good", "good-plaintext");
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  // A legal JSON string, and not a sealV2 envelope: exactly what a truncated hand edit leaves behind.
  const bad = Buffer.from(JSON.stringify({ v: 1, alg: "aes-256-gcm", ct: "not-sealV2" })).toString("base64");
  parsed.entries.bad = bad;
  writeFileSync(file, JSON.stringify(parsed));
  resetSecretStoreCache();
  // (a) The snapshot precheck already refuses it; kept as the regression pin of the clean-Home batch.
  assert.throws(() => inspectSealedSecretsSnapshot(home, readFileSync(file, "utf8")), { code: "storage.secrets_snapshot.integrity_failed" });
  // (b) Reading the bad entry is not the same as the entry being missing.
  const store = createLazyFileSecretStore(home);
  assert.throws(() => store.get("bad"), "a bad entry is refused, not reported as missing");
  // (c) Writing another key must not keep the bad entry quietly: the write is refused and the file is left as it was.
  const before = readFileSync(file, "utf8");
  assert.throws(() => store.put("another", "another-value"), "a write meets the same bad entry the same way");
  assert.equal(readFileSync(file, "utf8"), before, "a refused write leaves the secrets file byte for byte");
  // The healthy entries still read.
  assert.equal(createLazyFileSecretStore(home).get("good"), "good-plaintext");
});

/** A Home whose current-format secrets file holds one healthy entry and one legal string that is not a sealV2 envelope. */
function nonSealV2File(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-secret-bad-entry-"));
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
  createLazyFileSecretStore(home).put("good", "good-plaintext");
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  parsed.entries.bad = Buffer.from(JSON.stringify({ v: 1, alg: "aes-256-gcm", ct: "not-sealV2" })).toString("base64");
  writeFileSync(file, JSON.stringify(parsed));
  resetSecretStoreCache();
  return { home, file };
}

// RAC-2722 T-347 coordinator answer: the read refuses a non-sealV2 entry, and every write that would carry the file forward
// (put, createIfAbsent, deleteIfPresent) refuses it too, leaving the file byte for byte.
test("RAC-2722 a bad entry is refused by a read and by put, createIfAbsent and deleteIfPresent, and the file stays as it was", t => {
  const f = nonSealV2File(t), store = createLazyFileSecretStore(f.home), before = readFileSync(f.file, "utf8");
  assert.throws(() => store.get("bad"), /secret not AES-GCM sealed/, "a read refuses the bad entry");
  for (const write of [() => store.put("another", "another-value"), () => store.createIfAbsent("another", "another-value"), () => store.deleteIfPresent("good")]) {
    assert.throws(write, /secret not AES-GCM sealed/);
    assert.equal(readFileSync(f.file, "utf8"), before, "a refused write leaves the secrets file byte for byte");
  }
  assert.equal(createLazyFileSecretStore(f.home).get("good"), "good-plaintext", "healthy entries still read");
});

// RAC-2722 T-347: deleting the bad entry itself is the one way a vault with one gets clean again; the other entries' ciphertext
// is left exactly as it was.
test("RAC-2722 deleting the bad entry itself is allowed and keeps the other entries' bytes", t => {
  const f = nonSealV2File(t), before = JSON.parse(readFileSync(f.file, "utf8")) as { entries: Record<string, string> };
  const store = createLazyFileSecretStore(f.home);
  store.delete("bad");
  const after = JSON.parse(readFileSync(f.file, "utf8")) as { entries: Record<string, string> };
  assert.deepEqual(Object.keys(after.entries), ["good"], "the bad entry is gone and nothing else was added");
  assert.equal(after.entries.good, before.entries.good, "the healthy entry's ciphertext is unchanged");
  assert.equal(createLazyFileSecretStore(f.home).get("good"), "good-plaintext");
});

// RAC-2722 T-347: deleting a healthy entry while another bad entry stays would write the bad entry forward again, so it is refused.
test("RAC-2722 deleting a healthy entry while another bad entry stays is refused and the file stays as it was", t => {
  const f = nonSealV2File(t), before = readFileSync(f.file, "utf8");
  assert.throws(() => createLazyFileSecretStore(f.home).delete("good"), /secret not AES-GCM sealed/);
  assert.equal(readFileSync(f.file, "utf8"), before, "a refused delete leaves the secrets file byte for byte");
  assert.equal(createLazyFileSecretStore(f.home).get("good"), "good-plaintext");
});
