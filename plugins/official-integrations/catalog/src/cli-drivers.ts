/**
 * The catalog's official CLI drivers (D3 A, M11, specs/plugin-specials-demotion): for each service that signs in through its own
 * official command-line client, the fixed commands (sign in, set up, read who is signed in, one real read), where the client comes
 * from, and how its account is read from what the client prints. The Host runs only these fixed commands and names no service: it
 * asks the drivers the built-in integrations register.
 */

import type { CliApiBridge, CliDistribution, CliDriver, CliEnvironmentField, CliNativeDistribution, CliNativeSource, CliReleasePort } from "@molis-ai/molis-work-contracts/platform/integration-drivers";

export type { CliApiBridge, CliDistribution, CliDriver, CliEnvironmentField, CliNativeDistribution, CliNativeSource, CliReleasePort };

/** Where the drivers' release resolvers may download from. */
export const CLI_RELEASE_HOSTS: readonly string[] = ["github.com", "api.github.com", "raw.githubusercontent.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "gitlab.com", "acli.atlassian.com"];
/** Where the release files themselves are: a client is installed from nowhere else. */
export const CLI_RELEASE_FILE_HOSTS: readonly string[] = ["github.com", "gitlab.com", "acli.atlassian.com"];

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function releaseJson(port: CliReleasePort, url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const text = new TextDecoder().decode(await port.bytes(url, 4 * 1024 * 1024, signal));
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw port.failed("官方发布元数据读不出来，请检查网络后重试"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw port.failed("官方发布元数据格式无效");
  return value as Record<string, unknown>;
}

/** An official GitHub release: the asset named for this machine, checked by the digest GitHub publishes for it. */
export function githubReleaseDistribution(repository: string, bin: string, filename: (version: string, platform: string, arch: string) => string,
  entry: (version: string, platform: string, arch: string) => string): CliNativeDistribution {
  return { kind: "native", resolve: async (version, port, signal) => {
    const { platform, arch } = port.target(), name = filename(version, platform, arch);
    const value = await releaseJson(port, `https://api.github.com/repos/${repository}/releases/tags/v${version}`, signal);
    if (typeof value.tag_name !== "string" || !Array.isArray(value.assets)) throw port.failed("GitHub 官方发布元数据格式无效");
    const assets = (value.assets as unknown[]).map(item => {
      const one = record(item);
      if (typeof one.name !== "string" || typeof one.browser_download_url !== "string" || one.digest != null && typeof one.digest !== "string") throw port.failed("GitHub 官方文件元数据格式无效");
      return { name: one.name, url: one.browser_download_url, digest: typeof one.digest === "string" ? one.digest : undefined };
    });
    const asset = value.tag_name === `v${version}` ? assets.find(item => item.name === name) : undefined;
    if (!asset || !asset.url.startsWith(`https://github.com/${repository}/releases/download/v${version}/`) || !/^sha256:[0-9a-f]{64}$/u.test(asset.digest ?? "")) throw port.failed("官方发布中没有所选版本、平台或文件校验和");
    return { kind: "native", package: repository, version, bin, url: asset.url, sha256: asset.digest!.slice(7), entry: entry(version, platform, arch) };
  } };
}

const gitlabDistribution: CliNativeDistribution = { kind: "native", resolve: async (version, port, signal) => {
  const { platform, arch } = port.target(), name = `glab_${version}_${platform}_${arch === "x64" ? "amd64" : arch}.tar.gz`;
  const base = "https://gitlab.com/api/v4/projects/gitlab-org%2Fcli";
  const release = await releaseJson(port, `${base}/releases/v${version}`, signal);
  const links = record(release.assets).links;
  if (!Array.isArray(links)) throw port.failed("GitLab 官方发布元数据格式无效");
  const entries = (links as unknown[]).map(item => {
    const one = record(item);
    if (typeof one.name !== "string" || typeof one.url !== "string") throw port.failed("GitLab 官方文件元数据格式无效");
    return { name: one.name, url: one.url };
  });
  const asset = entries.find(item => item.name === name), sums = entries.find(item => item.name === "checksums.txt");
  if (release.tag_name !== `v${version}` || !asset?.url.startsWith(`${base}/packages/generic/glab/`) || !sums?.url.startsWith(`${base}/packages/generic/glab/`)) throw port.failed("GitLab 官方发布中没有所选客户端与校验和");
  const lines = new TextDecoder().decode(await port.bytes(sums.url, 1024 * 1024, signal));
  const sha256 = lines.split("\n").map(line => line.trim().split(/\s+/u)).find(row => row[1] === name)?.[0];
  if (!sha256 || !/^[0-9a-f]{64}$/u.test(sha256)) throw port.failed("GitLab 官方文件校验和无效");
  return { kind: "native", package: "gitlab-org/cli", version, bin: "glab", url: asset.url, sha256, entry: "bin/glab" };
} };

const atlassianDistribution: CliNativeDistribution = { kind: "native", resolve: async (version, port, signal) => {
  const { platform, arch } = port.target();
  const formula = new TextDecoder().decode(await port.bytes("https://raw.githubusercontent.com/atlassian/homebrew-acli/main/Formula/acli.rb", 64 * 1024, signal));
  if (!formula.includes(`version "${version}"`)) throw port.failed("Atlassian 官方安装源已切换版本，请按当前发布重新准备");
  const url = `https://acli.atlassian.com/${platform}/${version}/acli_${version}_${platform}_${arch === "x64" ? "amd64" : arch}.tar.gz`;
  const match = [...formula.matchAll(/url "([^"]+)"[^\n]*\n\s*sha256 "([0-9a-f]{64})"/gu)].find(row => row[1] === url);
  if (!match) throw port.failed("Atlassian 官方安装源没有此平台的文件或校验和");
  return { kind: "native", package: "atlassian/acli", version, bin: "acli", url, sha256: match[2]!, entry: `acli_${version}_${platform}_${arch === "x64" ? "amd64" : arch}/acli` };
} };

const pwsh = githubReleaseDistribution("PowerShell/PowerShell", "pwsh", (v, p, a) => `powershell-${v}-${p === "darwin" ? "osx" : p}-${a}.tar.gz`, () => "pwsh");
const graph = (scope: string, resource: string): CliDriver => ({ binary: "pwsh", distribution: { kind: "powershell", module: "Microsoft.Graph.Authentication", runtime: pwsh },
  version: ["-NoProfile", "-NonInteractive", "-Command", "Import-Module Microsoft.Graph.Authentication -ErrorAction Stop; (Get-Module Microsoft.Graph.Authentication).Version.ToString()"], install: "https://learn.microsoft.com/powershell/microsoftgraph/installation",
  login: ["-NoProfile", "-Command", `Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -Scopes 'User.Read','${scope}' -UseDeviceCode -ContextScope CurrentUser -NoWelcome`],
  identity: ["-NoProfile", "-Command", "Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -ContextScope CurrentUser -NoWelcome; Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/me' | ConvertTo-Json -Depth 8"],
  read: ["-NoProfile", "-Command", `Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -ContextScope CurrentUser -NoWelcome; Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/${resource}' | ConvertTo-Json -Depth 12`],
  note: "workbench.connector-cli.powershell" });

const FEISHU_REFUSED = { status: 401, body: { code: 99991668, msg: "飞书 CLI 授权或权限不足，请检查连接" } };
const FEISHU_API: CliApiBridge = {
  origin: "https://open.feishu.cn",
  paths: [
    /^\/open-apis\/authen\/v1\/user_info$/u,
    /^\/open-apis\/im\/v1\/chats$/u,
    /^\/open-apis\/wiki\/v2\/spaces\/get_node$/u,
    /^\/open-apis\/docx\/v1\/documents\/[A-Za-z0-9_-]{10,128}$/u,
    /^\/open-apis\/docx\/v1\/documents\/[A-Za-z0-9_-]{10,128}\/raw_content$/u,
  ],
  args(url) {
    const args = ["api", "GET", url.pathname, "--as", "user", "--format", "json"];
    if (url.search) args.push("--params", JSON.stringify(Object.fromEntries(url.searchParams)));
    return args;
  },
  response(output) {
    const result = record(output);
    if (result.ok !== true) return FEISHU_REFUSED;
    const data = record(result.data);
    if (typeof data.code === "number" && data.code !== 0) return FEISHU_REFUSED;
    return { status: 200, body: data.code === 0 ? data : { code: 0, data } };
  },
};

const larkSuite = (brand: "feishu" | "lark"): CliDriver => ({ ...(brand === "feishu" ? { api: FEISHU_API } : {}), setup: ["config", "init", "--brand", brand],
  distribution: githubReleaseDistribution("larksuite/cli", "lark-cli", (v, p, a) => `lark-cli-${v}-${p}-${a === "x64" ? "amd64" : a}.tar.gz`, () => "lark-cli"), binary: "lark-cli",
  login: ["auth", "login", "--scope", "contact:user.base:readonly calendar:calendar:readonly calendar:calendar.event:read docx:document:readonly wiki:wiki:readonly im:chat:readonly offline_access"],
  identity: ["auth", "status", "--json", "--verify"], read: ["calendar", "+agenda", "--as", "user"], install: "https://github.com/larksuite/cli", note: `workbench.connector-cli.${brand}`, verify_read: true,
  account(value, refuse) {
    const obj = record(value), user = record(record(obj.identities).user);
    if (obj.brand !== brand || user.available !== true || user.verified !== true || !user.openId || !obj.appId) refuse("CLI 当前应用地区或用户身份不匹配；请配置对应地区应用并完成用户授权");
    return { label: user.userName || user.openId, stable: [obj.brand, obj.appId, user.openId] };
  } });

const appCredentials: readonly CliEnvironmentField[] = [{ name: "CLIENT_ID", label: "workbench.connector-cli.app-client-id", secret: false }, { name: "CLIENT_SECRET", label: "workbench.connector-cli.app-client-secret", secret: true }];
const SENTRY = "https://sentry.io";

export const CATALOG_CLI_DRIVERS: Readonly<Record<string, CliDriver>> = Object.freeze({
  github: { distribution: githubReleaseDistribution("cli/cli", "gh", (v, p, a) => `gh_${v}_${p === "darwin" ? "macOS" : p}_${a === "x64" ? "amd64" : a}.${p === "darwin" ? "zip" : "tar.gz"}`, (v, p, a) => `gh_${v}_${p === "darwin" ? "macOS" : p}_${a === "x64" ? "amd64" : a}/bin/gh`), binary: "gh", login: ["auth", "login", "--web", "--hostname", "github.com", "--git-protocol", "https", "--skip-ssh-key", "--scopes", "notifications,read:user"], identity: ["api", "user"], read: ["api", "notifications"], install: "https://cli.github.com/" },
  gitlab: { distribution: gitlabDistribution, binary: "glab", login: ["auth", "login", "--hostname", "gitlab.com", "--web"], identity: ["api", "user"], read: ["api", "events?per_page=20"], install: "https://docs.gitlab.com/cli/" },
  notion: { distribution: { kind: "npm", package: "ntn", entrypoint: `dist/ntn-${process.platform}-${process.arch}/ntn` }, binary: "ntn", login: ["login"], identity: ["api", "v1/users/me", "-X", "GET"], read: ["api", "v1/users", "-X", "GET"], install: "https://developers.notion.com/cli/get-started/overview",
    account(value) {
      const data = record(record(value).data ?? value), bot = record(data.bot);
      return { label: bot.workspace_name || data.name || data.id, stable: data.id ? [bot.workspace_id || "", data.id] : undefined };
    } },
  box: { login_environment: appCredentials, distribution: { kind: "npm", package: "@box/cli" }, binary: "box", login: ["login", "--default-box-app"], identity: ["users:get", "me", "--json"], read: ["folders:items", "0", "--json"], install: "https://developer.box.com/guides/cli/" },
  outlook: graph("Mail.Read", "me/messages?$top=20"), onedrive: graph("Files.Read.All", "me/drive/root/children?$top=20"), sharepoint: graph("Sites.Read.All", "sites?search=*"), teams: graph("Chat.Read", "me/chats?$top=20"),
  feishu: larkSuite("feishu"),
  lark: larkSuite("lark"),
  vercel: { distribution: { kind: "npm", package: "vercel" }, binary: "vercel", login: ["login"], identity: ["whoami"], read: ["project", "ls", "--format=json"], install: "https://vercel.com/docs/cli" },
  cloudflare: { distribution: { kind: "npm", package: "wrangler" }, binary: "wrangler", login: ["login", "--scopes", "account:read", "user:read", "zone:read"], identity: ["whoami", "--json"], install: "https://developers.cloudflare.com/workers/wrangler/install-and-update/",
    account(value, refuse) {
      const obj = record(value);
      if (obj.loggedIn !== true) refuse("请先登录 Wrangler");
      const accounts = Array.isArray(obj.accounts) ? obj.accounts.map(record) : [];
      return { label: obj.email || accounts[0]?.name, stable: typeof obj.email === "string" ? obj.email.toLowerCase() : (obj.authType === "Account API Token" && accounts.length === 1 ? accounts[0]?.id : undefined) };
    } },
  huggingface: { managed_environment: { HF_HUB_DISABLE_UPDATE_CHECK: "1" }, version: ["version"], distribution: { kind: "python", package: "huggingface_hub" }, binary: "hf", login: ["auth", "login"], identity: ["auth", "whoami"], install: "https://huggingface.co/docs/huggingface_hub/guides/cli" },
  sentry: { distribution: { kind: "npm", package: "sentry" }, binary: "sentry", login: ["auth", "login", "--read-only", "--url", SENTRY], identity: ["auth", "whoami", "--json", "--fresh"], install: "https://cli.sentry.dev/", note: "workbench.connector-cli.sentry",
    environment: { SENTRY_HOST: SENTRY, SENTRY_URL: SENTRY },
    async complete(obj, run, refuse) {
      if (obj.type !== "org-auth-token") return;
      const organizations = await run(["org", "list", "--json", "--fresh"]);
      const found = Array.isArray(organizations) ? organizations.map(record).find(row => row.slug === obj.organization) : undefined;
      if (!found?.id) refuse("Sentry 未确认组织权限，请检查凭据");
      obj.organization_id = found!.id;
    },
    account(value) {
      const obj = record(value);
      return obj.type === "org-auth-token" ? { label: obj.organization, stable: obj.organization_id ? [SENTRY, obj.organization_id] : undefined }
        : { label: obj.email || obj.username || obj.name, stable: obj.id ? [SENTRY, obj.id] : undefined };
    } },
  supabase: { distribution: { kind: "npm", package: "supabase" }, binary: "supabase", login: ["login"], identity: ["whoami", "--output-format", "json"], read: ["projects", "list", "--output", "json"], install: "https://supabase.com/docs/guides/local-development/cli/getting-started", note: "workbench.connector-cli.supabase" },
  salesforce: { managed_environment: { SF_AUTOUPDATE_DISABLE: "true" }, distribution: { kind: "npm", package: "@salesforce/cli" }, binary: "sf", login: ["org", "login", "web", "--set-default"], identity: ["api", "request", "rest", "/services/oauth2/userinfo", "--method", "GET", "--json"], read: ["data", "query", "--query", "SELECT Id,Subject,LastModifiedDate FROM Task ORDER BY LastModifiedDate DESC LIMIT 20", "--json"], install: "https://developer.salesforce.com/tools/salesforcecli",
    account(value) {
      const result = record(record(record(value).result).body);
      return { label: result.preferred_username || result.email || result.user_id, stable: result.user_id && result.organization_id ? [result.organization_id, result.user_id] : undefined };
    } },
  stripe: { distribution: githubReleaseDistribution("stripe/stripe-cli", "stripe", (v, p, a) => `stripe_${v}_${p === "darwin" ? "mac-os" : p}_${a === "x64" ? "x86_64" : a}.tar.gz`, () => "stripe"), binary: "stripe", login: ["login"], identity: ["get", "/v1/account"], read: ["get", "/v1/events", "-d", "limit=20"], install: "https://docs.stripe.com/stripe-cli", note: "workbench.connector-cli.stripe" },
  jira: { distribution: atlassianDistribution, binary: "acli", login: ["jira", "auth", "login", "--web"], identity: ["jira", "auth", "status"], read: ["jira", "workitem", "search", "--jql", "assignee=currentUser() ORDER BY updated DESC", "--limit", "20", "--json"], install: "https://developer.atlassian.com/cloud/acli/guides/introduction/", verify_read: true,
    account(value) {
      const text = typeof value === "string" ? value : "";
      const site = /^\s*Site:\s*(\S+)\s*$/mu.exec(text)?.[1], email = /^\s*Email:\s*(\S+)\s*$/mu.exec(text)?.[1];
      return { label: email, stable: site && email ? [new URL(site.startsWith("https:") ? site : `https://${site}`).origin, email.toLowerCase()] : undefined };
    } },
  hubspot: { managed_environment: { HUBSPOT_NO_AUTO_UPGRADE: "1" }, binary: "hubspot", login: ["auth", "login"], identity: ["whoami"], read: ["objects", "list", "--type", "contacts", "--format", "json"], install: "https://developers.hubspot.com/docs/developer-tooling/local-development/agent-cli/guide", note: "workbench.connector-cli.hubspot",
    account(value) {
      const text = typeof value === "string" ? value : "";
      const user = /^\s*User:\s*(.+)$/mu.exec(text)?.[1]?.trim(), portal = /^\s*Portal:\s*(\d+)\s*$/mu.exec(text)?.[1];
      return { label: user === "(HUBSPOT_ACCESS_TOKEN)" ? `HubSpot · ${portal}` : user, stable: portal && user ? [portal, user === "(HUBSPOT_ACCESS_TOKEN)" ? "service-key" : user.toLowerCase()] : undefined };
    } },
  x: { login_environment: appCredentials, distribution: githubReleaseDistribution("xdevplatform/xurl", "xurl", (_, p, a) => `xurl_${p === "darwin" ? "Darwin" : "Linux"}_${a === "x64" ? "x86_64" : a}.tar.gz`, () => "xurl"), binary: "xurl", login: ["auth", "oauth2"], identity: ["--auth", "oauth2", "/2/users/me"], read: ["--auth", "oauth2", "/2/users/me"], install: "https://github.com/xdevplatform/xurl", note: "workbench.connector-cli.x" },
} satisfies Record<string, CliDriver>);
