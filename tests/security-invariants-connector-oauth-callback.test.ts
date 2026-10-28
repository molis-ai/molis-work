import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";

import {
  completeApiOAuth,
  connectorAuthorizationStatus,
  connectorProtocolSecrets,
  connectorSetupAction,
  connectorSetupIntentAction,
  holdConnectorAuthorizationsForSession,
  homeIntegrationRegistry,
  retainConnectorSetupsForSession,
  startApiOAuth,
  withConnectorConnections,
  withConnectorProtocols,
  type ConnectorProtocolConfiguration,
  type OAuthOwners,
  type OAuthServiceOwner,
} from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createCatalogIntegrationPlugin } from "@molis-ai/molis-work-integration-catalog";
import { openTestHome } from "./fixtures/test-home.js";

// S-101 (docs/system/SECURITY-INVARIANTS.md), W5-11 slice 3 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md
// §3.3, §3.4): the generic OAuth callback, judged in order. The Host is checked before the store; once the record is taken by its state,
// every refusal ends it. Rules 1–7 refuse before any request; rules 8 and 9 refuse after the token request, and what it exchanged is
// neither staged nor committed. A refusal writes only the taken record, the authorization's status and the cleared stage: no connection,
// no credential, no protocol configuration. The owner of the service's method is injected, so a disabled, re-enabled, re-published or
// changed declaration is one assignment away.

const origin = "http://localhost:19358";
const CALLBACK = "/api/settings/connectors/methods/oauth/callback";
const bare = { kind: "oauth" } as const;
const flow = (extra: Record<string, unknown> = {}) => ({ kind: "oauth", grant: "authorization_code", authorize_url: "https://app.asana.com/-/oauth_authorize",
  token_url: "https://app.asana.com/-/oauth_token", scopes: [], identity: { url: "https://app.asana.com/api/1.0/users/me", account_id: [[], ["identity:/data/gid"]], label: ["identity:/data/name"] }, ...extra }) as OAuthServiceOwner["method"];

interface Sent { url: string; redirect: RequestRedirect | undefined }
function harness(method: OAuthServiceOwner["method"] = bare) {
  const directory = mkdtempSync(join(tmpdir(), "molis-oauth-callback-"));
  const declared = { owner: { plugin_id: "io.molis.work.integration.catalog", install_id: "install-1", publisher_id: "io.molis", method } as OAuthServiceOwner | undefined };
  const owners: OAuthOwners = async () => declared.owner;
  const sent: Sent[] = [];
  /** The token endpoint and the identity endpoint; `onToken` runs while the token request is out. */
  const transport = (account: string, onToken: () => void | Promise<void> = () => {}) => (async (url: unknown, init?: RequestInit) => {
    sent.push({ url: String(url), redirect: init?.redirect });
    if (String(url).includes("oauth_token")) {
      await onToken();
      return Response.json({ access_token: `access-${account}`, refresh_token: `refresh-${account}`, expires_in: 3600 });
    }
    return Response.json({ data: { gid: account, name: account, email: `${account}@example.test` } });
  }) as typeof fetch;
  const start = (extra: Record<string, string> = {}) =>
    startApiOAuth(directory, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "fixture-app-secret", origin, ...extra }, fetch, owners);
  const stateOf = (started: { authorization_url: string }) => new URL(started.authorization_url).searchParams.get("state")!;
  const stageOf = (state: string) => withConnectorProtocols(directory, store => store.read<ConnectorProtocolConfiguration & { sessionId: string }>(state, origin)).configuration.sessionId;
  const complete = (input: Parameters<typeof completeApiOAuth>[1], fetchImpl: typeof fetch = transport("work")) => completeApiOAuth(directory, input, fetchImpl, owners);
  /** §3.4's right-hand column: nothing of the connection exists, and the staged app secret is gone. */
  function untouched(connectionId: string, stage: string, expected = 0) {
    assert.equal(withConnectorConnections(directory, store => store.list()).length, expected, "no connection is written");
    if (!expected) assert.equal(withConnectorProtocols(directory, store => store.get(connectionId)), null, "no protocol configuration is written");
    if (!expected) for (const key of ["access", "oauth", "expires", "client"]) assert.equal(connectorProtocolSecrets(directory, connectionId).get(key), null, `no ${key} credential is written`);
    assert.equal(connectorProtocolSecrets(directory, stage).get("client"), null, "the staged app secret is cleared");
  }
  /** The record is gone: the same state from the right place is refused as used, with no request. */
  async function ended(state: string) {
    const before = sent.length;
    await assert.rejects(complete({ origin, state, code: "code" }), /不存在或已使用/u);
    assert.equal(sent.length, before);
  }
  return { directory, declared, sent, transport, start, stateOf, stageOf, complete, untouched, ended, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test("S-101 RAC-1083 a callback to a Host that is not local is refused before the store: the state is not consumed", async () => {
  const h = harness();
  try {
    const started = await h.start();
    const state = h.stateOf(started);
    for (const foreign of ["http://evil.example:19358", "http://127.0.0.2:19358", "https://localhost:19358", "http://localhost.evil.example:19358"]) {
      await assert.rejects(h.complete({ origin: foreign, state, code: "code" }), /本机/u, foreign);
    }
    assert.equal(h.sent.length, 0);
    assert.equal(connectorAuthorizationStatus(h.directory, started.authorization_id)?.status, "pending");
    assert.ok(h.stageOf(state), "the record is still there");
    const done = await h.complete({ origin, state, code: "code" });
    assert.equal(done.service_id, "asana", "the legitimate callback still completes");
  } finally { h.close(); }
});

test("S-101 RAC-1083 rule 1: a malformed or unknown state ends nothing and sends nothing; a replay cannot end the callback in flight", async () => {
  const h = harness();
  try {
    const started = await h.start();
    const state = h.stateOf(started);
    await assert.rejects(h.complete({ origin, state: "short", code: "code" }), /无效/u);
    await assert.rejects(h.complete({ origin, state: "A".repeat(43), code: "code" }), /不存在或已使用/u);
    assert.equal(h.sent.length, 0);
    assert.equal(connectorAuthorizationStatus(h.directory, started.authorization_id)?.status, "pending");
    let release!: () => void;
    let entered!: () => void;
    const out = new Promise<void>(resolve => { entered = resolve; });
    const first = h.complete({ origin, state, code: "code" }, h.transport("work", async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); }));
    await out;
    await assert.rejects(h.complete({ origin, state, code: "replayed" }), /不存在或已使用/u);
    assert.equal(h.sent.filter(entry => entry.url.includes("oauth_token")).length, 1, "the replay sends no token request");
    assert.equal(connectorAuthorizationStatus(h.directory, started.authorization_id)?.status, "pending", "the replay ends nothing");
    release();
    assert.equal((await first).service_id, "asana");
    assert.equal(connectorAuthorizationStatus(h.directory, started.authorization_id)?.status, "connected");
  } finally { h.close(); }
});

test("S-101 RAC-1083 rules 2 and 3: another local origin, or a path other than the registered callback, ends the record with no request", async () => {
  const h = harness();
  try {
    for (const wrong of [{ origin: "http://127.0.0.1:19358" }, { origin: "http://localhost:4207" }, { callback: `${origin}/api/settings/connectors/gmail/oauth/callback` }, { callback: `${origin}${CALLBACK}/` }]) {
      const started = await h.start();
      const state = h.stateOf(started), stage = h.stageOf(state);
      await assert.rejects(h.complete({ origin, state, code: "code", ...wrong }), /本机地址|返回地址/u, JSON.stringify(wrong));
      assert.equal(h.sent.length, 0, JSON.stringify(wrong));
      assert.equal(connectorAuthorizationStatus(h.directory, started.authorization_id)?.status, "failed");
      h.untouched(started.connection_id, stage);
      await h.ended(state);
    }
  } finally { h.close(); }
});

test("S-101 RAC-1083 rule 4: a callback with error consumes the state, and one without a code ends it, with no request", async () => {
  const h = harness();
  try {
    const denied = await h.start();
    const deniedState = h.stateOf(denied), deniedStage = h.stageOf(deniedState);
    await assert.rejects(h.complete({ origin, state: deniedState, code: "code", error: "access_denied" }), /拒绝/u);
    assert.equal(connectorAuthorizationStatus(h.directory, denied.authorization_id)?.status, "cancelled");
    h.untouched(denied.connection_id, deniedStage);
    await h.ended(deniedState);
    const empty = await h.start();
    const emptyState = h.stateOf(empty), emptyStage = h.stageOf(emptyState);
    await assert.rejects(h.complete({ origin, state: emptyState }), /授权码/u);
    assert.equal(connectorAuthorizationStatus(h.directory, empty.authorization_id)?.status, "failed");
    h.untouched(empty.connection_id, emptyStage);
    await h.ended(emptyState);
    assert.equal(h.sent.length, 0);
  } finally { h.close(); }
});

test("S-101 RAC-1083 rule 5: with an issuer declared, a missing or different iss is refused before the token request", async () => {
  const h = harness(flow({ issuer: "https://app.asana.com" }));
  try {
    for (const iss of [undefined, "https://evil.example", "https://app.asana.com/"]) {
      const started = await h.start();
      const state = h.stateOf(started), stage = h.stageOf(state);
      await assert.rejects(h.complete({ origin, state, code: "code", ...(iss ? { iss } : {}) }), /签发方/u, String(iss));
      assert.equal(h.sent.length, 0);
      h.untouched(started.connection_id, stage);
      await h.ended(state);
    }
    const named = await h.start();
    assert.equal((await h.complete({ origin, state: h.stateOf(named), code: "code", iss: "https://app.asana.com" })).service_id, "asana");
  } finally { h.close(); }
});

test("S-101 RAC-1083 rules 6 and 7: the declaring plugin disabled, re-enabled, re-published, or its method changed, refuses before any request", async () => {
  const h = harness();
  try {
    const owner = h.declared.owner!;
    const changes: Array<[string, OAuthServiceOwner | undefined, RegExp]> = [
      ["disabled", undefined, /停用或变更/u],
      // `install_id` comes from the plugin id and the publisher's signature: a package enabled again keeps it, so another one here is
      // another signature under the same names.
      ["enabled again as another install", { ...owner, install_id: "install-2" }, /停用或变更/u],
      ["another publisher", { ...owner, publisher_id: "io.example.lookalike" }, /停用或变更/u],
      ["another plugin", { ...owner, plugin_id: "io.example.lookalike" }, /停用或变更/u],
      ["the method changed", { ...owner, method: flow({ token_url: "https://collector.example/token" }) }, /授权方式/u],
    ];
    for (const [why, changed, message] of changes) {
      h.declared.owner = owner;
      const started = await h.start();
      const state = h.stateOf(started), stage = h.stageOf(state);
      h.declared.owner = changed;
      await assert.rejects(h.complete({ origin, state, code: "code" }), message, why);
      assert.equal(h.sent.length, 0, why);
      assert.equal(connectorAuthorizationStatus(h.directory, started.authorization_id)?.status, "failed", why);
      h.untouched(started.connection_id, stage);
      h.declared.owner = owner;
      await h.ended(state);
    }
    h.declared.owner = undefined;
    await assert.rejects(h.start(), /没有已启用的宿主插件/u, "no owner, no authorization");
    assert.equal(h.sent.length, 0);
  } finally { h.close(); }
});

test("S-101 RAC-1083 rules 6 and 7 are judged again when a callback leaves the connection's queue: one queued behind another sends nothing once its plugin changed", async () => {
  const h = harness();
  try {
    const owner = h.declared.owner!;
    const tokens = () => h.sent.filter(entry => entry.url.includes("oauth_token")).length;
    for (const [why, changed] of [["disabled", undefined], ["another install", { ...owner, install_id: "install-2" }], ["method changed", { ...owner, method: flow() }]] as const) {
      h.declared.owner = owner;
      const seed = await h.start();
      await h.complete({ origin, state: h.stateOf(seed), code: "code" });
      const revision = withConnectorConnections(h.directory, store => store.require(seed.connection_id)).updated_at;
      const protocol = JSON.stringify(withConnectorProtocols(h.directory, store => store.get(seed.connection_id)));
      const ahead = await h.start({ connectionId: seed.connection_id, clientId: "" }), queued = await h.start({ connectionId: seed.connection_id, clientId: "" });
      const queuedStage = h.stageOf(h.stateOf(queued));
      let release!: () => void;
      let entered!: () => void;
      const out = new Promise<void>(resolve => { entered = resolve; });
      const first = h.complete({ origin, state: h.stateOf(ahead), code: "code" }, h.transport("work", async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); }));
      await out;
      const second = h.complete({ origin, state: h.stateOf(queued), code: "code" }, h.transport("work"));
      // The queued callback has passed its first check and waits behind the one whose token request is out.
      await nextTurn();
      const sent = tokens();
      h.declared.owner = changed;
      release();
      await assert.rejects(first, /停用或变更|授权方式/u, why);
      await assert.rejects(second, /停用或变更|授权方式/u, why);
      assert.equal(tokens(), sent, `${why}: the queued callback sends no token request`);
      assert.equal(connectorAuthorizationStatus(h.directory, queued.authorization_id)?.status, "failed", why);
      assert.equal(connectorProtocolSecrets(h.directory, queuedStage).get("client"), null, `${why}: the queued stage is cleared`);
      assert.equal(withConnectorConnections(h.directory, store => store.require(seed.connection_id)).updated_at, revision, why);
      assert.equal(JSON.stringify(withConnectorProtocols(h.directory, store => store.get(seed.connection_id))), protocol, why);
      assert.equal(connectorProtocolSecrets(h.directory, seed.connection_id).get("access"), "access-work", `${why}: the committed access token stays`);
    }
  } finally { h.close(); }
});

test("S-101 RAC-1084 rule 9: a plugin disabled, re-enabled or changed while the token request was out commits nothing it exchanged", async () => {
  const h = harness();
  try {
    const owner = h.declared.owner!;
    for (const [why, changed] of [["disabled", undefined], ["enabled again", { ...owner, install_id: "install-2" }], ["method changed", { ...owner, method: flow() }]] as const) {
      h.declared.owner = owner;
      const started = await h.start();
      const state = h.stateOf(started), stage = h.stageOf(state);
      const before = h.sent.length;
      await assert.rejects(h.complete({ origin, state, code: "code" }, h.transport("late", () => { h.declared.owner = changed; })), /停用或变更|授权方式/u, why);
      assert.ok(h.sent.slice(before).some(entry => entry.url.includes("oauth_token")), `${why}: the token request was sent`);
      assert.equal(connectorAuthorizationStatus(h.directory, started.authorization_id)?.status, "failed", why);
      h.untouched(started.connection_id, stage);
    }
  } finally { h.close(); }
});

test("S-101 RAC-1084 rule 8: a reauthorization whose connection changed meanwhile, or that came back as another account, commits nothing", async () => {
  const h = harness();
  try {
    const first = await h.start();
    await h.complete({ origin, state: h.stateOf(first), code: "code" });
    const access = () => connectorProtocolSecrets(h.directory, first.connection_id).get("access");
    const protocol = () => JSON.stringify(withConnectorProtocols(h.directory, store => store.get(first.connection_id)));
    const stale = await h.start({ connectionId: first.connection_id, clientId: "" });
    const fresh = await h.start({ connectionId: first.connection_id, clientId: "" });
    await new Promise(resolve => setTimeout(resolve, 5));
    await h.complete({ origin, state: h.stateOf(fresh), code: "code" }, h.transport("work"));
    const [revision, kept, config] = [withConnectorConnections(h.directory, store => store.require(first.connection_id)).updated_at, access(), protocol()];
    const before = h.sent.length;
    await assert.rejects(h.complete({ origin, state: h.stateOf(stale), code: "code" }, h.transport("work")), /已变更/u);
    assert.ok(h.sent.slice(before).some(entry => entry.url.includes("oauth_token")), "the token request was sent");
    const other = await h.start({ connectionId: first.connection_id, clientId: "" });
    await assert.rejects(h.complete({ origin, state: h.stateOf(other), code: "code" }, h.transport("someone-else")), /原账号/u);
    assert.equal(withConnectorConnections(h.directory, store => store.require(first.connection_id)).updated_at, revision, "the connection is as it was");
    assert.equal(access(), kept, "the access token is the one committed before");
    assert.equal(protocol(), config, "the protocol configuration is as it was");
    assert.equal(withConnectorConnections(h.directory, store => store.list()).length, 1);
    assert.equal(connectorAuthorizationStatus(h.directory, stale.authorization_id)?.status, "failed");
    assert.equal(connectorAuthorizationStatus(h.directory, other.authorization_id)?.status, "failed");
  } finally { h.close(); }
});

test("S-101 RAC-1083 every request of the generic flow refuses to follow a redirect, and the saved configuration pins no declaration", async () => {
  const h = harness();
  try {
    const started = await h.start();
    await h.complete({ origin, state: h.stateOf(started), code: "code" });
    assert.ok(h.sent.length >= 2);
    for (const entry of h.sent) assert.equal(entry.redirect, "error", entry.url);
    const saved = Object.keys(withConnectorProtocols(h.directory, store => store.get(started.connection_id)) ?? {});
    assert.ok(saved.includes("clientId"));
    for (const key of ["plugin", "fingerprint", "issuer", "previousRevision"]) assert.equal(saved.includes(key), false, key);
  } finally { h.close(); }
});

// §3.3 step 5: a result held for the person's intent takes effect only after the last check. The plugin that declared the service when
// the authorization started is pinned in the private completion, and judged again when either entry retains it: the session's intent
// choice, or the person's own retain after the work stopped. Real routes, the Home's own registry and its stores.
const caller: ActionCallContext = { actor_id: "oauth-callback-user", runtime_session_id: "oauth-callback-session", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write"] };
const asanaFlow = { kind: "oauth", grant: "authorization_code", authorize_url: "https://app.asana.com/-/oauth_authorize", token_url: "https://app.asana.com/-/oauth_token",
  scopes: [], identity: { url: "https://app.asana.com/api/1.0/users/me", account_id: [[], ["identity:/data/gid"]], label: ["identity:/data/name"] } } as const;
const changes = ["disabled", "another plugin", "method changed"] as const;
/** An asana authorization, prepared by the session, started and called back through the real routes while the session is held. */
async function parkHeld(t: Parameters<typeof openTestHome>[0]) {
  const home = await openTestHome(t);
  const client = home.host.homeActionClient();
  const prepared = await client.invoke(caller, connectorSetupAction, { service_id: "asana", method: "oauth", display_name: "Held account", expected_revision: null }) as { authorization_id: string };
  const registry = await homeIntegrationRegistry(home.home);
  const owner = registry.oauthOwner("asana")!;
  let tokens = 0;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(home.origin)) return realFetch(input, init);
    if (url === "https://app.asana.com/-/oauth_token") { tokens += 1; return Response.json({ access_token: "fixture-held-access", refresh_token: "fixture-held-refresh", expires_in: 3600 }); }
    assert.equal(url, "https://app.asana.com/api/1.0/users/me", "no other request");
    return Response.json({ data: { gid: "held-account", name: "Held", email: "held@example.test" } });
  });
  const start = await home.web.post<{ authorization_url: string; connection_id: string }>("/api/settings/connectors/methods/oauth/start", {
    service_id: "asana", display_name: "Held account", client_id: "fixture-held-client", client_secret: "fixture-held-private", setup_id: prepared.authorization_id });
  const state = new URL(start.authorization_url).searchParams.get("state");
  holdConnectorAuthorizationsForSession(home.home, caller.runtime_session_id!, caller.actor_id, "latest");
  const parked = await home.web.post<{ awaiting_intent: boolean }>("/api/settings/connectors/methods/oauth/complete", {
    returned_url: `${home.origin}/api/settings/connectors/methods/oauth/callback?state=${state}&code=fixture-code` });
  assert.equal(parked.awaiting_intent, true);
  assert.equal(connectorAuthorizationStatus(home.home, prepared.authorization_id)?.completion_ready, true);
  return { home, client, prepared, registry, owner, start, tokenRequests: () => tokens };
}
for (const entry of ["intent choice", "session retain"] as const) for (const change of changes) {
  test(`S-101 RAC-1084 rules 6 and 7 are judged again before a held result takes effect: ${change}, then ${entry}, commits nothing`, { timeout: 30_000 }, async t => {
    const { home, client, prepared, registry, owner, start, tokenRequests } = await parkHeld(t);
    await registry.disable(owner.plugin_id);
    if (change !== "disabled") {
      const replacement = createCatalogIntegrationPlugin({ connectorId: "asana", providerFor: () => { throw new Error("the test reads no integration records"); } });
      const manifest = change === "another plugin" ? { ...replacement.manifest, plugin_id: "io.molis.work.integration.asana.lookalike" }
        // An upgrade: the same plugin and signature (so the same install) with another version that declares the flow as data.
        : { ...replacement.manifest, version: replacement.manifest.version.replace(/\d+$/u, patch => String(Number(patch) + 1)), connection_services: replacement.manifest.connection_services!.map(service => service.service_id !== "asana" ? service
          : { ...service, auth: { ...service.auth, methods: [...service.auth.methods.filter(method => method.kind !== "oauth"), asanaFlow] } }) };
      await registry.enable({ ...replacement, manifest });
      const now = registry.oauthOwner("asana")!;
      if (change === "another plugin") assert.notEqual(now.plugin_id, owner.plugin_id);
      else assert.deepEqual([now.plugin_id, now.install_id, now.publisher_id], [owner.plugin_id, owner.install_id, owner.publisher_id], "only the method differs");
    } else assert.equal(registry.oauthOwner("asana"), undefined);
    const retain = entry === "intent choice"
      ? client.invoke(caller, connectorSetupIntentAction, { authorization_id: prepared.authorization_id, intent_revision: "latest", decision: "retain" })
      : retainConnectorSetupsForSession(home.home, caller.runtime_session_id!, caller.actor_id, (...args) => home.host.connectorMcp!.remember(...args));
    await assert.rejects(retain, change === "method changed" ? /授权方式/u : /停用或变更/u);
    const after = connectorAuthorizationStatus(home.home, prepared.authorization_id)!;
    assert.equal(after.status, "failed");
    assert.equal(after.completion_ready, undefined, "the held completion is cleared");
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), [], "no connection is written");
    assert.equal(withConnectorProtocols(home.home, store => store.get(start.connection_id)), null, "no protocol configuration is written");
    for (const key of ["access", "oauth", "expires", "client"]) assert.equal(connectorProtocolSecrets(home.home, start.connection_id).get(key), null, `no ${key} credential is written`);
    assert.equal(tokenRequests(), 1, "only the callback's own token request");
  });
}

test("S-101 RAC-1084 rules 6 and 7 are judged again before a held result takes effect: unchanged, the retained connection's configuration pins no declaration", { timeout: 30_000 }, async t => {
  const { home, client, prepared, start, tokenRequests } = await parkHeld(t);
  const held = connectorAuthorizationStatus(home.home, prepared.authorization_id)!;
  assert.equal(withConnectorProtocols(home.home, store => store.get(held.connection_id)), null, "nothing is saved while the result is held");
  const kept = await client.invoke(caller, connectorSetupIntentAction, { authorization_id: prepared.authorization_id, intent_revision: "latest", decision: "retain" }) as { status: string };
  assert.equal(kept.status, "connected");
  const saved = withConnectorProtocols(home.home, store => store.get(start.connection_id)) as Record<string, unknown> | null;
  assert.ok(saved?.clientId);
  for (const key of ["plugin", "fingerprint", "issuer", "previousRevision", "declaration"]) assert.equal(key in saved!, false, `the saved configuration has no ${key}`);
  assert.equal(tokenRequests(), 1);
});
