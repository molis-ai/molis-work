// Fault only the actual filesystem boundary, then run the public production CLI dispatcher.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, dirname } from "node:path";

const [home, archive, fault] = process.argv.slice(2);
const marker = join(home, "agent-runtime", ".molis-home-restore.json");
const descriptors = new Map(), realOpen = fs.openSync, realClose = fs.closeSync, realSync = fs.fsyncSync, realUnlink = fs.unlinkSync, realRename = fs.renameSync;
let triggered = false;
const journal = () => fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, "utf8")) : undefined;
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
  return realRename.call(this, source, target);
};
fs.unlinkSync = function(path) {
  if (fault === "clear-failure" && String(path) === marker) {
    triggered = true; throw Object.assign(new Error("injected committed barrier clear failure"), { code: "EIO" });
  }
  return realUnlink.call(this, path);
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
