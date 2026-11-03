import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { createFileSecretStore, openExistingHomePayload, readExistingSecret, resetSecretStoreCache, runWithMolisWorkHome, sealExistingHomePayload } from "@molis-ai/molis-work-storage";

function fixture(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "home-payload-purpose-")));
  const previous = { backend: process.env.MOLIS_WORK_SECRET_BACKEND, key: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = "";
  resetSecretStoreCache();
  t.after(() => {
    for (const [name, value] of [["MOLIS_WORK_SECRET_BACKEND", previous.backend], ["MOLIS_WORK_ENCRYPTION_KEY", previous.key]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetSecretStoreCache(); rmSync(home, { recursive: true, force: true });
  });
  runWithMolisWorkHome(home, () => createFileSecretStore().put("credential", "ordinary credential"));
  const vaultPath = join(home, "feed", "secrets.json"), keyPath = join(home, "feed", "secrets.key");
  const vault = () => JSON.parse(readFileSync(vaultPath, "utf8")) as { version: number; backend: string; entries: Record<string, string> };
  const get = () => runWithMolisWorkHome(home, () => createFileSecretStore().get("credential"));
  return { home, vaultPath, keyPath, vault, get, binding: JSON.stringify({ owner: "connector-private-state", installation_id: "fixture-install", source_sha256: "fixed-source" }) };
}

test("S-12 RAC-104-B2b-05: a Home payload moved into the vault cannot be read as a credential", t => {
  const f = fixture(t), payload = sealExistingHomePayload(f.home, f.binding, "private CLI state");
  const changed = f.vault(); changed.entries.credential = payload.ciphertext;
  writeFileSync(f.vaultPath, JSON.stringify(changed)); resetSecretStoreCache();
  const before = readFileSync(f.vaultPath), originalKey = readFileSync(f.keyPath);
  assert.equal(f.get(), null, "the ordinary credential reader must not expose the Home envelope");
  assert.throws(() => readExistingSecret(f.home, "credential"), { code: "storage.secrets_snapshot.integrity_failed" });
  assert.deepEqual(readFileSync(f.vaultPath), before); assert.deepEqual(readFileSync(f.keyPath), originalKey);
});

test("S-12 RAC-104-B2b-05: a vault entry with a valid Home envelope cannot be reused as a Home payload", t => {
  const f = fixture(t), payload = sealExistingHomePayload(f.home, f.binding, "original owner contents");
  const envelope = JSON.stringify({ schema_version: 1, home: f.home, binding: f.binding, contents: "chosen owner contents" });
  runWithMolisWorkHome(f.home, () => createFileSecretStore().put("credential", envelope));
  const swapped = { ...payload, ciphertext: f.vault().entries.credential! }, before = readFileSync(f.vaultPath);
  assert.equal(f.get(), envelope, "the source entry is a legitimate credential in its own purpose");
  assert.throws(() => openExistingHomePayload(f.home, f.binding, swapped), { code: "storage.secrets_snapshot.integrity_failed" });
  assert.deepEqual(readFileSync(f.vaultPath), before);
});

test("S-12 RAC-104-B2b-05: current vault ciphertext and legitimate Home payloads still open in their original purposes", t => {
  const f = fixture(t), key = Buffer.from(readFileSync(f.keyPath, "utf8").trim(), "base64");
  // Produce the existing v2 vault format independently, without any payload AAD.
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update("existing current-format credential", "utf8"), cipher.final()]);
  const current = Buffer.from(JSON.stringify({ v: 2, alg: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") })).toString("base64");
  const vault = f.vault(); vault.entries.credential = current; writeFileSync(f.vaultPath, JSON.stringify(vault)); resetSecretStoreCache();
  assert.equal(f.get(), "existing current-format credential");
  assert.equal(readExistingSecret(f.home, "credential"), "existing current-format credential");
  const before = readFileSync(f.vaultPath), originalKey = readFileSync(f.keyPath), contents = "\ufeffopaque\0CLI contents";
  const payload = sealExistingHomePayload(f.home, f.binding, contents);
  assert.equal(openExistingHomePayload(f.home, f.binding, payload), contents);
  const empty = sealExistingHomePayload(f.home, f.binding, "");
  assert.equal(openExistingHomePayload(f.home, f.binding, empty), "");
  assert.throws(() => openExistingHomePayload(f.home, f.binding + "changed", payload), { code: "storage.secrets_snapshot.integrity_failed" });
  assert.deepEqual(readFileSync(f.vaultPath), before); assert.deepEqual(readFileSync(f.keyPath), originalKey);
});
