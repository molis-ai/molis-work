import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

// A key checked before it is saved (spec assistant-service-connections §13.6 ④d, BL-1058). Every service here is a fake: the Host's
// requests to it are answered by a stub of `fetch`, and nothing leaves the machine.

type Answer = { status: number; body: Record<string, unknown>; text: string };

async function send(home: TestHome, method: "POST" | "PATCH", path: string, body: unknown): Promise<Answer> {
  const response = await fetch(home.origin + path, { method, body: JSON.stringify(body), headers: {
    origin: home.origin, "content-type": "application/json", "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID(),
  } });
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown> };
}

/** Requests that leave for a service, answered by `answer`; the Home's own requests go through. */
function services(t: TestContext, home: TestHome, answer: (url: string, init?: RequestInit) => Response) {
  const sent: Array<{ url: string; authorization: string | null }> = [];
  const real = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(home.origin)) return real(input, init);
    sent.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    return answer(url, init);
  });
  return sent;
}

/** Every file under the Home, as text: a key that was not saved is in none of them (library, secrets, logs, check records). */
async function homeHolds(home: string, value: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(home, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    if ((await readFile(file)).includes(value)) found.push(file);
  }
  return found;
}

const github = (status: number, headers: Record<string, string> = {}) => (url: string) => {
  assert.equal(url, "https://api.github.com/user");
  return status === 200 ? Response.json({ login: "fixture-octocat", id: 7 }, { headers: { "x-oauth-scopes": "notifications" } })
    : Response.json({ message: "fixture refusal" }, { status, headers });
};

const connections = (home: TestHome) => withConnectorConnections(home.home, store => store.list());

test("ASC-80 S-144 a first key the service refuses is not saved: no connection, no check, the key in no file of the Home", async t => {
  const home = await openTestHome(t);
  let answer = github(401);
  const sent = services(t, home, (url, init) => answer(url, init));
  const candidate = `fixture-candidate-${randomUUID()}`;
  const refused = await send(home, "POST", "/api/settings/connectors/connections", { service_id: "github", display_name: "Work", token: candidate });
  assert.equal(refused.status, 502, "the service refused it: an upstream answer");
  assert.equal(refused.body.code, "connector.read.refused");
  assert.equal(refused.body.saved, false);
  assert.equal(refused.text.includes(candidate), false, "the answer does not repeat the key");
  assert.equal(sent.length, 1, "the key was asked of its service once");
  assert.deepEqual(connections(home), [], "nothing was saved");
  assert.deepEqual(await homeHolds(home.home, candidate), [], "the refused key is in no library, secret, log or check record");

  // The service asks to wait: still nothing is saved, and the answer says when it allows another try.
  answer = github(429, { "retry-after": "60" });
  const limited = await send(home, "POST", "/api/settings/connectors/connections", { service_id: "github", display_name: "Work", token: candidate });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "connector.check.rate_limited");
  assert.equal(typeof (limited.body.details as { retry_at?: unknown } | undefined)?.retry_at, "string");
  assert.deepEqual(connections(home), []);

  // A key it accepts is saved, and that check is the connection's first one, of the version just written.
  answer = github(200);
  const saved = await send(home, "POST", "/api/settings/connectors/connections", { service_id: "github", display_name: "Work", token: candidate });
  assert.equal(saved.status, 201, saved.text);
  assert.equal((saved.body.verification as { available?: boolean }).available, true);
  assert.equal(saved.text.includes(candidate), false);
  const [row] = connections(home);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(row!.connection_id, "github")), candidate);
  const listed = await home.web.get<{ connections: Array<{ connection_id: string; status?: { connectivity: { state: string } } }> }>("/api/settings/connectors/connections");
  assert.equal(listed.connections.find(view => view.connection_id === row!.connection_id)?.status?.connectivity.state, "connected");
  assert.equal(sent.length, 3, "one request per save, none after it");
});

test("ASC-81 S-144 a replacement the service refuses leaves the old key in use and the connection as it was; one it accepts goes in", async t => {
  const home = await openTestHome(t);
  const old = `fixture-old-${randomUUID()}`, candidate = `fixture-new-${randomUUID()}`;
  const original = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: old }));
  let answer = github(401);
  const sent = services(t, home, (url, init) => answer(url, init));
  const refused = await send(home, "PATCH", `/api/settings/connectors/connections/${original.connection_id}`, { token: candidate });
  assert.equal(refused.status, 502);
  assert.equal(refused.body.code, "connector.read.refused");
  assert.equal(sent.at(-1)?.authorization?.includes(candidate), true, "the candidate itself was asked about");
  const after = withConnectorConnections(home.home, store => store.require(original.connection_id));
  assert.equal(after.updated_at, original.updated_at, "the connection is the same version");
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(original.connection_id, "github")), old, "the old key stays in use");
  assert.deepEqual(await homeHolds(home.home, candidate), [], "the refused key is in no file of the Home");
  const listed = await home.web.get<{ connections: Array<{ connection_id: string; status?: { connectivity: { state: string } } }> }>("/api/settings/connectors/connections");
  assert.notEqual(listed.connections[0]?.status?.connectivity.state, "failed", "the refusal of a key not saved is not the old key's check");

  answer = github(200);
  const replaced = await send(home, "PATCH", `/api/settings/connectors/connections/${original.connection_id}`, { token: candidate });
  assert.equal(replaced.status, 200, replaced.text);
  assert.equal((replaced.body.verification as { available?: boolean }).available, true);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(original.connection_id, "github")), candidate);
});

test("S-144 a replacement key naming another site than its connection's is refused before any request carries it", async t => {
  const home = await openTestHome(t);
  const old = "a-site.atlassian.net|me@example.com|fixture-old-jira";
  const original = withConnectorConnections(home.home, store => {
    const row = store.createToken({ serviceId: "jira", displayName: "Jira", token: old });
    store.assertTarget(row.connection_id, "jira", "https://a-site.atlassian.net");
    return store.require(row.connection_id);
  });
  const sent = services(t, home, () => { throw new Error("a candidate for another site must not be sent"); });
  const candidate = `b-site.atlassian.net|me@example.com|fixture-new-${randomUUID()}`;
  const refused = await send(home, "PATCH", `/api/settings/connectors/connections/${original.connection_id}`, { token: candidate });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, "connector.connection.service_mismatch");
  assert.deepEqual(sent, [], "nothing was sent anywhere");
  assert.equal(refused.text.includes("fixture-new-"), false);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(original.connection_id, "jira")), old);
  assert.equal(withConnectorConnections(home.home, store => store.require(original.connection_id)).updated_at, original.updated_at);
});
