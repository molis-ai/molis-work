import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { completeApiOAuth, connectorProtocolSecrets, createCatalogConnector, createGithubConnector, createGmailConnector, homeIntegrationRegistry, startApiOAuth, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { catalogConnectorIds } from "@molis-ai/molis-work-integration-catalog";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { connectorControl } from "./fixtures/connector-control.js";
import { withIntegrationHome } from "./fixtures/integration-home.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";

// T-120 (BL-740 group; specs/repository-anti-corruption/slices/pg046-integrations-from-manifest.md): which connector reads a source's
// credential is decided where the built-in integrations are listed, one per kind, and not by a function that guesses the kind from the
// integration id. The cases that say "unchanged" were run on the tree before the move and passed there.

const root = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = "dummy-fixture-token";
const BUILTIN_IDS = ["github", "gmail", ...catalogConnectorIds()];

/** The ids the Host's registry serves: a catalog connector with no feed has no integration plugin. */
const served = (registry: { integration(id: string): unknown }) => BUILTIN_IDS.filter(id => registry.integration(id));

const binding = (extra: Partial<IntegrationBinding> = {}): IntegrationBinding => ({ source_id: "source-1", connection_id: null, credential_ref: null, config: {}, ...extra });

/** Runs `run` with `fetch` replaced, so a connector that reaches for the network never gets out; a stub that records says what it was asked. */
async function withFetch<T>(fetchImpl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

const headerOf = (init: RequestInit | undefined, name: string): string | undefined => {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const found = Object.entries(headers as Record<string, string>).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1];
};

test("RAC-2660 integration-providers.ts imports no connector and names no integration: the kinds are wired where the built-in integrations are listed", () => {
  const file = "apps/local-host/src/integration-providers.ts";
  const source = ts.createSourceFile(file, readFileSync(`${root}${file}`, "utf8"), ts.ScriptTarget.Latest, true);
  const imported: string[] = [], literals: string[] = [], comparisons: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imported.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) imported.push(node.arguments[0].text);
    if (ts.isStringLiteral(node) && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) literals.push(node.text);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) comparisons.push(node.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.deepEqual(imported.filter(specifier => specifier.startsWith("./")), [], "it imports no Host file, so no connector");
  assert.deepEqual(literals.filter(text => BUILTIN_IDS.includes(text)), [], "it names no integration");
  assert.deepEqual(comparisons, [], "it chooses nothing by comparison");
});

test("RAC-2661 every built-in integration reads through the connector of its own kind (unchanged)", async () => {
  await withIntegrationHome(async home => {
    // Without a connection none of the three reads asks the network anything: a wiring that does is seen in `calls`, not hidden in a health answer.
    const calls: string[] = [];
    const offline = (async (input: RequestInfo | URL) => { calls.push(String(input)); throw new Error("offline"); }) as typeof fetch;
    await withFetch(offline, async () => {
      const registry = await homeIntegrationRegistry(home.directory);
      const direct = (id: string): IntegrationProviderPort => id === "github" ? createGithubConnector({ allowFixture: false })
        : id === "gmail" ? createGmailConnector({ allowFixture: false }) : createCatalogConnector({ connectorId: id });
      assert.ok(served(registry).length > 3, "the Host serves github, gmail and several catalog connectors");
      for (const id of served(registry)) {
        const bound = await registry.bind(id, "source", binding({ source_id: `source-${id}` }));
        const driver = await bound.connector_driver.health(connectorControl());
        const expected = await direct(id).health(connectorControl());
        assert.equal(driver.ok, expected.ok, `${id}: the same answer as its own connector`);
        assert.equal(driver.message, expected.message, `${id}: and in its own words`);
      }
    });
    assert.deepEqual(calls, [], "no request left for the network");
  });
});

test("RAC-2662 a Host that brings its own provider factory is asked once for each built-in integration, by its id, with its binding, and gets a registry of its own (unchanged)", async () => {
  const asked: Array<{ id: string; source_id: string }> = [];
  const stand: IntegrationProviderPort = {
    type: "stand-in",
    async health() { return { ok: true, status: "connected", message: "stand-in" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: {} }; },
  };
  const factory = (id: string, seen: IntegrationBinding): IntegrationProviderPort => { asked.push({ id, source_id: seen.source_id }); return stand; };
  const registry = await homeIntegrationRegistry("unused-home", factory);
  const ids = served(registry);
  assert.ok(ids.length > 3);
  for (const id of ids) await registry.bind(id, "source", binding({ source_id: `source-${id}` }));
  assert.deepEqual(asked, ids.map(id => ({ id, source_id: `source-${id}` })));
  assert.notEqual(await homeIntegrationRegistry("unused-home", factory), registry, "a caller's own factory shares nothing");
});

test("RAC-2663 RAC-2861 each source reads its current connection: an old credential_ref cannot select another account, and no binding sends nothing", async () => {
  await withIntegrationHome(async home => {
    const seen: Array<{ url: string; authorization: string | undefined }> = [];
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), authorization: headerOf(init, "authorization") });
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const registry = await homeIntegrationRegistry(home.directory);
    const carrying = () => seen.filter(call => call.authorization?.includes(FIXTURE));

    // A catalog source: the token of the connection the source names.
    const connection = withConnectorConnections(home.directory, store => store.createToken({ serviceId: "linear", displayName: "Fixture", token: FIXTURE }));
    await withFetch(spy, async () => {
      await (await registry.bind("linear", "source", binding({ connection_id: connection.connection_id }))).connector_driver.health(connectorControl());
    });
    assert.ok(carrying().length > 0, "linear: the request carries its connection's token");
    assert.ok(carrying().every(call => call.url.includes("linear")), "linear: and goes to its own service");
    seen.length = 0;
    await withFetch(spy, async () => {
      const bound = await registry.bind("linear", "source", binding());
      assert.equal((await bound.connector_driver.health(connectorControl())).ok, false, "linear: no connection, no account");
    });
    assert.deepEqual(carrying(), [], "linear: without a connection nothing is sent with a token");

    // GitHub and Gmail resolve the connection now; a stale reference from a previous binding neither selects nor authorizes an account.
    for (const { id, host } of [{ id: "github", host: "github" }, { id: "gmail", host: "google" }]) {
      const reference = `secret:${id}-fixture`;
      createFileSecretStore().put(reference, "stale-reference-token");
      const account = withConnectorConnections(home.directory, store => store.createToken({ serviceId: id, displayName: "Current", token: FIXTURE }));
      for (const credential_ref of [reference, null]) {
        seen.length = 0;
        await withFetch(spy, async () => {
          await (await registry.bind(id, "source", binding({ connection_id: account.connection_id, credential_ref }))).connector_driver.health(connectorControl());
        });
        assert.ok(carrying().length > 0, `${id}: the request carries the current connection's token`);
        assert.ok(carrying().every(call => call.url.includes(host)), `${id}: and goes to its own service`);
        assert.ok(seen.every(call => call.authorization !== "Bearer stale-reference-token"));
      }
      seen.length = 0;
      await withFetch(spy, async () => {
        await (await registry.bind(id, "source", binding({ credential_ref: account.credential_ref }))).connector_driver.health(connectorControl());
      });
      assert.deepEqual(seen, [], `${id}: a reference without a connection sends nothing`);
    }
  });
});

const CURRENT_SERVICES = ["github", "gmail", "google-drive"] as const;

/** Only the HTTP response is scripted: registry binding, resolver, secret owner and protocol mapping remain production code. */
function accountResponse(service: string, input: RequestInfo | URL): Response {
  const url = new URL(String(input));
  if (service === "github") return url.pathname === "/user"
    ? Response.json({ login: "octo" }, { headers: { "x-oauth-scopes": "notifications, read:user" } })
    : Response.json([{ id: "oauth-notification", repository: { full_name: "fixture/project" }, subject: { title: "OAuth notification", type: "Issue" },
      reason: "subscribed", unread: true, updated_at: "2026-11-01T12:00:00Z" }]);
  if (service === "gmail") {
    if (url.pathname.endsWith("/profile")) return Response.json({ historyId: "200", emailAddress: "me@example.test" });
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "oauth-message" }] });
    return Response.json({ id: "oauth-message", snippet: "OAuth message", labelIds: ["INBOX", "UNREAD"], payload: { headers: [{ name: "Subject", value: "OAuth message" }] } });
  }
  return url.pathname === "/drive/v3/about" ? Response.json({ user: { emailAddress: "drive@example.test" } })
    : Response.json({ files: [{ id: "oauth-file", name: "OAuth document", modifiedTime: "2026-11-01T12:00:00Z" }] });
}

test("RAC-2861 RAC-2862 invalid, disabled, disconnected, missing-secret and wrong-service connections keep the closed health/sync answers and dispatch nothing", async () => {
  await withIntegrationHome(async home => {
    const registry = await homeIntegrationRegistry(home.directory);
    let dispatched = 0;
    await withFetch(async () => { dispatched += 1; throw new Error("unexpected dispatch"); }, async () => {
      for (const service of CURRENT_SERVICES) {
        const make = (serviceId = service) => withConnectorConnections(home.directory, store => store.createToken({ serviceId, displayName: "Account", token: FIXTURE }));
        const disabled = make(), disconnected = make(), missing = make(), wrong = make(service === "github" ? "gmail" : "github");
        withConnectorConnections(home.directory, store => { store.setEnabled(disabled.connection_id, false); store.disconnect(disconnected.connection_id); });
        createFileSecretStore().delete(missing.credential_ref!);
        for (const connection_id of [null, "missing-connection", disabled.connection_id, disconnected.connection_id, missing.connection_id, wrong.connection_id]) {
          const provider = (await registry.bind(service, "source", binding({ connection_id, credential_ref: missing.credential_ref }))).connector_driver;
          const health = await provider.health(connectorControl());
          assert.equal(health.ok, false, `${service}/${connection_id}`);
          assert.equal(health.status, service === "google-drive" ? "needs_auth" : "disconnected");
          const pulled = await provider.poll({ cursor: null, intent: {} }, connectorControl());
          assert.equal(pulled.ok, false);
          if (!pulled.ok) assert.equal(pulled.failure, "needs_auth");
        }
      }
    });
    assert.equal(dispatched, 0);
  });
});

test("RAC-2863 concurrent sources in one Home and in another Home retain their own account even when the default Home is the other one", async () => {
  await withIntegrationHome(async first => withIntegrationHome(async second => {
    for (const service of CURRENT_SERVICES) {
      const accounts = [first.directory, first.directory, second.directory].map((home, index) => ({ home, token: `fixture-${service}-account-${index}`,
        connection: withConnectorConnections(home, store => store.createToken({ serviceId: service, displayName: `Account ${index}`, token: `fixture-${service}-account-${index}` })) }));
      const gates = accounts.map(() => Promise.withResolvers<void>()), entered = Promise.withResolvers<void>(), seen: string[] = [];
      await withFetch(async (input, init) => {
        const authorization = headerOf(init, "authorization")!;
        const index = accounts.findIndex(account => authorization === `Bearer ${account.token}`);
        assert.ok(index >= 0, "only one of the three exact accounts may be sent");
        seen.push(authorization);
        if (seen.length === accounts.length) entered.resolve();
        await gates[index]!.promise;
        return accountResponse(service, input);
      }, async () => {
        const pending = accounts.map(async (account, index) => {
          const registry = await homeIntegrationRegistry(account.home);
          const bound = await registry.bind(service, "source", binding({ source_id: `source-${index}`, connection_id: account.connection.connection_id, credential_ref: "secret:stale" }));
          return bound.connector_driver.health(connectorControl());
        });
        try {
          await Promise.race([entered.promise, Promise.all(pending).then(() => assert.fail("reads ended before every request entered"))]);
          for (const gate of gates.toReversed()) gate.resolve();
          assert.ok((await Promise.all(pending)).every(result => result.ok));
        } finally { for (const gate of gates) gate.resolve(); }
      });
      assert.deepEqual(seen.sort(), accounts.map(account => `Bearer ${account.token}`).sort());
    }
  }));
});

/** A real generic OAuth flow; only the public DNS/socket response is replaced by oauthNetwork. */
function oauthAccounts(t: TestContext) {
  const issued = new Map<string, number>(), sent: Array<{ service: string; grant: string | null }> = [];
  let active = "", refuse = false;
  oauthNetwork(t, async (url, init) => {
    if (url.endsWith("/token") || url.endsWith("/access_token")) {
      const body = new URLSearchParams(init.body), service = body.get("client_id")!;
      sent.push({ service, grant: body.get("grant_type") });
      if (refuse) return Response.json({ error: "invalid_grant" }, { status: 400 });
      const count = (issued.get(service) ?? 0) + 1; issued.set(service, count);
      return Response.json({ access_token: `${service}-oauth-${count}`, refresh_token: `${service}-refresh-${count}`, expires_in: 3600 });
    }
    assert.ok(url === "https://api.github.com/user" || url === "https://openidconnect.googleapis.com/v1/userinfo");
    return Response.json(active === "github" ? { id: 17, login: "octo" } : { sub: `${active}-sub`, email: `${active}@example.test` });
  });
  return { sent, refuse: () => { refuse = true; }, async connect(home: string, service: string) {
    active = service;
    const origin = "http://127.0.0.1:19404";
    const started = await startApiOAuth(home, { serviceId: service, displayName: service, clientId: service, clientSecret: "fixture-oauth-client", origin });
    await completeApiOAuth(home, { state: new URL(started.authorization_url).searchParams.get("state")!, code: "fixture-code", origin });
    return withConnectorConnections(home, store => store.require(started.connection_id));
  } };
}

test("RAC-2862 the production registry reads all three OAuth connections; Gmail and Catalog retry one 401 while GitHub preserves its health and sync failures", async t => {
  const oauth = oauthAccounts(t);
  await withIntegrationHome(async home => {
    const registry = await homeIntegrationRegistry(home.directory);
    for (const service of CURRENT_SERVICES) {
      const account = await oauth.connect(home.directory, service), seen: string[] = [];
      let unauthorized = false;
      await withFetch(async (input, init) => {
        const authorization = headerOf(init, "authorization")!; seen.push(authorization);
        if (unauthorized && authorization === `Bearer ${service}-oauth-1`) return Response.json({}, { status: 401 });
        return accountResponse(service, input);
      }, async () => {
        const provider = (await registry.bind(service, "source", binding({ connection_id: account.connection_id, credential_ref: "secret:forged" }))).connector_driver;
        assert.equal((await provider.health(connectorControl())).ok, true);
        const pulled = await provider.poll({ cursor: null }, connectorControl());
        assert.equal(pulled.ok, true);
        if (pulled.ok) assert.equal(pulled.events.length, 1);
        unauthorized = true; seen.length = 0;
        const result = await provider.health(connectorControl());
        assert.equal(result.ok, service !== "github");
        if (service === "github") assert.equal(result.status, "error", "GitHub health keeps its existing error status for HTTP 401");
        assert.deepEqual(seen, service === "github" ? ["Bearer github-oauth-1"] : [`Bearer ${service}-oauth-1`, `Bearer ${service}-oauth-2`]);
        assert.equal(oauth.sent.filter(call => call.service === service && call.grant === "refresh_token").length, service === "github" ? 0 : 1);
        if (service === "github") {
          seen.length = 0;
          const refused = await provider.poll({ cursor: null }, connectorControl());
          assert.equal(refused.ok, false);
          if (!refused.ok) assert.equal(refused.failure, "needs_auth");
          assert.deepEqual(seen, ["Bearer github-oauth-1"]);
          assert.equal(oauth.sent.filter(call => call.service === service && call.grant === "refresh_token").length, 0);
        }
      });
    }
  });
});

test("RAC-2862 Gmail's 401 without refresh material is not retried, and a refused refresh dispatches no second business request", async t => {
  const oauth = oauthAccounts(t);
  await withIntegrationHome(async home => {
    const registry = await homeIntegrationRegistry(home.directory), account = await oauth.connect(home.directory, "gmail");
    const secrets = connectorProtocolSecrets(home.directory, account.connection_id), refresh = secrets.get("oauth")!;
    for (const failure of ["no-refresh", "refused-refresh"] as const) {
      if (failure === "no-refresh") secrets.delete("oauth");
      else { secrets.put("oauth", refresh); oauth.refuse(); }
      let dispatched = 0;
      await withFetch(async () => { dispatched += 1; return Response.json({}, { status: 401 }); }, async () => {
        const provider = (await registry.bind("gmail", "source", binding({ connection_id: account.connection_id }))).connector_driver;
        const result = await provider.health(connectorControl());
        assert.deepEqual([result.ok, result.status], [false, failure === "no-refresh" ? "needs_auth" : "error"]);
      });
      assert.equal(dispatched, 1, failure);
    }
    assert.equal(oauth.sent.filter(call => call.grant === "refresh_token").length, 1);
  });
});
