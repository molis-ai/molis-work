import assert from "node:assert/strict";
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
  oauthSecretRequired,
  oauthTenantOrigin,
  oauthTokenRequest,
  resolveOAuthSettings,
} from "@molis-ai/molis-work-app-local-host";
import { catalogWhoami } from "@molis-ai/molis-work-integration-catalog";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";

// W5-11 slice 1 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md): the `oauth` method a plugin declares as
// data, the SDK's shape check (any problem fails the whole Manifest) and the Host's one interpreter as pure functions. Nothing here sends
// a request; the identity data is §2.1.1's, read against the catalog's own `readIdentity` on the same responses.

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

test("RAC-1081 a well-formed oauth method passes, and the bare kind is still read from the platform's table until slice 4", () => {
  assert.ok(parsePluginManifest(manifest("slack", method())));
  assert.ok(parsePluginManifest(manifest("slack", { kind: "oauth" })));
  assert.ok(parsePluginManifest(manifest("salesforce", method({
    authorize_url: "{tenant}/services/oauth2/authorize", token_url: "{tenant}/services/oauth2/token",
    settings: [{ key: "login_origin", label: "登录地址", default: "https://login.salesforce.com", use: "tenant" }],
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant" }],
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
  refused("slack", method({ keep: [{ key: "instance", pointer: "/instance_url", check: "tenant" }] }), /check: tenant/u);
  // Where the access token may go is the table's: `{service}` for one origin, a full address only on one of them.
  refused("cloudflare", method({ identity: { url: "{service}/oauth2/userinfo", account_id: [[], ["identity:/id"]], label: ["identity:/email"] } }), /\{service\}/u);
  refused("slack", method({ identity: { url: "https://evil.example.com/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /来源/u);
  refused("adobe", method({ identity: { url: "https://ims-na1.adobelogin.com/ims/userinfo/v2", account_id: [[], ["identity:/sub"]], label: ["identity:/sub"] } }), /来源/u);
  refused("slack", method({ context: [{ key: "teams", url: "https://evil.example.com/teams", pick: { kind: "ids", pointer: "/*/id" } }] }), /来源/u);
  refused("slack", method({ identity: { url: "{tenant}/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /\{tenant\}/u);
  refused("slack", method({ identity: { url: "{gateway}/me", account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /\{gateway\}/u);
  // `{account}` arrives with the account origins table (slice 4); until then it is an unknown placeholder.
  refused("gmail", method({ identity: { url: "{account}/v1/userinfo", account_id: [["identity:/sub"]], label: ["identity:/email"] } }), /\{account\}/u);
  refused("slack", method({ identity: { url: "{service}/me", headers: { Authorization: "Bearer x" }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /Authorization/u);
  refused("slack", method({ identity: { url: "{service}/me", query: { team: "{setting.team}" }, account_id: [[], ["identity:/id"]], label: ["identity:/id"] } }), /查询参数/u);
  refused("slack", method({ identity: { url: "{service}/me", account_id: [[], ["secret:/id" as never]], label: ["identity:/id"] } }), /来源/u);
  refused("notion", method({ identity: { account_id: [["identity:/id"]], label: ["token:/workspace_name"] } }), /没写 url/u);
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
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant" }],
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
  const scope = (serviceId: string, extra: object = {}) => ({ serviceId, accessToken: "access-1", clientId: "client-1", context: {}, settings: { values: {} }, ...extra });
  const slack = oauthAccountRequest({ url: "{service}/api/auth.test" }, scope("slack"));
  assert.equal(slack.url, "https://slack.com/api/auth.test");
  assert.equal(slack.headers.authorization, "Bearer access-1");
  assert.equal(oauthAccountRequest({ url: "{service}/v2", method: "POST", body: { query: "{ me { id } }" } }, scope("monday")).headers.authorization, "access-1", "monday writes its OAuth token bare");
  assert.equal(oauthAccountRequest({ url: "https://dash.cloudflare.com/oauth2/userinfo" }, scope("cloudflare")).url, "https://dash.cloudflare.com/oauth2/userinfo");
  assert.throws(() => oauthAccountRequest({ url: "https://evil.example.com/me" }, scope("slack")), { code: "connector.oauth_declarations.target_refused" });
  assert.throws(() => oauthAccountRequest({ url: "https://openidconnect.googleapis.com/v1/userinfo" }, scope("gmail")), { code: "connector.oauth_declarations.target_refused" });
  assert.throws(() => oauthAccountRequest({ url: "{account}/v1/userinfo" }, scope("gmail")), { code: "connector.oauth_declarations.template_invalid" });
  // A context value fills one segment; one carrying a slash never moves the request to another path.
  assert.equal(oauthAccountRequest({ url: "{gateway}/ex/jira/{context.cloud_id}/rest/api/3/myself" }, scope("jira", { context: { cloud_id: "0f6a3c1e-0000-4000-8000-000000000001" } })).url,
    "https://api.atlassian.com/ex/jira/0f6a3c1e-0000-4000-8000-000000000001/rest/api/3/myself");
  assert.throws(() => oauthAccountRequest({ url: "{gateway}/ex/jira/{context.cloud_id}/myself" }, scope("jira", { context: { cloud_id: "../../admin" } })), { code: "connector.oauth_declarations.template_invalid" });
  assert.throws(() => oauthAccountRequest({ url: "{gateway}/ex/jira/{context.cloud_id}/myself" }, scope("jira")), { code: "connector.oauth_declarations.template_invalid" }, "a missing context value");
  assert.equal(oauthAccountRequest({ url: "{tenant}/services/oauth2/userinfo" }, scope("salesforce", { tenant: "https://acme.my.salesforce.com" })).url, "https://acme.my.salesforce.com/services/oauth2/userinfo");
  assert.throws(() => oauthAccountRequest({ url: "{tenant}/services/oauth2/userinfo" }, scope("salesforce", { tenant: "https://evil.example.com" })), { code: "connector.oauth_declarations.target_refused" });
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

// §2.1.1 written as data, read against the catalog's own `readIdentity` on the same responses (RAC-1080, a first set; slice 4 runs all 37).
const identities: Record<string, { identity: OAuthIdentityDeclaration; response: unknown; token?: object; context?: Record<string, string>; suffix?: string }> = {
  slack: { identity: { url: "{service}/api/auth.test", account_id: [["identity:/team_id"], ["identity:/user_id"]], label: ["identity:/user", "identity:/team"] },
    response: { ok: true, team_id: "T1", user_id: "U1", user: "ada", team: "Acme" } },
  monday: { identity: { url: "{service}/v2", method: "POST", body: { query: "{ me { id name email account { id } } }" }, headers: { "API-Version": "2024-10" },
    account_id: [["identity:/data/me/account/id"], ["identity:/data/me/id"]], label: ["identity:/data/me/name", "identity:/data/me/email"] },
  response: { data: { me: { id: 42, name: "Ada", email: "ada@example.com", account: { id: 7 } } } } },
  canva: { identity: { url: "{service}/rest/v1/users/me", account_id: [["identity:/team_user/team_id"], ["identity:/team_user/user_id"]], label: ["identity:/team_user/user_id"] },
    response: { team_user: { team_id: "TC", user_id: "UC" } } },
  intercom: { identity: { url: "{service}/me", headers: { "Intercom-Version": "2.13" }, account_id: [["identity:/app/id_code"], ["identity:/id"]], label: ["identity:/email", "identity:/name"] },
    response: { id: "99", email: "ada@example.com", app: { id_code: "app1" } } },
  linear: { identity: { url: "{service}/graphql", method: "POST", body: { query: "{ viewer { id name email } }" }, account_id: [[], ["identity:/data/viewer/id"]],
    label: ["identity:/data/viewer/name", "identity:/data/viewer/email"] }, response: { data: { viewer: { id: "lin-1", name: "Ada" } } } },
  cloudflare: { identity: { url: "https://dash.cloudflare.com/oauth2/userinfo", account_id: [[], ["identity:/id", "identity:/sub"]], label: ["identity:/email", "identity:/sub"] },
    response: { sub: "cf-sub", email: "ada@example.com" } },
  salesforce: { identity: { url: "{tenant}/services/oauth2/userinfo", account_id: [["identity:/organization_id"], ["identity:/sub", "identity:/user_id"]], label: ["identity:/preferred_username", "identity:/name"] },
    response: { organization_id: "00D1", sub: "https://login.salesforce.com/id/00D1/005A", user_id: "005A", preferred_username: "ada@acme" }, context: { instance: "https://acme.my.salesforce.com" } },
  sentry: { identity: { url: "{service}/api/0/organizations/", list: { min_by: "/id" }, account_id: [[], ["identity:/id"], ["token:/user/id"]], label: ["identity:/name", "identity:/slug"],
    keep: [{ key: "org", pointer: "/slug" }] }, response: [{ id: "9", slug: "beta", name: "Beta" }, { id: "10", slug: "alpha", name: "Alpha" }], token: { user: { id: "u-7" } }, suffix: ":u-7" },
  supabase: { identity: { url: "{service}/v1/profile", account_id: [[], ["identity:/id", "identity:/gotrue_id"], ["literal:workspaces"], ["context:authorized_workspaces"]],
    label: ["identity:/primary_email", "identity:/username", "identity:/gotrue_id"] }, response: { gotrue_id: "g-1", primary_email: "ada@example.com" },
  context: { authorized_workspaces: "o1,o2" }, suffix: ":workspaces:o1,o2" },
  x: { identity: { url: "{service}/2/users/me", account_id: [[], ["identity:/data/id"]], label: ["identity:/data/username", "identity:/data/name"], label_prefix: "@",
    keep: [{ key: "user_id", pointer: "/data/id" }] }, response: { data: { id: "x-1", username: "ada", name: "Ada" } } },
};

for (const [serviceId, fixture] of Object.entries(identities)) {
  test(`RAC-1080 ${serviceId}: the declared identity reads the same account as the catalog's readIdentity`, async () => {
    const context = fixture.context ?? {};
    const tenant = context.instance;
    const scope = { serviceId, accessToken: "access-1", clientId: "client-1", context, settings: { values: {} }, ...(tenant ? { tenant } : {}) };
    const request = oauthAccountRequest(fixture.identity as never, scope);
    let seen = "";
    const fetchImpl = async (url: string | URL | Request) => {
      seen = String(url);
      return new Response(JSON.stringify(fixture.response), { status: 200, headers: { "content-type": "application/json" } });
    };
    const before = await catalogWhoami({ connectorId: serviceId, token: "access-1", authExtras: { auth_method: "oauth", ...context }, fetchImpl: fetchImpl as typeof fetch });
    assert.ok(before.ok, JSON.stringify(before));
    assert.equal(new URL(request.url).origin + new URL(request.url).pathname, new URL(seen).origin + new URL(seen).pathname, "the same address");
    const after = oauthAccount(serviceId, fixture.identity, { identity: fixture.response, token: fixture.token ?? {}, context });
    assert.equal(after.account_id, `${before.account_id}${fixture.suffix ?? ""}`);
    assert.equal(after.label.replace(/^@/u, ""), before.login.replace(/^@/u, ""));
  });
}

test("RAC-1080 the account fails when a segment other than the prefix is empty, and the label when nothing is found", () => {
  const identity: OAuthIdentityDeclaration = { url: "{service}/me", account_id: [["identity:/team"], ["identity:/id"]], label: ["identity:/name"] };
  assert.equal(oauthAccount("slack", identity, { identity: { id: 1, name: "a" }, token: {}, context: {} }).account_id, ":1", "an empty prefix");
  assert.throws(() => oauthAccount("slack", identity, { identity: { team: "t", name: "a" }, token: {}, context: {} }), { code: "connector.oauth_declarations.account_missing" });
  assert.throws(() => oauthAccount("slack", identity, { identity: { id: 1 }, token: {}, context: {} }), { code: "connector.oauth_declarations.account_missing" });
  const notion: OAuthIdentityDeclaration = { account_id: [["token:/workspace_id"]], label: ["token:/workspace_name"] };
  assert.deepEqual(oauthAccount("notion", notion, { token: { workspace_id: "w-1", workspace_name: "Acme" }, context: {} }), { account_id: "w-1", label: "Acme", kept: {} });
});

test("RAC-1082 context picks: sorted ids of a list, and the id of the entry on the setting's own origin", () => {
  assert.equal(oauthContextValue({ kind: "ids", pointer: "/teams/*/id" }, { teams: [{ id: 3 }, { id: "1" }] }, { values: {} }), "1,3");
  assert.equal(oauthContextValue({ kind: "ids", pointer: "/*/id" }, [{ id: "b" }, { id: "a" }], { values: {} }), "a,b");
  assert.throws(() => oauthContextValue({ kind: "ids", pointer: "/teams/*/id" }, { teams: "none" }, { values: {} }), { code: "connector.oauth_declarations.context_missing" });
  const pick = { kind: "match_setting", setting: "site_url", match: "/url", take: "/id", pattern: "[0-9a-f-]{36}" } as const;
  const resources = [{ url: "https://other.atlassian.net", id: "00000000-0000-4000-8000-000000000000" }, { url: "https://acme.atlassian.net/", id: "0f6a3c1e-0000-4000-8000-000000000001" }];
  assert.equal(oauthContextValue(pick, resources, { values: { site_url: "https://acme.atlassian.net" } }), "0f6a3c1e-0000-4000-8000-000000000001");
  assert.throws(() => oauthContextValue(pick, resources, { values: { site_url: "https://missing.atlassian.net" } }), { code: "connector.oauth_declarations.context_missing" });
  assert.throws(() => oauthContextValue(pick, [{ url: "https://acme.atlassian.net", id: "../x" }], { values: { site_url: "https://acme.atlassian.net" } }), { code: "connector.oauth_declarations.context_missing" });
});
