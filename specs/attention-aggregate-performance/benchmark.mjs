// AAP-05. Run from the repository root, after pnpm build:
// node --import tsx specs/attention-aggregate-performance/benchmark.mjs <baseline|fixed> <temporary-data-root> <output-dir> [seconds=60] [counts=1,7,14] [tabs=1,3]
// Use the SAME temporary-data-root for both arms; each case restores the same closed seed at its original path.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, openSync, closeSync } from "node:fs";
import { once } from "node:events";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";

const [arm, dataArg, outputArg, secondsArg = "60", countsArg = "1,7,14", tabsArg = "1,3"] = process.argv.slice(2);
assert.ok(["baseline", "fixed"].includes(arm) && dataArg && outputArg);
const data = resolve(dataArg), output = resolve(outputArg), duration = Number(secondsArg) * 1_000;
assert.ok(data.includes("molis-attention-benchmark-") && duration > 0);
await mkdir(data, { recursive: true }); await mkdir(output, { recursive: true });
const quantiles = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return { samples: sorted.length, p50_ms: at(.5), p90_ms: at(.9), max_ms: at(1) };
};

function launch(home, mode, count, label, profile) {
  const fd = openSync(join(output, `${label}.log`), "w");
  const child = fork(new URL("./benchmark-host.mjs", import.meta.url), [mode, String(count), ...(profile ? [profile] : [])], {
    execArgv: ["--import", "tsx", "--max-old-space-size=4096"],
    env: { ...process.env, HOME: home, MOLIS_WORK_HOME: home, MOLIS_WORK_SECRET_BACKEND: "file", NODE_ENV: "test" },
    stdio: ["ignore", fd, fd, "ipc"],
  });
  closeSync(fd);
  const messages = [], pending = [];
  child.on("message", message => { const i = pending.findIndex(item => item.type === message.type);
    if (i < 0) messages.push(message); else pending.splice(i, 1)[0].resolve(message); });
  child.on("exit", (code, signal) => { for (const waiter of pending.splice(0)) waiter.reject(new Error(`${label} exited ${code}/${signal}; see its log`)); });
  const receive = type => {
    const i = messages.findIndex(message => message.type === type);
    if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]);
    return new Promise((resolve, reject) => pending.push({ type, resolve, reject }));
  };
  const exited = once(child, "exit");
  return { child, receive, async close() {
    if (child.exitCode !== null || child.signalCode) return;
    if (child.connected) child.send({ type: "close" });
    const kill = setTimeout(() => child.kill("SIGKILL"), 15_000);
    try { await exited; } finally { clearTimeout(kill); }
  } };
}

function expectedRows(projects) {
  return projects.flatMap(project => [
    { project_id: project.project_id, project_name: project.display_name, surface: "coding", id: "review", title: `${project.display_name} review`,
      state: "waiting-approval", updated_at: "2030-01-01T00:02:00.000Z", waiting: true, standing: [{ text: "等你审查" }], commands: [] },
    { project_id: project.project_id, project_name: project.display_name, surface: "coding", id: "queued", title: `${project.display_name} queued`,
      state: "queued", updated_at: "2030-01-01T00:01:00.000Z", waiting: true, standing: [{ text: "挂起等待" }], commands: [] },
  ]).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id));
}

async function measure(server, ready, count, tabs) {
  const samples = {}, responses = {}, errors = [];
  const expected = expectedRows(ready.projects), base = `/projects/${ready.projects[0].project_id}`;
  const paths = { attention: `${base}/api/attention`, home_attention: "/api/attention", health: "/health", cursor: `${base}/api/board/cursor` };
  async function request(key, record = true) {
    const start = performance.now();
    let body;
    try {
      const response = await fetch(ready.origin + paths[key], { signal: AbortSignal.timeout(45_000) });
      body = await response.json();
      assert.equal(response.status, 200);
      if (key.endsWith("attention")) {
        assert.deepEqual(body.background_tasks, expected, `${key} must retain every task and its exact owner/content/order`);
        assert.ok(Array.isArray(body.notices)); assert.equal(typeof body.plugin_events_pending, "number");
        if (key === "attention") assert.equal(typeof body.board_cursor, "number"); else assert.equal(body.board_cursor, null);
      } else if (key === "cursor") assert.equal(typeof body.observed_event_cursor, "number");
      responses[key] ??= body;
      if (record) (samples[key] ??= []).push({ start_ms: start, elapsed_ms: performance.now() - start });
    } catch (error) { errors.push({ key, start_ms: start, elapsed_ms: performance.now() - start, message: String(error), body }); }
  }
  // Warm each real route, then keep sequential attention observations distinct from the multi-tab load.
  for (const key of Object.keys(paths)) await request(key, false);
  assert.deepEqual(errors, [], "warmup output is complete before measuring");
  const single = [];
  for (let i = 0; i < 5; i++) { const start = performance.now(); await request("attention", false); single.push(performance.now() - start); }
  server.child.send({ type: "start" }); await server.receive("started");
  const started = performance.now(), inflight = new Set(), timers = [];
  let stopped = false;
  function schedule(key, interval, offset) {
    let busy = false, pending = false;
    const tick = () => {
      if (stopped) return;
      if (busy) { pending = true; return; }
      busy = true;
      const operation = request(key).finally(() => { busy = false; inflight.delete(operation);
        if (pending && !stopped) { pending = false; tick(); } });
      inflight.add(operation);
    };
    timers.push(setTimeout(() => { tick(); timers.push(setInterval(tick, interval)); }, offset));
  }
  for (let tab = 0; tab < tabs; tab++) schedule(tab === 1 ? "home_attention" : "attention", 15_000, tab * 5_000);
  schedule("health", 250, 75); schedule("cursor", 1_000, 125);
  await pause(duration); stopped = true; for (const timer of timers) clearTimeout(timer);
  await Promise.all([...inflight]);
  server.child.send({ type: "stop" }); const { metrics } = await server.receive("metrics");
  assert.equal(metrics.open_projects, count, "scheduler must not silently increase the project count");
  return { arm, projects: count, tabs, duration_ms: performance.now() - started, node: ready.node, descriptors: ready.descriptors,
    sequential_attention: quantiles(single), routes: Object.fromEntries(Object.entries(samples).map(([key, rows]) => [key, quantiles(rows.map(row => row.elapsed_ms))])),
    errors, metrics, eld: { ...quantiles(metrics.eld_windows.map(row => row.max_ms)), windows_above_1000ms: metrics.eld_windows.filter(row => row.max_ms > 1_000).length },
    responses, samples: Object.fromEntries(Object.entries(samples).map(([key, rows]) => [key, rows.map(row => ({ ...row, start_ms: row.start_ms - started }))])) };
}

const results = [];
for (const count of countsArg.split(",").map(Number)) {
  const root = join(data, String(count)), home = join(root, "home"), seed = join(root, "seed");
  await mkdir(root, { recursive: true });
  if (!existsSync(seed)) {
    await mkdir(home, { recursive: true });
    const server = launch(home, "seed", count, `seed-${count}`);
    try { const info = await server.receive("seeded"); await writeFile(join(root, "projects.json"), JSON.stringify(info.projects, null, 2)); }
    finally { await server.close(); }
    await cp(home, seed, { recursive: true });
  }
  for (const tabs of tabsArg.split(",").map(Number)) {
    const label = `${arm}-${count}p-${tabs}t`;
    await rm(home, { recursive: true, force: true }); await cp(seed, home, { recursive: true });
    const server = launch(home, "serve", count, label, count === 14 && tabs === 3 ? join(output, `${label}.cpuprofile`) : undefined);
    try {
      const ready = await server.receive("ready");
      process.stdout.write(`${label}: ${ready.descriptors} descriptors, ready\n`);
      const result = await measure(server, ready, count, tabs);
      await writeFile(join(output, `${label}.json`), JSON.stringify(result, null, 2)); results.push(result);
      const { responses, samples, metrics, ...summary } = result;
      process.stdout.write(`${JSON.stringify({ ...summary, cpu_percent_one_core: metrics.cpu_percent_one_core, status_calls: metrics.status_calls })}\n`);
    } finally { await server.close(); }
  }
}
await writeFile(join(output, `${arm}-summary.json`), JSON.stringify(results.map(({ responses, samples, ...row }) => row), null, 2));
assert.ok(results.every(result => result.errors.length === 0), "load had errors; inspect the preserved results");
