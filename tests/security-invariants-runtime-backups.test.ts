import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { link, lstat, mkdir, readFile, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import * as localHost from "@molis-ai/molis-work-app-local-host";
import { createLazyFileSecretStore, inspectSealedSecretsSnapshot, readExistingSecret } from "@molis-ai/molis-work-storage";
import { runtimeBackupFixture } from "./fixtures/runtime-config-backups.js";
import { assertRefusedPromptly, runFifoChild } from "./fixtures/runtime-backup-fifo.js";

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

test("S-12 RAC-104: an existing empty Runtime configuration survives restart without poisoning other secrets or later backups", async t => {
  const f = await runtimeBackupFixture(t), key = join(f.home, "feed", "secrets.key"), vault = join(f.home, "feed", "secrets.json");
  await writeFile(f.config, "");
  createLazyFileSecretStore(f.home).put("unrelated-owner", f.secret);
  const originalKey = await readFile(key), runtime = f.service(), plan = await runtime.prepare("codex", "connect");
  const connected = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
  assert.equal(connected.status, "connected", connected.message); assert.ok(connected.backup_path);
  assert.deepEqual(await reader()(f.home, "codex", plan.plan_id), { contents: "", mode: 0o640 });
  const restarted = spawnSync(process.execPath, ["--input-type=module", "-e",
    "import {readRuntimeConfigBackup} from '@molis-ai/molis-work-app-local-host';process.stdout.write(JSON.stringify(await readRuntimeConfigBackup(process.argv[1],'codex',process.argv[2])));",
    f.home, plan.plan_id], { encoding: "utf8", env: process.env });
  assert.equal(restarted.status, 0, restarted.stderr);
  const recovered = JSON.parse(restarted.stdout) as { contents: string; mode: number };
  assert.deepEqual(recovered, { contents: "", mode: 0o640 });
  const restored = join(f.userHome, "empty-original.toml");
  await writeFile(restored, recovered.contents, { mode: recovered.mode, flag: "wx" });
  assert.deepEqual(await readFile(restored), Buffer.alloc(0)); assert.equal((await stat(restored)).mode & 0o777, 0o640);
  assert.equal(readExistingSecret(f.home, "unrelated-owner"), f.secret);
  assert.equal(inspectSealedSecretsSnapshot(f.home, await readFile(vault, "utf8")).entries, 2);
  const configured = await readFile(f.config, "utf8"), remove = await runtime.prepare("codex", "remove");
  const removed = await runtime.confirm({ runtime_id: "codex", plan_id: remove.plan_id, decision: "confirmed" });
  assert.equal(removed.status, "removed", removed.message);
  assert.deepEqual(await reader()(f.home, "codex", remove.plan_id), { contents: configured, mode: 0o640 });
  assert.equal(readExistingSecret(f.home, "unrelated-owner"), f.secret);
  assert.equal(inspectSealedSecretsSnapshot(f.home, await readFile(vault, "utf8")).entries, 3);
  assert.deepEqual(await readFile(key), originalKey);
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
  for (const subject of ["backup", "vault"] as const) {
    const f = await runtimeBackupFixture(t), runtime = f.service(), plan = await runtime.prepare("codex", "connect");
    const result = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "connected", result.message);
    const target = subject === "backup" ? result.backup_path! : join(f.home, "feed", "secrets.json");
    await unlink(target);
    const fifo = spawnSync("mkfifo", [target], { encoding: "utf8" }); assert.equal(fifo.status, 0, fifo.stderr);
    assert.equal((await lstat(target)).isFIFO(), true);
    // Nothing ever opens the FIFO for writing: an owner that waited for a writer would never return.
    const read = await runFifoChild("owner", { home: f.home, plan: plan.plan_id, fifo: target });
    t.diagnostic(`${subject}: ${JSON.stringify({ ...read, stderrTail: undefined })}`);
    assertRefusedPromptly(read, subject === "backup" ? "installer.runtime_backup.invalid" : "installer.runtime_backup.key_unavailable");
  }
});

test("S-12 RAC-104: the same budget fails a read that waits on a FIFO, and a cancelled check stops only its own child", async t => {
  const f = await runtimeBackupFixture(t), fifo = join(f.directory, "no-writer.fifo");
  const made = spawnSync("mkfifo", [fifo], { encoding: "utf8" }); assert.equal(made.status, 0, made.stderr);
  const blocked = await runFifoChild("block", { home: f.home, plan: "none", fifo });
  t.diagnostic(`blocked: ${JSON.stringify({ ...blocked, stderrTail: undefined })}`);
  assert.equal(blocked.entered, true);
  assert.equal(blocked.timedOut, true, "a read waiting for a writer outlives the budget");
  assert.equal(blocked.refused, null);
  assert.equal(blocked.signal, "SIGKILL");
  assert.throws(() => assertRefusedPromptly(blocked, "installer.runtime_backup.invalid"), "the check a prompt refusal passes must fail a blocked read");
  const controller = new AbortController();
  const cancelled = await runFifoChild("block", { home: f.home, plan: "none", fifo }, { signal: controller.signal, onEntered: () => controller.abort() });
  t.diagnostic(`cancelled: ${JSON.stringify({ ...cancelled, stderrTail: undefined })}`);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.timedOut, false);
  assert.equal(cancelled.signal, "SIGKILL", "cancelling kills the blocked child and waits for its close");
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
