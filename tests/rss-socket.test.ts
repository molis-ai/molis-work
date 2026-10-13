import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as httpsServer } from "node:https";
import { createServer as tcpServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

interface Result {
  result?: { status: number; body: { body: string } };
  error?: { code?: string; message: string };
  observed: { policyLookups: number; socketLookups: number; pinned: Array<{ address: string; family: number }>; connections: number;
    fallbackFetch: number; rejectUnauthorized: boolean[]; servernames: string[]; openSockets: number; abortListeners: number; responseBodyObserved: boolean; receipt?: { not_modified: boolean } };
}
const xml = '<rss><channel><title>Socket fixture</title></channel></rss>';

async function fixture(t: TestContext, wrongCertificate = false) {
  const directory = await mkdtemp(join(tmpdir(), "rss-socket-")), certFile = join(directory, "cert.pem"), keyFile = join(directory, "key.pem");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const certificateHost = wrongCertificate ? "wrong-rss.example" : "rss-socket.example";
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "1",
    "-subj", "/CN=" + certificateHost, "-addext", "subjectAltName=DNS:" + certificateHost], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(keyFile), readFile(certFile)]);
  const active = new Set<Socket>(), requests: Array<{ path: string; host?: string; etag?: string; modified?: string }> = [], servernames: string[] = [];
  let privateContacts = 0;
  const trap = tcpServer(socket => { privateContacts++; socket.destroy(); });
  const server = httpsServer({ key, cert }, (request, response) => {
    requests.push({ path: request.url!, host: request.headers.host, etag: request.headers["if-none-match"] as string, modified: request.headers["if-modified-since"] as string });
    if (request.url === "/redirect") { response.writeHead(302, { location: "/rss" }); response.end("discard this redirect body"); return; }
    if (request.url === "/foreign") { response.writeHead(302, { location: "https://elsewhere.example/rss" }); response.end(); return; }
    if (request.url === "/loop") { response.writeHead(302, { location: "/loop" }); response.end(); return; }
    if (request.url === "/not-modified") { response.writeHead(304, { etag: '"rss-v1"' }); response.end(); return; }
    if (request.url === "/denied") { response.writeHead(403); response.write("body left open"); return; }
    if (request.url === "/slow") { response.writeHead(200, { "content-type": "application/rss+xml" }); response.write("<rss>"); return; }
    if (request.url === "/huge") { response.writeHead(200, { "content-type": "application/rss+xml" }); response.end(Buffer.alloc(2 * 1024 * 1024 + 1, 97)); return; }
    if (request.url === "/declared-huge") { response.writeHead(200, { "content-length": 2 * 1024 * 1024 + 1 }); response.flushHeaders(); return; }
    if (request.url === "/zip-huge") { response.writeHead(200, { "content-type": "application/rss+xml", "content-encoding": "gzip" }); response.end(gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 97))); return; }
    if (request.url === "/gzip") { response.writeHead(200, { "content-type": "application/rss+xml", "content-encoding": "gzip" }); response.end(gzipSync(xml)); return; }
    response.writeHead(200, { "content-type": "application/rss+xml", etag: '"rss-v1"' }); response.end(xml);
  });
  server.on("connection", socket => { active.add(socket); socket.once("close", () => active.delete(socket)); });
  server.on("secureConnection", socket => servernames.push(socket.servername));
  server.on("tlsClientError", () => {});
  await Promise.all([new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)), new Promise<void>(resolve => trap.listen(0, "127.0.0.1", resolve))]);
  const publicAddress = server.address(), privateAddress = trap.address();
  assert.ok(publicAddress && typeof publicAddress === "object" && privateAddress && typeof privateAddress === "object");
  t.after(async () => { server.closeAllConnections(); await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => trap.close(() => resolve()))]); });
  async function run(config: Record<string, unknown>, envOverrides: NodeJS.ProcessEnv = {}, flags: string[] = []): Promise<Result> {
    const env = { ...process.env };
    for (const name of ["NODE_OPTIONS", "NODE_USE_ENV_PROXY", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy", "NODE_TLS_REJECT_UNAUTHORIZED"]) delete env[name];
    Object.assign(env, envOverrides, { NODE_EXTRA_CA_CERTS: certFile });
    const result = await new Promise<Result>((resolve, reject) => {
      const child = spawn(process.execPath, [...flags, fileURLToPath(new URL("./fixtures/rss-socket-child.mjs", import.meta.url)), JSON.stringify({ publicPort: publicAddress.port, privatePort: privateAddress.port, ...config })], { env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("RSS socket worker timed out: " + stderr)); }, 10_000);
      child.stdout.on("data", bytes => { stdout += bytes; }); child.stderr.on("data", bytes => { stderr += bytes; });
      child.once("error", reject);
      child.once("close", code => { clearTimeout(timer); if (code !== 0) reject(new Error("RSS socket worker failed: " + stderr)); else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } } });
    });
    for (let attempt = 0; active.size && attempt < 50; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(active.size, 0, "real TLS sockets are released after every terminal result");
    assert.equal(result.observed.openSockets, 0, "the worker completes after its own TLS sockets close");
    assert.equal(result.observed.abortListeners, 0, "cancellation listeners do not survive a result");
    return result;
  }
  return { run, requests, servernames, privateContacts: () => privateContacts, proxy: `http://127.0.0.1:${privateAddress.port}` };
}

test("W2-18-RSS-SOCKET-01: production HTTPS pins the checked address; rebinding, private and mixed answers never touch the private TCP trap", async t => {
  const f = await fixture(t);
  const result = await f.run({});
  assert.equal(result.result?.body.body, xml); assert.equal(result.observed.socketLookups, 0);
  assert.deepEqual(result.observed.pinned, [{ address: "8.8.8.8", family: 4 }]);
  assert.deepEqual(result.observed.servernames, ["rss-socket.example"]); assert.deepEqual(result.observed.rejectUnauthorized, [true]);
  assert.equal(f.requests[0]?.host, "rss-socket.example"); assert.deepEqual(f.servernames, ["rss-socket.example"]);
  const requests = f.requests.length;
  for (const answers of [["127.0.0.1"], ["8.8.8.8", "10.0.0.1"], []]) {
    const denied = await f.run({ answers }); assert.equal(denied.error?.code, "provider_protocol_invalid"); assert.equal(denied.observed.connections, 0);
  }
  assert.equal(f.requests.length, requests); assert.equal(f.privateContacts(), 0);
  const proxyAddress = await f.run({ answers: ["198.18.0.1"] });
  assert.equal(proxyAddress.result?.body.body, xml); assert.deepEqual(proxyAddress.observed.pinned, [{ address: "198.18.0.1", family: 4 }]);
});

test("W2-18-RSS-SOCKET-02: trusted TLS, validators, 304 and same-host redirects work; wrong certificates, foreign/extra redirects and body limits release sockets", async t => {
  const f = await fixture(t);
  const moved = await f.run({ path: "/redirect" }); assert.equal(moved.result?.body.body, xml); assert.equal(moved.observed.policyLookups, 2);
  assert.deepEqual(f.requests.map(request => request.path), ["/redirect", "/rss"]);
  for (const request of f.requests) { assert.equal(request.etag, '"rss-v1"'); assert.equal(request.modified, "Tue, 13 Oct 2026 00:00:00 GMT"); }
  const unchanged = await f.run({ path: "/not-modified" }); assert.equal(unchanged.observed.receipt?.not_modified, true);
  assert.equal((await f.run({ path: "/gzip" })).result?.body.body, xml);
  assert.equal((await f.run({ path: "/foreign" })).error?.code, "provider_protocol_invalid");
  const loop = await f.run({ path: "/loop" }); assert.equal(loop.result?.status, 302); assert.equal(loop.observed.connections, 3);
  assert.equal((await f.run({ path: "/denied" })).result?.status, 403);
  for (const path of ["/huge", "/declared-huge", "/zip-huge"]) assert.equal((await f.run({ path })).error?.code, "content_too_large");
  assert.equal(f.privateContacts(), 0);
  const wrong = await fixture(t, true), refused = await wrong.run({});
  assert.equal(refused.error?.code, "feed_unavailable"); assert.equal(wrong.requests.length, 0); assert.equal(wrong.privateContacts(), 0);
});

test("W2-18-RSS-SOCKET-02: cancellation during pending DNS or response returns the original reason with no lingering listener or connection", async t => {
  const f = await fixture(t);
  const dns = await f.run({ mode: "dns-cancel" }); assert.equal(dns.error?.message, "fixture DNS cancelled"); assert.equal(dns.observed.connections, 0);
  const response = await f.run({ mode: "response-cancel", path: "/slow" }); assert.equal(response.error?.message, "fixture response cancelled");
  assert.equal(response.observed.responseBodyObserved, true, "cancel only after real decrypted response-body bytes arrived");
  assert.equal(f.privateContacts(), 0);
});

test("W2-18-RSS-SOCKET-01: effective Node environment proxy flags refuse custom RSS before direct or proxy contact; unused variables and lowercase precedence retain direct mode", async t => {
  const f = await fixture(t);
  for (const [env, flags] of [[{ NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: f.proxy }, []], [{ HTTPS_PROXY: f.proxy }, ["--use-env-proxy"]],
    [{ NODE_OPTIONS: "--use-env-proxy", HTTPS_PROXY: f.proxy }, []], [{ NODE_USE_ENV_PROXY: "1", HTTP_PROXY: f.proxy }, []]] as const) {
    const refused = await f.run({}, env, [...flags]); assert.equal(refused.error?.code, "provider_not_configured");
    assert.match(refused.error!.message, /环境代理/u); assert.equal(refused.observed.policyLookups, 0); assert.equal(refused.observed.connections, 0);
  }
  assert.equal(f.privateContacts(), 0); assert.equal(f.requests.length, 0);
  assert.equal((await f.run({}, { HTTPS_PROXY: f.proxy })).result?.body.body, xml);
  assert.equal((await f.run({}, { NODE_USE_ENV_PROXY: "1", https_proxy: "", HTTPS_PROXY: f.proxy })).result?.body.body, xml);
  for (const mode of ["catalog", "youtube"]) {
    const original = await f.run({ mode }, { NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: f.proxy });
    assert.equal(original.observed.fallbackFetch, 1); assert.equal(original.observed.connections, 0); assert.equal(f.privateContacts(), 0);
  }
});
