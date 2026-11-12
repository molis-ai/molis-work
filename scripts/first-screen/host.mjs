import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const LOCALES = ["zh", "en"];
export const LOCALE_COOKIE = "molis_work_locale";
const RESERVED_PORTS = new Set([4207, 4208]);

async function availablePort(requested, signal) {
  if (RESERVED_PORTS.has(requested)) throw new Error(`port ${requested} belongs to the real Home`);
  const probe = createServer();
  probe.listen(requested, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  signal.throwIfAborted();
  return RESERVED_PORTS.has(port) ? availablePort(0, signal) : port;
}

// Each checkout owns process-wide SDK providers; never load two builds into this process.
async function seed(root, home, signal) {
  signal.throwIfAborted();
  const child = fork(new URL("./seed.mjs", import.meta.url), [root, home], {
    cwd: root, stdio: ["ignore", "ignore", "pipe", "ipc"],
    env: { ...process.env, MOLIS_WORK_HOME: home, MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" },
  });
  let pages, failure, stderr = "", escalation;
  const abort = () => {
    child.kill("SIGTERM");
    escalation = setTimeout(() => child.kill("SIGKILL"), 1_500);
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  child.on("message", message => { pages = message; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("error", error => { failure = error; });
  try {
    const [code, stopped] = await new Promise(resolve => child.once("close", (...result) => resolve(result)));
    signal.throwIfAborted();
    if (failure) throw failure;
    if (code !== 0 || !Array.isArray(pages)) throw new Error(`first-screen seed failed (${stopped ?? code}): ${stderr.trim()}`);
    return pages;
  } finally {
    signal.removeEventListener("abort", abort);
    clearTimeout(escalation);
  }
}

async function waitForHealth(origin, signal) {
  const deadline = AbortSignal.timeout(30_000);
  const waiting = AbortSignal.any([signal, deadline]);
  try {
    for (;;) {
      const answer = await fetch(`${origin}/health`, {
        redirect: "error", signal: AbortSignal.any([waiting, AbortSignal.timeout(1_000)]),
      }).catch(() => null);
      await answer?.body?.cancel();
      waiting.throwIfAborted();
      if (answer?.ok) return;
      await delay(200, undefined, { signal: waiting });
    }
  } catch (error) {
    signal.throwIfAborted();
    if (deadline.aborted) throw new Error("the Host did not answer /health");
    throw error;
  }
}

async function useHost(root, home, port, signal, operation) {
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "scripts/visual/selected-home-server.mjs"), home, String(port)], {
    cwd: root, stdio: "ignore",
    env: { ...process.env, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" },
  });
  const stopped = new AbortController();
  const live = AbortSignal.any([signal, stopped.signal]);
  let closing = false;
  const done = new Promise(resolve => {
    child.once("error", error => { stopped.abort(error); resolve(); });
    child.once("exit", (code, signal) => {
      if (!closing) stopped.abort(new Error(`the Host exited with ${signal ?? code}`));
      resolve();
    });
  });
  try {
    await waitForHealth(origin, live);
    const result = await operation({ origin, signal: live });
    live.throwIfAborted();
    return result;
  } catch (error) {
    live.throwIfAborted();
    throw error;
  } finally {
    closing = true;
    let escalation;
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      escalation = setTimeout(() => child.kill("SIGKILL"), 1_500);
    }
    try { await done; } finally { clearTimeout(escalation); }
  }
}

// A fresh fixed-length Home and fixed project IDs keep path- and ID-dependent response sizes repeatable.
export async function withFirstScreenHost(root, { signal, port = 0 }, operation) {
  signal.throwIfAborted();
  if (!existsSync(join(root, "dist/web/server.js"))) throw new Error(`${root}: dist/web/server.js is missing; run pnpm build first`);
  const home = mkdtempSync(join(tmpdir(), "molis-first-screen-"));
  try {
    const pages = await seed(root, home, signal);
    const chosenPort = await availablePort(port, signal);
    return await useHost(root, home, chosenPort, signal, host => operation({ ...host, home, pages }));
  } finally {
    rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
