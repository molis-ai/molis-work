import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { WebSocketServer } from "ws";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "@molis-ai/molis-work-app-local-host";
import { openEntryTerminal } from "./fixtures/desktop-entry-streams.js";

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; return false; }
}

// RAC-2205: the spawned reply fails its assertion, not the start itself. The fixture must stop the real child anyway (a fake Host starts
// the same child a real PTY would own when Goals' route is asked, then its /pty answers the attach with an error).
test("RAC-2205 a failing spawned assertion stops the real PTY child instead of leaving an orphan", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-desktop-entry-"));
  const pidFile = join(home, "shutdown-pty.pid");
  const children: ChildProcess[] = [];
  t.after(() => {
    for (const child of children) if (child.pid && processAlive(child.pid)) process.kill(child.pid, "SIGKILL");
    rmSync(home, { recursive: true, force: true });
  });
  mkdirSync(dirname(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH)), { recursive: true });
  writeFileSync(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), "RAC-2205 fake control token\n");
  const http = createServer((request, response) => {
    request.resume();
    if (request.method !== "POST" || !/\/goals\/[^/]+\/terminals$/u.test(request.url ?? "")) { response.writeHead(404).end(); return; }
    const child = spawn(process.execPath, ["-e", 'require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)', pidFile], { cwd: home, stdio: "ignore" });
    children.push(child);
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ panel_id: "fake-panel", key: "shutdown", started: true }));
  });
  const server = new WebSocketServer({ server: http });
  t.after(() => new Promise<void>(resolve => { for (const client of server.clients) client.terminate(); server.close(() => http.close(() => resolve())); }));
  server.on("connection", socket => {
    socket.on("message", raw => {
      const message = JSON.parse(String(raw)) as { type?: string; panelId?: string };
      if (message.type === "auth") { socket.send(JSON.stringify({ type: "ready" })); return; }
      if (message.type !== "spawn") return;
      socket.send(JSON.stringify({ type: "error", panelId: message.panelId, message: "the fake owner started the child but did not answer spawned" }));
    });
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  assert.ok(address !== null && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  await t.test("the spawned assertion fails", async child => {
    await assert.rejects(() => openEntryTerminal(child, origin, home, "fake-project"), /spawned/);
  });
  const until = Date.now() + 2000;
  while (!existsSync(pidFile) && Date.now() < until) await delay(20);
  const pid = Number(readFileSync(pidFile, "utf8"));
  assert.ok(Number.isSafeInteger(pid) && pid > 0, "the simulated PTY child wrote its pid");
  const stopDeadline = Date.now() + 1500;
  while (processAlive(pid) && Date.now() < stopDeadline) await delay(20);
  assert.equal(processAlive(pid), false, "a failing spawned assertion stops the real child instead of leaving an orphan");
});
