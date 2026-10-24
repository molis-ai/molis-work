import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { link, mkdir, readFile, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import * as localHost from "@molis-ai/molis-work-app-local-host";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { runtimeBackupFixture } from "./fixtures/runtime-config-backups.js";

function reader() {
  const read = Reflect.get(localHost, "readRuntimeConfigBackup");
  assert.equal(typeof read, "function", "original configurations are read through their public owner");
  return read as (home: string, runtime: string, plan: string) => Promise<{ contents: string; mode: number }>;
}

test("RAC-104: a real Runtime integration retains only a sealed reference and recovers the exact original after restart", async t => {
  const f = await runtimeBackupFixture(t), runtime = f.service(), plan = await runtime.prepare("codex", "connect");
  const result = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
  assert.equal(result.status, "connected", result.message); assert.ok(result.backup_path);
  const descriptor = await readFile(result.backup_path!, "utf8");
  assert.equal(descriptor.includes(f.secret), false, "the Home backup is not a plaintext credential-bearing copy");
  assert.equal((await readFile(join(f.home, "feed", "secrets.json"), "utf8")).includes(f.secret), false);
  assert.equal(JSON.stringify(result).includes(f.secret), false);
  const first = await reader()(f.home, "codex", plan.plan_id);
  assert.deepEqual(first, { contents: f.contents, mode: 0o640 });
  const restarted = spawnSync(process.execPath, ["--input-type=module", "-e",
    "import {readRuntimeConfigBackup} from '@molis-ai/molis-work-app-local-host';process.stdout.write(JSON.stringify(await readRuntimeConfigBackup(process.argv[1],'codex',process.argv[2])));",
    f.home, plan.plan_id], { encoding: "utf8", env: process.env });
  assert.equal(restarted.status, 0, restarted.stderr); assert.deepEqual(JSON.parse(restarted.stdout), first);
  assert.equal((await f.service().detect("codex")).connection_state, "connected");
  assert.deepEqual(await reader()(f.home, "codex", plan.plan_id), first);
  // A caller can restore the original bytes and permissions from the owner result, without exporting the master key.
  const restored = join(f.userHome, "recovered.toml");
  await writeFile(restored, first.contents, { mode: first.mode });
  assert.equal(await readFile(restored, "utf8"), f.contents);
  assert.equal((await stat(restored)).mode & 0o777, 0o640);
});

test("RAC-104: a backup refuses a missing original key and a reference to a different backup", async t => {
  const f = await runtimeBackupFixture(t), runtime = f.service(), plan = await runtime.prepare("codex", "connect");
  const result = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
  assert.equal(result.status, "connected", result.message);
  const read = reader(), descriptor = JSON.parse(await readFile(result.backup_path!, "utf8"));
  await writeFile(result.backup_path!, JSON.stringify({ ...descriptor, auth_ref: "another-owned-secret" }));
  await assert.rejects(read(f.home, "codex", plan.plan_id), { code: "installer.runtime_backup.invalid" });
  await writeFile(result.backup_path!, JSON.stringify(descriptor));
  const key = join(f.home, "feed", "secrets.key"), originalKey = await readFile(key);
  await unlink(key);
  await assert.rejects(read(f.home, "codex", plan.plan_id), { code: "installer.runtime_backup.key_unavailable" });
  await assert.rejects(readFile(key), { code: "ENOENT" });
  await writeFile(key, originalKey, { mode: 0o600 });
  assert.equal((await read(f.home, "codex", plan.plan_id)).contents, f.contents);
});

test("S-12 RAC-104: linked backup or vault files cannot redirect an explicit owner read", async t => {
  for (const fault of ["backup-symlink", "backup-hardlink", "vault-symlink", "vault-hardlink"]) {
    const f = await runtimeBackupFixture(t), runtime = f.service(), plan = await runtime.prepare("codex", "connect");
    const result = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "connected", result.message);
    const target = fault.startsWith("backup") ? result.backup_path! : join(f.home, "feed", "secrets.json");
    const original = await readFile(target), configured = await readFile(f.config);
    if (fault.endsWith("symlink")) { await rename(target, target + ".original"); await symlink(target + ".original", target); }
    else await link(target, target + ".extra");
    await assert.rejects(reader()(f.home, "codex", plan.plan_id), { code: fault.startsWith("backup") ? "installer.runtime_backup.invalid" : "installer.runtime_backup.key_unavailable" });
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual(await readFile(f.config), configured);
  }
});

test("S-12 RAC-104: special backup and vault files are refused without blocking the owner", async t => {
  for (const subject of ["backup", "vault"]) {
    const f = await runtimeBackupFixture(t), runtime = f.service(), plan = await runtime.prepare("codex", "connect");
    const result = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "connected", result.message);
    const target = subject === "backup" ? result.backup_path! : join(f.home, "feed", "secrets.json");
    await unlink(target);
    const fifo = spawnSync("mkfifo", [target], { encoding: "utf8" }); assert.equal(fifo.status, 0, fifo.stderr);
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      "import {readRuntimeConfigBackup} from '@molis-ai/molis-work-app-local-host';try{await readRuntimeConfigBackup(process.argv[1],'codex',process.argv[2]);process.exitCode=2;}catch(error){if(error.code!==process.argv[3])throw error;}",
      f.home, plan.plan_id, subject === "backup" ? "installer.runtime_backup.invalid" : "installer.runtime_backup.key_unavailable"],
      { encoding: "utf8", env: process.env, timeout: 2500 });
    assert.equal(child.error, undefined, "a special file must be rejected instead of waiting for a writer");
    assert.equal(child.status, 0, child.stderr);
  }
});

test("S-12 RAC-104: a missing original key or unfinished maintenance refuses capture before changing Runtime configuration", async t => {
  for (const fault of ["key", "maintenance"]) {
    const f = await runtimeBackupFixture(t), runtime = f.service(), plan = await runtime.prepare("codex", "connect");
    if (fault === "key") {
      createLazyFileSecretStore(f.home).put("other-owner", f.secret);
      await unlink(join(f.home, "feed", "secrets.key"));
    } else {
      await mkdir(join(f.home, "runtime-config-backups"), { recursive: true });
      await writeFile(join(f.home, "runtime-config-backups", ".maintenance.json"), "{}");
    }
    const result = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "rolled_back");
    assert.equal(await readFile(f.config, "utf8"), f.contents);
    assert.equal(JSON.stringify(result).includes(f.secret), false);
    await assert.rejects(readFile(plan.backup_path!), { code: "ENOENT" });
    if (fault === "key") await assert.rejects(readFile(join(f.home, "feed", "secrets.key")), { code: "ENOENT" });
  }
});
