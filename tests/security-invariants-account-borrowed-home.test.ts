// S-unified-account-borrowed-home: a Home borrowing the installation session cannot start its own login/switch
// or sign the installation account out; only the installation entry and its preparation protocol may do that.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import http, { type IncomingHttpHeaders, type Server } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createDesktopWebCore } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkLocalHost, PersonalAuth } from "@molis-ai/molis-work-app-local-host";
import type { AccountCallControl } from "@molis-ai/molis-work-contracts/services/account";
import { parseAccountEnvironment } from "@molis-ai/molis-work-service-account";
import { createTrialAuthPeer, trialAccountConfig } from "../examples/personal-trial-tools/mock-auth.mjs";

interface Reply { status: number; headers: IncomingHttpHeaders; body: Record<string, unknown> }
function request(origin: string, path: string, headers: Record<string, string>, body?: string, method = "GET"): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(new URL(path, origin), { method, agent: false, headers: { ...headers, ...(body === undefined ? {} : { "content-length": String(Buffer.byteLength(body)) }) } }, incoming => {
      const chunks: Buffer[] = [];
      incoming.on("data", chunk => chunks.push(Buffer.from(chunk)));
      incoming.on("error", reject);
      incoming.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}
async function freePort(): Promise<number> {
  const socket = net.createServer();
  await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const address = socket.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}

/**
 * The installation session this Home borrows. It is created through the real installation owner (`PersonalAuth`
 * over the disposable V2 peer), so the borrowed manager is the same kind of object the installation hands to a
 * selected Home: the Proxy in front of the active `AccountSessionManager`.
 */
async function startBorrowingHome(t: TestContext) {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const plain = trialAccountConfig("http://127.0.0.1:8787", origin);
  const config = parseAccountEnvironment(plain);
  const values = new Map<string, string>();
  let calls = 0;
  const peer = createTrialAuthPeer({ configuration: () => plain, user: () => "borrowed-person" });
  const fetcher: typeof fetch = async (input, init) => { calls++; return peer.fetch(input, init); };
  const auth = new PersonalAuth(config,
    { get: key => values.get(key) ?? null, put: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); }, assertWritable() {} },
    fetcher);
  const control: AccountCallControl = { assertCurrent() {} };
  await auth.begin(config.productOrigin + "/account/callback");
  const transaction = await auth.authentication.create({ purpose: "LOGIN", method: "EMAIL_PASSWORD" }, control);
  await auth.authentication.submit(transaction.handle, { step: "PASSWORD_LOGIN", email: "borrowed@example.test", password: "synthetic-fixture-password" }, control);
  await auth.authentication.submit(transaction.handle, { step: "COMPLETE" }, control);
  await auth.adoptLogin(false);
  auth.finishLogin();
  assert.equal(auth.identity()?.userId, "borrowed-person", "the installation owns an authenticated V2 session");
  assert.equal(auth.identity()?.email, null);

  const home = await mkdtemp(join(tmpdir(), "borrowed-account-home-")), hostControl = randomBytes(32).toString("hex");
  const host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const factory = createDesktopWebCore({ ptyClientFilePath: () => join(home, "unused-pty.js") });
  const server: Server = factory({ homeDirectory: home, localHost: host, controlToken: hostControl,
    // This Home only borrows the installation manager; it never owns or replaces the session.
    account: { environment: config, session: auth.sessions, fetch: fetcher } });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close();
    auth.suspend();
    await rm(home, { recursive: true, force: true });
  });
  return { origin, headers: { origin, "x-molis-work-control-token": hostControl }, calls: () => calls };
}
const writeHeaders = (headers: Record<string, string>) => ({ ...headers, "content-type": "application/json", "x-molis-work-idempotency-key": randomBytes(16).toString("hex") });

test("S-unified-account-borrowed-home: a borrowing Home refuses to start its own login or switch", { timeout: 60_000 }, async t => {
  const f = await startBorrowingHome(t), before = f.calls();
  const attempted = await request(f.origin, "/api/account/auth/transactions", writeHeaders(f.headers), JSON.stringify({ purpose: "LOGIN", method: "EMAIL_PASSWORD" }), "POST");
  assert.equal(attempted.status, 409, JSON.stringify(attempted.body));
  assert.equal((attempted.body as { code?: string }).code, "account.conflict");
  assert.equal(f.calls(), before, "the refusal precedes every central Auth transaction");
  const read = await request(f.origin, "/api/account/session", f.headers);
  assert.equal(read.status, 200);
  assert.equal((read.body.data as { state: string }).state, "AUTHENTICATED", "the borrowed installation identity is unchanged");
});

test("S-unified-account-borrowed-home: a borrowing Home refuses to sign the installation account out", { timeout: 60_000 }, async t => {
  const f = await startBorrowingHome(t), before = f.calls();
  const attempted = await request(f.origin, "/api/account/logout", writeHeaders(f.headers), JSON.stringify({ scope: "CURRENT_LOGIN" }), "POST");
  assert.equal(attempted.status, 409, JSON.stringify(attempted.body));
  assert.equal((attempted.body as { code?: string }).code, "account.conflict");
  assert.equal(f.calls(), before, "the refusal precedes the central logout");
  const read = await request(f.origin, "/api/account/session", f.headers);
  assert.equal(read.status, 200);
  assert.equal((read.body.data as { state: string }).state, "AUTHENTICATED", "a refused logout must not end the borrowed installation session");
});
