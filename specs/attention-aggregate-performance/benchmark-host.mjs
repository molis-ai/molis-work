// AAP-05: real product Host in its own process. Only the parent sends load; no model or real Home is used.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { Session } from "node:inspector/promises";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost, LocalProjectDatabase, MolisWorkLocalHost, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { FunctionsStore } from "@molis-ai/molis-work-module-judgment-rules";
import { serveTestHost } from "../../tests/fixtures/test-home.ts";
import { startProjectPlugins } from "../../tests/fixtures/plugin-callers.ts";
import { codingSessions, noEffect } from "../../tests/fixtures/coding-sessions.ts";

const [mode, countText, profilePath] = process.argv.slice(2);
const count = Number(countText), home = process.env.MOLIS_WORK_HOME;
assert.ok(home && home.includes("molis-attention-benchmark-"), "explicit isolated Home required");
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
  actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home) });
const served = await serveTestHost(null, { home, host });
const projects = [];
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  try { await served.close(); } finally { await host.close(); }
}
process.once("SIGTERM", () => { void close().finally(() => process.exit(143)); });
try {
  if (mode === "seed") {
    for (let index = 0; index < count; index++) {
      const project = await served.createProject(`Perf ${String(index + 1).padStart(2, "0")}`, ["coding"]);
      projects.push(project);
      const store = new LocalProjectDatabase(project.database_path), coding = codingSessions(store);
      try {
        for (const [id, state, at] of [["queued", "queued", "2030-01-01T00:01:00.000Z"],
          ["review", "waiting-approval", "2030-01-01T00:02:00.000Z"], ["done", "done", "2030-01-01T00:03:00.000Z"]]) {
          await coding.create(noEffect, { project_id: project.project_id, session_id: id, title: `${project.display_name} ${id}`, runtime_id: "prologue", at });
          await coding.setState(noEffect, project.project_id, id, state, at);
        }
      } finally { store.close(); }
    }
    await close();
    process.send({ type: "seeded", projects });
    process.disconnect();
  } else {
    const catalog = await withMolisWorkProjectCatalog({ homeDirectory: home }, value => value.listProjects());
    assert.equal(catalog.length, count);
    for (const project of catalog) {
      const reference = { project_id: project.project_id, storage_key: project.database_path };
      await startProjectPlugins(host, reference);
      projects.push({ ...project, reference });
    }
    const status = host.status();
    assert.equal(status.projects.length, count);
    let measuring = false, statusCalls = 0, descriptorsCloned = 0, functionsCloses = 0;
    const originalStatus = LocalHost.prototype.status;
    LocalHost.prototype.status = function () {
      const value = originalStatus.call(this);
      if (measuring) { statusCalls++; descriptorsCloned += value.capabilities.length; }
      return value;
    };
    const originalClose = FunctionsStore.prototype.close;
    FunctionsStore.prototype.close = function () {
      if (measuring) functionsCloses++;
      return originalClose.call(this);
    };
    const eld = monitorEventLoopDelay({ resolution: 10 }), seconds = [];
    let timer, started, cpu;
    const profiler = profilePath ? new Session() : null;
    if (profiler) { profiler.connect(); await profiler.post("Profiler.enable"); }
    process.on("message", message => {
      void (async () => {
        if (message.type === "start") {
          seconds.length = 0; statusCalls = 0; descriptorsCloned = 0; functionsCloses = 0;
          if (profiler) await profiler.post("Profiler.start");
          eld.enable(); eld.reset(); measuring = true; started = performance.now(); cpu = process.cpuUsage();
          timer = setInterval(() => { seconds.push({ at_ms: performance.now() - started, max_ms: eld.max / 1e6 }); eld.reset(); }, 1_000);
          process.send({ type: "started" });
        } else if (message.type === "stop") {
          const used = process.cpuUsage(cpu), wall = performance.now() - started;
          measuring = false; clearInterval(timer); seconds.push({ at_ms: wall, max_ms: eld.max / 1e6 }); eld.disable();
          if (profiler) { const { profile } = await profiler.post("Profiler.stop"); await writeFile(profilePath, JSON.stringify(profile)); profiler.disconnect(); }
          process.send({ type: "metrics", metrics: { wall_ms: wall, cpu_ms: (used.user + used.system) / 1_000,
            cpu_percent_one_core: (used.user + used.system) / 10 / wall, status_calls: statusCalls,
            descriptors_cloned: descriptorsCloned, functions_closes: functionsCloses, eld_windows: seconds, rss_bytes: process.memoryUsage().rss,
            open_projects: host.status().projects.length } });
        } else if (message.type === "close") { await close(); process.disconnect(); }
      })().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; void close().finally(() => process.disconnect()); });
    });
    process.send({ type: "ready", origin: served.origin, projects, descriptors: status.capabilities.length, node: process.version });
  }
} catch (error) { await close(); throw error; }
