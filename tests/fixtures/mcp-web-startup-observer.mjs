import { execFileSync } from "node:child_process";
import { fstatSync, writeFileSync, writeSync } from "node:fs";
import { Server } from "node:http";

// Only the test-owned Home entry installs this observer; the client's environment cannot select a resident preload.
const mcpStartup = process.env.MOLIS_WORK_MCP_WEB_STARTUP === "1";
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  const callback = args.at(-1);
  if (typeof callback === "function") args[args.length - 1] = function (...ready) {
    const result = Reflect.apply(callback, this, ready);
    let fd3Open = true;
    try { fstatSync(3); } catch (error) { if (error.code !== "EBADF") throw error; fd3Open = false; }
    const descendant = JSON.parse(execFileSync(process.execPath,
      ["-e", "process.stdout.write(JSON.stringify({marker:process.env.MOLIS_WORK_MCP_WEB_STARTUP??null}))"], { encoding: "utf8" }));
    if (!mcpStartup && fd3Open) writeSync(3, "ordinary caller fd\n");
    writeFileSync(process.env.MOLIS_WORK_TEST_C5_READY, JSON.stringify({ pid: process.pid, fd3Open,
      marker: process.env.MOLIS_WORK_MCP_WEB_STARTUP ?? null, descendantMarker: descendant.marker }));
    return result;
  };
  return Reflect.apply(listen, this, args);
};
