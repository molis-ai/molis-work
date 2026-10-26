import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSecretStore, createLazyFileSecretStore, openExistingHomePayload, resetSecretStoreCache, runWithMolisWorkHome, sealExistingHomePayload } from "@molis-ai/molis-work-storage";

for (const fault of ["missing", "invalid"] as const) {
  test(`W1-18-SECRET-KEY-01 existing ciphertext refuses a ${fault} file key without changing credentials, and recovers with its original key`, t => {
    const home = mkdtempSync(join(tmpdir(), "molis-file-key-"));
    const old = { backend: process.env.MOLIS_WORK_SECRET_BACKEND, key: process.env.MOLIS_WORK_ENCRYPTION_KEY };
    t.after(() => {
      for (const [name, value] of [["MOLIS_WORK_SECRET_BACKEND", old.backend], ["MOLIS_WORK_ENCRYPTION_KEY", old.key]] as const) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
      resetSecretStoreCache();
      rmSync(home, { recursive: true, force: true });
    });
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    delete process.env.MOLIS_WORK_ENCRYPTION_KEY;
    resetSecretStoreCache();
    const keyFile = join(home, "feed", "secrets.key"), savedKey = join(home, "saved-test-key");
    const secretsFile = join(home, "feed", "secrets.json");
    runWithMolisWorkHome(home, () => {
      const store = createFileSecretStore();
      assert.equal(store.backend().kind, "aes-gcm-file");
      assert.equal(existsSync(keyFile), true, "a fresh Home may create its first key");
      store.put("first", "value-one");
      store.put("second", "value-two");
    });
    const sealed = readFileSync(secretsFile), originalKey = readFileSync(keyFile);
    resetSecretStoreCache();
    renameSync(keyFile, savedKey);
    if (fault === "invalid") writeFileSync(keyFile, "not-a-32-byte-key", { mode: 0o600 });
    const store = createLazyFileSecretStore(home);
    for (const operation of [
      () => store.get("first"), () => store.put("third", "value-three"),
      () => store.createIfAbsent("fourth", "value-four"), () => store.backend(),
    ]) {
      assert.throws(operation, /install key file is unavailable or invalid; refusing to rotate existing secrets/);
      // S-12 RAC-104-B2b-07: retain the refusal and point to this backend's original key and recovery boundary.
      assert.throws(operation, /Restore this Home's original feed\/secrets\.key.*HOME-DATA\.md/u);
      assert.deepEqual(readFileSync(secretsFile), sealed, "no ciphertext or backend was rewritten");
      assert.deepEqual(readFileSync(savedKey), originalKey);
      if (fault === "missing") assert.equal(existsSync(keyFile), false, "no replacement key was created");
      else assert.equal(readFileSync(keyFile, "utf8"), "not-a-32-byte-key", "the invalid key was not replaced");
    }
    if (existsSync(keyFile)) unlinkSync(keyFile);
    renameSync(savedKey, keyFile);
    resetSecretStoreCache();
    assert.equal(store.get("first"), "value-one");
    assert.equal(store.get("second"), "value-two");
    store.put("third", "value-three");
    assert.equal(store.createIfAbsent("fourth", "value-four"), true);
    assert.equal(store.get("third"), "value-three");
    assert.equal(store.get("fourth"), "value-four");
    assert.equal(store.get("first"), "value-one");
    assert.deepEqual(readFileSync(keyFile), originalKey);
  });
}

test("S-12 RAC-104-B2b-07: only the original environment key restores an empty vault's sealed payload", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-env-key-recovery-"));
  const old = { backend: process.env.MOLIS_WORK_SECRET_BACKEND, key: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  t.after(() => {
    for (const [name, value] of [["MOLIS_WORK_SECRET_BACKEND", old.backend], ["MOLIS_WORK_ENCRYPTION_KEY", old.key]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetSecretStoreCache(); rmSync(home, { recursive: true, force: true });
  });
  const original = randomBytes(32).toString("hex");
  process.env.MOLIS_WORK_SECRET_BACKEND = "env"; process.env.MOLIS_WORK_ENCRYPTION_KEY = original;
  resetSecretStoreCache();
  runWithMolisWorkHome(home, () => { const store = createFileSecretStore(); store.put("temporary", "temporary"); store.delete("temporary"); });
  const payload = sealExistingHomePayload(home, "original-owner", "original private state"), file = join(home, "feed", "secrets.json"), before = readFileSync(file);
  process.env.MOLIS_WORK_SECRET_BACKEND = "file"; delete process.env.MOLIS_WORK_ENCRYPTION_KEY; resetSecretStoreCache();
  assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Restore the original MOLIS_WORK_ENCRYPTION_KEY.*HOME-DATA\.md/u);
  assert.throws(() => openExistingHomePayload(home, "original-owner", payload), { code: "storage.secrets_snapshot.key_unavailable" });
  process.env.MOLIS_WORK_ENCRYPTION_KEY = randomBytes(32).toString("hex"); resetSecretStoreCache();
  assert.throws(() => openExistingHomePayload(home, "original-owner", payload), { code: "storage.secrets_snapshot.integrity_failed" });
  process.env.MOLIS_WORK_ENCRYPTION_KEY = original; resetSecretStoreCache();
  assert.equal(runWithMolisWorkHome(home, () => createFileSecretStore().backend().kind), "env-key+aes-gcm");
  assert.equal(openExistingHomePayload(home, "original-owner", payload), "original private state");
  assert.deepEqual(readFileSync(file), before); assert.equal(existsSync(join(home, "feed", "secrets.key")), false);
});
