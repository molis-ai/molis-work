// Security invariants S-01 .. S-08 (docs/system/SECURITY-INVARIANTS.md): the local control entry of the web host.
// Every test asserts the REFUSAL itself, on the real web host (createMolisWorkWebServer) or the real launcher process:
//   S-01  the launcher listens on loopback only
//   S-02  a foreign Host header (DNS rebinding) is refused, for every method and every route
//   S-03  a mutation needs a same-origin Origin, the control token and a one-time operation key; a non-API mutation is refused
//   S-04  the PTY and side-panel browser sockets refuse a foreign Origin, a foreign Host and an unauthenticated first message
//   S-05  no channel answers before the control token: the retired Casebook path is refused like any other, and a leftover Casebook configuration is not read
//   S-06  the control token is long, random and owner-only
//   S-21  no answer of the host can be shown in another origin's frame (clickjacking)
// The tests import public entries only (tests/*.test.ts may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import net, { type AddressInfo } from "node:net";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { WebSocket } from "ws";
import { BROWSER_SOCKET_PATH } from "@molis-ai/molis-work-contracts/services/browser";
import { createMolisWorkWebServer, resolveWebControlToken, WEB_CONTROL_TOKEN_RELATIVE_PATH } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "security-invariants-control-token-0123456789abcdef";
const LAUNCHER = fileURLToPath(new URL("../apps/desktop/launchers/web/server.ts", import.meta.url));

interface Host { home: string; port: number; origin: string; sockets: WebSocket[] }
async function startHost(t: TestContext, options: Parameters<typeof createMolisWorkWebServer>[0] = {}): Promise<Host> {
  const home = await mkdtemp(join(os.tmpdir(), "security-invariants-"));
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN, ...options });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const sockets: WebSocket[] = [];
  t.after(async () => {
    // Upgraded sockets are not HTTP connections: close() would wait for them for ever.
    for (const socket of sockets) socket.terminate();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  });
  return { home, port, origin: `http://127.0.0.1:${port}`, sockets };
}

interface Answer { status: number; body: string; headers: http.IncomingHttpHeaders }
/** One request with every header chosen by the caller, the Host header included (fetch() would not let a test lie about it). */
function send(host: Host, method: string, path: string, headers: Record<string, string | undefined> = {}, body?: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const clean = Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined));
    // A fresh connection per request: a host that refuses without reading the body closes the socket, and a reused one would hang up.
    const request = http.request({ host: "127.0.0.1", port: host.port, method, path, agent: false, headers: { host: `127.0.0.1:${host.port}`, ...clean } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: response.headers }));
    });
    request.on("error", reject);
    request.end(body);
  });
}
/** A mutation as the workbench page makes it: its own origin, the page's token, a fresh one-time key. */
const good = (host: Host, overrides: Record<string, string | undefined> = {}) => ({
  origin: host.origin, "content-type": "application/json", "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID(), ...overrides });
/** A mutation route that exists and that this test never lets do anything: the action gateway refuses an empty body with 400. */
const GATEWAY = "/api/internal/action-service";
const ASSISTANT_SWITCH = "/api/browser/assistant";

// ---- S-01 ------------------------------------------------------------------------------------------------------

/** Every address of this machine that is not the loopback interface. */
function foreignAddresses(): string[] {
  return Object.values(os.networkInterfaces()).flatMap(list => list ?? []).filter(entry => !entry.internal && !entry.address.startsWith("fe80:")).map(entry => entry.address);
}
/**
 * Whether the process `pid` answers when asked at `address`. A bare TCP connect proves nothing on a machine whose proxy or
 * VPN accepts connections for addresses it owns (a fake-IP TUN does); an answer carrying the launcher's own process id does.
 */
function answersAt(address: string, port: number, pid: number): Promise<boolean> {
  return new Promise(resolve => {
    const request = http.get({ host: address, port, path: "/health", headers: { host: `127.0.0.1:${port}` }, timeout: 2500 }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")).process_id === pid); } catch { resolve(false); } });
    });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}
async function freePort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  return port;
}

test("S-01 the launcher listens on 127.0.0.1 only: it announces that address and no other address of this machine reaches it", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(os.tmpdir(), "security-invariants-launcher-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", "tsx", LAUNCHER, "--port", String(port), "--home", home], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MOLIS_WORK_HOME: home } });
  let output = "", errors = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { errors += String(chunk); });
  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise<void>(resolve => { child.once("exit", () => resolve()); setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000).unref(); });
    await rm(home, { recursive: true, force: true });
  });
  const deadline = Date.now() + 40_000;
  while (!output.includes("Molis Work Web:") && child.exitCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.match(output, new RegExp(`Molis Work Web: http://127\\.0\\.0\\.1:${port}\\b`), `the launcher announces the address its socket really got (stderr: ${errors})`);
  assert.equal(await answersAt("127.0.0.1", port, child.pid!), true, "the loopback address itself is served");
  const others = foreignAddresses();
  t.diagnostic(`other addresses of this machine: ${others.join(", ") || "none"}`);
  // 198.18.0.0/15 is where a fake-IP proxy (Clash, Surge, Stash) puts its tunnel; the tunnel hands what it is sent to the loopback
  // listener whatever that listener is bound to, so an answer there says nothing about the launcher (the repository treats the
  // range specially elsewhere for the same reason).
  const reachable = others.filter(address => !/^198\.1[89]\./.test(address));
  for (const address of reachable) assert.equal(await answersAt(address, port, child.pid!), false, `${address}:${port} must not reach the launcher`);
  assert.equal(await answersAt("::1", port, child.pid!), false, "the IPv6 loopback is another socket and is not bound either");
});

// ---- S-02 ------------------------------------------------------------------------------------------------------

test("S-02 a Host header that is not a loopback name is refused for every method and route, the pages' own and the API's", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  const foreign = ["evil.example", `evil.example:${host.port}`, `127.0.0.1.evil.example:${host.port}`, `localhost.evil.example:${host.port}`, `127.0.0.1@evil.example`, "0.0.0.0", `192.168.1.20:${host.port}`, "[::ffff:127.0.0.1]"];
  for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of ["/", "/locale?lang=en", "/api/settings/projects", GATEWAY, "/assets/missing.css"]) {
      for (const name of foreign) {
        const answer = await send(host, method, path, { host: name, ...(method === "GET" || method === "HEAD" ? {} : good(host, { host: name })) });
        assert.equal(answer.status, 403, `${method} ${path} with Host: ${name} answered ${answer.status}`);
      }
    }
  }
  // A request with no Host at all (HTTP/1.0) has no name to rebind and is refused as well.
  const bare = await new Promise<string>(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port: host.port }, () => socket.write("GET /locale?lang=en HTTP/1.0\r\n\r\n"));
    let data = ""; socket.on("data", chunk => { data += String(chunk); }); socket.on("close", () => resolve(data));
  });
  assert.match(bare.split("\r\n")[0] ?? "", /^HTTP\/1\.[01] 403\b/);
  // The names a person's own browser uses still get through (the control: the refusals above are about the name).
  for (const name of [`127.0.0.1:${host.port}`, `localhost:${host.port}`, `[::1]:${host.port}`]) {
    assert.equal((await send(host, "GET", "/locale?lang=en", { host: name })).status, 302, `Host: ${name}`);
  }
});

// ---- S-03 ------------------------------------------------------------------------------------------------------

test("S-03 a mutation without the Origin, the token or the one-time key is refused before any handler runs", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  const post = (headers: Record<string, string | undefined>, path = GATEWAY) => send(host, "POST", path, headers, "{}");
  // The control: a complete mutation reaches the handler (which refuses the empty body itself, with 400 and its own code).
  const reached = await post(good(host));
  assert.equal(reached.status, 400);
  assert.match(reached.body, /actions\.input_invalid/);

  const origins: Array<[string, string | undefined]> = [["no Origin", undefined], ["a foreign site", "http://evil.example"], ["https on the same host", `https://127.0.0.1:${host.port}`],
    ["the null origin", "null"], ["another loopback port", "http://127.0.0.1:1"], ["a path-bearing garbage value", "not a url"]];
  for (const [what, origin] of origins) {
    const answer = await post(good(host, { origin }));
    assert.equal(answer.status, 403, `${what}: ${answer.body}`);
  }
  const tokens: Array<[string, string | undefined]> = [["no token", undefined], ["a wrong token of the same length", "x".repeat(TOKEN.length)], ["a wrong token of another length", "short"],
    ["the right token with a suffix", `${TOKEN}x`], ["the right token with a prefix", `x${TOKEN}`], ["an empty token", ""]];
  for (const [what, token] of tokens) {
    const answer = await post(good(host, { "x-molis-work-control-token": token }));
    assert.equal(answer.status, 403, `${what}: ${answer.body}`);
  }
  // The token is read from its header only: not from the address, a cookie or a form field.
  assert.equal((await post(good(host, { "x-molis-work-control-token": undefined }), `${GATEWAY}?x-molis-work-control-token=${TOKEN}`)).status, 403);
  assert.equal((await post(good(host, { "x-molis-work-control-token": undefined, cookie: `x-molis-work-control-token=${TOKEN}` }))).status, 403);
  assert.equal((await post(good(host, { "x-molis-work-control-token": undefined, authorization: `Bearer ${TOKEN}` }))).status, 403);

  for (const [what, key] of [["no key", undefined], ["a key of 7 characters", "a".repeat(7)], ["a key of 201 characters", "a".repeat(201)], ["an empty key", ""]] as const) {
    const answer = await post(good(host, { "x-molis-work-idempotency-key": key }));
    assert.equal(answer.status, 400, `${what}: ${answer.body}`);
  }
  // Boundaries that are allowed: 8 and 200 characters reach the handler.
  for (const length of [8, 200]) assert.equal((await post(good(host, { "x-molis-work-idempotency-key": "k".repeat(length) }))).status, 400);
});

test("S-03 a refused mutation does not use up its key; a replayed one and a second one in flight are 409", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  const key = randomUUID();
  // A mutation that succeeds and changes nothing that matters: whether the Assistant may use the side-panel browser.
  const accepted = JSON.stringify({ enabled: true });
  const wrong = await send(host, "POST", ASSISTANT_SWITCH, good(host, { "x-molis-work-control-token": "x".repeat(TOKEN.length), "x-molis-work-idempotency-key": key }), accepted);
  assert.equal(wrong.status, 403);
  const first = await send(host, "POST", ASSISTANT_SWITCH, good(host, { "x-molis-work-idempotency-key": key }), accepted);
  assert.equal(first.status, 200, "the key a refused request carried is still free");
  const replay = await send(host, "POST", ASSISTANT_SWITCH, good(host, { "x-molis-work-idempotency-key": key }), accepted);
  assert.equal(replay.status, 409, "a key that has been served is not served again");
  assert.doesNotMatch(replay.body, /"enabled"/, "the replay never reached the handler");
  // A request that failed (the handler said 400) does not use its key up either: the page may correct it and send again.
  const failedKey = randomUUID();
  assert.equal((await send(host, "POST", ASSISTANT_SWITCH, good(host, { "x-molis-work-idempotency-key": failedKey }), "{}")).status, 400);
  assert.equal((await send(host, "POST", ASSISTANT_SWITCH, good(host, { "x-molis-work-idempotency-key": failedKey }), accepted)).status, 200);

  // In flight: the first request announces a body and never finishes it, so its handler waits; the same key is refused meanwhile.
  const inFlightKey = randomUUID();
  const holder = http.request({ host: "127.0.0.1", port: host.port, method: "POST", path: GATEWAY, headers: { host: `127.0.0.1:${host.port}`, ...good(host, { "x-molis-work-idempotency-key": inFlightKey }), "content-length": "100" } });
  holder.on("error", () => undefined);
  holder.write("{");
  t.after(() => holder.destroy());
  // The holder reaches the guard a moment after it is written; an early second request simply runs, is refused by the handler (400), and
  // leaves its key free, so asking again converges on the moment the holder is in flight.
  let second = await send(host, "POST", GATEWAY, good(host, { "x-molis-work-idempotency-key": inFlightKey }), "{}");
  for (let attempt = 0; attempt < 40 && second.status !== 409; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    second = await send(host, "POST", GATEWAY, good(host, { "x-molis-work-idempotency-key": inFlightKey }), "{}");
  }
  assert.equal(second.status, 409);
  assert.match(second.body, /request\.in_flight/);
});

test("S-03 a mutation outside /api/ and /projects/<id>/api/ is refused even with a complete set of credentials", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of ["/", "/settings", "/settings/planning", "/onboarding", "/plugins/io.molis.work.generated.00000000-0000-0000-0000-000000000000", "/side/files/x", "/projects/p1", "/projects/p1/settings",
      "/projects/p1/apix", "/health", "/assets/workbench.js", "/desktop/capsule", "/capabilities/rules"]) {
      const answer = await send(host, method, path, good(host), "{}");
      assert.equal(answer.status, 403, `${method} ${path} answered ${answer.status}: ${answer.body}`);
    }
  }
  // The same refusal for the API prefixes is the one the tests above exercise; a project-scoped API path is guarded too.
  const scoped = await send(host, "POST", "/projects/p1/api/anything", good(host, { "x-molis-work-control-token": undefined }), "{}");
  assert.equal(scoped.status, 403);
});

test("S-03 the IM mount (/im) is not covered by the control token and refuses a foreign Origin, a cross-site fetch and a missing Origin itself", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  const post = (headers: Record<string, string | undefined>) => send(host, "POST", "/im/api/session", { "content-type": "application/json", ...headers }, "{}");
  for (const [what, headers] of [["no Origin", {}], ["a foreign Origin", { origin: "http://evil.example" }], ["a cross-site fetch", { origin: host.origin, "sec-fetch-site": "cross-site" }]] as const) {
    const answer = await post(headers);
    assert.equal(answer.status, 403, `${what}: ${answer.body}`);
    assert.match(answer.body, /server\.origin_denied/);
  }
  const foreignHost = await send(host, "GET", "/im", { host: "evil.example" });
  assert.equal(foreignHost.status, 403);
});

test("S-03 no answer of the host opens it to another origin: no Access-Control-Allow-* header, and a preflight is refused", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  const foreign = { origin: "http://evil.example" };
  for (const path of ["/", "/locale?lang=en", "/health", "/api/settings/connectors/connections", "/api/settings/models", GATEWAY]) {
    const answer = await send(host, "GET", path, foreign);
    for (const header of Object.keys(answer.headers)) assert.doesNotMatch(header, /^access-control-/, `GET ${path} answered with ${header}`);
  }
  for (const path of ["/", GATEWAY, "/api/settings/projects"]) {
    const preflight = await send(host, "OPTIONS", path, { ...foreign, "access-control-request-method": "POST", "access-control-request-headers": "x-molis-work-control-token,x-molis-work-idempotency-key,content-type" });
    assert.equal(preflight.status, 403, `OPTIONS ${path}`);
    for (const header of Object.keys(preflight.headers)) assert.doesNotMatch(header, /^access-control-/, `OPTIONS ${path} answered with ${header}`);
  }
});

// ---- S-04 ------------------------------------------------------------------------------------------------------

/** Opens a socket and resolves with how the upgrade went and what the host said first. */
function open(host: Host, path: string, options: { origin?: string; host?: string } = {}): Promise<{ opened: boolean; refusal?: string; socket: WebSocket }> {
  return new Promise(resolve => {
    const socket = new WebSocket(`ws://127.0.0.1:${host.port}${path}`, { ...(options.origin ? { origin: options.origin } : {}), ...(options.host ? { headers: { host: options.host } } : {}) });
    host.sockets.push(socket);
    socket.once("open", () => resolve({ opened: true, socket }));
    socket.once("unexpected-response", (_request, response) => { resolve({ opened: false, refusal: String(response.statusCode), socket }); response.destroy(); });
    socket.once("error", error => resolve({ opened: false, refusal: error.message, socket }));
  });
}
function nextMessage(socket: WebSocket, timeoutMs = 5000): Promise<Record<string, unknown> | "closed"> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve("closed"), timeoutMs);
    socket.once("message", raw => { clearTimeout(timer); resolve(JSON.parse(String(raw))); });
    socket.once("close", () => { clearTimeout(timer); resolve("closed"); });
  });
}

/** What both sockets promise before anything is executed. `spawnMessage` is the first command a socket of that kind would act on. */
async function refusesUntilAuthenticated(t: TestContext, path: string, spawnMessage: Record<string, unknown>): Promise<void> {
  const host = await startHost(t);
  for (const [what, options] of [["a foreign Origin", { origin: "http://evil.example" }], ["https on the same host", { origin: `https://127.0.0.1:${host.port}` }],
    ["another loopback port", { origin: "http://127.0.0.1:1" }], ["a foreign Host", { host: "evil.example" }], ["a foreign Host with a loopback-looking prefix", { host: "127.0.0.1.evil.example" }]] as const) {
    const attempt = await open(host, path, options);
    assert.equal(attempt.opened, false, `${what} must not upgrade`);
  }
  // A non-browser client without an Origin may connect but has no standing until it presents the token.
  for (const [what, first] of [["a command before authenticating", spawnMessage], ["the wrong token", { type: "auth", token: "x".repeat(TOKEN.length) }],
    ["a token of another length", { type: "auth", token: "short" }], ["a token that is not text", { type: "auth", token: 12345 }], ["the token as the wrong message type", { type: "hello", token: TOKEN }]] as const) {
    const attempt = await open(host, path);
    assert.equal(attempt.opened, true, "the upgrade itself is open to a client without an Origin");
    const answer = nextMessage(attempt.socket);
    attempt.socket.send(JSON.stringify(first));
    const reply = await answer;
    assert.ok(reply !== "closed" && reply.type === "error", `${what}: ${JSON.stringify(reply)}`);
    const closed = await new Promise<boolean>(resolve => { if (attempt.socket.readyState === WebSocket.CLOSED) resolve(true); else { attempt.socket.once("close", () => resolve(true)); setTimeout(() => resolve(false), 3000); } });
    assert.equal(closed, true, `${what}: the socket is closed after a failed first message`);
  }
  // The control: the right token is the way in.
  const inside = await open(host, path, { origin: host.origin });
  assert.equal(inside.opened, true);
  const ready = nextMessage(inside.socket);
  inside.socket.send(JSON.stringify({ type: "auth", token: TOKEN }));
  assert.deepEqual(await ready, { type: "ready" });
}

test("S-04 the terminal socket refuses a foreign Origin, a foreign Host and an unauthenticated or wrongly authenticated first message", { timeout: 60_000 }, async t => {
  await refusesUntilAuthenticated(t, "/pty", { type: "spawn", panelId: "denied", command: "/bin/sh" });
});

test("S-04 the side-panel browser socket refuses a foreign Origin, a foreign Host and an unauthenticated or wrongly authenticated first message", { timeout: 60_000 }, async t => {
  await refusesUntilAuthenticated(t, BROWSER_SOCKET_PATH, { type: "attach", project_id: "p1" });
});

test("S-04 the browser socket serves a project only after authenticating, and only a project that exists", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  const inside = await open(host, BROWSER_SOCKET_PATH, { origin: host.origin });
  const ready = nextMessage(inside.socket);
  inside.socket.send(JSON.stringify({ type: "auth", token: TOKEN }));
  assert.deepEqual(await ready, { type: "ready" });
  const missing = nextMessage(inside.socket);
  inside.socket.send(JSON.stringify({ type: "attach", project_id: "no-such-project" }));
  const reply = await missing;
  assert.ok(reply !== "closed" && reply.type === "error", JSON.stringify(reply));
});

test("S-04 the names a browser may use for this machine (localhost, [::1]) reach both sockets as well, and the token is still what lets a client in", { timeout: 60_000 }, async t => {
  // The refusals above are about foreign names; this is the other side of the same rule: the spellings of loopback that a person's own browser sends
  // are not refused. `[::1]` is the one the terminal socket used to refuse (it compared the bracket-less spelling).
  const host = await startHost(t);
  for (const path of ["/pty", BROWSER_SOCKET_PATH]) {
    for (const name of ["localhost", "[::1]"]) {
      const authority = `${name}:${host.port}`;
      const wrong = await open(host, path, { host: authority, origin: `http://${authority}` });
      assert.equal(wrong.opened, true, `${path} answered to Host: ${authority}`);
      const refused = nextMessage(wrong.socket);
      wrong.socket.send(JSON.stringify({ type: "auth", token: "x".repeat(TOKEN.length) }));
      const reply = await refused;
      assert.ok(reply !== "closed" && reply.type === "error", `${path} as ${authority}: a wrong token is still refused: ${JSON.stringify(reply)}`);
      const right = await open(host, path, { host: authority, origin: `http://${authority}` });
      assert.equal(right.opened, true);
      const ready = nextMessage(right.socket);
      right.socket.send(JSON.stringify({ type: "auth", token: TOKEN }));
      assert.deepEqual(await ready, { type: "ready" }, `${path} as ${authority}`);
      // An Origin of another name is not the same origin, even when both are loopback.
      const crossed = await open(host, path, { host: authority, origin: `http://127.0.0.1:${host.port}` });
      assert.equal(crossed.opened, false, `${path}: Host ${authority} with another loopback spelling as Origin must not upgrade`);
    }
  }
});

// ---- S-05 ------------------------------------------------------------------------------------------------------

test("S-05 no channel answers before the control token: the retired Casebook path is refused like any other, and a leftover Casebook configuration is not read", { timeout: 60_000 }, async t => {
  const credential = "casebook-service-token-for-project-one-0123456789";
  const bearer = { authorization: `Bearer ${credential}`, "content-type": "application/json" };
  const plain = await startHost(t);
  // The path the Casebook channel used to have answers like a path that never existed: 403 from the control-token gate, whatever the bearer.
  const unknown = await send(plain, "POST", "/no-such-channel/v1/projects", bearer, "{}");
  assert.equal(unknown.status, 403, unknown.body);
  for (const path of ["/casebook/v1/projects", "/casebook/v1/project-one/facts"]) {
    const answer = await send(plain, "POST", path, bearer, "{}");
    assert.equal(answer.status, 403, `${path}: ${answer.body}`);
    assert.equal(answer.body, unknown.body, `${path}: no answer of its own, not even a refusal code`);
  }
  // A file an earlier version read is only a file now: a world-readable one does not stop the host, opens no channel, and is left as it was.
  const home = await mkdtemp(join(os.tmpdir(), "security-invariants-leftover-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, "config"), { recursive: true });
  const leftover = JSON.stringify({ version: 1, grants: [{ token: credential, project_ref: "project-one" }] });
  await writeFile(join(home, "config", "casebook.json"), leftover, { mode: 0o644 });
  const started = await startHost(t, { homeDirectory: home });
  const refused = await send(started, "POST", "/casebook/v1/projects", bearer, "{}");
  assert.equal(refused.status, 403, refused.body);
  assert.equal(refused.body, unknown.body);
  assert.equal(await readFile(join(home, "config", "casebook.json"), "utf8"), leftover);
});

// ---- S-06 ------------------------------------------------------------------------------------------------------

test("S-06 the control token is long and random, written owner-only, and a short token is neither accepted nor kept", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(os.tmpdir(), "security-invariants-token-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.throws(() => resolveWebControlToken({ homeDirectory: home, controlToken: "short" }), /长度无效/);
  assert.throws(() => resolveWebControlToken({ homeDirectory: home, controlToken: "x".repeat(513) }), /长度无效/);
  const generated = resolveWebControlToken({ homeDirectory: home });
  assert.ok(generated.length >= 32, "at least 256 bits are encoded");
  assert.match(generated, /^[A-Za-z0-9_-]+$/);
  const file = join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH);
  assert.equal((await stat(file)).mode & 0o077, 0, "no permission for group or others");
  assert.equal(resolveWebControlToken({ homeDirectory: home }), generated, "it is stable across starts");
  // A token file that someone shortened by hand is not a credential: a new one replaces it.
  await writeFile(file, "short\n", { mode: 0o600 });
  const replaced = resolveWebControlToken({ homeDirectory: home });
  assert.notEqual(replaced, "short");
  assert.ok(replaced.length >= 32);
  const other = await mkdtemp(join(os.tmpdir(), "security-invariants-token-"));
  t.after(() => rm(other, { recursive: true, force: true }));
  assert.notEqual(resolveWebControlToken({ homeDirectory: other }), replaced, "two Homes never share a token");
});

// ---- S-21 ------------------------------------------------------------------------------------------------------

test("S-21 no answer of the host can be shown in another origin's frame: every route says SAMEORIGIN, and the pages' policy says frame-ancestors 'self'", { timeout: 60_000 }, async t => {
  const host = await startHost(t);
  const routes: Array<[string, string, Record<string, string | undefined>]> = [
    ["GET", "/", {}], ["GET", "/onboarding", {}], ["GET", "/health", {}], ["GET", "/__ui/catalog", {}], ["GET", "/api/settings/projects", {}], ["GET", "/assets/missing.css", {}],
    ["GET", "/no/such/page", {}], ["GET", "/locale?lang=en", {}],
    // Refusals carry it as well: the header is made before any route decides.
    ["GET", "/", { host: "evil.example" }], ["POST", "/api/settings/projects", {}],
  ];
  let pages = 0;
  for (const [method, path, headers] of routes) {
    const answer = await send(host, method, path, headers);
    assert.equal(answer.headers["x-frame-options"], "SAMEORIGIN", `${method} ${path} (${answer.status}) can be framed by another site`);
    if (String(answer.headers["content-type"] ?? "").startsWith("text/html") && answer.headers["content-security-policy"]) {
      pages++;
      assert.match(String(answer.headers["content-security-policy"]), /(?:^|;\s*)frame-ancestors 'self'(?:;|$)/, `${method} ${path}: the page's policy lets another site frame it`);
    }
  }
  assert.ok(pages >= 2, `the sweep looked at pages with a policy (${pages})`);
});
