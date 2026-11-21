import { execFileSync } from "node:child_process";
import { fstatSync, writeFileSync, writeSync } from "node:fs";
import { Server } from "node:http";

function descriptor() {
  try { return fstatSync(3); } catch (error) { if (error.code !== "EBADF") throw error; return null; }
}

// Only the test-owned Home entry installs this observer; the client's environment cannot select a resident preload.
const mcpStartup = process.env.MOLIS_WORK_MCP_WEB_STARTUP === "1";
const inherited = descriptor();
function observeStartup() {
  const current = descriptor();
  // The OS may have reused descriptor 3 for an unrelated socket after the private channel closed.
  const fd3Open = inherited !== null && current !== null && current.dev === inherited.dev && current.ino === inherited.ino;
  const descendant = JSON.parse(execFileSync(process.execPath,
    ["-e", "process.stdout.write(JSON.stringify({marker:process.env.MOLIS_WORK_MCP_WEB_STARTUP??null}))"], { encoding: "utf8" }));
  if (!mcpStartup && fd3Open) writeSync(3, "ordinary caller fd\n");
  writeFileSync(process.env.MOLIS_WORK_TEST_C5_READY, JSON.stringify({ pid: process.pid, fd3Open,
    marker: process.env.MOLIS_WORK_MCP_WEB_STARTUP ?? null, descendantMarker: descendant.marker }));
}

const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  const result = Reflect.apply(emit, this, [event, ...args]);
  // The launcher now awaits the listening event before releasing the startup channel.
  if (event === "listening") setImmediate(observeStartup);
  return result;
};
