import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSecretStore, createLazyFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

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
