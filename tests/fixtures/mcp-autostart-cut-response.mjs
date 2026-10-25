import { ServerResponse } from "node:http";
import { existsSync, writeFileSync } from "node:fs";

// Cut only the response after the real context operation produced its committed result. The next call must discover it.
const originalEnd = ServerResponse.prototype.end;
if (process.env.MOLIS_WORK_MCP_WEB_STARTUP === "1" && process.env.MOLIS_WORK_TEST_C5_WEB_ENV) {
  writeFileSync(process.env.MOLIS_WORK_TEST_C5_WEB_ENV, JSON.stringify({ runtime: process.env.MOLIS_WORK_RUNTIME_ID ?? null,
    session: process.env.MOLIS_WORK_WORK_CONTEXT_ID ?? null, home: process.env.MOLIS_WORK_HOME, cwd: process.env.PWD }));
}
ServerResponse.prototype.end = function (...args) {
  const marker = process.env.MOLIS_WORK_TEST_C5_CUT_ONCE;
  if (marker && !existsSync(marker) && String(args[0]).includes("C5-delivery-cut")) {
    writeFileSync(marker, "response cut after the real result\n");
    this.socket?.destroy(); return this;
  }
  return Reflect.apply(originalEnd, this, args);
};
