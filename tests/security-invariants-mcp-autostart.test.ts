import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createMcpResidentStarter, runtimeContextHostFromEnvironment } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "@molis-ai/molis-work-app-desktop";

async function fixture(t: TestContext, respond: (request: IncomingMessage, response: ServerResponse, token: string) => void) {
  const home = await mkdtemp(join(tmpdir(), "mcp-health-")), token = randomBytes(32).toString("base64url");
  await mkdir(join(home, "config")); await writeFile(join(home, "config/web-control-token"), token);
  const server = createServer((request, response) => respond(request, response, token));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const starter = createMcpResidentStarter();
  t.after(async () => {
    starter.close(); const closed = new Promise<void>(resolve => server.close(() => resolve())); server.closeAllConnections(); await closed;
    await rm(home, { recursive: true, force: true });
  });
  return { home, token, starter, origin: `http://127.0.0.1:${address.port}`, server };
}

function signed(response: ServerResponse, token: string, challenge: string, body: string, status = 200) {
  const proof = createHmac("sha256", token).update(`${challenge}\n${body}`).digest("base64url");
  response.writeHead(status, { "content-length": Buffer.byteLength(body), "x-molis-work-proof": proof }); response.end(body);
}

test("RAC-625 RAC-627: authenticated existing Home is reused without a launcher; probes disclose no token or request body", async t => {
  const challenges = new Set<string>(); let calls = 0;
  const f = await fixture(t, (request, response, token) => {
    assert.equal(request.method, "GET"); assert.equal(request.headers["x-molis-work-control-token"], undefined);
    assert.equal(request.headers.authorization, undefined); assert.equal(request.headers["content-length"], undefined);
    const url = new URL(request.url!, "http://localhost"); assert.equal(url.pathname, "/health");
    const challenge = url.searchParams.get("challenge")!;
    assert.match(challenge, /^[A-Za-z0-9_-]{43}$/); assert.ok(!challenges.has(challenge)); challenges.add(challenge);
    calls++; signed(response, token, challenge, JSON.stringify({ status: calls === 1 ? "starting" : "ok", desktop_tui: true }), calls === 1 ? 503 : 200);
  });
  await f.starter.ensure(f.home, f.origin, t.signal);
  await f.starter.ensure(f.home, f.origin, t.signal);
  assert.equal(calls, 3); await assert.rejects(stat(join(f.home, "bin")), { code: "ENOENT" });
  assert.equal(await readFile(join(f.home, "config/web-control-token"), "utf8"), f.token);
});

for (const variant of ["wrong-home", "old-challenge", "tampered", "oversized", "bad-json", "redirect", "missing-proof", "not-ready", "chunked"] as const) {
  test(`RAC-627: ${variant} health refuses without starting a candidate or sending credentials`, async t => {
    let requests = 0;
    const f = await fixture(t, (request, response, token) => {
      requests++; assert.equal(request.headers["x-molis-work-control-token"], undefined);
      const challenge = new URL(request.url!, "http://localhost").searchParams.get("challenge")!;
      const body = variant === "bad-json" ? "{" : variant === "oversized" ? "x".repeat(4097) : JSON.stringify({ status: "ok", desktop_tui: variant !== "not-ready" });
      if (variant === "redirect") { response.writeHead(302, { location: "/other", "content-length": "0" }); response.end(); }
      else if (variant === "missing-proof") { response.writeHead(200, { "content-length": Buffer.byteLength(body) }); response.end(body); }
      else if (variant === "chunked") { response.writeHead(200, { "x-molis-work-proof": createHmac("sha256", token).update(`${challenge}\n${body}`).digest("base64url") }); response.write(body); response.end(); }
      else if (variant === "tampered") {
        const proof = createHmac("sha256", token).update(`${challenge}\n${body}`).digest("base64url"), changed = body.replace("ok", "no");
        response.writeHead(200, { "content-length": Buffer.byteLength(changed), "x-molis-work-proof": proof }); response.end(changed);
      } else signed(response, variant === "wrong-home" ? "other-home-key".repeat(4) : token, variant === "old-challenge" ? "a".repeat(43) : challenge, body);
    });
    await assert.rejects(f.starter.ensure(f.home, f.origin, t.signal), { code: "actions.transport_invalid" });
    assert.equal(requests, 1); await assert.rejects(stat(join(f.home, "bin")), { code: "ENOENT" });
  });
}

test("RAC-628: one cancelled waiter cannot cancel another waiter for the same Home", async t => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, (request, response, token) => {
    enter(); void barrier.then(() => signed(response, token, new URL(request.url!, "http://localhost").searchParams.get("challenge")!, '{"status":"ok","desktop_tui":true}'));
  });
  const first = new AbortController();
  const a = f.starter.ensure(f.home, f.origin, first.signal), b = f.starter.ensure(f.home, f.origin, t.signal);
  const refused = assert.rejects(a, /first stopped/); await entered; first.abort(new Error("first stopped")); await refused;
  release(); await b;
});

test("RAC-628: a stalled probe is bounded to one second but readiness can recover inside the total budget", async t => {
  let probes = 0;
  const f = await fixture(t, (request, response, token) => {
    if (++probes === 1) return;
    signed(response, token, new URL(request.url!, "http://localhost").searchParams.get("challenge")!, '{"status":"ok","desktop_tui":true}');
  });
  const start = performance.now(); await f.starter.ensure(f.home, f.origin, t.signal);
  assert.ok(performance.now() - start >= 1000); assert.equal(probes, 2);
  await assert.rejects(stat(join(f.home, "bin")), { code: "ENOENT" });
});

test("RAC-627 RAC-628: an unresponsive listener never authorizes spawn and expires the single total budget", { timeout: 30_000 }, async t => {
  let probes = 0;
  const f = await fixture(t, (request, _response) => { probes++; assert.equal(request.method, "GET"); assert.equal(request.headers["x-molis-work-control-token"], undefined); });
  const start = performance.now();
  await assert.rejects(f.starter.ensure(f.home, f.origin, t.signal), { code: "actions.service_unavailable" });
  assert.ok(performance.now() - start >= 19_500 && performance.now() - start < 25_000);
  assert.ok(probes > 1); await assert.rejects(stat(join(f.home, "bin")), { code: "ENOENT" });
});

test("RAC-625 RAC-627: port zero, a relative Home and a pre-cancelled request refuse before probing", async t => {
  let requests = 0;
  const f = await fixture(t, (_request, response) => { requests++; response.end(); });
  await assert.rejects(f.starter.ensure(f.home, "http://127.0.0.1:0", t.signal), { code: "actions.transport_invalid" });
  await assert.rejects(f.starter.ensure("relative", f.origin, t.signal), { code: "actions.home_required" });
  await assert.rejects(f.starter.ensure(f.home, f.origin, AbortSignal.abort(new Error("already stopped"))), /already stopped/);
  assert.equal(requests, 0);
});

test("RAC-625 RAC-627: only the same Home entry executes, with spaces and shell metacharacters preserved; PATH is unused", async t => {
  const f = await fixture(t, () => { assert.fail("the reserved listener was closed"); });
  await new Promise<void>(resolve => f.server.close(() => resolve()));
  const home = join(f.home, "trusted home;space"), other = join(f.home, "other-install"), correct = join(f.home, "correct"), wrong = join(f.home, "wrong");
  const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
  await mkdir(join(home, "bin"), { recursive: true }); await mkdir(other);
  await writeFile(join(home, "bin/molis-work-web"), `#!/bin/sh\nprintf started > ${quote(correct)}\nexit 1\n`, { mode: 0o755 });
  await writeFile(join(other, "molis-work-web"), `#!/bin/sh\nprintf wrong > ${quote(wrong)}\nexit 1\n`, { mode: 0o755 });
  const original = process.env.PATH; process.env.PATH = `${other}:${original ?? ""}`;
  try { await assert.rejects(f.starter.ensure(home, f.origin, t.signal), { code: "mcp.startup_failed" }); }
  finally { process.env.PATH = original; }
  assert.equal(await readFile(correct, "utf8"), "started"); await assert.rejects(stat(wrong), { code: "ENOENT" });
});

test("RAC-625 RAC-628: tool-supplied command, Home, port, actor and invalid payload never reach the startup service", async t => {
  const f = await fixture(t, () => { assert.fail("preflight must not probe or send anything"); });
  const host = runtimeContextHostFromEnvironment({ MOLIS_WORK_RUNTIME_ID: "codex", MOLIS_WORK_HOME: f.home }, f.home); assert.ok(host);
  const server = new MolisWorkServer("runtime", undefined, host, undefined, f.origin, f.starter.ensure);
  t.after(() => server.close());
  for (const input of [{ command: "/bin/echo" }, { home: "/another-home" }, { port: 0 }, { actor_id: "forged" }]) {
    await assert.rejects(server.callTool("molis_work_v1_context_resolve", input), { code: "mcp.unexpected_field" });
  }
  await assert.rejects(server.callTool("molis_work_v1_context_bind", { project_id: "x", user_confirmed: "yes" }), { code: "actions.input_invalid" });
  await assert.rejects(stat(join(f.home, "projects")), { code: "ENOENT" });
});

for (const changed of ["runtime", "connection"] as const) {
  test(`RAC-628: ${changed} change aborts readiness before any context POST or local catalog open`, async t => {
    let enter!: () => void, posts = 0;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const f = await fixture(t, (request, _response) => { if (request.method === "POST") posts++; enter(); });
    const host = runtimeContextHostFromEnvironment({ MOLIS_WORK_RUNTIME_ID: "codex", MOLIS_WORK_HOME: f.home,
      MOLIS_WORK_WORK_CONTEXT_ID: "before-change", MOLIS_WORK_WORK_CONTEXT_STABLE: "true" }, f.home);
    assert.ok(host);
    const server = new MolisWorkServer("runtime", undefined, host, undefined, f.origin, f.starter.ensure);
    t.after(() => server.close());
    const result = server.callTool("molis_work_v1_context_resolve", {});
    const rejected = assert.rejects(result, changed === "runtime" ? { code: "mcp.context_changed" } : /MCP 项目连接已变化/);
    await entered;
    if (changed === "runtime") server.runtimeContextHost = { ...host, homeDirectory: join(f.home, "another-home") };
    else server.runtimeConnection = { projectId: "changed-project", databasePath: join(f.home, "never-open.sqlite"), webBaseUrl: f.origin };
    await rejected; assert.equal(posts, 0);
    await assert.rejects(stat(join(f.home, "projects")), { code: "ENOENT" });
    await assert.rejects(stat(join(f.home, "agent-runtime")), { code: "ENOENT" });
  });
}
