// S-upgrade-maintenance-listener: what the listener during an upgrade refuses, and what enumerating account Homes before any login refuses to follow.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { planHomeUpgrade, runHomeUpgrade, runUpgradeMaintenance, WEB_CONTROL_TOKEN_RELATIVE_PATH, webHealthProof } from "@molis-ai/molis-work-app-local-host";
import { ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { ledgerFile, notesDescriptor, present, seedStore, sha256, upgradeTestHome, useDescriptors } from "./fixtures/home-upgrade-home.js";

const WORKER = new URL("./fixtures/upgrade-maintenance-worker.mjs", import.meta.url);
const TOKEN = randomBytes(32).toString("base64url");
const STORE = "notes";

interface Answer { readonly status: number; readonly headers: Record<string, string | string[] | undefined>; readonly body: string }

/** `fetch` will not send a `Host` of the caller's choosing. */
const ask = (origin: string, path: string, headers: Record<string, string> = {}, method = "GET") => new Promise<Answer>((resolve, reject) => {
  const request = httpRequest(`${origin}${path}`, { method, headers, agent: false }, response => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
  });
  request.once("error", reject);
  request.end();
});

async function during(t: TestContext, options: { readonly token: boolean }, use: (origin: string, address: string, home: string) => Promise<void>) {
  // The name the fixture's thread upgrades, so its slow step really runs while this asks.
  const { home } = upgradeTestHome(t);
  seedStore(home, STORE);
  if (options.token) {
    mkdirSync(join(home, "config"), { recursive: true });
    writeFileSync(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), `${TOKEN}\n`, { mode: 0o600 });
  }
  const before = process.env.MOLIS_TEST_UPGRADE_STEP_MS;
  process.env.MOLIS_TEST_UPGRADE_STEP_MS = "1500";
  t.after(() => { if (before === undefined) delete process.env.MOLIS_TEST_UPGRADE_STEP_MS; else process.env.MOLIS_TEST_UPGRADE_STEP_MS = before; });
  const plan = { needed: true, homes: [home], total: 1 };
  let listening: (value: { port: number; address: string }) => void = () => {};
  const bound = new Promise<{ port: number; address: string }>(resolve => { listening = resolve; });
  const finished = runUpgradeMaintenance({ home, port: 0, plan, workerEntry: WORKER, onListening: info => listening(info) });
  const { port, address } = await bound;
  try { await use(`http://127.0.0.1:${port}`, address, home); }
  finally { await finished; }
}

test("S-upgrade-maintenance-listener: bound to loopback only", async t => {
  await during(t, { token: true }, async (_origin, address) => { assert.equal(address, "127.0.0.1"); });
});

test("S-upgrade-maintenance-listener: a `Host` that is not a loopback name, and another site's `Origin`, are refused on every route", async t => {
  await during(t, { token: true }, async origin => {
    for (const path of ["/health", "/api/projects"]) {
      assert.equal((await ask(origin, path, { host: "evil.example" })).status, 403, path);
      assert.equal((await ask(origin, path, { origin: "https://evil.example" })).status, 403, path);
      assert.equal((await ask(origin, path, { origin: "not a url" })).status, 403, path);
    }
    const health = await ask(origin, "/health", { host: "evil.example" });
    assert.equal(health.body.includes("upgrading"), false);
    assert.equal((await ask(origin, "/health", { origin })).status, 503, "the page's own origin is not refused");
  });
});

test("S-upgrade-maintenance-listener: no proof without a valid challenge, and with one the proof covers these bytes", async t => {
  await during(t, { token: true }, async origin => {
    assert.equal((await ask(origin, "/health")).headers["x-molis-work-proof"], undefined);
    assert.equal((await ask(origin, "/health?challenge=short")).status, 400);
    const challenge = randomBytes(32).toString("base64url"), answer = await ask(origin, `/health?challenge=${challenge}`);
    assert.equal(answer.status, 503);
    assert.equal(answer.headers["x-molis-work-proof"], webHealthProof(TOKEN, challenge, answer.body).toString("base64url"));
  });
});

test("S-upgrade-maintenance-listener: with no control token it gives no proof and does not make one", async t => {
  await during(t, { token: false }, async (origin, _address, home) => {
    const answer = await ask(origin, `/health?challenge=${randomBytes(32).toString("base64url")}`);
    assert.equal(answer.status, 503);
    assert.equal(answer.headers["x-molis-work-proof"], undefined);
    assert.equal(present(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH)), false);
  });
});

test("S-upgrade-maintenance-listener: everything but `/health` is 503 and does nothing, and nothing names a store", async t => {
  await during(t, { token: true }, async origin => {
    for (const [method, path] of [["GET", "/"], ["GET", "/projects/x"], ["POST", "/api/projects"], ["DELETE", "/health"], ["POST", "/health"]] as const) {
      const answer = await ask(origin, path, {}, method);
      assert.equal(answer.status, 503, `${method} ${path}`);
      assert.equal(answer.headers["retry-after"], "1");
      assert.equal(JSON.parse(answer.body).code, "storage.upgrade_in_progress");
      assert.equal(answer.body.includes(STORE), false);
    }
    const health = await ask(origin, "/health");
    assert.equal(health.body.includes(STORE), false);
    assert.deepEqual(Object.keys(JSON.parse(health.body)).sort(), ["process_id", "service_process_id", "status", "upgrade"]);
    assert.deepEqual(Object.keys(JSON.parse(health.body).upgrade).sort(), ["done", "started_at", "total"]);
  });
});

test("S-upgrade-maintenance-listener: `spaces` as a link: skipped whole, and the Home it points at is not touched or locked", t => {
  const { home, outside } = upgradeTestHome(t);
  useDescriptors(t, notesDescriptor("notes"));
  const space = personalStorageSpace("https://auth.example", "work", "alice"), account = join(outside, space.spaceId);
  mkdirSync(account);
  ensureStorageSpace(account, space);
  const file = seedStore(account, "notes", { space }), before = sha256(file);
  symlinkSync(outside, join(home, "spaces"));
  assert.deepEqual(planHomeUpgrade(home), { needed: false, homes: [], total: 0 });
  runHomeUpgrade(home);
  assert.equal(sha256(file), before);
  assert.equal(present(ledgerFile(account)), false);
  assert.equal(present(join(account, "agent-runtime")), false, "no lock was taken there");
});

test("S-upgrade-maintenance-listener: an account directory that is a link, or says it is someone else, is skipped", t => {
  const { home, outside } = upgradeTestHome(t);
  useDescriptors(t, notesDescriptor("notes"));
  const spaces = join(home, "spaces");
  mkdirSync(spaces, { mode: 0o700 });
  const space = personalStorageSpace("https://auth.example", "work", "alice"), elsewhere = join(outside, space.spaceId);
  mkdirSync(elsewhere);
  ensureStorageSpace(elsewhere, space);
  const linked = seedStore(elsewhere, "notes", { space }), linkedBefore = sha256(linked);
  symlinkSync(elsewhere, join(spaces, space.spaceId));
  const named = join(spaces, "someone-else"), other = personalStorageSpace("https://auth.example", "work", "bob");
  mkdirSync(named);
  ensureStorageSpace(named, other);
  const misnamed = seedStore(named, "notes", { space: other }), misnamedBefore = sha256(misnamed);
  const local = join(spaces, "local-one");
  mkdirSync(local);
  ensureStorageSpace(local);
  assert.deepEqual(planHomeUpgrade(home), { needed: false, homes: [], total: 0 });
  assert.equal(sha256(linked), linkedBefore);
  assert.equal(sha256(misnamed), misnamedBefore);
});
