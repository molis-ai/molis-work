import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("test runner isolates inherited production credentials and never invokes Keychain", async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-runner-test-"));
  const home = join(root, "user-home"), bin = join(root, "bin"), probe = join(root, "probe.json");
  await mkdir(home); await mkdir(bin);
  await writeFile(join(home, "sentinel"), "unchanged");
  // A fake executable catches a regression without ever touching macOS Keychain.
  await writeFile(join(bin, "security"), `#!/bin/sh\ntouch '${join(root, "keychain-called")}'\nexit 1\n`, { mode: 0o700 });
  const fixture = join(root, "isolation.test.mjs");
  const storage = new URL("../packages/storage/dist/index.js", import.meta.url).href;
  await writeFile(fixture, `import { writeFileSync } from 'node:fs';
import { createFileSecretStore } from ${JSON.stringify(storage)};
const store=createFileSecretStore(); store.put('test:only','fixture credential');
writeFileSync(${JSON.stringify(probe)}, JSON.stringify({home:process.env.MOLIS_WORK_HOME, environment:process.env.NODE_ENV,
backend:store.backend().kind, encryptionKeyEmpty:process.env.MOLIS_WORK_ENCRYPTION_KEY==='', roundtrip:store.get('test:only')}));`);
  try {
    await promisify(execFile)(process.execPath, [resolve("scripts/run-tests.mjs"), fixture], {
      env: { ...process.env, NODE_ENV: "production", MOLIS_WORK_HOME: home, MOLIS_WORK_SECRET_BACKEND: "keychain",
        MOLIS_WORK_ENCRYPTION_KEY: "inherited-key-must-not-be-used", PATH: `${bin}:${process.env.PATH}` }, timeout: 30_000,
    });
    const result = JSON.parse(await readFile(probe, "utf8"));
    assert.notEqual(result.home, home);
    assert.equal(result.environment, "test"); assert.equal(result.backend, "aes-gcm-file");
    assert.equal(result.encryptionKeyEmpty, true); assert.equal(result.roundtrip, "fixture credential");
    assert.equal(await readFile(join(home, "sentinel"), "utf8"), "unchanged");
    await assert.rejects(access(join(root, "keychain-called")));
    await assert.rejects(access(join(home, "feed")));
    await assert.rejects(access(result.home), "runner cleans up its own temporary Home");
  } finally { await rm(root, { recursive: true, force: true }); }
});
