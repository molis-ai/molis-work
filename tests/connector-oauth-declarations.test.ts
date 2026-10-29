import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { OAuthIdentityDeclaration, PluginOAuthMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import {
  oauthAccount,
  oauthAccountRequest,
  oauthAuthorizationUrl,
  oauthContextValue,
  oauthEndpoint,
  oauthEndpointFingerprint,
  oauthExpiry,
  oauthKept,
  oauthPinnedTenant,
  oauthSecretRequired,
  oauthTenantOrigin,
  oauthTokenRequest,
  publicOAuthFetch,
  resolveOAuthSettings,
} from "@molis-ai/molis-work-app-local-host";
import { catalogOAuthMethod, catalogWhoami } from "@molis-ai/molis-work-integration-catalog";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { oauthNetwork } from "./fixtures/oauth-network.js";

// W5-11 slice 1 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md): the `oauth` method a plugin declares as
// data, the SDK's shape check (any problem fails the whole Manifest) and the Host's one interpreter as pure functions. Nothing here sends
// a request. The identity data is §2.1.1's, and so are the accounts it must read: the catalog's own `readIdentity` on the same responses
// only corroborates them, and each place it is meant to differ says why.

const method = (extra: Partial<PluginOAuthMethodDeclaration> = {}): PluginOAuthMethodDeclaration => ({
  kind: "oauth", grant: "authorization_code", authorize_url: "https://auth.example.com/authorize", token_url: "https://auth.example.com/token",
  scopes: ["read"], identity: { url: "{service}/v1/me", account_id: [[], ["identity:/id"]], label: ["identity:/name"] }, ...extra,
});

function manifest(serviceId: string, oauth: unknown): PluginManifest {
  return {
    schema_version: 2, plugin_id: "io.molis.work.example.oauth-fixture", version: "1.0.0", name: "oauth-fixture", kind: "integration",
    publisher: { publisher_id: "io.example", signature: "example-signature-v1" }, host_api_version: 2,
    entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    connection_services: [{ service_id: serviceId, title: serviceId, group_id: "work", summary: "fixture", auth_kind: "token",
      auth: { methods: [oauth as PluginOAuthMethodDeclaration] }, capabilities: [{ label: "Feed", fulfillment: "live" }] }],
  } as PluginManifest;
}

const refused = (serviceId: string, oauth: unknown, message: RegExp) =>
  assert.throws(() => parsePluginManifest(manifest(serviceId, oauth)), { code: "plugin.declaration_invalid", message }, message.source);

test("RAC-1081 a well-formed oauth method passes, and a bare kind is a declaration error (slice 4: the platform's table is gone)", () => {
  assert.ok(parsePluginManifest(manifest("slack", method())));
  refused("slack", { kind: "oauth" }, /要把授权流程写成数据/);
  assert.ok(parsePluginManifest(manifest("salesforce", method({
    authorize_url: "{tenant}/services/oauth2/authorize", token_url: "{tenant}/services/oauth2/token",
    settings: [{ key: "login_origin", label: "登录地址", default: "https://login.salesforce.com", use: "tenant" }],
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant", required: true }],
    identity: { url: "{tenant}/services/oauth2/userinfo", account_id: [["identity:/organization_id"], ["identity:/sub", "identity:/user_id"]], label: ["identity:/name"] },
  }))));
  assert.ok(parsePluginManifest(manifest("outlook", method({
    authorize_url: "https://login.microsoftonline.com/{setting.tenant}/oauth2/v2.0/authorize",
    settings: [{ key: "tenant", label: "租户", default: "common", use: "path", pattern: "common|organizations|consumers|[0-9a-f-]{36}" }],
  }))));
  assert.ok(parsePluginManifest(manifest("cloudflare", method({ identity: { url: "https://dash.cloudflare.com/oauth2/userinfo", account_id: [[], ["identity:/id"]], label: ["identity:/email"] } }))));
});

test("RAC-1081 each declaration error fails the whole Manifest before anything is written", () => {
  refused("slack", method({ token_url: "http://auth.example.com/token" }), /token_url/u);
  refused("slack", method({ token_url: "https://user:pass@auth.example.com/token" }), /token_url/u);
  refused("slack", method({ token_url: "https://auth.example.com:8443/token" }), /token_url/u);
  refused("slack", method({ token_url: "https://203.0.113.9/token" }), /token_url/u);
  refused("slack", method({ token_url: "https://localhost/token" }), /token_url/u);
  refused("slack", method({ token_url: "https://auth.example.com/token?x=1" }), /token_url/u);
  refused("slack", method({ authorize_url: "https://{setting.host}.example.com/authorize", settings: [{ key: "host", label: "h", use: "path", pattern: "[a-z]+" }] }), /只能写在路径里/u);
  refused("slack", method({ token_url: "https://auth.example.com/{setting.missing}/token" }), /未知的占位/u);
  refused("slack", method({ parameters: { redirect_uri: "https://elsewhere.example.com" } }), /redirect_uri/u);
  refused("slack", method({ parameters: { state: "fixed" } }), /state/u);
  refused("slack", method({ quirks: { retry_forever: true } as never }), /quirks/u);
  refused("slack", method({ quirks: { omit_token_params: ["client_id"] as never } }), /omit_token_params/u);
  refused("slack", method({ pkce: "plain" as never }), /pkce/u);
  refused("slack", method({ grant: "implicit" as never }), /grant/u);
  refused("slack", { ...method(), origin_setting: "x" }, /不认这些字段/u);
  // The tenant is bounded by the platform's table: a service the table keeps on fixed origins cannot take one.
  refused("slack", method({ settings: [{ key: "login", label: "l", use: "tenant" }] }), /use: tenant/u);
  refused("slack", method({ keep: [{ key: "instance", pointer: "/instance_url", check: "tenant", required: true }] }), /check: tenant/u);
  // Where the access token may go is the table's: `{service}` for one origin, a full address only on one of them.
  refused("cloudflare", method({ identity: { url: "{service}/oauth2/userinfo", account_id: [[], ["identity:/id"]], label: ["identity:/email"] } }), /\{service\}/u);
  refused("slack", method({ identity: { url: "https://evil.example.com/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /来源/u);
  // Slice 4: a service's account origin takes a full address too (adobe's is `ims-na1.adobelogin.com`); another host of it does not.
  assert.ok(parsePluginManifest(manifest("adobe", method({ identity: { url: "https://ims-na1.adobelogin.com/ims/userinfo/v2", account_id: [[], ["identity:/sub"]], label: ["identity:/sub"] } }))));
  refused("adobe", method({ identity: { url: "https://ims-eu1.adobelogin.com/ims/userinfo/v2", account_id: [[], ["identity:/sub"]], label: ["identity:/sub"] } }), /来源/u);
  refused("slack", method({ context: [{ key: "teams", url: "https://evil.example.com/teams", pick: { kind: "ids", pointer: "/*/id" } }] }), /来源/u);
  refused("slack", method({ identity: { url: "{tenant}/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /\{tenant\}/u);
  refused("slack", method({ identity: { url: "{gateway}/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /\{gateway\}/u);
  // `{account}` (slice 4) only for a service with exactly one account origin: gmail's is Google's openidconnect, slack has none.
  assert.ok(parsePluginManifest(manifest("gmail", method({ identity: { url: "{account}/v1/userinfo", account_id: [["identity:/sub"]], label: ["identity:/email"] } }))));
  refused("slack", method({ identity: { url: "{account}/v1/userinfo", account_id: [["identity:/sub"]], label: ["identity:/email"] } }), /\{account\}/u);
  refused("slack", method({ identity: { url: "{service}/me", headers: { Authorization: "Bearer x" }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /Authorization/u);
  refused("slack", method({ identity: { url: "{service}/me", query: { team: "{setting.team}" }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /查询参数/u);
  refused("slack", method({ identity: { url: "{service}/me", account_id: [[], ["secret:/id" as never]], label: ["identity:/id"] } }), /来源/u);
  refused("notion", method({ identity: { account_id: [["identity:/id"]], label: ["context:workspace_name"] } }), /没写 url/u);
  // The token response reaches the account only through `keep`, as `context:`.
  refused("notion", method({ identity: { account_id: [["token:/workspace_id" as never]], label: ["context:workspace_name"] } }), /经 keep 进上下文/u);
  // Written down by the slice-2 review: `list` has one key, `body` and `label_prefix` are taken as written.
  refused("sentry", method({ identity: { url: "{service}/api/0/organizations/", list: { min_by: "/id", by_context: "org" } as never, account_id: [[], ["identity:/id"]], label: ["identity:/slug"] } }), /list/u);
  refused("linear", method({ identity: { url: "{service}/graphql", method: "POST", body: { query: "{context.team}" }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /body/u);
  refused("x", method({ identity: { url: "{service}/2/users/me", account_id: [[], ["identity:/data/id"]], label: ["identity:/data/name"], label_prefix: "{context.handle}" } }), /label_prefix/u);
  refused("slack", method({ context: [{ key: "teams", url: "{service}/teams", pick: { kind: "ids", pointer: "/*/id" }, when_missing: "fail" } as never] }), /不认这些字段/u);
  // Where `{tenant}` goes is worked out by the interpreter alone, so the declaration must give it one source, and only one kept value.
  refused("salesforce", method({ identity: { url: "{tenant}/services/oauth2/userinfo", account_id: [[], ["identity:/sub"]], label: ["identity:/name"] } }), /check: tenant/u);
  refused("salesforce", method({ keep: [{ key: "instance", pointer: "/instance_url", check: "tenant", required: true }],
    identity: { url: "{tenant}/services/oauth2/userinfo", account_id: [[], ["identity:/sub"]], label: ["identity:/name"], keep: [{ key: "site", pointer: "/urls/custom_domain", check: "tenant", required: true }] } }), /至多一项 check: tenant/u);
  // Where later requests go may not quietly fall back to the login origin: a kept tenant is required.
  refused("salesforce", method({ authorize_url: "{tenant}/services/oauth2/authorize", token_url: "{tenant}/services/oauth2/token",
    settings: [{ key: "login_origin", label: "登录地址", default: "https://login.salesforce.com", use: "tenant" }],
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant" }] }), /required: true/u);
  // A default is held to its setting's own rules.
  refused("outlook", method({ settings: [{ key: "tenant", label: "租户", default: "everyone", use: "path", pattern: "common|organizations" }] }), /default/u);
  refused("outlook", method({ settings: [{ key: "tenant", label: "租户", default: "../x", use: "path", pattern: ".+" }] }), /default/u);
  refused("cloudflare", method({ client_auth: { setting: "auth" }, settings: [{ key: "auth", label: "a", default: "jwt", use: "client_auth", enum: ["basic", "post"] }] }), /default/u);
  refused("salesforce", method({ settings: [{ key: "login", label: "l", default: "https://login.example.com", use: "tenant" }] }), /default/u);
  // The matched setting is read as an origin: only the tenant setting is one.
  refused("jira", method({ settings: [{ key: "site", label: "s", use: "path", pattern: ".+" }],
    context: [{ key: "cloud_id", url: "{gateway}/oauth/token/accessible-resources", pick: { kind: "match_setting", setting: "site", match: "/url", take: "/id", pattern: ".+" } }] }), /use: tenant/u);
  refused("slack", method({ identity: { url: "https://slack.com@evil.example/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /来源/u);
  refused("slack", method({ identity: { url: "https://slack.com{context.x}/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /来源/u);
  refused("slack", method({ identity: { url: "{service}/me", headers: { Cookie: "a=b" }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /Cookie/u);
  // One placeholder grammar: what a path refuses as a near-placeholder, a text taken as written refuses too.
  for (const near of ["{Context.team}", "{ context.team }", "{SETTING.x}"]) {
    refused("slack", method({ identity: { url: `{service}/teams/${near}`, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /未知的占位|占满一个路径段/u);
    refused("linear", method({ identity: { url: "{service}/graphql", method: "POST", body: { query: near }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /body/u);
  }
  refused("slack", method({ identity: { url: "{service}/me", query: { team: "{ context.team }" }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /查询参数/u);
  refused("slack", method({ identity: { url: "{service}/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] }, scopes: ["{setting.Scope}"] }), /scopes/u);
});

test("RAC-1081 a GraphQL body is a fixed JSON value: its braces are not placeholders", () => {
  for (const [serviceId, query] of [["linear", "{ viewer { id name email } }"], ["monday", "query { me { id name email account { id } } }"], ["linear", "{viewer{id}}"]] as const) {
    assert.ok(parsePluginManifest(manifest(serviceId, method({ identity: { url: "{service}/graphql", method: "POST", body: { query }, account_id: [[], ["identity:/data/id"]], label: ["identity:/data/id"] } }))), query);
  }
});

test("RAC-1081 endpoints are held to the endpoint rule, not to the request table's origins", () => {
  assert.ok(parsePluginManifest(manifest("gmail", method({
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth", token_url: "https://oauth2.googleapis.com/token",
    identity: { url: "{service}/gmail/v1/users/me/profile", account_id: [["identity:/emailAddress"]], label: ["identity:/emailAddress"] },
  }))));
});

const resolved = (serviceId: string, declaration: PluginOAuthMethodDeclaration, raw: Record<string, string> = {}) => resolveOAuthSettings(serviceId, declaration, raw);

test("RAC-1082 the tenant is checked against the table's domain after the template is filled in", () => {
  assert.equal(oauthTenantOrigin("salesforce", "https://acme.my.salesforce.com"), "https://acme.my.salesforce.com");
  for (const bad of ["http://acme.salesforce.com", "https://acme.salesforce.com:8443", "https://u:p@acme.salesforce.com", "https://acme.salesforce.com/path",
    "https://salesforce.com.evil.example", "https://evilsalesforce.com", "https://acme.salesforce.com?x=1"]) {
    assert.throws(() => oauthTenantOrigin("salesforce", bad), { code: "connector.oauth_declarations.target_refused" }, bad);
  }
  assert.throws(() => oauthTenantOrigin("slack", "https://slack.com"), { code: "connector.oauth_declarations.target_refused" });
  const salesforce = method({
    authorize_url: "{tenant}/services/oauth2/authorize", token_url: "{tenant}/services/oauth2/token",
    settings: [{ key: "login_origin", label: "登录地址", default: "https://login.salesforce.com", use: "tenant" }],
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant", required: true }],
  });
  assert.equal(oauthEndpoint(salesforce.token_url, resolved("salesforce", salesforce)), "https://login.salesforce.com/services/oauth2/token");
  assert.equal(oauthEndpoint(salesforce.token_url, resolved("salesforce", salesforce, { login_origin: "https://test.salesforce.com" })), "https://test.salesforce.com/services/oauth2/token");
  assert.throws(() => resolved("salesforce", salesforce, { login_origin: "https://login.example.com" }), { code: "connector.oauth_declarations.target_refused" });
  assert.deepEqual(oauthKept("salesforce", salesforce.keep, { instance_url: "https://acme.my.salesforce.com" }), { instance: "https://acme.my.salesforce.com" });
  assert.throws(() => oauthKept("salesforce", salesforce.keep, { instance_url: "https://acme.example.com" }), { code: "connector.oauth_declarations.target_refused" });
  // The fingerprint keeps the template: changing the login origin is not a change of owner.
  assert.equal(oauthEndpointFingerprint(salesforce), oauthEndpointFingerprint({ ...salesforce }));
  assert.notEqual(oauthEndpointFingerprint(salesforce), oauthEndpointFingerprint({ ...salesforce, token_url: "https://other.example.com/token" }));
});

test("RAC-1082 a path setting is one segment: no slash, dot-dot or encoded slash reaches an endpoint", () => {
  const vercel = method({
    authorize_url: "https://vercel.com/integrations/{setting.integration_slug}/new",
    settings: [{ key: "integration_slug", label: "Integration slug", required: true, use: "path", pattern: "[a-z0-9][a-z0-9-]{0,100}" }],
  });
  assert.equal(oauthEndpoint(vercel.authorize_url!, resolved("vercel", vercel, { integration_slug: "molis" })), "https://vercel.com/integrations/molis/new");
  for (const bad of ["../admin", "a/b", "a%2fb", "a%2Fb", "a\\b"]) assert.throws(() => resolved("vercel", vercel, { integration_slug: bad }), { code: "connector.oauth_declarations.setting_invalid" }, bad);
  assert.throws(() => resolved("vercel", vercel), { code: "connector.oauth_declarations.setting_invalid" }, "required");
  const loose = method({ token_url: "https://auth.example.com/{setting.slug}/token", settings: [{ key: "slug", label: "slug", use: "path", pattern: ".+" }] });
  for (const bad of ["..", "a/b", "%2e%2e"]) assert.throws(() => resolved("vercel", loose, { slug: bad }), { code: "connector.oauth_declarations.setting_invalid" }, bad);
});

test("RAC-1082 identity and context requests go only where the platform's table says, with the table's credential", () => {
  const scope = (serviceId: string, extra: object = {}) => ({ serviceId, method: method(), accessToken: "access-1", clientId: "client-1", context: {}, settings: { values: {} }, ...extra });
  const slack = oauthAccountRequest({ url: "{service}/api/auth.test" }, scope("slack"));
  assert.equal(slack.url, "https://slack.com/api/auth.test");
  assert.equal(slack.headers.authorization, "Bearer access-1");
  assert.equal(oauthAccountRequest({ url: "{service}/v2", method: "POST", body: { query: "{ me { id } }" } }, scope("monday")).headers.authorization, "access-1", "monday writes its OAuth token bare");
  assert.equal(oauthAccountRequest({ url: "https://dash.cloudflare.com/oauth2/userinfo" }, scope("cloudflare")).url, "https://dash.cloudflare.com/oauth2/userinfo");
  assert.throws(() => oauthAccountRequest({ url: "https://evil.example.com/me" }, scope("slack")), { code: "connector.oauth_declarations.target_refused" });
  // The account table (slice 4): Google's userinfo for gmail, as `{account}` or written out; never for a service it does not list.
  assert.equal(oauthAccountRequest({ url: "{account}/v1/userinfo" }, scope("gmail")).url, "https://openidconnect.googleapis.com/v1/userinfo");
  assert.equal(oauthAccountRequest({ url: "https://openidconnect.googleapis.com/v1/userinfo" }, scope("gmail")).url, "https://openidconnect.googleapis.com/v1/userinfo");
  assert.throws(() => oauthAccountRequest({ url: "https://openidconnect.googleapis.com/v1/userinfo" }, scope("slack")), { code: "connector.oauth_declarations.target_refused" });
  assert.throws(() => oauthAccountRequest({ url: "{account}/v1/userinfo" }, scope("slack")), { code: "connector.oauth_declarations.template_invalid" });
  assert.throws(() => oauthAccountRequest({ url: "https://open.feishu.cn/v1/userinfo" }, scope("gmail")), { code: "connector.oauth_declarations.target_refused" }, "another service's account origin");
  // A context value fills one segment; one carrying a slash never moves the request to another path.
  assert.equal(oauthAccountRequest({ url: "{gateway}/ex/jira/{context.cloud_id}/rest/api/3/myself" }, scope("jira", { context: { cloud_id: "0f6a3c1e-0000-4000-8000-000000000001" } })).url,
    "https://api.atlassian.com/ex/jira/0f6a3c1e-0000-4000-8000-000000000001/rest/api/3/myself");
  assert.throws(() => oauthAccountRequest({ url: "{gateway}/ex/jira/{context.cloud_id}/myself" }, scope("jira", { context: { cloud_id: "../../admin" } })), { code: "connector.oauth_declarations.template_invalid" });
  assert.throws(() => oauthAccountRequest({ url: "{gateway}/ex/jira/{context.cloud_id}/myself" }, scope("jira")), { code: "connector.oauth_declarations.template_invalid" }, "a missing context value");
  // What a declaration may not do, the interpreter refuses again on its own (§2.8): a userinfo part, a context value spelling a host, a platform header.
  assert.throws(() => oauthAccountRequest({ url: "https://slack.com@evil.example/me" }, scope("slack")), { code: "connector.oauth_declarations.target_refused" });
  assert.throws(() => oauthAccountRequest({ url: "https://slack.com{context.x}/me" }, scope("slack", { context: { x: ".evil.example" } })), { code: "connector.oauth_declarations.template_invalid" });
  assert.throws(() => oauthAccountRequest({ url: "{service}/me", headers: { Cookie: "a=b" } }, scope("slack")), { code: "connector.oauth_declarations.template_invalid" });
  assert.throws(() => oauthAccountRequest({ url: "{service}/me", headers: { "X-Figma-Token": "{context.x}" } }, scope("slack")), { code: "connector.oauth_declarations.template_invalid" });
  // Let through, not refused: the default port and an upper-case host name are the same origin, written the URL's way (a port other
  // than the default is refused, by the shape check and by the tenant rule).
  assert.equal(oauthAccountRequest({ url: "https://DASH.Cloudflare.com:443/oauth2/userinfo" }, scope("cloudflare")).url, "https://dash.cloudflare.com/oauth2/userinfo");
  const vercel = oauthAccountRequest({ url: "{service}/v2/user", query: { teamId: "{context.team_id}" } }, scope("vercel", { context: { team_id: "team_1" } }));
  assert.equal(vercel.url, "https://api.vercel.com/v2/user?teamId=team_1");
  assert.equal(oauthAccountRequest({ url: "{service}/v2/user", query: { teamId: "{context.team_id}" } }, scope("vercel")).url, "https://api.vercel.com/v2/user", "an empty query value is left out");
});

test("RAC-1082 the authorization address and token request: the platform writes the client, callback, state and PKCE", () => {
  const declaration = method({ pkce: "S256", parameters: { access_type: "offline" }, client_auth: "basic", token_format: "json", quirks: { omit_token_params: ["grant_type", "redirect_uri"] } });
  const settings = resolved("slack", declaration);
  const url = new URL(oauthAuthorizationUrl(declaration, settings, { clientId: "client-1", redirectUri: "http://127.0.0.1:4207/cb", state: "state-1", codeChallenge: "challenge-1" }));
  assert.equal(url.origin + url.pathname, "https://auth.example.com/authorize");
  assert.deepEqual(Object.fromEntries(url.searchParams), { access_type: "offline", client_id: "client-1", redirect_uri: "http://127.0.0.1:4207/cb", response_type: "code",
    state: "state-1", scope: "read", code_challenge: "challenge-1", code_challenge_method: "S256" });
  const exchange = oauthTokenRequest(declaration, settings, { clientId: "client-1", clientSecret: "secret-1", redirectUri: "http://127.0.0.1:4207/cb", code: "code-1", verifier: "verifier-1" });
  assert.equal(exchange.headers.authorization, `Basic ${Buffer.from("client-1:secret-1").toString("base64")}`);
  assert.deepEqual(JSON.parse(exchange.body!), { code: "code-1", code_verifier: "verifier-1" }, "the omitted parameters are gone, the client is in the header");
  const refresh = oauthTokenRequest(method({ refresh_url: "https://auth.example.com/refresh", quirks: { refresh_redirect_uri: true } }), settings,
    { clientId: "client-1", clientSecret: "", redirectUri: "https://cb.example.com/cb", refreshToken: "refresh-1" });
  assert.equal(refresh.url, "https://auth.example.com/refresh");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(refresh.body)), { grant_type: "refresh_token", refresh_token: "refresh-1", redirect_uri: "https://cb.example.com/cb", client_id: "client-1" });
  const cloudflare = method({ client_auth: { setting: "client_auth" }, client_secret: "required",
    settings: [{ key: "client_auth", label: "Client 认证方式", default: "basic", use: "client_auth", enum: ["basic", "post", "none"] }] });
  assert.equal(oauthSecretRequired(cloudflare, resolved("cloudflare", cloudflare)), true);
  assert.equal(oauthSecretRequired(cloudflare, resolved("cloudflare", cloudflare, { client_auth: "none" })), false);
  assert.throws(() => resolved("cloudflare", cloudflare, { client_auth: "jwt" }), { code: "connector.oauth_declarations.setting_invalid" });
  const exp = Math.floor(Date.UTC(2030, 0, 1) / 1000);
  const jwt = `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
  assert.equal(oauthExpiry(method({ quirks: { expiry: "jwt_exp" } }), { access_token: jwt }, 0), exp * 1000);
  assert.equal(oauthExpiry(method(), { access_token: jwt }, 0), null);
  assert.equal(oauthExpiry(method(), { expires_in: 60 }, 1000), 61_000);
});

test("RAC-1082 the interpreter pins the tenant itself: the kept instance, never quietly the login origin once it is missing", () => {
  const salesforce = method({
    authorize_url: "{tenant}/services/oauth2/authorize", token_url: "{tenant}/services/oauth2/token",
    settings: [{ key: "login_origin", label: "登录地址", default: "https://login.salesforce.com", use: "tenant" }],
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant", required: true }],
    identity: { url: "{tenant}/services/oauth2/userinfo", account_id: [["identity:/organization_id"], ["identity:/sub", "identity:/user_id"]], label: ["identity:/name"] },
  });
  const settings = resolved("salesforce", salesforce);
  const scope = (context: Record<string, string>) => ({ serviceId: "salesforce", method: salesforce, accessToken: "access-1", clientId: "client-1", context, settings });
  const userinfo = { url: salesforce.identity.url! };
  const kept = oauthKept("salesforce", salesforce.keep, { instance_url: "https://acme.my.salesforce.com" });
  assert.equal(oauthAccountRequest(userinfo, scope(kept)).url, "https://acme.my.salesforce.com/services/oauth2/userinfo", "the instance, not the login origin");
  // A token response without the instance fails the authorization; a connection that lost it is refused, not sent to the login origin.
  assert.throws(() => oauthKept("salesforce", salesforce.keep, { access_token: "access-1" }), { code: "connector.oauth_declarations.account_missing" });
  assert.throws(() => oauthPinnedTenant(scope({})), { code: "connector.oauth_declarations.target_refused" });
  assert.throws(() => oauthAccountRequest(userinfo, scope({})), { code: "connector.oauth_declarations.target_refused" });
  // A tenant kept from the identity response is not there yet for the identity request itself, which goes to the login setting.
  const fromIdentity = method({ settings: salesforce.settings, identity: { ...salesforce.identity, keep: [{ key: "instance", pointer: "/urls/custom_domain", check: "tenant", required: true }] } });
  assert.equal(oauthPinnedTenant({ ...scope({}), method: fromIdentity }), "https://login.salesforce.com");
  // A kept value is checked against the table again when it is used, not trusted for having been kept.
  assert.throws(() => oauthAccountRequest(userinfo, scope({ instance: "https://evil.example.com" })), { code: "connector.oauth_declarations.target_refused" });
  assert.throws(() => oauthAccountRequest({ url: "{tenant}/me" }, { ...scope({}), method: method(), settings: { values: {} } }), { code: "connector.oauth_declarations.template_invalid" }, "no tenant at all");
});

// §2.1.1 written as data, each with the account §2.1.1 says it reads (RAC-1080; the identity and keep are the catalog's shipped
// declarations, checked below, and `tests/connector-provider-contracts.test.ts` runs all 37 through an authorization). The catalog's own
// `readIdentity` on the same response corroborates it; where §2.1.1 means to differ from today, `intended` says why, and the catalog
// must then really read something else.
interface IdentityFixture {
  readonly identity: OAuthIdentityDeclaration;
  readonly keep?: PluginOAuthMethodDeclaration["keep"];
  readonly response: unknown;
  /** The token response: what the method's `keep` keeps from it joins the context, as an authorization does. */
  readonly token?: object;
  readonly context?: Record<string, string>;
  readonly expected: { readonly account_id: string; readonly label: string };
  readonly intended?: string;
}

const identities: Record<string, IdentityFixture> = {
  slack: { identity: { url: "{service}/api/auth.test", account_id: [["identity:/team_id"], ["identity:/user_id"]], label: ["identity:/user", "identity:/team"] },
    response: { ok: true, team_id: "T1", user_id: "U1", user: "ada", team: "Acme" }, expected: { account_id: "T1:U1", label: "ada" } },
  monday: { identity: { url: "{service}/v2", method: "POST", body: { query: "{ me { id name email account { id } } }" }, headers: { "API-Version": "2024-10" },
    account_id: [["identity:/data/me/account/id"], ["identity:/data/me/id"]], label: ["identity:/data/me/name", "identity:/data/me/email"] },
  response: { data: { me: { id: 42, name: "Ada", email: "ada@example.com", account: { id: 7 } } } }, expected: { account_id: "7:42", label: "Ada" } },
  canva: { identity: { url: "{service}/rest/v1/users/me", account_id: [["identity:/team_user/team_id"], ["identity:/team_user/user_id"]],
    label: ["identity:/team_user/user_id", "identity:/user/display_name", "identity:/profile/display_name"] },
  response: { team_user: { team_id: "TC", user_id: "UC" } }, expected: { account_id: "TC:UC", label: "UC" } },
  intercom: { identity: { url: "{service}/me", headers: { "Intercom-Version": "2.13" }, account_id: [["identity:/app/id_code"], ["identity:/id"]], label: ["identity:/email", "identity:/name"] },
    response: { id: "99", email: "ada@example.com", app: { id_code: "app1" } }, expected: { account_id: "app1:99", label: "ada@example.com" } },
  linear: { identity: { url: "{service}/graphql", method: "POST", body: { query: "{ viewer { id name email } }" }, account_id: [[], ["identity:/data/viewer/id"]],
    label: ["identity:/data/viewer/name", "identity:/data/viewer/email"] }, response: { data: { viewer: { id: "lin-1", name: "Ada" } } }, expected: { account_id: ":lin-1", label: "Ada" } },
  cloudflare: { identity: { url: "https://dash.cloudflare.com/oauth2/userinfo", account_id: [[], ["identity:/id", "identity:/sub"]], label: ["identity:/email", "identity:/sub"] },
    response: { sub: "cf-sub", email: "ada@example.com" }, expected: { account_id: ":cf-sub", label: "ada@example.com" } },
  salesforce: { identity: { url: "{tenant}/services/oauth2/userinfo", account_id: [["identity:/organization_id"], ["identity:/sub", "identity:/user_id"]], label: ["identity:/preferred_username", "identity:/name"] },
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant", required: true }],
    response: { organization_id: "00D1", sub: "https://login.salesforce.com/id/00D1/005A", user_id: "005A", preferred_username: "ada@acme" }, context: { instance: "https://acme.my.salesforce.com" },
    expected: { account_id: "00D1:https://login.salesforce.com/id/00D1/005A", label: "ada@acme" } },
  sentry: { identity: { url: "{service}/api/0/organizations/", list: { min_by: "/id" }, account_id: [[], ["identity:/id"], ["context:oauth_user_id"]], label: ["identity:/name", "identity:/slug"],
    keep: [{ key: "org", pointer: "/slug" }] }, keep: [{ key: "oauth_user_id", pointer: "/user/id", required: true }],
  response: [{ id: "9", slug: "beta", name: "Beta" }, { id: "10", slug: "alpha", name: "Alpha" }], token: { user: { id: "u-7" } },
  expected: { account_id: ":10:u-7", label: "Alpha" },
  intended: "C 头授权时 apiOAuthIdentity 同样得 :org:user（enrichContext 存的 oauth_user_id）；只有 readIdentity（检查、读账号）不接这一段，第 4 片三处一致" },
  supabase: { identity: { url: "{service}/v1/profile", account_id: [[], ["identity:/id", "identity:/gotrue_id"], ["literal:workspaces"], ["context:authorized_workspaces"]],
    label: ["identity:/primary_email", "identity:/username", "identity:/gotrue_id"] }, response: { gotrue_id: "g-1", primary_email: "ada@example.com" },
  context: { authorized_workspaces: "o1,o2" }, expected: { account_id: ":g-1:workspaces:o1,o2", label: "ada@example.com" },
  intended: "readIdentity 不接已授权工作区；今天这段由 apiOAuthIdentity 另接，声明里是 account_id 的后两段" },
  clickup: { identity: { url: "{service}/api/v2/user", account_id: [[], ["identity:/user/id"], ["literal:workspaces"], ["context:authorized_workspaces"]],
    label: ["identity:/user/username", "identity:/user/email"] }, response: { user: { id: 123, username: "ada", email: "ada@example.com" } },
  context: { authorized_workspaces: "10,9" }, expected: { account_id: ":123:workspaces:10,9", label: "ada" },
  intended: "readIdentity 不接已授权工作区；今天这段由 apiOAuthIdentity 另接，声明里是 account_id 的后两段" },
  x: { identity: { url: "{service}/2/users/me", account_id: [[], ["identity:/data/id"]], label: ["identity:/data/username", "identity:/data/name"], label_prefix: "@",
    keep: [{ key: "user_id", pointer: "/data/id" }] }, response: { data: { id: "x-1", username: "ada", name: "Ada" } }, expected: { account_id: ":x-1", label: "@ada" } },
  notion: { identity: { url: "{service}/v1/users/me", headers: { "Notion-Version": "2022-06-28" }, account_id: [["context:workspace_id"]],
    label: ["context:workspace_name", "identity:/bot/workspace_name"] },
    keep: [{ key: "workspace_id", pointer: "/workspace_id", required: true }, { key: "workspace_name", pointer: "/workspace_name" }], token: { workspace_id: "w-1", workspace_name: "Acme" },
    response: { object: "user", id: "bot-1", type: "bot", name: "Molis", bot: { workspace_name: "Acme" } },
    expected: { account_id: "w-1", label: "Acme" }, intended: "§2.4：account_id 是令牌响应的 workspace，不再接 bot id（今天是 workspace:bot-id）" },
};

/** The catalog's reading of the same response, the way today's flow calls it. */
async function catalogReading(serviceId: string, fixture: IdentityFixture) {
  let seen = "";
  const fetchImpl = async (url: string | URL | Request) => {
    seen = String(url);
    return new Response(JSON.stringify(fixture.response), { status: 200, headers: { "content-type": "application/json" } });
  };
  const context = { ...fixture.context, ...(fixture.token ? oauthKept(serviceId, fixture.keep, fixture.token) : {}) };
  const reading = await catalogWhoami({ connectorId: serviceId, token: "access-1", authExtras: { auth_method: "oauth", ...context }, fetchImpl: fetchImpl as typeof fetch });
  return { reading, seen };
}

for (const [serviceId, fixture] of Object.entries(identities)) {
  test(`RAC-1080 ${serviceId}: the declared identity reads the account §2.1.1 writes down`, async () => {
    const context = { ...fixture.context, ...(fixture.token ? oauthKept(serviceId, fixture.keep, fixture.token) : {}) };
    const after = oauthAccount(serviceId, fixture.identity, { identity: fixture.identity.url ? fixture.response : undefined, context });
    assert.deepEqual({ account_id: after.account_id, label: after.label }, fixture.expected);
    const { reading, seen } = await catalogReading(serviceId, fixture);
    assert.ok(reading.ok, JSON.stringify(reading));
    if (fixture.identity.url) {
      const scope = { serviceId, method: method({ identity: fixture.identity, ...(fixture.keep ? { keep: fixture.keep } : {}) }), accessToken: "access-1", clientId: "client-1", context, settings: { values: {} } };
      const request = new URL(oauthAccountRequest({ ...fixture.identity, url: fixture.identity.url }, scope).url);
      assert.equal(request.origin + request.pathname, new URL(seen).origin + new URL(seen).pathname, "the same address as today");
    }
    const today = { account_id: reading.account_id, label: reading.login };
    if (fixture.intended) assert.notDeepEqual(today, fixture.expected, `marked as an intended difference, so today must differ: ${fixture.intended}`);
    else assert.deepEqual(today, fixture.expected);
  });
}

test("RAC-1080 the fixtures read with the identity and keep the catalog ships for each service", () => {
  for (const [serviceId, fixture] of Object.entries(identities)) {
    const shipped = catalogOAuthMethod(serviceId)!;
    assert.deepEqual(fixture.identity, shipped.identity, serviceId);
    assert.deepEqual(fixture.keep ?? [], shipped.keep ?? [], serviceId);
  }
});

test("RAC-1080 the intended tightenings: x with no name, clickup and supabase with no id, and no authorized workspace fail", async () => {
  const x = identities.x!;
  const nameless = { ...x, response: { data: { id: "x-1" } } };
  assert.throws(() => oauthAccount("x", x.identity, { identity: nameless.response, context: {} }), { code: "connector.oauth_declarations.account_missing" });
  assert.equal((await catalogReading("x", nameless)).reading.login, "X", "today shows the fallback X");
  for (const serviceId of ["clickup", "supabase"]) {
    const fixture = identities[serviceId]!;
    const idless = { ...fixture, response: { user: { username: "ada" }, primary_email: "ada@example.com" } };
    assert.throws(() => oauthAccount(serviceId, fixture.identity, { identity: idless.response, context: fixture.context ?? {} }), { code: "connector.oauth_declarations.account_missing" }, serviceId);
    const today = (await catalogReading(serviceId, idless)).reading;
    assert.ok(today.ok && !today.account_id, `${serviceId}: today reads no account id and does not fail`);
  }
  // An account with no workspace or organization yet has nothing to authorize; the message says what to do next.
  for (const [pointer, empty] of [["/*/id", []], ["/teams/*/id", { teams: [] }]] as const) {
    assert.throws(() => oauthContextValue({ kind: "ids", pointer }, empty, { values: {} }), { code: "connector.oauth_declarations.context_missing", message: /先建一个或加入一个/u }, pointer);
  }
});

test("RAC-1080 the account fails when a segment other than the prefix is empty, and the label when nothing is found", () => {
  const identity: OAuthIdentityDeclaration = { url: "{service}/me", account_id: [["identity:/team"], ["identity:/id"]], label: ["identity:/name"] };
  assert.equal(oauthAccount("slack", identity, { identity: { id: 1, name: "a" }, context: {} }).account_id, ":1", "an empty prefix");
  assert.throws(() => oauthAccount("slack", identity, { identity: { team: "t", name: "a" }, context: {} }), { code: "connector.oauth_declarations.account_missing" });
  assert.throws(() => oauthAccount("slack", identity, { identity: { id: 1 }, context: {} }), { code: "connector.oauth_declarations.account_missing" });
  const x: OAuthIdentityDeclaration = { url: "{service}/2/users/me", account_id: [[], ["identity:/data/id"]], label: ["identity:/data/username", "identity:/data/name"], label_prefix: "@" };
  // The prefix is put before the label as written: a response already off (no username, a name starting with @) shows @@, RAC-1080's intended difference.
  assert.equal(oauthAccount("x", x, { identity: { data: { id: "1", name: "@ada" } }, context: {} }).label, "@@ada");
  const sentry: OAuthIdentityDeclaration = { url: "{service}/api/0/organizations/", list: { min_by: "/id" }, account_id: [[], ["identity:/id"]], label: ["identity:/slug"] };
  const orgs = [{ id: "9", slug: "beta" }, { id: "10", slug: "alpha" }];
  assert.equal(oauthAccount("sentry", sentry, { identity: orgs, context: { org: "beta" } }).label, "alpha", "the context's org picks nothing");
  // By code point, the same on every machine: "B" (U+0042) comes before "a" (U+0061), whatever the locale's collation says.
  assert.equal(oauthAccount("sentry", sentry, { identity: [{ id: "a", slug: "lower" }, { id: "B", slug: "upper" }], context: {} }).label, "upper");
  const notion: OAuthIdentityDeclaration = { account_id: [["context:workspace_id"]], label: ["context:workspace_name"] };
  assert.deepEqual(oauthAccount("notion", notion, { context: { workspace_id: "w-1", workspace_name: "Acme" } }), { account_id: "w-1", label: "Acme", kept: {} });
});

test("RAC-1082 context picks: the ids of a list in code-point order, and the id of the entry on the tenant setting's origin", () => {
  assert.equal(oauthContextValue({ kind: "ids", pointer: "/teams/*/id" }, { teams: [{ id: 3 }, { id: "1" }] }, { values: {} }), "1,3");
  assert.equal(oauthContextValue({ kind: "ids", pointer: "/*/id" }, [{ id: "b" }, { id: "a" }, { id: "B" }], { values: {} }), "B,a,b");
  // `~1` and `~0` are read the same way as everywhere else a pointer is read.
  assert.equal(oauthContextValue({ kind: "ids", pointer: "/a~1b/*/c~0d" }, { "a/b": [{ "c~d": "x" }] }, { values: {} }), "x");
  assert.throws(() => oauthContextValue({ kind: "ids", pointer: "/teams/*/id" }, { teams: "none" }, { values: {} }), { code: "connector.oauth_declarations.context_missing" });
  const pick = { kind: "match_setting", setting: "site_url", match: "/url", take: "/id", pattern: "[0-9a-f-]{36}" } as const;
  const resources = [{ url: "https://other.atlassian.net", id: "00000000-0000-4000-8000-000000000000" }, { url: "https://acme.atlassian.net/", id: "0f6a3c1e-0000-4000-8000-000000000001" }];
  assert.equal(oauthContextValue(pick, resources, { values: { site_url: "https://acme.atlassian.net" }, tenant: "https://acme.atlassian.net" }), "0f6a3c1e-0000-4000-8000-000000000001");
  assert.throws(() => oauthContextValue(pick, resources, { values: { site_url: "https://missing.atlassian.net" }, tenant: "https://missing.atlassian.net" }), { code: "connector.oauth_declarations.context_missing" });
  assert.throws(() => oauthContextValue(pick, [{ url: "https://acme.atlassian.net", id: "../x" }], { values: { site_url: "https://acme.atlassian.net" }, tenant: "https://acme.atlassian.net" }), { code: "connector.oauth_declarations.context_missing" });
});

// W5-11 slice 4 (RAC-1082, Codex pre-review P3): the flow's requests leave by `sendPublicHttps`, so the call's checks run again once the
// name resolves, right before a connection opens. A call that stops being current while the name is resolving opens none.
test("RAC-1082 the OAuth sender rechecks the call after the name resolves: one that stopped being current meanwhile opens no connection", async t => {
  const sent = oauthNetwork(t, () => Response.json({ access_token: "fixture-late" }));
  let current = true, resolveName!: () => void;
  const named = new Promise<void>(done => { resolveName = done; });
  const held = publicOAuthFetch({ current: () => { if (!current) throw new Error("the authorization is no longer pending"); } }, {
    lookup: (_hostname, callback) => { void named.then(() => callback(null, [{ address: "1.1.1.1", family: 4 }])); },
  });
  const refused = assert.rejects(held("https://auth.example.com/token", { method: "POST", body: "grant_type=authorization_code" }), /no longer pending/u);
  current = false; resolveName(); await refused;
  assert.deepEqual(sent, [], "no connection was opened");
  const answer = await publicOAuthFetch({ current: () => {} })("https://auth.example.com/token", { method: "POST", body: "grant_type=authorization_code" });
  assert.deepEqual(await answer.json(), { access_token: "fixture-late" });
  assert.deepEqual(sent, ["https://auth.example.com/token"], "a current call is sent");
});

// RAC-1080 / RAC-1082 (slice 4): the Host has no OAuth table of its own, only the interpreter reads the account origins, and the flow,
// its sender and the interpreter take the declaration from the registry, never from a plugin's implementation.
test("RAC-1080 RAC-1082 the Host's source has no OAuth table, only the interpreter reads the account origins, and the flow imports no plugin", () => {
  const root = new URL("../apps/local-host/src/", import.meta.url);
  const read = (name: string) => readFileSync(new URL(name, root), "utf8");
  const files = (readdirSync(root, { recursive: true }) as string[]).filter(name => name.endsWith(".ts"));
  assert.ok(files.includes("connector-api-oauth.ts"));
  for (const name of files) {
    const text = read(name);
    assert.doesNotMatch(text, /API_OAUTH_PROVIDERS|cloudflare\/providers/u, name);
    if (name !== "connector-oauth-declarations.ts") assert.doesNotMatch(text, /CONNECTOR_ACCOUNT_ORIGINS/u, name);
  }
  for (const name of ["connector-api-oauth.ts", "connector-oauth-declarations.ts", "connector-oauth-send.ts"]) {
    assert.doesNotMatch(read(name), /catalogWhoami|["']@molis-ai\/molis-work-integration-|["']@molis-ai\/molis-work-plugin-(?!sdk["'/])/u, name);
  }
});
