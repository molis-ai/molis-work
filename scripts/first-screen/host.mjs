import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

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

// Use the packages built in the measured checkout, even when the calling script lives in the candidate.
async function seed(root, home) {
  const { openMolisWorkProjectCatalog } = await import(pathToFileURL(join(root, "apps/desktop/dist/index.js")).href);
  const { PROJECT_SCOPED_PLUGIN_IDS } = await import(pathToFileURL(join(root, "apps/local-host/dist/index.js")).href);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const actor_id = "first-screen-report";
  try {
    const plain = await catalog.createProject({ project_id: "project-onboarding-00000000-0000-4000-8000-000000000001", display_name: "默认项目", actor_id });
    const crowded = await catalog.createProject({ project_id: "project-onboarding-00000000-0000-4000-8000-000000000002", display_name: "全部插件", actor_id });
    for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: crowded.project_id, plugin_id, actor_id });
    const demo = (await catalog.ensureDemoProject({ actor_id, user_confirmed: true })).project;
    return [
      { id: "arrival-empty", path: "/onboarding" },
      { id: "chooser", path: "/", project: demo.project_id },
      { id: "workbench-default", path: `/projects/${plain.project_id}/`, project: plain.project_id },
      { id: "workbench-all-plugins", path: `/projects/${crowded.project_id}/`, project: crowded.project_id },
      { id: "workbench-demo", path: `/projects/${demo.project_id}/`, project: demo.project_id },
      { id: "settings", path: "/settings/appearance" },
      { id: "catalog", path: "/__ui/catalog" },
    ];
  } finally { catalog.close(); }
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
    const pages = await seed(root, home);
    const chosenPort = await availablePort(port, signal);
    return await useHost(root, home, chosenPort, signal, host => operation({ ...host, home, pages }));
  } finally {
    // The text context is process-wide (`Symbol.for`, packages/plugin-sdk/src/ui/text.ts): a measured seed of the merge-base leaves
    // its copy installed, and the candidate is a separate module copy, so installing its own would refuse. This measurement only
    // needs it while the seed runs; the HTTP pages were sampled in their own child process.
    Reflect.deleteProperty(globalThis, Symbol.for("molis.work.ui-text.v1"));
    rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
