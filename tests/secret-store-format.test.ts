import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";

// Only the current AES-GCM file (format 2) is read. An older secrets file, such as the v0.3 flat map of reversible
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
  for (const older of [{ "model:text:api_key": reversible }, { version: 1, backend: "aes-gcm-file", entries: { "model:text:api_key": reversible } }]) {
    writeFileSync(file, JSON.stringify(older));
    for (const use of [(store: SecretStore) => store.get("model:text:api_key"), (store: SecretStore) => store.put("new", "value")]) {
      resetSecretStoreCache();
      assert.throws(() => runWithMolisWorkHome(home, () => use(createFileSecretStore())), /invalid structure|not supported/);
    }
    assert.equal(readFileSync(file, "utf8"), JSON.stringify(older));
  }
  // The current format still works in the same Home.
  writeFileSync(file, JSON.stringify({ version: 2, backend: "env-key+aes-gcm", entries: {} }));
  resetSecretStoreCache();
  const store = runWithMolisWorkHome(home, () => createFileSecretStore());
  runWithMolisWorkHome(home, () => store.put("new", "value"));
  assert.equal(runWithMolisWorkHome(home, () => store.get("new")), "value");
});
