import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { type TestContext } from "node:test";
import { readRuntimeConfigBackup } from "@molis-ai/molis-work-app-local-host";
import { createLazyFileSecretStore, readExistingSecret } from "@molis-ai/molis-work-storage";
import { runtimeBackupFixture } from "./fixtures/runtime-config-backups.js";

const tool = fileURLToPath(new URL("./fixtures/runtime-config-backup-maintenance.mjs", import.meta.url));
const markerRelative = join("runtime-config-backups", ".maintenance.json");
const run = (mode: string, home: string, backupDirectory?: string) => spawnSync(process.execPath,
  [tool, mode, "--home", home, "--json", ...(backupDirectory ? ["--backup", backupDirectory] : [])], { encoding: "utf8", env: process.env });

function files(directory: string) {
  return Object.fromEntries(readdirSync(directory, { recursive: true }).map(String).sort().map(name => {
    const file = join(directory, name), stat = lstatSync(file);
    return [name, { bytes: stat.isFile() ? readFileSync(file) : null, mode: stat.mode, modified: stat.mtimeMs }];
  }));
}

async function source(t: TestContext) {
  const f = await runtimeBackupFixture(t), runtimeDirectory = join(f.home, "runtime-config-backups", "codex");
  mkdirSync(runtimeDirectory, { recursive: true });
  const ids = [randomUUID(), randomUUID()].sort(), originals = ids.map((id, index) => ({ id, contents: `# original ${index}\n` + f.contents, mode: index ? 0o600 : 0o640 }));
  for (const original of originals) { const file = join(runtimeDirectory, original.id + ".bak"); writeFileSync(file, original.contents); chmodSync(file, original.mode); }
  const unrelated = randomBytes(24).toString("hex"); createLazyFileSecretStore(f.home).put("unrelated-owner", unrelated);
  return { ...f, originals, runtimeDirectory, unrelated, key: readFileSync(join(f.home, "feed", "secrets.key")) };
}

function restoreOriginals(home: string, marker: { backup: string; pid: number; vault_existed: boolean }) {
  for (const [relative, value] of Object.entries(files(marker.backup))) if (value.bytes !== null) {
    const file = join(home, relative); mkdirSync(join(file, ".."), { recursive: true }); copyFileSync(join(marker.backup, relative), file); chmodSync(file, value.mode & 0o777);
  }
  if (!marker.vault_existed) rmSync(join(home, "feed", "secrets.json"), { force: true });
  // atomicWriteFileSync names its private files with its own PID; remove only this stopped maintenance's leftovers.
  const temporary = new RegExp("^\\..+\\." + marker.pid + "\\.[0-9]+\\.tmp$");
  for (const name of readdirSync(home, { recursive: true }).map(String)) if (temporary.test(name.split("/").at(-1)!)) unlinkSync(join(home, name));
  unlinkSync(join(home, markerRelative));
}

test("RAC-104: legacy backup list writes nothing; offline sealing retains exact originals without exporting a master key", async t => {
  const f = await source(t), before = files(f.home), backup = join(f.directory, "originals");
  const listed = run("list", f.home); assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), { files: 2, plaintext: 2, referenced: 0, changed: false });
  assert.deepEqual(files(f.home), before); assert.equal(listed.stdout.includes(f.secret), false);
  const outcome = run("apply", f.home, backup); assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(JSON.parse(outcome.stdout).changed, true); assert.equal(existsSync(join(f.home, markerRelative)), false);
  for (const original of f.originals) {
    assert.deepEqual(await readRuntimeConfigBackup(f.home, "codex", original.id), { contents: original.contents, mode: original.mode });
    assert.equal(readFileSync(join(backup, "runtime-config-backups", "codex", original.id + ".bak"), "utf8"), original.contents);
  }
  assert.equal(readExistingSecret(f.home, "unrelated-owner"), f.unrelated);
  assert.deepEqual(readFileSync(join(f.home, "feed", "secrets.key")), f.key);
  for (const value of Object.values(files(f.home))) if (value.bytes) assert.equal(value.bytes.includes(Buffer.from(f.secret)), false);
  for (const [name, value] of Object.entries(files(backup))) {
    assert.equal(name.endsWith(".key"), false);
    if (value.bytes) assert.equal(value.bytes.includes(f.key), false);
  }
  const stable = files(f.home), again = run("apply", f.home, backup);
  assert.equal(again.status, 0, again.stderr); assert.equal(JSON.parse(again.stdout).changed, false); assert.deepEqual(files(f.home), stable);
});

test("RAC-104: maintenance rejects unsafe destinations, invalid text, vault versions and links before changing Home", async t => {
  for (const fault of ["destination", "encoding", "vault-version", "link"]) {
    const f = await source(t), first = join(f.runtimeDirectory, f.originals[0]!.id + ".bak");
    if (fault === "encoding") writeFileSync(first, Buffer.from([0xff, 0xfe]));
    if (fault === "vault-version") {
      const file = join(f.home, "feed", "secrets.json"), data = JSON.parse(readFileSync(file, "utf8")); data.version = 3; writeFileSync(file, JSON.stringify(data));
    }
    if (fault === "link") { unlinkSync(first); symlinkSync(f.config, first); }
    const before = files(f.home), result = run("apply", f.home, fault === "destination" ? join(f.home, "bad-originals") : join(f.directory, "originals"));
    assert.equal(result.status, 1); assert.deepEqual(files(f.home), before);
    assert.equal(result.stdout.includes(f.secret) || result.stderr.includes(f.secret), false);
  }
});

test("RAC-104: a vault appearing after preflight is preserved and refuses maintenance before its first publication", async t => {
  const f = await source(t), vault = join(f.home, "feed", "secrets.json"), contents = readFileSync(vault), backup = join(realpathSync(f.directory), "originals");
  unlinkSync(vault);
  const script = `import fs from 'node:fs';const {maintainRuntimeConfigBackups}=await import(${JSON.stringify(pathToFileURL(tool).href)});const mkdir=fs.mkdirSync;
    fs.mkdirSync=(directory,...args)=>{if(directory===${JSON.stringify(backup)})fs.writeFileSync(${JSON.stringify(vault)},Buffer.from(${JSON.stringify(contents.toString("base64"))},'base64'),{mode:0o600});return mkdir(directory,...args);};
    await maintainRuntimeConfigBackups('apply',{home:${JSON.stringify(f.home)},backupDirectory:${JSON.stringify(backup)}});`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: process.env });
  assert.equal(result.status, 1); assert.match(result.stderr, /Credential vault changed/);
  assert.equal(existsSync(join(f.home, markerRelative)), false);
  assert.deepEqual(readFileSync(vault), contents);
  assert.deepEqual(readFileSync(join(f.home, "feed", "secrets.key")), f.key);
  for (const original of f.originals) assert.equal(readFileSync(join(f.runtimeDirectory, original.id + ".bak"), "utf8"), original.contents);
});

test("RAC-104: failed publication and process death retain recoverable originals and block Runtime backup access", async t => {
  for (const crash of [false, true]) {
    const f = await source(t), backup = join(f.directory, "originals"), vaultBefore = readFileSync(join(f.home, "feed", "secrets.json"));
    const target = join(realpathSync(f.runtimeDirectory), f.originals[1]!.id + ".bak");
    const script = `import fs from 'node:fs';const {maintainRuntimeConfigBackups}=await import(${JSON.stringify(pathToFileURL(tool).href)});const rename=fs.renameSync;
      fs.renameSync=(from,to)=>{if(to===${JSON.stringify(target)}){${crash ? "process.kill(process.pid,'SIGKILL');" : "throw new Error('reference publication denied');"}}return rename(from,to);};
      await maintainRuntimeConfigBackups('apply',{home:${JSON.stringify(f.home)},backupDirectory:${JSON.stringify(backup)}});`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: process.env });
    if (crash) assert.equal(result.signal, "SIGKILL"); else { assert.equal(result.status, 1); assert.match(result.stderr, /maintenance is incomplete/); }
    const markerPath = join(f.home, markerRelative); assert.ok(existsSync(markerPath));
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { backup: string; pid: number; vault_existed: boolean };
    assert.equal(marker.backup, realpathSync(backup));
    await assert.rejects(readRuntimeConfigBackup(f.home, "codex", f.originals[0]!.id), { code: "installer.runtime_backup.maintenance_pending" });
    assert.deepEqual(readFileSync(join(backup, "feed", "secrets.json")), vaultBefore);
    for (const original of f.originals) assert.equal(readFileSync(join(backup, "runtime-config-backups", "codex", original.id + ".bak"), "utf8"), original.contents);
    assert.equal(readFileSync(target, "utf8"), f.originals[1]!.contents);
    restoreOriginals(f.home, marker);
    assert.equal(existsSync(markerPath), false);
    assert.deepEqual(readFileSync(join(f.home, "feed", "secrets.key")), f.key);
    const reapplied = run("apply", f.home, join(f.directory, "recovered-originals")); assert.equal(reapplied.status, 0, reapplied.stderr);
    for (const original of f.originals) assert.equal((await readRuntimeConfigBackup(f.home, "codex", original.id)).contents, original.contents);
    for (const value of Object.values(files(f.home))) if (value.bytes) assert.equal(value.bytes.includes(Buffer.from(f.secret)), false);
  }
});
