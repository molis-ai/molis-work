// Security invariant S-07 (docs/system/SECURITY-INVARIANTS.md): the cross-process gateways of the resident Host.
// Runtime context and deletion refusals are in tests/security-invariants-home-context.test.ts. This file holds the
// action operation-number gate and the one rule every process that forwards shares: the
// resident Host is asked at a numeric loopback HTTP address, nothing else, and the Home's control token goes nowhere else.
// Every test asserts the REFUSAL itself (status, code, the project still there, no receipt written, no request made).
// The tests import public entries only (tests/*.test.ts may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalActionGatewayClient } from "@molis-ai/molis-work-app-local-host";
import { main as runCli } from "../apps/desktop/launchers/cli/main.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "security-invariants-gateway-0123456789abcdef";

type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;

/** A real Web host (the resident Host) for a scratch Home, and the catalog of that Home to look at what a refusal left. */
async function startResidentHost(t: TestContext): Promise<{ home: string; origin: string; port: number; catalog: Catalog }> {
  const directory = await mkdtemp(join(tmpdir(), "security-invariants-gateway-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { home, origin: `http://127.0.0.1:${address.port}`, port: address.port, catalog };
}

const homeId = (home: string) => createHash("sha256").update(resolvePath(home)).digest("hex");

test("S-07 a process that forwards to the resident Host asks a numeric loopback HTTP address only, and sends the Home's control token nowhere else", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "security-invariants-forward-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const requests: string[] = [];
  const listener = http.createServer((incoming, response) => { requests.push(`${incoming.method} ${incoming.url}`); response.statusCode = 500; response.end("{}"); });
  await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  // The Home has run a Host before: its token is in the Home, so a forwarding process would find it and send it.
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(join(home, "config", "web-control-token"), `${TOKEN}\n`, { mode: 0o600 });
  const demo = (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project;
  const environment = process.env.MOLIS_WORK_WEB_URL;
  t.after(async () => {
    if (environment === undefined) delete process.env.MOLIS_WORK_WEB_URL; else process.env.MOLIS_WORK_WEB_URL = environment;
    listener.closeAllConnections();
    await new Promise<void>(resolve => listener.close(() => resolve()));
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  });

  // The listener really answers at 127.0.0.1:<port>; every other spelling of that address is refused before a request is made.
  const refused = [`http://localhost:${address.port}`, `http://127.0.0.1.evil.example:${address.port}`, `https://127.0.0.1:${address.port}`,
    `http://user:pass@127.0.0.1:${address.port}`, `http://127.0.0.1:${address.port}/path`, `http://127.0.0.1:${address.port}/?x=1`,
    `http://[::ffff:127.0.0.1]:${address.port}`, `http://0.0.0.0:${address.port}`, "http://example.invalid:4173"];
  for (const url of refused) {
    assert.throws(() => new LocalActionGatewayClient({ url, homeDirectory: home, clientId: "runtime:codex", projectId: null }), { code: "actions.transport_invalid" }, url);
  }

  // The command line takes the Host's address from MOLIS_WORK_WEB_URL: an address that is not the numeric loopback ends the command, with
  // nothing sent (the token stays in the Home) and the demo still there. It does not go on to delete in its own process either.
  const failures: string[] = [];
  t.mock.method(console, "error", (...message: unknown[]) => { failures.push(message.map(String).join(" ")); });
  for (const url of refused.slice(0, 3)) {
    process.env.MOLIS_WORK_WEB_URL = url;
    assert.equal(await runCli(["demo", "remove", "--home", home, "--confirm"]), 1, url);
  }
  assert.equal(failures.length, 3);
  assert.ok(failures.every(message => /数字回环/.test(message)), failures.join("\n"));
  assert.deepEqual(requests, [], "no request reached any address, the numeric loopback one included");
  assert.equal(existsSync(demo.database_path), true, "the demo is still there");
  assert.equal(catalog.listProjectDeletions().length, 0);
});

test("S-07 the action gateway takes the number of an operation only on an invocation and only as the UUID the forwarding process made, and does nothing otherwise", { timeout: 60_000 }, async t => {
  const { home, origin } = await startResidentHost(t);
  const post = (body: unknown) => fetch(`${origin}/api/internal/action-service`, { method: "POST", body: JSON.stringify(body), headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID() } });
  const log = () => { try { return readFileSync(join(home, "logs", "action-calls.jsonl"), "utf8"); } catch { return ""; } };
  const envelope = { home_id: homeId(home), client_id: "runtime:codex", project_id: null };
  const instance = (await (await post({ ...envelope, operation: "discover" })).json() as { instance_id: string }).instance_id;
  const invoke = { ...envelope, operation: "invoke", instance_id: instance, capability: { capability_id: "nobody.provides.this", version: 1 }, input: {} };
  assert.equal(log(), "", "nothing was recorded so far");

  // Every other spelling of a number, and a number on a discovery, is refused with the same input error, and the request does nothing.
  const refusals: unknown[] = [undefined, "", "not-a-uuid", "ABCDEF12-0000-4000-8000-000000000000", `${randomUUID()}x`, `${randomUUID()}\n`, 7, null, [randomUUID()], { id: randomUUID() }];
  for (const call_id of refusals) {
    const answer = await post({ ...invoke, ...(call_id === undefined ? {} : { call_id }) });
    assert.equal(answer.status, 400, JSON.stringify(call_id));
    assert.equal((await answer.json() as { code: string }).code, "actions.input_invalid", JSON.stringify(call_id));
  }
  const discovery = await post({ ...envelope, operation: "discover", call_id: randomUUID() });
  assert.equal(discovery.status, 400);
  assert.equal((await discovery.json() as { code: string }).code, "actions.input_invalid");
  assert.equal(log(), "", "no call was made, so no row was written");

  // A number the forwarding process made is accepted, and is the one the Host's row and its answer carry: nothing else gives a number.
  const id = randomUUID();
  const refusedCall = await post({ ...invoke, call_id: id });
  // W3-02-G1-01: the missing action keeps its recorded refusal and UUID checks, and the common not_found exit answers 404.
  assert.equal(refusedCall.status, 404);
  assert.equal(refusedCall.headers.get("x-molis-work-call-id"), id);
  assert.equal((await refusedCall.json() as { code: string; call_id: string }).call_id, id);
  const rows = log().trim().split("\n").map(line => JSON.parse(line) as { call_id: string; code?: string; refused?: boolean });
  assert.deepEqual(rows.map(row => [row.call_id, row.code, row.refused]), [[id, "actions.missing", true]]);
  const stranger = await fetch(`${origin}/api/internal/action-service`, { method: "POST", body: JSON.stringify({ ...invoke, call_id: randomUUID() }), headers: {
    origin, "content-type": "application/json", "x-molis-work-call-id": id, "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID() } });
  assert.notEqual(stranger.headers.get("x-molis-work-call-id"), id, "a number in a request header is not read");
});
