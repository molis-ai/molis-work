import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { auditFirstScreen } from "../scripts/first-screen/audit.mjs";

function fixture(t, mode) {
  const root = mkdtempSync(join(tmpdir(), "molis-first-screen-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, contents) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  };
  put("dist/web/server.js", "");
  put("tooling/gates/first-screen.json", "[]");
  put("apps/desktop/dist/index.js", `
export async function openMolisWorkProjectCatalog() {
  return {
    createProject: input => input,
    addProjectPlugin() {},
    ensureDemoProject: () => ({ project: { project_id: "molis-work-v1-demo" } }),
    close() {},
  };
}
`);
  put("apps/local-host/dist/index.js", "export const PROJECT_SCOPED_PLUGIN_IDS = [];");
  put("scripts/visual/selected-home-server.mjs", `
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
const [home, port] = process.argv.slice(2);
const mode = ${JSON.stringify(mode)};
writeFileSync("host.json", JSON.stringify({ home, pid: process.pid }));
if (mode === "startup-signal") process.kill(process.pid, "SIGTERM");
else {
  const server = createServer((request, response) => {
    if (request.url === "/health") { response.end("ok"); return; }
    if (request.url === "/onboarding") {
      if (request.headers.cookie.endsWith("=en")) {
        if (mode === "mid-run-signal") { process.kill(process.pid, "SIGTERM"); return; }
        if (mode === "cancel") { writeFileSync("waiting", ""); return; }
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end('<link href="/assets/linked.css" rel="stylesheet">');
    } else {
      if (mode === "missing-link") response.writeHead(404);
      response.end("asset body");
    }
  });
  server.listen(Number(port), "127.0.0.1");
}
`);
  cpSync("scripts/first-screen-report.mjs", join(root, "scripts/first-screen-report.mjs"));
  cpSync("scripts/first-screen", join(root, "scripts/first-screen"), { recursive: true });
  symlinkSync(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
  const out = join(root, "result");
  const child = spawn(process.execPath, ["scripts/first-screen-report.mjs", "--pages", "arrival-empty", "--http-only", "--out", out], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => resolve({ code, stdout, stderr }));
  });
  return {
    child, result, out,
    host: () => JSON.parse(readFileSync(join(root, "host.json"), "utf8")),
    waiting: () => existsSync(join(root, "waiting")),
  };
}

function assertClean(run) {
  const { home, pid } = run.host();
  assert.equal(existsSync(home), false, "isolated Home is removed");
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "owned Host is gone");
}

for (const [mode, failure] of [
  ["startup-signal", /Host exited with SIGTERM/],
  ["mid-run-signal", /Host exited with SIGTERM|arrival-empty\/en GET \/onboarding: (socket hang up|aborted)/],
  ["missing-link", /linked.css: HTTP 404/],
]) {
  test(`FSS-BG-03 ${mode} fails the real reporter and publishes no partial run`, { timeout: 8_000 }, async t => {
    const run = fixture(t, mode);
    const result = await run.result;
    assert.notEqual(result.code, 0, result.stdout);
    assert.match(result.stderr, failure);
    assert.equal(existsSync(run.out), false);
    assertClean(run);
  });
}

test("FSS-BG-03 cancelling the reporter stops the blocked request and cleans the Home", { timeout: 8_000 }, async t => {
  const run = fixture(t, "cancel");
  for (let attempt = 0; attempt < 50 && !run.waiting(); attempt += 1) await delay(100);
  assert.ok(run.waiting(), "one locale completed and the next request is in flight");
  run.child.kill("SIGINT");
  const result = await run.result;
  assert.equal(result.code, 130);
  assert.equal(existsSync(run.out), false);
  assertClean(run);
});

test("FSS-BG-03 a complete run publishes both locales and cleans the Home", { timeout: 8_000 }, async t => {
  const run = fixture(t, "complete");
  const result = await run.result;
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(readFileSync(join(run.out, "http.json"), "utf8"));
  assert.equal(report["arrival-empty/zh"].assets["/assets/linked.css"].raw, Buffer.byteLength("asset body"));
  assert.equal(report["arrival-empty/en"].html.raw, Buffer.byteLength('<link href="/assets/linked.css" rel="stylesheet">'));
  assertClean(run);
});


test("FSS-BG-04 browser audit reports missed GETs and non-GETs without failing for an omission", () => {
  const key = "chooser/en";
  const observed = (method, url, status) => ({ method, url, status, same_origin: true });
  const http = { [key]: { responses: { "/": {}, "/known.js": {}, "/old.js": {} } } };
  const requests = [observed("GET", "/", 200), observed("GET", "/known.js", 304), observed("GET", "/api/bootstrap", 200),
    observed("GET", "/favicon.ico", 404), observed("POST", "/api/host/plugin-pages", 201)];
  const browser = { [key]: [{ cold: { requests }, warm: { requests } }] };
  const audit = auditFirstScreen(http, browser)[key];
  assert.deepEqual(audit.unregistered, [
    { method: "GET", path: "/api/bootstrap", visits: ["cold", "warm"], outcomes: [200] },
    { method: "GET", path: "/favicon.ico", visits: ["cold", "warm"], outcomes: [404] },
  ]);
  assert.deepEqual(audit.excluded, [{ method: "POST", path: "/api/host/plugin-pages", visits: ["cold", "warm"], outcomes: [201] }]);
  assert.deepEqual(audit.registered_not_observed, ["/old.js"]);
  requests[1].status = 500;
  assert.throws(() => auditFirstScreen(http, browser), /chooser\/en cold GET \/known.js: browser returned HTTP 500/);
});
