import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import test from "node:test";
import { once } from "node:events";
import { WebSocket } from "ws";
import { WebSessions, authorizeLocalWebRequest } from "@molis-ai/molis-work-app-local-host";
import { deferred, grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

const HEADER = "x-molis-work-page-session";
const cookieJar = (...cookies: string[]) => [...new Map(cookies.map(cookie => [cookie.slice(0, cookie.indexOf("=")), cookie])).values()].join("; ");
const readPage = async (origin: string, cookie?: string, path = "/") => {
  const response = await fetch(origin + path, { headers: cookie ? { cookie } : {} });
  assert.equal(response.status, 200, await response.clone().text());
  const html = await response.text();
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(proof, "a trusted page receives only a cookie-bound CSRF proof");
  const cookies = response.headers.getSetCookie();
  const session = cookies.find(value => value.startsWith("molis-work-web-"));
  return { proof, cookie: session?.split(";")[0] ?? cookie ?? "", html, cookies };
};

test("WAS-01 WAS-02 real workbench pages exclude Host credentials and require both cookie and CSRF proof", { timeout: 30_000 }, async t => {
  const f = await serveHomeRuntime(t), a = await readPage(f.origin), b = await readPage(f.origin);
  assert.equal((await f.request("/api/browser/assistant", { method: "POST", body: { enabled: false } })).status, 200);
  assert.ok(a.cookie); assert.match(a.cookies[0]!, /HttpOnly; SameSite=Strict/);
  assert.notEqual(a.proof, f.token); assert.notEqual(a.proof, b.proof);
  const project = await f.project("Session HTML coverage");
  for (const path of ["/", "/settings/appearance", "/settings/models", `/projects/${project.project_id}/`, `/projects/${project.project_id}/settings`, "/plugins/issues"]) {
    const page = await readPage(f.origin, a.cookie, path);
    assert.ok(!page.html.includes(f.token), path + " must not contain the Host control token");
    assert.doesNotMatch(page.html, /<meta[^>]+name=["']molis-work-control-token["']/);
    assert.equal(page.proof, a.proof, "ordinary refresh retains the same current session");
  }
  const request = (headers: Record<string, string>, key = randomUUID()) => fetch(f.origin + "/api/browser/assistant", {
    method: "POST", headers: { origin: f.origin, "content-type": "application/json", "x-molis-work-idempotency-key": key, ...headers }, body: '{"enabled":true}',
  });
  const valid = { cookie: a.cookie, [HEADER]: a.proof };
  assert.equal((await fetch(f.origin + "/api/browser/assistant", { headers: { "sec-fetch-site": "same-origin" } })).status, 403, "browser API reads require a current session");
  for (const headers of [{ [HEADER]: a.proof }, { cookie: a.cookie }, { cookie: b.cookie, [HEADER]: a.proof },
    { ...valid, [HEADER]: f.token }, { ...valid, origin: "http://127.0.0.1:1" }, { ...valid, origin: "null" },
    { cookie: a.cookie + "; " + a.cookie, [HEADER]: a.proof }, { cookie: a.cookie, "x-molis-work-control-token": f.token }]) {
    const response = await request(headers);
    assert.equal(response.status, 403, JSON.stringify(Object.keys(headers)) + ": " + await response.text());
    assert.deepEqual(await (await f.request("/api/browser/assistant")).json(), { enabled: false }, "refusal must precede the setting write");
  }
  const key = randomUUID();
  assert.equal((await request(valid, key)).status, 200);
  assert.deepEqual(await (await f.request("/api/browser/assistant")).json(), { enabled: true });
  assert.equal((await request(valid, key)).status, 409);
});

test("WAS-03 WAS-05 session issuer binds origin, rejects cross-site issuance and expires original credentials", { timeout: 30_000 }, async t => {
  let now = 100;
  let sessions = new WebSessions("synthetic-session-home", () => now, 60_000);
  const control = "synthetic-private-control-token-0123456789";
  let effects = 0;
  const server = createServer((request, response) => {
    sessions.bind(request, control, response);
    if (!authorizeLocalWebRequest(request, response, new URL(request.url!, "http://localhost"), control, new Map())) return;
    if (request.method === "GET") {
      response.setHeader("content-type", "text/html");
      response.end('<meta name="molis-work-page-session" content="' + sessions.pageToken(request) + '">');
    } else { effects++; response.end("{}"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { sessions.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + address.port;
  const cross = await fetch(origin, { headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(cross.headers.getSetCookie().length, 0); assert.ok(!(await cross.text()).includes(control));
  const processRead = await fetch(origin, { headers: { "x-molis-work-control-token": control } });
  assert.equal(processRead.headers.getSetCookie().length, 0, "a trusted process read does not become a browser session");
  assert.equal(await processRead.text(), '<meta name="molis-work-page-session" content="">');
  const a = await readPage(origin), b = await readPage(origin);
  const send = (cookie: string, proof: string) => fetch(origin + "/api/test", { method: "POST", headers: { origin, cookie, [HEADER]: proof, "x-molis-work-idempotency-key": randomUUID() } });
  // Neither a page's proof by itself nor a cookie from another precise origin is sufficient.
  assert.equal((await send(b.cookie, a.proof)).status, 403);
  const request = { method: "GET", url: "/", headers: { host: "127.0.0.1:1", cookie: a.cookie } } as IncomingMessage;
  sessions.bind(request, control); assert.equal(sessions.pageToken(request), "");
  assert.equal((await send(a.cookie, a.proof)).status, 200); assert.equal(effects, 1);
  now += 60_001;
  assert.equal((await send(a.cookie, a.proof)).status, 403); assert.equal(effects, 1);
  const fresh = await readPage(origin, a.cookie); assert.notEqual(fresh.proof, a.proof);
  assert.equal((await send(fresh.cookie, fresh.proof)).status, 200); assert.equal(effects, 2);
  sessions.close(); sessions = new WebSessions("synthetic-session-home", () => now, 60_000);
  assert.equal((await send(fresh.cookie, fresh.proof)).status, 403, "restarted Host does not revive a persisted cookie"); assert.equal(effects, 2);
});

test("WAS-09 concurrent first documents in one browser retain both original sessions without cookie overwrite", { timeout: 30_000 }, async t => {
  const f = await serveHomeRuntime(t);
  // A Tauri main window and capsule can navigate before either response's cookie has arrived.
  const [a, b] = await Promise.all([readPage(f.origin), readPage(f.origin)]);
  const cookie = cookieJar(a.cookie, b.cookie);
  const request = (proof: string, method = "POST", path = "/api/browser/assistant") => fetch(f.origin + path, { method,
    headers: { origin: f.origin, cookie, [HEADER]: proof, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID() },
    ...(method === "POST" ? { body: '{"enabled":false}' } : {}) });
  assert.equal((await request(a.proof)).status, 200, "the later Set-Cookie must not invalidate the first document");
  assert.equal((await request(b.proof)).status, 200);
  assert.equal((await request(a.proof, "DELETE", "/api/web-session")).status, 200);
  assert.equal((await request(a.proof)).status, 403, "a revoked document must not borrow the other cookie");
  assert.equal((await request(b.proof)).status, 200, "the other initial window retains its own authority");
});

test("WAS-04 WAS-05 all real socket entries require the paired cookie and close when that session is revoked", { timeout: 30_000 }, async t => {
  const sockets = new Set<WebSocket>();
  t.after(() => { for (const socket of sockets) socket.terminate(); });
  const f = await serveHomeRuntime(t), a = await readPage(f.origin), b = await readPage(f.origin);
  assert.equal((await f.request("/api/browser/assistant", { method: "POST", body: { enabled: false } })).status, 200);
  const open = async (path: string, cookie: string, proof: string) => {
    const socket = new WebSocket(f.origin.replace("http:", "ws:") + path, { origin: f.origin, headers: { cookie } });
    sockets.add(socket);
    await once(socket, "open");
    const reply = once(socket, "message"); socket.send(JSON.stringify({ type: "auth", token: proof }));
    const [raw] = await reply; return { socket, message: JSON.parse(String(raw)) };
  };
  const live: WebSocket[] = [];
  for (const path of ["/pty", "/browser", "/computer"]) {
    const refused = await open(path, b.cookie, a.proof); assert.equal(refused.message.type, "error", path);
    const accepted = await open(path, a.cookie, a.proof);
    if (path === "/computer" && accepted.message.type === "error") assert.equal(accepted.message.message, "这个进程没有电脑助手");
    else { assert.equal(accepted.message.type, "ready", path); live.push(accepted.socket); }
  }
  const combined = await open("/pty", cookieJar(a.cookie, b.cookie), a.proof);
  assert.equal(combined.message.type, "ready", "a shared WebView cookie jar selects the session named by the socket proof");
  live.push(combined.socket);
  const closed = live.map(socket => once(socket, "close"));
  const response = await fetch(f.origin + "/api/web-session", { method: "DELETE", headers: { origin: f.origin, cookie: a.cookie, [HEADER]: a.proof, "x-molis-work-idempotency-key": randomUUID() } });
  assert.equal(response.status, 200); await Promise.all(closed);
  assert.equal((await fetch(f.origin + "/api/browser/assistant", { method: "POST", headers: { origin: f.origin, cookie: a.cookie, [HEADER]: a.proof, "x-molis-work-idempotency-key": randomUUID() }, body: '{"enabled":true}' })).status, 403);
  assert.deepEqual(await (await f.request("/api/browser/assistant")).json(), { enabled: false });
  assert.equal((await open("/pty", b.cookie, b.proof)).message.type, "ready", "another browser session survives");
});

test("WAS-02 WAS-05 WAS-07 revocation fences a real Runtime action held before its storage effect", { timeout: 30_000 }, async t => {
  const probe = homeProbe("sessionprobe"), entered = deferred(), release = deferred(), finished = deferred();
  let refusal: unknown;
  t.after(() => release.resolve());
  probe.behavior.ask = async context => {
    entered.resolve(); await release.promise;
    try { context.services!.storage!.set("late-effect", "must not commit"); }
    catch (error) { refusal = error; throw error; }
    finally { finished.resolve(); }
    return "unexpected commit";
  };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const page = await readPage(f.origin), headers = { origin: f.origin, cookie: page.cookie, [HEADER]: page.proof,
    "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID() };
  const pending = fetch(f.origin + "/api/plugins/" + probe.id + "/ask", { method: "POST", headers, body: "{}" })
    .then(response => response.text()).catch(() => "transport closed on revocation");
  await entered.promise;
  assert.equal((await fetch(f.origin + "/api/web-session", { method: "DELETE", headers: { ...headers, "x-molis-work-idempotency-key": randomUUID() } })).status, 200);
  release.resolve(); await finished.promise; await pending;
  assert.ok(refusal instanceof Error, "the actual SDK storage effect must reject, not only the HTTP response");
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late-effect"), null);
});
