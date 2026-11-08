import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { installMolisWorkHome } from "@molis-ai/molis-work-app-local-host";
import { isolatedMcpResident, waitUntil } from "./isolated-mcp-resident.js";
import { installedAccountAuth } from "./installed-account.js";

export { waitUntil } from "./isolated-mcp-resident.js";

export async function installedMcpHome(t: TestContext, install = installMolisWorkHome) {
  const root = await mkdtemp(join(tmpdir(), "mcp-autostart-")), home = join(root, "home");
  const clients = new Set<ReturnType<typeof rawMcp>>();
  let cleanupHost = async () => {}, cleanupCandidates = async () => {};
  let closeAuth = async () => {};
  let installation: ReturnType<typeof install> | undefined;
  const closePeers = async () => { await Promise.all([...clients].map(peer => peer.close())); clients.clear(); };
  t.after(async () => {
    // RAC-628-F1: an expired parent must not delete files while its installer is still writing them.
    await installation?.catch(() => { /* The test body retains the installation failure. */ });
    await closePeers(); await cleanupHost(); await cleanupCandidates();
    await closeAuth();
    await rm(root, { recursive: true, force: true });
  });
  t.diagnostic("Installing the real build into an isolated Home");
  const installed = await (installation = install({ homeDirectory: home, sourceDirectory: fileURLToPath(new URL("../../", import.meta.url)),
    beforeStep: step => { t.signal.throwIfAborted(); t.diagnostic(`Real installer phase: ${step}`); } }));
  t.signal.throwIfAborted();
  t.diagnostic("Real install complete; beginning process scenarios");
  const { origin, health, stopHost } = await isolatedMcpResident(home);
  cleanupHost = stopHost;
  const auth = await installedAccountAuth(root, origin); closeAuth = auth.close;
  // Persist a real installation login once, then stop it so every scenario still tests an actual cold installed launcher.
  const bootstrap = spawn(process.execPath, [installed.launchers.web, "--home", home, "--port", new URL(origin).port], {
    env: { ...process.env, ...auth.environment, HOME: root, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin }, stdio: ["ignore", "pipe", "pipe"],
  });
  let bootstrapErrors = ""; bootstrap.stderr.on("data", chunk => { bootstrapErrors = (bootstrapErrors + String(chunk)).slice(-3000); });
  bootstrap.stdout.resume();
  const bootstrapClosed = new Promise<void>((resolve, reject) => { bootstrap.once("error", reject); bootstrap.once("close", () => resolve()); });
  let accountHome: string;
  try {
    await waitUntil(async () => {
      if (bootstrap.exitCode !== null) throw new Error("Account bootstrap Web exited: " + bootstrapErrors);
      return fetch(origin + "/health").then(response => response.ok, () => false);
    });
    assert.equal((await fetch(origin + "/api/settings/projects")).status, 401, "a fresh installed Host refuses anonymous business");
    const rootToken = (await readFile(join(home, "config/web-control-token"), "utf8")).trim();
    accountHome = (await auth.login(home, rootToken)).home;
  } finally {
    bootstrap.kill("SIGTERM"); await bootstrapClosed;
  }
  const original = join(home, "bin", "molis-work-web-original"), barrier = join(root, "release-start"), attempts = join(root, "attempts");
  await mkdir(attempts);
  await rename(installed.launchers.web, original);
  const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
  // The test barrier delays only the installed launch entry; the actual release and fd 3 chain remain production code.
  async function configureWeb(environment: Record<string, string> = {}) {
    const trustedFixtureEnvironment = Object.entries({ ...auth.environment, ...environment }).map(([key, value]) => {
      assert.match(key, /^[A-Z][A-Z0-9_]*$/);
      return `export ${key}=${quote(value)}\n`;
    }).join("");
    await writeFile(installed.launchers.web, `#!/bin/sh\necho $$ > ${quote(attempts)}/$$\nwhile [ ! -f ${quote(barrier)} ]; do /bin/sleep 0.02; done\n${trustedFixtureEnvironment}exec ${quote(original)} "$@"\n`, { mode: 0o755 });
  }
  await configureWeb();
  cleanupCandidates = async () => {
    for (const entry of await readdir(attempts)) { try { process.kill(-Number(entry), "SIGKILL"); } catch { /* Own candidate group already exited. */ } }
  };
  const env = (session: string) => ({ ...process.env, HOME: root, MOLIS_WORK_HOME: home, MOLIS_WORK_RUNTIME_ID: "codex",
    MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_WORK_CONTEXT_ID: session, MOLIS_WORK_WORK_CONTEXT_STABLE: "true", MOLIS_WORK_SESSION_ID: "",
    MOLIS_WORK_PANEL_ID: "", MOLIS_WORK_FOCUS_ID: "", CODEX_THREAD_ID: "", CLAUDE_CODE_SESSION_NAME: "", PWD: root });
  return { root, home, accountHome, origin, installed, attempts, barrier, health, stopHost, env, configureWeb,
    async cleanupCase() { await closePeers(); await stopHost(); await cleanupCandidates(); },
    async connect(session: string, override?: NodeJS.ProcessEnv) {
      const peer = rawMcp(t, installed.launchers.mcp, { ...env(session), ...override }); clients.add(peer);
      await peer.request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "autostart", version: "1" } }).promise;
      peer.notify({ method: "notifications/initialized" }); return peer;
    },
    release: () => writeFile(barrier, "go"), reset: () => rm(barrier, { force: true }) };
}

export function rawMcp(t: TestContext, launcher: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [launcher], { env, stdio: ["pipe", "pipe", "pipe"] });
  let serial = 0, errors = "";
  const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  const lines = createInterface({ input: child.stdout });
  child.stderr.on("data", chunk => { errors = (errors + String(chunk)).slice(-2000); });
  lines.on("line", line => {
    const message = JSON.parse(line), entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); clearTimeout(entry.timer); entry.resolve(message); }
  });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("MCP closed: " + errors)); }
      pending.clear(); lines.close(); resolve();
    });
  });
  async function close() {
    child.stdin.end(); const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await closed; } finally { clearTimeout(timer); }
  }
  t.after(close);
  return { child, closed, close,
    notify(message: Record<string, unknown>) { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n"); },
    request(method: string, params?: Record<string, unknown>) {
      const id = ++serial;
      const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("MCP response timed out: " + errors)); }, 30_000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n");
      });
      return { id, promise };
    },
  };
}

export async function tool<Output>(peer: ReturnType<typeof rawMcp>, name: string, input: Record<string, unknown> = {}): Promise<Output> {
  const response = await peer.request("tools/call", { name: `molis_work_v1_${name}`, arguments: input }).promise;
  const result = response.result as { isError?: boolean; content: Array<{ text: string }> };
  assert.equal(result.isError, false, JSON.stringify(response)); return JSON.parse(result.content[0]!.text) as Output;
}
