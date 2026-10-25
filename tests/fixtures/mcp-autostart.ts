import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import { installMolisWorkHome } from "@molis-ai/molis-work-app-local-host";

export async function waitUntil(check: () => Promise<boolean>, timeout = 8000): Promise<void> {
  const deadline = performance.now() + timeout;
  while (!await check()) {
    if (performance.now() >= deadline) throw new Error("Autostart fixture condition timed out");
    await delay(30);
  }
}

export async function installedMcpHome(t: TestContext, install = installMolisWorkHome) {
  const root = await mkdtemp(join(tmpdir(), "mcp-autostart-")), home = join(root, "home");
  const clients = new Set<ReturnType<typeof rawMcp>>();
  let cleanupHost = async () => {}, cleanupCandidates = async () => {};
  let installation: ReturnType<typeof install> | undefined;
  const closePeers = async () => { await Promise.all([...clients].map(peer => peer.close())); clients.clear(); };
  t.after(async () => {
    // RAC-628-F1: an expired parent must not delete files while its installer is still writing them.
    await installation?.catch(() => { /* The test body retains the installation failure. */ });
    await closePeers(); await cleanupHost(); await cleanupCandidates();
    await rm(root, { recursive: true, force: true });
  });
  t.diagnostic("Installing the real build into an isolated Home");
  const installed = await (installation = install({ homeDirectory: home, sourceDirectory: fileURLToPath(new URL("../../", import.meta.url)),
    beforeStep: step => { t.signal.throwIfAborted(); t.diagnostic(`Real installer phase: ${step}`); } }));
  t.signal.throwIfAborted();
  t.diagnostic("Real install complete; beginning process scenarios");
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${address.port}`, pids = new Set<number>();
  let lastHealth: { process_id: number; service_process_id: number } | undefined;
  async function health() {
    const token = (await readFile(join(home, "config/web-control-token"), "utf8")).trim(), challenge = randomBytes(32).toString("base64url");
    const response = await fetch(`${origin}/health?challenge=${challenge}`, { signal: AbortSignal.timeout(1000) });
    const body = await response.text();
    assert.equal(response.headers.get("x-molis-work-proof"), createHmac("sha256", token).update(`${challenge}\n${body}`).digest("base64url"));
    const value = JSON.parse(body); assert.equal(value.status, "ok"); assert.equal(value.desktop_tui, true);
    assert.ok(Number.isSafeInteger(value.process_id) && value.process_id > 1);
    assert.ok(Number.isSafeInteger(value.service_process_id) && value.service_process_id > 1);
    pids.add(value.process_id); pids.add(value.service_process_id); lastHealth = value;
    return { process_id: value.process_id as number, service_process_id: value.service_process_id as number };
  }
  async function stopHost() {
    if (!lastHealth) { try { await health(); } catch { /* Startup may have failed before listening. */ } }
    for (const pid of pids) { try { process.kill(pid, "SIGTERM"); } catch { /* Already exited. */ } }
    await waitUntil(async () => {
      try { await fetch(`${origin}/health`, { signal: AbortSignal.timeout(300) }); return false; }
      catch { return true; }
    });
    await waitUntil(async () => [...pids].every(pid => { try { process.kill(pid, 0); return false; } catch { return true; } }));
    pids.clear(); lastHealth = undefined;
  }
  cleanupHost = stopHost;
  const original = join(home, "bin", "molis-work-web-original"), barrier = join(root, "release-start"), attempts = join(root, "attempts");
  await mkdir(attempts);
  await rename(installed.launchers.web, original);
  const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
  // The test barrier delays only the installed launch entry; the actual release and fd 3 chain remain production code.
  await writeFile(installed.launchers.web, `#!/bin/sh\necho $$ > ${quote(attempts)}/$$\nwhile [ ! -f ${quote(barrier)} ]; do /bin/sleep 0.02; done\nexec ${quote(original)} "$@"\n`, { mode: 0o755 });
  cleanupCandidates = async () => {
    for (const entry of await readdir(attempts)) { try { process.kill(-Number(entry), "SIGKILL"); } catch { /* Own candidate group already exited. */ } }
  };
  const env = (session: string) => ({ ...process.env, HOME: root, MOLIS_WORK_HOME: home, MOLIS_WORK_RUNTIME_ID: "codex",
    MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_WORK_CONTEXT_ID: session, MOLIS_WORK_WORK_CONTEXT_STABLE: "true", MOLIS_WORK_SESSION_ID: "",
    MOLIS_WORK_PANEL_ID: "", MOLIS_WORK_GOAL_ID: "", CODEX_THREAD_ID: "", CLAUDE_CODE_SESSION_NAME: "", PWD: root });
  return { root, home, origin, installed, attempts, barrier, health, stopHost, env,
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
