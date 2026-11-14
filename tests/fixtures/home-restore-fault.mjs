// Fault actual I/O boundaries, then run the public production CLI dispatcher.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [home, archive, fault] = process.argv.slice(2);
const marker = join(home, "agent-runtime", ".molis-home-restore.json");
const descriptors = new Map(), realOpen = fs.openSync, realClose = fs.closeSync, realSync = fs.fsyncSync, realUnlink = fs.unlinkSync, realRename = fs.renameSync;
const realRemove = fs.rmSync;
let triggered = false, tampered = false, memoryCommits = 0;
const journal = () => fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, "utf8")) : undefined;
const realExec = DatabaseSync.prototype.exec;
const realPrepare = DatabaseSync.prototype.prepare, mutated = new WeakSet();
DatabaseSync.prototype.prepare = function(sql) {
  const statement = realPrepare.call(this, sql);
  if (/^(?:INSERT INTO records\(|DELETE FROM records WHERE)/u.test(sql)) {
    const run = statement.run, db = this;
    statement.run = function(...values) {
      const result = run.apply(this, values);
      if (journal()?.phase === "publishing" && ["io.molis.work~memories", "io.molis.work~memory-candidates"].includes(values[0])) {
        mutated.add(db);
        if (!triggered && ["memory-purge-kill", "memory-purge-failure", "memory-commit-unknown", "memory-unrelated-kind", "memory-new-sdk-file"].includes(fault)) {
          triggered = true; process.stderr.write("memory-purge-reached\n");
          if (fault === "memory-purge-kill") process.kill(process.pid, "SIGKILL");
        }
      }
      return result;
    };
  }
  return statement;
};
DatabaseSync.prototype.exec = function(sql) {
  const ledgerTransaction = triggered && sql === "BEGIN IMMEDIATE" && journal()?.phase === "publishing"
    && realPrepare.call(this, "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='memory_revisions'").get() !== undefined;
  if (["memory-unrelated-kind", "memory-new-sdk-file"].includes(fault) && triggered && !tampered
    && ledgerTransaction) {
    const directory = join(home, "agent-runtime", "records", "io.molis.work~runs");
    const original = fs.readdirSync(directory).sort().find(name => name.endsWith(".json"));
    if (!original) throw new Error("the actual Assistant Run record is missing");
    if (fault === "memory-unrelated-kind") fs.appendFileSync(join(directory, original), "\n");
    else fs.copyFileSync(join(directory, original), join(directory, "unexpected-memory-cleanup.json"));
    tampered = true; process.stderr.write("memory-unexpected-sdk-write\n");
  }
  if (fault === "memory-purge-failure" && ledgerTransaction) {
    process.stderr.write("memory-ledger-before-commit\n");
    throw Object.assign(new Error("injected ledger transaction failure after verified SDK purge"), { code: "EIO" });
  }
  const result = realExec.call(this, sql);
  if (sql === "COMMIT" && mutated.has(this)) {
    mutated.delete(this); memoryCommits++;
    if (fault === "memory-commit-unknown" && triggered && journal()?.phase === "publishing") {
      process.stderr.write(`memory-native-commit-returned:${memoryCommits}\n`);
      throw Object.assign(new Error("injected unknown result after native indexed COMMIT returned"), { code: "EIO" });
    }
  }
  return result;
};
fs.openSync = function(path, ...args) {
  if (!triggered && (fault === "write-failure" || fault === "rollback-failure") && String(path) === join(home, "plugin-files", "original.bin") && typeof args[0] === "number" && (args[0] & fs.constants.O_CREAT)) {
    triggered = true; throw Object.assign(new Error("injected final file creation failure"), { code: "EIO" });
  }
  const fd = realOpen.call(this, path, ...args); descriptors.set(fd, String(path)); return fd;
};
fs.closeSync = function(fd) { descriptors.delete(fd); return realClose.call(this, fd); };
fs.fsyncSync = function(fd) {
  const result = realSync.call(this, fd), current = journal(), path = descriptors.get(fd);
  if (!triggered && current) {
    const boundary = fault === "prepared-kill" && current.phase === "prepared" && path === current.originals_directory
      || fault === "committed-kill" && current.phase === "committed" && path === current.originals_directory
      || fault === "partial-kill" && current.phase === "publishing" && path?.startsWith(home + "/") && path.endsWith(".db");
    if (boundary) { triggered = true; process.kill(process.pid, "SIGKILL"); }
  }
  return result;
};
fs.renameSync = function(source, target) {
  if (triggered && fault === "rollback-failure" && String(source).includes("/originals/") && String(target).startsWith(home + "/"))
    throw Object.assign(new Error("injected original restoration failure"), { code: "EIO" });
  const result = realRename.call(this, source, target);
  return result;
};
fs.unlinkSync = function(path) {
  if (fault === "clear-failure" && String(path) === marker) {
    triggered = true; throw Object.assign(new Error("injected committed barrier clear failure"), { code: "EIO" });
  }
  return realUnlink.call(this, path);
};
fs.rmSync = function(path, ...args) {
  const current = String(path), existed = fault === "session-purge-kill" && fs.existsSync(path)
    && current.startsWith(join(home, "agent-runtime", "records", "io.molis.work~runs") + "/") && current.endsWith(".json");
  const result = realRemove.call(this, path, ...args);
  if (!triggered && existed && !fs.existsSync(path) && journal()?.phase === "publishing") {
    triggered = true; process.stderr.write("session-child-physically-removed\n"); process.kill(process.pid, "SIGKILL");
  }
  return result;
};
syncBuiltinESMExports();
const { runLocalCli } = await import("@molis-ai/molis-work-app-local-host");
const { withMolisWorkProjectCatalog, inspectMolisWorkProjectCatalogSnapshot } = await import("@molis-ai/molis-work-app-desktop");
try {
  const code = await runLocalCli(["home", "restore", "--home", home, "--from", archive, "--json"], {
    defaultSourceDirectory: () => dirname(archive), withCatalog: withMolisWorkProjectCatalog,
    inspectCatalog: inspectMolisWorkProjectCatalogSnapshot, runPlugin: async () => { throw new Error("not a plugin operation"); },
  });
  if (!triggered) throw new Error("fixture did not reach the requested real publication boundary");
  process.exitCode = code;
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { code: error.code, message: error.message }, triggered }) + "\n");
  process.exitCode = 1;
}
