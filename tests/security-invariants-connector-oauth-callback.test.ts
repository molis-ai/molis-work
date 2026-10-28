import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  completeApiOAuth,
  connectorAuthorizationStatus,
  connectorProtocolSecrets,
  startApiOAuth,
  withConnectorConnections,
  withConnectorProtocols,
  type ConnectorProtocolConfiguration,
  type OAuthOwners,
  type OAuthServiceOwner,
} from "@molis-ai/molis-work-app-local-host";

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
