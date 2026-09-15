import path from "node:path";
import { LEGACY_LAUNCHER_HEADER, BUNDLED_NODE_LAUNCHER_HEADER } from "./home-contract.js";

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function launcherSource(
  entry: "cli" | "mcp" | "web",
  releaseDirectory: string,
  useBundledNode: boolean,
): string {
  const target =
    entry === "cli"
      ? "dist/cli/main.js"
      : entry === "mcp"
        ? "dist/mcp/server.js"
        : "dist/web/server.js";
  if (useBundledNode) {
    const nodePath = path.join(releaseDirectory, "runtime", "node");
    const entryPath = path.join(releaseDirectory, target);
    const serviceEnvironment = entry === "web" ? "/usr/bin/env MOLIS_WORK_WEB_SERVICE_PROCESS_ID=$$ " : "";
    return `${BUNDLED_NODE_LAUNCHER_HEADER}
exec ${serviceEnvironment}${shellQuote(nodePath)} ${shellQuote(entryPath)} "$@"
`;
  }
  const childEnvironment = entry === "web"
    ? `{
    ...process.env,
    MOLIS_WORK_WEB_SERVICE_PROCESS_ID: String(process.pid),
  }`
    : entry === "mcp"
      ? `{
    ...process.env,
    PWD: process.cwd(),
  }`
      : "process.env";
  return `${LEGACY_LAUNCHER_HEADER}
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const homeDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installation = JSON.parse(readFileSync(path.join(homeDirectory, "config", "installation.json"), "utf8"));
const entry = path.resolve(homeDirectory, installation.release_path, "${target}");
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  cwd: ${entry === "mcp" ? "process.cwd()" : "path.dirname(entry)"},
  env: ${childEnvironment},
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
child.once("exit", (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  }
  else process.exitCode = code ?? 1;
});
`;
}

