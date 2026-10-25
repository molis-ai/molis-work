import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { installedMcpHome, tool, waitUntil } from "./fixtures/mcp-autostart.js";

function webProcess(t: TestContext, command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env, detached: true, stdio: ["ignore", "pipe", "pipe", "pipe"] });
  const channel = child.stdio[3] as Readable;
  let diagnostic = "", errors = "", output = "", ended = false;
  channel.on("data", chunk => { diagnostic += String(chunk); });
  child.stderr!.on("data", chunk => { errors = (errors + String(chunk)).slice(-4000); });
  child.stdout!.on("data", chunk => { output += String(chunk); });
  channel.once("end", () => { ended = true; });
  const eof = () => waitUntil(async () => ended);
  const closed = new Promise<number | null>(resolve => {
    child.once("error", error => { errors += String(error); resolve(null); });
    child.once("close", code => resolve(code));
  });
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* This owned candidate may have exited. */ }
    }
    const timer = setTimeout(() => {
      if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* The owned group already exited. */ } }
    }, 5000);
    try { await closed; } finally { clearTimeout(timer); }
  };
  t.after(close);
  return { child, eof, closed, close, diagnostic: () => diagnostic, errors: () => errors, output: () => output };
}

interface Observation { pid: number; fd3Open: boolean; marker: string | null; descendantMarker: string | null }

test("RAC-628-S1 RAC-628-S2 RAC-628-S3: installed startup diagnostics end while the resident remains usable", { timeout: 240_000 }, async t => {
  const f = await installedMcpHome(t);
  const preload = fileURLToPath(new URL("./fixtures/mcp-web-startup-observer.mjs", import.meta.url));
  const baseEnv = { PATH: process.env.PATH, HOME: f.root, TMPDIR: f.root, LANG: "en_US.UTF-8", TZ: "UTC",
    MOLIS_WORK_HOME: f.home, MOLIS_WORK_WEB_URL: f.origin, PWD: f.home };
  const port = new URL(f.origin).port;
  async function observation(file: string): Promise<Observation> {
    await waitUntil(async () => { try { await readFile(file); return true; } catch { return false; } }, 20_000);
    return JSON.parse(await readFile(file, "utf8")) as Observation;
  }
  async function ready() {
    await waitUntil(async () => { try { await f.health(); return true; } catch { return false; } }, 20_000);
    return f.health();
  }
  await t.test("RAC-628-S1: the real Node wrapper releases its copy, Web closes fd3, and another MCP reuses the same owner", async st => {
    st.after(f.cleanupCase);
    const file = join(f.root, "ready-success");
    await f.configureWeb({ NODE_OPTIONS: `--import=${JSON.stringify(preload)}`, MOLIS_WORK_TEST_C5_READY: file });
    await f.release();
    const launched = webProcess(st, f.installed.launchers.web, ["--home", f.home, "--port", port], { ...baseEnv, MOLIS_WORK_MCP_WEB_STARTUP: "1" });
    const first = await ready(), actual = await observation(file);
    await launched.eof(); assert.equal(launched.diagnostic(), "");
    assert.deepEqual(actual, { pid: first.process_id, fd3Open: false, marker: null, descendantMarker: null });
    assert.equal(launched.child.exitCode, null, "diagnostic EOF must not end the resident or its wrapper");
    const peer = await f.connect("after-private-eof"); await tool(peer, "context_resolve"); await peer.close();
    assert.deepEqual(await f.health(), first); await f.stopHost(); await launched.closed;
  });
  t.signal.throwIfAborted();
  for (const mode of ["cancel", "EOF"] as const) {
    await t.test(`RAC-628-S2: MCP ${mode} ends its wait but the candidate clears startup resources and serves the next client`, async st => {
      st.after(f.cleanupCase); await f.reset();
      const file = join(f.root, `ready-${mode}`);
      await f.configureWeb({ NODE_OPTIONS: `--import=${JSON.stringify(preload)}`, MOLIS_WORK_TEST_C5_READY: file });
      const before = (await readdir(f.attempts)).length, peer = await f.connect(`abandoned-${mode}`);
      const request = peer.request("tools/call", { name: "molis_work_v1_context_resolve", arguments: {} });
      const ended = assert.rejects(request.promise, /MCP closed/);
      await waitUntil(async () => (await readdir(f.attempts)).length > before);
      if (mode === "cancel") { peer.notify({ method: "notifications/cancelled", params: { requestId: request.id } }); await peer.request("ping").promise; }
      await peer.close(); await ended; await f.release();
      const first = await ready(), actual = await observation(file);
      assert.deepEqual(actual, { pid: first.process_id, fd3Open: false, marker: null, descendantMarker: null });
      const next = await f.connect(`survivor-${mode}`); await tool(next, "context_resolve"); await next.close();
      assert.deepEqual(await f.health(), first); await f.stopHost();
    });
    t.signal.throwIfAborted();
  }
  await t.test("RAC-628-S2: listen failure reports only code/kind and closes the private channel", async st => {
    st.after(f.cleanupCase);
    const occupied = createServer(); await new Promise<void>(resolve => occupied.listen(Number(port), "127.0.0.1", resolve));
    st.after(() => new Promise<void>(resolve => occupied.close(() => resolve())));
    const child = webProcess(st, f.installed.launchers.web, ["--home", f.home, "--port", port], { ...baseEnv, MOLIS_WORK_MCP_WEB_STARTUP: "1" });
    await child.eof(); const status = JSON.parse(child.diagnostic()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(status).sort(), ["code", "kind"]);
    assert.equal(status.code, "actions.service_unavailable"); assert.equal(status.kind, "unavailable");
    await child.closed;
    // Shutdown may finish successfully after refusing startup; only authenticated health can authorize reuse.
    await assert.rejects(f.health());
  });
  t.signal.throwIfAborted();
  await t.test("RAC-628-S3: an ordinary Web caller retains its own fd3", async st => {
    st.after(f.cleanupCase);
    const file = join(f.root, "ready-ordinary");
    const child = webProcess(st, process.execPath, [join(f.installed.program_directory, "web/server.js"), "--home", f.home, "--port", port],
      { ...baseEnv, NODE_OPTIONS: `--import=${JSON.stringify(preload)}`, MOLIS_WORK_TEST_C5_READY: file });
    const first = await ready(), actual = await observation(file);
    assert.deepEqual(actual, { pid: first.process_id, fd3Open: true, marker: null, descendantMarker: null });
    await waitUntil(async () => child.diagnostic() === "ordinary caller fd\n");
    await f.stopHost(); await child.closed;
  });
});

test("RAC-628-S2: clearing startup diagnostics keeps the original twenty-second readiness watch", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-startup-watch-")), token = randomBytes(32).toString("base64url");
  await mkdir(join(home, "config")); await writeFile(join(home, "config/web-control-token"), token);
  let probes = 0;
  const server = createServer((request, response) => {
    probes++; const challenge = new URL(request.url!, "http://localhost").searchParams.get("challenge");
    const body = '{"status":"starting","desktop_tui":true}';
    response.writeHead(503, { "content-length": Buffer.byteLength(body), "x-molis-work-proof": createHmac("sha256", token).update(`${challenge}\n${body}`).digest("base64url") });
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const program = `import {watchMcpWebStartup,finishMcpWebStartup} from '@molis-ai/molis-work-app-local-host';
const start=performance.now(); watchMcpWebStartup(${JSON.stringify(home)},${JSON.stringify(`http://127.0.0.1:${address.port}`)},()=>{
  process.stdout.write(JSON.stringify({elapsed:performance.now()-start,marker:process.env.MOLIS_WORK_MCP_WEB_STARTUP??null}),()=>process.exit(2));
});finishMcpWebStartup();`;
  const child = webProcess(t, process.execPath, ["--input-type=module", "-e", program], { PATH: process.env.PATH, HOME: home, MOLIS_WORK_MCP_WEB_STARTUP: "1" });
  await child.eof(); assert.equal(child.child.exitCode, null);
  assert.equal(await child.closed, 2);
  const result = JSON.parse(child.output()) as { elapsed: number; marker: string | null };
  assert.ok(result.elapsed >= 19_500 && result.elapsed < 25_000); assert.equal(result.marker, null); assert.ok(probes > 1);
});
