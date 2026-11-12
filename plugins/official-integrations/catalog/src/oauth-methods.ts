import type { OAuthValueSource, PluginOAuthMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

// The OAuth flow of each catalog service, all of it data the platform's one interpreter reads (W5-11 §2.1, §2.1.1): where the person
// signs in, where the code is exchanged, what is asked for, and how the account is read. The endpoints, scopes and settings are the ones
// the Host's provider table had; the identity is §2.1.1's, so a reauthorization of a connection made by the generic flow lands on the
// same account. Where the access token may go stays the platform's request table.

type Method = PluginOAuthMethodDeclaration;
const NO_PREFIX: readonly OAuthValueSource[] = [];
const id = (...sources: OAuthValueSource[]): readonly (readonly OAuthValueSource[])[] => [NO_PREFIX, sources];

function code(authorize: string, token: string, rest: Omit<Method, "kind" | "grant" | "authorize_url" | "token_url">): Method {
  return { kind: "oauth", grant: "authorization_code", authorize_url: authorize, token_url: token, ...rest };
}

const google = (scope: string): Method => code("https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", {
  scopes: ["openid", "email", scope], pkce: "S256", parameters: { access_type: "offline", prompt: "consent" },
  identity: { url: "{account}/v1/userinfo", account_id: [["identity:/sub"]], label: ["identity:/email", "identity:/name", "identity:/sub"] },
});

const microsoft = (service: string, scopes: readonly string[], label: readonly OAuthValueSource[]): Method => code(
  "https://login.microsoftonline.com/{setting.tenant}/oauth2/v2.0/authorize", "https://login.microsoftonline.com/{setting.tenant}/oauth2/v2.0/token", {
    scopes: ["offline_access", "User.Read", ...scopes], pkce: "S256", client_secret: "optional",
    settings: [{ key: "tenant", label: { key: service + ".oauth.tenant" }, placeholder: "common", default: "common", use: "path",
      pattern: "common|organizations|consumers|[0-9a-fA-F-]{36}" }],
    identity: { url: "{service}/v1.0/me", account_id: id("identity:/id"), label },
  });

const atlassian = (service: "jira" | "confluence", scopes: readonly string[], me: string, email: OAuthValueSource): Method => code(
  "https://auth.atlassian.com/authorize", "https://auth.atlassian.com/oauth/token", {
    scopes: ["offline_access", ...scopes], token_format: "json", parameters: { audience: "api.atlassian.com", prompt: "consent" },
    settings: [{ key: "site_url", label: { key: service + ".oauth.site-url" }, placeholder: "https://your-team.atlassian.net", required: true, use: "tenant" }],
    // The site's id on the gateway, before any request can reach the site.
    context: [{ key: "cloud_id", url: "{account}/oauth/token/accessible-resources",
      pick: { kind: "match_setting", setting: "site_url", match: "/url", take: "/id", pattern: "[0-9a-fA-F-]{36}" } }],
    identity: { url: `{gateway}/ex/${service}/{context.cloud_id}${me}`, account_id: [["context:cloud_id"], ["identity:/accountId"]],
      label: ["identity:/displayName", email] },
  });

/** The services of the catalog that connect by OAuth, each with its flow. */
export const CATALOG_OAUTH_METHODS: Readonly<Record<string, Method>> = {
  "google-calendar": google("https://www.googleapis.com/auth/calendar.readonly"),
  "google-drive": google("https://www.googleapis.com/auth/drive.readonly"),
  outlook: microsoft("outlook", ["Mail.Read"], ["identity:/userPrincipalName", "identity:/mail", "identity:/displayName"]),
  onedrive: microsoft("onedrive", ["Files.Read.All"], ["identity:/userPrincipalName", "identity:/displayName"]),
  sharepoint: microsoft("sharepoint", ["Sites.Read.All"], ["identity:/userPrincipalName", "identity:/displayName"]),
  teams: microsoft("teams", ["Chat.Read", "Team.ReadBasic.All", "Channel.ReadBasic.All"], ["identity:/userPrincipalName", "identity:/displayName"]),
  dropbox: code("https://www.dropbox.com/oauth2/authorize", "https://api.dropboxapi.com/oauth2/token", {
    scopes: ["account_info.read", "files.metadata.read", "files.content.read"], pkce: "S256", client_secret: "optional",
    parameters: { token_access_type: "offline" },
    identity: { url: "{service}/2/users/get_current_account", method: "POST", body: null, account_id: id("identity:/account_id"),
      label: ["identity:/email", "identity:/name/display_name"] },
  }),
  box: code("https://account.box.com/api/oauth2/authorize", "https://api.box.com/oauth2/token", {
    scopes: [], note: { key: "box.oauth.note" },
    identity: { url: "{service}/2.0/users/me", account_id: id("identity:/id"), label: ["identity:/login", "identity:/name"] },
  }),
  notion: code("https://api.notion.com/v1/oauth/authorize", "https://api.notion.com/v1/oauth/token", {
    scopes: [], client_auth: "basic", token_format: "json", parameters: { owner: "user" },
    keep: [{ key: "workspace_id", pointer: "/workspace_id", required: true }, { key: "workspace_name", pointer: "/workspace_name" }],
    // The request only proves the token still works; the account is the workspace. The product broker passes no workspace name, so the
    // bot's own answer names it then.
    identity: { url: "{service}/v1/users/me", headers: { "Notion-Version": "2022-06-28" }, account_id: [["context:workspace_id"]],
      label: ["context:workspace_name", "identity:/bot/workspace_name"] },
  }),
  slack: code("https://slack.com/oauth/v2/authorize", "https://slack.com/api/oauth.v2.access", {
    scopes: ["channels:read,groups:read,im:read,mpim:read,users:read"], note: { key: "slack.oauth.note" },
    identity: { url: "{service}/api/auth.test", account_id: [["identity:/team_id"], ["identity:/user_id"]], label: ["identity:/user", "identity:/team"] },
  }),
  discord: code("https://discord.com/oauth2/authorize", "https://discord.com/api/oauth2/token", {
    scopes: ["identify", "guilds"], client_auth: "basic", pkce: "S256", note: { key: "discord.oauth.note" },
    identity: { url: "{service}/api/v10/users/@me", account_id: id("identity:/id"), label: ["identity:/username", "identity:/global_name"] },
  }),
  feishu: code("https://accounts.feishu.cn/open-apis/authen/v1/authorize", "https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    scopes: ["offline_access", "im:chat:readonly", "wiki:wiki:readonly", "contact:user.base:readonly", "calendar:calendar:readonly",
      "calendar:calendar.event:read", "docx:document:readonly"], token_format: "json", pkce: "S256",
    identity: { url: "{account}/open-apis/authen/v1/user_info", account_id: id("identity:/data/open_id"), label: ["identity:/data/name", "identity:/data/open_id"] },
  }),
  lark: code("https://accounts.larksuite.com/open-apis/authen/v1/authorize", "https://open.larksuite.com/open-apis/authen/v2/oauth/token", {
    scopes: ["offline_access", "im:chat:readonly", "wiki:wiki:readonly", "contact:user.base:readonly", "calendar:calendar:readonly",
      "calendar:calendar.event:read", "docx:document:readonly"], token_format: "json", pkce: "S256",
    identity: { url: "{account}/open-apis/authen/v1/user_info", account_id: id("identity:/data/open_id"), label: ["identity:/data/name", "identity:/data/open_id"] },
  }),
  zoom: code("https://zoom.us/oauth/authorize", "https://zoom.us/oauth/token", {
    scopes: [], client_auth: "basic", note: { key: "zoom.oauth.note" },
    identity: { url: "{service}/v2/users/me", account_id: id("identity:/id"), label: ["identity:/email", "identity:/display_name"] },
  }),
  gitlab: code("https://gitlab.com/oauth/authorize", "https://gitlab.com/oauth/token", {
    scopes: ["read_user", "read_api"], pkce: "S256", client_secret: "optional", quirks: { refresh_redirect_uri: true },
    identity: { url: "{service}/api/v4/user", account_id: id("identity:/id"), label: ["identity:/username", "identity:/name"] },
  }),
  bitbucket: code("https://bitbucket.org/site/oauth2/authorize", "https://bitbucket.org/site/oauth2/access_token", {
    scopes: [], client_auth: "basic", note: { key: "bitbucket.oauth.note" },
    identity: { url: "{account}/2.0/user", account_id: id("identity:/account_id", "identity:/uuid"), label: ["identity:/display_name", "identity:/username"] },
  }),
  vercel: code("https://vercel.com/integrations/{setting.integration_slug}/new", "https://api.vercel.com/v2/oauth/access_token", {
    scopes: [], note: { key: "vercel.oauth.note" },
    settings: [{ key: "integration_slug", label: "Integration slug", required: true, use: "path", pattern: "[a-z0-9][a-z0-9-]{0,100}" }],
    keep: [{ key: "team_id", pointer: "/team_id" }],
    identity: { url: "{service}/v2/user", query: { teamId: "{context.team_id}" }, account_id: [["context:team_id"], ["identity:/user/id"]],
      label: ["identity:/user/username", "identity:/user/email"] },
  }),
  cloudflare: code("https://dash.cloudflare.com/oauth2/auth", "https://dash.cloudflare.com/oauth2/token", {
    scopes: ["openid", "offline_access", "{setting.api_scopes}"], pkce: "S256", client_auth: { setting: "client_auth" },
    settings: [
      { key: "api_scopes", label: { key: "cloudflare.oauth.api-scopes" }, required: true, use: "scope", pattern: "[a-z][a-z0-9_.-]*\\.read" },
      { key: "client_auth", label: { key: "cloudflare.oauth.client-auth" }, placeholder: "basic", default: "basic", use: "client_auth", enum: ["basic", "post", "none"] },
    ],
    note: { key: "cloudflare.oauth.note" },
    identity: { url: "https://dash.cloudflare.com/oauth2/userinfo", account_id: id("identity:/id", "identity:/sub"), label: ["identity:/email", "identity:/sub"] },
  }),
  huggingface: code("https://huggingface.co/oauth/authorize", "https://huggingface.co/oauth/token", {
    scopes: ["openid", "profile", "email", "read-repos"], client_auth: "basic", pkce: "S256", client_secret: "optional",
    identity: { url: "{service}/oauth/userinfo", account_id: id("identity:/sub"), label: ["identity:/preferred_username"],
      keep: [{ key: "name", pointer: "/preferred_username" }] },
  }),
  sentry: code("https://sentry.io/oauth/authorize/", "https://sentry.io/oauth/token/", {
    scopes: ["org:read", "project:read", "event:read"], pkce: "S256",
    keep: [{ key: "oauth_user_id", pointer: "/user/id", required: true }],
    identity: { url: "{service}/api/0/organizations/", list: { min_by: "/id" }, account_id: [NO_PREFIX, ["identity:/id"], ["context:oauth_user_id"]],
      label: ["identity:/name", "identity:/slug"], keep: [{ key: "org", pointer: "/slug" }] },
  }),
  supabase: code("https://api.supabase.com/v1/oauth/authorize", "https://api.supabase.com/v1/oauth/token", {
    scopes: [], client_auth: "basic", pkce: "S256", note: { key: "supabase.oauth.note" },
    context: [{ key: "authorized_workspaces", url: "{service}/v1/organizations", pick: { kind: "ids", pointer: "/*/id" } }],
    identity: { url: "{service}/v1/profile",
      account_id: [NO_PREFIX, ["identity:/id", "identity:/gotrue_id"], ["literal:workspaces"], ["context:authorized_workspaces"]],
      label: ["identity:/primary_email", "identity:/username", "identity:/gotrue_id"] },
  }),
  linear: code("https://linear.app/oauth/authorize", "https://api.linear.app/oauth/token", {
    scopes: ["read"], pkce: "S256",
    identity: { url: "{service}/graphql", method: "POST", body: { query: "{ viewer { id name email } }" }, account_id: id("identity:/data/viewer/id"),
      label: ["identity:/data/viewer/name", "identity:/data/viewer/email"] },
  }),
  jira: atlassian("jira", ["read:jira-user", "read:jira-work"], "/rest/api/3/myself", "identity:/emailAddress"),
  confluence: atlassian("confluence", ["read:confluence-user", "read:confluence-content.all", "search:confluence"], "/wiki/rest/api/user/current", "identity:/email"),
  asana: code("https://app.asana.com/-/oauth_authorize", "https://app.asana.com/-/oauth_token", {
    scopes: ["users:read", "workspaces:read", "tasks:read"], pkce: "S256", note: { key: "asana.oauth.note" },
    identity: { url: "{service}/api/1.0/users/me", account_id: id("identity:/data/gid"), label: ["identity:/data/name", "identity:/data/email"] },
  }),
  clickup: code("https://app.clickup.com/api", "https://api.clickup.com/api/v2/oauth/token", {
    scopes: [], token_format: "json", quirks: { omit_token_params: ["grant_type", "redirect_uri"] },
    context: [{ key: "authorized_workspaces", url: "{service}/api/v2/team", pick: { kind: "ids", pointer: "/teams/*/id" } }],
    identity: { url: "{service}/api/v2/user", account_id: [NO_PREFIX, ["identity:/user/id"], ["literal:workspaces"], ["context:authorized_workspaces"]],
      label: ["identity:/user/username", "identity:/user/email"] },
  }),
  monday: code("https://auth.monday.com/oauth2/authorize", "https://auth.monday.com/oauth_ms/oauth/token", {
    scopes: ["me:read", "account:read", "boards:read", "updates:read"], token_format: "json", pkce: "S256", quirks: { expiry: "jwt_exp" },
    note: { key: "monday.oauth.note" },
    identity: { url: "{service}/v2", method: "POST", body: { query: "{ me { id name email account { id } } }" }, headers: { "API-Version": "2024-10" },
      account_id: [["identity:/data/me/account/id"], ["identity:/data/me/id"]], label: ["identity:/data/me/name", "identity:/data/me/email"] },
  }),
  airtable: code("https://airtable.com/oauth2/v1/authorize", "https://airtable.com/oauth2/v1/token", {
    scopes: ["schema.bases:read", "data.records:read", "user.email:read"], pkce: "S256", client_auth: "basic", client_secret: "optional",
    identity: { url: "{service}/v0/meta/whoami", account_id: id("identity:/id"), label: ["identity:/email", "identity:/id"] },
  }),
  figma: code("https://www.figma.com/oauth", "https://api.figma.com/v1/oauth/token", {
    refresh_url: "https://api.figma.com/v1/oauth/refresh",
    scopes: ["current_user:read", "file_content:read", "file_metadata:read", "file_comments:read"], client_auth: "basic", pkce: "S256",
    identity: { url: "{service}/v1/me", account_id: id("identity:/id"), label: ["identity:/handle", "identity:/email"] },
  }),
  canva: code("https://www.canva.com/api/oauth/authorize", "https://api.canva.com/rest/v1/oauth/token", {
    scopes: ["profile:read", "design:meta:read"], client_auth: "basic", pkce: "S256",
    identity: { url: "{service}/rest/v1/users/me", account_id: [["identity:/team_user/team_id"], ["identity:/team_user/user_id"]],
      label: ["identity:/team_user/user_id", "identity:/user/display_name", "identity:/profile/display_name"] },
  }),
  adobe: code("https://ims-na1.adobelogin.com/ims/authorize/v2", "https://ims-na1.adobelogin.com/ims/token/v3", {
    scopes: ["openid,profile,email,offline_access"], note: { key: "adobe.oauth.note" },
    identity: { url: "{account}/ims/userinfo/v2", query: { client_id: "{client_id}" }, headers: { "X-Api-Key": "{client_id}" },
      account_id: id("identity:/sub"), label: ["identity:/email", "identity:/name", "identity:/sub"] },
  }),
  salesforce: code("{tenant}/services/oauth2/authorize", "{tenant}/services/oauth2/token", {
    scopes: ["openid", "api", "refresh_token"], pkce: "S256",
    settings: [{ key: "login_origin", label: { key: "salesforce.oauth.login-origin" }, placeholder: "https://login.salesforce.com", default: "https://login.salesforce.com", use: "tenant" }],
    keep: [{ key: "instance", pointer: "/instance_url", check: "tenant", required: true }],
    identity: { url: "{tenant}/services/oauth2/userinfo", account_id: [["identity:/organization_id"], ["identity:/sub", "identity:/user_id"]],
      label: ["identity:/preferred_username", "identity:/name"] },
  }),
  hubspot: code("https://app.hubspot.com/oauth/authorize", "https://api.hubapi.com/oauth/2026-03/token", {
    scopes: ["oauth", "crm.objects.contacts.read"],
    identity: { url: "{service}/integrations/v1/me", account_id: id("identity:/portalId"), label: ["identity:/hub_domain", "identity:/hub_id", "identity:/portalId"] },
  }),
  intercom: code("https://app.intercom.com/oauth", "https://api.intercom.io/auth/eagle/token", {
    scopes: [], note: { key: "intercom.oauth.note" },
    identity: { url: "{service}/me", headers: { "Intercom-Version": "2.13" }, account_id: [["identity:/app/id_code"], ["identity:/id"]],
      label: ["identity:/email", "identity:/name"] },
  }),
  stripe: code("https://connect.stripe.com/oauth/authorize", "https://connect.stripe.com/oauth/token", {
    scopes: ["{setting.stripe_scope}"],
    settings: [{ key: "stripe_scope", label: { key: "stripe.oauth.stripe-scope" }, placeholder: "read_only", default: "read_only",
      use: "scope", enum: ["read_only", "read_write"] }],
    note: { key: "stripe.oauth.note" },
    identity: { url: "{service}/v1/account", account_id: id("identity:/id"), label: ["identity:/display_name", "identity:/email", "identity:/id"] },
  }),
  x: code("https://x.com/i/oauth2/authorize", "https://api.x.com/2/oauth2/token", {
    scopes: ["tweet.read", "users.read", "offline.access"], client_auth: "basic", pkce: "S256", client_secret: "optional",
    identity: { url: "{service}/2/users/me", account_id: id("identity:/data/id"), label: ["identity:/data/username", "identity:/data/name"], label_prefix: "@",
      keep: [{ key: "user_id", pointer: "/data/id" }] },
  }),
  linkedin: code("https://www.linkedin.com/oauth/v2/authorization", "https://www.linkedin.com/oauth/v2/accessToken", {
    scopes: ["openid", "profile", "email"], note: { key: "linkedin.oauth.note" },
    identity: { url: "{service}/v2/userinfo", account_id: id("identity:/sub"), label: ["identity:/name", "identity:/email", "identity:/sub"] },
  }),
};

/** The service's OAuth method, when it connects by OAuth. */
export function catalogOAuthMethod(connectorId: string): Method | undefined {
  return Object.hasOwn(CATALOG_OAUTH_METHODS, connectorId) ? CATALOG_OAUTH_METHODS[connectorId] : undefined;
}
