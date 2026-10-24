#!/usr/bin/env node
// RAC-104. One-time offline conversion; never a runtime compatibility reader. Actual Home needs its own approved window.
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { SUPPORTED_RUNTIME_IDS } from "@molis-ai/molis-work-contracts/platform/app-host";
import { readRuntimeConfigBackup, sealRuntimeConfigBackup, RUNTIME_CONFIG_BACKUP_OWNER } from "@molis-ai/molis-work-app-local-host";
import { atomicWriteFileSync, inspectSealedSecretsSnapshot, readSealedSecretSnapshotEntry } from "@molis-ai/molis-work-storage";

const present = file => { try { return fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const inside = (root, file) => { const relative = path.relative(root, file); return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)); };
const sync = file => { const fd = fs.openSync(file, "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };

function checkedHome(given, mode, maintenanceWindow) {
  if (typeof given !== "string") throw new Error("An explicit offline Home is required");
  const home = fs.realpathSync(path.resolve(given));
  if (!fs.lstatSync(path.resolve(given)).isDirectory()) throw new Error("Home must be a real directory");
  const actual = [path.join(homedir(), ".molis-work"), process.env.MOLIS_WORK_HOME].filter(Boolean)
    .map(file => present(file) ? fs.realpathSync(file) : path.resolve(file));
  if (actual.includes(home) && (mode === "list" || !maintenanceWindow)) throw new Error("Use an offline copy; actual Home requires its separately approved stopped-Host maintenance window");
  return home;
}

function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1) throw new Error("Backup and vault files must be regular files with one link");
  return { bytes: fs.readFileSync(file), mode: stat.mode & 0o777 };
}

function sourceEntries(home) {
  const directory = path.join(home, "runtime-config-backups"), stat = present(directory), entries = [];
  if (!stat) return entries;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Backup directory must be a real directory");
  for (const runtime of fs.readdirSync(directory).sort()) {
    if (runtime === ".maintenance.json") continue;
    if (!SUPPORTED_RUNTIME_IDS.includes(runtime)) throw new Error("Unexpected file or Runtime in backup directory");
    const runtimeDirectory = path.join(directory, runtime), current = fs.lstatSync(runtimeDirectory);
    if (!current.isDirectory() || current.isSymbolicLink()) throw new Error("Runtime backup directory must be a real directory");
    for (const name of fs.readdirSync(runtimeDirectory).sort()) {
      const match = /^([A-Za-z0-9_-]{1,128})\.bak$/u.exec(name);
      if (!match) throw new Error("Unexpected file in Runtime backup directory");
      const relative = path.join("runtime-config-backups", runtime, name), file = path.join(home, relative), source = regular(file);
      entries.push({ relative, runtime, plan: match[1], source });
    }
  }
  return entries;
}

async function inventory(home) {
  const entries = [];
  for (const entry of sourceEntries(home)) {
      const { source, runtime, plan } = entry;
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(source.bytes); } catch { throw new Error("An original backup is not valid UTF-8 text"); }
      let parsed;
      try { parsed = JSON.parse(text); } catch { /* Unversioned TOML and other original Runtime text is not JSON. */ }
      const claimsReference = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        && (parsed.owner === RUNTIME_CONFIG_BACKUP_OWNER || "auth_ref" in parsed);
      if (claimsReference) {
        const original = await readRuntimeConfigBackup(home, runtime, plan);
        entries.push({ ...entry, current: true, ...original });
      } else entries.push({ ...entry, current: false, contents: text, mode: source.mode });
  }
  return entries;
}

function originalFiles(home, entries) {
  const files = new Map(entries.map(entry => [entry.relative, entry.source]));
  const feed = present(path.join(home, "feed"));
  if (feed && (!feed.isDirectory() || feed.isSymbolicLink())) throw new Error("Credential directory must be a real directory");
  const vault = path.join(home, "feed", "secrets.json");
  if (present(vault)) {
    const source = regular(vault);
    inspectSealedSecretsSnapshot(home, source.bytes.toString("utf8"));
    files.set(path.join("feed", "secrets.json"), source);
  }
  return files;
}

function saveOriginals(home, given, originals) {
  if (typeof given !== "string") throw new Error("apply requires a new --backup directory outside Home");
  const resolved = path.resolve(given), backup = path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
  if (inside(home, backup) || inside(backup, home)) throw new Error("Originals must be kept in a new directory outside Home");
  fs.mkdirSync(backup, { mode: 0o700 });
  for (const [relative, source] of originals) {
    const file = path.join(backup, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, source.bytes, { mode: source.mode, flag: "wx" }); fs.chmodSync(file, source.mode); sync(file); sync(path.dirname(file));
  }
  sync(backup);
  return backup;
}

export async function maintainRuntimeConfigBackups(mode, options) {
  if (!["list", "apply"].includes(mode)) throw new Error("Expected list or apply");
  const home = checkedHome(options.home, mode, options.maintenanceWindow), directory = path.join(home, "runtime-config-backups"), marker = path.join(directory, ".maintenance.json");
  if (present(marker)) throw new Error("Prior Runtime backup maintenance is incomplete; keep Host stopped and recover recorded originals before retrying");
  const entries = await inventory(home), originals = originalFiles(home, entries), pending = entries.filter(entry => !entry.current);
  const report = { files: entries.length, plaintext: pending.length, referenced: entries.length - pending.length, changed: false };
  if (mode === "list" || pending.length === 0) return report;
  const backup = saveOriginals(home, options.backupDirectory, originals);
  const currentEntries = sourceEntries(home);
  if (currentEntries.length !== entries.length || currentEntries.some(entry => !originals.has(entry.relative))) throw new Error("Source files changed; stop all Home writers and take a fresh offline copy");
  if (Boolean(present(path.join(home, "feed", "secrets.json"))) !== originals.has(path.join("feed", "secrets.json"))) throw new Error("Credential vault changed; stop all Home writers and take a fresh offline copy");
  for (const [relative, source] of originals) {
    const current = regular(path.join(home, relative));
    if (!current.bytes.equals(source.bytes) || current.mode !== source.mode) throw new Error("Source changed; stop all Home writers and take a fresh offline copy");
  }
  fs.writeFileSync(marker, JSON.stringify({ version: 1, backup, pid: process.pid, vault_existed: originals.has(path.join("feed", "secrets.json")) }) + "\n", { flag: "wx", mode: 0o600 });
  sync(marker); sync(directory);
  try {
    const expected = new Map();
    for (const entry of pending) {
      const item = await sealRuntimeConfigBackup(home, entry.runtime, entry.plan, entry.contents, entry.mode), text = JSON.stringify(item) + "\n";
      atomicWriteFileSync(path.join(home, entry.relative), text, { mode: 0o600 });
      sync(path.join(home, entry.relative)); sync(path.dirname(path.join(home, entry.relative))); expected.set(entry.relative, { item, text });
    }
    const vault = fs.readFileSync(path.join(home, "feed", "secrets.json"), "utf8");
    inspectSealedSecretsSnapshot(home, vault);
    const published = sourceEntries(home);
    if (published.length !== entries.length || published.some(entry => !originals.has(entry.relative))) throw new Error("The backup directory changed during publication");
    for (const entry of entries) {
      const written = expected.get(entry.relative);
      const current = regular(path.join(home, entry.relative));
      if (written ? current.bytes.toString("utf8") !== written.text || current.mode !== 0o600
        : !current.bytes.equals(entry.source.bytes) || current.mode !== entry.source.mode) throw new Error("Published backup reference does not match");
      const ref = written ? written.item.auth_ref : JSON.parse(entry.source.bytes.toString("utf8")).auth_ref;
      if (readSealedSecretSnapshotEntry(home, vault, ref) !== entry.contents) throw new Error("Sealed original backup did not round-trip");
    }
    sync(path.join(home, "feed", "secrets.json"));
    if (present(path.join(home, "feed", "secrets.key"))) sync(path.join(home, "feed", "secrets.key"));
    sync(path.join(home, "feed"));
  } catch (error) {
    throw new Error("Runtime backup maintenance is incomplete; keep Host stopped and recover originals from " + backup + "; marker " + marker, { cause: error });
  }
  // All current files and key dependencies are complete; marker cleanup is the last publication step.
  try { fs.unlinkSync(marker); sync(directory); }
  catch (error) { throw new Error("Runtime backups are sealed, but marker cleanup was not confirmed; inspect current files or recover originals from " + backup, { cause: error }); }
  return { ...report, plaintext: 0, referenced: entries.length, changed: true, backup };
}

async function main(args) {
  const [mode, ...flags] = args, value = flag => { const index = flags.indexOf(flag); return index < 0 ? undefined : flags[index + 1]; };
  try {
    const result = await maintainRuntimeConfigBackups(mode, { home: value("--home"), backupDirectory: value("--backup"), maintenanceWindow: flags.includes("--maintenance-window") });
    process.stdout.write(JSON.stringify(result, null, flags.includes("--json") ? 2 : 0) + "\n");
  } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main(process.argv.slice(2));
