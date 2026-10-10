// Security invariant S-12 (docs/system/SECURITY-INVARIANTS.md): a secret is handed to the host once and afterwards exists only as a
// reference. The sweep plants distinctive secrets through the real web host (a pasted connector token, a model provider's key, a
// rotated token) and then looks everywhere a value could surface:
//   - the answer to the request that planted it, and the answer to every read surface of the host
//   - what the host printed (stdout, stderr, console)
//   - the action error a secret-bearing input raises, and the call log the commands that received it are recorded in (a finished one and a
//     failed one are produced on purpose, so the log has records to sweep)
//   - every file of the Home, whatever its format (SQLite files and their journals, JSON, logs, the secret store itself)
// The control token is not a secret in this sense: the host hands it to the page it serves (to loopback Hosts only, S-02).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { AddressInfo } from "node:net";
import { MolisWorkLocalHost, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const CONTROL = "secrets-sweep-control-token-0123456789abcdefghij";
const SECRETS = {
  connector: "Zq7vK-conn-7f3c91d2e8b44a10aa",
  rotated: "Zq7vK-rotd-5b21c0d9a7e34f66bb",
  provider: "Zq7vK-prov-9e08d4a1c3f2477acc",
  actionInput: "Zq7vK-action-1a2b3c4d5e6f7a8b",
} as const;

/** Every way a program could write a value out unchanged enough to be recognised. */
function spellings(secret: string): string[] {
  const bytes = Buffer.from(secret);
  return [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1), bytes.toString("base64"), bytes.toString("base64url"), bytes.toString("hex"), secret.slice(0, 14), secret.slice(-14)];
}
const ALL_SPELLINGS = Object.values(SECRETS).flatMap(spellings);
function leaks(haystack: string | Buffer): string[] {
  const text = typeof haystack === "string" ? haystack : haystack.toString("latin1");
  return ALL_SPELLINGS.filter(spelling => text.includes(spelling));
}

async function filesUnder(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

interface Answer { status: number; body: string }
function request(port: number, method: string, path: string, body?: unknown): Promise<Answer> {
  const origin = `http://127.0.0.1:${port}`;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, agent: false, headers: { host: `127.0.0.1:${port}`,
      ...(method === "GET" ? {} : { origin, "content-type": "application/json", "x-molis-work-control-token": CONTROL, "x-molis-work-idempotency-key": randomUUID() }) } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

/** Everything the process writes to stdout/stderr while the test runs, still passed on so the runner's own output survives. */
function captureOutput(t: TestContext): { text(): string } {
  let captured = "";
  for (const stream of [process.stdout, process.stderr] as const) {
    const original = stream.write.bind(stream) as (...args: unknown[]) => boolean;
    t.mock.method(stream, "write", (...args: unknown[]) => { captured += typeof args[0] === "string" ? args[0] : Buffer.from(args[0] as Uint8Array).toString("utf8"); return original(...args); });
  }
  return { text: () => captured };
}

// Read surfaces of the host that a person's page, a script on the machine or a support session could ask for.
const READ_SURFACES = ["/", "/health", "/api/settings/connectors/connections", "/api/settings/connectors/connections?service_id=github", "/api/settings/connectors", "/api/settings/models",
  "/api/settings/diagnostics", "/api/settings/mcp/actions", "/api/settings/projects", "/api/settings/runtimes", "/api/settings/web-service", "/api/onboarding/status", "/api/browser/assistant",
  "/api/browser/sites", "/api/plugins/runtime/updates", "/api/agent-definitions", "/api/memory", "/api/assistant", "/api/home/events", "/api/contextual/surfaces", "/api/settings/planning-methods"];

test("S-12 a secret handed to the host once never comes back: not in an answer, a log, an error, a call record or any file of the Home", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(os.tmpdir(), "security-invariants-secrets-"));
  const previous = { home: process.env.MOLIS_WORK_HOME, backend: process.env.MOLIS_WORK_SECRET_BACKEND };
  process.env.MOLIS_WORK_HOME = home;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  resetSecretStoreCache();
  const output = captureOutput(t);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(() => host.close());
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: CONTROL, localHost: host });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    resetSecretStoreCache();
    if (previous.home === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = previous.home;
    if (previous.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous.backend;
    await rm(home, { recursive: true, force: true });
  });
  const answers: Array<[string, Answer]> = [];
  const ask = async (method: string, path: string, body?: unknown) => { const answer = await request(port, method, path, body); answers.push([`${method} ${path}`, answer]); return answer; };

  // 1. Plant. The answer to the request that carried the secret already must not repeat it.
  const planted = await ask("POST", "/api/settings/connectors/connections", { service_id: "github", display_name: "Sweep account", token: SECRETS.connector });
  assert.equal(planted.status, 201, planted.body);
  const connectionId = (JSON.parse(planted.body) as { connection: { connection_id: string } }).connection.connection_id;
  assert.equal((await ask("POST", "/api/settings/models/sweep-provider", { display_name: "Sweep provider", base_url: "https://models.sweep.example/v1", api_format: "openai-chat-completions",
    enabled: true, prompt_cache: "off", models: [{ model_id: "sweep-model", enabled: true }], api_key: SECRETS.provider })).status, 200);
  // A refused attempt must not echo what it refused either.
  assert.notEqual((await ask("POST", "/api/settings/models/sweep-provider", { display_name: "x", base_url: "https://models.sweep.example/v1", api_format: "openai-chat-completions",
    enabled: true, prompt_cache: "off", models: [], api_key: SECRETS.provider.slice(0, 7) })).status, 200);
  assert.equal((await ask("PATCH", `/api/settings/connectors/connections/${connectionId}`, { token: SECRETS.rotated })).status, 200);
  assert.notEqual((await ask("POST", "/api/settings/connectors/connections", { service_id: "github", display_name: "Bad", token: SECRETS.actionInput, account_label: 42 })).status, 500);

  // 2. Read. Every surface answers (or refuses) without a value, with a person's credentials and with none.
  for (const path of READ_SURFACES) await ask("GET", path);
  assert.ok(answers.some(([label, answer]) => label === "GET /api/settings/connectors/connections" && answer.status === 200 && answer.body.includes(connectionId)), "the listing did list the connection (the sweep looked at something)");
  assert.ok(answers.some(([label, answer]) => label === "GET /api/settings/models" && answer.status === 200 && answer.body.includes("sweep-provider")), "…and the provider");

  // 3. Actions whose input carries a secret. One fails its input check: the error names the field, never the value. Two reach their handler,
  // one that finishes and one that fails: each leaves a record in the call log (what ran, for whom, how it ended), and that record
  // keeps neither the input nor the result.
  const command = (name: string, properties: Record<string, unknown>): ActionDefinition<Record<string, unknown>, Record<string, unknown>> => ({ capability_id: `unknown.sweep.${name}`, version: 1, operation: "command", action: {
    title: `Sweep ${name}`, description: "Fixture", kind: "operation", scope: "home", audiences: ["user"], permissions: ["sweep:write"], subject_kinds: [],
    input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
    output_schema: { type: "object", properties: { echoed: { type: "string" } }, additionalProperties: false } } });
  const refused = command("save", { count: { type: "integer" } });
  const finished = command("finish", { note: { type: "string" } });
  const failing = command("fail", { note: { type: "string" } });
  host.actionRegistry().registerProvider({ provider: { provider_id: "sweep", title: "Sweep", kind: "plugin", plugin_id: "io.molis.work.example.sweep" }, definitions: [refused, finished, failing], handlers: [
    { ...refused, handle: async () => ({}) },
    { ...finished, handle: async (_context, input) => ({ echoed: String(input.note) }) },
    { ...failing, handle: async () => { throw new Error("the sweep handler refuses this one"); } },
  ] });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["sweep:write"] };
  const failure = await host.homeActionClient().invoke(caller, refused, { count: SECRETS.actionInput } as never).then(() => null, (error: Error) => error);
  assert.ok(failure, "the input was refused");
  assert.deepEqual(leaks(`${failure.message} ${JSON.stringify(failure)}`), [], "the error names the field, never the value");
  const done = await host.homeActionClient().invoke(caller, finished, { note: SECRETS.actionInput });
  assert.equal((done as { echoed?: string }).echoed, SECRETS.actionInput, "the handler did receive the value (the caller gets its own result back)");
  const handlerFailure = await host.homeActionClient().invoke(caller, failing, { note: SECRETS.actionInput }).then(() => null, (error: Error) => error);
  assert.ok(handlerFailure, "the failing handler's call failed");
  assert.deepEqual(leaks(`${handlerFailure.message} ${JSON.stringify(handlerFailure)}`), [], "a handler's error carries no input value");
  // The records are there (the sweep looked at something) and hold neither value.
  const records = host.callLog!.list(null);
  assert.ok(records.some(record => record.capability_id === finished.capability_id && record.ok), `the finished command is in the call log: ${JSON.stringify(records)}`);
  assert.ok(records.some(record => record.capability_id === failing.capability_id && !record.ok && record.message), `the failed command is in the call log: ${JSON.stringify(records)}`);
  const callLogFile = join(home, "logs", "action-calls.jsonl");
  const callLogText = await readFile(callLogFile, "utf8");
  assert.match(callLogText, /unknown\.sweep\.finish/);
  assert.match(callLogText, /unknown\.sweep\.fail/);
  assert.deepEqual(leaks(callLogText), [], "the call log keeps what ran and how it ended, not what it was given or what it returned");

  // 4. The Home, file by file (the secret store included: it holds ciphertext, so even it holds no value in the clear).
  const files = (await filesUnder(home)).filter(file => !file.endsWith(".sock"));
  assert.ok(files.length > 3, "the Home has files to look at");
  assert.ok(files.some(file => file.endsWith("secrets.json")), "…and the secret store is among them");
  for (const file of files) {
    if ((await stat(file)).size > 64 * 1024 * 1024) continue;
    assert.deepEqual(leaks(await readFile(file)), [], `${file.slice(home.length)} holds a secret value`);
  }

  // 5. What was said and printed.
  for (const [label, answer] of answers) assert.deepEqual(leaks(answer.body), [], `the answer to ${label} carries a secret value`);
  assert.deepEqual(leaks(output.text()), [], "the host printed a secret value");
  // The reference that stands in for the secret is all a record keeps: it is there, and it is not the value.
  const [connection] = withConnectorConnections(home, store => store.list("github"));
  assert.match(connection?.credential_ref ?? "", /^[a-z][a-z0-9:_-]*$/i);
  assert.equal(withConnectorConnections(home, store => store.resolveToken(connectionId, "github")), SECRETS.rotated, "the rotated value is what the store hands to the one caller that may have it");
});
