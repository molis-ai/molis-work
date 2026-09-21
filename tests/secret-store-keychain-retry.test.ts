import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// All Keychain calls resolve to this test executable. PATH contains no system
// directories, so these tests cannot reach the user's real `security` program.
function withKeychainFixture(run: (fixture: { home: string; root: string; calls: () => string[]; allow: () => void }) => void, mode: string) {
  const root = mkdtempSync(join(tmpdir(), "molis-keychain-retry-"));
  const home = join(root, "home"), bin = join(root, "bin"), calls = join(root, "calls");
  const old = { PATH: process.env.PATH, MOLIS_WORK_SECRET_BACKEND: process.env.MOLIS_WORK_SECRET_BACKEND,
    MOLIS_WORK_ENCRYPTION_KEY: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  const fixtureKey = Buffer.alloc(32, 19).toString("base64");
  const installFake = (behavior: string) => writeFileSync(join(bin, "security"),
    `#!/bin/sh\nprintf '%s\\n' "$1" >> '${calls}'\n${behavior}\n`, { mode: 0o700 });
  mkdirSync(bin);
  try {
    process.env.PATH = bin;
    process.env.MOLIS_WORK_SECRET_BACKEND = "env";
    process.env.MOLIS_WORK_ENCRYPTION_KEY = fixtureKey;
    resetSecretStoreCache();
    runWithMolisWorkHome(home, () => createFileSecretStore().put("fixture", "original credential"));
    const file = join(home, "feed", "secrets.json");
    const persisted = JSON.parse(readFileSync(file, "utf8"));
    persisted.backend = "keychain+aes-gcm";
    writeFileSync(file, JSON.stringify(persisted));
    resetSecretStoreCache();
    process.env.MOLIS_WORK_ENCRYPTION_KEY = "";
    process.env.MOLIS_WORK_SECRET_BACKEND = "keychain";
    installFake(mode);
    run({ root, home, calls: () => existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [],
      allow: () => installFake(`printf '%s\\n' '${fixtureKey}'`) });
  } finally {
    resetSecretStoreCache();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [reason, behavior] of [
  ["denied", "exit 36"],
  ["timed out", "exec /bin/sleep 10"],
  ["invalid key", "printf '%s\\n' 'not-a-master-key'"],
] as const) {
  test(`Keychain ${reason} stops repeated access without modifying credentials and recovers in a fresh process`,
    { skip: process.platform !== "darwin" }, () => withKeychainFixture(({ home, calls, allow }) => {
      const file = join(home, "feed", "secrets.json"), before = readFileSync(file);
      for (let i = 0; i < 8; i++) {
        assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Automatic retries are stopped.*restart Molis Work/u);
      }
      assert.deepEqual(calls(), ["find-generic-password"]);
      assert.deepEqual(readFileSync(file), before);
      assert.equal(existsSync(join(home, "feed", "secrets.key")), false);
      allow();
      assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Automatic retries are stopped/u,
        "even later requests do not silently reopen an authorization dialog");
      assert.equal(calls().length, 1);
      const storage = new URL("../packages/storage/dist/index.js", import.meta.url).href;
      const output = execFileSync(process.execPath, ["--input-type=module", "-e",
        `import { createFileSecretStore, runWithMolisWorkHome } from ${JSON.stringify(storage)};
         const store = runWithMolisWorkHome(${JSON.stringify(home)}, createFileSecretStore);
         console.log(JSON.stringify({backend:store.backend().kind, readable:store.get('fixture') === 'original credential'}));`],
      { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
      assert.deepEqual(JSON.parse(output), { backend: "keychain+aes-gcm", readable: true });
      assert.deepEqual(calls(), ["find-generic-password", "find-generic-password"]);
      assert.deepEqual(readFileSync(file), before);
    }, behavior));
}

test("Keychain failure does not block another Home or cache ordinary environment-key failures", { skip: process.platform !== "darwin" }, () => {
  withKeychainFixture(({ root, home, calls }) => {
    assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Keychain/u);
    const otherHome = join(root, "other-home");
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    const store = runWithMolisWorkHome(otherHome, createFileSecretStore);
    store.put("other", "other credential");
    assert.equal(store.get("other"), "other credential");
    assert.equal(store.backend().kind, "aes-gcm-file");
    assert.deepEqual(calls(), ["find-generic-password"]);
    const envHome = join(root, "env-home"), key = Buffer.alloc(32, 27).toString("base64");
    process.env.MOLIS_WORK_ENCRYPTION_KEY = key;
    runWithMolisWorkHome(envHome, createFileSecretStore).put("env", "env credential");
    resetSecretStoreCache();
    process.env.MOLIS_WORK_ENCRYPTION_KEY = "";
    assert.throws(() => runWithMolisWorkHome(envHome, createFileSecretStore), /encryption key is unavailable/u);
    process.env.MOLIS_WORK_ENCRYPTION_KEY = key;
    assert.equal(runWithMolisWorkHome(envHome, createFileSecretStore).get("env"), "env credential");
    assert.deepEqual(calls(), ["find-generic-password"]);
  }, "exit 36");
});
