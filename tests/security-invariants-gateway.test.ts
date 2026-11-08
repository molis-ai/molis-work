// Security invariant S-07 (docs/system/SECURITY-INVARIANTS.md): the cross-process gateways of the resident Host.
// Runtime context and deletion refusals are in tests/security-invariants-home-context.test.ts. This file holds the
// action operation-number gate and the one rule every process that forwards shares: the
// resident Host is asked at a numeric loopback HTTP address, nothing else, and the Home's control token goes nowhere else.
// Every test asserts the REFUSAL itself (status, code, the project still there, no receipt written, no request made).
// The tests import public entries only (tests/*.test.ts may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { changeMcpClientCredential, createMcpClientProof, LocalActionGatewayClient, mcpClientCredentialPath } from "@molis-ai/molis-work-app-local-host";
import { main as runCli } from "../apps/desktop/launchers/cli/main.js";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

const TOKEN = "security-invariants-gateway-0123456789abcdef";

/** A real Web host (the resident Host) for a scratch Home. */
async function startResidentHost(t: TestContext): Promise<{ home: string; origin: string; port: number }> {
  const directory = await mkdtemp(join(tmpdir(), "security-invariants-gateway-"));
  const home = join(directory, "home");
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  changeMcpClientCredential(home, "runtime:codex", "connect");
  return { home, origin: `http://127.0.0.1:${address.port}`, port: address.port };
}

const homeId = (home: string) => createHash("sha256").update(resolvePath(home)).digest("hex");

test("D0071-01 S-07 a Home control token and a body client_id cannot establish an MCP identity", async t => {
  const { home, origin } = await startResidentHost(t);
  const answer = await fetch(`${origin}/api/internal/action-service`, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify({ operation: "discover", home_id: homeId(home), client_id: "runtime:codex", project_id: null }) });
  assert.equal(answer.status, 403, "the administrative transport token does not prove which MCP client is calling");
  assert.equal(existsSync(join(home, "logs", "action-calls.jsonl")), false, "no action or input was recorded");
});

test("D0071-02 S-07 client proofs reject body identities, forged claims, foreign Homes, expired proofs and revoked registrations", async t => {
  const { home, origin } = await startResidentHost(t), clientId = "runtime:codex";
  const post = (proof: string, extra: Record<string, unknown> = {}) => fetch(`${origin}/api/internal/action-service`, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-client-proof": proof,
  }, body: JSON.stringify({ operation: "discover", home_id: homeId(home), project_id: null, ...extra }) });
  const proof = createMcpClientProof(home, clientId, home, null);
  assert.equal((await post(proof)).status, 200, "a registered client discovers its own directory");
  assert.equal((await post(proof, { client_id: "runtime:someone-else" })).status, 400, "even a valid client cannot name another identity in the body");
  const parts = proof.split("."), claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as Record<string, unknown>;
  const forged = Buffer.from(JSON.stringify({ ...claims, client_id: "runtime:someone-else" })).toString("base64url");
  assert.equal((await post(`mcp1.${forged}.${parts[2]}`)).status, 403);
  assert.equal((await post(createMcpClientProof(home, clientId, home + "-other", null))).status, 403);
  const credential = JSON.parse(readFileSync(mcpClientCredentialPath(home, clientId), "utf8")) as { secret: string };
  const expired = Buffer.from(JSON.stringify({ ...claims, expires_at: Date.now() - 1 })).toString("base64url");
  const signature = createHmac("sha256", Buffer.from(credential.secret, "hex")).update(expired).digest("hex");
  assert.equal((await post(`mcp1.${expired}.${signature}`)).status, 403, "a correctly signed expired proof is refused");
  assert.equal((await post(createMcpClientProof(home, clientId, home, "previous-host-instance"))).status, 409, "D0071-06 a proof for the previous Host is refused");
  changeMcpClientCredential(home, clientId, "remove");
  assert.equal((await post(proof)).status, 403, "removal revokes an already issued proof");
  assert.throws(() => createMcpClientProof(home, clientId, home, null), { code: "actions.connection_required" });
  assert.throws(() => changeMcpClientCredential(home, "agent:prologue", "connect"), { code: "actions.forbidden" });
  assert.equal(existsSync(join(home, "logs", "action-calls.jsonl")), false);
});

test("S-07 a process that forwards to the resident Host asks a numeric loopback HTTP address only, and sends the Home's control token nowhere else", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "security-invariants-forward-"));
  const home = join(directory, "home");
  const requests: string[] = [];
  const listener = http.createServer((incoming, response) => { requests.push(`${incoming.method} ${incoming.url}`); response.statusCode = 500; response.end("{}"); });
  const environment = process.env.MOLIS_WORK_WEB_URL;
  t.after(async () => {
    if (environment === undefined) delete process.env.MOLIS_WORK_WEB_URL; else process.env.MOLIS_WORK_WEB_URL = environment;
    listener.closeAllConnections();
    await new Promise<void>(resolve => listener.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });

  await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const demo = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog =>
    (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project);
  // The Home has run a Host before: its token is in the Home, so a forwarding process would find it and send it.
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(join(home, "config", "web-control-token"), `${TOKEN}\n`, { mode: 0o600 });

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
  await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => assert.equal(catalog.listProjectDeletions().length, 0));
});

test("S-07 the action gateway takes the number of an operation only on an invocation and only as the UUID the forwarding process made, and does nothing otherwise", { timeout: 60_000 }, async t => {
  const { home, origin } = await startResidentHost(t);
  const post = (body: Record<string, unknown>, clientId = "runtime:codex") => fetch(`${origin}/api/internal/action-service`, { method: "POST", body: JSON.stringify(body), headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID(),
    "x-molis-work-client-proof": createMcpClientProof(home, clientId, home, typeof body.instance_id === "string" ? body.instance_id : null) } });
  const log = () => { try { return readFileSync(join(home, "logs", "action-calls.jsonl"), "utf8"); } catch { return ""; } };
  const envelope = { home_id: homeId(home), project_id: null };
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
    origin, "content-type": "application/json", "x-molis-work-call-id": id, "x-molis-work-client-proof": createMcpClientProof(home, "runtime:codex", home, instance), "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID() } });
  assert.notEqual(stranger.headers.get("x-molis-work-call-id"), id, "a number in a request header is not read");
});

test("S-08 the action gateway refuses a forwarding process that names itself as one of the Host's own Agents, and records nothing", { timeout: 60_000 }, async t => {
  const { home, origin } = await startResidentHost(t);
  const post = (body: Record<string, unknown>, clientId = "runtime:codex") => fetch(`${origin}/api/internal/action-service`, { method: "POST", body: JSON.stringify(body), headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": randomUUID(),
    "x-molis-work-client-proof": createMcpClientProof(home, clientId, home, typeof body.instance_id === "string" ? body.instance_id : null) } });
  const log = () => { try { return readFileSync(join(home, "logs", "action-calls.jsonl"), "utf8"); } catch { return ""; } };
  const envelope = { home_id: homeId(home), project_id: null };
  const instance = (await (await post({ ...envelope, operation: "discover" })).json() as { instance_id: string }).instance_id;
  // The built-in Agent's id, and the shape a task's grant subject takes (specs/proactive-assistant/schedule-task-reads.md §3.1).
  for (const client_id of ["agent:prologue", "agent:task:project:install:task", "agent:"]) {
    for (const body of [{ ...envelope, client_id, operation: "discover" },
      { ...envelope, client_id, operation: "invoke", instance_id: instance, call_id: randomUUID(), capability: { capability_id: "nobody.provides.this", version: 1 }, input: {} }]) {
      const answer = await post(body);
      assert.equal(answer.status, 400, `${client_id} ${body.operation}`);
      assert.equal((await answer.json() as { code: string }).code, "actions.input_invalid", `${client_id} ${body.operation}`);
    }
  }
  assert.equal(log(), "", "a refused identity made no call, so no row was written");
  // A Runtime and a cross-device member still reach the Host.
  for (const client_id of ["runtime:codex", "runtime:cross-device:member"]) {
    changeMcpClientCredential(home, client_id, "connect");
    assert.equal((await post({ ...envelope, operation: "discover" }, client_id)).status, 200, client_id);
  }
});

// D0071-03: no malformed registration becomes an identity, and reads do not repair it.
test("D0071-03 S-07 credential reads refuse links, wide permissions, wrong versions and invalid client names", async t => {
  const { home } = await startResidentHost(t), client = "runtime:codex", file = mcpClientCredentialPath(home, client);
  const original = readFileSync(file, "utf8");
  await chmod(file, 0o644);
  assert.throws(() => createMcpClientProof(home, client, home, null), { code: "actions.forbidden" });
  assert.equal(readFileSync(file, "utf8"), original);
  await chmod(file, 0o600);
  await writeFile(file, JSON.stringify({ ...JSON.parse(original), schema_version: 2 }));
  assert.throws(() => createMcpClientProof(home, client, home, null), { code: "actions.forbidden" });
  await rm(file); const other = join(home, "target-private.json"); await writeFile(other, original, { mode: 0o600 }); await symlink(other, file);
  assert.throws(() => createMcpClientProof(home, client, home, null), { code: "actions.forbidden" });
  assert.throws(() => changeMcpClientCredential(home, client, "connect"), { code: "actions.forbidden" });
  assert.equal(readFileSync(other, "utf8"), original);
  assert.throws(() => mcpClientCredentialPath(home, "runtime:\ud800"), { code: "actions.forbidden" });
});
