import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startApiOAuth, completeApiOAuth, resolveApiOAuthToken, apiOAuthContext } from "../apps/local-host/src/connector-api-oauth.ts";
import { API_OAUTH_PROVIDERS } from "../apps/local-host/src/connector-api-oauth-providers.ts";
import { connectorProtocolSecrets } from "../apps/local-host/src/connector-protocol-store.ts";
import { createOAuthBroker, type BrokerEnv } from "../apps/local-host/cloudflare/worker.ts";

// Independent wire contracts, transcribed from the official references in
// specs/archive/connector-experience/configuration-readiness.md; no production-derived expectations.
interface Contract {
  id: string; authorize: string; token: string; identity: string; profile: unknown;
  basic?: boolean; json?: boolean; pkce?: boolean; noRefresh?: boolean; refresh?: string;
  settings?: Record<string, string>; tokenExtra?: Record<string, unknown>; account: string;
  extraRequests?: Record<string, unknown>;
}
const contracts: Contract[] = [];
function row(id: string, authorize: string, token: string, identity: string, profile: unknown, account: string, options: Partial<Contract> = {}) {
  contracts.push({ id, authorize, token, identity, profile, account, ...options });
}
row("github", "https://github.com/login/oauth/authorize", "https://github.com/login/oauth/access_token", "https://api.github.com/user", { id: 12, login: "ada" }, "12", { pkce: true, noRefresh: true });
for (const id of ["gmail", "google-calendar", "google-drive"]) row(id, "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo", { sub: "google-user", email: "ada@example.test" }, "google-user", { pkce: true });
for (const id of ["outlook", "onedrive", "sharepoint", "teams"]) row(id, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", "https://login.microsoftonline.com/common/oauth2/v2.0/token", "https://graph.microsoft.com/v1.0/me", { id: "graph-user", userPrincipalName: "ada@example.test" }, ":graph-user", { pkce: true });
row("dropbox", "https://www.dropbox.com/oauth2/authorize", "https://api.dropboxapi.com/oauth2/token", "https://api.dropboxapi.com/2/users/get_current_account", { account_id: "dbid:user", email: "ada@example.test" }, ":dbid:user", { pkce: true });
row("box", "https://account.box.com/api/oauth2/authorize", "https://api.box.com/oauth2/token", "https://api.box.com/2.0/users/me", { id: "box-user", login: "ada@example.test" }, ":box-user");
row("notion", "https://api.notion.com/v1/oauth/authorize", "https://api.notion.com/v1/oauth/token", "https://api.notion.com/v1/users/me", { id: "bot-user", name: "Molis" }, "workspace:bot-user", { basic: true, json: true, tokenExtra: { workspace_id: "workspace" } });
row("slack", "https://slack.com/oauth/v2/authorize", "https://slack.com/api/oauth.v2.access", "https://slack.com/api/auth.test", { ok: true, user_id: "bot-user", team_id: "workspace", user: "molis" }, "workspace:bot-user");
row("discord", "https://discord.com/oauth2/authorize", "https://discord.com/api/oauth2/token", "https://discord.com/api/v10/users/@me", { id: "discord-user", username: "ada" }, ":discord-user", { basic: true, pkce: true });
for (const [id, domain, token, json] of [["feishu", "feishu.cn", "https://open.feishu.cn/open-apis/authen/v2/oauth/token", true], ["lark", "larksuite.com", "https://open.larksuite.com/open-apis/authen/v2/oauth/token", true]] as const) row(id, `https://accounts.${domain}/open-apis/authen/v1/authorize`, token, `https://open.${domain}/open-apis/authen/v1/user_info`, { code: 0, data: { open_id: "ou_user", name: "Ada" } }, ":ou_user", { pkce: true, json });
row("zoom", "https://zoom.us/oauth/authorize", "https://zoom.us/oauth/token", "https://api.zoom.us/v2/users/me", { id: "zoom-user", email: "ada@example.test" }, ":zoom-user", { basic: true });
row("gitlab", "https://gitlab.com/oauth/authorize", "https://gitlab.com/oauth/token", "https://gitlab.com/api/v4/user", { id: 19, username: "ada" }, ":19", { pkce: true });
row("bitbucket", "https://bitbucket.org/site/oauth2/authorize", "https://bitbucket.org/site/oauth2/access_token", "https://api.bitbucket.org/2.0/user", { uuid: "{bb-user}", display_name: "Ada" }, ":{bb-user}", { basic: true });
row("vercel", "https://vercel.com/integrations/molis/new", "https://api.vercel.com/v2/oauth/access_token", "https://api.vercel.com/v2/user?teamId=team", { user: { id: "vercel-user", username: "ada" } }, "team:vercel-user", { noRefresh: true, settings: { integration_slug: "molis" }, tokenExtra: { team_id: "team" } });
row("cloudflare", "https://dash.cloudflare.com/oauth2/auth", "https://dash.cloudflare.com/oauth2/token", "https://dash.cloudflare.com/oauth2/userinfo", { sub: "cf-user", email: "ada@example.test" }, ":cf-user", { pkce: true, basic: true, settings: { api_scopes: "zone.read", client_auth: "basic" } });
row("huggingface", "https://huggingface.co/oauth/authorize", "https://huggingface.co/oauth/token", "https://huggingface.co/oauth/userinfo", { sub: "hf-user", preferred_username: "ada" }, ":hf-user", { pkce: true, basic: true });
row("sentry", "https://sentry.io/oauth/authorize/", "https://sentry.io/oauth/token/", "https://sentry.io/api/0/organizations/", [{ id: "org", slug: "molis", name: "Molis" }], ":org:sentry-user", { pkce: true, tokenExtra: { user: { id: "sentry-user", name: "Ada", email: "private@example.test" } } });
row("supabase", "https://api.supabase.com/v1/oauth/authorize", "https://api.supabase.com/v1/oauth/token", "https://api.supabase.com/v1/profile", { gotrue_id: "sb-user", primary_email: "ada@example.test" }, ":sb-user:workspaces:org", { pkce: true, basic: true, extraRequests: { "https://api.supabase.com/v1/organizations": [{ id: "org" }] } });
row("linear", "https://linear.app/oauth/authorize", "https://api.linear.app/oauth/token", "https://api.linear.app/graphql", { data: { viewer: { id: "linear-user", name: "Ada" } } }, ":linear-user", { pkce: true });
const cloudId = "12345678-1234-1234-1234-123456789abc";
for (const [id, path, profile] of [["jira", "/rest/api/3/myself", { accountId: "atlassian-user", displayName: "Ada" }], ["confluence", "/wiki/rest/api/user/current", { accountId: "atlassian-user", displayName: "Ada" }]] as const) row(id, "https://auth.atlassian.com/authorize", "https://auth.atlassian.com/oauth/token", `https://api.atlassian.com/ex/${id}/${cloudId}${path}`, profile, `${cloudId}:atlassian-user`, { json: true, settings: { site_url: "https://molis.atlassian.net" }, extraRequests: { "https://api.atlassian.com/oauth/token/accessible-resources": [{ id: cloudId, url: "https://molis.atlassian.net" }] } });
row("asana", "https://app.asana.com/-/oauth_authorize", "https://app.asana.com/-/oauth_token", "https://app.asana.com/api/1.0/users/me", { data: { gid: "asana-user", name: "Ada" } }, ":asana-user", { pkce: true });
row("clickup", "https://app.clickup.com/api", "https://api.clickup.com/api/v2/oauth/token", "https://api.clickup.com/api/v2/user", { user: { id: 20, username: "ada" } }, ":20:workspaces:team", { json: true, noRefresh: true, extraRequests: { "https://api.clickup.com/api/v2/team": { teams: [{ id: "team" }] } } });
row("monday", "https://auth.monday.com/oauth2/authorize", "https://auth.monday.com/oauth_ms/oauth/token", "https://api.monday.com/v2", { data: { me: { id: "monday-user", name: "Ada", account: { id: "workspace" } } } }, "workspace:monday-user", { json: true, pkce: true });
row("airtable", "https://airtable.com/oauth2/v1/authorize", "https://airtable.com/oauth2/v1/token", "https://api.airtable.com/v0/meta/whoami", { id: "airtable-user", email: "ada@example.test" }, ":airtable-user", { basic: true, pkce: true });
row("figma", "https://www.figma.com/oauth", "https://api.figma.com/v1/oauth/token", "https://api.figma.com/v1/me", { id: "figma-user", handle: "ada" }, ":figma-user", { basic: true, pkce: true, refresh: "https://api.figma.com/v1/oauth/refresh" });
row("canva", "https://www.canva.com/api/oauth/authorize", "https://api.canva.com/rest/v1/oauth/token", "https://api.canva.com/rest/v1/users/me", { team_user: { user_id: "canva-user", team_id: "workspace" } }, "workspace:canva-user", { basic: true, pkce: true });
row("adobe", "https://ims-na1.adobelogin.com/ims/authorize/v2", "https://ims-na1.adobelogin.com/ims/token/v3", "https://ims-na1.adobelogin.com/ims/userinfo/v2?client_id=molis-test", { sub: "adobe-user", email: "ada@example.test" }, ":adobe-user");
row("salesforce", "https://login.salesforce.com/services/oauth2/authorize", "https://login.salesforce.com/services/oauth2/token", "https://molis.my.salesforce.com/services/oauth2/userinfo", { user_id: "sf-user", organization_id: "workspace", preferred_username: "ada" }, "workspace:sf-user", { pkce: true, tokenExtra: { instance_url: "https://molis.my.salesforce.com" } });
row("hubspot", "https://app.hubspot.com/oauth/authorize", "https://api.hubapi.com/oauth/2026-03/token", "https://api.hubapi.com/integrations/v1/me", { portalId: 2519445, timeZone: "America/New_York", currency: "USD" }, ":2519445");
row("intercom", "https://app.intercom.com/oauth", "https://api.intercom.io/auth/eagle/token", "https://api.intercom.io/me", { id: "intercom-user", email: "ada@example.test", app: { id_code: "workspace" } }, "workspace:intercom-user", { noRefresh: true });
row("stripe", "https://connect.stripe.com/oauth/authorize", "https://connect.stripe.com/oauth/token", "https://api.stripe.com/v1/account", { id: "acct_user", email: "ada@example.test" }, ":acct_user");
row("x", "https://x.com/i/oauth2/authorize", "https://api.x.com/2/oauth2/token", "https://api.x.com/2/users/me", { data: { id: "x-user", username: "ada" } }, ":x-user", { basic: true, pkce: true });
row("linkedin", "https://www.linkedin.com/oauth/v2/authorization", "https://www.linkedin.com/oauth/v2/accessToken", "https://api.linkedin.com/v2/userinfo", { sub: "li-user", name: "Ada" }, ":li-user", { noRefresh: true });

test("contract cases cover each implemented API OAuth provider", () => {
  assert.deepEqual(contracts.map(c => c.id).sort(), Object.keys(API_OAUTH_PROVIDERS).sort());
});
for (const mode of ["direct", "broker"] as const) for (const c of contracts) test(`${mode}: ${c.id} exchange → stable account → persisted token → refresh`, async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-contract-"));
  const origin = "http://127.0.0.1:19478";
  const base = "https://auth.molis.test";
  const redirect = mode === "broker" ? `${base}/callback` : `${origin}/api/settings/connectors/methods/oauth/callback`;
  const env: BrokerEnv = { PUBLIC_ORIGIN: base, ENVELOPE_KEY: randomBytes(32).toString("base64url"), OAUTH_APPS: JSON.stringify({ [c.id]: { clientId: "molis-test", clientSecret: "secret-test", settings: c.settings } }), AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  let exchanges = 0, refreshes = 0, identities = 0; let authorizationChallenge: string | null = null;
  const upstream = (async (input, init) => {
    const url = String(input), headers = new Headers(init?.headers);
    if (url === c.token || url === c.refresh) {
      assert.equal(init?.method, "POST");
      assert.equal(headers.get("content-type"), c.json ? "application/json" : "application/x-www-form-urlencoded");
      const body = c.json ? JSON.parse(String(init?.body)) : Object.fromEntries(new URLSearchParams(String(init?.body)));
      if (c.basic) { assert.equal(headers.get("authorization"), `Basic ${Buffer.from("molis-test:secret-test").toString("base64")}`); assert.equal(body.client_secret, undefined); }
      else { assert.equal(body.client_id, "molis-test"); assert.equal(body.client_secret, "secret-test"); }
      const refreshing = body.grant_type === "refresh_token";
      if (refreshing) { refreshes++; assert.equal(url, c.refresh || c.token); assert.equal(body.refresh_token, "refresh-original"); if (c.id === "gitlab") assert.equal(body.redirect_uri, redirect); }
      else { exchanges++; assert.equal(body.code, "provider-code"); if (c.id !== "clickup") { assert.equal(body.grant_type, "authorization_code"); assert.equal(body.redirect_uri, redirect); } else { assert.equal(body.grant_type, undefined); assert.equal(body.redirect_uri, undefined); } if (c.pkce) { assert.match(body.code_verifier, /^[A-Za-z0-9_-]{43,128}$/); assert.equal(createHash("sha256").update(body.code_verifier).digest("base64url"), authorizationChallenge); } }
      return Response.json({ access_token: refreshing ? "access-refreshed" : "access-original", ...(!c.noRefresh ? { refresh_token: refreshing ? "refresh-rotated" : "refresh-original", expires_in: 3600 } : {}), ...c.tokenExtra });
    }
    assert.equal(headers.get("authorization"), c.id === "monday" ? "access-original" : "Bearer access-original");
    if (c.extraRequests && Object.hasOwn(c.extraRequests, url)) return Response.json(c.extraRequests[url]);
    assert.equal(url, c.identity, "unexpected identity request"); identities++;
    return Response.json(c.profile);
  }) as typeof fetch;
  const broker = createOAuthBroker(upstream);
  const transport = (async (input, init) => {
    if (!String(input).startsWith(base)) return upstream(input, init);
    const response = await broker.fetch(new Request(String(input), init), env);
    if (String(input).endsWith("/token") && c.id === "sentry") assert.doesNotMatch(await response.clone().text(), /private@example.test|Ada/);
    return response;
  }) as typeof fetch;
  const keys = ["MOLIS_WORK_CONNECTOR_BROKER_ORIGIN", "MOLIS_WORK_CONNECTOR_BROKER_SERVICES"];
  const old = keys.map(k => process.env[k]);
  if (mode === "broker") { process.env[keys[0]!] = base; process.env[keys[1]!] = c.id; }
  try {
    const start = await startApiOAuth(home, { serviceId: c.id, displayName: "Work", origin, clientId: mode === "direct" ? "molis-test" : "", clientSecret: mode === "direct" ? "secret-test" : undefined, settings: c.settings }, transport);
    const authorize = new URL(start.authorization_url);
    authorizationChallenge = authorize.searchParams.get("code_challenge");
    if (c.id === "asana") assert.equal(authorize.searchParams.get("scope"), "users:read workspaces:read tasks:read");
    assert.equal(authorize.origin + authorize.pathname, c.authorize);
    assert.equal(authorize.searchParams.get("redirect_uri"), redirect);
    assert.equal(authorize.searchParams.get("code_challenge_method"), c.pkce ? "S256" : null);
    assert.doesNotMatch(start.authorization_url, /secret-test/);
    let state = authorize.searchParams.get("state")!, code = "provider-code";
    if (mode === "broker") {
      const response = await broker.fetch(new Request(`${base}/callback?state=${encodeURIComponent(state)}&code=${code}`), env);
      assert.equal(response.status, 302);
      const callback = new URL(response.headers.get("location")!); state = callback.searchParams.get("state")!; code = callback.searchParams.get("code")!;
      assert.doesNotMatch(callback.href, /access-original|refresh-original/);
    }
    const result = await completeApiOAuth(home, { origin, state, code }, transport);
    assert.ok(result.connection.account_label);
    assert.equal(apiOAuthContext(home, start.connection_id)?.account_id, c.account);
    assert.equal(await resolveApiOAuthToken(home, start.connection_id, false, transport), "access-original");
    assert.equal(exchanges, 1); assert.equal(identities, 1);
    const secrets = connectorProtocolSecrets(home, start.connection_id);
    if (mode === "broker") assert.doesNotMatch(secrets.get("client")!, /secret-test/);
    if (!c.noRefresh) {
      assert.equal(await resolveApiOAuthToken(home, start.connection_id, true, transport), "access-refreshed");
      assert.equal(refreshes, 1); assert.equal(secrets.get("access"), "access-refreshed");
      if (mode === "broker") assert.notEqual(secrets.get("oauth"), "refresh-rotated");
      else assert.equal(secrets.get("oauth"), "refresh-rotated");
    } else { assert.equal(secrets.get("oauth"), null); await assert.rejects(resolveApiOAuthToken(home, start.connection_id, true, transport), /重新授权/); }
  } finally {
    keys.forEach((k, i) => { if (old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; });
    rmSync(home, { recursive: true, force: true });
  }
});

test("Sentry reauthorization rejects a different user in the same organization and preserves the original token", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-sentry-")), origin = "http://127.0.0.1:19478";
  let user: string | undefined = "original";
  const transport = (async input => {
    if (String(input) === "https://sentry.io/oauth/token/") return Response.json({ access_token: `access-${user}`, ...(user ? { user: { id: user } } : {}) });
    assert.equal(String(input), "https://sentry.io/api/0/organizations/");
    return Response.json([{ id: "org", slug: "molis", name: "Molis" }]);
  }) as typeof fetch;
  const args = { serviceId: "sentry", displayName: "Work", clientId: "test-app", clientSecret: "test-secret", origin };
  const complete = (authorization: string) => completeApiOAuth(home, { origin, state: new URL(authorization).searchParams.get("state")!, code: "code" }, transport);
  try {
    const first = await startApiOAuth(home, args);
    await complete(first.authorization_url);
    user = "other";
    const second = await startApiOAuth(home, { ...args, connectionId: first.connection_id });
    await assert.rejects(complete(second.authorization_url), /原账号/);
    assert.equal(await resolveApiOAuthToken(home, first.connection_id), "access-original");
    assert.equal(apiOAuthContext(home, first.connection_id)?.account_id, ":org:original");
    user = undefined;
    const missing = await startApiOAuth(home, args);
    await assert.rejects(complete(missing.authorization_url), /Sentry 未返回/);
    assert.equal(connectorProtocolSecrets(home, missing.connection_id).get("access"), null);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

for (const serviceId of ["outlook", "dropbox", "gitlab", "airtable", "x", "cloudflare", "huggingface"]) test(`public PKCE client: ${serviceId} never requires or sends a client secret`, async () => {
  const c = contracts.find(row => row.id === serviceId)!;
  const home = mkdtempSync(join(tmpdir(), "molis-public-client-")), origin = "http://127.0.0.1:19478";
  try {
    const start = await startApiOAuth(home, { serviceId, displayName: "Public", clientId: "molis-public", origin, settings: serviceId === "cloudflare" ? { api_scopes: "zone.read", client_auth: "none" } : undefined });
    await completeApiOAuth(home, { origin, state: new URL(start.authorization_url).searchParams.get("state")!, code: "code" }, (async (input, init) => {
      if (String(input) === c.token) {
        assert.equal(new Headers(init?.headers).get("authorization"), null);
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get("client_id"), "molis-public"); assert.equal(body.has("client_secret"), false); assert.ok(body.get("code_verifier"));
        return Response.json({ access_token: "public-access" });
      }
      assert.equal(String(input), c.identity); return Response.json(c.profile);
    }) as typeof fetch);
    assert.equal(await resolveApiOAuthToken(home, start.connection_id), "public-access");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
