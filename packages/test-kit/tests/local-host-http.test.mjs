import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  LocalHostHttpClient,
  addProjectPlugin,
  createProject,
  grantMcpAction,
  grantMcpActions,
  isLocalHostHttpError,
  orderGrantViews,
  readMcpActionAccess,
  revokeMcpAction,
} from "@molis-ai/molis-work-test-kit/local-host-http";

/** A local server standing in for the Host's management routes. It records each request and answers with `reply`. */
async function fakeHost(reply) {
  const seen = [];
  const server = createServer(async (request, response) => {
    const parts = [];
    for await (const part of request) parts.push(Buffer.from(part));
    const text = Buffer.concat(parts).toString();
    const entry = { method: request.method, url: request.url, headers: request.headers, text, body: text ? JSON.parse(text) : undefined };
    seen.push(entry);
    const answer = await reply(entry, seen.length - 1);
    response.writeHead(answer.status ?? 200, { "content-type": "application/json", ...(answer.headers ?? {}) });
    response.end(answer.raw ?? JSON.stringify(answer.body ?? {}));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = new LocalHostHttpClient({ origin, controlToken: "fixture-control-token-fixture-control-token" });
  const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  return { seen, origin, client, stop };
}

const view = (id, { scope = "project", needs = [], scene, provider = "provider-a", version = 1 } = {}) => ({
  capability_id: id, version, operation: "command", provider: { provider_id: provider, title: provider, kind: "plugin" }, availability: { available: true },
  action: { scope, ...(needs.length ? { required_actions: needs } : {}), ...(scene ? { required_scene: scene } : {}) },
});
const ids = views => views.map(row => row.capability_id);

test("every mutating request carries the origin, the control token, JSON and a fresh one-time key; a read carries none of them", async () => {
  const { seen, origin, client, stop } = await fakeHost(() => ({ body: { ok: true } }));
  try {
    assert.deepEqual(await client.get("/api/read"), { ok: true });
    assert.deepEqual(await client.post("/api/a", { n: 1 }), { ok: true });
    await client.post("/api/b", { n: 2 });
    await client.delete("/api/c", { n: 3 });
    assert.deepEqual(seen.map(request => [request.method, request.url]), [["GET", "/api/read"], ["POST", "/api/a"], ["POST", "/api/b"], ["DELETE", "/api/c"]]);
    assert.equal(seen[0].headers["x-molis-work-control-token"], undefined, "a read sends no credential");
    const writes = seen.slice(1);
    for (const request of writes) {
      assert.equal(request.headers.origin, origin, "the request is the Host's own origin");
      assert.equal(request.headers["x-molis-work-control-token"], "fixture-control-token-fixture-control-token");
      assert.equal(request.headers["content-type"], "application/json");
    }
    assert.deepEqual(writes.map(request => request.body), [{ n: 1 }, { n: 2 }, { n: 3 }]);
    assert.equal(new Set(writes.map(request => request.headers["x-molis-work-idempotency-key"])).size, 3, "a fresh one-time key for every request");
    assert.ok(String(writes[0].headers["x-molis-work-idempotency-key"]).length >= 8);
  } finally { await stop(); }
});

test("the client keeps the fetch it was made with, so a test that replaces global fetch for an upstream service does not intercept the Host", async () => {
  const { seen, client, stop } = await fakeHost(() => ({ body: { ok: true } }));
  const original = globalThis.fetch;
  let intercepted = 0;
  globalThis.fetch = async () => { intercepted++; return new Response("{}"); };
  try {
    await client.post("/api/a", {});
    await client.get("/api/b");
    assert.equal(intercepted, 0);
    assert.equal(seen.length, 2);
    // A fetch handed in wins, for a test that wants to watch the requests.
    const watched = [];
    const own = new LocalHostHttpClient({ origin: client.origin, controlToken: "fixture-control-token-fixture-control-token", fetch: (url, init) => { watched.push(String(url)); return original(url, init); } });
    await own.get("/api/c");
    assert.deepEqual(watched, [`${client.origin}/api/c`]);
  } finally { globalThis.fetch = original; await stop(); }
});

test("a refusal becomes a LocalHostHttpError (an Error that isLocalHostHttpError) with the status, the code and the Host's own words; a redirect is never followed", async () => {
  let redirect = false;
  const elsewhere = await fakeHost(() => ({ body: {} }));
  const { client, stop } = await fakeHost(request => redirect ? { status: 302, headers: { location: `${elsewhere.origin}/elsewhere` }, body: {} }
    : request.url === "/api/bad" ? { status: 400, body: { error: "授权参数无效", code: "mcp.grant_invalid" } }
      : request.url === "/api/missing" ? { status: 404, body: { error: "能力已失效", code: "actions.missing" } }
        : request.url === "/api/plain" ? { status: 500, raw: "<html>not json</html>" } : { body: {} });
  try {
    await assert.rejects(client.post("/api/bad", {}), error => {
      assert.ok(isLocalHostHttpError(error));
      assert.equal(error.status, 400); assert.equal(error.code, "mcp.grant_invalid"); assert.equal(error.message, "授权参数无效");
      assert.equal(error.method, "POST"); assert.equal(error.path, "/api/bad");
      return true;
    });
    await assert.rejects(client.get("/api/missing"), { status: 404, code: "actions.missing" });
    await assert.rejects(client.get("/api/plain"), error => isLocalHostHttpError(error) && error.status === 500 && error.code === undefined && /500/.test(error.message));
    redirect = true;
    // The control token goes only to the Host's own origin: a redirect is an error of the transport, not an answer to read.
    await assert.rejects(client.post("/api/any", {}), error => !isLocalHostHttpError(error));
    assert.equal(elsewhere.seen.length, 0, "nothing was sent to the address the redirect named");
  } finally { await stop(); await elsewhere.stop(); }
});

test("orderGrantViews puts a dependency before its dependent, matching on the provider only when the reference names one", () => {
  const b = view("b.read"), a = view("a.write", { needs: [{ capability_id: "b.read", version: 1 }] });
  assert.deepEqual(ids(orderGrantViews([a, b])), ["b.read", "a.write"]);
  assert.deepEqual(ids(orderGrantViews([b, a])), ["b.read", "a.write"], "an order that is already right stays");
  const chain = view("c.top", { needs: [{ capability_id: "a.write", version: 1 }] });
  assert.deepEqual(ids(orderGrantViews([chain, a, b])), ["b.read", "a.write", "c.top"]);
  // A dependency outside the set orders nothing; the Host decides whether it was granted.
  assert.deepEqual(ids(orderGrantViews([a])), ["a.write"]);
  // A reference that pins a provider is satisfied by that provider only.
  const pinned = view("p.use", { needs: [{ capability_id: "x.dep", version: 1, provider_id: "provider-z" }] });
  const other = view("x.dep", { provider: "provider-y" }), wanted = view("x.dep", { provider: "provider-z" });
  const labels = rows => rows.map(row => `${row.capability_id}@${row.provider.provider_id}`);
  assert.deepEqual(labels(orderGrantViews([pinned, wanted, other])), ["x.dep@provider-z", "p.use@provider-a", "x.dep@provider-y"], "the other provider's x.dep is not what p.use waits for");
});

test("orderGrantViews puts a view that needs a scene binding after the views that do not, and still obeys the dependencies among them", () => {
  const scene = { scene_id: "home.judgment", version: 1 };
  const evaluate = view("home.judgment.evaluate", { scene }), pick = view("functions.pick"), other = view("other.read");
  assert.deepEqual(ids(orderGrantViews([evaluate, pick, other])), ["functions.pick", "other.read", "home.judgment.evaluate"]);
  // The scene view is not held back past a dependent of its own: a dependency wins over the preference.
  const user = view("scene.user", { needs: [{ capability_id: "home.judgment.evaluate", version: 1 }] });
  assert.deepEqual(ids(orderGrantViews([user, evaluate, pick])), ["functions.pick", "home.judgment.evaluate", "scene.user"]);
});

test("orderGrantViews takes a view that appears twice once: a repeat is not a cycle", () => {
  const b = view("b.read"), a = view("a.write", { needs: [{ capability_id: "b.read", version: 1 }] });
  assert.deepEqual(ids(orderGrantViews([a, a])), ["a.write"]);
  assert.deepEqual(ids(orderGrantViews([a, b, a, b])), ["b.read", "a.write"], "the first place a view stands decides where it is granted");
  assert.deepEqual(ids(orderGrantViews([b, b])), ["b.read"]);
  // A repeated view that is part of a real cycle is still a cycle.
  const x = view("x", { needs: [{ capability_id: "y", version: 1 }] }), y = view("y", { needs: [{ capability_id: "x", version: 1 }] });
  assert.throws(() => orderGrantViews([x, y, x]), /cycle.*\bx\b.*\by\b/is);
});

test("orderGrantViews refuses a cycle before anything is sent", () => {
  const a = view("a", { needs: [{ capability_id: "b", version: 1 }] }), b = view("b", { needs: [{ capability_id: "a", version: 1 }] });
  assert.throws(() => orderGrantViews([a, b]), /cycle.*\ba\b.*\bb\b/is);
  assert.throws(() => orderGrantViews([view("self", { needs: [{ capability_id: "self", version: 1 }] })]), /cycle/i);
});

test("grantMcpAction posts the exact grant the settings page posts; revokeMcpAction posts the same identity as disabled", async () => {
  const { seen, client, stop } = await fakeHost(request => ({ body: { ...request.body, permissions: [] } }));
  try {
    const action = { capability_id: "goals.list", version: 2, provider_id: "goals" };
    const saved = await grantMcpAction(client, { clientId: "runtime:codex", projectId: "p1", action });
    assert.equal(saved.enabled, true);
    await grantMcpAction(client, { clientId: "runtime:codex", projectId: null, action, with: [{ capability_id: "goals.read", version: 1, provider_id: "goals" }] });
    await revokeMcpAction(client, { clientId: "runtime:codex", projectId: "p1", action });
    assert.deepEqual(seen.map(request => [request.method, request.url]), Array(3).fill(["POST", "/api/settings/mcp/actions"]));
    assert.deepEqual(seen[0].body, { client_id: "runtime:codex", project_id: "p1", capability_id: "goals.list", version: 2, provider_id: "goals", enabled: true });
    assert.deepEqual(seen[1].body, { client_id: "runtime:codex", project_id: null, capability_id: "goals.list", version: 2, provider_id: "goals", enabled: true,
      with: [{ capability_id: "goals.read", version: 1, provider_id: "goals" }] });
    assert.deepEqual(seen[2].body, { client_id: "runtime:codex", project_id: "p1", capability_id: "goals.list", version: 2, provider_id: "goals", enabled: false });
  } finally { await stop(); }
});

test("grantMcpActions grants in dependency order, one request per view, home-scope views with no project", async () => {
  const { seen, client, stop } = await fakeHost(request => ({ body: request.body }));
  try {
    const scene = { scene_id: "home.judgment", version: 1 };
    const views = [view("home.judgment.evaluate", { scene, scope: "home" }), view("project.use", { needs: [{ capability_id: "home.dep", version: 1 }] }),
      view("home.dep", { scope: "home" })];
    const saved = await grantMcpActions(client, { clientId: "runtime:codex", projectId: "p1", actions: views });
    assert.deepEqual(seen.map(request => request.body.capability_id), ["home.dep", "project.use", "home.judgment.evaluate"]);
    assert.deepEqual(seen.map(request => request.body.project_id), [null, "p1", null], "a home action is granted for the Home, as the settings page does");
    assert.ok(seen.every(request => request.body.enabled === true && request.body.with === undefined), "ordering carries the dependencies; `with` stays a single-grant option");
    assert.deepEqual(saved.map(row => row.capability_id), ["home.dep", "project.use", "home.judgment.evaluate"]);
  } finally { await stop(); }
});

test("grantMcpActions sends one request for a view the set names twice", async () => {
  const { seen, client, stop } = await fakeHost(request => ({ body: request.body }));
  try {
    const b = view("b.read"), a = view("a.write", { needs: [{ capability_id: "b.read", version: 1 }] });
    const saved = await grantMcpActions(client, { clientId: "runtime:codex", projectId: "p1", actions: [a, a, b] });
    assert.deepEqual(seen.map(request => request.body.capability_id), ["b.read", "a.write"]);
    assert.deepEqual(saved.map(row => row.capability_id), ["b.read", "a.write"]);
  } finally { await stop(); }
});

test("grantMcpActions stops at the first refusal and names the capability the Host refused", async () => {
  const { seen, client, stop } = await fakeHost(request => request.body.capability_id === "b.second"
    ? { status: 400, body: { error: "此能力还要同时授权：x.dep", code: "mcp.grant_requires" } } : { body: request.body });
  try {
    await assert.rejects(grantMcpActions(client, { clientId: "c", projectId: "p", actions: [view("a.first"), view("b.second"), view("c.third")] }), error => {
      assert.ok(isLocalHostHttpError(error));
      assert.equal(error.status, 400); assert.equal(error.code, "mcp.grant_requires");
      assert.match(error.message, /b\.second/); assert.match(error.message, /x\.dep/);
      return true;
    });
    assert.deepEqual(seen.map(request => request.body.capability_id), ["a.first", "b.second"], "nothing after the refusal was sent");
    // A cycle never reaches the Host.
    const before = seen.length;
    await assert.rejects(grantMcpActions(client, { clientId: "c", projectId: "p", actions: [view("a", { needs: [{ capability_id: "b", version: 1 }] }), view("b", { needs: [{ capability_id: "a", version: 1 }] })] }), /cycle/i);
    assert.equal(seen.length, before);
  } finally { await stop(); }
});

test("the management reads and project routes use the Host's own paths and shapes", async () => {
  const { seen, client, stop } = await fakeHost(request => request.url.startsWith("/api/settings/mcp/actions")
    ? { body: { client_id: "c 1", project_id: "p/1", actions: [], grants: [], entries: [] } }
    : request.url === "/api/settings/projects" ? { status: 201, body: { project: { project_id: "p1", display_name: "N", database_path: "/h/p1.db" }, project_path: "/projects/p1/" } }
      : { body: { project_id: "p1", plugins: ["goals", "feed"], hidden: [] } });
  try {
    const access = await readMcpActionAccess(client, { clientId: "c 1", projectId: "p/1" });
    assert.deepEqual(access.grants, []);
    assert.equal(seen[0].url, "/api/settings/mcp/actions?client_id=c%201&project_id=p%2F1");
    await readMcpActionAccess(client, { clientId: "c", projectId: null });
    assert.equal(seen[1].url, "/api/settings/mcp/actions?client_id=c&project_id=");
    const project = await createProject(client, "项目");
    assert.deepEqual(project, { project_id: "p1", display_name: "N", database_path: "/h/p1.db" });
    assert.deepEqual(seen[2].body, { display_name: "项目", user_confirmed: true });
    const plugins = await addProjectPlugin(client, "p/1", "feed");
    assert.deepEqual(plugins, ["goals", "feed"]);
    assert.equal(seen[3].url, "/api/settings/projects/p%2F1/plugins");
    assert.deepEqual(seen[3].body, { plugin_id: "feed" });
  } finally { await stop(); }
});
